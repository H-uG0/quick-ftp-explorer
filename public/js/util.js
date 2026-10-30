/*
 * util.js - small pure helpers shared by the UI modules. No DOM access, so
 * the test suite can import them.
 *
 *   joinPath(parent, name)          "/a" + "b" -> "/a/b"
 *   formatSize(bytes)               "12.3 MB"
 *   sortEntries(entries)            folders first, then natural, case-insensitive order
 *   filterEntries(entries, text)    case-insensitive substring match on names
 *   splitLabel(label, username)     the custom part of "<username> <custom>"
 *   composeLabel(username, custom)  the reverse
 *   formatHash(id, path)            "#/<shortcut id>/<folder>/<folder>", each part URL-encoded
 *   parseHash(hash)                 the reverse: { id, path }, or null
 */

// Natural order: "clip 2" sorts before "clip 10", as people expect.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function joinPath(parent, name) {
  if (!parent || parent === "/") return "/" + name;
  return parent.replace(/\/+$/, "") + "/" + name;
}

export function formatSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + " B";
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 ** 3) return (n / 1024 ** 2).toFixed(1) + " MB";
  return (n / 1024 ** 3).toFixed(2) + " GB";
}

export function sortEntries(entries) {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return collator.compare(a.name, b.name);
  });
}

export function filterEntries(entries, text) {
  const q = String(text ?? "").trim().toLowerCase();
  return q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
}

// Labels are "<username> <custom text>", so Edit can prefill both fields:
//   "main-nvr Main office" + "main-nvr" -> "Main office"
//   "main-nvr"             + "main-nvr" -> ""
//   anything else                       -> the whole label
export function splitLabel(label, username) {
  if (label === username) return "";
  return label.startsWith(username + " ") ? label.slice(username.length + 1) : label;
}

export function composeLabel(username, custom) {
  return custom ? `${username} ${custom}` : username;
}

// The URL fragment names the open folder, so links can be bookmarked or
// shared and the browser's Back / Forward buttons move between folders.
export function formatHash(id, path) {
  const segments = String(path).split("/").filter(Boolean).map(encodeURIComponent);
  return `#/${encodeURIComponent(id)}/${segments.join("/")}`;
}

export function parseHash(hash) {
  const [empty, id, ...segments] = String(hash ?? "").replace(/^#/, "").split("/");
  if (empty !== "" || !id) return null;
  try {
    const parts = segments.filter(Boolean).map(decodeURIComponent);
    if (parts.some((p) => p === "." || p === "..")) return null;
    return { id: decodeURIComponent(id), path: "/" + parts.join("/") };
  } catch {
    return null;   // malformed %-escapes
  }
}
