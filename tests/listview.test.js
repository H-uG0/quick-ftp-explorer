/*
 * listview.test.js - rows, sorting, filters and the viewer's list of the
 * file list (public/js/listview.js). Times are built in the local time zone,
 * so the tests mean the same wherever they run.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  describeEntry, columnsFor, sortRows, sortFor, sortId, SORTS, periodRange, applyFilters, facets, activeFilters,
  newestTime, playlist, groupByDay, NO_FILTERS, PERIODS,
} from "../public/js/listview.js";

const local = (...parts) => new Date(...parts).getTime();
const site = { id: "site", label: "1234 Résidence" };
const file = (name, extra = {}) => ({ name, isDir: false, isLink: false, size: 1, date: "", modified: null, ...extra });
const dir = (name, extra = {}) => ({ name, isDir: true, isLink: false, size: 0, date: "", modified: null, ...extra });
const rows = (entries, parent = "/") => entries.map((e) => describeEntry(e, { sc: site, parent }));
const names = (list) => list.map((r) => r.name);

describe("rows", () => {
  test("the date comes from the clip's name, else from the listing", () => {
    const [clip] = rows([file("1234_Cam 1_202610300830.avi", { modified: "2026-10-30T07:31:05Z", size: 2048 })]);
    assert.equal(clip.key, "site::/1234_Cam 1_202610300830.avi");
    assert.equal(clip.camera, "Cam 1");
    assert.equal(clip.time, local(2026, 9, 30, 8, 30));
    assert.equal(clip.precision, "minute");
    assert.equal(clip.timeSource, "name");
    assert.equal(clip.modifiedMs, Date.UTC(2026, 9, 30, 7, 31, 5));
    assert.equal(clip.kind, "video");
    assert.equal(clip.size, 2048);

    const [pdf] = rows([file("report.pdf", { modified: "2026-10-30T07:31:05Z" })], "/docs");
    assert.equal(pdf.path, "/docs/report.pdf");
    assert.equal(pdf.camera, "");
    assert.equal(pdf.timeSource, "modified");
    assert.equal(pdf.precision, "second");

    const [old] = rows([file("old.txt", { modified: "2025-04-01" })]);
    assert.equal(old.precision, "day");
    const [unknown] = rows([file("x.bin", { date: "Okt 30 08:30" })]);
    assert.equal(unknown.time, null);
    assert.equal(unknown.timeSource, null);
    assert.equal(rows([dir("1234_Cam 1_202610300830")])[0].camera, "", "folders are not clips");
  });

  test("a row is built once per entry", () => {
    const entry = file("1234_Cam 1_202610300830.avi");
    assert.equal(describeEntry(entry, { sc: site, parent: "/" }), describeEntry(entry, { sc: site, parent: "/" }));
  });

  test("the Caméra column shows when a file has a camera", () => {
    assert.deepEqual(columnsFor(rows([file("a.pdf"), file("1234_Cam 1_202610300830.avi")])), ["name", "camera", "date", "size"]);
    assert.deepEqual(columnsFor(rows([dir("Images"), file("a.pdf")])), ["name", "date", "size"]);
  });
});

describe("sortRows", () => {
  const list = rows([
    file("clip 10.mp4", { size: 300, modified: "2026-10-30T08:00" }),
    file("clip 2.avi", { size: 100, modified: "2026-10-30T09:00" }),
    file("undated.txt", { size: 999 }),
    dir("Archives", { modified: "2026-01-01T00:00" }),
    dir("2026", { modified: "2026-10-01T00:00" }),
    file("Clip 3.jpg", { size: 200, modified: "2026-10-30T07:00" }),
  ]);
  const by = (id) => names(sortRows(list, sortFor(id)));

  test("newest first: folders on top, undated files last both ways", () => {
    assert.deepEqual(by("dateDesc"), ["2026", "Archives", "clip 2.avi", "clip 10.mp4", "Clip 3.jpg", "undated.txt"]);
    assert.deepEqual(by("dateAsc"), ["Archives", "2026", "Clip 3.jpg", "clip 10.mp4", "clip 2.avi", "undated.txt"]);
  });

  test("by name: natural and case-insensitive, both ways", () => {
    assert.deepEqual(by("nameAsc"), ["2026", "Archives", "clip 2.avi", "Clip 3.jpg", "clip 10.mp4", "undated.txt"]);
    assert.deepEqual(by("nameDesc"), ["Archives", "2026", "undated.txt", "clip 10.mp4", "Clip 3.jpg", "clip 2.avi"]);
  });

  test("by size; folders stay A to Z", () => {
    assert.deepEqual(by("sizeDesc"), ["2026", "Archives", "undated.txt", "clip 10.mp4", "Clip 3.jpg", "clip 2.avi"]);
    assert.deepEqual(by("sizeAsc"), ["2026", "Archives", "clip 2.avi", "Clip 3.jpg", "clip 10.mp4", "undated.txt"]);
  });

  test("by camera: ties newest first, files without a camera last", () => {
    const clips = rows(["9_Porte_202610300830.avi", "9_Allee_202610300800.avi", "notes.txt", "9_Allee_202610300900.avi"].map((n) => file(n)));
    assert.deepEqual(names(sortRows(clips, sortFor("cameraAsc"))),
      ["9_Allee_202610300900.avi", "9_Allee_202610300800.avi", "9_Porte_202610300830.avi", "notes.txt"]);
    assert.deepEqual(names(sortRows(clips, sortFor("cameraDesc"))),
      ["9_Porte_202610300830.avi", "9_Allee_202610300900.avi", "9_Allee_202610300800.avi", "notes.txt"]);
  });

  test("within a minute, the FTP time breaks the tie, then the name", () => {
    const same = rows([
      file("9_Cam 1_202610300830.avi", { modified: "2026-10-30T07:30:40Z" }),
      file("9_Cam 2_202610300830.avi", { modified: "2026-10-30T07:30:10Z" }),
      file("9_Cam 3_202610300830.avi"),
    ]);
    assert.deepEqual(names(sortRows(same, sortFor("dateDesc"))), ["9_Cam 1_202610300830.avi", "9_Cam 2_202610300830.avi", "9_Cam 3_202610300830.avi"]);
  });

  test("the orders and their ids; the input is left alone", () => {
    assert.equal(SORTS.length, 8);
    assert.equal(sortId({ key: "size", dir: "asc" }), "sizeAsc");
    assert.equal(sortId({ key: "nope", dir: "asc" }), "dateDesc");
    assert.equal(sortFor("nope"), null);
    const before = names(list);
    sortRows(list, sortFor("sizeAsc"));
    assert.deepEqual(names(list), before);
  });
});

describe("periods", () => {
  const now = new Date(2026, 9, 31, 15, 0);   // Saturday 31 October 2026, 15:00
  const range = (filters) => periodRange({ ...NO_FILTERS, ...filters }, now);

  test("the presets, in the select's order", () => {
    assert.deepEqual(PERIODS, ["", "hour", "24h", "today", "yesterday", "7d", "around", "range"]);
  });

  test("recent periods have no end, so a fast camera clock stays in", () => {
    assert.deepEqual(range({ period: "hour" }), [local(2026, 9, 31, 14, 0), null]);
    assert.deepEqual(range({ period: "24h" }), [local(2026, 9, 30, 15, 0), null]);
    assert.deepEqual(range({ period: "today" }), [local(2026, 9, 31), null]);
    assert.deepEqual(range({ period: "7d" }), [local(2026, 9, 25), null], "today and the six days before");
    assert.equal(range({ period: "" }), null);
    assert.equal(periodRange(null, now), null);
  });

  test("yesterday runs midnight to midnight, also over a clock change, a month or a year end", () => {
    assert.deepEqual(range({ period: "yesterday" }), [local(2026, 9, 30), local(2026, 9, 31)]);
    const at = (d) => periodRange({ period: "yesterday" }, d);
    assert.deepEqual(at(new Date(2026, 9, 26, 10)), [local(2026, 9, 25), local(2026, 9, 26)], "the clocks went back on 25 October");
    assert.deepEqual(at(new Date(2026, 2, 30, 10)), [local(2026, 2, 29), local(2026, 2, 30)], "and forward on 29 March");
    assert.deepEqual(at(new Date(2026, 10, 1, 0, 5)), [local(2026, 9, 31), local(2026, 10, 1)]);
    assert.deepEqual(at(new Date(2027, 0, 1, 9)), [local(2026, 11, 31), local(2027, 0, 1)]);
  });

  test("around a time: the margin both ways, its last minute included", () => {
    assert.deepEqual(range({ period: "around", at: "2026-10-30T08:30", margin: 15 }), [local(2026, 9, 30, 8, 15), local(2026, 9, 30, 8, 46)]);
    assert.deepEqual(range({ period: "around", at: "2026-10-30T08:30", margin: 5 }), [local(2026, 9, 30, 8, 25), local(2026, 9, 30, 8, 36)]);
    assert.deepEqual(range({ period: "around", at: "2026-10-30T08:30", margin: 7 }), [local(2026, 9, 30, 8, 15), local(2026, 9, 30, 8, 46)],
      "an unknown margin is 15 minutes");
    assert.equal(range({ period: "around", at: "" }), null);
  });

  test("a custom range takes in its last minute (or day), either way round, open on a side", () => {
    assert.deepEqual(range({ period: "range", from: "2026-10-30T08:00", to: "2026-10-30T09:00" }), [local(2026, 9, 30, 8), local(2026, 9, 30, 9, 1)]);
    assert.deepEqual(range({ period: "range", from: "2026-10-30T09:00", to: "2026-10-30T08:00" }), [local(2026, 9, 30, 8), local(2026, 9, 30, 9, 1)]);
    assert.deepEqual(range({ period: "range", from: "2026-10-28", to: "2026-10-29" }), [local(2026, 9, 28), local(2026, 9, 30)]);
    assert.deepEqual(range({ period: "range", to: "2026-10-30T08:00" }), [null, local(2026, 9, 30, 8, 1)]);
    assert.deepEqual(range({ period: "range", from: "2026-10-30T08:00" }), [local(2026, 9, 30, 8), null]);
    assert.equal(range({ period: "range" }), null);
  });
});

describe("filters", () => {
  const now = new Date(2026, 9, 31, 15, 0);
  const list = rows([
    dir("Archives"),
    file("1234_Porte_202610311430.avi"),           // today, 14:30
    file("1234_Porte_202610301000.mp4"),           // yesterday
    file("1234_Allee_202610311000.avi"),           // today, 10:00
    file("snapshot.jpg", { modified: "2026-10-31T09:00" }),
    file("notes.txt"),                             // no date at all
  ]);
  const apply = (filters) => applyFilters(list, { ...NO_FILTERS, ...filters }, now);

  test("no filter: every row, nothing hidden", () => {
    assert.deepEqual(apply({}), { shown: list, hidden: 0 });
    assert.deepEqual(activeFilters(NO_FILTERS), []);
    assert.deepEqual(activeFilters({ ...NO_FILTERS, period: "range" }), [], "a range with no ends filters nothing");
  });

  test("a period keeps the folders and hides files without a date", () => {
    assert.deepEqual(names(apply({ period: "today" }).shown), ["Archives", "1234_Porte_202610311430.avi", "1234_Allee_202610311000.avi", "snapshot.jpg"]);
    assert.equal(apply({ period: "today" }).hidden, 2);
    assert.deepEqual(names(apply({ period: "hour" }).shown), ["Archives", "1234_Porte_202610311430.avi"]);
    assert.deepEqual(names(apply({ period: "yesterday" }).shown), ["Archives", "1234_Porte_202610301000.mp4"]);
  });

  test("camera and type combine with the period", () => {
    assert.deepEqual(names(apply({ period: "today", camera: "Porte" }).shown), ["Archives", "1234_Porte_202610311430.avi"]);
    assert.deepEqual(names(apply({ kind: "image" }).shown), ["Archives", "snapshot.jpg"]);
    assert.deepEqual(names(apply({ kind: "other" }).shown), ["Archives", "notes.txt"]);
    assert.deepEqual(activeFilters({ ...NO_FILTERS, period: "today", camera: "Porte", kind: "video" }),
      [{ name: "period", value: "today" }, { name: "camera", value: "Porte" }, { name: "kind", value: "video" }]);
  });

  test("facets count each choice within the other filters, and keep empty ones", () => {
    const f = facets(list, { ...NO_FILTERS, period: "today", camera: "Porte" }, now);
    assert.deepEqual(f.cameras, [{ name: "Allee", count: 1 }, { name: "Porte", count: 1 }]);
    assert.equal(f.cameraTotal, 3, "today, whatever the camera");
    assert.deepEqual(f.kinds, [{ name: "video", count: 1 }, { name: "image", count: 0 }, { name: "other", count: 0 }]);
    assert.equal(f.kindTotal, 1);
    assert.deepEqual(facets(list, { ...NO_FILTERS, period: "yesterday" }, now).cameras, [{ name: "Allee", count: 0 }, { name: "Porte", count: 1 }]);
    assert.deepEqual(facets([], NO_FILTERS, now), { cameras: [], cameraTotal: 0, kinds: [], kindTotal: 0 });
  });

  test("the newest file", () => {
    assert.deepEqual(newestTime(list), { ms: local(2026, 9, 31, 14, 30), precision: "minute" });
    assert.equal(newestTime(rows([dir("Archives"), file("notes.txt")])), null);
  });
});

describe("day headings", () => {
  const now = new Date(2026, 10, 1, 15, 0);   // Sunday 1 November 2026, 15:00
  const list = sortRows(rows([
    dir("Archives"),
    file("9_Cam 1_202611011430.avi"),
    file("9_Cam 1_202611020005.avi"),          // a fast clock: tomorrow, counted as today
    file("9_Cam 1_202610312350.avi"),
    file("9_Cam 1_202610302350.avi"),
    file("9_Cam 1_202610300010.avi"),
    file("9_Cam 1_202610250130.avi"),          // the day the clocks went back
    file("notes.txt"),
  ]), sortFor("dateDesc"));
  const shape = (groups) => groups.map((g) => [g.kind, g.day, g.rows.length]);

  test("folders first, then one group per local day, undated last", () => {
    assert.deepEqual(shape(groupByDay(list, now)), [
      ["folders", null, 1],
      ["today", local(2026, 10, 1), 2],
      ["yesterday", local(2026, 9, 31), 1],
      ["day", local(2026, 9, 30), 2],
      ["day", local(2026, 9, 25), 1],
      ["unknown", null, 1],
    ]);
  });

  test("oldest first too", () => {
    const asc = groupByDay(sortRows(list, sortFor("dateAsc")), now);
    assert.deepEqual(asc.map((g) => g.kind), ["folders", "day", "day", "yesterday", "today", "unknown"]);
  });
});

describe("playlist", () => {
  const list = rows([dir("Archives"), file("9_Cam 1_202610300830.avi"), file("report.pdf"), file("photo.jpg"),
    file("9_Cam 2_202610300831.mp4"), file("raw.tiff"), file("voice.mp3")]);
  const keys = (p) => p.items.map((r) => r.name);

  test("the viewable files as shown; just the selection when the opened one is in it", () => {
    const all = playlist(list, "site::/photo.jpg");
    assert.deepEqual(keys(all), ["9_Cam 1_202610300830.avi", "photo.jpg", "9_Cam 2_202610300831.mp4", "voice.mp3"]);
    assert.equal(all.index, 1);
    const picked = new Set(["site::/9_Cam 1_202610300830.avi", "site::/9_Cam 2_202610300831.mp4", "site::/report.pdf"]);
    const sel = playlist(list, "site::/9_Cam 2_202610300831.mp4", picked);
    assert.deepEqual(keys(sel), ["9_Cam 1_202610300830.avi", "9_Cam 2_202610300831.mp4"]);
    assert.equal(sel.index, 1);
    assert.equal(playlist(list, "site::/photo.jpg", picked).items.length, 4, "opened outside the selection: the whole list");
    assert.equal(playlist(list, "site::/report.pdf").index, -1, "a PDF opens in a tab, not in the viewer");
  });
});
