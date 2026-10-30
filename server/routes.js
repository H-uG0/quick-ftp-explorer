/*
 * routes.js - the application: wires config, accounts, the audit trail and
 * static files into the route table.
 *
 *   createApp(cfg, { log }) -> { handler, users, audit }
 *
 * Pages:  GET /  GET /login  POST /login  POST /logout
 * API:    GET /api/me
 * Ops:    GET /healthz
 */

import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createHandler, loadStatic, sendFile, readForm, redirect, serializeCookie, parseCookies,
} from "./http.js";
import { createUserStore, createSessions, createLimiter, loadSessionSecret } from "./auth.js";
import { createAudit } from "./audit.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public/", import.meta.url));
const COOKIE = "qfe_session";

export async function createApp(cfg, { log } = {}) {
  await mkdir(cfg.dataDir, { recursive: true, mode: 0o700 });
  const staticFiles = await loadStatic(PUBLIC_DIR);
  const users = createUserStore(path.join(cfg.dataDir, "users.json"));
  const sessions = createSessions({
    users,
    secret: await loadSessionSecret(cfg.dataDir, cfg.sessionSecret),
    ttlHours: cfg.sessionTtlHours,
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
    {
      method: "GET", path: /^\/api\/me$/, auth: "user",
      handler: ({ user }) => ({ username: user.name, role: user.role }),
    },
  ];

  const handler = createHandler({
    routes,
    staticFiles,
    trustProxy: cfg.trustProxy,
    log,
    sessionUser: (req) => sessions.verify(parseCookies(req)[COOKIE]),
  });
  return { handler, users, audit };
}
