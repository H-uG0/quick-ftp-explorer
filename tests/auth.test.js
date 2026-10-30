/*
 * auth.test.js - password hashing, the users.json store, session tokens and
 * login throttling (server/auth.js), without an HTTP server.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, readFile, writeFile, readdir } from "node:fs/promises";
import {
  hashPassword, verifyPassword, createUserStore, createSessions, createLimiter, loadSessionSecret,
} from "../server/auth.js";

const PW = "correct-horse-battery";

describe("password hashing", () => {
  test("round-trips and rejects a wrong password", async () => {
    const hash = await hashPassword(PW);
    assert.match(hash, /^scrypt\$32768\$8\$1\$/);
    assert.equal(await verifyPassword(PW, hash), true);
    assert.equal(await verifyPassword(PW + "x", hash), false);
  });

  test("salts every hash", async () => {
    assert.notEqual(await hashPassword(PW), await hashPassword(PW));
  });

  test("malformed or truncated hashes never verify", async () => {
    for (const bad of ["", "nonsense", "scrypt$32768$8$1$c2FsdA$", "scrypt$32768$8$1$c2FsdA$QQ", "bcrypt$x$y"]) {
      assert.equal(await verifyPassword("", bad), false, bad);
    }
  });
});

describe("user store", () => {
  let dir, users;
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "qfe-auth-"));
    users = createUserStore(path.join(dir, "users.json"));
  });
  after(() => rm(dir, { recursive: true, force: true }));

  test("adds, lists and authenticates (names are case-insensitive)", async () => {
    assert.equal(await users.add("Alice", PW, "admin"), "alice");
    await users.add("bob", PW);
    assert.deepEqual(await users.list(), [{ name: "alice", role: "admin" }, { name: "bob", role: "user" }]);
    assert.equal((await users.authenticate("ALICE", PW)).name, "alice");
    assert.equal(await users.authenticate("alice", "wrong-password"), null);
    assert.equal(await users.authenticate("nobody", PW), null);
  });

  test("validates names, passwords, roles and duplicates", async () => {
    await assert.rejects(users.add("alice", PW), /already exists/);
    await assert.rejects(users.add("bad name", PW), /Usernames are/);
    await assert.rejects(users.add("__proto__", PW), /Usernames are/);
    await assert.rejects(users.add("carol", "short"), /at least 10/);
    await assert.rejects(users.add("carol", PW, "root"), /Role must be/);
    await assert.rejects(users.remove("nobody"), /No account/);
  });

  test("prototype keys are never mistaken for accounts", async () => {
    assert.equal(await users.get("constructor"), null);
    assert.equal(await users.authenticate("constructor", PW), null);
  });

  test("changes role and password, removes, and never leaves temp files", async () => {
    await users.setRole("bob", "admin");
    assert.equal((await users.get("bob")).role, "admin");
    await users.setPassword("bob", "another-long-password");
    assert.equal(await users.authenticate("bob", PW), null);
    assert.ok(await users.authenticate("bob", "another-long-password"));
    await users.remove("bob");
    assert.equal(await users.get("bob"), null);
    assert.deepEqual((await readdir(dir)).filter((f) => f.endsWith(".tmp")), []);
  });

  test("picks up edits made on disk by another process", async () => {
    const file = path.join(dir, "users.json");
    const data = JSON.parse(await readFile(file, "utf8"));
    data.users.dave = { role: "user", hash: await hashPassword(PW) };
    await writeFile(file, JSON.stringify(data));
    assert.equal((await users.get("dave")).role, "user");
  });
});

describe("session tokens", () => {
  let dir, users, clock;
  const later = (ms) => { clock += ms; };
  before(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "qfe-sess-"));
    users = createUserStore(path.join(dir, "users.json"));
    await users.add("alice", PW, "admin");
  });
  after(() => rm(dir, { recursive: true, force: true }));

  function sessions(secret = "s".repeat(32)) {
    clock = 1_000_000;
    return createSessions({ users, secret, ttlHours: 12, now: () => clock });
  }

  test("a fresh token verifies to the user and current role", async () => {
    const s = sessions();
    const token = s.issue(await users.get("alice"));
    assert.deepEqual(await s.verify(token), { name: "alice", role: "admin" });
    await users.setRole("alice", "user");
    assert.deepEqual(await s.verify(token), { name: "alice", role: "user" });
    await users.setRole("alice", "admin");
  });

  test("tampered, foreign, garbage and expired tokens are rejected", async () => {
    const s = sessions();
    const token = s.issue(await users.get("alice"));
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ u: "alice", exp: 9e15, v: "x" })).toString("base64url");
    assert.equal(await s.verify(`${forged}.${sig}`), null);
    assert.equal(await s.verify(`${payload}.${sig[0] === "A" ? "B" : "A"}${sig.slice(1)}`), null);
    assert.equal(await s.verify(`${token}.extra`), null);
    assert.equal(await sessions("t".repeat(32)).verify(token), null);
    for (const junk of [undefined, "", ".", "a.b", "%%%.%%%"]) assert.equal(await s.verify(junk), null);
    later(12 * 3600 * 1000);
    assert.equal(await s.verify(token), null);
  });

  test("a password change or removal ends existing sessions", async () => {
    const s = sessions();
    await users.add("erin", PW);
    const token = s.issue(await users.get("erin"));
    assert.ok(await s.verify(token));
    await users.setPassword("erin", "a-brand-new-password");
    assert.equal(await s.verify(token), null);
    const fresh = s.issue(await users.get("erin"));
    await users.remove("erin");
    assert.equal(await s.verify(fresh), null);
  });
});

describe("session secret", () => {
  test("prefers SESSION_SECRET, else generates one file once", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "qfe-secret-"));
    try {
      assert.equal(await loadSessionSecret(dir, "c".repeat(40)), "c".repeat(40));
      const generated = await loadSessionSecret(dir, "");
      assert.ok(generated.length >= 32);
      assert.equal(await loadSessionSecret(dir, ""), generated);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("login limiter", () => {
  test("blocks after max failures until the window passes; reset clears", () => {
    let clock = 0;
    const limiter = createLimiter({ max: 3, windowMs: 1000, now: () => clock });
    for (let i = 0; i < 3; i++) {
      assert.equal(limiter.blocked("k"), false);
      limiter.fail("k");
    }
    assert.equal(limiter.blocked("k"), true);
    assert.equal(limiter.blocked("other"), false);
    clock = 1000;
    assert.equal(limiter.blocked("k"), false);
    limiter.fail("k"); limiter.fail("k"); limiter.fail("k");
    limiter.reset("k");
    assert.equal(limiter.blocked("k"), false);
  });
});
