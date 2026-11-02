/*
 * ftp.test.js - the FTP gateway (server/ftp.js): path and range parsing,
 * error mapping, listing parity with the legacy parser, and behaviour
 * against a real (fake) FTP server: curl-like CWD walking, NAT'd PASV,
 * MLSD, login-failure pauses, connection slots and deadlines.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { Client, FTPError, parseList } from "basic-ftp";
import { createGateway, parseRemotePath, parseRange, toHttpError, modifiedTime } from "../server/ftp.js";
import { startFakeFtp } from "./helpers/fake-ftp-server.js";
import { waitFor } from "./helpers/app.js";

// list() only needs the response's lifecycle, not a real HTTP response.
const fakeRes = () => Object.assign(new EventEmitter(), { destroyed: false, writableFinished: false });
const shortcut = (ftp, extra = {}) => ({
  id: "site", host: "127.0.0.1", port: ftp.port, username: "demo", password: "demo", ...extra,
});

async function withFtp(options, fn) {
  const ftp = await startFakeFtp(options);
  try {
    await fn(ftp);
  } finally {
    await ftp.close();
  }
}

async function closedPort() {
  const srv = net.createServer();
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const { port } = srv.address();
  await new Promise((r) => srv.close(r));
  return port;
}

describe("parseRemotePath", () => {
  test("splits into segments and collapses empty ones", () => {
    assert.deepEqual(parseRemotePath("/"), []);
    assert.deepEqual(parseRemotePath("/Images/2026"), ["Images", "2026"]);
    assert.deepEqual(parseRemotePath("//Images///x y é/"), ["Images", "x y é"]);
  });

  test("refuses anything that could escape or inject", () => {
    for (const bad of ["", "Images", "/../etc", "/a/./b", "/a/..", "/a\r\nDELE b", "/a\u0000", "/a\\..\\b", "/" + "x".repeat(1024)]) {
      assert.throws(() => parseRemotePath(bad), { status: 400 }, JSON.stringify(bad));
    }
  });
});

describe("parseRange", () => {
  test("single ranges, open and suffix forms, clamped to the file", () => {
    assert.deepEqual(parseRange("bytes=0-9", 100), { start: 0, end: 9 });
    assert.deepEqual(parseRange("bytes=90-", 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange("bytes=-10", 100), { start: 90, end: 99 });
    assert.deepEqual(parseRange("bytes=-500", 100), { start: 0, end: 99 });
    assert.deepEqual(parseRange("bytes=50-500", 100), { start: 50, end: 99 });
  });

  test("unsatisfiable vs. ignored", () => {
    assert.equal(parseRange("bytes=100-", 100), "unsatisfiable");
    assert.equal(parseRange("bytes=-0", 100), "unsatisfiable");
    assert.equal(parseRange("bytes=0-", 0), "unsatisfiable");
    for (const ignored of [undefined, "", "bytes=9-5", "bytes=0-1,5-6", "items=0-1", "bytes=-", "bytes=a-b"]) {
      assert.equal(parseRange(ignored, 100), null, String(ignored));
    }
  });
});

describe("toHttpError", () => {
  const ftpError = (code, message) => new FTPError({ code, message });

  test("maps FTP replies and network failures, never naming the server", () => {
    assert.equal(toHttpError(ftpError(530, "530 Login incorrect.")).status, 502);
    assert.equal(toHttpError(ftpError(550, "550 No such file")).status, 404);
    const busy = toHttpError(ftpError(421, "421 Too many connections"));
    assert.equal(busy.status, 503);
    assert.equal(busy.headers["Retry-After"], "30");
    const refused = toHttpError(Object.assign(new Error("connect ECONNREFUSED 192.0.2.10:21"), { code: "ECONNREFUSED" }));
    assert.equal(refused.status, 504);
    assert.doesNotMatch(refused.message, /192\.0\.2\.10/);
    assert.equal(toHttpError(new Error("Timeout (control socket)")).status, 504);
  });
});

describe("modifiedTime", () => {
  const now = new Date(2026, 9, 31, 15, 0);   // 31 Oct 2026, 15:00, wherever the tests run
  const raw = (rawModifiedAt) => modifiedTime({ rawModifiedAt }, now);

  test("MLSD: exact UTC, to the second", () => {
    assert.equal(modifiedTime({ modifiedAt: new Date(Date.UTC(2026, 9, 30, 7, 30, 12)) }), "2026-10-30T07:30:12Z");
    assert.equal(modifiedTime({ modifiedAt: new Date(Date.UTC(2026, 9, 30, 7, 30, 12, 250)) }), "2026-10-30T07:30:12.250Z");
  });

  test("Unix LIST: the server's clock, no time zone; a bare day for old files", () => {
    assert.equal(raw("Oct 30 08:30"), "2026-10-30T08:30");
    assert.equal(raw("Apr 01 2026"), "2026-04-01");
    assert.equal(raw("Dec 24 2019"), "2019-12-24");
    assert.equal(raw("30 Oct 08:30"), "2026-10-30T08:30", "day first, as some locales print it");
    assert.equal(raw("2026-10-30 08:30"), "2026-10-30T08:30", "ls --time-style=long-iso");
    assert.equal(raw("oct  3 8:05"), "2026-10-03T08:05");
  });

  test("Unix LIST: a time without a year is in the past year when this year's is to come", () => {
    assert.equal(raw("Nov 01 09:00"), "2026-11-01T09:00", "tomorrow morning: a server a few hours ahead");
    assert.equal(raw("Dec 15 10:00"), "2025-12-15T10:00");
    assert.equal(modifiedTime({ rawModifiedAt: "Jan 02 10:00" }, new Date(2027, 0, 1, 12, 0)), "2027-01-02T10:00");
    assert.equal(modifiedTime({ rawModifiedAt: "Dec 31 23:59" }, new Date(2027, 0, 1, 0, 30)), "2026-12-31T23:59");
  });

  test("DOS / IIS LIST", () => {
    assert.equal(raw("10-30-26 08:30AM"), "2026-10-30T08:30");
    assert.equal(raw("10-30-26 12:05AM"), "2026-10-30T00:05");
    assert.equal(raw("10-30-26 12:05PM"), "2026-10-30T12:05");
    assert.equal(raw("10-30-26 08:30PM"), "2026-10-30T20:30");
    assert.equal(raw("10-30-2026 20:30"), "2026-10-30T20:30");
    assert.equal(raw("12-05-96 05:03PM"), "1996-12-05T17:03");
  });

  test("anything else is unknown, not a guess", () => {
    for (const bad of ["", "Okt 30 08:30", "Feb 30 2026", "13-01-26 08:30AM", "10-30-26 13:30PM", "Oct 30 24:10",
      "2026-13-01 08:30", "yesterday", "1730000000"]) {
      assert.equal(raw(bad), null, JSON.stringify(bad));
    }
    assert.equal(modifiedTime({ modifiedAt: new Date(NaN), rawModifiedAt: "" }), null);
  });
});

describe("listing parity with the legacy HTA parser", () => {
  test("basic-ftp reads the legacy fixture into the 8 entries test-parser.hta asserts", async () => {
    const text = await readFile(path.join(import.meta.dirname, "fixtures", "listing-unix.txt"), "utf8");
    const entries = parseList(text);
    const by = Object.fromEntries(entries.map((e) => [e.name, e]));
    assert.equal(entries.length, 8);
    assert.ok(!by["."] && !by[".."], "skips . and ..");
    assert.ok(by["Images"].isDirectory && !by["Images"].isSymbolicLink);
    assert.ok(by["Dossier avec accents éàü"].isDirectory, "folder with accents + spaces");
    assert.equal(by["file-with-no-spaces.mp4"].size, 22509);
    assert.equal(by["file with several spaces.mp4"].size, 33333);
    assert.equal(by["report with accents éàü.pdf"].size, 123456);
    assert.equal(by["empty.txt"].size, 0);
    assert.ok(by["latest"].isSymbolicLink, "symlink target stripped from the name");
    assert.equal(by["Images"].rawModifiedAt, "Apr 01 2026");
  });
});

describe("gateway against an FTP server", () => {
  test("lists with a plain LIST, like curl, into the UI's entry shape", () => withFtp({}, async (ftp) => {
    const entries = await createGateway().list(shortcut(ftp), "/", fakeRes());
    const by = Object.fromEntries(entries.map((e) => [e.name, e]));
    assert.deepEqual(by["Images"], {
      name: "Images", isDir: true, isLink: false, size: 4096, date: "Apr 01 2026", modified: "2026-04-01",
    });
    assert.deepEqual(by["photo été.jpg"], {
      name: "photo été.jpg", isDir: false, isLink: false, size: 1024, date: "Apr 01 2026", modified: "2026-04-01",
    });
    assert.equal(by["latest"].isLink, true);
    assert.ok(!by["."] && !by[".."]);
    assert.ok(ftp.commands.includes("LIST"));
    assert.ok(!ftp.commands.some((c) => c.startsWith("LIST -a")), "never LIST -a");
    await waitFor(() => ftp.openConnections() === 0, "the FTP connection to close");
  }));

  test("walks a path with one CWD per segment, spaces and accents intact", () => withFtp({}, async (ftp) => {
    const gw = createGateway();
    assert.deepEqual((await gw.list(shortcut(ftp), "/Images/2026", fakeRes())).map((e) => e.name), ["snap 1.jpg"]);
    const walk = ftp.commands.slice(ftp.commands.indexOf("CWD Images"));
    assert.deepEqual(walk.filter((c) => /^(CWD|LIST)/.test(c)), ["CWD Images", "CWD 2026", "LIST"]);
    assert.deepEqual((await gw.list(shortcut(ftp), "/Dossier avec accents éàü", fakeRes())).map((e) => e.name), ["notes.txt"]);
    assert.ok(ftp.commands.includes("CWD Dossier avec accents éàü"));
    await assert.rejects(gw.list(shortcut(ftp), "/missing", fakeRes()), { status: 404 });
  }));

  test("paths are relative to the login directory", () => withFtp({
    home: "/home/site", tree: { home: { site: { "inside.txt": "x", sub: {} } }, "outside.txt": "y" },
  }, async (ftp) => {
    const gw = createGateway();
    assert.deepEqual((await gw.list(shortcut(ftp), "/", fakeRes())).map((e) => e.name).sort(), ["inside.txt", "sub"]);
    assert.deepEqual(await gw.list(shortcut(ftp), "/sub", fakeRes()), []);
  }));

  test("no EPSV and a private PASV address (NAT): data still reaches the control host", () => withFtp({
    epsv: false, pasvHost: "10.0.0.5",
  }, async (ftp) => {
    const gw = createGateway();
    assert.ok((await gw.list(shortcut(ftp), "/", fakeRes())).length > 0);
    await gw.list(shortcut(ftp), "/Images", fakeRes());
    assert.equal(ftp.commands.filter((c) => c === "EPSV").length, 1, "the working mode is remembered");
    assert.equal(ftp.commands.filter((c) => c === "PASV").length, 2);
  }));

  test("...which basic-ftp's default transfer strategy alone refuses", () => withFtp({
    epsv: false, pasvHost: "10.0.0.5",
  }, async (ftp) => {
    const client = new Client(5000);
    try {
      await client.access({ host: "127.0.0.1", port: ftp.port, user: "demo", password: "demo" });
      await assert.rejects(client.list(), /PASV returned another host|None of the available transfer strategies/);
    } finally {
      client.close();
    }
  }));

  test("MLSD listings carry exact UTC dates", () => withFtp({ mlsd: true }, async (ftp) => {
    const entries = await createGateway().list(shortcut(ftp), "/", fakeRes());
    assert.equal(entries.find((e) => e.name === "Images").modified, "2026-04-01T12:34:00Z");
    assert.equal(entries.find((e) => e.name === "empty.txt").size, 0);
    assert.ok(ftp.commands.includes("MLSD"));
  }));

  test("a failed login pauses the shortcut rather than retrying", () => withFtp({}, async (ftp) => {
    const gw = createGateway();
    const bad = shortcut(ftp, { password: "wrong" });
    await assert.rejects(gw.list(bad, "/", fakeRes()), { status: 502, message: /FTP login failed: 530 Login incorrect/ });
    await assert.rejects(gw.list(bad, "/", fakeRes()), { status: 502, message: /not retried for 5 min/ });
    assert.equal(ftp.logins(), 1, "the server saw a single attempt");
    gw.forget("site");
    await assert.rejects(gw.list(bad, "/", fakeRes()), { status: 502 });
    assert.equal(ftp.logins(), 2);
    assert.ok((await gw.list(shortcut(ftp, { id: "other" }), "/", fakeRes())).length > 0, "other shortcuts are unaffected");
  }));

  test("an unreachable server is a 504", async () => {
    const sc = { id: "x", host: "127.0.0.1", port: await closedPort(), username: "u", password: "p" };
    await assert.rejects(createGateway().list(sc, "/", fakeRes()), { status: 504, message: /ECONNREFUSED/ });
  });

  test("a server that refuses the connection (421) is a 503", () => withFtp({ maxConnections: 0 }, async (ftp) => {
    await assert.rejects(createGateway().list(shortcut(ftp), "/", fakeRes()), (err) => {
      assert.equal(err.status, 503);
      assert.equal(err.headers["Retry-After"], "30");
      return true;
    });
  }));

  test("FTP_ALLOWED_HOSTS is enforced again at connect time", () => withFtp({}, async (ftp) => {
    const gw = createGateway({ allowedHosts: ["ftp.example.com"] });
    await assert.rejects(gw.list(shortcut(ftp), "/", fakeRes()), { status: 403 });
    assert.equal(ftp.logins(), 0);
  }));

  test("never more than maxConnections at once: the rest wait their turn", () => withFtp({
    maxConnections: 1, listDelayMs: 100,
  }, async (ftp) => {
    // The fake server answers 421 to a second simultaneous connection.
    const gw = createGateway({ maxConnections: 1 });
    const results = await Promise.all([1, 2, 3].map(() => gw.list(shortcut(ftp), "/", fakeRes())));
    assert.ok(results.every((r) => r.length > 0));
    assert.equal(ftp.logins(), 3);
  }));

  test("when the queue wait runs out, a 503 instead of piling onto the server", () => withFtp({ listDelayMs: 600 }, async (ftp) => {
    const gw = createGateway({ maxConnections: 1, queueWaitMs: 50 });
    const first = gw.list(shortcut(ftp), "/", fakeRes());
    await assert.rejects(gw.list(shortcut(ftp), "/", fakeRes()), { status: 503, message: /busy/ });
    assert.ok((await first).length > 0);
  }));

  test("a listing past its deadline is cut off with a 504 and its connection closed", () => withFtp({ listDelayMs: 2000 }, async (ftp) => {
    const gw = createGateway({ listDeadlineMs: 150 });
    await assert.rejects(gw.list(shortcut(ftp), "/", fakeRes()), { status: 504, message: /took too long/ });
    await waitFor(() => ftp.openConnections() === 0, "the FTP connection to close");
  }));

  test("a browser that leaves mid-listing closes the FTP connection", () => withFtp({ listDelayMs: 2000 }, async (ftp) => {
    const res = fakeRes();
    const pending = createGateway().list(shortcut(ftp), "/", res);
    await waitFor(() => ftp.commands.includes("LIST"), "LIST to be sent");
    res.destroyed = true;
    res.emit("close");
    await assert.rejects(pending, { status: 499 });
    await waitFor(() => ftp.openConnections() === 0, "the FTP connection to close");
  }));
});
