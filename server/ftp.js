/*
 * ftp.js - the FTP gateway: the only code that talks to FTP servers.
 *
 *   createGateway(options)
 *     list(sc, path, res)               -> [{ name, isDir, isLink, size, date, modified }]
 *     stream(sc, path, req, res, opts)  pipe one file into the HTTP response
 *     fetch(sc, path, { maxBytes })     -> Buffer: one whole file (video conversion)
 *     forget(id)                        lift the login-failure pause of a shortcut
 *   parseRemotePath(path)               "/a/b" -> ["a", "b"]; HttpError 400 if unsafe
 *   parseRange(header, size)            null | "unsatisfiable" | { start, end }
 *   fileHeaders(name, type, size, range, length)   headers of a served file
 *   toHttpError(err)                    FTP/network error -> readable HttpError
 *   modifiedTime(info, now)             a listing's date as ISO 8601 text, or null
 *
 * Paths behave like the legacy HTA's curl calls: "/"-rooted in the UI but
 * relative to the FTP login directory. The gateway walks them with one CWD
 * per segment (curl's default "multicwd"), then sends a bare LIST, or
 * SIZE / RETR with the file's basename.
 *
 * Every request opens its own FTP connection and always closes it, also as
 * soon as the browser goes away (a video seek, a closed tab), so abandoned
 * requests never keep connections open on the server.
 */

import { Writable } from "node:stream";
import { Client, FTPError, enterPassiveModeIPv6 } from "basic-ftp";
// Not exported from the package root. basic-ftp has no "exports" map, the
// dependency is pinned to patch releases, and tests/ftp.test.js covers it.
import { parsePasvResponse, connectForPassiveTransfer } from "basic-ftp/dist/transfer.js";
import { HttpError } from "./http.js";
import { inlineType } from "../public/js/filetypes.js";
import { msg } from "../public/js/i18n.js";

const DEFAULTS = {
  timeoutMs: 15_000,          // the FTP server may stay silent this long
  maxConnections: 10,         // per FTP host:port, across all users
  allowedHosts: [],           // FTP_ALLOWED_HOSTS, re-checked at connect time
  queueWaitMs: 20_000,        // wait for a free connection slot this long
  listDeadlineMs: 60_000,     // one whole listing (curl had --max-time 60)
  fetchDeadlineMs: 120_000,   // one whole file fetched into memory
  stallMs: 60_000,            // close a download that makes no progress this long
  loginPauseMs: 5 * 60_000,   // after a failed login, don't retry the shortcut this long
  maxListingBytes: 8 * 1024 * 1024,
};

// Served file responses can never run anything in the app's origin.
const FILE_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; " +
  "frame-ancestors 'none'; sandbox";

function once(fn) {
  let called = false;
  return () => {
    if (!called) {
      called = true;
      fn();
    }
  };
}

/* ---- paths and ranges ---- */

export function parseRemotePath(raw) {
  const p = String(raw ?? "");
  // Control characters could inject FTP commands; a backslash is a separator
  // on Windows FTP servers and would hide ".." segments.
  if (!p.startsWith("/") || p.length > 1024 || /[\x00-\x1f\x7f\\]/.test(p)) {
    throw new HttpError(400, msg("err.badPath"));
  }
  const segments = p.split("/").filter(Boolean);
  if (segments.some((s) => s === "." || s === "..")) throw new HttpError(400, msg("err.badPath"));
  return segments;
}

// One byte range (RFC 9110): "a-b", "a-" or "-n". Anything malformed or
// multi-range is ignored, which means "send the whole file".
export function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header ?? "").trim());
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start, end;
  if (m[1] === "") {
    const suffix = Number(m[2]);
    if (suffix === 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(m[1]);
    if (m[2] !== "" && Number(m[2]) < start) return null;   // invalid: ignore the header
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start >= size ? "unsatisfiable" : { start, end };
}

/* ---- passive mode ---- */

// PASV, but the data connection goes to the host the control connection
// already uses, whatever address the reply names (curl's default,
// --ftp-skip-pasv-ip). Servers behind NAT announce their private address
// there; basic-ftp 6 rejects such replies, and its allowSeparateTransferHost
// escape hatch would accept *any* host (FTP bounce). This one can only ever
// reach the server we logged in to.
async function enterPassiveModeSameHost(ftp) {
  const res = await ftp.request("PASV");
  const { port } = parsePasvResponse(res.message);
  const host = ftp.socket.remoteAddress;
  if (!host) throw new Error("Control connection closed");
  await connectForPassiveTransfer(host.replace(/^::ffff:/i, ""), port, ftp);
  return res;
}

const PASSIVE_MODES = [enterPassiveModeIPv6, enterPassiveModeSameHost];   // EPSV, then PASV

// Try the mode that last worked with this server first, so a NAT that breaks
// EPSV costs one timeout per server, not one per request.
function passiveMode(preferred, key) {
  return async function prepareTransfer(ftp) {
    const known = preferred.get(key);
    const modes = known ? [known, ...PASSIVE_MODES.filter((m) => m !== known)] : PASSIVE_MODES;
    let lastError;
    for (const mode of modes) {
      try {
        const res = await mode(ftp);
        preferred.set(key, mode);
        return res;
      } catch (err) {
        if (ftp.closed) throw err;   // the control connection is gone: stop here
        lastError = err;
      }
    }
    throw new Error(`No passive transfer mode works with this server (${lastError?.message})`);
  };
}

/* ---- connection slots ---- */

// Every user's FTP connection now leaves from one IP address (the VPS), and
// FTP servers commonly cap connections per IP: queue rather than exceed it.
function createSlots(max, waitMs) {
  const hosts = new Map();   // key -> { active, waiting: [grant] }

  function release(key) {
    const h = hosts.get(key);
    const next = h.waiting.shift();
    if (next) next();                         // hand the slot straight over
    else if (--h.active === 0) hosts.delete(key);
  }

  return function acquire(key) {
    let h = hosts.get(key);
    if (!h) hosts.set(key, (h = { active: 0, waiting: [] }));
    const releaser = () => once(() => release(key));
    if (h.active < max) {
      h.active++;
      return Promise.resolve(releaser());
    }
    return new Promise((resolve, reject) => {
      const grant = () => {
        clearTimeout(timer);
        resolve(releaser());
      };
      const timer = setTimeout(() => {
        h.waiting.splice(h.waiting.indexOf(grant), 1);
        reject(new HttpError(503, msg("err.ftpBusy"),
          { "Retry-After": "5" }));
      }, waitMs);
      h.waiting.push(grant);
    });
  };
}

/* ---- errors ---- */

const UNREACHABLE = new Set(["ECONNREFUSED", "ENOTFOUND", "EHOSTUNREACH", "ENETUNREACH", "EAI_AGAIN", "ETIMEDOUT"]);

// Messages say what went wrong but never where the server is: regular users
// are not told the FTP server's address.
export function toHttpError(err) {
  if (err instanceof HttpError) return err;
  const reply = String(err?.message ?? "").trim();
  if (err instanceof FTPError) {
    if (err.code === 530) return new HttpError(502, msg("err.ftpLogin", { reply }));
    if (err.code === 550) return new HttpError(404, msg("err.ftpNotFound", { reply }));
    if (err.code === 421) {
      return new HttpError(503, msg("err.ftpRefused", { reply }), { "Retry-After": "30" });
    }
    return new HttpError(502, msg("err.ftpAnswered", { reply }));
  }
  if (UNREACHABLE.has(err?.code)) return new HttpError(504, msg("err.ftpUnreachable", { code: err.code }));
  if (/timeout/i.test(reply)) return new HttpError(504, msg("err.ftpSilent"));
  return new HttpError(502, msg("err.ftpFailed", { reason: reply || err?.code || msg("err.ftpUnknown") }));
}

/* ---- listing times ---- */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n) => String(n).padStart(2, "0");

// "2026-10-30T08:30", or "2026-10-30" without a time; null if no such moment.
function wallClock(year, month, day, hour, minute) {
  const d = new Date(Date.UTC(year, month - 1, day, hour ?? 0, minute ?? 0));
  if (d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day || hour > 23 || minute > 59) return null;
  const date = `${year}-${pad(month)}-${pad(day)}`;
  return hour === undefined ? date : `${date}T${pad(hour)}:${pad(minute)}`;
}

// When an entry was last modified, as ISO 8601 text that sorts as it reads,
// or null when the listing doesn't say in a form we know. MLSD times are
// exact and in UTC ("2026-10-30T07:30:00Z"): the browser shows them in its
// own time zone. LIST prints the FTP server's clock without naming its time
// zone, so those carry none ("2026-10-30T08:30") and are shown as printed;
// `ls` gives only the day for files older than six months ("2026-04-01").
// `now` settles the year `ls` leaves out for recent files.
export function modifiedTime(info, now = new Date()) {
  const at = info.modifiedAt;
  if (at instanceof Date && Number.isFinite(at.getTime())) return at.toISOString().replace(".000Z", "Z");
  const raw = String(info.rawModifiedAt ?? "").trim();
  // Unix: "Oct 30 08:30", "Apr 01 2026", or the day first ("30 Oct 08:30").
  let m = /^(?:([a-z]{3})\s+(\d{1,2})|(\d{1,2})\s+([a-z]{3}))\s+(?:(\d{4})|(\d{1,2}):(\d{2}))$/i.exec(raw);
  if (m) {
    const month = MONTHS.indexOf((m[1] ?? m[4]).toLowerCase()) + 1;
    const day = Number(m[2] ?? m[3]);
    if (!month) return null;
    if (m[5]) return wallClock(Number(m[5]), month, day);
    const [hour, minute] = [Number(m[6]), Number(m[7])];
    // This year, unless that is still to come (a day's grace for time zones).
    let year = now.getFullYear();
    const today = Date.UTC(year, now.getMonth(), now.getDate(), now.getHours(), now.getMinutes());
    if (Date.UTC(year, month - 1, day, hour, minute) > today + 86_400_000) year--;
    return wallClock(year, month, day, hour, minute);
  }
  // Unix, long ISO style: "2026-10-30 08:30".
  m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})$/.exec(raw);
  if (m) return wallClock(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));
  // DOS / IIS: "10-30-26 08:30AM", "10-30-2026 20:30".
  m = /^(\d{2})-(\d{2})-(\d{2}|\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(raw);
  if (m) {
    let year = Number(m[3]);
    if (m[3].length === 2) year += year < 70 ? 2000 : 1900;
    let hour = Number(m[4]);
    if (m[6]) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (m[6].toUpperCase() === "PM" ? 12 : 0);
    }
    return wallClock(year, Number(m[1]), Number(m[2]), hour, Number(m[5]));
  }
  return null;
}

/* ---- responses ---- */

function toEntry(info) {
  return {
    name: info.name,
    isDir: info.isDirectory,
    isLink: info.isSymbolicLink,
    size: info.size,
    date: info.rawModifiedAt,        // as the listing printed it
    modified: modifiedTime(info),    // the same, readable by the browser (or null)
  };
}

// ASCII fallback for old clients, exact UTF-8 name for everyone else (RFC 6266).
function contentDisposition(disposition, name) {
  const ascii = name.replace(/[^\x20-\x7e]|["\\%]/g, "_");
  const utf8 = encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

export function fileHeaders(name, type, size, range, length) {
  const headers = {
    "Content-Type": type || "application/octet-stream",
    "Content-Disposition": contentDisposition(type ? "inline" : "attachment", name),
    "Cache-Control": "private, no-store",
    "Accept-Ranges": size === null ? "none" : "bytes",
    // Chrome's PDF viewer refuses to render under a sandbox CSP, and a PDF
    // runs no script in the page anyway.
    "Content-Security-Policy": type === "application/pdf" ? "frame-ancestors 'none'" : FILE_CSP,
  };
  if (length !== null) headers["Content-Length"] = length;
  if (range) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`;
  return headers;
}

// SIZE is optional in FTP; without it the file goes out whole and unranged.
async function fileSize(client, name) {
  try {
    return await client.size(name);
  } catch (err) {
    if (err instanceof FTPError && err.code !== 550) return null;    // e.g. 500/502: not supported
    if (!(err instanceof FTPError) && /Can't parse/.test(err.message)) return null;
    throw err;   // 550: no such file; anything else: the connection is in trouble
  }
}

/* ---- gateway ---- */

export function createGateway(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const acquire = createSlots(o.maxConnections, o.queueWaitMs);
  const preferredMode = new Map();   // "host:port" -> passive mode that worked
  const loginPaused = new Map();     // shortcut id -> { until, error }

  // A logged-in connection. `close()` ends it and frees its slot; calling it
  // more than once is fine.
  async function connect(sc) {
    const host = sc.host.toLowerCase();
    if (o.allowedHosts.length && !o.allowedHosts.includes(host)) {
      throw new HttpError(403, msg("err.hostNotAllowed"));
    }
    const paused = loginPaused.get(sc.id);
    if (paused && paused.until > Date.now()) throw paused.error;
    loginPaused.delete(sc.id);

    const key = `${host}:${sc.port}`;
    const release = await acquire(key);
    const client = new Client(o.timeoutMs, { maxListingBytes: o.maxListingBytes });
    client.prepareTransfer = passiveMode(preferredMode, key);
    const close = once(() => {
      const socket = client.ftp.socket;
      client.close();
      // The server counts this connection until the TCP close completes:
      // handing the slot over earlier could exceed its per-IP limit (421).
      if (socket.destroyed) return release();
      socket.once("close", release);
      setTimeout(release, 2000).unref();
    });
    try {
      await client.access({ host: sc.host, port: sc.port, user: sc.username, password: sc.password });
    } catch (err) {
      close();
      const httpError = toHttpError(err);
      if (err instanceof FTPError && err.code === 530) {
        // Failed logins from one IP get it banned (fail2ban and the like),
        // which would lock every user out at once: pause this shortcut.
        const minutes = Math.max(1, Math.round(o.loginPauseMs / 60_000));
        loginPaused.set(sc.id, {
          until: Date.now() + o.loginPauseMs,
          error: new HttpError(502, msg("err.loginPaused", { reason: httpError.text ?? httpError.message, minutes })),
        });
      }
      throw httpError;
    }
    // curl sends a plain LIST. basic-ftp's "LIST -a" adds dotfiles and
    // confuses some servers; MLSD, when offered, stays first.
    client.availableListCommands = client.availableListCommands.filter((c) => c !== "LIST -a");
    return { client, close };
  }

  // Runs work(client, why, stop) on a fresh connection that is closed
  // afterwards, or early: when the browser goes away (if `res` is given),
  // the deadline passes, or work calls stop(reason). why() returns that reason.
  async function withConnection(sc, res, deadlineMs, work) {
    const { client, close } = await connect(sc);
    let reason = null;
    const stop = (why) => {
      if (!reason) {
        reason = why;
        close();
      }
    };
    const onClose = () => {
      if (!res.writableFinished) stop("client");
    };
    res?.on("close", onClose);
    if (res?.destroyed) onClose();
    const deadline = deadlineMs ? setTimeout(() => stop("deadline"), deadlineMs) : null;
    try {
      return await work(client, () => reason, stop);
    } catch (err) {
      if (reason === "client" || reason === "stall") throw new HttpError(499, msg("err.clientGone"));
      if (reason === "deadline") throw new HttpError(504, msg("err.ftpSlow"));
      throw toHttpError(err);
    } finally {
      clearTimeout(deadline);
      res?.off("close", onClose);
      close();
    }
  }

  // Feeds the FTP data stream into the HTTP response. Never hand `res` itself
  // to downloadTo(): basic-ftp always end()s its destination, even after a
  // failed transfer, which would pass a truncated file off as complete.
  async function pipeFile(client, name, res, { start, length, stopEarly, status, headers }, why, stop) {
    let remaining = length;   // null when the size is unknown
    let stallTimer = null;
    const progress = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stop("stall");
        res.destroy();   // the browser re-requests from where it was, if it still wants the file
      }, o.stallMs);
    };

    const sink = new Writable({
      write(chunk, _encoding, callback) {
        if (res.destroyed) return callback(new Error("Response closed"));
        if (remaining !== null) {
          if (remaining <= 0) return callback();   // beyond what was promised: drop
          if (chunk.length > remaining) chunk = chunk.subarray(0, remaining);
          remaining -= chunk.length;
        }
        // Headers go out with the first byte, so an FTP error before any data
        // still becomes a clean JSON error response.
        if (!res.headersSent) res.writeHead(status, headers);
        progress();
        const flushed = res.write(chunk);
        if (remaining === 0 && stopEarly) stop("done");   // range sent: end the transfer
        if (flushed) callback();
        else res.once("drain", () => { progress(); callback(); });
      },
      final(callback) {
        callback();   // res ends only once the transfer is known to be complete
      },
    });

    progress();
    try {
      await client.downloadTo(sink, name, start);
    } catch (err) {
      if (why() !== "done") throw err;
    } finally {
      clearTimeout(stallTimer);
    }
    if (remaining > 0) {
      res.destroy();   // the file shrank mid-transfer: never pretend it is complete
      return;
    }
    if (!res.headersSent) res.writeHead(status, headers);
    res.end();
  }

  return {
    forget(id) {
      loginPaused.delete(id);
    },

    async list(sc, rawPath, res) {
      const segments = parseRemotePath(rawPath);
      return withConnection(sc, res, o.listDeadlineMs, async (client) => {
        for (const segment of segments) await client.cd(segment);
        return (await client.list()).filter((f) => f.name !== "." && f.name !== "..").map(toEntry);
      });
    },

    async stream(sc, rawPath, req, res, { download = false } = {}) {
      const segments = parseRemotePath(rawPath);
      const name = segments.pop();
      if (!name) throw new HttpError(400, msg("err.notAFile"));
      const type = download ? null : inlineType(name);

      await withConnection(sc, res, 0, async (client, why, stop) => {
        for (const segment of segments) await client.cd(segment);
        const size = await fileSize(client, name);
        const range = size === null ? null : parseRange(req.headers.range, size);
        if (range === "unsatisfiable") {
          throw new HttpError(416, msg("err.range"), { "Content-Range": `bytes */${size}` });
        }
        const start = range ? range.start : 0;
        const length = size === null ? null : (range ? range.end + 1 : size) - start;
        const status = range ? 206 : 200;
        const headers = fileHeaders(name, type, size, range, length);

        if (req.method === "HEAD" || length === 0) {
          res.writeHead(status, headers);
          res.end();
          return;
        }
        const stopEarly = !!range && range.end < size - 1;
        await pipeFile(client, name, res, { start, length, stopEarly, status, headers }, why, stop);
      });
    },

    // Not tied to one HTTP response: the result is shared by every request
    // for the same video. Refused up front when SIZE shows the file is too
    // big, and mid-transfer otherwise.
    async fetch(sc, rawPath, { maxBytes }) {
      const segments = parseRemotePath(rawPath);
      const name = segments.pop();
      if (!name) throw new HttpError(400, msg("err.notAFile"));
      const tooBig = () => new HttpError(413, msg("err.tooBigToPlay", { mb: Math.round(maxBytes / 1048576) }));

      return withConnection(sc, null, o.fetchDeadlineMs, async (client, why, stop) => {
        for (const segment of segments) await client.cd(segment);
        const size = await fileSize(client, name);
        if (size !== null && size > maxBytes) throw tooBig();
        const chunks = [];
        let total = 0;
        const sink = new Writable({
          write(chunk, _encoding, callback) {
            total += chunk.length;
            if (total > maxBytes) {
              stop("too big");
              return callback(new Error("File too big"));
            }
            chunks.push(chunk);
            callback();
          },
        });
        try {
          await client.downloadTo(sink, name);
        } catch (err) {
          if (why() !== "too big") throw err;
        }
        if (why() === "too big") throw tooBig();
        // A camera may still be uploading the newest clip: don't keep half of it.
        if (size !== null && total !== size) {
          throw new HttpError(503, msg("err.stillWriting"), { "Retry-After": "5" });
        }
        return Buffer.concat(chunks, total);
      });
    },
  };
}
