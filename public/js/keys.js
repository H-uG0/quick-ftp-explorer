/*
 * keys.js - page-wide keyboard rules, and the screen-reader announcer.
 *
 *   isTypingTarget(el)          true in text fields, where letters and Backspace type
 *   layers.push(name, close)    a layer Esc closes (a menu, the phone search, the drawer)
 *   layers.remove(name)         it closed some other way
 *   onShortcut(handler)         handler(name, event) for "find" (Ctrl+F, F3),
 *                               "menu" (Shift+F10, the Menu key), "up" (Alt+Up),
 *                               "back" (Backspace) and "help" (?); return true to take the key
 *   announce(text)              say it once, politely, through the #announcer region
 *   SHORTCUTS                   [keys, action] text keys, for the help and the manuals
 *
 * Esc closes only the topmost layer. Native dialogs close themselves (their
 * cancel event), and the list and the search box use Esc for the selection
 * and the search, so the layers only get an Esc nobody else took. F5, Ctrl+L,
 * Alt+Left/Right and the browser's other keys are left alone.
 */

// What the help lists, in its order: [the keys, what they do].
export const SHORTCUTS = [
  ["kbd.searchKeys", "kbd.search"],
  ["kbd.openKeys", "kbd.open"],
  ["kbd.moveKeys", "kbd.move"],
  ["kbd.selectKeys", "kbd.select"],
  ["kbd.menuKeys", "kbd.menu"],
  ["kbd.viewerKeys", "kbd.viewer"],
  ["kbd.escKeys", "kbd.esc"],
  ["kbd.navKeys", "kbd.nav"],
  ["kbd.helpKeys", "kbd.help"],
];

export function isTypingTarget(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
  if (el.tagName !== "INPUT") return false;
  return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file", "image"].includes(el.type);
}

/* ---- Esc layers ---- */

const stack = [];   // [{ name, close }], topmost last

export const layers = {
  push(name, close) {
    layers.remove(name);
    stack.push({ name, close });
  },
  remove(name) {
    const i = stack.findIndex((l) => l.name === name);
    if (i >= 0) stack.splice(i, 1);
  },
  has: (name) => stack.some((l) => l.name === name),
};

/* ---- shortcuts ---- */

const handlers = [];
export const onShortcut = (handler) => handlers.push(handler);
const fire = (name, e) => handlers.some((h) => h(name, e) === true);

function shortcutFor(e) {
  const typing = isTypingTarget(e.target);
  if ((e.key === "f" || e.key === "F") && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) return "find";
  if (e.key === "F3" && !e.ctrlKey && !e.altKey) return "find";
  if ((e.key === "F10" && e.shiftKey) || e.key === "ContextMenu") return "menu";
  if (e.key === "ArrowUp" && e.altKey && !e.ctrlKey && !e.shiftKey) return "up";
  if (e.key === "Backspace" && !typing && !e.altKey && !e.ctrlKey) return "back";
  if (e.key === "?" && !typing && !e.ctrlKey && !e.altKey) return "help";
  return null;
}

document.addEventListener("keydown", (e) => {
  if (e.defaultPrevented) return;
  if (e.key === "Escape") {
    // An open dialog handles its own Esc; layers under it wait.
    const dialog = document.querySelector("dialog[open]");
    const top = stack.at(-1);
    if (top && !dialog) {
      e.preventDefault();
      stack.pop();
      top.close();
    }
    return;
  }
  if (layers.has("menu")) return;
  const name = shortcutFor(e);
  if (name && fire(name, e)) e.preventDefault();
});

/* ---- the announcer ---- */

let timer = 0;
export function announce(text) {
  const region = document.getElementById("announcer");
  if (!region) return;
  clearTimeout(timer);
  // Debounced: arrowing through a list or typing a filter speaks once.
  timer = setTimeout(() => {
    region.textContent = "";
    requestAnimationFrame(() => { region.textContent = text; });
  }, 500);
}
