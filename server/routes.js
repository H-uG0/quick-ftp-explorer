/*
 * routes.js - the application: wires config, accounts, shortcuts, the audit
 * trail and static files into the route table.
 *
 *   createApp(cfg, { log, ftp, video }) -> { handler, users, shortcuts, audit, converter }
 *                                   (`ftp` / `video` override gateway / converter options, for tests)
 *
 * Pages:  GET /  GET /login  POST /login  POST /logout
 * API:    GET /api/me
 *         GET /api/shortcuts                     (admins also see host, port, username)
 *         POST /api/shortcuts  PUT|DELETE /api/shortcuts/:id   (admins only)
 *         GET /api/shortcuts/:id/list?path=      folder listing
 *         GET|HEAD /api/shortcuts/:id/file?path=[&download=1]   file stream (Range)
 *         GET|HEAD /api/shortcuts/:id/play?path=   a video as an MP4 the browser can play (Range)
 * Ops:    GET /healthz
 *
 * FTP passwords never appear in any response.
 */

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createHandler, loadStatic, sendFile, sendJson, readJson, readForm, redirect, serializeCookie, parseCookies,
} from "./http.js";
import { createUserStore, createSessions, createLimiter, loadSessionSecret } from "./auth.js";
import { createShortcutStore } from "./store.js";
import { createGateway, parseRemotePath } from "./ftp.js";
import { createConverter, sendVideo } from "./video.js";
import { createAudit } from "./audit.js";
import { HttpError } from "./http.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const COOKIE = "qfe_session";
const ID = "(?<id>[A-Za-z0-9._-]+)";
const SHORTCUT_PATH = new RegExp(`^/api/shortcuts/${ID}$`);
const LIST_PATH = new RegExp(`^/api/shortcuts/${ID}/list$`);
const FILE_PATH = new RegExp(`^/api/shortcuts/${ID}/file$`);
const PLAY_PATH = new RegExp(`^/api/shortcuts/${ID}/play$`);

export async function createApp(cfg, { log, ftp, video } = {}) {
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
    if (!sc) throw new HttpError(404, "No such shortcut");
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
    if (!segments.length) throw new HttpError(400, "Not a file path");
    const normalized = "/" + segments.join("/");
    auditOpen(ctx, "play", sc, normalized);
    // The server and login are part of the key, so after an admin edits the
    // shortcut nothing fetched with the old settings is served.
    const key = [sc.id, sc.host, sc.port, sc.username, normalized].join("\n");
    const body = await converter.playable(key, () => gateway.fetch(sc, rawPath, { maxBytes: cfg.convertMaxBytes }));
    sendVideo(ctx.req, ctx.res, body, segments.at(-1));
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
