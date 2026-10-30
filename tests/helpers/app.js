/*
 * app.js (test helper) - boot the real server on an ephemeral port with a
 * throwaway data directory, plus small fetch wrappers.
 *
 *   const t = await startApp({ TRUST_PROXY: "1" });   // extra env vars
 *   const t = await startApp({}, { ftp: { stallMs: 200 } });   // gateway overrides
 *   await t.app.users.add("alice", "password-123", "admin");
 *   const { cookie } = await t.login("alice", "password-123");
 *   const res = await t.request("/api/me", { headers: { cookie } });
 *   await t.close();
 */

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { loadConfig } from "../../server/config.js";
import { createApp } from "../../server/routes.js";

export const PASSWORD = "correct-horse-battery";

// Poll until cond() holds (e.g. "the FTP data socket is closed"), or fail.
export async function waitFor(cond, what = "condition", ms = 5000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

export async function startApp(env = {}, { ftp } = {}) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "qfe-test-"));
  const cfg = loadConfig({ DATA_DIR: dataDir, ...env });
  const app = await createApp(cfg, { log: () => {}, ftp });
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  function request(pathname, opts = {}) {
    return fetch(base + pathname, { redirect: "manual", ...opts });
  }

  async function login(username, password = PASSWORD, headers = {}) {
    const res = await request("/login", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams({ username, password }),
    });
    const setCookie = res.headers.getSetCookie()[0] || "";
    return { res, setCookie, cookie: setCookie.split(";")[0] };
  }

  async function close() {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await app.audit.flush();
    await rm(dataDir, { recursive: true, force: true });
  }

  return { app, base, dataDir, request, login, close };
}
