/*
 * viewer.js - the in-app viewer for images, video and audio: a modal
 * <dialog> that steps through a list.
 *
 *   viewer.open(items, index, { describe, onShow, onRequestClose })
 *     items             what Précédent / Suivant step through (rows of the list)
 *     describe(item)    { name, kind, url, fallbackUrl, downloadUrl, caption, subtitle }
 *     onShow(item, i)   each time a file is shown
 *     onRequestClose()  Esc, Fermer or a click beside the media: the app closes
 *                       through history, so the browser's Back button does too
 *     onClosed(item)    the browser closed it by itself
 *     copyLink(item)    "Copier le lien" in the header, when given
 *   viewer.close()      close now
 *   viewer.isOpen(), viewer.current()
 *
 * Images: fit / 100% / zoom buttons, mouse-wheel zoom, drag to pan. Video and
 * audio use the browser's own player, which seeks through HTTP range
 * requests. When the browser can't decode a file, the viewer tries
 * fallbackUrl (the server's converted MP4) if there is one, and otherwise
 * says why and offers the download instead. Each step and the closing stop
 * the stream, which frees the server's FTP connection; nothing is loaded in
 * advance.
 *
 * Keys: Left/Right, Home/End and Page Up/Down step (the arrows seek instead
 * while the player has the focus), Space plays or pauses, Esc closes.
 * "Lecture enchaînée" (remembered) plays the next video a second after one
 * ends; a key, a click or Précédent in that second cancels it.
 */

import { el } from "./ui.js";
import { t } from "./i18n.js";
import { icon } from "./icons.js";
import { prefs } from "./prefs.js";
import { announce } from "./keys.js";

let dialog = null, captionEl = null, subtitleEl = null, positionEl = null, prevBtn = null, nextBtn = null;
let downloadLink = null, linkBtn = null, stage = null, chain = null, chainBox = null;
let list = [], at = 0, options = null, openedAt = 0, chainTimer = 0;
let closing = false, byApp = false;   // a close was asked for; the app closes it

function button(className, iconName, label, title, action) {
  const b = el("button", `btn-secondary ${className}`);
  b.type = "button";
  if (iconName) b.append(icon(iconName));
  b.append(el("span", "btn-label", label));
  if (title) b.title = title;
  b.addEventListener("click", action);
  return b;
}

function ensureDialog() {
  if (dialog) return;
  dialog = el("dialog", "viewer");
  dialog.id = "viewer";
  dialog.setAttribute("aria-labelledby", "viewer-caption");

  const nav = el("div", "viewer-nav");
  prevBtn = button("viewer-prev", "prev", t("viewer.prev"), t("viewer.prevTip"), () => step(-1));
  nextBtn = button("viewer-next", "next", t("viewer.next"), t("viewer.nextTip"), () => step(1));
  positionEl = el("span", "viewer-position");
  chain = el("label", "viewer-autoplay");
  chainBox = el("input");
  chainBox.type = "checkbox";
  chainBox.addEventListener("change", () => prefs.set("autoplay", chainBox.checked));
  chain.append(chainBox, el("span", "", t("viewer.autoplay")));
  nav.append(prevBtn, positionEl, nextBtn, chain);

  const caption = el("div", "viewer-caption");
  captionEl = el("span", "viewer-title");
  captionEl.id = "viewer-caption";
  subtitleEl = el("span", "viewer-subtitle");
  caption.append(captionEl, subtitleEl);

  downloadLink = el("a", "btn-secondary viewer-download");
  downloadLink.append(icon("download"), el("span", "btn-label", t("viewer.download")));
  downloadLink.setAttribute("download", "");
  linkBtn = button("viewer-link", "link", t("share.copy"), "", () => options.copyLink?.(list[at]));
  const closeBtn = button("viewer-close", "close", t("viewer.close"), t("viewer.closeTip"), requestClose);

  stage = el("div", "viewer-body");
  stage.tabIndex = -1;
  dialog.append(nav, caption, linkBtn, downloadLink, closeBtn, stage);

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    requestClose();
  });
  // The browser may still close it (a second Esc in a row): tidy up, and
  // let the app catch up with its history.
  dialog.addEventListener("close", () => {
    const last = list[at];
    cancelChain();
    stopMedia();
    stage.replaceChildren();
    const native = !byApp;
    byApp = closing = false;
    if (native) options?.onClosed?.(last);
  });
  dialog.addEventListener("keydown", onKey);
  dialog.addEventListener("keydown", cancelChain, true);
  dialog.addEventListener("pointerdown", cancelChain, true);
  // For a moment after opening, a click is the end of the double-click (or
  // double tap) that opened the viewer: it must not close or pause anything.
  dialog.addEventListener("click", (e) => {
    if (performance.now() - openedAt < 400) {
      if (e.target === dialog || stage.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.target === dialog) requestClose();
  }, true);
  document.body.append(dialog);
}

function requestClose() {
  if (!isOpen() || closing) return;   // Esc twice must not go back twice
  closing = true;
  if (options?.onRequestClose) options.onRequestClose();
  else close();
}

function onKey(e) {
  const media = e.target.closest?.("video, audio");
  const control = e.target.closest?.("button, a");
  switch (e.key) {
    case "ArrowLeft": if (media) return; step(-1); break;
    case "ArrowRight": if (media) return; step(1); break;
    case "Home": if (media) return; show(0); break;
    case "End": if (media) return; show(list.length - 1); break;
    case "PageUp": step(-1); break;
    case "PageDown": step(1); break;
    case " ": {
      if (media || control) return;
      const player = stage.querySelector("video, audio");
      if (!player) return;
      if (player.paused) player.play().catch(() => {});
      else player.pause();
      break;
    }
    default: return;
  }
  e.preventDefault();
}

function step(delta) {
  show(at + delta);
}

function cancelChain() {
  clearTimeout(chainTimer);
  chainTimer = 0;
}

function show(index) {
  if (index < 0 || index >= list.length) return;
  cancelChain();
  at = index;
  const item = options.describe(list[at]);
  stopMedia();
  captionEl.textContent = item.caption || item.name;
  captionEl.title = item.name;
  subtitleEl.textContent = item.subtitle || "";
  subtitleEl.hidden = !item.subtitle;
  positionEl.textContent = t("viewer.position", { n: at + 1, total: list.length });
  positionEl.hidden = list.length < 2;
  prevBtn.disabled = at === 0;
  nextBtn.disabled = at === list.length - 1;
  prevBtn.hidden = nextBtn.hidden = list.length < 2;
  downloadLink.href = item.downloadUrl;
  chain.hidden = item.kind !== "video" || list.length < 2;
  chainBox.checked = prefs.get("autoplay");
  if (item.kind === "image") renderImage(item.url);
  else renderMedia(item.kind, item.url, item.fallbackUrl);
  options.onShow?.(list[at], at);
}

function open(items, index, opts) {
  ensureDialog();
  list = items;
  options = opts;
  closing = false;
  linkBtn.hidden = !opts.copyLink;
  openedAt = performance.now();
  if (!dialog.open) dialog.showModal();
  show(Math.max(0, Math.min(index, items.length - 1)));
  stage.focus({ preventScroll: true });
}

// Dropping a media element's source aborts its HTTP request(s) at once.
function stopMedia() {
  for (const media of stage?.querySelectorAll("video, audio") ?? []) {
    media.pause();
    media.removeAttribute("src");
    media.load();
  }
}

function close() {
  if (!isOpen()) return;
  byApp = true;
  dialog.close();   // the "close" event stops the media
}

const isOpen = () => !!dialog?.open;

function showProblem(text) {
  const box = el("div", "viewer-message");
  const hint = el("p", "", text);
  const link = el("a", "", t("viewer.downloadInstead"));
  link.href = downloadLink.href;
  link.setAttribute("download", "");
  box.append(hint, link);
  stage.replaceChildren(box);
}

// A media element doesn't expose the server's error message: ask for the
// first byte, which returns the message itself if the video isn't available.
async function explain(url) {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    if (!res.ok) return (await res.json()).error || t("viewer.cantPlay");
  } catch {
    // offline, or not JSON: the generic message will do
  }
  return t("viewer.cantPlay");
}

function renderMedia(kind, url, fallbackUrl) {
  const media = el(kind, "viewer-media");
  media.controls = true;
  media.autoplay = true;
  media.preload = "metadata";
  // Converting a video takes a moment: say something meanwhile.
  const status = el("p", "viewer-status", t("common.loading"));
  let fallback = fallbackUrl;
  media.addEventListener("loadedmetadata", () => status.remove());
  media.addEventListener("error", async () => {
    const src = media.getAttribute("src");
    if (!src) return;   // stopped on purpose
    if (fallback) {
      media.src = fallback;
      fallback = null;
      status.textContent = t("viewer.converting");
      if (!status.isConnected) stage.append(status);   // gone if the first try got as far as metadata
      return;
    }
    const message = await explain(src);
    if (media.getAttribute("src") === src) showProblem(message);   // unless the viewer moved on
  });
  media.addEventListener("ended", () => {
    if (chain.hidden || !chainBox.checked || at >= list.length - 1) return;   // videos only
    const next = options.describe(list[at + 1]);
    announce(t("viewer.autoplayNext", { caption: next.caption || next.name }));
    chainTimer = setTimeout(() => step(1), 1000);
  });
  media.src = url;
  stage.replaceChildren(media, status);
}

function renderImage(url) {
  const controls = el("div", "image-controls");
  const control = (text, label, action) => {
    const b = el("button", "btn-secondary btn-sm", text);
    b.type = "button";
    if (label) {
      b.title = label;
      b.setAttribute("aria-label", label);
    }
    b.addEventListener("click", action);
    controls.append(b);
  };
  const canvas = el("div", "image-canvas");
  const img = el("img");
  img.alt = "";
  canvas.append(img);
  stage.replaceChildren(controls, canvas);

  let mode = "fit";   // "fit" | "natural" | "custom"
  let scale = 1;

  function applyFit() {
    mode = "fit";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.width = "auto";
    img.style.height = "auto";
  }
  function applyScale(s) {
    mode = "custom";
    scale = Math.max(0.1, Math.min(20, s));
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";
    img.style.width = Math.round(img.naturalWidth * scale) + "px";
    img.style.height = Math.round(img.naturalHeight * scale) + "px";
  }
  function bump(factor) {
    if (mode !== "custom" && img.naturalWidth) scale = img.offsetWidth / img.naturalWidth;
    applyScale(scale * factor);
  }

  control("−", t("viewer.zoomOut"), () => bump(1 / 1.25));
  control(t("viewer.fit"), "", applyFit);
  control("100%", "", () => { applyScale(1); mode = "natural"; });
  control("+", t("viewer.zoomIn"), () => bump(1.25));

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (e.deltaY < 0) bump(1.1);
    else if (e.deltaY > 0) bump(1 / 1.1);
  }, { passive: false });

  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("dragging");
    e.preventDefault();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drag) return;
    canvas.scrollLeft = drag.left - (e.clientX - drag.x);
    canvas.scrollTop = drag.top - (e.clientY - drag.y);
  });
  const endDrag = () => {
    drag = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  img.addEventListener("load", applyFit);
  img.addEventListener("error", () => showProblem(t("viewer.badImage")));
  img.src = url;
}

export const viewer = {
  open,
  close,
  isOpen,
  show,
  current: () => (isOpen() ? list[at] : null),
};
