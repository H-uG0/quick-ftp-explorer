/*
 * fake-ftp-server.js - a small but real FTP server (node:net), read-only,
 * for tests and local development. Serves an in-memory tree or a folder.
 *
 *   const ftp = await startFakeFtp({ tree: fixtureTree() });
 *   ftp.port, ftp.commands ("USER demo", "PASS ***", "CWD Images", ...)
 *   ftp.logins(), ftp.openDataSockets(), ftp.openConnections(), await ftp.close()
 *
 * Options: users {name: password} (default demo/demo), tree | root (folder),
 * home (login directory, default "/"), host/port (127.0.0.1, ephemeral), and
 * switches for awkward servers: epsv: false, pasvHost: "10.0.0.5" (announce a
 * private NAT address), mlsd: true, size: false, rest: false,
 * maxConnections, stallAfter (bytes, then the transfer hangs), listDelayMs.
 *
 * Unix listings follow the legacy fixture's `ls -l` shape ("total", ".", ".."
 * included). Only commands basic-ftp and curl use exist; anything else gets
 * "502 Command not implemented".
 */

import net from "node:net";
import path from "node:path";
import { once } from "node:events";
import { createReadStream, readdirSync, statSync } from "node:fs";

const LINK = Symbol("link");
export const link = (target) => ({ [LINK]: target });

const CHUNK = 64 * 1024;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FIXED_DATE = new Date(Date.UTC(2026, 3, 1, 12, 34));

// Distinct bytes (i mod 251), so ranges can be checked exactly.
export function patternBytes(length, offset = 0) {
  const buf = Buffer.alloc(length);
  for (let i = 0; i < length; i++) buf[i] = (i + offset) % 251;
  return buf;
}

// The legacy fixture's root listing, plus files for the browser-safety tests.
export function fixtureTree() {
  return {
    "Images": { "2026": { "snap 1.jpg": patternBytes(300) }, "front door.png": patternBytes(500) },
    "Dossier avec accents éàü": { "notes.txt": "bonjour\n" },
    "file-with-no-spaces.mp4": patternBytes(22509),
    "file with several spaces.mp4": patternBytes(33333),
    "empty.txt": "",
    "report with accents éàü.pdf": patternBytes(123456),
    "latest": link("file-with-no-spaces.mp4"),
    "photo été.jpg": patternBytes(1024),
    "page.html": "<script>alert(document.cookie)</script>",
    "logo.svg": "<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>",
  };
}

/* ---- trees: { type: "dir", child(name), list() } | { type: "file", size, read(start) } | { type: "link" } ---- */

function memNode(value) {
  if (value && value[LINK]) return { type: "link", target: value[LINK], size: value[LINK].length, mtime: FIXED_DATE };
  if (typeof value === "string" || Buffer.isBuffer(value)) {
    const buf = Buffer.from(value);
    return {
      type: "file", size: buf.length, mtime: FIXED_DATE,
      async *read(start) {
        for (let i = start; i < buf.length; i += CHUNK) yield buf.subarray(i, i + CHUNK);
      },
    };
  }
  return {
    type: "dir", mtime: FIXED_DATE,
    child: (name) => (Object.hasOwn(value, name) ? memNode(value[name]) : null),
    list: () => Object.keys(value).map((name) => ({ name, node: memNode(value[name]) })),
  };
}

function fsNode(abs) {
  let st;
  try {
    st = statSync(abs);
  } catch {
    return null;
  }
  if (st.isDirectory()) {
    return {
      type: "dir", mtime: st.mtime,
      // Names come from FTP commands: never let one climb out of the folder.
      child: (name) => (/[\\/]/.test(name) || name === ".." ? null : fsNode(path.join(abs, name))),
      list: () => readdirSync(abs).map((name) => ({ name, node: fsNode(path.join(abs, name)) })).filter((e) => e.node),
    };
  }
  return { type: "file", size: st.size, mtime: st.mtime, read: (start) => createReadStream(abs, { start, highWaterMark: CHUNK }) };
}

function unixDate(d) {
  return `${MONTHS[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, "0")} ${d.getUTCFullYear()}`;
}

function unixLine(name, node) {
  const date = unixDate(node.mtime);
  if (node.type === "dir") return `drwxr-xr-x 2 ftp ftp ${"4096".padStart(8)} ${date} ${name}`;
  if (node.type === "link") return `lrwxrwxrwx 1 ftp ftp ${String(node.size).padStart(8)} ${date} ${name} -> ${node.target}`;
  return `-rw-r--r-- 1 ftp ftp ${String(node.size).padStart(8)} ${date} ${name}`;
}

function mlsdLine(name, node) {
  const modify = node.mtime.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  if (node.type === "dir") return `type=dir;modify=${modify}; ${name}`;
  return `type=file;size=${node.size};modify=${modify}; ${name}`;
}

/* ---- server ---- */

export async function startFakeFtp(options = {}) {
  const {
    users = { demo: "demo" }, tree = fixtureTree(), root = null, home = "/",
    host = "127.0.0.1", port = 0,
    epsv = true, pasvHost = null, mlsd = false, size = true, rest = true,
    maxConnections = Infinity, stallAfter = null, listDelayMs = 0,
  } = options;
  const rootNode = root ? fsNode(path.resolve(root)) : memNode(tree);
  const commands = [];
  const controls = new Set();
  const dataSockets = new Set();
  const listeners = new Set();

  const resolve = (cwd, arg) => {
    const parts = arg.startsWith("/") ? [] : [...cwd];
    for (const seg of arg.split("/")) {
      if (!seg || seg === ".") continue;
      if (seg === "..") parts.pop();
      else parts.push(seg);
    }
    return parts;
  };
  const nodeAt = (parts) => {
    let node = rootNode;
    for (const part of parts) {
      node = node && node.type === "dir" ? node.child(part) : null;
      if (!node) return null;
    }
    return node;
  };

  async function openPassive(s) {
    s.dataServer?.close();
    const srv = net.createServer();
    listeners.add(srv);
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    s.data = new Promise((resolveData) => {
      srv.once("connection", (sock) => {
        sock.on("error", () => {});
        dataSockets.add(sock);
        sock.on("close", () => dataSockets.delete(sock));
        srv.close();
        listeners.delete(srv);
        resolveData(sock);
      });
    });
    s.dataServer = srv;
    return srv.address().port;
  }

  // Resolves true once everything was sent, false if the client hung up.
  async function sendFile(sock, node, start) {
    let sent = 0;
    for await (const chunk of node.read(start)) {
      if (sock.destroyed) return false;
      let part = chunk;
      if (stallAfter !== null && sent + part.length > stallAfter) {
        part = part.subarray(0, Math.max(0, stallAfter - sent));
        if (part.length) sock.write(part);
        await once(sock, "close");   // hang until the client gives up
        return false;
      }
      sent += part.length;
      if (!sock.write(part)) {
        const drained = await Promise.race([once(sock, "drain").then(() => true), once(sock, "close").then(() => false)]);
        if (!drained) return false;
      }
    }
    await new Promise((r) => sock.end(r));
    return true;
  }

  async function transfer(s, reply, send) {
    if (!s.data) return reply("425 Use PASV or EPSV first");
    const data = s.data;
    s.data = null;
    s.dataServer = null;
    reply("150 Here comes the data");
    const sock = await data;
    if (await send(sock)) reply("226 Transfer complete");
  }

  async function handle(s, line, reply, control) {
    const sp = line.indexOf(" ");
    const verb = (sp < 0 ? line : line.slice(0, sp)).toUpperCase();
    const arg = sp < 0 ? "" : line.slice(sp + 1);
    commands.push(verb === "PASS" ? "PASS ***" : line);
    if (!s.authed && !["USER", "PASS", "OPTS", "FEAT", "SYST", "QUIT", "NOOP"].includes(verb)) {
      return reply("530 Please login with USER and PASS");
    }
    switch (verb) {
      case "USER":
        s.user = arg;
        return reply("331 Password required");
      case "PASS":
        if (Object.hasOwn(users, s.user) && users[s.user] === arg) {
          s.authed = true;
          return reply("230 Login successful");
        }
        return reply("530 Login incorrect.");
      case "FEAT": {
        const features = [" UTF8", " EPSV", " PASV", mlsd && " MLST type*;size*;modify*;", size && " SIZE", rest && " REST STREAM"];
        return reply(["211-Features:", ...features.filter(Boolean), "211 End"].join("\r\n"));
      }
      case "OPTS": case "TYPE": case "STRU": case "MODE": case "NOOP":
        return reply("200 OK");
      case "SYST":
        return reply("215 UNIX Type: L8");
      case "PWD":
        return reply(`257 "/${s.cwd.join("/")}" is the current directory`);
      case "CWD": {
        const parts = resolve(s.cwd, arg);
        if (nodeAt(parts)?.type !== "dir") return reply("550 Failed to change directory.");
        s.cwd = parts;
        return reply("250 Directory successfully changed.");
      }
      case "CDUP":
        s.cwd.pop();
        return reply("250 Directory successfully changed.");
      case "EPSV":
        if (!epsv) return reply("502 Command not implemented");
        return reply(`229 Entering Extended Passive Mode (|||${await openPassive(s)}|)`);
      case "PASV": {
        const p = await openPassive(s);
        const addr = (pasvHost || "127.0.0.1").replace(/\./g, ",");
        return reply(`227 Entering Passive Mode (${addr},${p >> 8},${p & 255})`);
      }
      case "LIST": case "MLSD": {
        if (verb === "MLSD" && !mlsd) return reply("502 Command not implemented");
        const target = arg.replace(/^-\S*\s*/, "");   // drop "-a"-style options
        const node = nodeAt(target ? resolve(s.cwd, target) : s.cwd);
        if (node?.type !== "dir") return reply("550 No such directory.");
        const entries = node.list();
        const lines = verb === "MLSD"
          ? [`type=cdir; .`, `type=pdir; ..`, ...entries.map((e) => mlsdLine(e.name, e.node))]
          : [`total ${entries.length}`, unixLine(".", node), unixLine("..", node), ...entries.map((e) => unixLine(e.name, e.node))];
        return transfer(s, reply, async (sock) => {
          if (listDelayMs) await new Promise((r) => setTimeout(r, listDelayMs));
          if (sock.destroyed) return false;
          await new Promise((r) => sock.end(lines.join("\r\n") + "\r\n", r));
          return true;
        });
      }
      case "SIZE": {
        if (!size) return reply("502 Command not implemented");
        const node = nodeAt(resolve(s.cwd, arg));
        return node?.type === "file" ? reply(`213 ${node.size}`) : reply("550 Could not get file size.");
      }
      case "REST":
        if (!rest) return reply("502 Command not implemented");
        s.rest = Number(arg) || 0;
        return reply(`350 Restart position accepted (${s.rest}).`);
      case "RETR": {
        const node = nodeAt(resolve(s.cwd, arg));
        const start = s.rest;
        s.rest = 0;
        if (node?.type !== "file") return reply("550 Failed to open file.");
        return transfer(s, reply, (sock) => sendFile(sock, node, start));
      }
      case "QUIT":
        controls.delete(control);   // like a real server: the session is over
        reply("221 Goodbye.");
        return control.end();
      default:
        return reply("502 Command not implemented");
    }
  }

  const accepted = new Set();   // every control socket, also refused ones, so close() can't hang
  const server = net.createServer((control) => {
    control.on("error", () => {});
    accepted.add(control);
    control.on("close", () => accepted.delete(control));
    if (controls.size >= maxConnections) {
      control.end("421 Too many connections from this address.\r\n");
      control.resume();   // keep reading, or the client's FIN is never seen and the socket never closes
      return;
    }
    controls.add(control);
    // A session stops counting once the client says QUIT or hangs up (FIN):
    // both happen before the client can see its own socket close.
    control.on("end", () => controls.delete(control));
    control.on("close", () => controls.delete(control));
    control.setEncoding("utf8");
    const s = { user: null, authed: false, cwd: home.split("/").filter(Boolean), rest: 0, data: null, dataServer: null };
    const reply = (text) => {
      if (!control.destroyed) control.write(text + "\r\n");
    };
    reply("220 Fake FTP server ready");
    let buffer = "";
    let queue = Promise.resolve();   // one command at a time, in order
    control.on("data", (text) => {
      buffer += text;
      for (let i; (i = buffer.indexOf("\r\n")) >= 0;) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        queue = queue.then(() => handle(s, line, reply, control)).catch(() => reply("451 Local error"));
      }
    });
  });
  await new Promise((r) => server.listen(port, host, r));

  return {
    host,
    port: server.address().port,
    commands,
    logins: () => commands.filter((c) => c.startsWith("USER ")).length,
    openDataSockets: () => dataSockets.size,
    openConnections: () => controls.size,
    async close() {
      for (const sock of [...accepted, ...dataSockets]) sock.destroy();
      for (const l of listeners) l.close();
      await new Promise((r) => server.close(r));
    },
  };
}
