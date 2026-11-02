/*
 * api.js - the browser's only way to the server. Replaces the HTA's
 * shell.js / config.js / ftp.js, which drove the filesystem and curl.
 *
 *   me()                              { username, role, defaults? }
 *   shortcuts()                       [{ id, label, (host, port, username) }]
 *   createShortcut(fields)            -> id
 *   updateShortcut(id, fields)        -> id (changes when the username does)
 *   deleteShortcut(id)
 *   users()                           [{ name, role }] (admins)
 *   createUser({ name, role, password }), updateUser(name, { role?, password? }), deleteUser(name)
 *   listDir(id, path, { auto })       [{ name, isDir, isLink, size, date, modified }];
 *                                     auto: the page's own check for new files
 *   fileUrl(id, path, { download })   URL for <img>, <video>, links
 *   playUrl(id, path)                 URL of a video as an MP4 the browser can play
 *   prepareZip(id, paths, localTime)  { url, count, name }: a one-time link to those files as one ZIP
 *
 * Failures throw ApiError (status + the server's message). A 401 means the
 * session is over: the page goes back to the sign-in screen.
 */

import { t } from "./i18n.js";

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
    throw new ApiError(0, t("api.unreachable"));
  }
  if (res.status === 401) {
    // Keep the fragment: after signing in again, the same folder reopens.
    location.assign("/login?error=expired" + location.hash);
    throw new ApiError(401, t("auth.error.expired"));
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || t("api.failed", { status: String(res.status) }));
  return data;
}

const shortcutUrl = (id) => `/api/shortcuts/${encodeURIComponent(id)}`;

export const me = () => call("GET", "/api/me");

export const shortcuts = async () => (await call("GET", "/api/shortcuts")).shortcuts;

export const createShortcut = async (fields) => (await call("POST", "/api/shortcuts", fields)).id;

export const updateShortcut = async (id, fields) => (await call("PUT", shortcutUrl(id), fields)).id;

export const deleteShortcut = (id) => call("DELETE", shortcutUrl(id));

const userUrl = (name) => `/api/users/${encodeURIComponent(name)}`;
export const users = async () => (await call("GET", "/api/users")).users;
export const createUser = (fields) => call("POST", "/api/users", fields);
export const updateUser = (name, fields) => call("PUT", userUrl(name), fields);
export const deleteUser = (name) => call("DELETE", userUrl(name));

export const listDir = async (id, path, { auto = false } = {}) =>
  (await call("GET", `${shortcutUrl(id)}/list?path=${encodeURIComponent(path)}${auto ? "&auto=1" : ""}`)).entries;

export function fileUrl(id, path, { download = false } = {}) {
  return `${shortcutUrl(id)}/file?path=${encodeURIComponent(path)}${download ? "&download=1" : ""}`;
}

export function playUrl(id, path) {
  return `${shortcutUrl(id)}/play?path=${encodeURIComponent(path)}`;
}

// The server checks the list and answers with a link that works once, for
// a couple of minutes; the browser's download list then shows the progress.
export const prepareZip = (id, paths, localTime) => call("POST", `${shortcutUrl(id)}/zip`, { paths, localTime });
