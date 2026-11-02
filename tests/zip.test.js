/*
 * zip.test.js - the streaming ZIP writer (server/zip.js), read back with a
 * small reader of its own: stored entries with exact sizes and CRC-32s,
 * UTF-8 names, DOS times from clip names, the lazy local header (empty,
 * failed and cut-off files), renamed duplicates, and the Zip64-free limits.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import { createZip, MAX_ENTRIES, MAX_BYTES, ZipLimitError } from "../server/zip.js";

const EXPORT_TIME = "2026-11-01T16:05";
const pad = (n) => String(n).padStart(2, "0");
const bytes = (length, seed = 0) => Buffer.from(Array.from({ length }, (_, i) => (i * 7 + seed) % 256));
const dosText = (date, time) => `${1980 + (date >> 9)}-${pad((date >> 5) & 15)}-${pad(date & 31)}` +
  `T${pad(time >> 11)}:${pad((time >> 5) & 63)}:${pad((time & 31) * 2)}`;

// Reads an archive the way unzip tools do, from the end record and the
// central directory, and checks each local header and data descriptor
// against it. Entries must follow each other with nothing in between.
function readZip(buf) {
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, "end record");
  const count = buf.readUInt16LE(end + 10);
  assert.equal(buf.readUInt16LE(end + 8), count);
  const directory = buf.readUInt32LE(end + 16);
  assert.equal(directory + buf.readUInt32LE(end + 12), end, "the central directory runs up to the end record");
  const entries = [];
  let at = directory;
  let next = 0;   // where the next local header must start
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, "central record");
    const central = at;
    const flags = buf.readUInt16LE(at + 8);
    const nameLength = buf.readUInt16LE(at + 28);
    const e = {
      name: buf.toString(flags & 0x800 ? "utf8" : "latin1", at + 46, at + 46 + nameLength),
      flags,
      needs: buf.readUInt16LE(at + 6),
      method: buf.readUInt16LE(at + 10),
      modified: dosText(buf.readUInt16LE(at + 14), buf.readUInt16LE(at + 12)),
      crc: buf.readUInt32LE(at + 16),
      compressed: buf.readUInt32LE(at + 20),
      size: buf.readUInt32LE(at + 24),
      offset: buf.readUInt32LE(at + 42),
    };
    at += 46 + nameLength + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);

    const local = e.offset;
    assert.equal(local, next, `${e.name}: right after the previous entry`);
    assert.equal(buf.readUInt32LE(local), 0x04034b50, "local header");
    assert.equal(buf.readUInt16LE(local + 6), e.flags);
    assert.equal(buf.readUInt16LE(local + 8), e.method);
    assert.equal(buf.readUInt32LE(local + 10), buf.readUInt32LE(central + 12), "the same time and date");
    assert.deepEqual([buf.readUInt32LE(local + 14), buf.readUInt32LE(local + 18), buf.readUInt32LE(local + 22)], [0, 0, 0],
      "CRC and sizes come later, in the data descriptor");
    const localName = buf.readUInt16LE(local + 26);
    assert.equal(buf.toString("utf8", local + 30, local + 30 + localName), e.name);
    const data = local + 30 + localName + buf.readUInt16LE(local + 28);
    e.data = buf.subarray(data, data + e.compressed);
    const descriptor = data + e.compressed;
    assert.equal(buf.readUInt32LE(descriptor), 0x08074b50, "data descriptor");
    assert.deepEqual([1, 2, 3].map((k) => buf.readUInt32LE(descriptor + 4 * k)), [e.crc, e.compressed, e.size]);
    next = descriptor + 16;
    entries.push(e);
  }
  assert.equal(next, directory, "nothing between the last entry and the central directory");
  return entries;
}

// Builds an archive in memory: fn(zip) adds the entries, end() is called here.
function build(fn, options = {}) {
  const parts = [];
  const zip = createZip((buf) => {
    parts.push(buf);
    return true;
  }, { time: EXPORT_TIME, ...options });
  fn(zip, () => Buffer.concat(parts).length);
  zip.end();
  return Buffer.concat(parts);
}

test("stored entries: exact bytes, sizes and CRC-32s, UTF-8 names with accents", () => {
  const clip = bytes(150_000);
  const report = bytes(1234, 5);
  const archive = build((zip) => {
    const a = zip.file("/Entrée Sud/1234_Entrée Sud_202611011558.avi");
    for (let i = 0; i < clip.length; i += 64 * 1024) a.write(clip.subarray(i, i + 64 * 1024));
    a.end();
    const b = zip.file("Rapport d'activité été.pdf");
    b.write(report);
    b.end();
  });
  const entries = readZip(archive);
  assert.deepEqual(entries.map((e) => e.name), ["1234_Entrée Sud_202611011558.avi", "Rapport d'activité été.pdf"]);
  for (const [e, data] of [[entries[0], clip], [entries[1], report]]) {
    assert.equal(e.flags, 0x0808, e.name);
    assert.equal(e.method, 0, `${e.name}: stored`);
    assert.equal(e.needs, 20);
    assert.equal(e.size, data.length);
    assert.equal(e.compressed, data.length);
    assert.equal(e.crc, crc32(data), e.name);
    assert.deepEqual(e.data, data);
  }
  assert.ok(archive.includes(Buffer.from("Rapport d'activité été.pdf", "utf8")), "names are stored as UTF-8");
});

test("DOS times: the recorder's clock from the clip's name, else the export time", () => {
  const names = [
    "1234_Cam 1_202611011558.avi",       // to the minute
    "1234_Cam 2_20261101155813.avi",     // to the second: DOS counts in steps of two
    "12345678_02_1793345412.mp4",        // Unix seconds, an exact UTC moment: no zone-less clock
    "notes.txt",                         // no stamp at all
  ];
  const times = (options) => readZip(build((zip) => names.forEach((n) => zip.file(n).end()), options)).map((e) => e.modified);
  assert.deepEqual(times(), ["2026-11-01T15:58:00", "2026-11-01T15:58:12", "2026-11-01T16:05:00", "2026-11-01T16:05:00"]);
  // A Date is read in the server's own time zone, like the clips' wall clocks.
  assert.deepEqual(times({ time: new Date(2026, 10, 2, 9, 7, 31) }).slice(2), ["2026-11-02T09:07:30", "2026-11-02T09:07:30"]);
});

test("the local header goes out with the first byte: empty, failed and cut-off files", () => {
  const sent = bytes(1000, 9);
  const archive = build((zip, written) => {
    zip.file("empty.txt").end();
    const before = written();
    const failed = zip.file("failed.avi");
    assert.equal(written(), before, "nothing is written before the first byte");
    failed.abort();
    assert.equal(written(), before, "a file that failed before its first byte leaves no trace");
    const cut = zip.file("cut.avi");
    assert.equal(cut.write(sent), true);
    assert.equal(cut.size, 1000);
    cut.abort();
  });
  const entries = readZip(archive);
  assert.deepEqual(entries.map((e) => [e.name, e.size]), [["empty.txt", 0], ["cut.avi", 1000]]);
  assert.equal(entries[0].crc, 0);
  assert.deepEqual(entries[1].data, sent, "a file cut off midway keeps what it sent");
  assert.equal(entries[1].crc, crc32(sent));
});

test("a second file with the same name is renamed, ignoring case", () => {
  const entries = readZip(build((zip) => {
    for (const name of [
      "/Cam 1/1234_Cam 1_202611011558.avi", "/Cam 2/1234_Cam 1_202611011558.avi", "/Cam 3/1234_CAM 1_202611011558.AVI",
      "README", "/Old/README", "x.tar.gz", "/Old/x.tar.gz", ".profile", "/Old/.profile",
    ]) {
      zip.file(name).end();
    }
    zip.file("/Old/freed.txt").abort();   // left out: its name is free again
    zip.file("freed.txt").end();
  }));
  assert.deepEqual(entries.map((e) => e.name), [
    "1234_Cam 1_202611011558.avi", "1234_Cam 1_202611011558 (2).avi", "1234_CAM 1_202611011558 (3).AVI",
    "README", "README (2)", "x.tar.gz", "x.tar (2).gz", ".profile", ".profile (2)", "freed.txt",
  ]);
  assert.equal(entries[1].modified, "2026-11-01T15:58:00", "the time still comes from the clip's own name");
});

test("write() passes backpressure on, and entries go one at a time", () => {
  const zip = createZip(() => false, { time: EXPORT_TIME });
  const a = zip.file("a.bin");
  assert.equal(a.write(bytes(10)), false, "false: wait for drain");
  assert.throws(() => zip.file("b.bin"), /one entry at a time/);
  assert.throws(() => zip.end(), /after the last entry/);
  a.end();
  assert.throws(() => a.write(bytes(1)), /closed/);
  zip.end();
  assert.throws(() => zip.file("c.bin"), /before end/);
});

test("at most 65,535 entries: there is no Zip64", () => {
  assert.equal(MAX_ENTRIES, 65_535);
  const archive = build((zip) => {
    for (let i = 0; i < MAX_ENTRIES; i++) zip.file(`f${i}`).end();
    assert.equal(zip.full, false);
    assert.throws(() => zip.file("one more"), ZipLimitError);
    assert.equal(zip.full, true);
  });
  assert.equal(archive.readUInt16LE(archive.length - 22 + 10), MAX_ENTRIES);
});

test("at most 2 GiB: the archive never outgrows maxBytes, and the last entry may use the reserve", () => {
  assert.equal(MAX_BYTES, 2 ** 31);
  const maxBytes = 1000;
  const archive = build((zip) => {
    const a = zip.file("a.bin");
    let refused = null;
    for (let i = 0; i < 20 && !refused; i++) {
      try {
        a.write(bytes(100, i));
      } catch (err) {
        refused = err;
      }
    }
    assert.ok(refused instanceof ZipLimitError, "a write past the limit is refused");
    assert.equal(zip.full, true);
    assert.equal(a.size, 400, "every write that fitted went in");
    a.abort();
    // A streamed file can't touch the reserve...
    const b = zip.file("b.bin");
    assert.throws(() => b.write(bytes(250)), ZipLimitError);
    b.abort();
    // ...which keeps the room for a last entry, such as a list of errors.
    assert.throws(() => zip.add("ERRORS.txt", bytes(5000)), ZipLimitError);
    zip.add("ERRORS.txt", bytes(250, 1));
  }, { maxBytes, reserve: 400 });
  assert.ok(archive.length <= maxBytes, `${archive.length} bytes`);
  const entries = readZip(archive);
  assert.deepEqual(entries.map((e) => [e.name, e.size]), [["a.bin", 400], ["ERRORS.txt", 250]]);
  assert.equal(entries[0].crc, crc32(Buffer.concat([0, 1, 2, 3].map((i) => bytes(100, i)))));
});
