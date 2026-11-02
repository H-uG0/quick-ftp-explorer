/*
 * selection.test.js - File Explorer's selection rules (public/js/selection.js).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import * as sel from "../public/js/selection.js";

const order = ["a", "b", "c", "d", "e"];
const picked = (state) => [...state.selected].sort();

test("a click selects one row; Ctrl adds or removes; Shift takes the range from the anchor", () => {
  let s = sel.click(sel.EMPTY, order, "b");
  assert.deepEqual(picked(s), ["b"]);
  s = sel.click(s, order, "d", { ctrl: true });
  assert.deepEqual(picked(s), ["b", "d"]);
  assert.equal(s.anchor, "d");
  s = sel.click(s, order, "b", { ctrl: true });
  assert.deepEqual(picked(s), ["d"]);
  s = sel.click(s, order, "a", { shift: true });
  assert.deepEqual(picked(s), ["a", "b"], "from the anchor, b (the last row Ctrl-clicked, even to deselect it), up to a");
  assert.equal(s.anchor, "b");
  s = sel.click(sel.click(sel.EMPTY, order, "a"), order, "c", { shift: true });
  assert.deepEqual(picked(s), ["a", "b", "c"]);
  s = sel.click(s, order, "e", { shift: true });
  assert.deepEqual(picked(s), ["a", "b", "c", "d", "e"], "Shift redraws the range from the same anchor");
  s = sel.click(s, order, "b", { shift: true });
  assert.deepEqual(picked(s), ["a", "b"], "and shrinks it");
});

test("Ctrl+Shift adds a range to what was selected", () => {
  let s = sel.click(sel.click(sel.EMPTY, order, "a"), order, "b", { ctrl: true });
  s = sel.click(s, order, "e", { ctrl: true });
  s = sel.click(s, order, "d", { ctrl: true, shift: true });
  assert.deepEqual(picked(s), ["a", "b", "d", "e"]);
});

test("the keys: plain moves select, Shift extends, Ctrl only moves the focus", () => {
  let s = sel.move(sel.EMPTY, order, "a");
  assert.deepEqual(picked(s), ["a"]);
  s = sel.move(s, order, "c", { shift: true });
  assert.deepEqual(picked(s), ["a", "b", "c"]);
  s = sel.move(s, order, "e", { ctrl: true });
  assert.deepEqual(picked(s), ["a", "b", "c"]);
  assert.equal(s.focus, "e");
  s = sel.toggle(s, s.focus);
  assert.deepEqual(picked(s), ["a", "b", "c", "e"], "Space");
  s = sel.toggle(s, "e");
  assert.deepEqual(picked(s), ["a", "b", "c"]);
  assert.equal(sel.move(s, order, "zz"), s, "unknown rows change nothing");
  assert.equal(sel.click(s, order, "zz"), s);
});

test("select all, clear", () => {
  const s = sel.selectAll(sel.EMPTY, ["b", "d"]);
  assert.deepEqual(picked(s), ["b", "d"], "only the keys given: the files");
  assert.equal(s.focus, "b");
  const cleared = sel.clear(s);
  assert.deepEqual(picked(cleared), []);
  assert.equal(cleared.focus, "b", "the focus stays");
  assert.equal(sel.clear(cleared), cleared, "nothing to clear: same state");
});

test("rows that go out of view leave the selection", () => {
  let s = sel.selectAll(sel.click(sel.EMPTY, order, "c"), order);
  s = sel.retain(s, ["a", "b", "e"]);
  assert.deepEqual(picked(s), ["a", "b", "e"]);
  assert.equal(s.focus, null);
  assert.equal(s.anchor, null);
  assert.equal(sel.retain(s, ["a", "b", "e"]), s, "nothing changed: same state");
});
