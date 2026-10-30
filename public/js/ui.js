/*
 * ui.js - the left-pane folder tree and the right-pane file table.
 *
 *   tree.init(rootEl, shortcuts, { onSelect })  paint the shortcut roots
 *   tree.setShortcuts(shortcuts)                 replace roots; keep expand state, listings, selection
 *   tree.setFilter(text)                         hide shortcut roots whose label doesn't match
 *   tree.listing(sc, path)                       promise of a folder's entries (cached)
 *   tree.cached(sc, path)                        entries if already loaded, else null
 *   tree.reveal(sc, path)                        open every ancestor and select a folder
 *   tree.refresh(sc, path)                       forget a listing and load it again
 *   files.render(container, view, callbacks)     the name / type / size / modified table
 *
 * The tree shows shortcuts as roots and FOLDERS ONLY below them; files go in
 * the right pane. State is keyed by "<shortcutId>::<path>" so expand state,
 * listings and the selection survive re-renders. Both panes share one
 * listing per folder, so the right pane never depends on the tree having
 * rendered (or even shown) a node. Names from the FTP server only ever
 * reach the page as text, never as HTML.
 */

import * as api from "./api.js";
import { kindFor, extension } from "./filetypes.js";
import { joinPath, formatSize, sortEntries, filterEntries } from "./util.js";

const ICONS = {
  shortcut: "\u{1F5A5}", folder: "\u{1F4C1}", image: "\u{1F5BC}", video: "\u{1F3AC}",
  audio: "\u{1F3B5}", doc: "\u{1F4C4}", file: "\u{1F4C4}",
};
const OPEN = "▾", CLOSED = "▸", LOADING = "◌";   // ▾ ▸ ◌

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const keyFor = (scId, path) => `${scId}::${path}`;

/* ---------------------------------------------------------------- tree */

let rootEl = null;
let notifySelect = () => {};
const state = {
  shortcuts: [],
  listings: new Map(),   // key -> { promise, entries, error }
  expanded: new Set(),   // keys
  activeKey: null,
  filter: "",            // lower-cased; "" shows everything
};

function listing(sc, path) {
  const key = keyFor(sc.id, path);
  let item = state.listings.get(key);
  if (!item || item.error) {   // a failed listing is retried on the next request
    item = { entries: null, error: null };
    item.promise = api.listDir(sc.id, path).then(
      (entries) => { item.entries = entries; return entries; },
      (err) => { item.error = err; throw err; },
    );
    state.listings.set(key, item);
  }
  return item.promise;
}

function renderAll() {
  const roots = state.shortcuts
    .filter((sc) => !state.filter || sc.label.toLowerCase().includes(state.filter))
    .map((sc) => buildNode(sc, "/", sc.label, true));
  if (roots.length === 0 && state.filter) {
    roots.push(el("li", "tree-message muted", `No shortcuts match "${state.filter}".`));
  }
  rootEl.replaceChildren(...roots);
}

function buildNode(sc, path, label, isRoot) {
  const key = keyFor(sc.id, path);
  const open = state.expanded.has(key);
  const li = el("li", "tree-node");
  li.dataset.key = key;

  const row = el("div", "tree-row");
  row.classList.toggle("active", state.activeKey === key);
  const toggle = el("span", "tree-toggle", open ? OPEN : CLOSED);
  const labelEl = el("span", "tree-label", label);
  // Admins also know where the server lives; everyone else just sees the label.
  labelEl.title = isRoot ? (sc.host ? `${sc.label}  (${sc.host}:${sc.port})` : sc.label) : path;
  row.append(toggle, el("span", "tree-icon", isRoot ? ICONS.shortcut : ICONS.folder), labelEl);

  const children = el("ul", "tree-children");
  children.hidden = !open;
  li.append(row, children);

  // Click the row: select it and open it. Click only the triangle: toggle.
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.expanded.has(key)) collapse(key, toggle, children);
    else expand(sc, path, key, toggle, children);
  });
  row.addEventListener("click", () => {
    select(sc, path);
    if (!state.expanded.has(key)) expand(sc, path, key, toggle, children);
  });

  if (open) populate(sc, path, key, toggle, children);
  return li;
}

function expand(sc, path, key, toggle, children) {
  state.expanded.add(key);
  children.hidden = false;
  toggle.textContent = OPEN;
  populate(sc, path, key, toggle, children);
}

function collapse(key, toggle, children) {
  state.expanded.delete(key);
  children.hidden = true;
  toggle.textContent = CLOSED;
}

function populate(sc, path, key, toggle, children) {
  const item = state.listings.get(key);
  if (item?.entries) {
    renderFolders(sc, path, item.entries, children);
    return;
  }
  children.replaceChildren(el("li", "tree-message muted", "Loading…"));
  toggle.textContent = LOADING;
  const settle = () => { toggle.textContent = state.expanded.has(key) ? OPEN : CLOSED; };
  listing(sc, path).then(
    (entries) => { settle(); renderFolders(sc, path, entries, children); },
    (err) => { settle(); children.replaceChildren(el("li", "tree-message tree-error", err.message)); },
  );
}

function renderFolders(sc, parentPath, entries, children) {
  const folders = sortEntries(entries.filter((e) => e.isDir));
  if (folders.length === 0) {
    children.replaceChildren(el("li", "tree-message muted", "(no subfolders)"));
    return;
  }
  children.replaceChildren(...folders.map((f) => buildNode(sc, joinPath(parentPath, f.name), f.name, false)));
}

function rowFor(key) {
  for (const li of rootEl.querySelectorAll("li.tree-node")) {
    if (li.dataset.key === key) return li.firstElementChild;
  }
  return null;
}

function select(sc, path) {
  const key = keyFor(sc.id, path);
  if (state.activeKey !== key) {
    rootEl.querySelectorAll(".tree-row.active").forEach((r) => r.classList.remove("active"));
    state.activeKey = key;
    rowFor(key)?.classList.add("active");
  }
  notifySelect({ shortcut: sc, path });
}

export const tree = {
  init(rootElement, shortcuts, { onSelect }) {
    rootEl = rootElement;
    notifySelect = onSelect;
    state.shortcuts = shortcuts.slice();
    renderAll();
  },

  setShortcuts(shortcuts) {
    state.shortcuts = shortcuts.slice();
    renderAll();
  },

  setFilter(text) {
    state.filter = String(text ?? "").trim().toLowerCase();
    renderAll();
  },

  listing,

  cached(sc, path) {
    return state.listings.get(keyFor(sc.id, path))?.entries ?? null;
  },

  // Open the shortcut, every folder on the way, and the target itself, then
  // select it. Nodes appear as their parents' listings arrive.
  reveal(sc, path) {
    let p = "/";
    state.expanded.add(keyFor(sc.id, p));
    for (const part of path.split("/").filter(Boolean)) {
      p = joinPath(p, part);
      state.expanded.add(keyFor(sc.id, p));
    }
    state.activeKey = keyFor(sc.id, path);
    renderAll();
    rowFor(state.activeKey)?.scrollIntoView({ block: "nearest" });
    notifySelect({ shortcut: sc, path });
  },

  refresh(sc, path) {
    state.listings.delete(keyFor(sc.id, path));
    renderAll();
    return listing(sc, path);
  },

  clearSelection() {
    state.activeKey = null;
    rootEl.querySelectorAll(".tree-row.active").forEach((r) => r.classList.remove("active"));
  },
};

/* ---------------------------------------------------------------- files */

const COLUMNS = [["col-name", "Name"], ["col-type", "Type"], ["col-size", "Size"], ["col-date", "Modified"]];

// view = null (nothing selected) | { path, filter, entries | null (loading) | error }
// callbacks = { onNavigate(path), onOpen(entry, path), onRetry() }
function renderFiles(container, view, callbacks) {
  const message = (text, className = "placeholder muted") => container.replaceChildren(el("p", className, text));
  if (!view) return message("Select a shortcut to browse its files.");
  if (view.error) {
    const p = el("p", "placeholder placeholder-error", view.error.message + " ");
    const retry = el("button", "btn-secondary btn-sm", "Retry");
    retry.type = "button";
    retry.addEventListener("click", callbacks.onRetry);
    p.append(retry);
    return container.replaceChildren(p);
  }
  if (!view.entries) return message("Loading…");

  const entries = filterEntries(sortEntries(view.entries), view.filter);
  if (entries.length === 0) {
    return message(view.filter ? `No entries match "${view.filter}".` : "(empty folder)");
  }

  const table = el("table", "file-table");
  const head = table.createTHead().insertRow();
  for (const [className, text] of COLUMNS) head.append(el("th", className, text));
  const body = table.createTBody();

  for (const entry of entries) {
    const kind = kindFor(entry.name, entry.isDir);
    const row = body.insertRow();
    row.className = `entry-row ${kind}`;
    row.tabIndex = 0;
    const name = row.insertCell();
    name.className = "col-name";
    name.append(el("span", "file-icon", ICONS[kind]), el("span", "file-name", entry.name));
    name.title = entry.name;
    row.append(
      el("td", "col-type muted", entry.isDir ? "Folder" : (extension(entry.name).toUpperCase() || "File")),
      el("td", "col-size muted", entry.isDir ? "" : formatSize(entry.size)),
      el("td", "col-date muted", entry.date),
    );

    // One click (or Enter) opens: folders navigate, files open or download.
    const activate = () => {
      body.querySelector("tr.selected")?.classList.remove("selected");
      row.classList.add("selected");
      const full = joinPath(view.path, entry.name);
      if (entry.isDir) callbacks.onNavigate(full);
      else callbacks.onOpen(entry, full);
    };
    row.addEventListener("click", activate);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter") activate();
    });
  }
  container.replaceChildren(table);
}

export const files = { render: renderFiles };
