/*
 * store.js - FTP shortcuts, one JSON file per shortcut in data/shortcuts/.
 *
 *   createShortcutStore(dir, { allowedHosts })
 *     list()             [{id, label, host, port, username}] by label (no passwords)
 *     get(id)            full record including the password, or null
 *     create(input)      -> id; 409 if a shortcut with that id exists
 *     update(id, input)  -> id (changes when the username does); 404 / 409
 *     remove(id)         404 if missing
 *   sanitizeId(username) file-safe id; the same rule as the legacy HTA
 *
 * The file format is the legacy HTA's config/shortcuts/*.json, so existing
 * shortcuts import as they are:
 *   { "label": "...", "host": "...", "port": 21, "username": "...", "password": "..." }
 *
 * Validation errors are HttpErrors (400 / 404 / 409), so routes can let them
 * through and the CLI can print their messages.
 */

import path from "node:path";
import { mkdir, readdir, rm } from "node:fs/promises";
import { readJson, writeFileAtomic } from "./files.js";
import { HttpError } from "./http.js";
import { msg } from "../public/js/i18n.js";

const CONTROL_CHARS = /[\x00-\x1f\x7f]/;
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9.:-]*$/;
const ID_RE = /^[A-Za-z0-9._-]+$/;

export function sanitizeId(username) {
  return String(username).replace(/[^A-Za-z0-9._-]/g, "_");
}

function text(value, field, max, { required = false } = {}) {
  const s = String(value ?? "").trim();
  if (required && !s) throw new HttpError(400, msg("err.required", { field }));
  if (s.length > max) throw new HttpError(400, msg("err.tooLong", { field, max }));
  // CR/LF would let a value smuggle extra commands into the FTP session.
  if (CONTROL_CHARS.test(s)) throw new HttpError(400, msg("err.controlChars", { field }));
  return s;
}

// Turns form/API/import input into a clean record. `existing` is the record
// being edited, if any: a blank password keeps the stored one, but only while
// host and port stay the same. Otherwise anyone able to edit a shortcut could
// point it at their own server and receive the stored password at login.
export function validateShortcut(input, { allowedHosts = [], existing = null } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new HttpError(400, msg("err.expectedShortcut"));
  const username = text(input.username, msg("field.username"), 128, { required: true });
  const host = text(input.host, msg("field.host"), 253, { required: true });
  if (!HOST_RE.test(host)) throw new HttpError(400, msg("err.badHost"));
  if (allowedHosts.length && !allowedHosts.includes(host.toLowerCase())) {
    throw new HttpError(400, msg("err.hostNotInList", { host }));
  }
  const rawPort = input.port ?? 21;
  const port = Number(rawPort === "" ? 21 : rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(400, msg("err.badPort"));
  }
  const label = text(input.label, msg("field.label"), 200) || username;

  // Passwords are taken as typed (no trimming): spaces may be significant.
  let password = String(input.password ?? "");
  if (password.length > 256) throw new HttpError(400, msg("err.passwordTooLong"));
  if (CONTROL_CHARS.test(password)) throw new HttpError(400, msg("err.passwordControl"));
  if (!password) {
    if (!existing) {
      password = username;   // the HTA's default: password = username
    } else if (existing.host.toLowerCase() === host.toLowerCase() && existing.port === port) {
      password = existing.password;
    } else {
      throw new HttpError(400, msg("err.reenterPassword"));
    }
  }
  return { label, host, port, username, password };
}

export function createShortcutStore(dir, { allowedHosts = [] } = {}) {
  const fileFor = (id) => path.join(dir, `${id}.json`);

  async function get(id) {
    if (!ID_RE.test(String(id))) return null;
    let raw;
    try {
      raw = await readJson(fileFor(id), null);
    } catch {
      return null;   // malformed file: treat as missing (list() warns about it)
    }
    if (!raw || typeof raw !== "object") return null;
    return {
      id,
      label: String(raw.label ?? raw.username ?? id),
      host: String(raw.host ?? ""),
      port: Number(raw.port) || 21,
      username: String(raw.username ?? ""),
      password: String(raw.password ?? ""),
    };
  }

  async function write(record) {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const { label, host, port, username, password } = record;
    await writeFileAtomic(fileFor(sanitizeId(username)),
      JSON.stringify({ label, host, port, username, password }, null, 2) + "\n");
  }

  return {
    get,

    async list() {
      let names;
      try {
        names = await readdir(dir);
      } catch (err) {
        if (err.code === "ENOENT") return [];
        throw err;
      }
      const out = [];
      for (const name of names) {
        if (!name.endsWith(".json")) continue;
        const sc = await get(name.slice(0, -5));
        if (!sc) {
          console.warn(`store: skipping unreadable shortcut file ${name}`);
          continue;
        }
        const { password, ...visible } = sc;
        out.push(visible);
      }
      return out.sort((a, b) => a.label.toLowerCase().localeCompare(b.label.toLowerCase()));
    },

    async create(input) {
      const record = validateShortcut(input, { allowedHosts });
      const id = sanitizeId(record.username);
      if (await get(id)) throw new HttpError(409, msg("err.duplicate", { username: record.username }));
      await write(record);
      return id;
    },

    // A username change is a rename: the new file is written first and the
    // old one removed only afterwards, so a failure never loses the shortcut.
    async update(id, input) {
      const existing = await get(id);
      if (!existing) throw new HttpError(404, msg("err.noShortcut"));
      const record = validateShortcut(input, { allowedHosts, existing });
      const newId = sanitizeId(record.username);
      if (newId !== id && await get(newId)) {
        throw new HttpError(409, msg("err.duplicate", { username: record.username }));
      }
      await write(record);
      if (newId !== id) await rm(fileFor(id), { force: true });
      return newId;
    },

    async remove(id) {
      if (!await get(id)) throw new HttpError(404, msg("err.noShortcut"));
      await rm(fileFor(id), { force: true });
    },
  };
}
