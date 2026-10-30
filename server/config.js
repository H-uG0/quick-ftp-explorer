/*
 * config.js - runtime configuration, read once from environment variables.
 *
 *   loadConfig(env)   frozen config object; throws on invalid values
 *
 * Every setting has a working default so `npm run dev` needs no .env file.
 * Defaults are deliberately generic: the repository is public and must never
 * carry deployment-specific hosts or credentials.
 */

import path from "node:path";

function int(value, fallback, min, max, name) {
  if (value === undefined || value === "") return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max} (got "${value}")`);
  }
  return n;
}

function bool(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

export function loadConfig(env = process.env) {
  const sessionSecret = env.SESSION_SECRET || "";
  if (sessionSecret && sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters (or unset, to auto-generate one)");
  }
  return Object.freeze({
    host: env.HOST || "127.0.0.1",
    port: int(env.PORT, 8080, 0, 65535, "PORT"),
    dataDir: path.resolve(env.DATA_DIR || "data"),
    trustProxy: bool(env.TRUST_PROXY),
    sessionSecret,
    sessionTtlHours: int(env.SESSION_TTL_HOURS, 12, 1, 24 * 30, "SESSION_TTL_HOURS"),
  });
}
