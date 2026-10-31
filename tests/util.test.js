/*
 * util.test.js - the browser UI's pure helpers (public/js/util.js).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  joinPath, formatSize, sortEntries, splitLabel, composeLabel, formatHash, parseHash, searchTerms, matchName,
} from "../public/js/util.js";

test("joinPath", () => {
  assert.equal(joinPath("/", "Images"), "/Images");
  assert.equal(joinPath("", "Images"), "/Images");
  assert.equal(joinPath("/Images", "2026"), "/Images/2026");
  assert.equal(joinPath("/Images/", "2026"), "/Images/2026");
});

test("formatSize", () => {
  assert.equal(formatSize(0), "0 B");
  assert.equal(formatSize(1023), "1023 B");
  assert.equal(formatSize(1536), "1.5 KB");
  assert.equal(formatSize(5 * 1024 ** 2), "5.0 MB");
  assert.equal(formatSize(3 * 1024 ** 3), "3.00 GB");
  assert.equal(formatSize(undefined), "0 B");
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
