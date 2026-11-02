/*
 * menu.js - the right-click menus, for the mouse and the keyboard alike.
 *
 *   openMenu(at, items, { label, returnFocus })
 *     at      { x, y } where the pointer was, or an element to open beside
 *     items   [{ label, run, isDefault, shortcut, disabled, danger, title } | "separator"]
 *   closeMenu()
 *
 * The menu takes the focus on its first item. Up/Down/Home/End move, Enter
 * or Space runs an item, Esc, Tab or a click elsewhere closes it and gives
 * the focus back. It stays inside the window.
 */

import { layers } from "./keys.js";

let menuEl = null, returnTo = null;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function closeMenu({ restoreFocus = true } = {}) {
  if (!menuEl) return;
  menuEl.remove();
  menuEl = null;
  layers.remove("menu");
  document.removeEventListener("pointerdown", onOutside, true);
  window.removeEventListener("blur", onBlur);
  window.removeEventListener("resize", onBlur);
  const target = returnTo;
  returnTo = null;
  if (restoreFocus && target?.isConnected) target.focus({ preventScroll: true });
}

function onOutside(e) {
  if (menuEl && !menuEl.contains(e.target)) closeMenu({ restoreFocus: false });
}
const onBlur = () => closeMenu({ restoreFocus: false });

function buttons() {
  return [...menuEl.querySelectorAll("[role=menuitem]")];
}

function onKey(e) {
  const items = buttons();
  const at = items.indexOf(document.activeElement);
  const go = (i) => items[(i + items.length) % items.length]?.focus();
  switch (e.key) {
    case "ArrowDown": go(at + 1); break;
    case "ArrowUp": go(at - 1); break;
    case "Home": go(0); break;
    case "End": go(items.length - 1); break;
    case "Tab": closeMenu(); return;   // the focus moves on from where the menu was opened
    case "Escape": closeMenu(); break;
    default: return;
  }
  e.preventDefault();
  e.stopPropagation();
}

export function openMenu(at, items, { label = "", returnFocus = document.activeElement } = {}) {
  closeMenu({ restoreFocus: false });
  returnTo = returnFocus;
  menuEl = el("div", "ctx-menu");
  menuEl.setAttribute("role", "menu");
  if (label) menuEl.setAttribute("aria-label", label);
  for (const item of items) {
    if (item === "separator") {
      const sep = el("div", "ctx-separator");
      sep.setAttribute("role", "separator");
      menuEl.append(sep);
      continue;
    }
    const button = el("button", "ctx-item");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.tabIndex = -1;
    button.append(el("span", "ctx-label", item.label));
    if (item.shortcut) button.append(el("span", "ctx-shortcut", item.shortcut));
    if (item.isDefault) button.classList.add("ctx-default");
    if (item.danger) button.classList.add("ctx-danger");
    if (item.title) button.title = item.title;
    if (item.disabled) button.setAttribute("aria-disabled", "true");
    button.addEventListener("click", () => {
      if (item.disabled) return;
      closeMenu({ restoreFocus: !item.keepFocus });
      item.run();
    });
    menuEl.append(button);
  }
  menuEl.addEventListener("keydown", onKey);
  menuEl.addEventListener("contextmenu", (e) => e.preventDefault());
  document.body.append(menuEl);

  // Beside the element (the focused row or tree item), or at the pointer;
  // either way inside the window.
  const { innerWidth: vw, innerHeight: vh } = window;
  const { offsetWidth: mw, offsetHeight: mh } = menuEl;
  let x, y;
  if (at instanceof Element) {
    const box = at.getBoundingClientRect();
    x = box.left + Math.min(48, box.width / 2);
    y = box.bottom;
    if (y + mh > vh - 4) y = box.top - mh;
  } else {
    ({ x, y } = at);
    if (y + mh > vh - 4) y -= mh;
  }
  menuEl.style.left = Math.max(4, Math.min(x, vw - mw - 4)) + "px";
  menuEl.style.top = Math.max(4, Math.min(y, vh - mh - 4)) + "px";

  layers.push("menu", () => closeMenu());
  document.addEventListener("pointerdown", onOutside, true);
  window.addEventListener("blur", onBlur);
  window.addEventListener("resize", onBlur);
  buttons()[0]?.focus();
}
