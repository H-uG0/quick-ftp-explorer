/*
 * ui.js - the left-pane folder tree and the right-pane file table.
 *
 *   tree.init(rootEl, shortcuts, { onSelect })  paint the shortcut roots
 *   tree.setShortcuts(shortcuts)                 replace roots; keep expand state, listings, selection
 *   tree.listing(sc, path)                       promise of a folder's entries (cached)
 *   tree.cached(sc, path)                        entries if already loaded, else null
 *   tree.reveal(sc, path)                        open every ancestor and select a folder
 *   tree.refresh(sc, path)                       forget a listing and load it again
 *   files.render(container, view, callbacks)     the name / type / size / modified table
 *   files.renderResults(container, view, callbacks)   search results, with where each one is
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
import { joinPath, sortEntries } from "./util.js";
import { t, tn, language, formatSize, formatDate } from "./i18n.js";
import { icon } from "./icons.js";

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
  rootEl.replaceChildren(...state.shortcuts.map((sc) => buildNode(sc, "/", sc.label, true)));
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
  const iconEl = el("span", "tree-icon");
  iconEl.append(icon(isRoot ? "site" : "folder"));
  row.append(toggle, iconEl, labelEl);

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
  children.replaceChildren(el("li", "tree-message muted", t("common.loading")));
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
    children.replaceChildren(el("li", "tree-message muted", t("tree.noSubfolders")));
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

const COLUMNS = [["col-name", "col.name"], ["col-type", "col.type"], ["col-size", "col.size"], ["col-date", "col.modified"]];

function fileTable() {
  const table = el("table", "file-table");
  const head = table.createTHead().insertRow();
  for (const [className, key] of COLUMNS) head.append(el("th", className, t(key)));
  return { table, body: table.createTBody() };
}

const typeOf = (entry) => (entry.isDir ? t("type.folder") : (extension(entry.name).toUpperCase() || t("type.file")));
const sizeOf = (entry) => (entry.isDir ? "" : formatSize(entry.size, language()));

// One row: icon, name (and `below` it, where a search result lives), type,
// size, date. One click (or Enter) activates it.
function addRow(body, { kind, name, title, below, type, size, date }, activate) {
  const row = body.insertRow();
  row.className = `entry-row ${kind}`;
  row.tabIndex = 0;
  const cell = row.insertCell();
  cell.className = "col-name";
  cell.title = title;
  const iconEl = el("span", "file-icon");
  iconEl.append(icon(kind));
  cell.append(iconEl, name);
  if (below) cell.append(below);
  row.append(el("td", "col-type muted", type), el("td", "col-size muted", size), el("td", "col-date muted", formatDate(date, language())));
  const run = () => {
    body.querySelector("tr.selected")?.classList.remove("selected");
    row.classList.add("selected");
    activate();
  };
  row.addEventListener("click", run);
  row.addEventListener("keydown", (e) => {
    if (e.key === "Enter") run();
  });
}

// view = null (nothing selected) | { path, entries | null (loading) | error }
// callbacks = { onNavigate(path), onOpen(entry, path), onRetry() }
function renderFiles(container, view, callbacks) {
  const message = (text, className = "placeholder muted") => container.replaceChildren(el("p", className, text));
  if (!view) return message(t("files.pick"));
  if (view.error) {
    const p = el("p", "placeholder placeholder-error", view.error.message + " ");
    const retry = el("button", "btn-secondary btn-sm", t("common.retry"));
    retry.type = "button";
    retry.addEventListener("click", callbacks.onRetry);
    p.append(retry);
    return container.replaceChildren(p);
  }
  if (!view.entries) return message(t("common.loading"));
  if (view.entries.length === 0) return message(t("files.empty"));

  const { table, body } = fileTable();
  for (const entry of sortEntries(view.entries)) {
    const name = el("span", "file-name", entry.name);
    addRow(body, { kind: kindFor(entry.name, entry.isDir), name, title: entry.name, type: typeOf(entry), size: sizeOf(entry), date: entry.date }, () => {
      const full = joinPath(view.path, entry.name);
      if (entry.isDir) callbacks.onNavigate(full);
      else callbacks.onOpen(entry, full);
    });
  }
  container.replaceChildren(table);
}

// The name, with what matched the search in <mark>. Text nodes only.
function highlighted(text, ranges) {
  const span = el("span", "file-name");
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) span.append(text.slice(at, start));
    span.append(el("mark", "", text.slice(start, end)));
    at = end;
  }
  if (at < text.length) span.append(text.slice(at));
  return span;
}

// view = { query, scope (a label), sites: [{ sc, ranges }], hits: [{ item, ranges }],
//          total (hits before the display cap), progress (see search.js), maxFolders }
// callbacks = { onOpenSite(sc), onOpenItem(item), onSearchAll (or null) }
function renderResults(container, view, callbacks) {
  const { query, scope, sites, hits, total, progress } = view;
  const results = tn("count.results", sites.length + total);
  const header = el("div", "search-header");
  const status = el("p", "search-status");
  status.setAttribute("aria-live", "polite");
  status.textContent = !progress.done
    ? t("search.running", { scope, folders: tn("count.foldersRead", progress.listed), results })
    : t(sites.length + total ? "search.done" : "search.none", { query, scope, results });
  header.append(status);
  const notes = [];
  if (total > hits.length) notes.push(t("search.capped", { n: hits.length }));
  if (progress.truncated) notes.push(t("search.truncated", { max: view.maxFolders }));
  if (progress.failed) notes.push(tn("search.failed", progress.failed));
  for (const note of notes) header.append(el("p", "search-note", note));
  if (callbacks.onSearchAll) {
    const all = el("button", "btn-secondary btn-sm", t("search.allSites"));
    all.type = "button";
    all.addEventListener("click", callbacks.onSearchAll);
    header.append(all);
  }
  if (!sites.length && !hits.length) return container.replaceChildren(header);

  const { table, body } = fileTable();
  for (const { sc, ranges } of sites) {
    addRow(body, { kind: "site", name: highlighted(sc.label, ranges), title: sc.label, type: t("type.site"), size: "" },
      () => callbacks.onOpenSite(sc));
  }
  for (const { item, ranges } of hits) {
    const { entry, sc, parent } = item;
    const where = [sc.label, ...parent.split("/").filter(Boolean)].join(" › ");
    addRow(body, {
      kind: kindFor(entry.name, entry.isDir),
      name: highlighted(entry.name, ranges),
      title: `${entry.name}\n${where}`,
      below: el("span", "result-location", where),
      type: typeOf(entry),
      size: sizeOf(entry),
      date: entry.date,
    }, () => callbacks.onOpenItem(item));
  }
  container.replaceChildren(header, table);
}

export const files = { render: renderFiles, renderResults };
