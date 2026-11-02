/*
 * toolbar.js - the command bar above the list: Ouvrir and Télécharger, the
 * Trier select, and the filters (Période, Caméra, Type). On phones the
 * filters move into a bottom sheet, and chips show what is on.
 *
 *   toolbar.init({ onAction(name), onSort(id), onFilters(filters) })
 *   toolbar.update({ visible, columns, sort, filters, facets, actions, counts })
 *     actions  { open: { enabled }, download: { enabled, count, title }, link: { label } }
 *     counts   { shown, total, search }: for the sheet's button and the chips line
 *   toolbar.closeSheet()
 *
 * Every control is a native one with a visible label: the selects keep the
 * keyboard and the phone pickers people know, and state their value in
 * words. Filters apply as soon as they change.
 */

import { t, tn, formatDateTime } from "./i18n.js";
import { icon } from "./icons.js";
import { SORTS, PERIODS, MARGINS, NO_FILTERS, activeFilters } from "./listview.js";
import { parseTime } from "./util.js";

const $ = (id) => document.getElementById(id);
const PERIOD_LABELS = {
  "": "filter.periodAll", hour: "filter.periodHour", "24h": "filter.periodDay", today: "filter.periodToday",
  yesterday: "filter.periodYesterday", "7d": "filter.periodWeek", around: "filter.periodAround", range: "filter.periodRange",
};
const KIND_LABELS = { video: "filter.kindVideo", image: "filter.kindImage", other: "filter.kindOther" };

let hooks = null, filters = { ...NO_FILTERS }, last = null;
let bar, openBtn, downloadBtn, downloadLabel, linkBtn, sortSelect, group, period, aroundBox, at, margin, rangeBox, from, to;
let cameraBox, camera, kindBox, kind, clearBtn, filterBtn, summary, sheet, sheetBody, sheetShow, home;

const pad2 = (n) => String(n).padStart(2, "0");
// A datetime-local field's value: "2026-11-01T16:20", this browser's time.
function localValue(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function option(value, text) {
  const o = document.createElement("option");
  o.value = value;
  o.textContent = text;
  return o;
}

// Replace a select's options, keeping its value when it still exists.
function fill(select, options, value) {
  select.replaceChildren(...options.map(([v, text]) => option(v, text)));
  select.value = options.some(([v]) => v === value) ? value : options[0]?.[0] ?? "";
}

export function filterLabel({ name, value }, f = filters) {
  if (name === "camera") return value;
  if (name === "kind") return t(KIND_LABELS[value]);
  if (value === "around") {
    const when = parseTime(f.at);
    return t("filter.around", { at: when ? formatDateTime(when.ms, "minute") : f.at, n: Number(f.margin) || 15 });
  }
  if (value === "range") {
    const fmt = (text) => {
      const v = parseTime(text);
      return v ? formatDateTime(v.ms, v.precision === "day" ? "day" : "minute") : "…";
    };
    return t("filter.range", { from: fmt(f.from), to: fmt(f.to) });
  }
  return t(PERIOD_LABELS[value]);
}

function readFilters() {
  return {
    period: period.value,
    at: at.value,
    margin: Number(margin.value) || 15,
    from: from.value,
    to: to.value,
    camera: cameraBox.hidden ? "" : camera.value,
    kind: kindBox.hidden ? "" : kind.value,
  };
}

function changed() {
  const next = readFilters();
  // Choosing a period that needs times fills them in: now, or the last hour.
  if (next.period === "around" && filters.period !== "around" && !next.at) next.at = at.value = localValue(Date.now());
  if (next.period === "range" && filters.period !== "range" && !next.from && !next.to) {
    next.from = from.value = localValue(Date.now() - 3_600_000);
    next.to = to.value = localValue(Date.now());
  }
  filters = next;
  showPeriodFields();
  hooks.onFilters({ ...filters });
}

function showPeriodFields() {
  aroundBox.hidden = filters.period !== "around";
  rangeBox.hidden = filters.period !== "range";
}

function clearFilters() {
  filters = { ...NO_FILTERS };
  hooks.onFilters({ ...filters });
}

/* ---- the phone's filter sheet ---- */

function openSheet() {
  sheetBody.append(group);
  sheet.showModal();
}

function closeSheet() {
  if (sheet.open) sheet.close();
}

function onSheetClose() {
  bar.append(group);
  filterBtn.focus({ preventScroll: true });
}

/* ---- updates ---- */

function update(view) {
  last = view;
  bar.hidden = !view.visible;
  summary.hidden = true;
  if (!view.visible) return;
  filters = { ...view.filters };

  // Actions, greyed out the way Explorer does it.
  openBtn.disabled = !view.actions.open.enabled;
  const dl = view.actions.download;
  downloadBtn.disabled = !dl.enabled;
  downloadLabel.textContent = dl.count > 1 ? t("cmd.downloadCount", { n: dl.count }) : t("cmd.download");
  downloadBtn.title = dl.title || "";
  linkBtn.querySelector(".btn-label").textContent = view.actions.link.label;

  // Trier: the Caméra orders only when the column shows.
  const sorts = SORTS.filter((s) => s.key !== "camera" || view.columns.includes("camera"));
  fill(sortSelect, sorts.map((s) => [s.id, t(`sort.${s.id}`)]), view.sort.id);

  fill(period, PERIODS.map((p) => [p, t(PERIOD_LABELS[p])]), filters.period);
  if (at.value !== filters.at) at.value = filters.at;
  margin.value = String(filters.margin || 15);
  if (from.value !== filters.from) from.value = filters.from;
  if (to.value !== filters.to) to.value = filters.to;
  showPeriodFields();

  const { cameras, cameraTotal, kinds, kindTotal } = view.facets;
  cameraBox.hidden = cameras.length < 2;
  if (!cameraBox.hidden) {
    fill(camera, [["", t("filter.cameraAll", { n: cameraTotal })],
      ...cameras.map((c) => [c.name, t("filter.option", { value: c.name, n: c.count })])], filters.camera);
  }
  kindBox.hidden = kinds.length < 2;
  if (!kindBox.hidden) {
    fill(kind, [["", t("filter.kindAll", { n: kindTotal })],
      ...kinds.map((k) => [k.name, t("filter.option", { value: t(KIND_LABELS[k.name]), n: k.count })])], filters.kind);
  }
  period.classList.toggle("filter-active", !!filters.period && activeFilters(filters).some((a) => a.name === "period"));
  camera.classList.toggle("filter-active", !!filters.camera);
  kind.classList.toggle("filter-active", !!filters.kind);

  const active = activeFilters(filters);
  clearBtn.hidden = active.length === 0;
  filterBtn.querySelector(".btn-label").textContent = active.length ? t("filter.openCount", { n: active.length }) : t("filter.group");
  sheetShow.textContent = tn("filter.show", view.counts.shown);

  // Phones: one chip per active value, and the count.
  if (active.length) {
    const chips = active.map((a) => {
      const label = filterLabel(a);
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-label", t("filter.remove", { value: label }));
      chip.append(document.createTextNode(label), icon("close"));
      chip.addEventListener("click", () => {
        filters = { ...filters, [a.name]: a.name === "period" ? "" : "" };
        hooks.onFilters({ ...filters });
      });
      return chip;
    });
    const count = document.createElement("span");
    count.className = "filter-count";
    count.textContent = view.counts.search
      ? tn("count.resultsOf", view.counts.shown, { total: view.counts.total })
      : tn("count.itemsOf", view.counts.shown, { total: view.counts.total });
    summary.replaceChildren(...chips, count);
    summary.hidden = false;
  }
}

function init(options) {
  hooks = options;
  bar = $("commandbar");
  openBtn = $("cmd-open");
  downloadBtn = $("cmd-download");
  downloadLabel = downloadBtn.querySelector(".btn-label");
  linkBtn = $("cmd-link");
  sortSelect = $("sort-select");
  group = $("filter-group");
  period = $("f-period");
  aroundBox = $("f-around");
  at = $("f-at");
  margin = $("f-margin");
  rangeBox = $("f-range");
  from = $("f-from");
  to = $("f-to");
  cameraBox = $("f-camera-field");
  camera = $("f-camera");
  kindBox = $("f-kind-field");
  kind = $("f-kind");
  clearBtn = $("f-clear");
  filterBtn = $("filter-open");
  summary = $("filter-summary");
  sheet = $("filter-sheet");
  sheetBody = sheet.querySelector(".sheet-body");
  sheetShow = $("sheet-show");
  home = bar;

  openBtn.prepend(icon("open"));
  downloadBtn.prepend(icon("download"));
  linkBtn.prepend(icon("link"));
  filterBtn.prepend(icon("filter"));
  fill(margin, MARGINS.map((m) => [String(m), t("filter.marginMinutes", { n: m })]), "15");

  openBtn.addEventListener("click", () => hooks.onAction("open"));
  downloadBtn.addEventListener("click", () => hooks.onAction("download"));
  linkBtn.addEventListener("click", () => hooks.onAction("link"));
  sortSelect.addEventListener("change", () => hooks.onSort(sortSelect.value));
  for (const control of [period, at, margin, from, to, camera, kind]) control.addEventListener("change", changed);
  clearBtn.addEventListener("click", clearFilters);
  $("sheet-clear").addEventListener("click", clearFilters);
  filterBtn.addEventListener("click", openSheet);
  sheetShow.addEventListener("click", closeSheet);
  sheet.addEventListener("close", onSheetClose);
  sheet.addEventListener("click", (e) => {
    if (e.target === sheet) closeSheet();   // a tap above the sheet
  });
  window.matchMedia("(max-width: 700px)").addEventListener("change", closeSheet);
  void home;
}

export const toolbar = { init, update, closeSheet, filterLabel };
