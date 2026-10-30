/*
 * http.test.js - the server over real HTTP: pages, static files, sign-in,
 * sessions, throttling, security headers and request hygiene.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { startApp, PASSWORD } from "./helpers/app.js";

describe("pages, static files and headers", () => {
  let t;
  before(async () => { t = await startApp(); });
  after(() => t.close());

  test("GET /healthz answers without a session", async () => {
    const res = await t.request("/healthz");
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "ok\n");
  });

  test("/ redirects to /login when signed out; /login serves the form", async () => {
    const home = await t.request("/");
    assert.equal(home.status, 302);
    assert.equal(home.headers.get("location"), "/login");
    const login = await t.request("/login");
    assert.equal(login.status, 200);
    assert.match(login.headers.get("content-type"), /^text\/html/);
    assert.match(await login.text(), /<form method="post" action="\/login">/);
  });

  test("every response carries the security headers", async () => {
    for (const pathname of ["/login", "/styles.css", "/api/me", "/nope"]) {
      const res = await t.request(pathname);
      const csp = res.headers.get("content-security-policy");
      assert.match(csp, /default-src 'self'/, pathname);
      assert.match(csp, /frame-ancestors 'none'/, pathname);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff", pathname);
      assert.equal(res.headers.get("referrer-policy"), "same-origin", pathname);
      assert.equal(res.headers.get("strict-transport-security"), null, pathname);   // plain http
    }
  });

  test("static assets come from memory, with ETag revalidation", async () => {
    const css = await t.request("/styles.css");
    assert.equal(css.status, 200);
    assert.match(css.headers.get("content-type"), /^text\/css/);
    assert.equal(css.headers.get("cache-control"), "no-cache");
    const etag = css.headers.get("etag");
    const again = await t.request("/styles.css", { headers: { "if-none-match": etag } });
    assert.equal(again.status, 304);
    const onDisk = await readFile(path.join(import.meta.dirname, "..", "public", "styles.css"));
    assert.equal(Buffer.compare(Buffer.from(await css.arrayBuffer()), onDisk), 0);
  });

  test("HTML pages are only reachable through their routes; nothing maps onto the filesystem", async () => {
    for (const pathname of ["/index.html", "/login.html", "/../server/index.js", "/%2e%2e/package.json", "/server/http.js"]) {
      assert.equal((await t.request(pathname)).status, 404, pathname);
    }
  });

  test("a browser tab gets a readable, escaped error page instead of JSON", async () => {
    const res = await t.request("/api/nope<script>", { headers: { accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /^text\/html/);
    const html = await res.text();
    assert.match(html, /Not found/);
    assert.doesNotMatch(html, /<script>/);
    // Scripts (fetch, <img>, <video>) keep getting JSON.
    assert.match((await t.request("/api/nope")).headers.get("content-type"), /^application\/json/);
  });

  test("unknown methods on known paths get 405; odd request targets get 400", async () => {
    assert.equal((await t.request("/api/me", { method: "DELETE" })).status, 405);
    const raw = await new Promise((resolve, reject) => {
      const sock = net.connect(new URL(t.base).port, "127.0.0.1", () => {
        sock.write("OPTIONS * HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
      });
      let data = "";
      sock.on("data", (d) => { data += d; }).on("end", () => resolve(data)).on("error", reject);
    });
    assert.match(raw, /^HTTP\/1\.1 400/);
    // ... and the server is still alive afterwards.
    assert.equal((await t.request("/healthz")).status, 200);
  });
});

describe("sign-in and sessions", () => {
  let t;
  before(async () => {
    t = await startApp();
    await t.app.users.add("alice", PASSWORD, "admin");
    await t.app.users.add("bob", PASSWORD);
  });
  after(() => t.close());

  test("the API refuses anonymous requests with 401 JSON", async () => {
    const res = await t.request("/api/me");
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "Sign-in required" });
    assert.equal(res.headers.get("cache-control"), "no-store");
  });

  test("a wrong password bounces back with no cookie", async () => {
    const { res, setCookie } = await t.login("alice", "wrong-password!");
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login?error=invalid");
    assert.equal(setCookie, "");
  });

  test("a good sign-in sets an HttpOnly, SameSite=Lax session cookie", async () => {
    const { res, setCookie, cookie } = await t.login("ALICE");
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/");
    assert.match(setCookie, /^qfe_session=[^;]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=43200$/);
    const me = await (await t.request("/api/me", { headers: { cookie } })).json();
    assert.equal(me.username, "alice");
    assert.equal(me.role, "admin");
    const home = await t.request("/", { headers: { cookie } });
    assert.equal(home.status, 200);
    assert.equal((await t.request("/login", { headers: { cookie } })).headers.get("location"), "/");
  });

  test("sign-out clears the cookie", async () => {
    const { cookie } = await t.login("bob");
    const res = await t.request("/logout", { method: "POST", headers: { cookie } });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get("location"), "/login");
    assert.match(res.headers.getSetCookie()[0], /^qfe_session=; .*Max-Age=0/);
  });

  test("removing an account ends its session immediately", async () => {
    await t.app.users.add("carol", PASSWORD);
    const { cookie } = await t.login("carol");
    assert.equal((await t.request("/api/me", { headers: { cookie } })).status, 200);
    await t.app.users.remove("carol");
    assert.equal((await t.request("/api/me", { headers: { cookie } })).status, 401);
  });

  test("cross-origin form posts are refused; same-origin ones pass", async () => {
    const foreign = await t.login("alice", PASSWORD, { origin: "https://evil.example.com" });
    assert.equal(foreign.res.status, 403);
    assert.equal(foreign.setCookie, "");
    const nullOrigin = await t.login("alice", PASSWORD, { origin: "null" });
    assert.equal(nullOrigin.res.status, 403);
    const same = await t.login("alice", PASSWORD, { origin: t.base });
    assert.equal(same.res.status, 303);
    assert.notEqual(same.setCookie, "");
  });

  test("the audit trail records sign-ins, failures and sign-outs", async () => {
    await t.app.audit.flush();
    const lines = (await readFile(path.join(t.dataDir, "audit.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    const events = lines.map((l) => `${l.event}:${l.user}`);
    assert.ok(events.includes("login_failed:alice"));
    assert.ok(events.includes("login:alice"));
    assert.ok(events.includes("logout:bob"));
    assert.ok(lines.every((l) => l.time && l.ip));
  });
});

describe("throttling and proxies", () => {
  test("ten failures lock the account out, even with the right password", async () => {
    const t = await startApp();
    try {
      await t.app.users.add("alice", PASSWORD);
      for (let i = 0; i < 10; i++) await t.login("alice", "wrong-password!");
      const { res, setCookie } = await t.login("alice");
      assert.equal(res.headers.get("location"), "/login?error=rate");
      assert.equal(setCookie, "");
    } finally {
      await t.close();
    }
  });

  test("behind a trusted proxy: Secure cookie, HSTS, and the forwarded client IP", async () => {
    const t = await startApp({ TRUST_PROXY: "1" });
    try {
      await t.app.users.add("alice", PASSWORD);
      const proxied = { "x-forwarded-proto": "https", "x-forwarded-for": "198.51.100.7, 203.0.113.9" };
      const { res, setCookie } = await t.login("alice", PASSWORD, proxied);
      assert.match(setCookie, /; Secure$/);
      assert.equal(res.headers.get("strict-transport-security"), "max-age=31536000");
      await t.app.audit.flush();
      const last = (await readFile(path.join(t.dataDir, "audit.jsonl"), "utf8")).trim().split("\n").pop();
      assert.equal(JSON.parse(last).ip, "203.0.113.9");   // rightmost hop: the proxy's view
    } finally {
      await t.close();
    }
  });

  test("forwarded headers are ignored unless TRUST_PROXY is set", async () => {
    const t = await startApp();
    try {
      await t.app.users.add("alice", PASSWORD);
      const { setCookie } = await t.login("alice", PASSWORD, { "x-forwarded-proto": "https" });
      assert.doesNotMatch(setCookie, /Secure/);
    } finally {
      await t.close();
    }
  });
});
