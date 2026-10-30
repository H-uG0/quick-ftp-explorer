/*
 * viewer.js - in-app modal viewer for images, video and audio.
 *
 *   viewer.open({ name, kind, url, fallbackUrl, downloadUrl })   kind: "image" | "video" | "audio"
 *   viewer.close()
 *
 * Images: fit / 100% / zoom buttons, mouse-wheel zoom, drag to pan. Video and
 * audio use the browser's own player, which seeks through HTTP range
 * requests. When the browser can't decode a file, the viewer tries
 * fallbackUrl (the server's converted MP4) if there is one, and otherwise
 * says why and offers the download instead. Closing stops the stream, which
 * frees the server's FTP connection. Esc closes.
 */

import { el } from "./ui.js";

let overlay = null, titleEl = null, downloadLink = null, body = null;

function ensureOverlay() {
  if (overlay) return;
  overlay = el("div", "viewer-overlay");
  overlay.hidden = true;
  const header = el("div", "viewer-header");
  titleEl = el("span", "viewer-title");
  downloadLink = el("a", "btn-secondary btn-sm", "Download");
  downloadLink.setAttribute("download", "");
  const closeBtn = el("button", "btn-secondary btn-sm", "Close (Esc)");
  closeBtn.type = "button";
  closeBtn.addEventListener("click", close);
  header.append(titleEl, downloadLink, closeBtn);
  body = el("div", "viewer-body");
  overlay.append(header, body);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.body.append(overlay);
}

function showProblem(text) {
  const box = el("div", "viewer-message");
  const hint = el("p", "", text);
  const link = el("a", "", "Download it instead");
  link.href = downloadLink.href;
  link.setAttribute("download", "");
  box.append(hint, link);
  body.replaceChildren(box);
}

function onKey(e) {
  if (e.key === "Escape") close();
}

function open({ name, kind, url, fallbackUrl = null, downloadUrl }) {
  ensureOverlay();
  stopMedia();
  titleEl.textContent = name;
  titleEl.title = name;
  downloadLink.href = downloadUrl;
  if (kind === "image") renderImage(url);
  else renderMedia(kind, url, fallbackUrl);
  overlay.hidden = false;
  document.addEventListener("keydown", onKey);
}

// Dropping a media element's source aborts its HTTP request(s) at once.
function stopMedia() {
  for (const media of body?.querySelectorAll("video, audio") ?? []) {
    media.pause();
    media.removeAttribute("src");
    media.load();
  }
}

function close() {
  if (!overlay || overlay.hidden) return;
  document.removeEventListener("keydown", onKey);
  stopMedia();
  body.replaceChildren();
  overlay.hidden = true;
}

const CANT_PLAY = "This file can't be played in this browser (unsupported format or codec). " +
  "Download it to watch it in another player.";

// A media element doesn't expose the server's error message: ask for the
// first byte, which returns the message itself if the video isn't available.
async function explain(url) {
  try {
    const res = await fetch(url, { headers: { Range: "bytes=0-0" } });
    if (!res.ok) return (await res.json()).error || CANT_PLAY;
  } catch {
    // offline, or not JSON: the generic message will do
  }
  return CANT_PLAY;
}

function renderMedia(kind, url, fallbackUrl) {
  const media = el(kind, "viewer-media");
  media.controls = true;
  media.autoplay = true;
  media.preload = "metadata";
  // Converting a video takes a moment: say something meanwhile.
  const status = el("p", "viewer-status", "Loading…");
  let fallback = fallbackUrl;
  media.addEventListener("loadedmetadata", () => status.remove());
  media.addEventListener("error", async () => {
    const src = media.getAttribute("src");
    if (!src) return;   // stopped on purpose
    if (fallback) {
      media.src = fallback;
      fallback = null;
      status.textContent = "Converting the video for this browser…";
      if (!status.isConnected) body.append(status);   // gone if the first try got as far as metadata
      return;
    }
    const message = await explain(src);
    if (media.getAttribute("src") === src) showProblem(message);   // unless the viewer moved on
  });
  media.src = url;
  body.replaceChildren(media, status);
}

function renderImage(url) {
  const controls = el("div", "image-controls");
  const button = (text, title, action) => {
    const b = el("button", "btn-secondary btn-sm", text);
    b.type = "button";
    if (title) b.title = title;
    b.addEventListener("click", action);
    controls.append(b);
  };
  const canvas = el("div", "image-canvas");
  const img = el("img");
  img.alt = "";
  canvas.append(img);
  body.replaceChildren(controls, canvas);

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

  button("−", "Zoom out", () => bump(1 / 1.25));
  button("Fit", "", applyFit);
  button("100%", "", () => { applyScale(1); mode = "natural"; });
  button("+", "Zoom in", () => bump(1.25));

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
  img.addEventListener("error", () => showProblem("This image couldn't be loaded or isn't in a format the browser can show."));
  img.src = url;
}

export const viewer = { open, close };
