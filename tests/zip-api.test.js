/*
 * zip-api.test.js - the ZIP export over HTTP (POST /api/shortcuts/:id/zip,
 * then GET /api/zip/:token) against fake FTP servers: exact bytes, one
 * login per archive, the single-use link, request checks, the limit on
 * simultaneous archives, HEAD, the audit trail, abandoned downloads, and
 * the errors entry for missing, cut-off and unreachable files, in French too.
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { crc32 } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { loadConfig } from "../server/config.js";
import { createApp } from "../server/routes.js";
import { translate, formatSize } from "../public/js/i18n.js";
import { startApp, PASSWORD, waitFor } from "./helpers/app.js";
import { startFakeFtp, patternBytes } from "./helpers/fake-ftp-server.js";

const FTP_SECRET = "zz-ftp-secret-zz";
const LOCAL_TIME = "2026-11-01T16:05";
const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const EXPIRED = translate("en", "err.zipExpired");
// The errors entry, as the user's language words it: an intro, then one line per file.
const errorsFile = (lang, ...lines) => [translate(lang, "zip.errorsIntro"), ...lines, ""].join("\r\n");
const failedLine = (lang, name, key, params) => translate(lang, "zip.errorLine", { name, reason: translate(lang, key, params) });
const cutLine = (name, size) => translate("en", "zip.incomplete", { name, size: formatSize(size, "en") });
const CLIP_1 = patternBytes(150_000);       // more than two of the server's 64 KiB chunks
const CLIP_1_ELSEWHERE = patternBytes(5000, 7);
const PHOTO = patternBytes(1024, 3);
const BIG = patternBytes(16 * 1024 * 1024);   // larger than any socket buffer
const pad = (n) => String(n).padStart(2, "0");
const bytes = async (res) => Buffer.from(await res.arrayBuffer());

// The end record, the central directory, and each entry's data (the
// format itself is checked in detail by tests/zip.test.js).
function readZip(buf) {
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, "end record");
  let at = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = buf.readUInt16LE(end + 10); i > 0; i--) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, "central record");
    const nameLength = buf.readUInt16LE(at + 28);
    const date = buf.readUInt16LE(at + 14), time = buf.readUInt16LE(at + 12);
    const size = buf.readUInt32LE(at + 24);
    const local = buf.readUInt32LE(at + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    entries.push({
      name: buf.toString("utf8", at + 46, at + 46 + nameLength),
      crc: buf.readUInt32LE(at + 16),
      data: buf.subarray(start, start + size),
      modified: `${1980 + (date >> 9)}-${pad((date >> 5) & 15)}-${pad(date & 31)}T${pad(time >> 11)}:${pad((time >> 5) & 63)}`,
    });
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return entries;
}

// The errors entry's text, without its BOM.
function errorsText(entry) {
  assert.deepEqual(entry.data.subarray(0, 3), BOM);
  return entry.data.subarray(3).toString("utf8");
}

async function auditEvents(t) {
  await t.app.audit.flush();
  return (await readFile(path.join(t.dataDir, "audit.jsonl"), "utf8")).trim().split("\n").map(JSON.parse);
}

// A client of one app: POST the list, then follow the link.
function client(t, cookie) {
  const prepare = (paths, { localTime = LOCAL_TIME, id = "demo", headers = {} } = {}) => t.request(`/api/shortcuts/${id}/zip`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json", ...headers },
    body: JSON.stringify({ paths, localTime }),
  });
  return {
    prepare,
    async link(paths, options) {
      const res = await prepare(paths, options);
      assert.equal(res.status, 200, await res.clone().text());
      return res.json();
    },
    download: (url, { method = "GET", signal, as = cookie } = {}) => t.request(url, { method, signal, headers: { cookie: as } }),
    async archive(paths, options) {
      const res = await t.request((await this.link(paths, options)).url, { headers: { cookie } });
      assert.equal(res.status, 200);
      return readZip(await bytes(res));
    },
  };
}

describe("ZIP export API", () => {
  let t, ftp, bob, carol, user;
  const CLIPS = ["/Cam 1/1234_Cam 1_202611011558.avi", "/Entrée été/photo été.jpg", "/Cam 2/1234_Cam 1_202611011558.avi"];

  before(async () => {
    ftp = await startFakeFtp({
      users: { demo: FTP_SECRET },
      tree: {
        "Cam 1": { "1234_Cam 1_202611011558.avi": CLIP_1 },
        "Cam 2": { "1234_Cam 1_202611011558.avi": CLIP_1_ELSEWHERE, "1234_Cam 2_202611011600.avi": PHOTO },
        "Entrée été": { "photo été.jpg": PHOTO },
        "big.bin": BIG,
        "empty.txt": "",
      },
    });
    t = await startApp();
    await t.app.users.add("bob", PASSWORD);
    await t.app.users.add("carol", PASSWORD);
    bob = (await t.login("bob")).cookie;
    carol = (await t.login("carol")).cookie;
    user = client(t, bob);
    await t.app.shortcuts.create({ username: "demo", label: "1234 Résidence", host: "127.0.0.1", port: ftp.port, password: FTP_SECRET });
  });
  after(async () => {
    await t.close();
    await ftp.close();
  });

  test("three files from different folders, byte for byte, in a named attachment", async () => {
    const body = await user.link(CLIPS);
    assert.match(body.url, /^\/api\/zip\/[A-Za-z0-9_-]{24}$/);
    assert.equal(body.count, 3);
    assert.equal(body.name, "1234 Résidence 2026-11-01 16-05.zip");
    const res = await user.download(body.url);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/zip");
    assert.equal(res.headers.get("content-disposition"),
      `attachment; filename="1234 R_sidence 2026-11-01 16-05.zip"; filename*=UTF-8''1234%20R%C3%A9sidence%202026-11-01%2016-05.zip`);
    assert.equal(res.headers.get("cache-control"), "private, no-store");
    assert.equal(res.headers.get("content-length"), null);
    assert.equal(res.headers.get("transfer-encoding"), "chunked");
    const entries = readZip(await bytes(res));
    assert.deepEqual(entries.map((e) => e.name),
      ["1234_Cam 1_202611011558.avi", "photo été.jpg", "1234_Cam 1_202611011558 (2).avi"], "no errors entry");
    for (const [e, data] of [[entries[0], CLIP_1], [entries[1], PHOTO], [entries[2], CLIP_1_ELSEWHERE]]) {
      assert.deepEqual(e.data, data, e.name);
      assert.equal(e.crc, crc32(data), e.name);
    }
    assert.deepEqual(entries.map((e) => e.modified), ["2026-11-01T15:58", "2026-11-01T16:05", "2026-11-01T15:58"],
      "the recorder's clock from clip names, else the browser's clock");
  });

  test("one FTP login for the whole archive: PWD once, then CWD back home and down for each file", async () => {
    const [logins, from] = [ftp.logins(), ftp.commands.length];
    await user.archive(CLIPS);
    assert.equal(ftp.logins() - logins, 1);
    assert.deepEqual(ftp.commands.slice(from).filter((c) => /^(PWD|CWD|RETR)/.test(c)), [
      "PWD",
      "CWD /", "CWD Cam 1", "RETR 1234_Cam 1_202611011558.avi",
      "CWD /", "CWD Entrée été", "RETR photo été.jpg",
      "CWD /", "CWD Cam 2", "RETR 1234_Cam 1_202611011558.avi",
    ]);
    await waitFor(() => ftp.openConnections() === 0, "the FTP connection to close");
  });

  test("the archive's name: the server's clock without the browser's, and only characters Windows accepts", async () => {
    assert.match((await user.link(["/empty.txt"], { localTime: undefined })).name, /^1234 Résidence \d{4}-\d\d-\d\d \d\d-\d\d\.zip$/);
    assert.doesNotMatch((await user.link(["/empty.txt"], { localTime: "2026-02-30T10:00" })).name, /2026-02-30/, "no such day");
    await t.app.shortcuts.create({ username: "odd", label: `Dépôt <A>|"B"?*: \\x/y.. `, host: "127.0.0.1", port: ftp.port, password: FTP_SECRET });
    assert.equal((await user.link(["/empty.txt"], { id: "odd" })).name, "Dépôt _A___B____ _x_y 2026-11-01 16-05.zip");
  });

  test("an abandoned download closes the FTP connection at once", async () => {
    const from = ftp.commands.length;
    const { url } = await user.link(["/big.bin", "/Cam 1/1234_Cam 1_202611011558.avi"]);
    const abort = new AbortController();
    const res = await user.download(url, { signal: abort.signal });
    await res.body.getReader().read();
    abort.abort();
    await waitFor(() => ftp.openDataSockets() === 0 && ftp.openConnections() === 0, "FTP sockets to close");
    assert.ok(!ftp.commands.slice(from).includes("RETR 1234_Cam 1_202611011558.avi"), "the next file is never asked for");
  });

  test("a link works once, only for its user, and not after it expires", async () => {
    const { url } = await user.link(["/empty.txt"]);
    const other = await user.download(url, { as: carol });
    assert.equal(other.status, 404);
    assert.equal((await other.json()).error, EXPIRED);
    assert.equal((await user.download(url, { as: "" })).status, 401);
    const first = await user.download(url);
    assert.equal(first.status, 200, "someone else's attempt didn't use it up");
    assert.deepEqual(readZip(await bytes(first)).map((e) => e.name), ["empty.txt"]);
    const again = await user.download(url);
    assert.equal(again.status, 404);
    assert.equal((await again.json()).error, EXPIRED);
    assert.equal((await user.download("/api/zip/AAAAAAAAAAAAAAAAAAAAAAAA")).status, 404);

    const short = await startShortLived(100);
    try {
      await short.app.users.add("bob", PASSWORD);
      await short.app.shortcuts.create({ username: "demo", label: "1234 Résidence", host: "127.0.0.1", port: ftp.port, password: FTP_SECRET });
      const s = client(short, (await short.login("bob")).cookie);
      const { url: late } = await s.link(["/empty.txt"]);
      await new Promise((r) => setTimeout(r, 250));
      const expired = await s.download(late);
      assert.equal(expired.status, 404);
      assert.equal((await expired.json()).error, EXPIRED);
    } finally {
      await short.close();
    }
  });

  test("a user keeps at most 10 links waiting: the oldest goes first", async () => {
    const links = [];
    for (let i = 0; i < 11; i++) links.push((await user.link(["/empty.txt"])).url);
    assert.equal((await user.download(links[0])).status, 404);
    const newest = await user.download(links[10]);
    assert.equal(newest.status, 200);
    await newest.arrayBuffer();
    const otherUser = client(t, carol);
    const theirs = await otherUser.download((await otherUser.link(["/empty.txt"])).url);
    assert.equal(theirs.status, 200, "another user's links don't count");
    await theirs.arrayBuffer();
  });

  test("refused lists: 0 or 201 paths, unsafe paths, the same file twice, an unknown site", async () => {
    const refused = async (paths, status, key, options, lang = "en") => {
      const res = await user.prepare(paths, options);
      assert.equal(res.status, status, JSON.stringify(paths)?.slice(0, 80));
      assert.equal((await res.json()).error, translate(lang, key, { max: 200 }));
    };
    await refused([], 400, "err.zipCount");
    assert.equal(translate("en", "err.zipCount", { max: 200 }), "Select between 1 and 200 files");
    await refused(Array.from({ length: 201 }, (_, i) => `/clip ${i}.avi`), 400, "err.zipCount");
    await refused(undefined, 400, "err.zipCount");
    await refused("/empty.txt", 400, "err.zipCount");
    for (const bad of [["/Cam 1/../../etc/passwd"], ["/"], ["empty.txt"], ["/a\r\nDELE b"], [42], [["/empty.txt"]]]) {
      await refused(bad, 400, "err.badPath");
    }
    await refused(["/Cam 1/x.avi", "/empty.txt", "//Cam 1//x.avi/"], 400, "err.zipDuplicate");
    await refused(["/empty.txt"], 404, "err.noShortcut", { id: "nope" });
    await refused([], 400, "err.zipCount", { headers: { cookie: `${bob}; qfe_lang=fr` } }, "fr");
    // The checks every write gets (server/http.js).
    await refused(["/empty.txt"], 415, "err.jsonOnly", { headers: { "content-type": "text/plain" } });
    await refused(["/empty.txt"], 403, "err.crossOrigin", { headers: { origin: "https://evil.example.com" } });
    const signedOut = await t.request("/api/shortcuts/demo/zip", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paths: ["/empty.txt"] }),
    });
    assert.equal(signedOut.status, 401);
  });

  test("a third archive at once gets a 503 with Retry-After, and its link still works afterwards", async () => {
    const a = await user.link(["/big.bin"]);
    const b = await user.link(["/big.bin"]);
    const c = await user.link(["/empty.txt"]);
    const aborts = [new AbortController(), new AbortController()];
    for (const [i, { url }] of [a, b].entries()) {
      const res = await user.download(url, { signal: aborts[i].signal });
      assert.equal(res.status, 200);
      await res.body.getReader().read();   // streaming: it holds its place
    }
    const busy = await user.download(c.url);
    assert.equal(busy.status, 503);
    assert.equal(busy.headers.get("retry-after"), "5");
    assert.equal((await busy.json()).error, translate("en", "err.zipBusy"));
    aborts.forEach((abort) => abort.abort());
    let res;
    const end = Date.now() + 5000;
    do {
      res = await user.download(c.url);
      if (res.status === 503) await new Promise((r) => setTimeout(r, 20));
    } while (res.status === 503 && Date.now() < end);
    assert.equal(res.status, 200);
    assert.deepEqual(readZip(await bytes(res)).map((e) => e.name), ["empty.txt"]);
    await waitFor(() => ftp.openDataSockets() === 0 && ftp.openConnections() === 0, "FTP sockets to close");
  });

  test("HEAD sends the headers only: no FTP, and the link stays usable", async () => {
    const { url } = await user.link(["/Cam 2/1234_Cam 2_202611011600.avi"]);
    const [logins, from] = [ftp.logins(), ftp.commands.length];
    const head = await user.download(url, { method: "HEAD" });
    assert.equal(head.status, 200);
    assert.equal(head.headers.get("content-type"), "application/zip");
    assert.match(head.headers.get("content-disposition"), /^attachment; filename="1234 R_sidence 2026-11-01 16-05\.zip"/);
    assert.equal((await bytes(head)).length, 0);
    assert.equal(ftp.logins(), logins);
    assert.equal(ftp.commands.length, from, "not a single FTP command");
    const get = await user.download(url);
    assert.equal(get.status, 200);
    assert.deepEqual(readZip(await bytes(get))[0].data, PHOTO);
    assert.equal((await user.download(url, { method: "HEAD" })).status, 404, "a used link is gone for HEAD too");
  });

  test("the audit trail gets one export line per archive, with every path", async () => {
    const paths = ["/Entrée été/photo été.jpg", "/empty.txt"];
    const { url } = await user.link(paths);
    await user.download(url, { method: "HEAD" });
    await bytes(await user.download(url));
    await user.download(url);   // used up: no line
    const lines = (await auditEvents(t)).filter((e) => e.event === "export" && JSON.stringify(e.paths) === JSON.stringify(paths));
    assert.equal(lines.length, 1);
    const { time, ...line } = lines[0];
    assert.deepEqual(line, { event: "export", user: "bob", ip: "127.0.0.1", id: "demo", count: 2, paths });
  });

  test("a missing file: the others intact, and ERRORS.txt naming it", async () => {
    const entries = await user.archive(["/Cam 1/1234_Cam 1_202611011558.avi", "/missing.avi", "/Nowhere/x.avi", "/Entrée été/photo été.jpg"]);
    assert.deepEqual(entries.map((e) => e.name), ["1234_Cam 1_202611011558.avi", "photo été.jpg", "ERRORS.txt"]);
    assert.deepEqual(entries[0].data, CLIP_1);
    assert.deepEqual(entries[1].data, PHOTO);
    assert.equal(errorsText(entries[2]), errorsFile("en",
      failedLine("en", "/missing.avi", "err.ftpNotFound", { reply: "550 Failed to open file." }),
      failedLine("en", "/Nowhere/x.avi", "err.ftpNotFound", { reply: "550 Failed to change directory." })));
    assert.match(errorsText(entries[2]), /^These files couldn't be added to the archive:\r\n\/missing\.avi: Not found/);
  });

  test("...in French when the user reads French: ERREURS.txt", async () => {
    const french = client(t, `${bob}; qfe_lang=fr`);
    const entries = await french.archive(["/missing.avi", "/Entrée été/photo été.jpg"]);
    assert.deepEqual(entries.map((e) => e.name), ["photo été.jpg", "ERREURS.txt"]);
    assert.deepEqual(entries[0].data, PHOTO);
    const text = errorsText(entries[1]);
    assert.equal(text, errorsFile("fr", failedLine("fr", "/missing.avi", "err.ftpNotFound", { reply: "550 Failed to open file." })));
    const NB = String.fromCharCode(0xa0);
    assert.ok(text.startsWith(`Ces fichiers n'ont pas pu être ajoutés à l'archive${NB}:\r\n/missing.avi${NB}: `), text);
  });

  test("a server that goes away mid-archive: what arrived stays, and the rest is listed with the reason", async () => {
    // Transfers stop after 1000 bytes and hang, until the server is closed.
    const tree = { "a.txt": patternBytes(500), "b.bin": patternBytes(5000, 1), "c.txt": patternBytes(700, 2) };
    const gone = await startFakeFtp({ users: { gone: FTP_SECRET }, tree, stallAfter: 1000 });
    await t.app.shortcuts.create({ username: "gone", host: "127.0.0.1", port: gone.port, password: FTP_SECRET });
    const { url } = await user.link(["/a.txt", "/b.bin", "/c.txt"], { id: "gone" });
    const pending = user.download(url).then(bytes);
    await waitFor(() => gone.commands.includes("RETR b.bin") && gone.openDataSockets() === 1, "b.bin to start");
    await new Promise((r) => setTimeout(r, 100));   // its first 1000 bytes arrive
    await gone.close();
    const entries = readZip(await pending);
    assert.deepEqual(entries.map((e) => e.name), ["a.txt", "b.bin", "ERRORS.txt"]);
    assert.deepEqual(entries[1].data, tree["b.bin"].subarray(0, 1000));
    assert.equal(errorsText(entries[2]), errorsFile("en",
      cutLine("/b.bin", 1000),
      failedLine("en", "/c.txt", "err.ftpUnreachable", { code: "ECONNREFUSED" })));
  });

  test("the FTP password never appears in a response", async () => {
    const { url } = await user.link(["/missing.avi"]);
    const body = await bytes(await user.download(url));
    assert.ok(!body.includes(FTP_SECRET));
  });
});

describe("ZIP export when transfers break", () => {
  let t, ftp, user;
  // Every transfer stops after 1000 bytes and hangs: small files get through.
  const tree = {
    "a.txt": patternBytes(500), "b.bin": patternBytes(5000, 1), "c.txt": patternBytes(700, 2),
    "d.bin": patternBytes(5000, 3), "e.txt": patternBytes(300, 4),
  };

  before(async () => {
    ftp = await startFakeFtp({ users: { demo: FTP_SECRET }, tree, stallAfter: 1000 });
    t = await startApp({}, { ftp: { stallMs: 300 } });
    await t.app.users.add("bob", PASSWORD);
    await t.app.shortcuts.create({ username: "demo", label: "1234 Résidence", host: "127.0.0.1", port: ftp.port, password: FTP_SECRET });
    user = client(t, (await t.login("bob")).cookie);
  });
  after(async () => {
    await t.close();
    await ftp.close();
  });

  test("a file cut off midway keeps what arrived; the connection is opened again once and the archive goes on", async () => {
    const logins = ftp.logins();
    const entries = await user.archive(["/a.txt", "/b.bin", "/c.txt"]);
    assert.deepEqual(entries.map((e) => e.name), ["a.txt", "b.bin", "c.txt", "ERRORS.txt"]);
    assert.deepEqual(entries[0].data, tree["a.txt"]);
    assert.deepEqual(entries[1].data, tree["b.bin"].subarray(0, 1000));
    assert.deepEqual(entries[2].data, tree["c.txt"]);
    assert.equal(errorsText(entries[3]), errorsFile("en", cutLine("/b.bin", 1000)));
    assert.equal(cutLine("/b.bin", 1000), "/b.bin: incomplete, the transfer stopped after 1000 B");
    assert.equal(ftp.logins() - logins, 2);
  });

  test("after a second loss, the files left are listed instead of tried", async () => {
    const [logins, from] = [ftp.logins(), ftp.commands.length];
    const entries = await user.archive(["/a.txt", "/b.bin", "/d.bin", "/e.txt"]);
    assert.deepEqual(entries.map((e) => [e.name, e.data.length]).slice(0, 3), [["a.txt", 500], ["b.bin", 1000], ["d.bin", 1000]]);
    assert.equal(errorsText(entries[3]), errorsFile("en",
      cutLine("/b.bin", 1000), cutLine("/d.bin", 1000), failedLine("en", "/e.txt", "err.ftpSilent")));
    assert.equal(ftp.logins() - logins, 2, "opened again once, not twice");
    assert.ok(!ftp.commands.slice(from).includes("RETR e.txt"));
  });
});

// startApp passes no `zip` option on, so the expiry test boots its own app
// the same way, with links that last 100 ms.
async function startShortLived(ttlMs) {
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "qfe-test-"));
  const app = await createApp(loadConfig({ DATA_DIR: dataDir }), { log: () => {}, zip: { ttlMs } });
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (pathname, opts = {}) => fetch(base + pathname, { redirect: "manual", ...opts });
  return {
    app, dataDir, request,
    async login(username) {
      const res = await request("/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ username, password: PASSWORD }),
      });
      return { cookie: (res.headers.getSetCookie()[0] || "").split(";")[0] };
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await app.audit.flush();
      await rm(dataDir, { recursive: true, force: true });
    },
  };
}
