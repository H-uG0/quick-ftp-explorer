/*
 * prefs.js - the few choices this browser remembers, in localStorage.
 *
 *   prefs.get(name)          the saved value, or the default
 *   prefs.set(name, value)   saved if valid; false when it wasn't saved
 *
 *   "sort"           an order of the Trier select ("dateDesc", ...)
 *   "leftPaneWidth"  the sites pane's width, 180 to 560 px
 *   "hintDone"       true once a file was opened by double-click or Enter
 *   "autoplay"       true to play the next clip when one ends
 *
 * Storage can be missing or refuse (private windows, blocked site data):
 * every access is in try/catch, and the defaults then apply.
 */

import { SORTS, DEFAULT_SORT } from "./listview.js";

const PREFS = {
  sort: { key: "qfe.sort", fallback: DEFAULT_SORT.id, valid: (v) => SORTS.some((s) => s.id === v) },
  leftPaneWidth: { key: "qfe.leftPaneWidth", fallback: null, valid: (v) => Number.isInteger(v) && v >= 180 && v <= 560 },
  hintDone: { key: "qfe.hintDone", fallback: false, valid: (v) => typeof v === "boolean" },
  autoplay: { key: "qfe.autoplay", fallback: false, valid: (v) => typeof v === "boolean" },
};

function get(name) {
  const pref = PREFS[name];
  try {
    const raw = localStorage.getItem(pref.key);
    if (raw === null) return pref.fallback;
    const value = JSON.parse(raw);
    return pref.valid(value) ? value : pref.fallback;
  } catch {
    // older versions saved bare numbers and strings
    return pref.fallback;
  }
}

function set(name, value) {
  const pref = PREFS[name];
  if (!pref.valid(value)) return false;
  try {
    localStorage.setItem(pref.key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const prefs = { get, set };
