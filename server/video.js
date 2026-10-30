/*
 * video.js - makes recorded clips playable in any browser.
 *
 *   createConverter(options)
 *     check()                  -> Promise<string | null>: ffmpeg's version line, null if missing
 *     playable(key, load)      -> Promise<Buffer>: an MP4 the browser can play
 *   isBrowserMp4(buffer)       true when the bytes already are such an MP4
 *   sendVideo(req, res, body, name)   serve a playable() result, with byte ranges
 *
 * Browsers play H.264 in MP4 and little else, while cameras also record
 * MPEG-4 Part 2 (XviD), often in AVI, and some give MP4 files an .avi name.
 * playable() gets the whole file from load(), passes a browser-ready MP4
 * through untouched whatever its name, and converts anything else to H.264
 * with ffmpeg. Results stay in memory for a while: a browser requests a
 * video several times (byte ranges, replays). The clip is written to a
 * private temporary folder only while ffmpeg runs; in Docker, /tmp is RAM.
 */

import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { HttpError } from "./http.js";
import { fileHeaders, parseRange } from "./ftp.js";

const DEFAULTS = {
  ffmpegPath: "ffmpeg",
  timeoutMs: 120_000,        // one conversion
  concurrency: 2,            // ffmpeg processes at once
  maxQueue: 20,              // conversions waiting for one of them
  cacheBytes: 64 * 1024 * 1024,
  cacheTtlMs: 10 * 60_000,
  errorTtlMs: 60_000,        // a file that can't be played is not retried for this long
  probe: probeVersion,       // tests replace ffmpeg with these two
  run: runProcess,
};

/* ---- recognising a browser-ready MP4 ---- */

// The boxes of an ISO-BMFF (MP4/MOV) buffer between start and end.
function boxes(buf, start = 0, end = buf.length) {
  const out = [];
  for (let at = start; at + 8 <= end;) {
    let size = buf.readUInt32BE(at);
    let header = 8;
    if (size === 1) {
      if (at + 16 > end) break;
      size = Number(buf.readBigUInt64BE(at + 8));
      header = 16;
    } else if (size === 0) {
      size = end - at;   // "runs to the end of the file"
    }
    if (size < header || at + size > end) break;   // truncated, or not a box at all
    out.push({ type: buf.toString("latin1", at + 4, at + 8), start: at + header, end: at + size });
    at += size;
  }
  return out;
}

const child = (buf, box, type) => box && boxes(buf, box.start, box.end).find((b) => b.type === type);

const H264_PROFILES = new Set([66, 77, 100]);   // Baseline, Main, High: every browser decodes these
const AUDIO_CODECS = new Set(["mp4a", ".mp3"]);

export function isBrowserMp4(buf) {
  if (buf.length < 12 || buf.toString("latin1", 4, 8) !== "ftyp") return false;
  const moov = boxes(buf).find((b) => b.type === "moov");
  if (!moov) return false;
  let video = 0;
  for (const trak of boxes(buf, moov.start, moov.end).filter((b) => b.type === "trak")) {
    const mdia = child(buf, trak, "mdia");
    const hdlr = child(buf, mdia, "hdlr");
    const stsd = ["minf", "stbl", "stsd"].reduce((box, type) => child(buf, box, type), mdia);
    if (!hdlr || !stsd) return false;
    const handler = buf.toString("latin1", hdlr.start + 8, hdlr.start + 12);
    const entry = boxes(buf, stsd.start + 8, stsd.end)[0];   // the first sample description
    if (!entry) return false;
    if (handler === "vide") {
      if (entry.type !== "avc1" && entry.type !== "avc3") return false;
      const avcC = boxes(buf, entry.start + 78, entry.end).find((b) => b.type === "avcC");
      if (!avcC || !H264_PROFILES.has(buf[avcC.start + 1])) return false;
      video++;
    } else if (handler === "soun" && !AUDIO_CODECS.has(entry.type)) {
      return false;
    }
  }
  return video > 0;
}

/* ---- ffmpeg ---- */

// Demuxers of real video formats only: playlist formats such as HLS or
// concat could make ffmpeg read other files, or fetch URLs.
const INPUT_FORMATS = "avi,mov,matroska,mpegts,mpeg,h264,hevc,m4v,flv,asf,dhav,mjpeg,mpjpeg";

function ffmpegArgs(input, output) {
  return [
    "-nostdin", "-hide_banner", "-loglevel", "error",
    "-protocol_whitelist", "file", "-format_whitelist", INPUT_FORMATS,
    "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2",          // 4:2:0 needs even dimensions
    "-force_key_frames", "expr:gte(t,n_forced*2)",       // a keyframe every 2 s, for seeking
    "-c:a", "aac", "-b:a", "96k",
    "-movflags", "+faststart", "-threads", "2",
    "-f", "mp4", output,
  ];
}

// -> ffmpeg's version line, or null when it can't be run.
function probeVersion(file) {
  return new Promise((resolve) => {
    execFile(file, ["-hide_banner", "-version"], { timeout: 10_000, windowsHide: true },
      (err, stdout) => resolve(err ? null : String(stdout).split(/\r?\n/)[0].trim()));
  });
}

// -> { code, signal }; rejects only if the program can't be started.
function runProcess(file, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(file, args, { stdio: "ignore", windowsHide: true });
    const timer = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

/* ---- concurrency and cache ---- */

function createLimit(max, maxQueue) {
  let active = 0;
  const waiting = [];
  return async function limit(work) {
    if (active < max) {
      active++;
    } else {
      if (waiting.length >= maxQueue) {
        throw new HttpError(503, "The server is busy converting videos; try again in a moment", { "Retry-After": "5" });
      }
      await new Promise((resolve) => waiting.push(resolve));   // the slot is handed over
    }
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

// Least recently used first out, within a byte budget.
function createCache(maxBytes) {
  const entries = new Map();   // key -> { value, size, expires }
  let total = 0;
  const drop = (key) => {
    total -= entries.get(key).size;
    entries.delete(key);
  };
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      drop(key);
      if (entry.expires < Date.now()) return undefined;
      entries.set(key, entry);   // now the most recently used
      total += entry.size;
      return entry.value;
    },
    set(key, value, size, ttlMs) {
      if (entries.has(key)) drop(key);
      if (size > maxBytes) return;
      entries.set(key, { value, size, expires: Date.now() + ttlMs });
      total += size;
      for (const oldest of entries.keys()) {
        if (total <= maxBytes) break;
        drop(oldest);
      }
    },
  };
}

/* ---- converter ---- */

const CACHED_FAILURES = new Set([413, 415, 501]);   // the same file would fail the same way

export function createConverter(options = {}) {
  const o = { ...DEFAULTS, ...options };
  const limit = createLimit(o.concurrency, o.maxQueue);
  const cache = createCache(o.cacheBytes);
  const inflight = new Map();   // key -> Promise<Buffer>, shared by simultaneous requests
  let version = null;

  function check() {
    version ??= o.probe(o.ffmpegPath);
    return version;
  }

  const noConverter = () => new HttpError(501,
    "This video needs converting, but the server has no converter (ffmpeg). Download it to watch it in a video player.");

  async function convert(input) {
    if (!(await check())) throw noConverter();
    return limit(async () => {
      const dir = await mkdtemp(path.join(os.tmpdir(), "qfe-video-"));
      try {
        const source = path.join(dir, "input");
        const target = path.join(dir, "output.mp4");
        await writeFile(source, input, { mode: 0o600 });
        const { code, signal } = await o.run(o.ffmpegPath, ffmpegArgs(source, target), o.timeoutMs)
          .catch(() => { throw noConverter(); });   // removed since check()
        if (signal) throw new HttpError(504, "Converting this video took too long");
        if (code !== 0) {
          throw new HttpError(415, "This video couldn't be converted: its format isn't supported, or the file is damaged.");
        }
        return await readFile(target);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }

  async function prepare(load) {
    const input = await load();
    return isBrowserMp4(input) ? input : convert(input);
  }

  function playable(key, load) {
    const hit = cache.get(key);
    if (hit) return hit.error ? Promise.reject(hit.error) : Promise.resolve(hit.body);
    if (!inflight.has(key)) {
      const job = prepare(load).then(
        (body) => {
          cache.set(key, { body }, body.length, o.cacheTtlMs);
          return body;
        },
        (err) => {
          if (CACHED_FAILURES.has(err.status)) cache.set(key, { error: err }, 0, o.errorTtlMs);
          throw err;
        },
      ).finally(() => inflight.delete(key));
      inflight.set(key, job);
    }
    return inflight.get(key);
  }

  return { check, playable };
}

/* ---- response ---- */

export function sendVideo(req, res, body, name) {
  const range = parseRange(req.headers.range, body.length);
  if (range === "unsatisfiable") {
    throw new HttpError(416, "Range not satisfiable", { "Content-Range": `bytes */${body.length}` });
  }
  const part = range ? body.subarray(range.start, range.end + 1) : body;
  // It is an MP4 now, whatever the original was called.
  const mp4Name = name.replace(/\.[^.]*$/, "") + ".mp4";
  res.writeHead(range ? 206 : 200, fileHeaders(mp4Name, "video/mp4", body.length, range, part.length));
  res.end(req.method === "HEAD" ? undefined : part);
}
