/*
 * app.js - orchestration + event wiring.
 *
 * Milestone 7: right pane renders the real file table. Double-clicking a folder
 * row navigates the tree into it; clicking a breadcrumb segment navigates back
 * up. Clicking a file row is a no-op until M10 (external open).
 */

(function () {
  var listEl       = document.getElementById("shortcut-list");
  var emptyHint    = document.getElementById("empty-hint");
  var splitter     = document.getElementById("splitter");
  var leftPane     = document.getElementById("left-pane");
  var statusInfo   = document.getElementById("status-info");
  var statusDflts  = document.getElementById("status-defaults");
  var breadcrumb   = document.getElementById("breadcrumb");
  var rightPane    = document.getElementById("file-list");

  var currentSel = null;    // { shortcut, path, entries }
  var currentFilter = "";   // live from the search box
  var searchInput = document.getElementById("search");

  /* ---- spinner (ref-counted) ---- */
  var spinnerEl = document.getElementById("spinner");
  var spinnerText = spinnerEl.getElementsByClassName("spinner-text")[0];
  var pendingOps = 0;
  function beginOp(label) {
    pendingOps++;
    if (label && spinnerText) spinnerText.innerText = label;
    spinnerEl.className = (spinnerEl.className || "").replace(/\s*\bhidden\b/g, "");
  }
  function endOp() {
    pendingOps = Math.max(0, pendingOps - 1);
    if (pendingOps === 0) {
      if ((spinnerEl.className || "").indexOf("hidden") < 0) spinnerEl.className += " hidden";
    }
  }

  function setHidden(el, hidden) {
    if (hidden) {
      if (el.className.indexOf("hidden") < 0) el.className += " hidden";
    } else {
      el.className = el.className.replace(/\s*\bhidden\b/g, "").replace(/\s+/g, " ");
    }
  }

  var treeInitialized = false;
  function loadShortcuts() {
    var shortcuts = QFE.config.listShortcuts();
    setHidden(emptyHint, shortcuts.length > 0);
    if (!treeInitialized) {
      QFE.ui.init(listEl, shortcuts);
      treeInitialized = true;
    } else {
      QFE.ui.setShortcuts(shortcuts);  // preserves expand / cache / active state
    }
    statusInfo.innerText = shortcuts.length + " shortcut" + (shortcuts.length === 1 ? "" : "s");
    return shortcuts;
  }

  function renderDefaults() {
    var d = QFE.config.readDefaults();
    statusDflts.innerText = "default " + d.default_host + ":" + d.default_port;
  }

  function renderBreadcrumb(sel) {
    breadcrumb.innerHTML = "";
    if (!sel) {
      var p = document.createElement("span");
      p.className = "bc-segment muted";
      p.innerText = "Select a shortcut";
      breadcrumb.appendChild(p);
      return;
    }

    // Root = shortcut label, clickable → "/"
    var rootSeg = document.createElement("span");
    rootSeg.className = "bc-segment clickable";
    rootSeg.innerText = sel.shortcut.label;
    rootSeg.onclick = function () { navigateTo(sel.shortcut, "/"); };
    breadcrumb.appendChild(rootSeg);

    var parts = sel.path.split("/");
    var accum = "";
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      accum = accum + "/" + parts[i];

      var sep = document.createElement("span");
      sep.className = "bc-separator";
      sep.innerHTML = "&rsaquo;";
      breadcrumb.appendChild(sep);

      var s = document.createElement("span");
      s.className = "bc-segment";
      var targetPath = accum;
      // Leaf segment (= current location) is not clickable.
      if (i < parts.length - 1) {
        s.className += " clickable";
        (function (p) { s.onclick = function () { navigateTo(sel.shortcut, p); }; })(targetPath);
      }
      s.innerText = parts[i];
      breadcrumb.appendChild(s);
    }
  }

  function navigateTo(shortcut, path) {
    // The target must already be rendered in the tree (ancestors expanded).
    // For double-click from a folder in the right pane, or breadcrumb (ancestor),
    // this holds. Future: expand arbitrary ancestor chains.
    var ok = QFE.ui.selectKey(shortcut.id, path);
    if (!ok) {
      // Fallback: just update the right pane optimistically. The tree will sync
      // once the ancestor is expanded manually.
      var cachedAll = QFE.ui.getEntries(shortcut.id, path);
      onSelect({ shortcut: shortcut, path: path, entries: cachedAll });
    }
  }

  function fileCallbacks(sel) {
    return {
      onNavigate: function (path) { navigateTo(sel.shortcut, path); },
      onOpen: function (entry, fullPath) { openFile(sel.shortcut, entry, fullPath); }
    };
  }

  // Download to config/temp/ and hand off to the OS default app.
  // The file stays in temp until the next startup or app-exit sweep.
  function sanitizeLocalName(name) {
    return String(name).replace(/[\\\/:*?"<>|]/g, "_");
  }
  function openFile(shortcut, entry, fullPath) {
    QFE.shell.ensureFolder(QFE.shell.absPath("config\\temp"));
    var localName = (new Date().getTime()) + "_" + sanitizeLocalName(entry.name);
    var localPath = QFE.shell.absPath("config\\temp\\" + localName);
    beginOp("Downloading " + entry.name + " ...");
    QFE.ftp.download(shortcut, fullPath, localPath, function (err) {
      endOp();
      if (err) { alert("Download failed: " + err.message); return; }
      // Images preview in the in-app viewer; everything else (video, audio,
      // docs, archives, ...) hands off to the OS default app via `start ""`.
      if (QFE.files.kindFor(entry) === "image") {
        QFE.viewer.open(entry, localPath);
      } else {
        QFE.ftp.openExternally(localPath);
      }
    });
  }

  function onSelect(sel) {
    currentSel = sel;
    renderBreadcrumb(sel);
    QFE.files.render(rightPane, sel, fileCallbacks(sel), currentFilter);
  }

  /* ---- splitter ---- */
  (function initSplitter() {
    var dragging = false;
    splitter.onmousedown = function (e) {
      dragging = true;
      splitter.className = "splitter dragging";
      if (e && e.preventDefault) e.preventDefault();
    };
    document.onmousemove = function (e) {
      if (!dragging) return;
      var x = (e && e.clientX) || (window.event && window.event.clientX) || 0;
      var w = Math.max(180, Math.min(560, x));
      leftPane.style.width = w + "px";
    };
    document.onmouseup = function () {
      if (!dragging) return;
      dragging = false;
      splitter.className = "splitter";
    };
  })();

  /* ---- tree selection -> right pane ---- */
  QFE.ui.onSelect(onSelect);

  /* ---- live search: filters shortcuts (left) + entries at current path (right) ---- */
  function onSearch() {
    currentFilter = (searchInput.value || "").replace(/^\s+|\s+$/g, "");
    QFE.ui.setFilter(currentFilter);
    if (currentSel) {
      QFE.files.render(rightPane, currentSel, fileCallbacks(currentSel), currentFilter);
    }
  }
  searchInput.onkeyup = onSearch;
  searchInput.onchange = onSearch;

  /* ---- context menu + new/delete shortcut ---- */
  var ctxMenu = document.getElementById("ctx-menu");
  var ctxDelete = ctxMenu.querySelector(".ctx-item-delete");
  var ctxNew = ctxMenu.querySelector('[data-action="new"]');
  var ctxTargetShortcut = null;

  function setCtxHidden(hidden) {
    if (hidden) {
      ctxMenu.className = ctxMenu.className.replace(/\s*\bhidden\b/g, "") + " hidden";
    } else {
      ctxMenu.className = ctxMenu.className.replace(/\s*\bhidden\b/g, "");
    }
  }

  function findShortcutRootLi(el) {
    while (el && el !== document) {
      if (el.className && el.className.indexOf("tree-node") >= 0 && el.parentNode === listEl) {
        return el;
      }
      el = el.parentNode;
    }
    return null;
  }
  function shortcutByKey(key) {
    if (!key) return null;
    var id = key.split("::")[0];
    var all = QFE.config.listShortcuts();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }

  leftPane.oncontextmenu = function (e) {
    e = e || window.event;
    var target = e.target || e.srcElement;
    var rootLi = findShortcutRootLi(target);
    ctxTargetShortcut = rootLi ? shortcutByKey(rootLi.getAttribute("data-key")) : null;

    // Enable/disable "Delete" based on whether a shortcut was right-clicked.
    if (ctxTargetShortcut) {
      ctxDelete.className = "ctx-item ctx-item-delete";
    } else {
      ctxDelete.className = "ctx-item ctx-item-delete disabled";
    }

    var x = (e.clientX || 0);
    var y = (e.clientY || 0);
    // Keep the menu inside the viewport.
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;
    var mw = 200, mh = 80;
    if (x + mw > vw) x = Math.max(0, vw - mw - 4);
    if (y + mh > vh) y = Math.max(0, vh - mh - 4);
    ctxMenu.style.left = x + "px";
    ctxMenu.style.top = y + "px";
    setCtxHidden(false);
    if (e.preventDefault) e.preventDefault();
    return false;
  };

  // Dismiss menu on any click anywhere else or on Escape.
  document.addEventListener("click", function () { setCtxHidden(true); });
  document.addEventListener("keydown", function (e) {
    e = e || window.event;
    if (e.keyCode === 27) { setCtxHidden(true); closeModal(); }
  });

  ctxNew.onclick = function (e) {
    if ((ctxNew.className || "").indexOf("disabled") >= 0) return;
    setCtxHidden(true);
    openShortcutModal();
    if (e && e.stopPropagation) e.stopPropagation();
  };
  ctxDelete.onclick = function (e) {
    if ((ctxDelete.className || "").indexOf("disabled") >= 0) return;
    setCtxHidden(true);
    if (!ctxTargetShortcut) return;
    var sc = ctxTargetShortcut;
    if (confirm('Delete shortcut "' + sc.label + '"?\nThis removes config/shortcuts/' + sc.id + '.json.')) {
      QFE.config.deleteShortcut(sc.id);
      if (currentSel && currentSel.shortcut.id === sc.id) {
        currentSel = null;
        renderBreadcrumb(null);
        QFE.files.render(rightPane, null, null, currentFilter);
      }
      loadShortcuts();
    }
    if (e && e.stopPropagation) e.stopPropagation();
  };

  /* ---- new-shortcut modal ---- */
  var modal     = document.getElementById("sc-modal");
  var form      = document.getElementById("sc-form");
  var fUsername = document.getElementById("f-username");
  var fCustom   = document.getElementById("f-custom");
  var fHost     = document.getElementById("f-host");
  var fPort     = document.getElementById("f-port");
  var fPassword = document.getElementById("f-password");
  var fPreview  = document.getElementById("f-preview");
  var btnCancel = document.getElementById("sc-cancel");

  function openShortcutModal() {
    var d = QFE.config.readDefaults();
    fUsername.value = "";
    fCustom.value   = "";
    fHost.value     = d.default_host;
    fPort.value     = d.default_port;
    fPassword.value = "";
    updatePreview();
    modal.className = modal.className.replace(/\s*\bhidden\b/g, "");
    // Focus the first empty field.
    setTimeout(function () { fUsername.focus(); }, 0);
  }
  function closeModal() {
    if ((modal.className || "").indexOf("hidden") < 0) {
      modal.className += " hidden";
    }
  }
  function updatePreview() {
    var u = (fUsername.value || "").replace(/^\s+|\s+$/g, "");
    var c = (fCustom.value   || "").replace(/^\s+|\s+$/g, "");
    fPreview.innerText = c ? (u + " " + c) : u;
  }

  // password auto-mirrors username unless the user has typed one.
  fUsername.oninput = function () {
    updatePreview();
    if (!fPassword._touched) fPassword.value = fUsername.value;
  };
  fCustom.oninput = updatePreview;
  fPassword.oninput = function () { fPassword._touched = fPassword.value.length > 0; };

  // Allow clicking outside the box to close.
  modal.onclick = function (e) {
    if (e.target === modal) closeModal();
  };
  btnCancel.onclick = closeModal;

  form.onsubmit = function (e) {
    if (e && e.preventDefault) e.preventDefault();
    var username = (fUsername.value || "").replace(/^\s+|\s+$/g, "");
    var custom   = (fCustom.value   || "").replace(/^\s+|\s+$/g, "");
    var host     = (fHost.value     || "").replace(/^\s+|\s+$/g, "");
    var port     = parseInt(fPort.value, 10) || 21;
    var password = fPassword.value || username;
    if (!username) { alert("Username is required."); fUsername.focus(); return false; }
    if (!host)     { alert("Host is required.");     fHost.focus();     return false; }
    var label = custom ? (username + " " + custom) : username;
    try {
      QFE.config.saveShortcut({
        label: label, host: host, port: port, username: username, password: password
      });
    } catch (err) {
      alert("Save failed: " + err.message);
      return false;
    }
    closeModal();
    loadShortcuts();
    return false;
  };

  /* ---- temp folder lifecycle ---- */
  var TEMP_DIR = QFE.shell.absPath("config\\temp");
  function sweepTemp() {
    try { QFE.shell.wipeFolder(TEMP_DIR); } catch (e) { /* best-effort */ }
  }
  window.onbeforeunload = sweepTemp;

  /* ---- boot ---- */
  sweepTemp();              // clear anything left by the previous run
  renderDefaults();
  loadShortcuts();
  renderBreadcrumb(null);
})();
