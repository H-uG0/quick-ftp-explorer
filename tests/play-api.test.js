/*
 * play-api.test.js - /api/shortcuts/:id/play over HTTP, against a fake FTP
 * server and a stand-in for ffmpeg: H.264 MP4s go out untouched whatever
 * their name, other clips are converted, both with byte ranges; size limit,
 * errors, audit trail, and a server without ffmpeg.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { startApp, PASSWORD } from "./helpers/app.js";
import { startFakeFtp } from "./helpers/fake-ftp-server.js";
import { fakeFfmpeg } from "./helpers/fake-ffmpeg.js";
import { mp4 } from "./helpers/mp4.js";

const FTP_SECRET = "zz-ftp-secret-zz";
const H264_NAMED_AVI = mp4();                 // an MP4 a camera named .avi
const XVID = Buffer.from("RIFF\0\0\0\0AVI LIST - a clip no browser plays");
const CONVERTED = mp4({ moovFirst: true });   // what the stand-in ffmpeg produces
const OVER_LIMIT = Buffer.alloc(1024 * 1024 + 1);   // CONVERT_MAX_MB=1

describe("video playback API", () => {
  let t, bare, ftp, slim, ffmpeg, user;
  const tree = { "clip été.avi": H264_NAMED_AVI, "xvid.avi": XVID, "big.avi": OVER_LIMIT, "Clips": { "nested.mp4": H264_NAMED_AVI } };

  before(async () => {
    ftp = await startFakeFtp({ users: { demo: FTP_SECRET }, tree });
    slim = await startFakeFtp({ size: false, users: { slim: FTP_SECRET }, tree });   // no SIZE
    ffmpeg = fakeFfmpeg({ output: CONVERTED });
    t = await startApp({ CONVERT_MAX_MB: "1" }, { video: ffmpeg });
    bare = await startApp({}, { video: { ...fakeFfmpeg(), probe: async () => null } });   // no ffmpeg
    for (const app of [t, bare]) {
      await app.app.users.add("bob", PASSWORD);
      await app.app.shortcuts.create({ username: "demo", host: "127.0.0.1", port: ftp.port, password: FTP_SECRET });
    }
    await t.app.shortcuts.create({ username: "slim", host: "127.0.0.1", port: slim.port, password: FTP_SECRET });
    user = (await t.login("bob")).cookie;
  });
  after(async () => {
    await t.close();
    await bare.close();
    await ftp.close();
    await slim.close();
  });

  const play = (p, headers = {}, { id = "demo", method = "GET", app = t, cookie = user } = {}) =>
    app.request(`/api/shortcuts/${id}/play?path=${encodeURIComponent(p)}`, { method, headers: { cookie, ...headers } });
  const bytes = async (res) => Buffer.from(await res.arrayBuffer());

  test("an H.264 MP4 named .avi goes out as it is, as an inline MP4", async () => {
    const res = await play("/clip été.avi");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "video/mp4");
    assert.equal(res.headers.get("content-disposition"),
      `inline; filename="clip _t_.mp4"; filename*=UTF-8''clip%20%C3%A9t%C3%A9.mp4`);
    assert.equal(res.headers.get("accept-ranges"), "bytes");
    assert.equal(res.headers.get("content-length"), String(H264_NAMED_AVI.length));
    assert.match(res.headers.get("content-security-policy"), /sandbox/);
    assert.deepEqual(await bytes(res), H264_NAMED_AVI);
    assert.equal(ffmpeg.calls.length, 0);
  });

  test("byte ranges and HEAD, for seeking", async () => {
    const part = await play("/clip été.avi", { range: "bytes=4-11" });
    assert.equal(part.status, 206);
    assert.equal(part.headers.get("content-range"), `bytes 4-11/${H264_NAMED_AVI.length}`);
    assert.deepEqual(await bytes(part), H264_NAMED_AVI.subarray(4, 12));
    assert.equal((await play("/clip été.avi", { range: "bytes=999999-" })).status, 416);
    const head = await play("/Clips/nested.mp4", {}, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-length"), String(H264_NAMED_AVI.length));
    assert.equal((await bytes(head)).length, 0);
  });

  test("other clips are converted to an MP4", async () => {
    const res = await play("/xvid.avi");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "video/mp4");
    assert.deepEqual(await bytes(res), CONVERTED);
    assert.deepEqual(ffmpeg.calls.at(-1).input, XVID);
  });

  test("files over CONVERT_MAX_MB are refused, with or without SIZE", async () => {
    for (const id of ["demo", "slim"]) {
      const res = await play("/big.avi", {}, { id });
      assert.equal(res.status, 413, id);
      assert.match((await res.json()).error, /too big to play here \(over 1 MB\)/);
    }
  });

  test("errors: 401 signed out, 404 unknown file or shortcut, 400 not a file", async () => {
    assert.equal((await play("/clip été.avi", {}, { cookie: "" })).status, 401);
    assert.equal((await play("/missing.avi")).status, 404);
    assert.equal((await play("/clip été.avi", {}, { id: "nope" })).status, 404);
    assert.equal((await play("/")).status, 400);
    assert.equal((await play("/../etc/passwd")).status, 400);
  });

  test("without ffmpeg, H.264 clips still play and the others explain why not", async () => {
    const cookie = (await bare.login("bob")).cookie;
    assert.equal((await play("/clip été.avi", {}, { app: bare, cookie })).status, 200);
    const res = await play("/xvid.avi", {}, { app: bare, cookie });
    assert.equal(res.status, 501);
    assert.match((await res.json()).error, /no converter \(ffmpeg\)/);
  });

  test("the audit trail records each played video once", async () => {
    await play("/Clips/nested.mp4");
    await play("/Clips/nested.mp4", { range: "bytes=10-" });   // seeking: not a new line
    await t.app.audit.flush();
    const events = (await readFile(path.join(t.dataDir, "audit.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
    const plays = events.filter((e) => e.event === "play" && e.path === "/Clips/nested.mp4");
    assert.equal(plays.length, 1);
    assert.equal(plays[0].user, "bob");
  });
});
