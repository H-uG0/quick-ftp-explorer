/*
 * routes.js - the application: wires config, accounts, shortcuts, the audit
 * trail and static files into the route table.
 *
 *   createApp(cfg, { log, ftp, video, zip }) -> { handler, users, shortcuts, audit, converter }
 *                                   (`ftp` / `video` / `zip` override gateway / converter /
 *                                   ZIP export options, for tests)
 *
 * Pages:  GET /  GET /login  POST /login  POST /logout
 * API:    GET /api/me
 *         GET /api/shortcuts                     (admins also see host, port, username)
 *         POST /api/shortcuts  PUT|DELETE /api/shortcuts/:id   (admins only)
 *         GET /api/shortcuts/:id/list?path=      folder listing
 *         GET|HEAD /api/shortcuts/:id/file?path=[&download=1]   file stream (Range)
 *         GET|HEAD /api/shortcuts/:id/play?path=   a video as an MP4 the browser can play (Range)
 *         POST /api/shortcuts/:id/zip            { paths, localTime? } -> { url, count, name }
 *         GET|HEAD /api/zip/:token               that url, once: the files as one ZIP, streamed
 * Ops:    GET /healthz
 *
 * FTP passwords never appear in any response.
 */

import path from "node:path";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createHandler, loadStatic, sendFile, sendJson, readJson, readForm, redirect, serializeCookie, parseCookies,
  requestLanguage,
} from "./http.js";
import { createUserStore, createSessions, createLimiter, loadSessionSecret } from "./auth.js";
import { createShortcutStore } from "./store.js";
import { createGateway, parseRemotePath, contentDisposition } from "./ftp.js";
import { createConverter, sendVideo } from "./video.js";
import { createAudit } from "./audit.js";
import { HttpError } from "./http.js";
import { msg } from "../public/js/i18n.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const COOKIE = "qfe_session";
const ID = "(?<id>[A-Za-z0-9._-]+)";
const SHORTCUT_PATH = new RegExp(`^/api/shortcuts/${ID}$`);
const LIST_PATH = new RegExp(`^/api/shortcuts/${ID}/list$`);
const FILE_PATH = new RegExp(`^/api/shortcuts/${ID}/file$`);
const PLAY_PATH = new RegExp(`^/api/shortcuts/${ID}/play$`);
const ZIP_PATH = new RegExp(`^/api/shortcuts/${ID}/zip$`);
const ZIP_LINK = /^\/api\/zip\/(?<token>[A-Za-z0-9_-]+)$/;

const ZIP_DEFAULTS = {
  ttlMs: 2 * 60_000,     // the page follows its link at once
  maxConcurrent: 2,      // archives streaming at once, across the server
  maxFiles: 200,         // per archive
  linksPerUser: 10,      // waiting links one account may hold; the oldest goes first
};

/* ---- ZIP export helpers ---- */

// 1 to `max` file paths, none twice once normalized ("//a//b" is "/a/b").
function zipPaths(raw, max) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > max) throw new HttpError(400, msg("err.zipCount", { max }));
  const paths = raw.map((p) => {
    const segments = typeof p === "string" ? parseRemotePath(p) : [];
    if (!segments.length) throw new HttpError(400, msg("err.badPath"));
    return "/" + segments.join("/");
  });
  if (new Set(paths).size !== paths.length) throw new HttpError(400, msg("err.zipDuplicate"));
  return paths;
}

// The browser's wall clock ("2026-11-01T15:58"), so that the archive's name
// says the time its user sees; the server's own when that is missing or wrong.
function localTime(raw, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(typeof raw === "string" ? raw : "");
  if (m) {
    const [year, month, day] = m.slice(1, 4).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (year >= 1980 && year <= 2107 && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return raw;
  }
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

// "<site label> 2026-11-01 15-58.zip", a name Windows accepts: no <>:"/\|?*
// or control characters, no dot or space where the label ends.
function zipName(sc, time) {
  const label = sc.label.replace(/[<>:"/\\|?*\p{Cc}]/gu, "_").trim().replace(/[. ]+$/, "");
  return `${label || sc.id} ${time.slice(0, 10)} ${time.slice(11).replace(":", "-")}.zip`;
}

export async function createApp(cfg, { log, ftp, video, zip } = {}) {
  await mkdir(cfg.dataDir, { recursive: true, mode: 0o700 });
  const staticFiles = await loadStatic(PUBLIC_DIR);
  const users = createUserStore(path.join(cfg.dataDir, "users.json"));
  const sessions = createSessions({
    users,
    secret: await loadSessionSecret(cfg.dataDir, cfg.sessionSecret),
    ttlHours: cfg.sessionTtlHours,
  });
  const shortcuts = createShortcutStore(path.join(cfg.dataDir, "shortcuts"), {
    allowedHosts: cfg.ftpAllowedHosts,
  });
  const gateway = createGateway({
    timeoutMs: cfg.ftpTimeoutMs,
    maxConnections: cfg.ftpMaxConnections,
    allowedHosts: cfg.ftpAllowedHosts,
    ...ftp,
  });
  const converter = createConverter({ ffmpegPath: cfg.ffmpegPath, ...video });
  const audit = createAudit(path.join(cfg.dataDir, "audit.jsonl"));
  const limiter = createLimiter({ max: 10, windowMs: 15 * 60 * 1000 });
  const zipOptions = { ...ZIP_DEFAULTS, ...zip };
  const zipLinks = new Map();   // token -> { user, id, lang, paths, time, name, expires }, oldest first
  let zipStreams = 0;           // archives being sent right now

  function page(name) {
    const file = staticFiles.get(`/${name}.html`);
    if (!file) throw new Error(`public/${name}.html is missing`);
    return file;
  }
  const indexPage = page("index");
  const loginPage = page("login");

  function setSessionCookie(ctx, value, maxAge) {
    ctx.res.setHeader("Set-Cookie", serializeCookie(COOKIE, value, { maxAge, secure: ctx.secure }));
  }

  /* ---- handlers ---- */

  async function login(ctx) {
    const form = await readForm(ctx.req);
    const username = String(form.username ?? "").trim().toLowerCase().slice(0, 64);
    // The folder link the user arrived with ("#/<id>/<path>", see
    // public/js/util.js). Only that exact shape is accepted, so this can
    // never redirect anywhere but into the app.
    const next = String(form.next ?? "");
    const fragment = /^#\/[\x21-\x7e]{0,2048}$/.test(next) ? next : "";
    // Throttle both the address and the account: one guesses many accounts,
    // the other guards a single account against a distributed attempt.
    const keys = [`ip:${ctx.ip}`, `user:${username}`];
    if (keys.some((key) => limiter.blocked(key))) {
      audit("login_blocked", { user: username, ip: ctx.ip });
      return redirect(ctx.res, "/login?error=rate" + fragment);
    }
    const user = await users.authenticate(username, form.password);
    if (!user) {
      keys.forEach((key) => limiter.fail(key));
      audit("login_failed", { user: username, ip: ctx.ip });
      return redirect(ctx.res, "/login?error=invalid" + fragment);
    }
    limiter.reset(`user:${username}`);
    setSessionCookie(ctx, sessions.issue(user), sessions.ttlSeconds);
    ctx.user = { name: user.name, role: user.role };   // so the request log names them
    audit("login", { user: user.name, ip: ctx.ip });
    redirect(ctx.res, "/" + fragment);
  }

  function logout(ctx) {
    setSessionCookie(ctx, "", 0);
    if (ctx.user) audit("logout", { user: ctx.user.name, ip: ctx.ip });
    redirect(ctx.res, "/login");
  }

  function healthz({ res }) {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("ok\n");
  }

  function me({ user }) {
    const out = { username: user.name, role: user.role };
    // Only admins fill in the shortcut form, so only they need its prefill.
    if (user.role === "admin") out.defaults = { host: cfg.defaultFtpHost, port: cfg.defaultFtpPort };
    return out;
  }

  // Browsing needs only id + label; where the FTP server lives is admin business.
  async function listShortcuts({ user }) {
    const all = await shortcuts.list();
    return { shortcuts: user.role === "admin" ? all : all.map(({ id, label }) => ({ id, label })) };
  }

  async function createShortcut(ctx) {
    const id = await shortcuts.create(await readJson(ctx.req));
    audit("shortcut_create", { user: ctx.user.name, ip: ctx.ip, id });
    sendJson(ctx.res, 201, { id });
  }

  async function updateShortcut(ctx) {
    const { id } = ctx.params;
    const newId = await shortcuts.update(id, await readJson(ctx.req));
    // An admin edit is the fix for a failed login: retry at once.
    gateway.forget(id);
    gateway.forget(newId);
    audit("shortcut_update", { user: ctx.user.name, ip: ctx.ip, id, ...(newId !== id && { renamedTo: newId }) });
    return { id: newId };
  }

  async function deleteShortcut(ctx) {
    await shortcuts.remove(ctx.params.id);
    gateway.forget(ctx.params.id);
    audit("shortcut_delete", { user: ctx.user.name, ip: ctx.ip, id: ctx.params.id });
    ctx.res.writeHead(204, { "Cache-Control": "no-store" });
    ctx.res.end();
  }

  async function requireShortcut(id) {
    const sc = await shortcuts.get(id);
    if (!sc) throw new HttpError(404, msg("err.noShortcut"));
    return sc;
  }

  async function listFolder(ctx) {
    const sc = await requireShortcut(ctx.params.id);
    const rawPath = ctx.url.searchParams.get("path") || "/";
    const normalized = "/" + parseRemotePath(rawPath).join("/");
    audit("list", { user: ctx.user.name, ip: ctx.ip, id: sc.id, path: normalized });
    return { path: normalized, entries: await gateway.list(sc, rawPath, ctx.res) };
  }

  // One audit line per opened file: seeking in a video sends more ranged
  // requests for the same file, which are not worth a line each.
  function auditOpen(ctx, event, sc, path, extra) {
    const range = ctx.req.headers.range;
    if (ctx.req.method === "GET" && (!range || /^bytes=0-/.test(range))) {
      audit(event, { user: ctx.user.name, ip: ctx.ip, id: sc.id, path, ...extra });
    }
  }

  async function streamFile(ctx) {
    const sc = await requireShortcut(ctx.params.id);
    const rawPath = ctx.url.searchParams.get("path") || "";
    const normalized = "/" + parseRemotePath(rawPath).join("/");
    const download = ctx.url.searchParams.get("download") === "1";
    auditOpen(ctx, "file", sc, normalized, download && { download });
    await gateway.stream(sc, rawPath, ctx.req, ctx.res, { download });
  }

  async function playVideo(ctx) {
    const sc = await requireShortcut(ctx.params.id);
    const rawPath = ctx.url.searchParams.get("path") || "";
    const segments = parseRemotePath(rawPath);
    if (!segments.length) throw new HttpError(400, msg("err.notAFile"));
    const normalized = "/" + segments.join("/");
    auditOpen(ctx, "play", sc, normalized);
    // The server and login are part of the key, so after an admin edits the
    // shortcut nothing fetched with the old settings is served.
    const key = [sc.id, sc.host, sc.port, sc.username, normalized].join("\n");
    const body = await converter.playable(key, () => gateway.fetch(sc, rawPath, { maxBytes: cfg.convertMaxBytes }));
    sendVideo(ctx.req, ctx.res, body, segments.at(-1));
  }

  // Step 1 of a ZIP export: check the list, and answer with a link the page
  // simply follows, so that the browser's download manager shows the
  // progress and the page never holds the archive. The link works once,
  // for this user, for a short while; it remembers the user's language for
  // the archive's errors entry.
  async function prepareZip(ctx) {
    const sc = await requireShortcut(ctx.params.id);
    const body = await readJson(ctx.req);
    const paths = zipPaths(body.paths, zipOptions.maxFiles);
    const time = localTime(body.localTime);
    const now = Date.now();
    const theirs = [];
    for (const [token, link] of zipLinks) {
      if (link.expires <= now) zipLinks.delete(token);
      else if (link.user === ctx.user.name) theirs.push(token);
    }
    if (theirs.length >= zipOptions.linksPerUser) zipLinks.delete(theirs[0]);
    const token = randomBytes(18).toString("base64url");
    const name = zipName(sc, time);
    zipLinks.set(token, {
      user: ctx.user.name, id: sc.id, lang: requestLanguage(ctx.req), paths, time, name, expires: now + zipOptions.ttlMs,
    });
    return { url: `/api/zip/${token}`, count: paths.length, name };
  }

  // Step 2: the archive, built while it streams (gateway.zip). An unknown,
  // used, expired or someone else's link is the same 404. HEAD answers from
  // the link alone: it neither uses it up nor touches FTP.
  async function sendZip(ctx) {
    const { token } = ctx.params;
    const link = zipLinks.get(token);
    if (!link || link.expires <= Date.now() || link.user !== ctx.user.name) {
      throw new HttpError(404, msg("err.zipExpired"));
    }
    // Before the link is used up, so that the page can retry it.
    if (zipStreams >= zipOptions.maxConcurrent) {
      throw new HttpError(503, msg("err.zipBusy"), { "Retry-After": "5" });
    }
    // No Content-Length: the size is known only at the end, so it is chunked.
    const headers = {
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition("attachment", link.name),
      "Cache-Control": "private, no-store",
    };
    if (ctx.req.method === "HEAD") {
      ctx.res.writeHead(200, headers);
      ctx.res.end();
      return;
    }
    zipLinks.delete(token);
    zipStreams++;
    try {
      const sc = await requireShortcut(link.id);
      audit("export", { user: ctx.user.name, ip: ctx.ip, id: sc.id, count: link.paths.length, paths: link.paths });
      await gateway.zip(sc, link.paths, ctx.res, { lang: link.lang, time: link.time, headers });
    } finally {
      zipStreams--;
    }
  }

  /* ---- route table ---- */

  const routes = [
    { method: "GET", path: /^\/healthz$/, auth: "none", handler: healthz },
    {
      method: "GET", path: /^\/$/, auth: "none",
      handler: (ctx) => (ctx.user ? sendFile(ctx.req, ctx.res, indexPage) : redirect(ctx.res, "/login", 302)),
    },
    {
      method: "GET", path: /^\/login$/, auth: "none",
      handler: (ctx) => (ctx.user ? redirect(ctx.res, "/", 302) : sendFile(ctx.req, ctx.res, loginPage)),
    },
    { method: "POST", path: /^\/login$/, auth: "none", handler: login },
    { method: "POST", path: /^\/logout$/, auth: "none", handler: logout },
    { method: "GET", path: /^\/api\/me$/, auth: "user", handler: me },
    { method: "GET", path: /^\/api\/shortcuts$/, auth: "user", handler: listShortcuts },
    { method: "POST", path: /^\/api\/shortcuts$/, auth: "admin", handler: createShortcut },
    { method: "PUT", path: SHORTCUT_PATH, auth: "admin", handler: updateShortcut },
    { method: "DELETE", path: SHORTCUT_PATH, auth: "admin", handler: deleteShortcut },
    { method: "GET", path: LIST_PATH, auth: "user", handler: listFolder },
    { method: "GET", path: FILE_PATH, auth: "user", handler: streamFile },
    { method: "GET", path: PLAY_PATH, auth: "user", handler: playVideo },
    { method: "POST", path: ZIP_PATH, auth: "user", handler: prepareZip },
    { method: "GET", path: ZIP_LINK, auth: "user", handler: sendZip },
  ];

  const handler = createHandler({
    routes,
    staticFiles,
    trustProxy: cfg.trustProxy,
    log,
    sessionUser: (req) => sessions.verify(parseCookies(req)[COOKIE]),
  });
  return { handler, users, shortcuts, audit, converter };
}
