/*
 * selection.js - File Explorer's selection rules for a list, as pure state
 * changes: each function returns a new state. No DOM, so the test suite can
 * run it.
 *
 *   state = { selected: Set of row keys, anchor, focus }
 *   order = the keys as shown, top to bottom
 *
 *   click(state, order, key, { ctrl, shift })   a click on a row
 *   move(state, order, key, { ctrl, shift })    the arrows, Home/End, Page Up/Down
 *   toggle(state, key)                          Space, a row's check box
 *   selectAll(state, keys)                      Ctrl+A (the caller passes the files only)
 *   clear(state)                                Esc, a click below the rows
 *   retain(state, order)                        forget what is no longer shown
 *
 * A click selects one row; Ctrl adds or removes one; Shift selects from the
 * anchor (the last row clicked without Shift) to here; Ctrl+Shift adds that
 * range. The keys do the same, except that Ctrl alone moves the focus
 * without touching the selection.
 */

export const EMPTY = Object.freeze({ selected: new Set(), anchor: null, focus: null });

function range(order, from, to) {
  let a = order.indexOf(from), b = order.indexOf(to);
  if (a < 0) a = b;
  if (a > b) [a, b] = [b, a];
  return order.slice(a, b + 1);
}

export function click(state, order, key, { ctrl = false, shift = false } = {}) {
  if (!order.includes(key)) return state;
  if (shift) {
    const anchor = order.includes(state.anchor) ? state.anchor : key;
    const selected = new Set(ctrl ? state.selected : []);
    for (const k of range(order, anchor, key)) selected.add(k);
    return { selected, anchor, focus: key };
  }
  if (ctrl) return toggle(state, key);
  return { selected: new Set([key]), anchor: key, focus: key };
}

export function move(state, order, key, { ctrl = false, shift = false } = {}) {
  if (!order.includes(key)) return state;
  if (ctrl && !shift) return { ...state, focus: key };
  return click(state, order, key, { ctrl, shift });
}

export function toggle(state, key) {
  const selected = new Set(state.selected);
  if (selected.has(key)) selected.delete(key);
  else selected.add(key);
  return { selected, anchor: key, focus: key };
}

export function selectAll(state, keys) {
  return { selected: new Set(keys), anchor: state.anchor ?? keys[0] ?? null, focus: state.focus ?? keys[0] ?? null };
}

export function clear(state) {
  return state.selected.size ? { ...state, selected: new Set() } : state;
}

export function retain(state, order) {
  const shown = new Set(order);
  const selected = new Set([...state.selected].filter((k) => shown.has(k)));
  const keep = (k) => (shown.has(k) ? k : null);
  if (selected.size === state.selected.size && keep(state.anchor) === state.anchor && keep(state.focus) === state.focus) {
    return state;
  }
  return { selected, anchor: keep(state.anchor), focus: keep(state.focus) };
}
