/*
 * store.test.js - the shortcut store (server/store.js). Ports the legacy
 * test-config.hta assertions (sanitizeId, UTF-8 round trip, CRUD) and covers
 * what the web version adds: 409s, safe renames, password rules, validation.
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { createShortcutStore, sanitizeId, validateShortcut } from "../server/store.js";
import { splitJsonObjects } from "../server/files.js";

const NVR = { label: "main-nvr Main office (éàü)", host: "192.0.2.10", port: 2121, username: "main-nvr", password: "s3cret" };

let dir, store;
beforeEach(async () => {
  dir = path.join(await mkdtemp(path.join(os.tmpdir(), "qfe-store-")), "shortcuts");
  store = createShortcutStore(dir);
});
afterEach(() => rm(path.dirname(dir), { recursive: true, force: true }));

const files = async () => (await readdir(dir)).sort();

describe("sanitizeId (same rule as the HTA)", () => {
  test("keeps [A-Za-z0-9._-] and replaces everything else", () => {
    assert.equal(sanitizeId("abc_123"), "abc_123");
    assert.equal(sanitizeId("a/b\\c"), "a_b_c");
    assert.equal(sanitizeId("site 12.é"), "site_12._");
  });
});

describe("CRUD", () => {
  test("create + list + get round-trip, UTF-8 intact, no password in list()", async () => {
    assert.equal(await store.create(NVR), "main-nvr");
    const [listed] = await store.list();
    assert.deepEqual(listed, { id: "main-nvr", label: NVR.label, host: NVR.host, port: 2121, username: "main-nvr" });
    assert.equal((await store.get("main-nvr")).password, "s3cret");
    const onDisk = JSON.parse(await readFile(path.join(dir, "main-nvr.json"), "utf8"));
    assert.deepEqual(onDisk, { label: NVR.label, host: NVR.host, port: 2121, username: "main-nvr", password: "s3cret" });
  });

  test("defaults: password = username, label = username, port 21", async () => {
    await store.create({ username: "back-office", host: "192.0.2.20" });
    assert.deepEqual(await store.get("back-office"), {
      id: "back-office", label: "back-office", host: "192.0.2.20", port: 21, username: "back-office", password: "back-office",
    });
  });

  test("list() sorts by label, case-insensitively", async () => {
    for (const label of ["beta", "Alpha", "gamma"]) await store.create({ username: label.toLowerCase(), label, host: "h" });
    assert.deepEqual((await store.list()).map((s) => s.label), ["Alpha", "beta", "gamma"]);
  });

  test("a duplicate username is a 409, never a silent overwrite (the HTA overwrote)", async () => {
    await store.create(NVR);
    await assert.rejects(store.create({ ...NVR, password: "other" }), { status: 409 });
    assert.equal((await store.get("main-nvr")).password, "s3cret");
  });

  test("update in place; a blank password keeps the stored one", async () => {
    await store.create(NVR);
    assert.equal(await store.update("main-nvr", { ...NVR, label: "renamed label", password: "" }), "main-nvr");
    const sc = await store.get("main-nvr");
    assert.equal(sc.label, "renamed label");
    assert.equal(sc.password, "s3cret");
  });

  test("changing host or port requires the password again", async () => {
    await store.create(NVR);
    await assert.rejects(store.update("main-nvr", { ...NVR, host: "203.0.113.5", password: "" }), { status: 400, message: /Re-enter/ });
    await assert.rejects(store.update("main-nvr", { ...NVR, port: 21, password: "" }), { status: 400 });
    assert.equal((await store.get("main-nvr")).host, NVR.host);
    await store.update("main-nvr", { ...NVR, host: "203.0.113.5", password: "new-pass" });
    assert.equal((await store.get("main-nvr")).password, "new-pass");
  });

  test("renaming writes the new file and removes the old one", async () => {
    await store.create(NVR);
    assert.equal(await store.update("main-nvr", { ...NVR, username: "nvr-2" }), "nvr-2");
    assert.deepEqual(await files(), ["nvr-2.json"]);
    assert.equal((await store.get("nvr-2")).password, "s3cret");
  });

  test("renaming onto another shortcut is a 409 and changes nothing", async () => {
    await store.create(NVR);
    await store.create({ username: "back-office", host: "192.0.2.20" });
    await assert.rejects(store.update("main-nvr", { ...NVR, username: "back-office" }), { status: 409 });
    assert.deepEqual(await files(), ["back-office.json", "main-nvr.json"]);
  });

  test("remove; missing ids are 404s; odd ids never touch the filesystem", async () => {
    await store.create(NVR);
    await store.remove("main-nvr");
    assert.deepEqual(await store.list(), []);
    await assert.rejects(store.remove("main-nvr"), { status: 404 });
    await assert.rejects(store.update("nope", NVR), { status: 404 });
    for (const id of ["../users", "a/b", "", "x y"]) assert.equal(await store.get(id), null);
  });

  test("leaves no temp files; skips malformed files; reads HTA files with a BOM", async () => {
    await store.create(NVR);
    await writeFile(path.join(dir, "broken.json"), "{ not json");
    await writeFile(path.join(dir, "legacy.json"), "﻿" + JSON.stringify({ label: "legacy", host: "h", port: 21, username: "legacy", password: "legacy" }, null, 2));
    assert.deepEqual((await store.list()).map((s) => s.id), ["legacy", "main-nvr"]);
    assert.deepEqual((await files()).filter((f) => f.endsWith(".tmp")), []);
  });

  test("an empty or missing directory lists as empty", async () => {
    assert.deepEqual(await store.list(), []);
    await mkdir(dir, { recursive: true });
    assert.deepEqual(await store.list(), []);
  });
});

describe("validation", () => {
  const bad = (overrides) => () => validateShortcut({ ...NVR, ...overrides });

  test("required fields, ports, lengths", () => {
    assert.throws(bad({ username: "  " }), { status: 400, message: /Username is required/ });
    assert.throws(bad({ host: "" }), { status: 400, message: /Host is required/ });
    for (const port of [0, 65536, "abc", 21.5]) assert.throws(bad({ port }), { status: 400 }, String(port));
    assert.throws(bad({ label: "x".repeat(201) }), { status: 400 });
    assert.throws(bad({ password: "x".repeat(257) }), { status: 400 });
    assert.throws(() => validateShortcut(null), { status: 400 });
    assert.throws(() => validateShortcut(["a"]), { status: 400 });
  });

  test("control characters are refused everywhere (FTP command injection)", () => {
    for (const field of ["username", "host", "label", "password"]) {
      assert.throws(bad({ [field]: "a\r\nDELE x" }), { status: 400 }, field);
      assert.throws(bad({ [field]: "a\u0000b" }), { status: 400 }, field);
    }
  });

  test("hosts must look like a hostname or an IP address", () => {
    for (const host of ["-x", "a b", "a/b", "a@b", "ftp://x"]) assert.throws(bad({ host }), { status: 400 }, host);
    for (const host of ["ftp.example.com", "192.0.2.10", "2001:db8::1", "nvr-1"]) assert.ok(validateShortcut({ ...NVR, host }));
  });

  test("FTP_ALLOWED_HOSTS restricts hosts, case-insensitively", () => {
    const opts = { allowedHosts: ["ftp.example.com"] };
    assert.throws(() => validateShortcut({ ...NVR, host: "192.0.2.99" }, opts), { status: 400, message: /FTP_ALLOWED_HOSTS/ });
    assert.ok(validateShortcut({ ...NVR, host: "FTP.Example.com" }, opts));
  });

  test("passwords are kept as typed, spaces included", () => {
    assert.equal(validateShortcut({ ...NVR, password: " pass word " }).password, " pass word ");
  });
});

describe("splitJsonObjects (for `cat *.json | cli import -`)", () => {
  test("cuts concatenated objects, BOMs, braces inside strings, and arrays", () => {
    const a = JSON.stringify({ label: "a {not} \"brace\"", username: "a" }, null, 2);
    const b = JSON.stringify({ username: "b", nested: { x: 1 } });
    assert.deepEqual(splitJsonObjects(`﻿${a}\n﻿${b}`).map((s) => JSON.parse(s).username), ["a", "b"]);
    assert.deepEqual(splitJsonObjects(`[${a},${b}]`).length, 2);
    assert.deepEqual(splitJsonObjects("no objects here"), []);
  });
});
