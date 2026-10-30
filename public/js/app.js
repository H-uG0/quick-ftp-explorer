/*
 * app.js - orchestration and event wiring for the explorer page.
 *
 * Selecting a folder in the tree (or a breadcrumb segment, or a folder row
 * on the right) shows its files on the right. Clicking a file opens it by
 * kind: images, video and audio in the in-app viewer; PDF and text in a new
 * tab; everything else downloads. Admins also manage shortcuts here: "+ New"
 * in the left pane, or right-click a shortcut for Edit / Delete.
 */

import * as api from "./api.js";
import { tree, files, el } from "./ui.js";
import { viewer } from "./viewer.js";
import { kindFor, inlineType } from "./filetypes.js";
import { splitLabel, composeLabel } from "./util.js";

const $ = (id) => document.getElementById(id);
const listEl = $("shortcut-list");
const emptyHint = $("empty-hint");
const leftPane = $("left-pane");
const splitter = $("splitter");
const rightPane = $("file-list");
const breadcrumb = $("breadcrumb");
const refreshBtn = $("refresh");
const searchInput = $("search");
const statusInfo = $("status-info");
const statusUser = $("status-user");
const newBtn = $("new-shortcut");

let me = null;
let shortcuts = [];
let current = null;    // { shortcut, path } shown on the right
let rightView = null;  // what the right pane shows (see files.render)
let filter = "";
let viewSeq = 0;       // ignore listings that arrive after the selection moved on

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

/* ---- shortcuts ---- */

function isAdmin() {
  return me?.role === "admin";
}

async function loadShortcuts() {
  shortcuts = await api.shortcuts();
  tree.setShortcuts(shortcuts);
  emptyHint.textContent = isAdmin()
    ? "No shortcuts yet. Click + New (or right-click here) to create one."
    : "No shortcuts yet. Ask an administrator to add some.";
  emptyHint.hidden = shortcuts.length > 0;
  statusInfo.textContent = `${shortcuts.length} shortcut${shortcuts.length === 1 ? "" : "s"}`;
}

/* ---- right pane ---- */

function renderRight(view) {
  rightView = view;
  files.render(rightPane, current && { ...view, path: current.path, filter }, {
    onNavigate: (path) => tree.reveal(current.shortcut, path),
    onOpen: (entry, path) => openFile(current.shortcut, entry, path),
    onRetry: () => onSelect(current),
  });
}

function renderBreadcrumb(sel) {
  if (!sel) {
    breadcrumb.replaceChildren(el("span", "bc-segment muted", "Select a shortcut"));
    return;
  }
  const segment = (text, path) => {
    const s = el("span", "bc-segment", text);
    if (path !== null) {
      s.classList.add("clickable");
      s.addEventListener("click", () => tree.reveal(sel.shortcut, path));
    }
    return s;
  };
  const parts = sel.path.split("/").filter(Boolean);
  const nodes = [segment(sel.shortcut.label, parts.length ? "/" : null)];
  let path = "";
  parts.forEach((part, i) => {
    path += "/" + part;
    nodes.push(el("span", "bc-separator", "›"), segment(part, i < parts.length - 1 ? path : null));
  });
  breadcrumb.replaceChildren(...nodes);
}

async function onSelect(sel) {
  current = sel;
  renderBreadcrumb(sel);
  refreshBtn.disabled = false;
  document.title = `${sel.shortcut.label}${sel.path === "/" ? "" : " – " + sel.path} · Quick FTP Explorer`;
  const seq = ++viewSeq;
  const cached = tree.cached(sel.shortcut, sel.path);
  renderRight({ entries: cached });
  if (cached) return;
  try {
    const entries = await busy("Loading folder…", () => tree.listing(sel.shortcut, sel.path));
    if (seq === viewSeq) renderRight({ entries });
  } catch (err) {
    if (seq === viewSeq) renderRight({ error: err });
  }
}

function clearSelection() {
  current = null;
  tree.clearSelection();
  refreshBtn.disabled = true;
  document.title = "Quick FTP Explorer";
  renderBreadcrumb(null);
  renderRight(null);
}

async function refresh() {
  if (!current) return;
  const sel = current;
  const seq = ++viewSeq;
  renderRight({ entries: null });
  try {
    const entries = await busy("Refreshing…", () => tree.refresh(sel.shortcut, sel.path));
    if (seq === viewSeq) renderRight({ entries });
  } catch (err) {
    if (seq === viewSeq) renderRight({ error: err });
  }
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

function openFile(sc, entry, path) {
  const kind = kindFor(entry.name);
  const inline = inlineType(entry.name);
  const url = api.fileUrl(sc.id, path);
  const downloadUrl = api.fileUrl(sc.id, path, { download: true });
  if (inline && ["image", "video", "audio"].includes(kind)) {
    viewer.open({ name: entry.name, kind, url, downloadUrl });
  } else if (inline) {
    follow(url, { newTab: true });   // PDF and text: the browser's own viewer
  } else {
    follow(downloadUrl, { download: true });
  }
}

/* ---- search ---- */

searchInput.addEventListener("input", () => {
  filter = searchInput.value.trim();
  tree.setFilter(filter);
  if (current && rightView) renderRight(rightView);
});

/* ---- splitter (mouse, pen and touch) ---- */

const SPLIT_KEY = "qfe.leftPaneWidth";
try {
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  if (saved >= 180 && saved <= 560) leftPane.style.width = saved + "px";
} catch { /* storage unavailable: keep the default width */ }

splitter.addEventListener("pointerdown", (e) => {
  splitter.setPointerCapture(e.pointerId);
  splitter.classList.add("dragging");
  e.preventDefault();
});
splitter.addEventListener("pointermove", (e) => {
  if (!splitter.hasPointerCapture(e.pointerId)) return;
  leftPane.style.width = Math.max(180, Math.min(560, e.clientX)) + "px";
});
splitter.addEventListener("pointerup", (e) => {
  splitter.releasePointerCapture(e.pointerId);
  splitter.classList.remove("dragging");
  try {
    localStorage.setItem(SPLIT_KEY, String(parseInt(leftPane.style.width, 10)));
  } catch { /* not worth failing over */ }
});

/* ---- context menu (admins): New / Edit / Delete ---- */

const ctxMenu = $("ctx-menu");
const ctxItems = {
  new: ctxMenu.querySelector('[data-action="new"]'),
  edit: ctxMenu.querySelector('[data-action="edit"]'),
  delete: ctxMenu.querySelector('[data-action="delete"]'),
};
let ctxTarget = null;

function shortcutFromEvent(e) {
  const rootLi = e.target.closest?.("#shortcut-list > li.tree-node");
  const id = rootLi?.dataset.key.split("::")[0];
  return shortcuts.find((sc) => sc.id === id) || null;
}

leftPane.addEventListener("contextmenu", (e) => {
  if (!isAdmin()) return;   // everyone else keeps the browser's own menu
  e.preventDefault();
  ctxTarget = shortcutFromEvent(e);
  ctxItems.edit.classList.toggle("disabled", !ctxTarget);
  ctxItems.delete.classList.toggle("disabled", !ctxTarget);
  ctxMenu.hidden = false;
  // Keep the menu inside the viewport.
  const { innerWidth: vw, innerHeight: vh } = window;
  const { offsetWidth: mw, offsetHeight: mh } = ctxMenu;
  ctxMenu.style.left = Math.max(0, Math.min(e.clientX, vw - mw - 4)) + "px";
  ctxMenu.style.top = Math.max(0, Math.min(e.clientY, vh - mh - 4)) + "px";
});

document.addEventListener("click", () => { ctxMenu.hidden = true; });
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    ctxMenu.hidden = true;
    closeModal();
  }
});

ctxMenu.addEventListener("click", (e) => {
  const item = e.target.closest(".ctx-item");
  if (!item || item.classList.contains("disabled")) return;
  ctxMenu.hidden = true;
  const action = item.dataset.action;
  if (action === "new") openShortcutModal(null);
  else if (action === "edit") openShortcutModal(ctxTarget);
  else if (action === "delete") deleteShortcut(ctxTarget);
});

newBtn.addEventListener("click", () => openShortcutModal(null));

async function deleteShortcut(sc) {
  if (!confirm(`Delete shortcut "${sc.label}"?\nEveryone loses access to it.`)) return;
  try {
    await busy("Deleting…", () => api.deleteShortcut(sc.id));
  } catch (err) {
    alert(`Delete failed: ${err.message}`);
    return;
  }
  if (current?.shortcut.id === sc.id) clearSelection();
  await loadShortcuts();
}

/* ---- new / edit shortcut modal ---- */

const modal = $("sc-modal");
const form = $("sc-form");
const modalTitle = $("sc-modal-title");
const formError = $("sc-error");
const f = {
  username: $("f-username"), custom: $("f-custom"), host: $("f-host"),
  port: $("f-port"), password: $("f-password"), preview: $("f-preview"),
  passwordHint: $("f-password-hint"),
};
let editing = null;          // the shortcut being edited, or null for "new"
let passwordTouched = false;

function updatePreview() {
  f.preview.textContent = composeLabel(f.username.value.trim(), f.custom.value.trim());
}

function openShortcutModal(existing) {
  editing = existing;
  formError.hidden = true;
  if (existing) {
    modalTitle.textContent = "Edit shortcut";
    f.username.value = existing.username;
    f.custom.value = splitLabel(existing.label, existing.username);
    f.host.value = existing.host;
    f.port.value = existing.port;
    // The stored password never reaches the browser: blank keeps it.
    f.password.value = "";
    f.password.placeholder = "Unchanged";
    f.passwordHint.textContent = "Leave blank to keep the current password. Required if you change the host or port.";
    passwordTouched = true;
  } else {
    modalTitle.textContent = "New shortcut";
    f.username.value = "";
    f.custom.value = "";
    f.host.value = me.defaults?.host ?? "";
    f.port.value = me.defaults?.port ?? 21;
    f.password.value = "";
    f.password.placeholder = "Defaults to the username";
    f.passwordHint.textContent = "";
    passwordTouched = false;
  }
  updatePreview();
  modal.hidden = false;
  f.username.focus();
  f.username.select();
}

function closeModal() {
  modal.hidden = true;
  editing = null;
}

// As in the HTA: in "new" mode the password mirrors the username until typed.
f.username.addEventListener("input", () => {
  updatePreview();
  if (!passwordTouched) f.password.value = f.username.value;
});
f.custom.addEventListener("input", updatePreview);
f.password.addEventListener("input", () => {
  passwordTouched = !editing ? f.password.value.length > 0 : true;
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
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
    id = await busy("Saving…", () => (wasEditing ? api.updateShortcut(wasEditing.id, fields) : api.createShortcut(fields)));
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
    return;
  }
  closeModal();
  await loadShortcuts();
  if (wasEditing && current?.shortcut.id === wasEditing.id) {
    // Same id: keep browsing it with the fresh details. Renamed: the old
    // tree node is gone, so start over from the renamed shortcut's root.
    const fresh = shortcuts.find((sc) => sc.id === id);
    if (fresh && id === wasEditing.id) {
      current = { ...current, shortcut: fresh };
      renderBreadcrumb(current);
    } else if (fresh) {
      tree.reveal(fresh, "/");
    } else {
      clearSelection();
    }
  }
});

/* ---- boot ---- */

refreshBtn.addEventListener("click", refresh);

try {
  me = await api.me();
  statusUser.textContent = `Signed in as ${me.username}${isAdmin() ? " (admin)" : ""}`;
  newBtn.hidden = !isAdmin();
  tree.init(listEl, [], { onSelect });
  await loadShortcuts();
  renderBreadcrumb(null);
  renderRight(null);
} catch (err) {
  if (err.status !== 401) rightPane.replaceChildren(el("p", "placeholder placeholder-error", err.message));
}
