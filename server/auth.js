/*
 * auth.js - personal accounts, password hashing and stateless sessions.
 *
 *   hashPassword(password) / verifyPassword(password, hash)
 *   createUserStore(file)   list() get(name) authenticate(name, password)
 *                           add(name, password, role) setPassword(name, pw)
 *                           setRole(name, role) remove(name)
 *   createSessions({ users, secret, ttlHours, now })
 *                           issue(user) -> token, verify(token) -> {name, role} | null
 *   loadSessionSecret(dataDir, configured)   SESSION_SECRET or data/session.secret
 *   createLimiter({ max, windowMs, now })    blocked(key) fail(key) reset(key)
 *
 * users.json: { "users": { "<name>": { "role": "admin" | "user", "hash": "scrypt$..." } } }
 * It is re-read whenever it changes on disk, so accounts edited with the CLI
 * apply to the running server immediately.
 *
 * A session token is base64url(JSON { u, exp, v }) + "." + its HMAC-SHA256.
 * `v` fingerprints the user's password hash, so removing a user or changing
 * their password ends their sessions at once without a server-side session
 * table; sessions therefore survive restarts and redeploys.
 */

import { scrypt as scryptCb, randomBytes, timingSafeEqual, createHmac, createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { readJson, writeFileAtomic } from "./files.js";

const scrypt = promisify(scryptCb);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };   // ~32 MiB per hash
const KEY_LEN = 32;
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const MIN_PASSWORD_LENGTH = 10;
export const ROLES = ["admin", "user"];

/* ---- passwords ---- */

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(String(password), salt, KEY_LEN, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password, hash) {
  const [alg, N, r, p, salt, key] = String(hash).split("$");
  const expected = Buffer.from(key || "", "base64url");
  // A truncated hash must never "match" an equally empty derived key.
  if (alg !== "scrypt" || !salt || expected.length < 16) return false;
  const actual = await scrypt(String(password), Buffer.from(salt, "base64url"), expected.length,
    { N: Number(N), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return timingSafeEqual(actual, expected);
}

function normalizeName(name) {
  return String(name ?? "").trim().toLowerCase();
}

function validName(name) {
  const n = normalizeName(name);
  if (!USERNAME_RE.test(n)) {
    throw new Error("Usernames are 1-64 characters: a-z, 0-9, '.', '_' or '-', starting with a letter or digit");
  }
  return n;
}

function validPassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  return password;
}

function validRole(role) {
  if (!ROLES.includes(role)) throw new Error(`Role must be one of: ${ROLES.join(", ")}`);
  return role;
}

/* ---- user store ---- */

export function createUserStore(file) {
  let cache = null;   // { key, users } - key changes whenever the file is replaced
  let dummyHash = null;

  async function load() {
    let st;
    try {
      st = await stat(file);
    } catch (err) {
      if (err.code === "ENOENT") return {};
      throw err;
    }
    const key = `${st.mtimeMs}:${st.size}:${st.ino}`;
    if (!cache || cache.key !== key) cache = { key, users: (await readJson(file, {})).users || {} };
    return cache.users;
  }

  async function update(mutate) {
    const users = { ...(await load()) };
    await mutate(users);
    await writeFileAtomic(file, JSON.stringify({ users }, null, 2) + "\n");
    cache = null;
  }

  async function existing(name) {
    const n = normalizeName(name);
    if (!Object.hasOwn(await load(), n)) throw new Error(`No account named "${n}"`);
    return n;
  }

  async function get(name) {
    const users = await load();
    const n = normalizeName(name);
    return Object.hasOwn(users, n) ? { name: n, role: users[n].role, hash: users[n].hash } : null;
  }

  return {
    get,

    async list() {
      const users = await load();
      return Object.keys(users).sort().map((name) => ({ name, role: users[name].role }));
    },

    // Unknown usernames still pay for one scrypt run, so response timing
    // doesn't reveal which accounts exist.
    async authenticate(name, password) {
      const n = normalizeName(name);
      const user = USERNAME_RE.test(n) ? await get(n) : null;
      if (!user) {
        dummyHash ??= await hashPassword(randomBytes(16).toString("hex"));
        await verifyPassword(String(password ?? ""), dummyHash);
        return null;
      }
      return (await verifyPassword(String(password ?? ""), user.hash)) ? user : null;
    },

    async add(name, password, role = "user") {
      const n = validName(name);
      validPassword(password);
      validRole(role);
      await update(async (users) => {
        if (Object.hasOwn(users, n)) throw new Error(`An account named "${n}" already exists`);
        users[n] = { role, hash: await hashPassword(password) };
      });
      return n;
    },

    async setPassword(name, password) {
      const n = await existing(name);
      validPassword(password);
      await update(async (users) => { users[n] = { ...users[n], hash: await hashPassword(password) }; });
    },

    async setRole(name, role) {
      const n = await existing(name);
      validRole(role);
      await update((users) => { users[n] = { ...users[n], role }; });
    },

    async remove(name) {
      const n = await existing(name);
      await update((users) => { delete users[n]; });
    },
  };
}

/* ---- sessions ---- */

function safeEqual(a, b) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createSessions({ users, secret, ttlHours, now = Date.now }) {
  const ttlMs = ttlHours * 3600 * 1000;
  const sign = (payload) => createHmac("sha256", secret).update(payload).digest("base64url");
  const fingerprint = (hash) => createHash("sha256").update(String(hash)).digest("base64url").slice(0, 16);

  return {
    ttlSeconds: ttlHours * 3600,

    issue(user) {
      const body = { u: user.name, exp: now() + ttlMs, v: fingerprint(user.hash) };
      const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
      return `${payload}.${sign(payload)}`;
    },

    async verify(token) {
      const [payload, sig, extra] = String(token ?? "").split(".");
      if (!payload || !sig || extra !== undefined || !safeEqual(sig, sign(payload))) return null;
      let data;
      try {
        data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      } catch {
        return null;
      }
      if (typeof data?.u !== "string" || typeof data.exp !== "number" || data.exp <= now()) return null;
      const user = await users.get(data.u);
      if (!user || fingerprint(user.hash) !== data.v) return null;
      return { name: user.name, role: user.role };
    },
  };
}

export async function loadSessionSecret(dataDir, configured) {
  if (configured) return configured;
  const file = path.join(dataDir, "session.secret");
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing.length >= 32) return existing;
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }
  const secret = randomBytes(32).toString("base64url");
  await writeFileAtomic(file, secret + "\n");
  return secret;
}

/* ---- login throttling ---- */

export function createLimiter({ max = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map();   // key -> { count, until }

  function current(key) {
    const h = hits.get(key);
    if (h && h.until <= now()) {
      hits.delete(key);
      return null;
    }
    return h || null;
  }

  return {
    blocked(key) {
      const h = current(key);
      return !!h && h.count >= max;
    },
    fail(key) {
      const h = current(key);
      if (h) h.count++;
      else hits.set(key, { count: 1, until: now() + windowMs });
      if (hits.size > 10000) for (const k of hits.keys()) current(k);   // sweep expired entries
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
