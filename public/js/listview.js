/*
 * listview.js - what the file list shows, and in what order. No DOM, so
 * the test suite can run it.
 *
 *   describeEntry(entry, { sc, parent })   one row's model, built once per entry
 *   columnsFor(rows)                       ["name", ("camera",) "date", "size"]
 *   SORTS, sortFor(id), sortRows(rows, { key, dir })
 *   PERIODS, periodRange(filters, now)     [from, to) in ms (null = open), or null
 *   applyFilters(rows, filters, now)       { shown, hidden }: folders always show
 *   facets(rows, filters, now)             the cameras and kinds to choose from, counted
 *   activeFilters(filters)                 [{ name, value }] for chips and messages
 *   newestTime(rows)                       { ms, precision } of the newest file, or null
 *   playlist(rows, key, selected)          { items, index }: what the viewer steps through
 *
 * A row's date is when the clip was recorded, read from its name, else when
 * the file was last modified: File Explorer's Date column prefers the date a
 * photo was taken the same way.
 */

import { kindFor, inlineType } from "./filetypes.js";
import { joinPath, parseTime } from "./util.js";
import { parseClip } from "./clips.js";

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/* ---- rows ---- */

const models = new WeakMap();

// { key, sc, parent, path, entry, name, isDir, kind, camera, time, precision,
//   timeSource: "name" | "modified" | null, modifiedMs, modifiedPrecision, size }
export function describeEntry(entry, { sc, parent }) {
  const known = models.get(entry);
  if (known && known.sc === sc && known.parent === parent) return known;
  const path = joinPath(parent, entry.name);
  const clip = entry.isDir ? null : parseClip(entry.name);
  const recorded = clip && parseTime(clip.time);
  const modified = parseTime(entry.modified);
  const row = {
    key: `${sc.id}::${path}`,
    sc,
    parent,
    path,
    entry,
    name: entry.name,
    isDir: !!entry.isDir,
    kind: kindFor(entry.name, entry.isDir),
    camera: clip?.camera ?? "",
    time: (recorded ?? modified)?.ms ?? null,
    precision: (recorded ?? modified)?.precision ?? null,
    timeSource: recorded ? "name" : modified ? "modified" : null,
    modifiedMs: modified?.ms ?? null,
    modifiedPrecision: modified?.precision ?? null,
    size: entry.isDir ? 0 : Number(entry.size) || 0,
  };
  models.set(entry, row);
  return row;
}

// Caméra appears as soon as one file of the (unfiltered) view has a camera.
export function columnsFor(rows) {
  return rows.some((r) => !r.isDir && r.camera) ? ["name", "camera", "date", "size"] : ["name", "date", "size"];
}

/* ---- sorting ---- */

// The Trier select's orders, in its order. The Caméra ones are offered only
// when the Caméra column shows.
export const SORTS = [
  { id: "dateDesc", key: "date", dir: "desc" },
  { id: "dateAsc", key: "date", dir: "asc" },
  { id: "nameAsc", key: "name", dir: "asc" },
  { id: "nameDesc", key: "name", dir: "desc" },
  { id: "cameraAsc", key: "camera", dir: "asc" },
  { id: "cameraDesc", key: "camera", dir: "desc" },
  { id: "sizeDesc", key: "size", dir: "desc" },
  { id: "sizeAsc", key: "size", dir: "asc" },
];
export const DEFAULT_SORT = SORTS[0];
// A first click on a header: newest and largest first, names and cameras A to Z.
export const FIRST_DIR = { name: "asc", camera: "asc", date: "desc", size: "desc" };
export const sortFor = (id) => SORTS.find((s) => s.id === id) ?? null;
export const sortId = ({ key, dir }) => SORTS.find((s) => s.key === key && s.dir === dir)?.id ?? DEFAULT_SORT.id;

const byName = (a, b) => collator.compare(a.name, b.name);
const nulls = (a, b) => (a === null) - (b === null);   // rows without a value go last, both ways

export function sortRows(rows, { key, dir } = DEFAULT_SORT) {
  const sign = dir === "desc" ? -1 : 1;
  const compare = (a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    // Folders have no size or camera: those orders leave them A to Z.
    const k = a.isDir && key !== "date" ? "name" : key;
    switch (k) {
      case "date":
        return nulls(a.time, b.time) || sign * (a.time - b.time)
          || nulls(a.modifiedMs, b.modifiedMs) || sign * (a.modifiedMs - b.modifiedMs) || byName(a, b);
      case "camera":
        return (!a.camera - !b.camera) || sign * collator.compare(a.camera, b.camera)
          || nulls(a.time, b.time) || (b.time - a.time) || byName(a, b);
      case "size":
        return sign * (a.size - b.size) || byName(a, b);
      default:
        return (a.isDir && key !== "name" ? 1 : sign) * byName(a, b);
    }
  };
  return [...rows].sort(compare);
}

/* ---- filters ---- */

// filters = { period, at, margin, from, to, camera, kind }
//   period  "" | "hour" | "24h" | "today" | "yesterday" | "7d" | "around" | "range"
//   at      "2026-10-30T08:30" (this browser's time) and margin (minutes), for "around"
//   from/to the same kind of text, for "range"; either may be empty
//   camera  "" or a camera's name; kind "" | "video" | "image" | "other"
export const PERIODS = ["", "hour", "24h", "today", "yesterday", "7d", "around", "range"];
export const MARGINS = [5, 15, 30, 60];
export const KINDS = ["video", "image", "other"];
export const NO_FILTERS = Object.freeze({ period: "", at: "", margin: 15, from: "", to: "", camera: "", kind: "" });

const MINUTE = 60_000, HOUR = 60 * MINUTE;
const startOfDay = (now, back = 0) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back).getTime();

// The end of a "to" field: that whole minute, or that whole day.
function endOf(text) {
  const t = parseTime(text);
  if (!t) return null;
  if (t.precision !== "day") return t.ms + MINUTE;
  const d = new Date(t.ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

// Recent periods have no end, so a camera whose clock runs a little fast
// never drops out of "Today". Days follow the local calendar.
export function periodRange(filters, now = new Date()) {
  const t = now.getTime();
  switch (filters?.period) {
    case "hour": return [t - HOUR, null];
    case "24h": return [t - 24 * HOUR, null];
    case "today": return [startOfDay(now), null];
    case "yesterday": return [startOfDay(now, 1), startOfDay(now)];
    case "7d": return [startOfDay(now, 6), null];
    case "around": {
      const at = parseTime(filters.at);
      if (!at) return null;
      const margin = (MARGINS.includes(Number(filters.margin)) ? Number(filters.margin) : 15) * MINUTE;
      return [at.ms - margin, at.ms + margin + MINUTE];
    }
    case "range": {
      let [from, to] = [filters.from, filters.to];
      const a = parseTime(from), b = parseTime(to);
      if (a && b && a.ms > b.ms) [from, to] = [to, from];
      const range = [parseTime(from)?.ms ?? null, endOf(to)];
      return range[0] === null && range[1] === null ? null : range;
    }
    default: return null;
  }
}

export const kindGroup = (kind) => (kind === "video" || kind === "image" ? kind : "other");

function passes(row, filters, range, skip) {
  if (row.isDir) return true;
  if (range) {
    if (row.time === null) return false;
    if (range[0] !== null && row.time < range[0]) return false;
    if (range[1] !== null && row.time >= range[1]) return false;
  }
  if (skip !== "camera" && filters.camera && row.camera !== filters.camera) return false;
  if (skip !== "kind" && filters.kind && kindGroup(row.kind) !== filters.kind) return false;
  return true;
}

export function activeFilters(filters) {
  if (!filters) return [];
  const active = [];
  if (periodRange(filters)) active.push({ name: "period", value: filters.period });
  if (filters.camera) active.push({ name: "camera", value: filters.camera });
  if (filters.kind) active.push({ name: "kind", value: filters.kind });
  return active;
}

export function applyFilters(rows, filters, now = new Date()) {
  if (!activeFilters(filters).length) return { shown: rows, hidden: 0 };
  const range = periodRange(filters, now);
  const shown = rows.filter((row) => passes(row, filters, range));
  return { shown, hidden: rows.length - shown.length };
}

// What each choice would show, given the other filters: "Cam 2 (40)". Every
// camera and kind of the view is listed, at 0 too, so a choice never
// disappears from under the pointer.
export function facets(rows, filters = NO_FILTERS, now = new Date()) {
  const range = periodRange(filters, now);
  const cameras = new Map(), kinds = new Map();
  let cameraTotal = 0, kindTotal = 0;
  for (const row of rows) {
    if (row.isDir) continue;
    if (row.camera && !cameras.has(row.camera)) cameras.set(row.camera, 0);
    const group = kindGroup(row.kind);
    if (!kinds.has(group)) kinds.set(group, 0);
    if (passes(row, filters, range, "camera")) {
      cameraTotal++;
      if (row.camera) cameras.set(row.camera, cameras.get(row.camera) + 1);
    }
    if (passes(row, filters, range, "kind")) {
      kindTotal++;
      kinds.set(group, kinds.get(group) + 1);
    }
  }
  return {
    cameras: [...cameras].sort((a, b) => collator.compare(a[0], b[0])).map(([name, count]) => ({ name, count })),
    cameraTotal,
    kinds: KINDS.filter((k) => kinds.has(k)).map((name) => ({ name, count: kinds.get(name) })),
    kindTotal,
  };
}

export function newestTime(rows) {
  let newest = null;
  for (const row of rows) {
    if (!row.isDir && row.time !== null && (!newest || row.time > newest.ms)) newest = { ms: row.time, precision: row.precision };
  }
  return newest;
}

/* ---- the viewer's list ---- */

// What the viewer shows in the app: videos (converted when the browser
// can't play them), and the images and audio the browser plays.
export const viewable = (row) => !row.isDir &&
  (row.kind === "video" || ((row.kind === "image" || row.kind === "audio") && !!inlineType(row.name)));

// The rows as shown, viewable ones only; just the selection when several
// files are selected and the opened one is among them.
export function playlist(rows, key, selected = new Set()) {
  let items = rows.filter(viewable);
  if (selected.size >= 2 && selected.has(key)) items = items.filter((row) => selected.has(row.key));
  return { items, index: items.findIndex((row) => row.key === key) };
}
