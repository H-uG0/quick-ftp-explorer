/*
 * routes.js - the application: wires config, accounts, shortcuts, the audit
 * trail and static files into the route table.
 *
 *   createApp(cfg, { log }) -> { handler, users, shortcuts, audit }
 *
 * Pages:  GET /  GET /login  POST /login  POST /logout
 * API:    GET /api/me
 *         GET /api/shortcuts                     (admins also see host, port, username)
 *         POST /api/shortcuts  PUT|DELETE /api/shortcuts/:id   (admins only)
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
import { createAudit } from "./audit.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const COOKIE = "qfe_session";
const SHORTCUT_PATH = /^\/api\/shortcuts\/(?<id>[A-Za-z0-9._-]+)$/;

export async function createApp(cfg, { log } = {}) {
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
    // Throttle both the address and the account: one guesses many accounts,
    // the other guards a single account against a distributed attempt.
    const keys = [`ip:${ctx.ip}`, `user:${username}`];
    if (keys.some((key) => limiter.blocked(key))) {
      audit("login_blocked", { user: username, ip: ctx.ip });
      return redirect(ctx.res, "/login?error=rate");
    }
    const user = await users.authenticate(username, form.password);
    if (!user) {
      keys.forEach((key) => limiter.fail(key));
      audit("login_failed", { user: username, ip: ctx.ip });
      return redirect(ctx.res, "/login?error=invalid");
    }
    limiter.reset(`user:${username}`);
    setSessionCookie(ctx, sessions.issue(user), sessions.ttlSeconds);
    ctx.user = { name: user.name, role: user.role };   // so the request log names them
    audit("login", { user: user.name, ip: ctx.ip });
    redirect(ctx.res, "/");
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
    audit("shortcut_update", { user: ctx.user.name, ip: ctx.ip, id, ...(newId !== id && { renamedTo: newId }) });
    return { id: newId };
  }

  async function deleteShortcut(ctx) {
    await shortcuts.remove(ctx.params.id);
    audit("shortcut_delete", { user: ctx.user.name, ip: ctx.ip, id: ctx.params.id });
    ctx.res.writeHead(204, { "Cache-Control": "no-store" });
    ctx.res.end();
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
  ];

  const handler = createHandler({
    routes,
    staticFiles,
    trustProxy: cfg.trustProxy,
    log,
    sessionUser: (req) => sessions.verify(parseCookies(req)[COOKIE]),
  });
  return { handler, users, shortcuts, audit };
}
