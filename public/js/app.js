/*
 * app.js - the explorer page: state, views and event wiring.
 *
 * Three views share the right pane's list (grid.js): "Tous les sites" (no
 * folder open), a folder, and search results. Each goes through the same
 * pipeline: rows (listview.describeEntry), the filters, the sort, the
 * 500-row cap for searches, then the grid. The selection, the sort and the
 * filters live here, so redraws keep them.
 *
 * A click selects and a double-click (or Enter, or a tap) opens: a folder
 * opens on the right, a video, image or audio file in the viewer, which
 * steps through the list; PDF and text open in a new tab; everything else
 * downloads. The command bar, the right-click menus and the keyboard reach
 * the same commands. Admins manage sites here too.
 *
 * The open folder lives in the URL fragment ("#/<id>/<path>"; "#/" is
 * Tous les sites; "?open=<name>" opens a clip on arrival), so links can be
 * bookmarked or shared and Back / Forward move between folders. Each
 * history entry also remembers its view (search, filters, selection,
 * scroll), so Back and F5 bring it back. The viewer adds an entry of its
 * own, so Back closes it. On narrow screens the sites pane becomes a drawer.
 */

import * as api from "./api.js";
import { tree, el } from "./ui.js";
import { grid } from "./grid.js";
import { toolbar } from "./toolbar.js";
import { viewer } from "./viewer.js";
import { openMenu } from "./menu.js";
import { layers, onShortcut, announce, isTypingTarget, SHORTCUTS } from "./keys.js";
import { prefs } from "./prefs.js";
import * as sel from "./selection.js";
import { kindFor, inlineType } from "./filetypes.js";
import { scan, LIMITS } from "./search.js";
import { icon } from "./icons.js";
import {
  describeEntry, columnsFor, sortRows, sortFor, sortId, DEFAULT_SORT, FIRST_DIR, applyFilters, facets, activeFilters,
  newestTime, playlist, groupByDay, diffListing, NO_FILTERS, viewable,
} from "./listview.js";
import {
  useLanguage, browserLanguage, translatePage, switchLanguage, t, tn, language, formatSize, formatDateTime,
  formatDayHeading,
} from "./i18n.js";
import {
  splitLabel, composeLabel, formatHash, parseHash, searchTerms, matchFolded, matchName, parentPath,
} from "./util.js";

const $ = (id) => document.getElementById(id);
const appEl = $("app");
const menuBtn = $("menu-toggle");
const narrow = window.matchMedia("(max-width: 700px)");
const listEl = $("shortcut-list");
const emptyHint = $("empty-hint");
const leftPane = $("left-pane");
const splitter = $("splitter");
const mainEl = $("right-pane");
const fileList = $("file-list");
const breadcrumb = $("breadcrumb");
const refreshBtn = $("refresh");
const searchInput = $("search");
const searchClear = $("search-clear");
const resultsHeader = $("results-header");
const notice = $("notice");
const viewTitle = $("view-title");
const statusBar = document.querySelector(".statusbar");
const status = {
  count: $("status-count"), selection: $("status-selection"), updated: $("status-updated"), hint: $("status-hint"),
  user: $("status-user"),
};
const newBtn = $("new-shortcut");

// The page's language first, so nothing is ever drawn in the wrong one.
useLanguage(browserLanguage());
translatePage();
const langSwitch = $("lang-switch");
langSwitch.textContent = t("lang.switch");
langSwitch.lang = t("lang.switchCode");
langSwitch.addEventListener("click", () => switchLanguage(t("lang.switchCode")));

/* ---- state ---- */

let me = null;
let shortcuts = [];
let current = null;          // { shortcut, path }, or null on Tous les sites
let searching = null;        // { key, progress } while the search box holds text
let filters = { ...NO_FILTERS };
let sort = sortFor(prefs.get("sort")) ?? DEFAULT_SORT;
let homeSort = { key: "name", dir: "asc" };   // Tous les sites: by name, not saved
let selection = sel.EMPTY;
let shownRows = [];          // the rows on screen, in order
let viewSeq = 0;             // ignore listings that arrive after the view moved on
let listError = null;        // the open folder's listing failed
let pendingSelect = null;    // a key to select once its folder shows (Ouvrir l'emplacement, Up)
let pendingOpen = null;      // a clip to open once its folder shows (a clip link)
let restoring = null;        // a view history brings back (Back, F5)
let viewId = "";
let selecting = false;       // phones: taps tick files instead of opening them
const fresh = new Map();     // key -> until when a new file keeps its "Nouveau" tag

const isAdmin = () => me?.role === "admin";
const viewName = () => (searching ? "search" : current ? "folder" : "home");
const placeParts = () => [current.shortcut.label, ...current.path.split("/").filter(Boolean)];

/* ---- spinner (ref-counted, shown only for operations that take a while) ---- */

const spinner = $("spinner");
const spinnerText = spinner.querySelector(".spinner-text");
let pendingOps = 0;
async function busy(label, work) {
  pendingOps++;
  const timer = setTimeout(() => {
    spinnerText.textContent = label;
    spinner.hidden = false;
  }, 250);
  try {
    return await work();
  } finally {
    clearTimeout(timer);
    if (--pendingOps === 0) spinner.hidden = true;
  }
}

let toastTimer = 0;
function toast(text, { error = true } = {}) {
  const box = $("toast");
  box.setAttribute("role", error ? "alert" : "status");
  box.classList.toggle("toast-info", !error);
  box.textContent = text;
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.hidden = true; }, error ? 8000 : 2500);
}

/* ---- sites ---- */

async function loadShortcuts() {
  shortcuts = await api.shortcuts();
  tree.setShortcuts(shortcuts);
  emptyHint.textContent = t(isAdmin() ? "tree.emptyAdmin" : "tree.emptyUser");
  emptyHint.hidden = shortcuts.length > 0;
  if (searching && !current) restartSearch();   // the sites searched have changed
  else if (!current) renderView();
}

const siteRow = (sc, ranges) => ({
  key: `${sc.id}::/`, sc, parent: null, path: "/", entry: null, name: sc.label, isDir: true, kind: "site",
  camera: "", time: null, precision: null, timeSource: null, modifiedMs: null, modifiedPrecision: null, size: 0, ranges,
});

/* ---- the list ---- */

function emptyNode(text, className = "placeholder muted") {
  return el("p", className, text);
}

function errorNode(err, retry) {
  const p = el("p", "placeholder placeholder-error", err.message + " ");
  const button = el("button", "btn-secondary btn-sm", t("common.retry"));
  button.type = "button";
  button.addEventListener("click", retry);
  p.append(button);
  return p;
}

// When the filters hide every file: say so, offer to clear them, and say
// how recent the newest file is (the usual reason: a period too short).
function filteredOutNode(all) {
  const box = el("div", "placeholder filtered-out");
  box.append(el("p", "", t("filter.none")));
  const clear = el("button", "btn-secondary btn-sm", t("filter.clear"));
  clear.type = "button";
  clear.addEventListener("click", () => {
    setFilters({ ...NO_FILTERS });
    $("f-period").focus();
  });
  box.append(clear);
  const newest = newestTime(all);
  if (newest) box.append(el("p", "muted", t("filter.newest", { date: formatDateTime(newest.ms, newest.precision === "second" ? "minute" : newest.precision) })));
  return box;
}

const gridCallbacks = {
  selection: () => selection,
  select(state) {
    selection = state;
    grid.update(state);
    if (selecting && !state.selected.size) setSelecting(false);   // the last file unticked
    updateChrome();
    scheduleSave();
    if (state.selected.size === 1 && !prefs.get("hintDone") && !narrow.matches) status.hint.textContent = t("sel.hint");
  },
  open(row) {
    if (!prefs.get("hintDone")) {
      prefs.set("hintDone", true);
      status.hint.textContent = "";
    }
    openRow(row);
  },
  sort(key) {
    if (viewName() === "home") {
      homeSort = { key, dir: homeSort.key === key && homeSort.dir === "asc" ? "desc" : "asc" };
      renderView();
      return;
    }
    const shown = renderState?.effective ?? sort;   // what the header shows
    const dir = shown.key === key ? (shown.dir === "asc" ? "desc" : "asc") : FIRST_DIR[key];
    setSort(sortId({ key, dir }));
  },
  middle(row) {
    openInNewTab(row);
  },
  escape() {
    if (!searchInput.value) return false;
    clearSearch();
    renderView();
    return true;
  },
};

function setSort(id) {
  sort = sortFor(id) ?? DEFAULT_SORT;
  prefs.set("sort", sort.id);
  renderView();
  announce(t("sort.announce", { order: t(`sort.${sort.id}`).toLowerCase() }));
}

function setFilters(next, { quiet = false } = {}) {
  filters = { ...next };
  renderView();
  scheduleSave();
  if (!quiet) announce(status.count.textContent);
}

// The rows of the current view, before filters: { rows, sites, marks, places, label, mode, empty }.
function viewRows() {
  if (searching) return searchRows();
  if (!current) {
    return {
      mode: "home", label: t("a11y.gridLabel", { place: t("nav.home") }),
      rows: shortcuts.map((sc) => siteRow(sc)), empty: emptyNode(t(isAdmin() ? "tree.emptyAdmin" : "tree.emptyUser")),
    };
  }
  const { shortcut: sc, path } = current;
  const label = t("a11y.gridLabel", { place: placeParts().at(-1) });
  const entries = tree.cached(sc, path);
  if (!entries) {
    return {
      mode: "folder", label, rows: [],
      empty: listError ? errorNode(listError, () => onSelect(current)) : emptyNode(t("common.loading")),
    };
  }
  return { mode: "folder", label, rows: entries.map((entry) => describeEntry(entry, { sc, parent: path })), empty: emptyNode(t("files.empty")) };
}

function renderView() {
  const view = viewRows();
  const now = new Date();
  const home = view.mode === "home";
  const all = view.rows;
  const columns = home ? ["name"] : columnsFor(all);
  // A saved Caméra order on a view without cameras falls back to newest first.
  const effective = home ? homeSort : (sort.key === "camera" && !columns.includes("camera") ? DEFAULT_SORT : sort);
  const { shown, hidden } = home ? { shown: all, hidden: 0 } : applyFilters(all, filters, now);
  let rows = sortRows(shown, effective);
  let total = all.length;
  if (view.mode === "search") {
    total = all.length + view.sites.length;
    view.capped = rows.length > MAX_SHOWN;
    rows = [...view.sites, ...rows.slice(0, MAX_SHOWN)];
  }
  shownRows = rows;
  const loaded = view.mode !== "folder" || !!tree.cached(current.shortcut, current.path) || !!listError;
  if (loaded) selection = sel.retain(selection, rows.map((r) => r.key));
  if (pendingSelect && rows.some((r) => r.key === pendingSelect)) {
    selection = sel.click(sel.EMPTY, rows.map((r) => r.key), pendingSelect);
  }

  // Sorted by date: a heading per day, as Explorer groups its Downloads.
  const groups = !home && effective.key === "date" && rows.some((r) => !r.isDir)
    ? groupByDay(rows, now).map((g) => ({ label: dayLabel(g), rows: g.rows }))
    : null;

  let empty = view.empty;
  if (!rows.length && all.length && hidden) empty = filteredOutNode(all);
  const id = `${viewName()}:${searching?.key ?? ""}:${current ? current.shortcut.id + "::" + current.path : ""}`;
  grid.render(fileList, {
    id, label: view.label, mode: view.mode, columns, sort: effective, rows, groups, fresh: freshKeys(),
    checkboxes: !home && (!narrow.matches || selecting), selecting,
    marks: view.marks ?? new Map(), places: view.places ?? new Map(), empty,
  }, gridCallbacks);
  if (id !== viewId) {
    viewId = id;
    viewTitle.textContent = home ? t("nav.home") : view.mode === "search" ? t("a11y.results") : placeParts().join(" › ");
  }
  if (pendingSelect && rows.some((r) => r.key === pendingSelect)) {
    grid.focus(pendingSelect);
    pendingSelect = null;
  } else if (focusList && rows.length) {
    focusList = false;
    grid.focus(grid.focusedRow()?.key ?? rows[0].key);
  }
  if (restoring && loaded) {
    const back = restoring;
    restoring = null;
    fileList.scrollTop = back.scrollTop ?? 0;
    if (back.focusKey && grid.row(back.focusKey)) grid.focus(back.focusKey);
    if (back.query && !searching) {
      searchInput.value = back.query;
      searchClear.hidden = false;
      runSearch();
      return;
    }
  }
  if (pendingOpen && view.mode === "folder" && loaded) {
    const key = pendingOpen;
    pendingOpen = null;
    const row = grid.row(key);
    if (row) {
      selectAndFocus(key);
      openFile(row);
    } else if (!listError) {
      showNotice(t("share.gone"));
    }
  }
  if (view.mode === "search") updateResultsHeader(view);

  renderState = {
    view, columns, effective, all, shownCount: view.mode === "search" ? shown.length + view.sites.length : shown.length,
    total, filtered: hidden > 0,
    facets: home ? null : facets(all, filters, now),
  };
  updateChrome();
}

let renderState = null;

// "Aujourd'hui — dimanche 1 novembre 2026 · 12 éléments"
function dayLabel(group) {
  if (group.kind === "folders") return null;
  const count = tn("count.items", group.rows.length);
  if (group.kind === "unknown") return t("group.heading", { label: t("group.unknown"), count });
  const date = formatDayHeading(group.day, language());
  const label = group.kind === "today" ? t("group.today", { date })
    : group.kind === "yesterday" ? t("group.yesterday", { date })
    : t("group.day", { date: date.charAt(0).toUpperCase() + date.slice(1) });
  return t("group.heading", { label, count });
}

// The status bar and the command bar, from the last render and the selection.
function updateChrome() {
  if (!renderState) return;
  const { view, columns, effective, shownCount, total, filtered } = renderState;
  const mode = view.mode;
  const picked = shownRows.filter((r) => selection.selected.has(r.key));
  const files = picked.filter((r) => !r.isDir);

  if (mode === "home") status.count.textContent = tn("count.sites", shortcuts.length);
  else if (mode === "search") status.count.textContent = filtered ? tn("count.resultsOf", shownCount, { total }) : tn("count.results", total);
  else status.count.textContent = filtered ? tn("count.itemsOf", shownCount, { total }) : tn("count.items", total);

  if (picked.length) {
    const count = tn("count.selected", picked.length);
    status.selection.textContent = files.length
      ? t("status.selection", { selected: count, size: formatSize(files.reduce((s, r) => s + r.size, 0), language()) })
      : count;
  } else {
    status.selection.textContent = "";
  }
  const loadedAt = mode === "folder" ? tree.loadedAt(current.shortcut, current.path) : null;
  status.updated.textContent = loadedAt ? t("status.updated", { time: formatDateTime(loadedAt, "minute").slice(11) }) : "";
  if (!picked.length) status.hint.textContent = "";

  // Phones, in selection mode: the bar at the bottom.
  $("selection-bar").hidden = !selecting;
  if (selecting) {
    $("sel-count").textContent = tn("sel.count", picked.length);
    const dl = downloadState(files);
    const download = $("sel-download");
    download.disabled = !dl.enabled;
    download.title = dl.title || (files.length > 1 ? t("cmd.downloadCount", { n: files.length }) : t("cmd.download"));
    download.setAttribute("aria-label", download.title);
    const link = $("sel-link");
    link.title = linkLabel(picked.length);
    link.setAttribute("aria-label", link.title);
    link.disabled = !picked.length;
  }

  toolbar.update({
    visible: mode !== "home",
    columns,
    sort: { id: sortId(effective) },
    filters,
    facets: renderState.facets ?? { cameras: [], cameraTotal: 0, kinds: [], kindTotal: 0 },
    actions: {
      open: { enabled: picked.length === 1 || files.length >= 2 },
      download: downloadState(files),
      link: { label: linkLabel(picked.length), enabled: picked.length > 0 || !!current },
    },
    counts: { shown: shownCount, total, search: mode === "search" },
  });
}

const ZIP_MAX = 200;
function downloadState(files) {
  if (!files.length) return { enabled: false, count: 0 };
  if (files.length === 1) return { enabled: true, count: 1 };
  if (new Set(files.map((r) => r.sc.id)).size > 1) return { enabled: false, count: files.length, title: t("zip.oneSite") };
  if (files.length > ZIP_MAX) return { enabled: false, count: files.length, title: t("zip.tooMany", { max: ZIP_MAX }) };
  return { enabled: true, count: files.length, title: t("zip.tooltip", { n: files.length }) };
}

/* ---- navigation ---- */

function renderBreadcrumb() {
  const list = breadcrumb.querySelector("ol");
  const item = (text, hash, last) => {
    const li = el("li", "bc-item");
    if (last) {
      const span = el("span", "bc-current", text);
      span.setAttribute("aria-current", "location");
      li.append(span);
    } else {
      const a = el("a", "bc-link", text);
      a.href = hash;
      li.append(a);
    }
    return li;
  };
  const items = [];
  if (!current) {
    items.push(item(t("nav.home"), "#/", true));
  } else {
    items.push(item(t("nav.home"), "#/", false));
    const parts = current.path.split("/").filter(Boolean);
    items.push(item(current.shortcut.label, formatHash(current.shortcut.id, "/"), parts.length === 0));
    let path = "";
    parts.forEach((part, i) => {
      path += "/" + part;
      items.push(item(part, formatHash(current.shortcut.id, path), i === parts.length - 1));
    });
  }
  list.replaceChildren(...items);
}

// A plain left click on a breadcrumb link is handled here, like any other
// move; Ctrl+click, a middle click and "copy link" work as on any link.
breadcrumb.addEventListener("click", (e) => {
  const a = e.target.closest("a.bc-link");
  if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  if (a.getAttribute("href") !== location.hash) pushEntry(a.getAttribute("href"));
  followUrl();
});

function setTitle() {
  document.title = current
    ? `${current.shortcut.label}${current.path === "/" ? "" : " – " + current.path} · Quick FTP Explorer`
    : `${t("nav.home")} · Quick FTP Explorer`;
}

const STALE_MS = 60_000;

async function onSelect(target) {
  const moved = !current || current.shortcut.id !== target.shortcut.id || current.path !== target.path;
  if (searching) clearSearch();   // as in File Explorer, going somewhere ends the search
  if (moved) {
    setSelecting(false, { render: false });   // leaving the folder ends selection mode
    hideNewFiles();
    lastCheck = Date.now();
    scheduleCheck();
    filters = { ...NO_FILTERS, ...restoring?.filters };
    selection = restoring ? restoredSelection(restoring) : sel.EMPTY;
    hideNotice();
  }
  current = target;
  listError = null;
  searchInput.placeholder = searchPlaceholder();
  // A new history entry per folder, unless the URL already says so (Back /
  // Forward, a pasted link, the page loading).
  const hash = formatHash(target.shortcut.id, target.path);
  if (location.hash !== hash) pushEntry(hash);
  if (narrow.matches) setDrawer(false, { toList: true });
  renderBreadcrumb();
  refreshBtn.disabled = false;
  updateNavButtons();
  setTitle();
  grid.hold();
  const seq = ++viewSeq;
  const { shortcut: sc, path } = target;
  const cached = tree.cached(sc, path);
  renderView();
  if (cached) {
    // An old listing shows at once and reloads behind the scenes.
    const age = Date.now() - (tree.loadedAt(sc, path) ?? 0);
    if (age > STALE_MS) refreshQuietly(seq);
    return;
  }
  try {
    const entries = await busy(t("nav.loadingFolder"), () => tree.listing(sc, path));
    if (seq !== viewSeq) return;
    renderView();
    announce(t("status.loaded", { place: placeParts().at(-1), count: tn("count.items", entries.length) }));
  } catch (err) {
    if (seq !== viewSeq) return;
    listError = err;
    renderView();
  }
}

async function refreshQuietly(seq) {
  const { shortcut: sc, path } = current;
  try {
    await tree.refresh(sc, path, { quiet: true });
    if (seq === viewSeq && !searching) renderView();
  } catch {
    // the cached rows stay; ↻ shows what went wrong
  }
}

function goHome({ push = true } = {}) {
  if (searching) clearSearch();
  setSelecting(false, { render: false });
  current = null;
  filters = { ...NO_FILTERS };
  selection = restoring ? restoredSelection(restoring) : sel.EMPTY;
  listError = null;
  hideNotice();
  searchInput.placeholder = searchPlaceholder();
  tree.selectHome();
  refreshBtn.disabled = true;
  if (push && location.hash !== "#/") pushEntry("#/");
  updateNavButtons();
  setTitle();
  renderBreadcrumb();
  grid.hold();
  if (narrow.matches) setDrawer(false, { toList: true });
  renderView();
}

// Up opens the parent folder, or Tous les sites from a site, and selects
// the folder or site you came from.
function goUp() {
  if (!current) return;
  const parent = parentPath(current.path);
  pendingSelect = `${current.shortcut.id}::${current.path}`;
  if (parent === null) goHome();
  else tree.reveal(current.shortcut, parent);
}

/* ---- history ---- */

// Every entry carries its index, so ← never leaves the app and → knows
// when there is nowhere to go.
const entryIdx = () => history.state?.idx ?? 0;
function maxIdx() {
  try {
    return Number(sessionStorage.getItem("qfe.maxIdx")) || 0;
  } catch {
    return 0;
  }
}
function pushEntry(url, extra = {}) {
  saveView();   // the entry being left keeps its view
  const idx = entryIdx() + 1;
  history.pushState({ idx, ...extra }, "", url);
  try {
    sessionStorage.setItem("qfe.maxIdx", String(idx));   // anything ahead is gone now
  } catch { /* Forward then stays available */ }
  updateNavButtons();
}

const navBack = $("nav-back"), navForward = $("nav-forward"), navUp = $("nav-up");
function updateNavButtons() {
  navBack.disabled = entryIdx() === 0;
  navForward.disabled = entryIdx() >= maxIdx();
  navUp.disabled = !current;
  const parent = current ? parentPath(current.path) : null;
  navUp.title = current
    ? t("nav.up", { parent: parent === null ? t("nav.home") : parent === "/" ? current.shortcut.label : parent.split("/").at(-1) })
    : "";
  navUp.setAttribute("aria-label", navUp.title || t("nav.upPlain"));
}
navBack.addEventListener("click", () => { if (entryIdx() > 0) history.back(); });
navForward.addEventListener("click", () => history.forward());
navUp.addEventListener("click", goUp);

// Each entry remembers its view; written as it changes (debounced), and
// at once before leaving.
let saveTimer = 0;
function saveView() {
  clearTimeout(saveTimer);
  if (!booted || viewer.isOpen() || history.state?.viewer) return;
  const view = {
    query: searchInput.value,
    filters,
    selected: [...selection.selected].slice(0, 200),
    focusKey: selection.focus,
    scrollTop: fileList.scrollTop,
  };
  history.replaceState({ ...history.state, view }, "", location.href);
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveView, 300);
}
fileList.addEventListener("scroll", scheduleSave, { passive: true });

function restoredSelection(view) {
  return { selected: new Set(view.selected ?? []), anchor: view.focusKey ?? null, focus: view.focusKey ?? null };
}

// Show whatever the URL names (page load, Back / Forward, an edited or
// pasted link). Unknown sites and no fragment show Tous les sites. Until
// the sites are loaded, a link can't be told from an unknown one: the boot
// follows the URL once they are.
let booted = false;
function followUrl() {
  if (!booted) return;
  const target = parseHash(location.hash);
  if (!target) {
    if (current) goHome({ push: false });
    return;
  }
  const sc = shortcuts.find((s) => s.id === target.id);
  if (target.open && sc) {
    // A clip link: the folder, then the viewer. The entry becomes the
    // folder's, so Back from the viewer stays in the folder.
    history.replaceState({ idx: entryIdx() }, "", formatHash(target.id, target.path));
    pendingOpen = `${target.id}::${target.path === "/" ? "" : target.path}/${target.open}`;
    if (current && current.shortcut.id === target.id && current.path === target.path) renderView();
  }
  if (current && current.shortcut.id === target.id && current.path === target.path) return;
  if (sc) tree.reveal(sc, target.path);
  else {
    history.replaceState({ idx: entryIdx() }, "", "#/");
    goHome({ push: false });
  }
}

window.addEventListener("popstate", () => {
  // The viewer has a history entry of its own: Back closes it.
  const wanted = history.state?.viewer;
  updateNavButtons();
  if (viewer.isOpen() && !wanted) {
    const last = viewer.current();
    viewer.close();
    if (last) selectAndFocus(last.key);
    return;
  }
  const target = parseHash(location.hash);
  const here = target ? current && current.shortcut.id === target.id && current.path === target.path : !current;
  if (!here) restoring = history.state?.view ?? null;
  followUrl();
  if (!viewer.isOpen() && wanted) {
    const row = grid.row(wanted.key);
    if (row) openViewer(row, { push: false });
  }
});
window.addEventListener("hashchange", followUrl);

function selectAndFocus(key) {
  if (!grid.row(key)) return;
  selection = sel.click(sel.EMPTY, shownRows.map((r) => r.key), key);
  grid.update(selection);
  grid.focus(key);
  updateChrome();
}

/* ---- refresh ---- */

function showNotice(text, retry) {
  notice.replaceChildren(el("span", "", text));
  if (retry) {
    const button = el("button", "btn-secondary btn-sm", t("common.retry"));
    button.type = "button";
    button.addEventListener("click", () => {
      hideNotice();
      retry();
    });
    notice.append(button);
  }
  notice.hidden = false;
}
function hideNotice() {
  notice.hidden = true;
  notice.replaceChildren();
}

// ↻ keeps the rows on screen while the listing reloads.
async function refresh() {
  if (!current) return;
  const target = current;
  const seq = viewSeq;
  hideNotice();
  hideNewFiles();
  grid.table()?.setAttribute("aria-busy", "true");
  const before = tree.cached(target.shortcut, target.path);
  try {
    const entries = await busy(t("nav.refreshing"), () => tree.refresh(target.shortcut, target.path, { quiet: true }));
    if (before) tagNew(target.shortcut, target.path, diffListing(before, entries).added);
    listError = null;
  } catch (err) {
    if (seq !== viewSeq) return;
    if (tree.cached(target.shortcut, target.path) || shownRows.length) {
      showNotice(t("refresh.failed", { reason: err.message }), refresh);
    } else {
      listError = err;
    }
  }
  if (seq !== viewSeq) return;
  grid.table()?.removeAttribute("aria-busy");
  if (searching) restartSearch();
  else renderView();
}

/* ---- opening files ---- */

function follow(url, { newTab = false, download = false } = {}) {
  const a = el("a");
  a.href = url;
  if (newTab) {
    a.target = "_blank";
    a.rel = "noopener";
  }
  if (download) a.setAttribute("download", "");
  a.click();
}

/* ---- new files while you watch ---- */

const CHECK_MS = 60_000, ACTIVE_MS = 30 * 60_000, TAG_MS = 10 * 60_000;
let checkTimer = 0, lastCheck = 0, lastActivity = Date.now(), waiting = null;   // waiting: { sc, path, entries }

function freshKeys() {
  const now = Date.now();
  for (const [key, until] of fresh) if (until <= now) fresh.delete(key);
  return new Set(fresh.keys());
}

// The rows that just arrived keep a "Nouveau" tag for a while, or until opened.
function tagNew(sc, path, entries) {
  const until = Date.now() + TAG_MS;
  for (const entry of entries) if (!entry.isDir) fresh.set(`${sc.id}::${path === "/" ? "" : path}/${entry.name}`, until);
}

function hideNewFiles() {
  waiting = null;
  $("new-files").hidden = true;
}

function showNewFiles(count) {
  const box = $("new-files");
  const show = el("button", "link-button", t("refresh.show"));
  show.type = "button";
  show.addEventListener("click", applyNewFiles);
  box.replaceChildren(el("span", "", tn("refresh.new", count)), document.createTextNode(" · "), show);
  if (box.hidden) announce(tn("refresh.new", count));
  box.hidden = false;
}

// Afficher: the new listing, with the new files tagged and in their place;
// the selection, the focus and the scroll stay.
function applyNewFiles() {
  if (!waiting || !current || waiting.sc.id !== current.shortcut.id || waiting.path !== current.path) return hideNewFiles();
  const { sc, path, entries } = waiting;
  tagNew(sc, path, diffListing(tree.cached(sc, path) ?? [], entries).added);
  tree.store(sc, path, entries);
  hideNewFiles();
  renderView();
}

// Checks only when someone is looking: a folder open, the tab visible, the
// user active lately, and nothing else on screen.
function quietMoment() {
  return current && !searching && document.visibilityState === "visible" && Date.now() - lastActivity < ACTIVE_MS &&
    !viewer.isOpen() && !document.querySelector("dialog[open], .ctx-menu");
}

async function checkNewFiles() {
  checkTimer = 0;
  if (quietMoment() && tree.cached(current.shortcut, current.path)) {
    const { shortcut: sc, path } = current;
    lastCheck = Date.now();
    try {
      const entries = await api.listDir(sc.id, path, { auto: true });
      if (current && current.shortcut.id === sc.id && current.path === path) {
        const { added, removed } = diffListing(tree.cached(sc, path) ?? [], entries);
        if (added.length || removed.length) {
          waiting = { sc, path, entries };
          if (added.length) showNewFiles(added.length);
          else applyNewFiles();   // only files gone: nothing to read twice
        }
      }
    } catch {
      // silent: the next minute tries again
    }
  }
  scheduleCheck();
}

function scheduleCheck() {
  clearTimeout(checkTimer);
  checkTimer = setTimeout(checkNewFiles, CHECK_MS);
}

for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, () => { lastActivity = Date.now(); }, true);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastCheck > CHECK_MS) {
    clearTimeout(checkTimer);
    checkNewFiles();
  }
});

function openRow(row) {
  fresh.delete(row.key);
  if (row.kind === "site") tree.reveal(row.sc, "/");
  else if (row.isDir) tree.reveal(row.sc, row.path);
  else openFile(row);
}

function openInNewTab(row) {
  window.open(location.pathname + formatHash(row.sc.id, row.path), "_blank", "noopener");
}

const placeOf = (row) => [row.sc.label, ...String(row.parent ?? "/").split("/").filter(Boolean)].join(" › ");

// What the viewer shows for a row: its URLs, and "Cam 2 · 01/11/2026 16:15".
function viewerItem(row) {
  const kind = kindFor(row.name);
  const inline = inlineType(row.name);
  const url = api.fileUrl(row.sc.id, row.path);
  const downloadUrl = api.fileUrl(row.sc.id, row.path, { download: true });
  const time = row.time === null ? "" : formatDateTime(row.time, row.timeSource === "name" ? row.precision : "minute");
  const caption = row.camera && time ? t("viewer.caption", { camera: row.camera, time }) : row.camera || time || row.name;
  const subtitle = searching ? t("viewer.nameIn", { name: row.name, place: placeOf(row) }) : caption === row.name ? "" : row.name;
  if (kind === "video") {
    // MP4 & co. stream straight from FTP. Other videos, and those the browser
    // turns out not to decode, come through the server's converter.
    const playUrl = api.playUrl(row.sc.id, row.path);
    return { name: row.name, kind, url: inline ? url : playUrl, fallbackUrl: inline ? playUrl : null, downloadUrl, caption, subtitle };
  }
  return { name: row.name, kind, url, downloadUrl, caption, subtitle };
}

function openViewer(row, { push = true } = {}) {
  const { items, index } = playlist(shownRows, row.key, selection.selected);
  if (index < 0) return;
  grid.hold();
  if (push) pushEntry(location.href, { viewer: { key: row.key } });
  viewer.open(items, index, {
    describe: viewerItem,
    onShow(shownRow) {
      history.replaceState({ ...history.state, viewer: { key: shownRow.key } }, "", location.href);
    },
    onRequestClose: () => history.back(),
    onClosed(last) {
      if (history.state?.viewer) history.back();
      if (last) selectAndFocus(last.key);
    },
    copyLink: (shownRow) => copyLinks([shownRow]),
  });
}

function openFile(row) {
  if (viewable(row)) return openViewer(row);
  const inline = inlineType(row.name);
  if (inline) follow(api.fileUrl(row.sc.id, row.path), { newTab: true });   // PDF and text: the browser's own viewer
  else follow(api.fileUrl(row.sc.id, row.path, { download: true }), { download: true });
}

const selectedRows = () => shownRows.filter((r) => selection.selected.has(r.key));

// A folder's or site's link, or a clip's ("?open=<name>").
const linkFor = (row) => location.origin + location.pathname +
  (row.isDir ? formatHash(row.sc.id, row.path) : formatHash(row.sc.id, row.parent, { open: row.name }));
const canShare = () => !!navigator.share && window.matchMedia("(pointer: coarse)").matches;

// The selection's links, one per line, or the open folder's.
async function copyLinks(rows = selectedRows()) {
  const links = rows.length ? rows.map(linkFor) : current ? [location.origin + location.pathname + formatHash(current.shortcut.id, current.path)] : [];
  if (!links.length) return;
  if (canShare() && links.length === 1) {
    try {
      await navigator.share({ url: links[0] });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  try {
    await navigator.clipboard.writeText(links.join("\n"));
    toast(tn("share.copied", links.length), { error: false });
  } catch {
    showLinkDialog(links.join("\n"));
  }
}

const linkDialog = $("link-dialog");
function showLinkDialog(text) {
  const field = $("link-field");
  field.value = text;
  field.rows = Math.min(6, text.split("\n").length);
  if (!linkDialog.open) linkDialog.showModal();
  field.focus();
  field.select();
}
$("link-close").addEventListener("click", () => linkDialog.close());

function linkLabel(count) {
  if (canShare() && count <= 1) return t("share.share");
  return count > 1 ? t("share.copyMany") : t("share.copy");
}

function openSelection() {
  const picked = selectedRows();
  const files = picked.filter((r) => !r.isDir);
  if (picked.length === 1) openRow(picked[0]);
  else if (files.length >= 2) {
    const first = files.find(viewable);
    if (first) openViewer(first);
  }
}

const pad2 = (n) => String(n).padStart(2, "0");
function localStamp() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

async function downloadSelection() {
  const files = selectedRows().filter((r) => !r.isDir);
  const state = downloadState(files);
  if (!state.enabled) return;
  if (files.length === 1) {
    follow(api.fileUrl(files[0].sc.id, files[0].path, { download: true }), { download: true });
    return;
  }
  try {
    const { url } = await busy(t("zip.preparing"), () => api.prepareZip(files[0].sc.id, files.map((r) => r.path), localStamp()));
    // HEAD uses nothing up: it tells whether the archive can start now.
    const check = await fetch(url, { method: "HEAD" });
    if (!check.ok) throw new Error(check.status === 503 ? t("err.zipBusy") : t("api.failed", { status: String(check.status) }));
    follow(url, { download: true });
  } catch (err) {
    toast(t("zip.failed", { reason: err.message }));
  }
}

/* ---- search ---- */

// The open folder and all its subfolders, or every site when none is open.
// Typing only re-filters what the walk has read (search.js); the walk starts
// again only when the place searched changes.
const MAX_SHOWN = 500;
let searchTimer = 0;
let renderTimer = 0;

function searchPlaceholder() {
  return current ? t("search.in", { place: placeParts().at(-1) }) : t("search.allSites");
}

function stopSearch() {
  searching?.progress.cancel();
  searching = null;
  clearTimeout(renderTimer);
  renderTimer = 0;
  resultsHeader.hidden = true;
  resultsHeader.replaceChildren();
}

function clearSearch() {
  clearTimeout(searchTimer);
  searchInput.value = "";
  searchClear.hidden = true;
  stopSearch();
}

function scopeText() {
  return current ? placeParts().join(" › ") : t("search.scopeAll");
}

function runSearch() {
  const query = searchInput.value.trim();
  searchClear.hidden = !searchInput.value;
  if (!query) {
    if (searching) {
      stopSearch();
      renderView();
    }
    return;
  }
  if (narrow.matches) setDrawer(false);
  const key = current ? `${current.shortcut.id}::${current.path}` : "*";
  if (searching?.key !== key) {
    stopSearch();
    const roots = current ? [{ sc: current.shortcut, path: current.path }] : shortcuts.map((sc) => ({ sc, path: "/" }));
    searching = { key, progress: scan(roots, tree.listing, queueSearchRender), header: null };
    announce(t("search.started", { scope: scopeText() }));
  }
  renderView();
}

function restartSearch() {
  stopSearch();
  runSearch();
}

// Folders are read in bursts: redraw at most every 300 ms, and once more
// when the walk ends.
function queueSearchRender(progress) {
  if (progress.done) {
    clearTimeout(renderTimer);
    renderTimer = 0;
    if (searching) {
      renderView();
      announce(searching.header?.status.textContent ?? "");
    }
    return;
  }
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = 0;
    if (searching) renderView();
  }, 300);
}

function searchRows() {
  const query = searchInput.value.trim();
  const terms = searchTerms(query);
  const { progress } = searching;
  const marks = new Map(), places = new Map();
  const sites = current ? [] : shortcuts
    .map((sc) => ({ sc, ranges: matchName(sc.label, terms) }))
    .filter((site) => site.ranges)
    .map(({ sc, ranges }) => {
      const row = siteRow(sc);
      marks.set(row.key, ranges);
      return row;
    });
  const rows = [];
  for (const item of progress.items) {
    const ranges = matchFolded(item.folded, terms);
    if (!ranges) continue;
    const row = describeEntry(item.entry, { sc: item.sc, parent: item.parent });
    marks.set(row.key, ranges);
    places.set(row.key, placeOf(row));
    rows.push(row);
  }
  return {
    mode: "search", label: t("a11y.results"), rows, sites, marks, places, query,
    empty: emptyNode(progress.done ? t("search.none", { query, scope: scopeText() }) : t("search.started", { scope: scopeText() })),
  };
}

// Built once per search, then updated in place.
function updateResultsHeader(view) {
  const { progress } = searching;
  if (!searching.header) {
    const statusLine = el("p", "search-status");
    const notes = el("div", "search-notes");
    resultsHeader.replaceChildren(statusLine, notes);
    if (current) {
      const all = el("button", "btn-secondary btn-sm", t("search.allSites"));
      all.type = "button";
      all.addEventListener("click", () => {
        const query = searchInput.value;
        goHome();
        searchInput.value = query;
        runSearch();
      });
      resultsHeader.append(all);
    }
    searching.header = { status: statusLine, notes };
  }
  const matches = view.rows.length + view.sites.length;
  const results = tn("count.results", matches);
  const scope = scopeText();
  searching.header.status.textContent = !progress.done
    ? t("search.running", { scope, folders: tn("count.foldersRead", progress.listed), results })
    : t(matches ? "search.done" : "search.none", { query: view.query, scope, results });
  const notes = [];
  if (view.capped) notes.push(t("search.capped", { n: MAX_SHOWN }));
  if (progress.truncated) notes.push(t("search.truncated", { max: LIMITS.folders }));
  if (progress.failed) notes.push(tn("search.failed", progress.failed));
  searching.header.notes.replaceChildren(...notes.map((n) => el("p", "search-note", n)));
  resultsHeader.hidden = false;
}

searchInput.addEventListener("input", () => {
  searchClear.hidden = !searchInput.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 150);
});
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && searchInput.value) {
    e.preventDefault();
    e.stopPropagation();
    clearSearch();
    renderView();
  } else if (e.key === "Enter") {
    e.preventDefault();
    clearTimeout(searchTimer);
    runSearch();
  } else if (e.key === "ArrowDown" && searching && shownRows.length) {
    e.preventDefault();
    selectAndFocus(shownRows[0].key);
  }
});
searchClear.addEventListener("click", () => {
  clearSearch();
  renderView();
  searchInput.focus();
});

/* ---- phone search: the field laid over the top bar ---- */

const topbar = document.querySelector(".topbar");
function openPhoneSearch() {
  topbar.classList.add("searching");
  layers.push("search", closePhoneSearch);
  searchInput.focus();
}
function closePhoneSearch() {
  layers.remove("search");
  topbar.classList.remove("searching");
  if (searchInput.value) {
    clearSearch();
    renderView();
  }
  $("search-open").focus();
}
$("search-open").addEventListener("click", openPhoneSearch);
$("search-close").addEventListener("click", closePhoneSearch);

/* ---- keyboard shortcuts ---- */

function focusSearch() {
  if (narrow.matches) openPhoneSearch();
  searchInput.focus();
  searchInput.select();
}

onShortcut((name, e) => {
  if (document.querySelector("dialog[open]")) return false;
  switch (name) {
    case "find":
      if (e.target === searchInput) return false;   // the browser's own find, then
      focusSearch();
      return true;
    case "menu": {
      const row = grid.rowAt(document.activeElement);
      if (row) {
        rowMenu(row, document.activeElement);
        return true;
      }
      const item = tree.itemAt(document.activeElement);
      if (item) {
        treeMenu(item, item.element);
        return true;
      }
      return false;
    }
    case "up":
      if (!current || isTypingTarget(e.target)) return false;
      goUp();
      return true;
    case "back":
      if (isTypingTarget(e.target) || entryIdx() === 0) return false;
      history.back();
      return true;
    case "help":
      openHelp();
      return true;
    default:
      return false;
  }
});

/* ---- phones: selection mode ---- */

function setSelecting(on, { render = true } = {}) {
  if (selecting === on) return;
  selecting = on;
  appEl.classList.toggle("selecting", on);
  if (on) layers.push("selecting", () => setSelecting(false));
  else {
    layers.remove("selecting");
    selection = sel.clear(selection);
  }
  if (render) renderView();
}
$("select-mode").addEventListener("click", () => setSelecting(!selecting));
$("sel-cancel").addEventListener("click", () => setSelecting(false));
$("sel-all").addEventListener("click", selectAllFiles);
$("sel-download").addEventListener("click", downloadSelection);
$("sel-link").addEventListener("click", () => copyLinks());
narrow.addEventListener("change", () => { if (!narrow.matches) setSelecting(false); });

/* ---- "Trouver un site" ---- */

const siteFind = $("site-find");
const siteFindClear = $("site-find-clear");
function clearSiteFind() {
  siteFind.value = "";
  siteFindClear.hidden = true;
  tree.find("");
}
siteFind.addEventListener("input", () => {
  siteFindClear.hidden = !siteFind.value;
  tree.find(siteFind.value);
});
siteFind.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const sc = tree.find(siteFind.value);
    if (sc) tree.reveal(sc, "/");
  } else if (e.key === "ArrowDown") {
    tree.focusFirstSite();
  } else if (e.key === "Escape" && siteFind.value) {
    clearSiteFind();
    e.stopPropagation();   // and the drawer stays open
  } else {
    return;
  }
  e.preventDefault();
});
siteFindClear.addEventListener("click", () => {
  clearSiteFind();
  siteFind.focus();
});

/* ---- help ---- */

const helpDialog = $("help-dialog");
function openHelp() {
  const body = $("help-keys");
  if (!body.children.length) {
    for (const [keys, action] of SHORTCUTS) {
      const tr = el("tr");
      tr.append(el("td", "help-key", t(keys)), el("td", "", t(action)));
      body.append(tr);
    }
  }
  if (narrow.matches) setDrawer(false);
  if (!helpDialog.open) helpDialog.showModal();
  $("help-close").focus();
}
$("help-open").prepend(icon("help"));
$("help-open").addEventListener("click", openHelp);
$("help-close").addEventListener("click", () => helpDialog.close());

$("skip").addEventListener("click", () => {
  const row = grid.focusedRow() ?? shownRows[0];
  if (row) grid.focus(row.key);
  else fileList.focus();
});

/* ---- context menus ---- */

function rowMenu(row, at) {
  if (!selection.selected.has(row.key)) {
    selection = sel.click(selection, shownRows.map((r) => r.key), row.key);
    grid.update(selection);
    updateChrome();
  }
  const items = [{ label: t("cmd.open"), isDefault: true, run: () => openRow(row) }];
  const picked = selectedRows();
  const link = { label: linkLabel(picked.length), run: () => copyLinks(picked) };
  if (row.kind === "site") {
    items.push({ label: t("menu.openNewTab"), run: () => openInNewTab(row) }, link);
    if (isAdmin()) siteAdminItems(items, row.sc);
  } else if (row.isDir) {
    items.push({ label: t("menu.openNewTab"), run: () => openInNewTab(row) }, link);
  } else {
    const files = selectedRows().filter((r) => !r.isDir);
    const state = downloadState(files);
    items.push({
      label: files.length > 1 ? t("cmd.downloadCount", { n: files.length }) : t("cmd.download"),
      disabled: !state.enabled, title: state.title, run: downloadSelection,
    });
    items.push(link);
    if (searching) items.push({ label: t("menu.openLocation"), run: () => openLocation(row) });
    items.push("separator", { label: t("menu.selectAll"), shortcut: t("kbd.ctrlA"), run: selectAllFiles });
  }
  openMenu(at, items, { label: t("menu.label", { name: row.name }) });
}

function siteAdminItems(items, sc) {
  const full = shortcuts.find((s) => s.id === sc.id) ?? sc;
  items.push("separator",
    { label: t("sc.menuEdit"), run: () => openShortcutModal(full) },
    { label: t("sc.menuDelete"), danger: true, run: () => deleteShortcut(full) });
}

function treeMenu(item, at) {
  if (item.home) {
    openMenu(at, [{ label: t("cmd.open"), isDefault: true, run: () => goHome() }], { label: t("nav.home") });
    return;
  }
  const row = { sc: item.sc, path: item.path };
  const items = [
    { label: t("cmd.open"), isDefault: true, run: () => tree.reveal(item.sc, item.path) },
    { label: t("menu.openNewTab"), run: () => openInNewTab(row) },
  ];
  if (item.isRoot && isAdmin()) siteAdminItems(items, item.sc);
  openMenu(at, items, { label: t("menu.label", { name: item.isRoot ? item.sc.label : item.path.split("/").at(-1) }) });
}

function listMenu(at) {
  const items = [];
  if (current) items.push({ label: t("nav.refresh"), run: refresh });
  items.push({ label: t("menu.selectAll"), shortcut: t("kbd.ctrlA"), run: selectAllFiles });
  openMenu(at, items, { label: t("menu.listLabel") });
}

function selectAllFiles() {
  selection = sel.selectAll(selection, shownRows.filter((r) => !r.isDir).map((r) => r.key));
  grid.update(selection);
  updateChrome();
}

function openLocation(row) {
  clearSearch();
  pendingSelect = row.key;
  tree.reveal(row.sc, row.parent);
}

appEl.addEventListener("contextmenu", (e) => {
  if (isTypingTarget(e.target) || e.target.closest("a, dialog")) return;   // the browser's own menu
  const point = { x: e.clientX, y: e.clientY };
  const row = grid.rowAt(e.target);
  if (row) {
    e.preventDefault();
    rowMenu(row, point);
    return;
  }
  const item = tree.itemAt(e.target);
  if (item) {
    e.preventDefault();
    treeMenu(item, point);
    return;
  }
  if (fileList.contains(e.target) && viewName() !== "home") {
    e.preventDefault();
    listMenu(point);
  } else if (leftPane.contains(e.target) && isAdmin()) {
    e.preventDefault();
    openMenu(point, [{ label: t("sc.menuNew"), run: () => openShortcutModal(null) }], { label: t("nav.shortcuts") });
  }
});

/* ---- splitter: drag, click, or the arrow keys ---- */

const DEFAULT_WIDTH = 280;
let paneWidth = DEFAULT_WIDTH;
function setPaneWidth(width, save = true) {
  const w = Math.max(180, Math.min(560, Math.round(width)));
  paneWidth = w;
  leftPane.style.width = w + "px";
  splitter.setAttribute("aria-valuenow", String(w));
  if (save) prefs.set("leftPaneWidth", w);
}
setPaneWidth(prefs.get("leftPaneWidth") ?? DEFAULT_WIDTH, false);

let drag = null;
splitter.addEventListener("pointerdown", (e) => {
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add("dragging");
  drag = { x: e.clientX, moved: false };
  e.preventDefault();
});
splitter.addEventListener("pointermove", (e) => {
  if (!drag || !splitter.hasPointerCapture(e.pointerId)) return;
  if (Math.abs(e.clientX - drag.x) > 3) drag.moved = true;
  if (drag.moved) setPaneWidth(e.clientX, false);
});
splitter.addEventListener("pointerup", (e) => {
  splitter.releasePointerCapture(e.pointerId);
  splitter.classList.remove("dragging");
  const width = paneWidth;
  // A click without moving steps through three widths: resizing without dragging.
  if (drag && !drag.moved) {
    const steps = [220, 280, 400];
    setPaneWidth(steps.find((s) => s > width + 4) ?? steps[0]);
  } else {
    setPaneWidth(width);
  }
  drag = null;
});
splitter.addEventListener("keydown", (e) => {
  const width = paneWidth;
  const step = e.shiftKey ? 64 : 16;
  const keys = { ArrowLeft: width - step, ArrowRight: width + step, Home: 180, End: 560, Enter: DEFAULT_WIDTH };
  if (!(e.key in keys)) return;
  e.preventDefault();
  setPaneWidth(keys[e.key]);
});

/* ---- narrow screens: the sites pane as a drawer ---- */

const scrim = $("scrim");
// toList: something was chosen in the drawer; the focus goes to the list as
// soon as its rows show (the folder may still be loading).
let focusList = false;
function setDrawer(open, { refocus = false, toList = false } = {}) {
  if (appEl.classList.contains("drawer-open") === open) return;
  appEl.classList.toggle("drawer-open", open);
  menuBtn.setAttribute("aria-expanded", String(open));
  scrim.hidden = !open;
  mainEl.inert = open && narrow.matches;
  statusBar.inert = open && narrow.matches;
  if (open) {
    layers.push("drawer", () => setDrawer(false, { refocus: true }));
    tree.focus();
  } else {
    layers.remove("drawer");
    if (toList && leftPane.contains(document.activeElement)) focusList = true;
    else if (refocus || leftPane.contains(document.activeElement) || document.activeElement === document.body) menuBtn.focus();
  }
}
menuBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  setDrawer(!appEl.classList.contains("drawer-open"));
});
scrim.addEventListener("click", () => setDrawer(false, { refocus: true }));

// Phones keep the account controls at the foot of the drawer: the same
// nodes, so the sign-out form keeps working.
const account = $("account");
function placeAccount() {
  if (narrow.matches) $("drawer-foot").append(account);
  else statusBar.append(account);
  if (!narrow.matches) setDrawer(false);
  if (booted) renderView();   // the check boxes come and go
}
narrow.addEventListener("change", placeAccount);

/* ---- sites: New / Edit / Delete (admins) ---- */

newBtn.addEventListener("click", () => openShortcutModal(null));

async function deleteShortcut(sc) {
  if (!confirm(t("sc.confirmDelete", { label: sc.label }))) return;
  try {
    await busy(t("sc.deleting"), () => api.deleteShortcut(sc.id));
  } catch (err) {
    alert(t("sc.deleteFailed", { reason: err.message }));
    return;
  }
  if (current?.shortcut.id === sc.id) goHome({ push: false });
  await loadShortcuts();
}

const modal = $("sc-modal");
const form = $("sc-form");
const modalTitle = $("sc-modal-title");
const formError = $("sc-error");
const f = {
  username: $("f-username"), custom: $("f-custom"), host: $("f-host"),
  port: $("f-port"), password: $("f-password"), preview: $("f-preview"),
  passwordHint: $("f-password-hint"),
};
let editing = null;          // the site being edited, or null for "new"
let passwordTouched = false;
let modalOpener = null;

function updatePreview() {
  f.preview.textContent = composeLabel(f.username.value.trim(), f.custom.value.trim());
}

function openShortcutModal(existing) {
  editing = existing;
  modalOpener = document.activeElement;
  formError.hidden = true;
  if (existing) {
    modalTitle.textContent = t("sc.titleEdit");
    f.username.value = existing.username;
    f.custom.value = splitLabel(existing.label, existing.username);
    f.host.value = existing.host;
    f.port.value = existing.port;
    // The stored password never reaches the browser: blank keeps it.
    f.password.value = "";
    f.password.placeholder = t("sc.passwordUnchanged");
    f.passwordHint.textContent = t("sc.passwordHint");
    passwordTouched = true;
  } else {
    modalTitle.textContent = t("sc.titleNew");
    f.username.value = "";
    f.custom.value = "";
    f.host.value = me.defaults?.host ?? "";
    f.port.value = me.defaults?.port ?? 21;
    f.password.value = "";
    f.password.placeholder = t("sc.passwordDefault");
    f.passwordHint.textContent = "";
    passwordTouched = false;
  }
  updatePreview();
  modal.showModal();
  f.username.focus();
  f.username.select();
}

function closeModal() {
  if (modal.open) modal.close();
}
modal.addEventListener("close", () => {
  editing = null;
  if (modalOpener?.isConnected) modalOpener.focus();
  modalOpener = null;
});

// As in the HTA: in "new" mode the password mirrors the username until typed.
f.username.addEventListener("input", () => {
  updatePreview();
  if (!passwordTouched) f.password.value = f.username.value;
});
f.custom.addEventListener("input", updatePreview);
f.password.addEventListener("input", () => {
  passwordTouched = !editing ? f.password.value.length > 0 : true;
});
// Only a click that starts and ends on the backdrop closes the form: not one
// in its padding, nor the end of a text selection dragged out of a field.
const outsideModal = (e) => {
  const r = modal.getBoundingClientRect();
  return e.target === modal && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
};
let downOnBackdrop = false;
modal.addEventListener("pointerdown", (e) => { downOnBackdrop = outsideModal(e); });
modal.addEventListener("click", (e) => {
  if (downOnBackdrop && outsideModal(e)) closeModal();
  downOnBackdrop = false;
});
$("sc-cancel").addEventListener("click", closeModal);

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = f.username.value.trim();
  const fields = {
    username,
    label: composeLabel(username, f.custom.value.trim()),
    host: f.host.value.trim(),
    port: Number(f.port.value) || 21,
    password: f.password.value,
  };
  const wasEditing = editing;
  let id;
  try {
    id = await busy(t("sc.saving"), () => (wasEditing ? api.updateShortcut(wasEditing.id, fields) : api.createShortcut(fields)));
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
    return;
  }
  closeModal();
  await loadShortcuts();
  if (wasEditing && current?.shortcut.id === wasEditing.id) {
    // Same id: keep browsing it with the fresh details. Renamed: the old
    // tree node is gone, so start over from the renamed site's root.
    const fresh = shortcuts.find((sc) => sc.id === id);
    if (fresh && id === wasEditing.id) {
      current = { ...current, shortcut: fresh };
      renderBreadcrumb();
      setTitle();
    } else if (fresh) {
      tree.reveal(fresh, "/");
    } else {
      goHome({ push: false });
    }
  }
});

/* ---- boot ---- */

refreshBtn.addEventListener("click", refresh);
toolbar.init({
  onAction: (name) => (name === "open" ? openSelection() : name === "link" ? copyLinks() : downloadSelection()),
  onSort: setSort,
  onFilters: (next) => setFilters(next),
});

// Sliding periods ("Dernière heure"...) move with the clock.
setInterval(() => {
  if (current && activeFilters(filters).some((a) => a.name === "period")) renderView();
}, 60_000);

try {
  me = await api.me();
  status.user.textContent = t(isAdmin() ? "auth.signedInAsAdmin" : "auth.signedInAs", { name: me.username });
  newBtn.hidden = !isAdmin();
  tree.init(listEl, {
    onSelect,
    onHome: () => goHome(),
    onMore: (sc, button) => treeMenu({ sc, path: "/", isRoot: true }, button),
    admin: isAdmin(),
  });
  placeAccount();
  await loadShortcuts();
  searchInput.placeholder = searchPlaceholder();
  if (history.state?.idx === undefined) history.replaceState({ ...history.state, idx: 0 }, "", location.href);
  if (history.state?.viewer) {
    const { viewer: _gone, ...rest } = history.state;
    history.replaceState(rest, "", location.href);
  }
  restoring = history.state?.view ?? null;   // F5: the same view again
  booted = true;
  if (parseHash(location.hash)) followUrl();
  else goHome({ push: false });
  updateNavButtons();
} catch (err) {
  if (err.status !== 401) fileList.replaceChildren(el("p", "placeholder placeholder-error", err.message));
}

