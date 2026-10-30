/*
 * files-api.test.js - browsing over HTTP: /api/shortcuts/:id/list and
 * /file against a fake FTP server. Exact bytes, ranges (video seeking),
 * HEAD, which types render vs. download, and that abandoned, paused or
 * satisfied transfers close their FTP connection.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { startApp, PASSWORD, waitFor } from "./helpers/app.js";
import { startFakeFtp, fixtureTree, patternBytes } from "./helpers/fake-ftp-server.js";

const BIG = 16 * 1024 * 1024;   // larger than any socket buffer, so backpressure is real
const FTP_SECRET = "zz-ftp-secret-zz";

describe("listing and file API", () => {
  let t, ftp, slim, user, admin;

  before(async () => {
    ftp = await startFakeFtp({
      users: { demo: FTP_SECRET },
      tree: { ...fixtureTree(), "big.bin": patternBytes(BIG) },
    });
    slim = await startFakeFtp({ size: false, users: { slim: FTP_SECRET } });   // no SIZE: no ranges
    t = await startApp({}, { ftp: { stallMs: 300 } });
    await t.app.users.add("alice", PASSWORD, "admin");
    await t.app.users.add("bob", PASSWORD);
    admin = (await t.login("alice")).cookie;
    user = (await t.login("bob")).cookie;
    await t.app.shortcuts.create({ username: "demo", host: "127.0.0.1", port: ftp.port, password: FTP_SECRET });
    await t.app.shortcuts.create({ username: "slim", host: "127.0.0.1", port: slim.port, password: FTP_SECRET });
  });
  after(async () => {
    await t.close();
    await ftp.close();
    await slim.close();
  });

  const q = (p) => `path=${encodeURIComponent(p)}`;
  const list = (p, cookie = user, id = "demo") => t.request(`/api/shortcuts/${id}/list?${q(p)}`, { headers: { cookie } });
  const file = (p, headers = {}, { extra = "", id = "demo", method = "GET" } = {}) =>
    t.request(`/api/shortcuts/${id}/file?${q(p)}${extra}`, { method, headers: { cookie: user, ...headers } });
  const bytes = async (res) => Buffer.from(await res.arrayBuffer());

  test("folder listings for signed-in users", async () => {
    const res = await list("/Images");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.path, "/Images");
    assert.deepEqual(body.entries.map((e) => e.name).sort(), ["2026", "front door.png"]);
    assert.deepEqual((await (await list("//Images//2026/")).json()).path, "/Images/2026");
  });

  test("listing errors: 401 signed out, 404 unknown shortcut or folder, 400 bad path", async () => {
    assert.equal((await list("/", "")).status, 401);
    assert.equal((await list("/", user, "nope")).status, 404);
    assert.equal((await list("/missing")).status, 404);
    assert.equal((await list("/../etc")).status, 400);
    assert.equal((await list("relative")).status, 400);
  });

  test("a whole image: inline, exact bytes, sandboxed, UTF-8 file name", async () => {
    const res = await file("/photo été.jpg");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "image/jpeg");
    assert.equal(res.headers.get("content-length"), "1024");
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(res.headers.get("content-disposition"),
      `inline; filename="photo _t_.jpg"; filename*=UTF-8''photo%20%C3%A9t%C3%A9.jpg`);
    assert.match(res.headers.get("content-security-policy"), /sandbox/);
    assert.deepEqual(await bytes(res), patternBytes(1024));
  });

  test("byte ranges, for video seeking", async () => {
    const all = patternBytes(22509);
    const first = await file("/file-with-no-spaces.mp4", { range: "bytes=2-5" });
    assert.equal(first.status, 206);
    assert.equal(first.headers.get("content-range"), "bytes 2-5/22509");
    assert.equal(first.headers.get("content-length"), "4");
    assert.deepEqual(await bytes(first), all.subarray(2, 6));

    const tail = await file("/file-with-no-spaces.mp4", { range: "bytes=-3" });
    assert.deepEqual(await bytes(tail), all.subarray(22506));

    const rest = await file("/file-with-no-spaces.mp4", { range: "bytes=22000-" });
    assert.equal(rest.headers.get("content-range"), "bytes 22000-22508/22509");
    assert.deepEqual(await bytes(rest), all.subarray(22000));

    const beyond = await file("/file-with-no-spaces.mp4", { range: "bytes=999999-" });
    assert.equal(beyond.status, 416);
    assert.equal(beyond.headers.get("content-range"), "bytes */22509");
  });

  test("HEAD answers with headers only and never starts a transfer", async () => {
    const before = ftp.commands.filter((c) => c.startsWith("RETR")).length;
    const res = await file("/file-with-no-spaces.mp4", {}, { method: "HEAD" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-length"), "22509");
    assert.equal((await bytes(res)).length, 0);
    assert.equal(ftp.commands.filter((c) => c.startsWith("RETR")).length, before);
  });

  test("HTML and SVG from the FTP server are downloads, never rendered", async () => {
    for (const name of ["/page.html", "/logo.svg"]) {
      const res = await file(name);
      assert.equal(res.headers.get("content-type"), "application/octet-stream", name);
      assert.match(res.headers.get("content-disposition"), /^attachment; /, name);
      assert.match(res.headers.get("content-security-policy"), /sandbox/, name);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff", name);
    }
  });

  test("PDF stays inline, without the sandbox that breaks browser PDF viewers", async () => {
    const res = await file("/report with accents éàü.pdf");
    assert.equal(res.headers.get("content-type"), "application/pdf");
    assert.match(res.headers.get("content-disposition"), /^inline; /);
    assert.equal(res.headers.get("content-security-policy"), "frame-ancestors 'none'");
    assert.equal((await bytes(res)).length, 123456);
  });

  test("download=1 forces an attachment", async () => {
    const res = await file("/photo été.jpg", {}, { extra: "&download=1" });
    assert.equal(res.headers.get("content-type"), "application/octet-stream");
    assert.match(res.headers.get("content-disposition"), /^attachment; /);
  });

  test("empty files, missing files, folders, bad paths", async () => {
    const empty = await file("/empty.txt");
    assert.equal(empty.status, 200);
    assert.equal(empty.headers.get("content-length"), "0");
    assert.equal((await bytes(empty)).length, 0);
    const missing = await file("/nope.jpg");
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /Not found/);
    assert.equal((await file("/Images")).status, 404);
    assert.equal((await file("/")).status, 400);
    assert.equal((await file("/a\\..\\b")).status, 400);
  });

  test("a server without SIZE: whole file, no ranges, no length", async () => {
    const res = await file("/photo été.jpg", { range: "bytes=0-9" }, { id: "slim" });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("accept-ranges"), "none");
    assert.equal(res.headers.get("content-length"), null);
    assert.deepEqual(await bytes(res), patternBytes(1024));
  });

  test("a browser that leaves mid-download closes the FTP transfer", async () => {
    const abort = new AbortController();
    const res = await t.request(`/api/shortcuts/demo/file?${q("/big.bin")}`, {
      headers: { cookie: user }, signal: abort.signal,
    });
    const reader = res.body.getReader();
    await reader.read();
    abort.abort();
    await waitFor(() => ftp.openDataSockets() === 0 && ftp.openConnections() === 0, "FTP sockets to close");
  });

  test("a satisfied range ends the FTP transfer instead of reading the whole file", async () => {
    const res = await file("/big.bin", { range: "bytes=0-99" });
    assert.equal(res.status, 206);
    assert.deepEqual(await bytes(res), patternBytes(100));
    await waitFor(() => ftp.openDataSockets() === 0 && ftp.openConnections() === 0, "FTP sockets to close");
  });

  test("a reader that stops reading (a paused video) is cut off after the stall timeout", async () => {
    const sock = net.connect(new URL(t.base).port, "127.0.0.1");
    await new Promise((r) => sock.once("connect", r));
    sock.on("error", () => {});
    sock.write(`GET /api/shortcuts/demo/file?${q("/big.bin")} HTTP/1.1\r\nHost: x\r\nCookie: ${user}\r\n\r\n`);
    sock.pause();   // never read: buffers fill up, then nothing moves
    await waitFor(() => ftp.openDataSockets() === 1, "the transfer to start");
    await waitFor(() => ftp.openDataSockets() === 0 && ftp.openConnections() === 0, "the stalled transfer to close");
    sock.destroy();
  });

  test("the audit trail records listings and opened files, once per file", async () => {
    await t.app.audit.flush();
    const events = (await readFile(path.join(t.dataDir, "audit.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    assert.ok(events.some((e) => e.event === "list" && e.user === "bob" && e.id === "demo" && e.path === "/Images"));
    assert.ok(events.some((e) => e.event === "file" && e.path === "/photo été.jpg"));
    assert.ok(events.some((e) => e.event === "file" && e.download === true));
    // Ranged requests from offset 2 (a seek) are not logged as a new opening.
    const mp4 = events.filter((e) => e.event === "file" && e.path === "/file-with-no-spaces.mp4");
    assert.equal(mp4.length, 0, "only ranges starting at 0 count as opening the file");
  });

  test("the FTP password never appears in any response", async () => {
    const bodies = await Promise.all([
      list("/").then((r) => r.text()),
      t.request("/api/shortcuts", { headers: { cookie: admin } }).then((r) => r.text()),
      file("/nope.jpg").then((r) => r.text()),
    ]);
    for (const body of bodies) assert.ok(!body.includes(FTP_SECRET));
  });
});
