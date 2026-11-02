/*
 * users-api.test.js - the admins' accounts API (/api/users): roles,
 * validation, sessions ended by a new password or a deletion, the rules
 * that keep an admin, the audit trail.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { startApp, PASSWORD } from "./helpers/app.js";

describe("accounts API", () => {
  let t, admin, user;
  const json = (cookie, method, body) => ({
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const me = async (cookie) => (await t.request("/api/me", { headers: { cookie } })).status;
  const list = async (cookie = admin) => (await (await t.request("/api/users", { headers: { cookie } })).json()).users;

  before(async () => {
    t = await startApp();
    await t.app.users.add("alice", PASSWORD, "admin");
    await t.app.users.add("bob", PASSWORD, "user");
    admin = (await t.login("alice")).cookie;
    user = (await t.login("bob")).cookie;
  });
  after(() => t.close());

  test("admins only", async () => {
    assert.equal((await t.request("/api/users", { headers: { cookie: user } })).status, 403);
    assert.equal((await t.request("/api/users", json(user, "POST", { name: "x1", password: "long-enough-1" }))).status, 403);
    assert.equal((await t.request("/api/users/bob", json(user, "PUT", { role: "admin" }))).status, 403);
    assert.equal((await t.request("/api/users/alice", json(user, "DELETE"))).status, 403);
    assert.deepEqual(await list(), [{ name: "alice", role: "admin" }, { name: "bob", role: "user" }], "no hashes");
  });

  test("create an account, which can then sign in", async () => {
    const res = await t.request("/api/users", json(admin, "POST", { name: "Carol", role: "user", password: "carol-password-1" }));
    assert.equal(res.status, 201);
    assert.deepEqual(await res.json(), { name: "carol", role: "user" });
    assert.equal((await t.login("carol", "carol-password-1")).res.headers.get("location"), "/");
    const again = await t.request("/api/users", json(admin, "POST", { name: "carol", password: "carol-password-2" }));
    assert.equal(again.status, 409);
    assert.match((await again.json()).error, /already exists/);
  });

  test("bad names, short passwords and unknown roles are refused, in the reader's language", async () => {
    for (const body of [
      { name: "bad name", password: "long-enough-1" },
      { name: "", password: "long-enough-1" },
      { name: "dave", password: "short" },
      { name: "dave", password: "long-enough-1", role: "root" },
      { name: "dave" },
    ]) {
      assert.equal((await t.request("/api/users", json(admin, "POST", body))).status, 400, JSON.stringify(body));
    }
    const res = await t.request("/api/users", json(`${admin}; qfe_lang=fr`, "POST", { name: "dave", password: "court" }));
    assert.equal((await res.json()).error, "Le mot de passe doit faire au moins 10 caractères");
    assert.equal((await t.request("/api/users/nobody", json(admin, "PUT", { role: "admin" }))).status, 404);
  });

  test("a new role; nobody removes their own admin role", async () => {
    const res = await t.request("/api/users/carol", json(admin, "PUT", { role: "admin" }));
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { name: "carol", role: "admin" });
    assert.equal((await t.request("/api/users/alice", json(admin, "PUT", { role: "user" }))).status, 400);
    assert.equal((await list()).find((u) => u.name === "alice").role, "admin");
    await t.request("/api/users/carol", json(admin, "PUT", { role: "user" }));
  });

  test("a new password ends the account's sessions; an admin changing their own stays signed in", async () => {
    const carol = (await t.login("carol", "carol-password-1")).cookie;
    assert.equal(await me(carol), 200);
    assert.equal((await t.request("/api/users/carol", json(admin, "PUT", { password: "carol-password-2" }))).status, 200);
    assert.equal(await me(carol), 401, "her session ended");
    assert.equal((await t.login("carol", "carol-password-1")).res.headers.get("location"), "/login?error=invalid");
    assert.equal((await t.login("carol", "carol-password-2")).res.headers.get("location"), "/");

    const res = await t.request("/api/users/alice", json(admin, "PUT", { password: "alice-password-2" }));
    assert.equal(res.status, 200);
    const fresh = res.headers.getSetCookie()[0].split(";")[0];
    assert.equal(await me(admin), 401, "the old session ended");
    assert.equal(await me(fresh), 200, "the new cookie keeps her in");
    admin = fresh;
  });

  test("delete an account: its sessions end; nobody deletes their own", async () => {
    const carol = (await t.login("carol", "carol-password-2")).cookie;
    assert.equal((await t.request("/api/users/carol", json(admin, "DELETE"))).status, 204);
    assert.equal(await me(carol), 401);
    assert.equal((await t.request("/api/users/carol", json(admin, "DELETE"))).status, 404);
    assert.equal((await t.request("/api/users/alice", json(admin, "DELETE"))).status, 400);
    assert.deepEqual((await list()).map((u) => u.name), ["alice", "bob"]);
  });

  test("every change is in the audit trail, with who made it", async () => {
    await t.app.audit.flush();
    const events = (await readFile(path.join(t.dataDir, "audit.jsonl"), "utf8")).trim().split("\n").map(JSON.parse)
      .filter((e) => e.event.startsWith("user_"));
    assert.deepEqual(events.map((e) => [e.event, e.user, e.account]), [
      ["user_create", "alice", "carol"],
      ["user_update", "alice", "carol"],
      ["user_update", "alice", "carol"],
      ["user_update", "alice", "carol"],
      ["user_update", "alice", "alice"],
      ["user_delete", "alice", "carol"],
    ]);
    assert.ok(events.every((e) => !JSON.stringify(e).includes("password-")), "no password in the audit trail");
  });
});
