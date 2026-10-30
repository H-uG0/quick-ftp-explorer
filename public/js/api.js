/*
 * api.js - the browser's only way to the server. Replaces the HTA's
 * shell.js / config.js / ftp.js, which drove the filesystem and curl.
 *
 *   me()                              { username, role, defaults? }
 *   shortcuts()                       [{ id, label, (host, port, username) }]
 *   createShortcut(fields)            -> id
 *   updateShortcut(id, fields)        -> id (changes when the username does)
 *   deleteShortcut(id)
 *   listDir(id, path)                 [{ name, isDir, isLink, size, date }]
 *   fileUrl(id, path, { download })   URL for <img>, <video>, links
 *   playUrl(id, path)                 URL of a video as an MP4 the browser can play
 *
 * Failures throw ApiError (status + the server's message). A 401 means the
 * session is over: the page goes back to the sign-in screen.
 */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      // Every write to /api must be JSON; the server refuses anything else.
      headers: method === "GET" ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "The server can't be reached. Check your connection and try again.");
  }
  if (res.status === 401) {
    // Keep the fragment: after signing in again, the same folder reopens.
    location.assign("/login?error=expired" + location.hash);
    throw new ApiError(401, "Your session has expired.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data;
}

const shortcutUrl = (id) => `/api/shortcuts/${encodeURIComponent(id)}`;

export const me = () => call("GET", "/api/me");

export const shortcuts = async () => (await call("GET", "/api/shortcuts")).shortcuts;

export const createShortcut = async (fields) => (await call("POST", "/api/shortcuts", fields)).id;

export const updateShortcut = async (id, fields) => (await call("PUT", shortcutUrl(id), fields)).id;

export const deleteShortcut = (id) => call("DELETE", shortcutUrl(id));

export const listDir = async (id, path) =>
  (await call("GET", `${shortcutUrl(id)}/list?path=${encodeURIComponent(path)}`)).entries;

export function fileUrl(id, path, { download = false } = {}) {
  return `${shortcutUrl(id)}/file?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

export function playUrl(id, path) {
  return `${shortcutUrl(id)}/play?path=${encodeURIComponent(path)}`;
}
