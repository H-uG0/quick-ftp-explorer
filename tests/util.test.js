/*
 * util.test.js - the browser UI's pure helpers (public/js/util.js).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  joinPath, sortEntries, splitLabel, composeLabel, formatHash, parseHash, searchTerms, matchName,
  parentPath, parseTime, typeAhead,
} from "../public/js/util.js";

test("joinPath", () => {
  assert.equal(joinPath("/", "Images"), "/Images");
  assert.equal(joinPath("", "Images"), "/Images");
  assert.equal(joinPath("/Images", "2026"), "/Images/2026");
  assert.equal(joinPath("/Images/", "2026"), "/Images/2026");
});

test("parentPath", () => {
  assert.equal(parentPath("/Images/2026"), "/Images");
  assert.equal(parentPath("/Images"), "/");
  assert.equal(parentPath("/"), null);
});

// Built with new Date(...), so the tests mean the same in every time zone.
test("parseTime: no zone is local time, Z is exact, a bare day is a day", () => {
  const local = (...parts) => new Date(...parts).getTime();
  assert.deepEqual(parseTime("2026-10-30T08:30"), { ms: local(2026, 9, 30, 8, 30), precision: "minute" });
  assert.deepEqual(parseTime("2026-10-30T08:30:12"), { ms: local(2026, 9, 30, 8, 30, 12), precision: "second" });
  assert.deepEqual(parseTime("2026-04-01"), { ms: local(2026, 3, 1), precision: "day" });
  assert.deepEqual(parseTime("2026-10-30T07:30:12Z"), { ms: Date.UTC(2026, 9, 30, 7, 30, 12), precision: "second" });
  assert.deepEqual(parseTime("2026-10-30T07:30:12.250Z"), { ms: Date.UTC(2026, 9, 30, 7, 30, 12, 250), precision: "second" });
  assert.deepEqual(parseTime("2026-10-30T07:30Z"), { ms: Date.UTC(2026, 9, 30, 7, 30), precision: "minute" });
  for (const bad of [null, undefined, "", "Apr 01 2026", "2026-10-30 08:30", "2026-02-30", "2026-13-01", "2026-10-30T24:00",
    "2026-10-30T08:60", "2026-10-30T08:30+01:00", "1793345412"]) {
    assert.equal(parseTime(bad), null, String(bad));
  }
});

test("typeAhead: the next label starting with what was typed, accents and case ignored", () => {
  const labels = ["Accueil", "Bureau", "Bâtiment B", "Cave", "bassin"];
  assert.equal(typeAhead(labels, "b"), 1);
  assert.equal(typeAhead(labels, "b", 1), 2, "the same letter moves on");
  assert.equal(typeAhead(labels, "bb", 2), 4, "and on, as long as it is the same letter");
  assert.equal(typeAhead(labels, "b", 4), 1, "round to the top");
  assert.equal(typeAhead(labels, "bat", 1), 2, "a word, accents ignored");
  assert.equal(typeAhead(labels, "bur", 1), 1, "a word may match where the focus already is");
  assert.equal(typeAhead(labels, "z"), -1);
  assert.equal(typeAhead([], "a"), -1);
  assert.equal(typeAhead(labels, ""), -1);
});

test("sortEntries: folders first, then natural, case-insensitive order", () => {
  const entries = [
    { name: "clip 10.mp4", isDir: false }, { name: "Zeta", isDir: true }, { name: "clip 2.mp4", isDir: false },
    { name: "alpha", isDir: true }, { name: "Clip 1.mp4", isDir: false },
  ];
  assert.deepEqual(sortEntries(entries).map((e) => e.name), ["alpha", "Zeta", "Clip 1.mp4", "clip 2.mp4", "clip 10.mp4"]);
  assert.equal(entries[0].name, "clip 10.mp4", "the input is not modified");
});

test("search ignores case and accents, and says where the name matched", () => {
  assert.deepEqual(searchTerms("  Été   2026 "), ["ete", "2026"]);
  assert.deepEqual(matchName("Été 2026.jpg", searchTerms("ete")), [[0, 3]]);
  assert.deepEqual(matchName("photo été.png", searchTerms("ÉTÉ")), [[6, 9]]);
  assert.deepEqual(matchName("Dossier avec accents éàü", searchTerms("eau")), [[21, 24]]);
  assert.equal(matchName("notes.txt", searchTerms("zzz")), null);
});

test("search needs every word, in any order, and merges overlapping highlights", () => {
  const clip = "1234_Garage 1_20261030083000.avi";
  assert.deepEqual(matchName(clip, searchTerms("garage 0830")), [[5, 11], [22, 26]]);
  assert.deepEqual(matchName(clip, searchTerms("0830 GARAGE")), [[5, 11], [22, 26]]);
  assert.equal(matchName(clip, searchTerms("garage 0900")), null);
  assert.deepEqual(matchName("abcdef", searchTerms("bcd cde")), [[1, 5]]);
  assert.deepEqual(matchName("anything", []), [], "no words: everything matches, nothing to highlight");
});

test("folder links: formatHash and parseHash round-trip, accents and spaces included", () => {
  assert.equal(formatHash("main-nvr", "/"), "#/main-nvr/");
  assert.equal(formatHash("main-nvr", "/Images/été 2026"), "#/main-nvr/Images/%C3%A9t%C3%A9%202026");
  for (const [id, path] of [["main-nvr", "/"], ["site_12", "/Dossier avec accents éàü/a#b?c%d"], ["x", "/a/b/c"]]) {
    assert.deepEqual(parseHash(formatHash(id, path)), { id, path });
  }
  assert.deepEqual(parseHash("#/main-nvr"), { id: "main-nvr", path: "/" });
  assert.deepEqual(parseHash("#/main-nvr//Images//"), { id: "main-nvr", path: "/Images" });
});

test("clip links: ?open=<name> after the folder", () => {
  const hash = formatHash("main-nvr", "/Cameras", { open: "1234_Cam 1_202610300830.avi" });
  assert.equal(hash, "#/main-nvr/Cameras?open=1234_Cam%201_202610300830.avi");
  assert.deepEqual(parseHash(hash), { id: "main-nvr", path: "/Cameras", open: "1234_Cam 1_202610300830.avi" });
  assert.deepEqual(parseHash("#/main-nvr/?open=a%3Fb.avi"), { id: "main-nvr", path: "/", open: "a?b.avi" });
  assert.deepEqual(parseHash("#/main-nvr/Images%3F/x"), { id: "main-nvr", path: "/Images?/x" }, "an encoded ? stays in the path");
  assert.deepEqual(parseHash("#/main-nvr/Cameras?open=..%2Fsecret"), { id: "main-nvr", path: "/Cameras" }, "only a name");
  assert.deepEqual(parseHash("#/main-nvr/Cameras?other=1"), { id: "main-nvr", path: "/Cameras" });
});

test("parseHash refuses anything that isn't a folder link", () => {
  for (const bad of ["", "#", "#/", "main-nvr", "#main-nvr/x", "#/%E0%A4%A", "#/x/../etc", "#/x/a/./b"]) {
    assert.equal(parseHash(bad), null, bad);
  }
});

test("labels split and compose like the HTA's", () => {
  assert.equal(splitLabel("main-nvr Main office", "main-nvr"), "Main office");
  assert.equal(splitLabel("main-nvr", "main-nvr"), "");
  assert.equal(splitLabel("Something else", "main-nvr"), "Something else");
  assert.equal(composeLabel("main-nvr", "Main office"), "main-nvr Main office");
  assert.equal(composeLabel("main-nvr", ""), "main-nvr");
});
