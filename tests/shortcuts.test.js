/*
 * shortcuts.test.js - the shortcut API over HTTP (roles, CSRF rules, no
 * password leaks, audit trail) and the CLI import of legacy HTA files.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { startApp, PASSWORD } from "./helpers/app.js";

const SECRET = "ftp-pa55word";
const NVR = { label: "main-nvr Main office", host: "192.0.2.10", port: 2121, username: "main-nvr", password: SECRET };

describe("shortcut API", () => {
  let t, admin, user;
  const json = (cookie, method, body) => ({
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  before(async () => {
    t = await startApp({ DEFAULT_FTP_HOST: "192.0.2.1", DEFAULT_FTP_PORT: "2121" });
    await t.app.users.add("alice", PASSWORD, "admin");
    await t.app.users.add("bob", PASSWORD, "user");
    admin = (await t.login("alice")).cookie;
    user = (await t.login("bob")).cookie;
  });
  after(() => t.close());

  test("only admins may create, edit or delete", async () => {
    assert.equal((await t.request("/api/shortcuts", json(user, "POST", NVR))).status, 403);
    const created = await t.request("/api/shortcuts", json(admin, "POST", NVR));
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { id: "main-nvr" });
    assert.equal((await t.request("/api/shortcuts/main-nvr", json(user, "PUT", NVR))).status, 403);
    assert.equal((await t.request("/api/shortcuts/main-nvr", json(user, "DELETE"))).status, 403);
  });

  test("users see id + label only; admins also see host, port, username; nobody sees a password", async () => {
    const forUser = await (await t.request("/api/shortcuts", { headers: { cookie: user } })).text();
    assert.deepEqual(JSON.parse(forUser), { shortcuts: [{ id: "main-nvr", label: "main-nvr Main office" }] });
    const forAdmin = await (await t.request("/api/shortcuts", { headers: { cookie: admin } })).text();
    assert.deepEqual(JSON.parse(forAdmin).shortcuts[0], {
      id: "main-nvr", label: "main-nvr Main office", host: "192.0.2.10", port: 2121, username: "main-nvr",
    });
    for (const body of [forUser, forAdmin]) assert.ok(!body.includes(SECRET));
  });

  test("/api/me gives admins the form defaults, and users nothing more", async () => {
    assert.deepEqual(await (await t.request("/api/me", { headers: { cookie: admin } })).json(),
      { username: "alice", role: "admin", defaults: { host: "192.0.2.1", port: 2121 } });
    assert.deepEqual(await (await t.request("/api/me", { headers: { cookie: user } })).json(),
      { username: "bob", role: "user" });
  });

  test("errors come back as JSON with the right status", async () => {
    const dup = await t.request("/api/shortcuts", json(admin, "POST", NVR));
    assert.equal(dup.status, 409);
    assert.match((await dup.json()).error, /already exists/);
    const invalid = await t.request("/api/shortcuts", json(admin, "POST", { ...NVR, username: "x\r\nDELE y" }));
    assert.equal(invalid.status, 400);
    assert.equal((await t.request("/api/shortcuts", json(admin, "POST", ["array"]))).status, 400);
    assert.equal((await t.request("/api/shortcuts/missing", json(admin, "PUT", NVR))).status, 404);
    assert.equal((await t.request("/api/shortcuts/a%2Fb", json(admin, "DELETE"))).status, 404);
  });

  test("API writes must be same-origin JSON", async () => {
    const form = await t.request("/api/shortcuts", {
      method: "POST", headers: { cookie: admin, "content-type": "application/x-www-form-urlencoded" }, body: "username=x&host=y",
    });
    assert.equal(form.status, 415);
    const foreign = await t.request("/api/shortcuts", {
      ...json(admin, "POST", { ...NVR, username: "other" }),
      headers: { cookie: admin, "content-type": "application/json", origin: "https://evil.example.com" },
    });
    assert.equal(foreign.status, 403);
    assert.equal((await t.request("/api/shortcuts", json("", "POST", NVR))).status, 401);
  });

  test("rename, then delete; host changes need the password", async () => {
    const moved = await t.request("/api/shortcuts/main-nvr", json(admin, "PUT", { ...NVR, host: "203.0.113.4", password: "" }));
    assert.equal(moved.status, 400);
    const renamed = await t.request("/api/shortcuts/main-nvr", json(admin, "PUT", { ...NVR, username: "nvr-2", password: "" }));
    assert.deepEqual(await renamed.json(), { id: "nvr-2" });
    const del = await t.request("/api/shortcuts/nvr-2", json(admin, "DELETE"));
    assert.equal(del.status, 204);
    assert.equal((await t.request("/api/shortcuts/nvr-2", json(admin, "DELETE"))).status, 404);
  });

  test("the audit trail records shortcut changes, never passwords", async () => {
    await t.app.audit.flush();
    const log = await readFile(path.join(t.dataDir, "audit.jsonl"), "utf8");
    const events = log.trim().split("\n").map(JSON.parse).filter((e) => e.event.startsWith("shortcut_"));
    assert.deepEqual(events.map((e) => [e.event, e.user, e.id]), [
      ["shortcut_create", "alice", "main-nvr"],
      ["shortcut_update", "alice", "main-nvr"],
      ["shortcut_delete", "alice", "nvr-2"],
    ]);
    assert.equal(events[1].renamedTo, "nvr-2");
    assert.ok(!log.includes(SECRET));
  });
});

describe("cli import (legacy HTA shortcut files)", () => {
  let tmp, dataDir, srcDir;
  const cli = (args, input) => execFileSync(process.execPath, ["server/cli.js", ...args], {
    cwd: path.join(import.meta.dirname, ".."),
    env: { ...process.env, DATA_DIR: dataDir },
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });

  before(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "qfe-import-"));
    dataDir = path.join(tmp, "data");
    srcDir = path.join(tmp, "legacy-shortcuts");
    await mkdir(srcDir);
    // Written exactly as the HTA writes them: pretty JSON, sometimes a BOM.
    await writeFile(path.join(srcDir, "main-nvr.json"), JSON.stringify(NVR, null, 2));
    await writeFile(path.join(srcDir, "back-office.json"), "﻿" + JSON.stringify({
      label: "back-office", host: "192.0.2.20", port: 21, username: "back-office", password: "back-office",
    }, null, 2));
    await writeFile(path.join(srcDir, "notes.txt"), "ignored: not a .json file");
  });
  after(() => rm(tmp, { recursive: true, force: true }));

  test("imports a directory, then skips what already exists", async () => {
    assert.match(cli(["import", srcDir]), /Imported 2, replaced 0, skipped 0, failed 0\./);
    assert.deepEqual((await readdir(path.join(dataDir, "shortcuts"))).sort(), ["back-office.json", "main-nvr.json"]);
    assert.match(cli(["import", srcDir]), /Imported 0, replaced 0, skipped 2, failed 0\./);
  });

  test("imports concatenated JSON from stdin, with --replace", () => {
    const piped = JSON.stringify({ ...NVR, label: "replaced label" }) + "\n" + JSON.stringify({ username: "new-site", host: "192.0.2.30" });
    assert.match(cli(["import", "-", "--replace"], piped), /Imported 1, replaced 1, skipped 0, failed 0\./);
  });

  test("reports invalid records and exits non-zero", async () => {
    await writeFile(path.join(srcDir, "bad.json"), "{ nope");
    assert.throws(() => cli(["import", srcDir]), (err) => {
      assert.equal(err.status, 1);
      assert.match(err.stdout, /bad\.json: not valid JSON/);
      assert.match(err.stdout, /failed 1\./);
      return true;
    });
  });
});
