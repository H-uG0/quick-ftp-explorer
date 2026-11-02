/*
 * grid.js - the right pane's list: a folder, search results or every site,
 * as one ARIA grid that behaves like File Explorer's Details view. It is
 * built of divs, each row a CSS grid sharing the column template, so that
 * rows off screen skip layout (content-visibility): a site holds thousands
 * of clips.
 *
 *   grid.render(container, model, callbacks)   draw the rows; focus and scroll are kept by key
 *   grid.update(selection)                     show a selection (classes and aria-selected only)
 *   grid.focus(key)                            move the keyboard focus to a row, in view
 *   grid.hold(ms)                              ignore taps for a while (after opening something)
 *   grid.rowAt(target), grid.rows(), grid.table(), grid.focusedRow()
 *
 *   model = { id, label, mode: "folder" | "search" | "home", columns, sort, rows,
 *             groups: [{ label, rows }] (day headings, or none), selecting (taps tick),
 *             fresh: Set of keys tagged "Nouveau",
 *             checkboxes, marks: Map(key -> ranges), places: Map(key -> text), empty }
 *   callbacks = { selection(), select(state), open(row), sort(key), middle(row), escape() }
 *
 * Mouse and pen: a click selects, Ctrl and Shift extend, a double-click
 * opens. Touch: a tap opens. Keyboard: one Tab stop, the arrows, Home/End,
 * Page Up/Down (Shift extends, Ctrl only moves the focus), Space, Ctrl+A,
 * Enter, Esc. The selection itself lives in the app (selection.js), so
 * renders and sorts keep it. Date tooltips are written when a row is
 * pointed at or focused. Names reach the page as text only.
 */

import * as sel from "./selection.js";
import { icon } from "./icons.js";
import { t, language, formatSize, formatDate, formatDateTime, formatLongDateTime } from "./i18n.js";
import { typeAhead } from "./util.js";

const COLUMN_LABELS = { name: "col.name", camera: "col.camera", date: "col.date", size: "col.size" };

let container = null, tableEl = null, body = null, headCheck = null;
let model = null, callbacks = null;
let order = [], byKey = new Map(), rowEls = new Map();
let shown = new Set();            // the keys drawn as selected
let lastPointer = "mouse", holdUntil = 0;
let typed = "", typedAt = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/* ---- cells ---- */

// The name, with what matched the search in <mark>. Text nodes only.
function nameNode(text, ranges) {
  const span = el("span", "file-name");
  if (!ranges) {
    span.textContent = text;
    return span;
  }
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) span.append(text.slice(at, start));
    span.append(el("mark", "", text.slice(start, end)));
    at = end;
  }
  if (at < text.length) span.append(text.slice(at));
  return span;
}

// FTP times show minutes; seconds only when the clip's name carries them.
function shownPrecision(row) {
  return row.timeSource === "modified" && row.precision === "second" ? "minute" : row.precision;
}

export function dateText(row) {
  return row.time === null ? formatDate(row.entry?.date ?? "", language()) : formatDateTime(row.time, shownPrecision(row));
}

export function dateTitle(row) {
  const lang = language();
  const modified = row.modifiedMs === null ? null : t("date.modified", { date: formatLongDateTime(row.modifiedMs, row.modifiedPrecision, lang) });
  if (row.timeSource === "name") {
    const recorded = t("date.recorded", { date: formatLongDateTime(row.time, row.precision, lang) });
    return modified ? `${recorded}\n${modified}` : recorded;
  }
  return modified ?? "";
}

const sizeText = (row) => (row.isDir ? "" : formatSize(row.size, language()));

const cell = (className, text) => {
  const node = el("div", `grid-cell ${className}`, text);
  node.setAttribute("role", "gridcell");
  return node;
};

function buildRow(row) {
  const tr = el("div", `grid-row entry-row ${row.kind}`);
  tr.setAttribute("role", "row");
  tr.dataset.key = row.key;
  tr.tabIndex = -1;
  tr.setAttribute("aria-selected", latest.selected.has(row.key) ? "true" : "false");
  if (latest.selected.has(row.key)) {
    tr.classList.add("selected");
    shown.add(row.key);
  }
  const file = !row.isDir;

  if (model.checkboxes) {
    const check = cell("col-check");
    if (file) check.append(el("span", "check"));
    tr.append(check);
  }
  const name = cell("col-name");
  name.title = model.places.has(row.key) ? `${row.name}\n${model.places.get(row.key)}` : row.name;
  const iconEl = el("span", "file-icon");
  iconEl.append(icon(row.kind));
  name.append(iconEl);
  if (row.isDir) name.append(el("span", "sr-only", t(row.kind === "site" ? "a11y.site" : "a11y.folder")));
  name.append(nameNode(row.name, model.marks.get(row.key)));
  if (model.fresh?.has(row.key)) name.append(el("span", "tag-new", t("refresh.tag")));
  if (model.places.has(row.key)) name.append(el("span", "result-location", model.places.get(row.key)));
  // Phones show one line under the name instead of the other columns; under
  // a day heading, the time is enough.
  const when = row.isDir ? "" : model.groups && row.time !== null && row.precision !== "day" ? dateText(row).slice(11) : dateText(row);
  const meta = [when, row.camera, sizeText(row)].filter(Boolean).join(" · ");
  if (meta) name.append(el("span", "row-meta", meta));
  tr.append(name);

  for (const column of model.columns) {
    if (column === "name") continue;
    const td = cell(`col-${column}`);
    if (column === "camera") td.textContent = row.camera;
    else if (column === "size") td.textContent = sizeText(row);
    else if (column === "date" && row.kind !== "site") {
      td.textContent = dateText(row);
      if (row.time === null) td.classList.add("muted");
    }
    tr.append(td);
  }
  return tr;
}

function buildHead() {
  const head = el("div", "grid-head");
  head.setAttribute("role", "rowgroup");
  const tr = el("div", "grid-row head-row");
  tr.setAttribute("role", "row");
  const th = (className) => {
    const node = el("div", `grid-cell ${className}`);
    node.setAttribute("role", "columnheader");
    return node;
  };
  if (model.checkboxes) {
    const th = el("div", "grid-cell col-check");
    th.setAttribute("role", "columnheader");
    headCheck = el("input");
    headCheck.type = "checkbox";
    headCheck.setAttribute("aria-label", t("sel.selectAll"));
    headCheck.title = t("sel.selectAll");
    th.append(headCheck);
    tr.append(th);
  } else {
    headCheck = null;
  }
  for (const column of model.columns) {
    const header = th(`col-${column}`);
    const label = t(COLUMN_LABELS[column]);
    const sorted = model.sort.key === column;
    if (sorted) header.setAttribute("aria-sort", model.sort.dir === "asc" ? "ascending" : "descending");
    const button = el("button", "sort-button");
    button.type = "button";
    button.dataset.sort = column;
    button.title = t("sort.by", { column: label.toLowerCase() });
    button.append(el("span", "", label));
    if (sorted) button.append(icon(model.sort.dir === "asc" ? "sort-up" : "sort-down"));
    header.append(button);
    tr.append(header);
  }
  head.append(tr);
  return head;
}

/* ---- render ---- */

function render(target, nextModel, nextCallbacks) {
  const sameView = model && container === target && model.id === nextModel.id;
  const hadFocus = !!tableEl?.contains(document.activeElement);
  // A header control keeps the focus (Enter on "Nom" sorts again, not opens a row).
  const active = document.activeElement;
  const headFocus = hadFocus && active?.closest?.(".grid-head")
    ? (active.dataset?.sort ? `button[data-sort="${active.dataset.sort}"]` : "input")
    : null;
  const scrollTop = sameView ? target.scrollTop : 0;
  container = target;
  model = { checkboxes: false, marks: new Map(), places: new Map(), empty: null, ...nextModel };
  callbacks = nextCallbacks;
  order = model.rows.map((r) => r.key);
  byKey = new Map(model.rows.map((r) => [r.key, r]));
  rowEls = new Map();
  shown = new Set();
  latest = callbacks.selection();

  if (!model.rows.length) {
    tableEl = body = headCheck = null;
    container.replaceChildren(...[model.empty].flat().filter(Boolean));
    return;
  }
  tableEl = el("div", "file-table");
  tableEl.setAttribute("role", "grid");
  tableEl.setAttribute("aria-multiselectable", "true");
  tableEl.setAttribute("aria-label", model.label);
  tableEl.setAttribute("aria-colcount", String(model.columns.length + (model.checkboxes ? 1 : 0)));
  // The column template comes from these classes (styles.css).
  tableEl.classList.toggle("with-checks", model.checkboxes);
  tableEl.classList.toggle("c-camera", model.columns.includes("camera"));
  tableEl.classList.toggle("c-home", model.mode === "home");
  tableEl.classList.toggle("selecting", !!model.selecting);
  tableEl.append(buildHead());
  // One row group per day heading; the headings take no focus, and the keys
  // and range selection go by `order`, which skips them.
  const span = model.columns.length + (model.checkboxes ? 1 : 0);
  const bodies = document.createDocumentFragment();
  for (const group of model.groups ?? [{ label: null, rows: model.rows }]) {
    const tbody = el("div", "grid-body");
    tbody.setAttribute("role", "rowgroup");
    if (group.label) {
      const heading = el("div", "grid-row group-row");
      heading.setAttribute("role", "row");
      const th = el("div", "grid-cell group-cell", group.label);
      th.setAttribute("role", "rowheader");
      th.setAttribute("aria-colspan", String(span));
      heading.append(th);
      tbody.append(heading);
    }
    for (const row of group.rows) {
      const tr = buildRow(row);
      rowEls.set(row.key, tr);
      tbody.append(tr);
    }
    bodies.append(tbody);
  }
  tableEl.append(bodies);
  body = tableEl;
  container.classList.toggle("grouped", !!model.groups);
  wire();
  container.replaceChildren(tableEl);
  container.scrollTop = scrollTop;

  const state = callbacks.selection();
  update(state);
  const focusKey = byKey.has(state.focus) ? state.focus : order[0];
  setTabStop(focusKey);
  if (headFocus) tableEl.querySelector(`.grid-head ${headFocus}`)?.focus({ preventScroll: true });
  else if (hadFocus) rowEls.get(focusKey)?.focus({ preventScroll: true });
}

function setTabStop(key) {
  body?.querySelector('.entry-row[tabindex="0"]')?.setAttribute("tabindex", "-1");
  rowEls.get(key)?.setAttribute("tabindex", "0");
}

let latest = sel.EMPTY;   // the selection last shown

function update(state) {
  latest = state;
  if (!body) return;
  const next = state.selected;
  for (const key of shown) {
    if (!next.has(key)) {
      const tr = rowEls.get(key);
      tr?.classList.remove("selected");
      tr?.setAttribute("aria-selected", "false");
    }
  }
  for (const key of next) {
    if (!shown.has(key)) {
      const tr = rowEls.get(key);
      tr?.classList.add("selected");
      tr?.setAttribute("aria-selected", "true");
    }
  }
  shown = new Set([...next].filter((k) => rowEls.has(k)));
  tableEl.classList.toggle("has-selection", shown.size > 0);
  if (headCheck) {
    const files = model.rows.filter((r) => !r.isDir);
    const picked = files.filter((r) => shown.has(r.key)).length;
    headCheck.checked = files.length > 0 && picked === files.length;
    headCheck.indeterminate = picked > 0 && picked < files.length;
    headCheck.disabled = files.length === 0;
  }
  if (state.focus && rowEls.has(state.focus)) setTabStop(state.focus);
}

function focus(key) {
  const tr = rowEls.get(key);
  if (!tr) return;
  setTabStop(key);
  tr.focus({ preventScroll: true });
  tr.scrollIntoView({ block: "nearest" });
}

/* ---- events ---- */

function rowFrom(target) {
  const tr = target instanceof Element ? target.closest(".entry-row") : null;
  return tr && body?.contains(tr) ? byKey.get(tr.dataset.key) ?? null : null;
}

const fileKeys = () => model.rows.filter((r) => !r.isDir).map((r) => r.key);

function select(state, { focusRow = true } = {}) {
  callbacks.select(state);
  if (focusRow && state.focus) focus(state.focus);
}

function openRow(row) {
  if (row) callbacks.open(row);
}

function pageSize() {
  const first = rowEls.get(order[0]);
  const height = first?.offsetHeight || 32;
  return Math.max(1, Math.floor((container.clientHeight - (tableEl.firstElementChild?.offsetHeight ?? 0)) / height) - 1);
}

function onKeydown(e) {
  const row = rowFrom(e.target);
  if (!row || e.altKey) return;   // Alt+arrows move between folders
  const state = callbacks.selection();
  const at = order.indexOf(row.key);
  const mods = { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey };
  const moveTo = (i) => {
    const key = order[Math.max(0, Math.min(order.length - 1, i))];
    select(sel.move({ ...state, focus: row.key }, order, key, mods));
  };
  switch (e.key) {
    case "ArrowDown": moveTo(at + 1); break;
    case "ArrowUp": moveTo(at - 1); break;
    case "Home": moveTo(0); break;
    case "End": moveTo(order.length - 1); break;
    case "PageDown": moveTo(at + pageSize()); break;
    case "PageUp": moveTo(at - pageSize()); break;
    case " ":
      if (mods.shift) return;
      select(sel.toggle(state, row.key));
      break;
    case "Enter":
      openRow(row);
      break;
    case "Escape":
      if (state.selected.size) select(sel.clear(state), { focusRow: false });
      else if (!callbacks.escape()) return;
      break;
    default:
      if ((e.key === "a" || e.key === "A") && mods.ctrl && !e.altKey) {
        select(sel.selectAll(state, fileKeys()), { focusRow: false });
        break;
      }
      // Type-ahead where names differ: on the list of sites.
      if (model.mode === "home" && e.key.length === 1 && /\S/.test(e.key) && !mods.ctrl && !e.altKey) {
        const now = Date.now();
        typed = now - typedAt > 700 ? e.key : typed + e.key;
        typedAt = now;
        const i = typeAhead(model.rows.map((r) => r.name), typed, at);
        if (i >= 0) select(sel.move(state, order, order[i], {}));
        break;
      }
      return;
  }
  e.preventDefault();
  e.stopPropagation();
}

function onClick(e) {
  if (e.target.closest(".grid-head")) {
    const button = e.target.closest("button[data-sort]");
    if (button) callbacks.sort(button.dataset.sort);
    if (e.target === headCheck) {
      const state = callbacks.selection();
      select(headCheck.checked ? sel.selectAll(state, fileKeys()) : sel.clear(state), { focusRow: false });
    }
    return;
  }
  const row = rowFrom(e.target);
  if (!row) return;
  const state = callbacks.selection();
  if (e.target.closest(".col-check") && !row.isDir) {
    select(sel.toggle(state, row.key));   // a check box ticks, whatever the pointer
    return;
  }
  if (lastPointer === "touch" && !model.selecting) {
    // One tap opens; the second tap of a double tap, or a tap right after
    // something opened, would land on what just appeared.
    if (e.detail > 1 || performance.now() < holdUntil) return;
    select(sel.click(state, order, row.key), { focusRow: false });
    openRow(row);
    return;
  }
  if (model.selecting) {
    select(sel.toggle(state, row.key));
    return;
  }
  select(sel.click(state, order, row.key, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }));
}

function onDblclick(e) {
  if (lastPointer === "touch" || model.selecting) return;
  const row = rowFrom(e.target);
  if (!row || e.target.closest(".col-check") || e.ctrlKey || e.shiftKey || e.metaKey) return;
  openRow(row);
}

function wire() {
  tableEl.addEventListener("keydown", onKeydown);
  tableEl.addEventListener("click", onClick);
  tableEl.addEventListener("dblclick", onDblclick);
  tableEl.addEventListener("pointerdown", (e) => { lastPointer = e.pointerType || "mouse"; });
  // Shift+click would also select the page's text.
  tableEl.addEventListener("mousedown", (e) => {
    if (e.shiftKey && rowFrom(e.target)) e.preventDefault();
  });
  tableEl.addEventListener("auxclick", (e) => {
    const row = rowFrom(e.target);
    if (e.button === 1 && row?.isDir) {
      e.preventDefault();
      callbacks.middle(row);
    }
  });
  // Focus that arrives by Tab lands on the row the app last focused.
  tableEl.addEventListener("focusin", (e) => {
    const row = rowFrom(e.target);
    if (row) {
      setTabStop(row.key);
      fillTitle(e.target.closest(".entry-row"));
    }
  });
  tableEl.addEventListener("pointerover", (e) => fillTitle(e.target.closest?.(".entry-row")));
}

// The date's long form, written when a row is pointed at or focused:
// formatting thousands of them up front would delay the list.
function fillTitle(tr) {
  const td = tr?.querySelector(".col-date");
  if (!td || td.title || td.dataset.titled) return;
  td.dataset.titled = "1";
  const title = dateTitle(byKey.get(tr.dataset.key));
  if (title) td.title = title;
}

// A click below the rows clears the selection, as in Explorer.
function onBackground(e) {
  if (!tableEl || e.target.closest?.(".entry-row, button, a, input")) return;
  const state = callbacks?.selection();
  if (state?.selected.size) callbacks.select(sel.clear(state));
}

let wiredContainer = null;
export const grid = {
  render(target, nextModel, nextCallbacks) {
    if (wiredContainer !== target) {
      target.addEventListener("click", onBackground);
      wiredContainer = target;
    }
    render(target, nextModel, nextCallbacks);
  },
  update,
  focus,
  hold(ms = 400) { holdUntil = performance.now() + ms; },
  rowAt: rowFrom,
  rows: () => model?.rows ?? [],
  row: (key) => byKey.get(key) ?? null,
  table: () => tableEl,
  focusedRow() {
    const tr = body?.querySelector('.entry-row[tabindex="0"]');
    return tr ? byKey.get(tr.dataset.key) ?? null : null;
  },
  isSelecting: () => !!model?.selecting,
};
