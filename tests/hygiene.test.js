/*
 * hygiene.test.js - keep the 2026-04-21 leak from ever repeating. The
 * repository is public, so it must not track runtime data (shortcut JSON,
 * data.csv, data/, .env) nor any routable IPv4 address.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");

function trackedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8" }).split("\0").filter(Boolean);
  } catch {
    return null;   // not a git checkout (e.g. a source tarball)
  }
}
const files = trackedFiles();
const skip = !files && "not a git checkout";

const FORBIDDEN = [
  /(^|\/)config\/shortcuts\/(?!\.gitkeep$)/,
  /(^|\/)config\/data\.csv$/,
  /(^|\/)data\//,
  /(^|\/)\.env$/,
];

// Fine in source: loopback, RFC 1918 private, RFC 5737 documentation, 0.0.0.0.
function allowed([a, b, c]) {
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 192 && b === 0 && c === 2) || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113) || (a === 0 && b === 0 && c === 0);
}

test("no runtime data or credentials are tracked", { skip }, () => {
  assert.deepEqual(files.filter((f) => FORBIDDEN.some((re) => re.test(f))), []);
});

test("tracked files contain no routable IPv4 address", { skip }, () => {
  const hits = [];
  for (const file of files) {
    let text;
    try {
      text = readFileSync(path.join(ROOT, file), "utf8");
    } catch {
      continue;   // deleted in the working tree
    }
    if (text.includes("\0")) continue;   // binary
    text.split(/\r?\n/).forEach((line, i) => {
      for (const m of line.matchAll(/(?<![\d.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\d.])/g)) {
        const octets = m.slice(1, 5).map(Number);
        if (octets.some((o) => o > 255) || allowed(octets)) continue;
        hits.push(`${file}:${i + 1} ${octets[0]}.x.x.x`);   // masked: never echo the address
      }
    });
  }
  assert.deepEqual(hits, [], "use RFC 5737 addresses (192.0.2.x, 198.51.100.x, 203.0.113.x) in examples");
});
