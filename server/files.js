/*
 * files.js - small filesystem and JSON helpers shared by the stores and the CLI.
 *
 *   readJson(file, fallback)            parsed JSON, or `fallback` if the file is missing
 *   writeFileAtomic(file, data, mode)   write a temp file, then rename it over the target
 *   splitJsonObjects(text)              top-level {...} objects found in a text stream
 *
 * The rename makes every write all-or-nothing: a crash or a full disk can
 * leave a stray *.tmp file behind, but never a half-written JSON file.
 */

import { readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";

export async function readJson(file, fallback) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
  // Tolerate a BOM: files hand-edited on Windows often carry one.
  return JSON.parse(text.replace(/^﻿/, ""));
}

export async function writeFileAtomic(file, data, mode = 0o600) {
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(tmp, data, { mode });
    await rename(tmp, file);
  } catch (err) {
    await rm(tmp, { force: true });
    throw err;
  }
}

// `cat *.json` yields JSON objects back to back (possibly with BOMs between
// them), which is not valid JSON as a whole: cut out each top-level object.
export function splitJsonObjects(text) {
  const out = [];
  let depth = 0, start = -1, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
    } else if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth++ === 0) start = i;
    } else if (ch === "}" && depth > 0) {
      if (--depth === 0) out.push(text.slice(start, i + 1));
    }
  }
  return out;
}
