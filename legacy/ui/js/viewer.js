/*
 * viewer.js - in-app modal viewer. Images only; all other kinds open
 * externally via QFE.ftp.openExternally (wired in app.js).
 *
 *   QFE.viewer.open(entry, localPath)   show an image
 *   QFE.viewer.close()                  dismiss
 *
 * Controls: fit / 100% / zoom in/out buttons, mouse-wheel zoom, drag-to-pan.
 * Esc closes. An "Open externally" button hands the same file off to the OS.
 */

var QFE = QFE || {};

QFE.viewer = (function () {
  var overlay = null, body = null, titleEl = null;
  var keyHandler = null;

  function fileUrl(absPath) {
    // "C:\path with space\x.png" -> "file:///C:/path%20with%20space/x.png"
    return "file:///" + encodeURI(String(absPath).replace(/\\/g, "/"));
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.id = "viewer-overlay";
    overlay.className = "viewer-overlay hidden";
    overlay.innerHTML =
      '<div class="viewer-header">' +
        '<span class="viewer-title" id="viewer-title"></span>' +
        '<button type="button" class="btn-secondary btn-sm viewer-external" id="viewer-external">Open externally</button>' +
        '<button type="button" class="btn-secondary btn-sm viewer-close" id="viewer-close">Close (Esc)</button>' +
      '</div>' +
      '<div class="viewer-body" id="viewer-body"></div>';
    document.body.appendChild(overlay);
    body = document.getElementById("viewer-body");
    titleEl = document.getElementById("viewer-title");
    document.getElementById("viewer-close").onclick = close;
    overlay.onclick = function (e) { if (e.target === overlay) close(); };
  }

  function show() { overlay.className = overlay.className.replace(/\s*\bhidden\b/g, ""); }
  function hide() {
    if ((overlay.className || "").indexOf("hidden") < 0) overlay.className += " hidden";
  }

  function open(entry, localPath) {
    ensureOverlay();
    body.innerHTML = "";
    titleEl.innerText = entry.name;
    document.getElementById("viewer-external").onclick = function () {
      QFE.ftp.openExternally(localPath);
    };
    renderImage(localPath);
    show();
    keyHandler = function (e) {
      e = e || window.event;
      if (e.keyCode === 27) close();
    };
    document.addEventListener("keydown", keyHandler);
  }

  function close() {
    if (!overlay) return;
    if (keyHandler) { document.removeEventListener("keydown", keyHandler); keyHandler = null; }
    if (body) body.innerHTML = "";
    hide();
  }

  function renderImage(localPath) {
    body.innerHTML =
      '<div class="image-controls">' +
        '<button type="button" id="img-zoom-out" class="btn-secondary btn-sm" title="Zoom out">&minus;</button>' +
        '<button type="button" id="img-zoom-fit" class="btn-secondary btn-sm">Fit</button>' +
        '<button type="button" id="img-zoom-100" class="btn-secondary btn-sm">100%</button>' +
        '<button type="button" id="img-zoom-in"  class="btn-secondary btn-sm" title="Zoom in">+</button>' +
      '</div>' +
      '<div class="image-canvas" id="img-canvas">' +
        '<img id="viewer-img" alt="" />' +
      '</div>';

    var canvas = document.getElementById("img-canvas");
    var img    = document.getElementById("viewer-img");
    var mode   = "fit";       // "fit" | "natural" | "custom"
    var scale  = 1;

    function applyFit() {
      mode = "fit";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "100%";
      img.style.width = "auto";
      img.style.height = "auto";
    }
    function applyNatural() {
      mode = "natural"; scale = 1;
      img.style.maxWidth = "none";
      img.style.maxHeight = "none";
      img.style.width = img.naturalWidth + "px";
      img.style.height = img.naturalHeight + "px";
    }
    function applyScale(s) {
      mode = "custom"; scale = Math.max(0.1, Math.min(20, s));
      img.style.maxWidth = "none";
      img.style.maxHeight = "none";
      img.style.width = Math.round(img.naturalWidth * scale) + "px";
      img.style.height = Math.round(img.naturalHeight * scale) + "px";
    }
    function bump(factor) {
      if (mode !== "custom" && img.naturalWidth) scale = img.offsetWidth / img.naturalWidth;
      applyScale(scale * factor);
    }

    document.getElementById("img-zoom-fit").onclick = applyFit;
    document.getElementById("img-zoom-100").onclick = applyNatural;
    document.getElementById("img-zoom-in").onclick  = function () { bump(1.25); };
    document.getElementById("img-zoom-out").onclick = function () { bump(1 / 1.25); };

    canvas.onmousewheel = function (e) {
      e = e || window.event;
      var d = e.wheelDelta || 0;
      if (d > 0) bump(1.1);
      else if (d < 0) bump(1 / 1.1);
      if (e.preventDefault) e.preventDefault();
      return false;
    };

    var dragging = false, sx = 0, sy = 0, sLeft = 0, sTop = 0;
    canvas.onmousedown = function (e) {
      e = e || window.event;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      sLeft = canvas.scrollLeft; sTop = canvas.scrollTop;
      canvas.style.cursor = "grabbing";
      if (e.preventDefault) e.preventDefault();
    };
    canvas.onmousemove = function (e) {
      if (!dragging) return;
      e = e || window.event;
      canvas.scrollLeft = sLeft - (e.clientX - sx);
      canvas.scrollTop  = sTop  - (e.clientY - sy);
    };
    var stopDrag = function () { dragging = false; canvas.style.cursor = "grab"; };
    canvas.onmouseup = stopDrag;
    canvas.onmouseleave = stopDrag;

    img.onload = applyFit;
    img.src = fileUrl(localPath);
    canvas.style.cursor = "grab";
  }

  return { open: open, close: close };
})();
