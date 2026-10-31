/*
 * util.js - small pure helpers shared by the UI modules. No DOM access, so
 * the test suite can import them.
 *
 *   joinPath(parent, name)          "/a" + "b" -> "/a/b"
 *   compareEntries(a, b)            folders first, then natural, case-insensitive order
 *   sortEntries(entries)            a sorted copy
 *   fold(text)                      { text, from }: lower case, no accents, mapped back
 *   searchTerms(query)              the folded words of a search
 *   matchFolded(folded, terms)      null, or the ranges to highlight: every word must match
 *   matchName(name, terms)          the same, from a plain name
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

export function compareEntries(a, b) {
  if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
  return collator.compare(a.name, b.name);
}

export function sortEntries(entries) {
  return [...entries].sort(compareEntries);
}

// Search ignores case and accents: "ete" finds "Été". For each character of
// the folded text, `from` keeps its index in the original, so a match can be
// highlighted there; its last item is the original's length.
export function fold(text) {
  let folded = "";
  const from = [];
  let at = 0;
  for (const char of String(text)) {
    const plain = char.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    for (let i = 0; i < plain.length; i++) {
      folded += plain[i];
      from.push(at);
    }
    at += char.length;
  }
  from.push(at);
  return { text: folded, from };
}

export function searchTerms(query) {
  return fold(query).text.split(/\s+/).filter(Boolean);
}

// Every word must appear, in any order: "garage 0830" finds
// "1234_Garage 1_20261030083000.avi". Returns null, or the [start, end)
// ranges of the original text to highlight, sorted and merged.
export function matchFolded(folded, terms) {
  const ranges = [];
  for (const term of terms) {
    const at = folded.text.indexOf(term);
    if (at < 0) return null;
    ranges.push([folded.from[at], folded.from[at + term.length]]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([...range]);
  }
  return merged;
}

export function matchName(name, terms) {
  return matchFolded(fold(name), terms);
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
