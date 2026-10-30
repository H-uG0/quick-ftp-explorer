/*
 * http.js - the small HTTP toolkit the server is built on (node:http only).
 *
 *   createHandler({ routes, staticFiles, sessionUser, trustProxy, log })
 *                                   (req, res) listener for http.createServer
 *   loadStatic(dir)                 read public/ into memory at boot
 *   sendFile(req, res, file)        serve one in-memory file (ETag, 304, HEAD)
 *   readJson(req) / readForm(req)   bounded body readers (16 KB)
 *   sendJson(res, status, body) / redirect(res, location, status)
 *   parseCookies(req) / serializeCookie(name, value, opts)
 *   clientIp(req, trustProxy) / isSecure(req, trustProxy)
 *   HttpError(status, message, headers)   throw from a handler -> JSON error reply
 *
 * A route is { method, path, auth, handler }: `path` is a RegExp whose named
 * groups become ctx.params; `auth` is "none" | "user" | "admin". GET routes
 * also answer HEAD (Node drops the body). Handlers get
 * ctx = { req, res, url, params, user, ip, secure } and either write the
 * response themselves or return a value, which is sent as JSON.
 *
 * Static files are read once at boot, so no URL is ever mapped onto the
 * filesystem. HTML pages are reachable only through their routes.
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const BODY_LIMIT = 16 * 1024;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const SECURITY_HEADERS = {
  "Content-Security-Policy":
    "default-src 'self'; img-src 'self' blob: data:; media-src 'self'; object-src 'none'; " +
    "frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  // Not "no-referrer": that makes browsers send `Origin: null` on same-origin
  // form posts, which the cross-origin check below would then refuse.
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
  "Cross-Origin-Opener-Policy": "same-origin",
};

export class HttpError extends Error {
  constructor(status, message, headers) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

/* ---- request helpers ---- */

export function clientIp(req, trustProxy) {
  const forwarded = trustProxy && req.headers["x-forwarded-for"];
  // The proxy appends the address it saw, so only the rightmost entry is
  // something a client cannot forge.
  const ip = forwarded ? forwarded.split(",").pop().trim() : req.socket.remoteAddress || "";
  return ip.replace(/^::ffff:/, "");
}

export function isSecure(req, trustProxy) {
  if (req.socket.encrypted) return true;
  const proto = trustProxy && req.headers["x-forwarded-proto"];
  return !!proto && proto.split(",").pop().trim() === "https";
}

export function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (Object.hasOwn(out, name)) continue;
    try {
      out[name] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch { /* skip malformed values */ }
  }
  return out;
}

export function serializeCookie(name, value, { maxAge, secure } = {}) {
  let cookie = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax`;
  if (maxAge !== undefined) cookie += `; Max-Age=${maxAge}`;
  if (secure) cookie += "; Secure";
  return cookie;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new HttpError(413, "Request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function readJson(req) {
  const text = await readBody(req);
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "Malformed JSON body");
  }
}

export async function readForm(req) {
  return Object.fromEntries(new URLSearchParams(await readBody(req)));
}

/* ---- responses ---- */

export function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store",
  });
  res.end(json);
}

export function redirect(res, location, status = 303) {
  res.writeHead(status, { Location: location, "Cache-Control": "no-store", "Content-Length": 0 });
  res.end();
}

/* ---- static files ---- */

export async function loadStatic(dir) {
  const files = new Map();
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    const type = MIME[path.extname(entry.name).toLowerCase()];
    if (!entry.isFile() || !type) continue;
    const abs = path.join(entry.parentPath, entry.name);
    const body = await readFile(abs);
    const etag = `"${createHash("sha256").update(body).digest("base64url").slice(0, 22)}"`;
    files.set("/" + path.relative(dir, abs).split(path.sep).join("/"), { body, type, etag });
  }
  return files;
}

export function sendFile(req, res, file) {
  // no-cache = always revalidate (cheap 304s), so a redeploy is picked up at once.
  const headers = { "Content-Type": file.type, "Cache-Control": "no-cache", ETag: file.etag };
  if (req.headers["if-none-match"] === file.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  headers["Content-Length"] = file.body.length;
  res.writeHead(200, headers);
  res.end(file.body);
}

/* ---- dispatch ---- */

// Defence in depth on top of SameSite=Lax cookies: a browser always sends
// Origin on cross-site writes, and it must name this very host.
function checkSameOrigin(req) {
  const origin = req.headers.origin;
  if (origin === undefined) return;   // non-browser clients (CLI, tests)
  let host = null;
  try { host = new URL(origin).host; } catch { /* "null" or garbage */ }
  if (host !== req.headers.host) throw new HttpError(403, "Cross-origin request refused");
}

async function dispatch(ctx, routes, staticFiles) {
  const { req, url } = ctx;
  const method = req.method === "HEAD" ? "GET" : req.method;
  let pathMatched = false;
  for (const route of routes) {
    const m = route.path.exec(url.pathname);
    if (!m) continue;
    pathMatched = true;
    if (route.method !== method) continue;

    if (MUTATING.has(req.method)) {
      checkSameOrigin(req);
      // Everything under /api speaks JSON. Requiring the header also means a
      // cross-site HTML form can never reach these routes.
      if (url.pathname.startsWith("/api/") && !/^application\/json\b/i.test(req.headers["content-type"] || "")) {
        throw new HttpError(415, "Expected Content-Type: application/json");
      }
    }
    if (route.auth !== "none" && !ctx.user) throw new HttpError(401, "Sign-in required");
    if (route.auth === "admin" && ctx.user.role !== "admin") throw new HttpError(403, "Admins only");

    ctx.params = { ...m.groups };
    const result = await route.handler(ctx);
    if (result !== undefined && !ctx.res.headersSent) sendJson(ctx.res, 200, result);
    return;
  }
  if (pathMatched) throw new HttpError(405, "Method not allowed");
  const file = method === "GET" && !url.pathname.endsWith(".html") && staticFiles.get(url.pathname);
  if (file) return sendFile(req, ctx.res, file);
  throw new HttpError(404, "Not found");
}

function fail(ctx, err) {
  const { res } = ctx;
  if (res.headersSent) {
    // Mid-stream: abort the connection so the client sees a failure rather
    // than a response that merely looks short.
    res.destroy(err);
    return;
  }
  const status = err instanceof HttpError ? err.status : 500;
  if (status === 500) console.error(err);
  for (const [name, value] of Object.entries(err.headers || {})) res.setHeader(name, value);
  sendJson(res, status, { error: status === 500 ? "Internal server error" : err.message });
}

function logLine(ctx, status, ms, finished) {
  const who = ctx.user ? ctx.user.name : "-";
  const suffix = finished ? "" : " (aborted)";
  console.log(`${new Date().toISOString()} ${ctx.ip} ${who} ${ctx.req.method} ${ctx.req.url} ${status}${suffix} ${ms}ms`);
}

function parseTarget(raw) {
  // Only origin-form targets ("/path?query"); "*" and absolute URLs are refused.
  // Prefixing (rather than resolving) keeps "//x" a path, not a host.
  if (raw.startsWith("/")) {
    try { return new URL("http://localhost" + raw); } catch { /* fall through */ }
  }
  throw new HttpError(400, "Bad request target");
}

export function createHandler({ routes, staticFiles, sessionUser, trustProxy, log = logLine }) {
  return async function handle(req, res) {
    const started = Date.now();
    const ctx = {
      req, res, params: {}, user: null, url: null,
      ip: clientIp(req, trustProxy),
      secure: isSecure(req, trustProxy),
    };
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    if (ctx.secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    res.on("close", () => log(ctx, res.statusCode, Date.now() - started, res.writableFinished));
    try {
      ctx.url = parseTarget(req.url);
      ctx.user = await sessionUser(req);
      await dispatch(ctx, routes, staticFiles);
    } catch (err) {
      // A rejection escaping this listener would be unhandled and crash the
      // process, so the error path itself must never throw.
      try { fail(ctx, err); } catch { res.destroy(); }
    }
  };
}
