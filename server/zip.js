/*
 * zip.js - a streaming ZIP writer. Files are stored as they are, without
 * compression (camera clips don't shrink anyway), so an archive goes out as
 * fast as its files arrive and is never held in memory. No FTP here:
 * gateway.zip in server/ftp.js feeds it.
 *
 *   createZip(write, { time, maxBytes, reserve })   -> zip
 *     write(buffer)          receives the archive piece by piece; false means
 *                            "wait for drain", as with res.write
 *     time                   the export time: a Date, or wall-clock text
 *     zip.file(name)         -> entry for the next file; only the basename counts
 *       entry.write(chunk)   -> what write() returned
 *       entry.end()          the file is complete (an empty one too)
 *       entry.abort()        the file failed: the bytes it sent stay, as far
 *                            as they came; an entry without any is left out
 *       entry.name / .size   its name in the archive, its bytes so far
 *     zip.add(name, data)    a whole entry from memory, the archive's last: it
 *                            may use the `reserve` bytes the others leave free
 *     zip.end()              the central directory and the end record
 *     zip.full               a limit refused something: nothing more fits
 *   MAX_ENTRIES, MAX_BYTES   65,535 entries and 2 GiB: there is no Zip64
 *   ZipLimitError            what file(), write(), end() and add() throw past them
 *
 * Each entry is a local header, sent with the entry's first byte (so a file
 * that fails before sending any is simply left out, the way pipeFile in
 * ftp.js holds back HTTP headers), its bytes, and a data descriptor with the
 * CRC-32 and size, which the central directory repeats. Flags 0x0808: the
 * sizes follow the data (bit 3), the name is UTF-8 (bit 11).
 *
 * Two files with the same name (from different folders) become "clip.avi"
 * and "clip (2).avi", ignoring case as Windows does. An entry's time is the
 * recorder's own clock when its name carries one (parseClip in
 * public/js/clips.js), else the export time: DOS times have no time zone, so
 * an exact moment in UTC ("..._1793345412.mp4") gets the export time too.
 */

import { crc32 } from "node:zlib";
import { parseClip } from "../public/js/clips.js";

export const MAX_ENTRIES = 65_535;
// Offsets are 32-bit; under 2^31 even readers that take them as signed cope.
export const MAX_BYTES = 2 * 1024 ** 3;

export class ZipLimitError extends Error {}

const LOCAL = 30, DESCRIPTOR = 16, CENTRAL = 46, END = 22;   // fixed parts of the records
const VERSION = 20;       // 2.0 (data descriptors), made by MS-DOS: no Unix modes
const FLAGS = 0x0808;
const DOS_1980 = { date: (1 << 5) | 1, time: 0 };   // 1980-01-01 00:00, the earliest DOS date
const pad = (n) => String(n).padStart(2, "0");

// DOS date and time (two-second steps) of wall-clock text: "2026-10-30T08:30"
// or "2026-10-30T08:30:12". null for anything else, a time zone included.
function dosTime(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(String(text ?? ""));
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => Number(v ?? 0));
  if (year < 1980 || year > 2107 || month < 1 || month > 12 || day < 1 || day > 31 ||
    hour > 23 || minute > 59 || second > 59) return null;
  return { date: ((year - 1980) << 9) | (month << 5) | day, time: (hour << 11) | (minute << 5) | (second >> 1) };
}

const wallClock = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
  `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/* ---- records ---- */

function localHeader(e) {
  const b = Buffer.alloc(LOCAL);
  b.writeUInt32LE(0x04034b50, 0);
  b.writeUInt16LE(VERSION, 4);
  b.writeUInt16LE(FLAGS, 6);
  b.writeUInt16LE(0, 8);                  // stored
  b.writeUInt16LE(e.time, 10);
  b.writeUInt16LE(e.date, 12);
  // CRC-32 and sizes stay 0 here: the data descriptor has them.
  b.writeUInt16LE(e.nameBytes.length, 26);
  return Buffer.concat([b, e.nameBytes]);
}

function descriptor(e) {
  const b = Buffer.alloc(DESCRIPTOR);
  b.writeUInt32LE(0x08074b50, 0);
  b.writeUInt32LE(e.crc, 4);
  b.writeUInt32LE(e.size, 8);             // stored: compressed size = size
  b.writeUInt32LE(e.size, 12);
  return b;
}

function centralHeader(e) {
  const b = Buffer.alloc(CENTRAL);
  b.writeUInt32LE(0x02014b50, 0);
  b.writeUInt16LE(VERSION, 4);            // made by
  b.writeUInt16LE(VERSION, 6);            // needed to extract
  b.writeUInt16LE(FLAGS, 8);
  b.writeUInt16LE(0, 10);
  b.writeUInt16LE(e.time, 12);
  b.writeUInt16LE(e.date, 14);
  b.writeUInt32LE(e.crc, 16);
  b.writeUInt32LE(e.size, 20);
  b.writeUInt32LE(e.size, 24);
  b.writeUInt16LE(e.nameBytes.length, 28);
  // No extra field or comment, disk 0, no attributes.
  b.writeUInt32LE(e.at, 42);              // where its local header starts
  return Buffer.concat([b, e.nameBytes]);
}

function endRecord(count, size, at) {
  const b = Buffer.alloc(END);
  b.writeUInt32LE(0x06054b50, 0);
  b.writeUInt16LE(count, 8);              // entries on this disk
  b.writeUInt16LE(count, 10);             // entries in all
  b.writeUInt32LE(size, 12);              // the central directory's size
  b.writeUInt32LE(at, 16);                // and where it starts
  return b;
}

/* ---- writer ---- */

export function createZip(write, { time = new Date(), maxBytes = MAX_BYTES, reserve = 0 } = {}) {
  const exportTime = dosTime(typeof time === "string" ? time : wallClock(time)) ?? DOS_1980;
  const entries = [];       // in the archive, for the central directory
  const taken = new Set();  // their names, lower-cased
  let offset = 0;           // bytes written so far
  let central = 0;          // size of their central directory
  let current = null;       // the entry being written
  let ended = false;
  let full = false;

  const out = (buf) => {
    offset += buf.length;
    return write(buf);
  };

  function refuse(message) {
    full = true;
    throw new ZipLimitError(message);
  }

  // Refuses `bytes` more for `e` unless its data descriptor, every central
  // record, the end record and (except for the last entry) the reserve
  // still fit after them.
  function check(e, bytes) {
    const total = offset + bytes + DESCRIPTOR + central + CENTRAL + e.nameBytes.length + END + e.keep;
    if (total > maxBytes) refuse(`A ZIP archive without Zip64 stays within ${maxBytes} bytes`);
  }

  // "clip.avi", then "clip (2).avi", "clip (3).avi"...
  function uniqueName(base) {
    const dot = base.lastIndexOf(".");
    const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ""];
    let name = base;
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${stem} (${n})${ext}`;
    taken.add(name.toLowerCase());
    return name;
  }

  function open(rawName, keep) {
    if (ended || current) throw new Error("zip: one entry at a time, before end()");
    if (entries.length >= MAX_ENTRIES) refuse(`A ZIP archive without Zip64 holds at most ${MAX_ENTRIES} entries`);
    const base = String(rawName).split(/[\\/]/).pop();
    if (!base || base === "." || base === "..") throw new Error(`zip: not a file name: ${JSON.stringify(rawName)}`);
    const name = uniqueName(base);
    const nameBytes = Buffer.from(name, "utf8");
    if (nameBytes.length > 0xffff) throw new Error("zip: file name too long");
    // The time comes from the name as it was, not as renamed: "clip (2).avi" has no stamp.
    const e = { name, nameBytes, ...(dosTime(parseClip(base)?.time) ?? exportTime), crc: 0, size: 0, at: -1, keep };
    current = e;
    return handle(e);
  }

  function start(e) {
    e.at = offset;
    out(localHeader(e));
  }

  function finish(e) {
    const flushed = out(descriptor(e));
    entries.push(e);
    central += CENTRAL + e.nameBytes.length;
    current = null;
    return flushed;
  }

  function handle(e) {
    const isOpen = () => {
      if (current !== e) throw new Error("zip: this entry is closed");
    };
    return {
      name: e.name,
      get size() {
        return e.size;
      },
      write(chunk) {
        isOpen();
        if (!chunk.length) return true;
        check(e, (e.at < 0 ? LOCAL + e.nameBytes.length : 0) + chunk.length);
        if (e.at < 0) start(e);
        e.crc = crc32(chunk, e.crc);
        e.size += chunk.length;
        return out(chunk);
      },
      end() {
        isOpen();
        if (e.at < 0) {            // an empty file: its header goes out now
          check(e, LOCAL + e.nameBytes.length);
          start(e);
        }
        return finish(e);
      },
      abort() {
        if (current !== e) return;
        if (e.at >= 0) return finish(e);
        taken.delete(e.name.toLowerCase());
        current = null;
      },
    };
  }

  return {
    get full() {
      return full;
    },

    file: (name) => open(name, reserve),

    add(name, data) {
      const entry = open(name, 0);
      try {
        entry.write(data);
        return entry.end();
      } catch (err) {
        entry.abort();
        throw err;
      }
    },

    end() {
      if (ended || current) throw new Error("zip: end() once, after the last entry");
      ended = true;
      const at = offset;
      const directory = Buffer.concat(entries.map(centralHeader));
      return out(Buffer.concat([directory, endRecord(entries.length, directory.length, at)]));
    },
  };
}
