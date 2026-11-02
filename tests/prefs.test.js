/*
 * prefs.test.js - the choices the browser remembers (public/js/prefs.js),
 * with a stand-in for localStorage.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { prefs } from "../public/js/prefs.js";

function fakeStorage({ broken = false } = {}) {
  const data = new Map();
  const guard = () => {
    if (broken) throw new Error("SecurityError");
  };
  globalThis.localStorage = {
    getItem: (k) => (guard(), data.has(k) ? data.get(k) : null),
    setItem: (k, v) => (guard(), data.set(k, String(v))),
  };
  return data;
}

test("saved values come back; invalid ones are refused, and the defaults apply", () => {
  const data = fakeStorage();
  assert.equal(prefs.get("sort"), "dateDesc");
  assert.equal(prefs.set("sort", "nameAsc"), true);
  assert.equal(prefs.get("sort"), "nameAsc");
  assert.equal(prefs.set("sort", "byColour"), false);
  assert.equal(prefs.get("sort"), "nameAsc");
  data.set("qfe.sort", "not json");
  assert.equal(prefs.get("sort"), "dateDesc");
  data.set("qfe.leftPaneWidth", "300");   // as older versions saved it
  assert.equal(prefs.get("leftPaneWidth"), 300);
  assert.equal(prefs.set("leftPaneWidth", 9000), false);
  assert.equal(prefs.get("hintDone"), false);
  assert.equal(prefs.set("hintDone", true), true);
  assert.equal(prefs.get("hintDone"), true);
});

test("storage that throws: the defaults, and no error", () => {
  fakeStorage({ broken: true });
  assert.equal(prefs.get("sort"), "dateDesc");
  assert.equal(prefs.set("sort", "nameAsc"), false);
  delete globalThis.localStorage;
  assert.equal(prefs.get("autoplay"), false, "no storage at all");
});
