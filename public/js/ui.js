/*
 * ui.js - the navigation pane (an ARIA tree of sites and their folders) and
 * the listing cache both panes share.
 *
 *   tree.init(rootEl, { onSelect, onHome, onMenu, onMore, admin })
 *   tree.setShortcuts(shortcuts)          replace the sites; keep what is open and loaded
 *   tree.listing(sc, path)                promise of a folder's entries (cached)
 *   tree.cached(sc, path), tree.loadedAt(sc, path)   what is loaded, and since when
 *   tree.reveal(sc, path)                 open every ancestor and select a folder (onSelect)
 *   tree.selectHome()                     select "Tous les sites"
 *   tree.refresh(sc, path, { quiet })     load a listing again
 *   tree.store(sc, path, entries)         keep a listing fetched elsewhere (a check for new files)
 *   tree.find(query)                      show only the sites whose label has every word
 *                                         (plus the open one); -> the first match, or null
 *   tree.focusFirstSite(), tree.focus(), tree.itemAt(target)
 *
 * The tree shows "Tous les sites", then each site with its FOLDERS only;
 * files go in the list. One Tab stop: Up/Down move, Right opens a branch or
 * goes into it, Left closes it or goes to the parent, Home/End, Enter or
 * Space opens the item on the right, and typing jumps to a label. The
 * arrows never open an item: each opening costs an FTP listing. State is
 * keyed by "<shortcutId>::<path>", so it survives redraws. Names from the
 * FTP server only ever reach the page as text.
 */

import * as api from "./api.js";
import { joinPath, sortEntries, typeAhead, searchTerms, matchName } from "./util.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const keyFor = (scId, path) => `${scId}::${path}`;
const HOME = "home";
const siteOf = (key) => (key && key !== HOME ? key.split("::")[0] : null);

let rootEl = null;
let hooks = { onSelect() {}, onHome() {}, onMenu() {}, onMore() {}, admin: false };
const state = {
  shortcuts: [],
  listings: new Map(),   // key -> { promise, entries, error, loadedAt }
  expanded: new Set(),   // keys
  activeKey: null,
};
let typed = "", typedAt = 0;
let findQuery = "", findTerms = [];   // "Trouver un site"

/* ---- listings ---- */

function listing(sc, path) {
  const key = keyFor(sc.id, path);
  let item = state.listings.get(key);
  if (!item || item.error) {   // a failed listing is retried on the next request
    item = { entries: null, error: null, loadedAt: null };
    item.promise = api.listDir(sc.id, path).then(
      (entries) => {
        item.entries = entries;
        item.loadedAt = Date.now();
        return entries;
      },
      (err) => { item.error = err; throw err; },
    );
    state.listings.set(key, item);
  }
  return item.promise;
}

const folderNames = (entries) => sortEntries(entries.filter((e) => e.isDir)).map((e) => e.name).join("\n");

/* ---- drawing ---- */

function treeItem(key, level, label, iconName) {
  const li = el("li", "tree-node");
  li.dataset.key = key;
  li.setAttribute("role", "treeitem");
  li.setAttribute("aria-level", String(level));
  li.setAttribute("aria-selected", String(state.activeKey === key));
  li.tabIndex = -1;
  const row = el("div", "tree-row");
  row.classList.toggle("active", state.activeKey === key);
  const toggle = el("span", "tree-toggle");
  toggle.setAttribute("aria-hidden", "true");
  const iconEl = el("span", "tree-icon");
  iconEl.append(icon(iconName));
  const labelEl = el("span", "tree-label", label);
  row.append(toggle, iconEl, labelEl);
  li.append(row);
  return { li, row, toggle, labelEl };
}

function homeNode() {
  const { li } = treeItem(HOME, 1, t("nav.home"), "home");
  li.classList.add("tree-home");
  return li;
}

// While "Trouver un site" holds words, only the sites matching all of them
// show, and the open one.
const findMatch = (sc) => (findTerms.length ? matchName(sc.label, findTerms) : null);
const siteShown = (sc) => !findTerms.length || !!findMatch(sc) || siteOf(state.activeKey) === sc.id;

function renderAll() {
  const focusedKey = rootEl.contains(document.activeElement) ? document.activeElement.closest("li")?.dataset.key : null;
  const sites = state.shortcuts.filter(siteShown);
  const nodes = [homeNode(), ...sites.map((sc) => buildNode(sc, "/", sc.label, 1))];
  if (findTerms.length && !state.shortcuts.some(findMatch)) {
    nodes.push(el("li", "tree-message", t("nav.noSiteMatch", { query: findQuery.trim() })));
  }
  rootEl.replaceChildren(...nodes);
  setTabStop();
  if (focusedKey) itemEl(focusedKey)?.focus({ preventScroll: true });
}

// The label, with the words found in <mark>. Text nodes only.
function markLabel(labelEl, text, ranges) {
  labelEl.replaceChildren();
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) labelEl.append(text.slice(at, start));
    labelEl.append(el("mark", "", text.slice(start, end)));
    at = end;
  }
  if (at < text.length) labelEl.append(text.slice(at));
}

function buildNode(sc, path, label, level) {
  const key = keyFor(sc.id, path);
  const isRoot = level === 1;
  const { li, row, toggle, labelEl } = treeItem(key, level, label, isRoot ? "site" : "folder");
  // Admins also know where the server lives; everyone else just sees the label.
  labelEl.title = isRoot ? (sc.host ? `${sc.label}  (${sc.host}:${sc.port})` : sc.label) : path;
  const ranges = isRoot && findMatch(sc);
  if (ranges) markLabel(labelEl, label, ranges);
  if (isRoot && hooks.admin && siteOf(state.activeKey) === sc.id) {
    const more = el("button", "btn-icon tree-more");
    more.type = "button";
    more.tabIndex = -1;
    more.setAttribute("aria-label", t("tree.more", { name: sc.label }));
    more.title = t("tree.more", { name: sc.label });
    more.append(icon("more"));
    more.addEventListener("click", (e) => {
      e.stopPropagation();
      hooks.onMore(sc, more);
    });
    row.append(more);
  }
  const children = el("ul", "tree-children");
  children.setAttribute("role", "group");
  li.append(children);

  const loaded = state.listings.get(key)?.entries;
  const leaf = loaded && !loaded.some((e) => e.isDir);
  const open = state.expanded.has(key) && !leaf;
  setBranch(li, toggle, children, leaf ? "leaf" : open ? "open" : "closed");

  // Click the row: open it on the right, and show its folders. Click only
  // the chevron: show or hide them.
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    if (state.expanded.has(key)) collapse(li);
    else expand(li);
  });
  row.addEventListener("click", () => {
    select(sc, path);
    if (!state.expanded.has(key)) expand(li);
  });
  li._node = { sc, path, key };
  if (open) populate(li);
  return li;
}

// "open" | "closed" | "loading" | "leaf" (no subfolders: no chevron at all)
function setBranch(li, toggle, children, mode) {
  toggle.replaceChildren();
  toggle.classList.toggle("loading", mode === "loading");
  if (mode === "leaf") {
    li.removeAttribute("aria-expanded");
    children.hidden = true;
    children.replaceChildren();
    return;
  }
  if (mode !== "loading") toggle.append(icon("chevron"));
  li.setAttribute("aria-expanded", String(mode !== "closed"));
  toggle.classList.toggle("open", mode === "open");
  children.hidden = mode === "closed";
}

const parts = (li) => ({ toggle: li.querySelector(":scope > .tree-row > .tree-toggle"), children: li.querySelector(":scope > .tree-children") });

function expand(li) {
  const { key } = li._node;
  state.expanded.add(key);
  populate(li);
}

function collapse(li) {
  state.expanded.delete(li._node.key);
  const { toggle, children } = parts(li);
  setBranch(li, toggle, children, "closed");
}

function populate(li) {
  const { sc, path, key } = li._node;
  const { toggle, children } = parts(li);
  const item = state.listings.get(key);
  if (item?.entries) {
    renderFolders(li, item.entries);
    return;
  }
  setBranch(li, toggle, children, "loading");
  listing(sc, path).then(
    (entries) => { if (li.isConnected) renderFolders(li, entries); },
    (err) => {
      if (!li.isConnected) return;
      setBranch(li, toggle, children, state.expanded.has(key) ? "open" : "closed");
      children.replaceChildren(el("li", "tree-message tree-error", err.message));
    },
  );
}

function renderFolders(li, entries) {
  const { sc, path, key } = li._node;
  const { toggle, children } = parts(li);
  const folders = sortEntries(entries.filter((e) => e.isDir));
  if (!folders.length) {
    setBranch(li, toggle, children, "leaf");
    return;
  }
  const level = Number(li.getAttribute("aria-level")) + 1;
  children.replaceChildren(...folders.map((f) => buildNode(sc, joinPath(path, f.name), f.name, level)));
  setBranch(li, toggle, children, state.expanded.has(key) ? "open" : "closed");
}

function itemEl(key) {
  for (const li of rootEl.querySelectorAll("li.tree-node")) if (li.dataset.key === key) return li;
  return null;
}

const visibleItems = () => [...rootEl.querySelectorAll("li.tree-node")].filter((li) => !li.parentElement.closest("ul[hidden]"));

function setTabStop(key = state.activeKey) {
  const target = (key && itemEl(key)) || rootEl.querySelector("li.tree-node");
  for (const li of rootEl.querySelectorAll('li.tree-node[tabindex="0"]')) li.tabIndex = -1;
  if (target) target.tabIndex = 0;
}

function markActive(key) {
  state.activeKey = key;
  for (const li of rootEl.querySelectorAll("li.tree-node")) {
    const on = li.dataset.key === key;
    li.setAttribute("aria-selected", String(on));
    li.firstElementChild.classList.toggle("active", on);
  }
  setTabStop(key);
}

// The admin's ⋯ button sits on the open site's row: moving to another site
// redraws the tree.
function markActiveSite(key) {
  const moved = hooks.admin && siteOf(state.activeKey) !== siteOf(key);
  markActive(key);
  if (moved) renderAll();
}

function select(sc, path) {
  markActiveSite(keyFor(sc.id, path));
  hooks.onSelect({ shortcut: sc, path });
}

function activate(li) {
  if (li.dataset.key === HOME) {
    markActiveSite(HOME);
    hooks.onHome();
  } else {
    select(li._node.sc, li._node.path);
  }
}

/* ---- keyboard ---- */

function onKeydown(e) {
  const li = e.target.closest?.("li.tree-node");
  if (!li || e.altKey || e.ctrlKey || e.metaKey) return;
  const items = visibleItems();
  const at = items.indexOf(li);
  const go = (target) => {
    if (!target) return;
    setTabStop(target.dataset.key);
    target.focus();
    target.scrollIntoView({ block: "nearest" });
  };
  const expanded = li.getAttribute("aria-expanded");
  switch (e.key) {
    case "ArrowDown": go(items[at + 1]); break;
    case "ArrowUp": go(items[at - 1]); break;
    case "Home": go(items[0]); break;
    case "End": go(items.at(-1)); break;
    case "ArrowRight":
      if (expanded === "false") expand(li);
      else if (expanded === "true") go(li.querySelector(":scope > .tree-children > li.tree-node"));
      break;
    case "ArrowLeft":
      if (expanded === "true") collapse(li);
      else go(li.parentElement.closest("li.tree-node"));
      break;
    case "Enter":
    case " ":
      activate(li);
      break;
    default:
      if (e.key.length === 1 && /\S/.test(e.key)) {
        const now = Date.now();
        typed = now - typedAt > 700 ? e.key : typed + e.key;
        typedAt = now;
        const i = typeAhead(items.map((item) => item.querySelector(".tree-label").textContent), typed, at);
        go(items[i]);
        break;
      }
      return;
  }
  e.preventDefault();
}

/* ---- API ---- */

export const tree = {
  init(rootElement, options) {
    rootEl = rootElement;
    hooks = { ...hooks, ...options };
    rootEl.setAttribute("role", "tree");
    rootEl.setAttribute("aria-label", t("nav.shortcuts"));
    rootEl.addEventListener("keydown", onKeydown);
    rootEl.addEventListener("click", (e) => {
      const li = e.target.closest?.("li.tree-home");
      if (li) activate(li);
    });
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

  loadedAt(sc, path) {
    return state.listings.get(keyFor(sc.id, path))?.loadedAt ?? null;
  },

  // Open the site, every folder on the way, and the target itself, then
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
    itemEl(state.activeKey)?.scrollIntoView({ block: "nearest" });
    hooks.onSelect({ shortcut: sc, path });
  },

  selectHome() {
    markActiveSite(HOME);
  },

  // A quiet refresh redraws the tree only if the subfolders changed, so it
  // never takes the focus away from it.
  async refresh(sc, path, { quiet = false } = {}) {
    const key = keyFor(sc.id, path);
    const before = state.listings.get(key)?.entries;
    state.listings.delete(key);
    if (!quiet) renderAll();
    const entries = await listing(sc, path);
    if (!quiet || !before || folderNames(before) !== folderNames(entries)) renderAll();
    return entries;
  },

  store(sc, path, entries) {
    const key = keyFor(sc.id, path);
    const before = state.listings.get(key)?.entries;
    state.listings.set(key, { entries, error: null, loadedAt: Date.now(), promise: Promise.resolve(entries) });
    if (!before || folderNames(before) !== folderNames(entries)) renderAll();
  },

  focus() {
    const li = (state.activeKey && itemEl(state.activeKey)) || rootEl.querySelector("li.tree-node");
    li?.focus();
  },

  find(query) {
    findQuery = query;
    findTerms = searchTerms(query);
    renderAll();
    return findTerms.length ? state.shortcuts.find(findMatch) ?? null : null;
  },

  focusFirstSite() {
    const li = rootEl.querySelector("li.tree-node:not(.tree-home)") ?? rootEl.querySelector("li.tree-node");
    if (!li) return;
    setTabStop(li.dataset.key);
    li.focus();
  },

  // { home: true } | { sc, path, isRoot } | null
  itemAt(target) {
    const li = target instanceof Element ? target.closest("li.tree-node") : null;
    if (!li || !rootEl.contains(li)) return null;
    if (li.dataset.key === HOME) return { home: true, element: li };
    return { sc: li._node.sc, path: li._node.path, isRoot: li._node.path === "/", element: li };
  },
};
