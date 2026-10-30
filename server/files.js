/*
 * files.js - small filesystem helpers shared by the stores.
 *
 *   readJson(file, fallback)            parsed JSON, or `fallback` if the file is missing
 *   writeFileAtomic(file, data, mode)   write a temp file, then rename it over the target
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
