/*
 * ui.js - tree rendering + selection for the left pane.
 *
 *   init(rootEl, shortcuts)        paint top-level shortcut nodes
 *   setShortcuts(shortcuts)        replace list without losing expand/active state
 *   onSelect(cb)                   cb({shortcut, path}) when user clicks a node
 *   getEntries(shortcutId, path)   cached full listing (files + folders) at a path,
 *                                  or null if not loaded yet. M7 uses this.
 *
 * The tree shows shortcuts as roots and FOLDERS ONLY as children (files go in the
 * right pane). State is keyed by "<shortcutId>::<path>" so expand/collapse and
 * the active selection survive re-renders.
 */

var QFE = QFE || {};

QFE.ui = (function () {
  var rootEl = null;
  var state = {
    shortcuts: [],
    cache: {},       // key -> { loading: true } | { entries: folders[], all: entries[] } | { error: msg }
    expanded: {},    // key -> true
    activeKey: null,
    filter: ""       // lowercased substring; "" disables
  };
  var handlers = { select: null };

  function keyFor(scId, path) { return scId + "::" + path; }

  function joinPath(parent, name) {
    if (!parent || parent === "/") return "/" + name;
    return parent.replace(/\/+$/, "") + "/" + name;
  }

  function init(rootElement, shortcuts) {
    rootEl = rootElement;
    state.shortcuts = shortcuts.slice();
    state.cache = {};
    state.expanded = {};
    state.activeKey = null;
    renderAll();
  }

  function setShortcuts(shortcuts) {
    state.shortcuts = shortcuts.slice();
    renderAll();
  }

  function onSelect(cb) { handlers.select = cb; }

  function getEntries(scId, path) {
    var c = state.cache[keyFor(scId, path)];
    return (c && c.all) || null;
  }

  /* ---------- rendering ---------- */

  function renderAll() {
    rootEl.innerHTML = "";
    var shown = 0;
    for (var i = 0; i < state.shortcuts.length; i++) {
      var sc = state.shortcuts[i];
      if (state.filter && sc.label.toLowerCase().indexOf(state.filter) < 0) continue;
      rootEl.appendChild(buildShortcutNode(sc));
      shown++;
    }
    if (shown === 0 && state.filter) {
      var li = document.createElement("li");
      li.className = "tree-message muted";
      li.innerText = 'No shortcuts match "' + state.filter + '".';
      rootEl.appendChild(li);
    }
  }

  function setFilter(text) {
    state.filter = (text || "").toLowerCase();
    renderAll();
  }

  function buildShortcutNode(sc) {
    return buildNode(sc, "/", sc.label, true);
  }

  function buildNode(sc, path, label, isRoot) {
    var key = keyFor(sc.id, path);
    var li = document.createElement("li");
    li.className = "tree-node";
    li.setAttribute("data-key", key);

    var row = document.createElement("div");
    row.className = "tree-row";
    if (state.activeKey === key) row.className += " active";

    var toggle = document.createElement("span");
    toggle.className = "tree-toggle";
    toggle.innerHTML = state.expanded[key] ? "&#9662;" : "&#9656;"; // ▾ / ▸

    var icon = document.createElement("span");
    icon.className = "tree-icon";
    icon.innerHTML = isRoot ? "&#128421;" : "&#128193;"; // 🖥 / 📁

    var labelEl = document.createElement("span");
    labelEl.className = "tree-label";
    labelEl.innerText = label;
    labelEl.title = isRoot ? (sc.label + "  (" + sc.host + ":" + sc.port + ")") : path;

    row.appendChild(toggle);
    row.appendChild(icon);
    row.appendChild(labelEl);
    li.appendChild(row);

    var children = document.createElement("ul");
    children.className = "tree-children";
    if (!state.expanded[key]) children.className += " hidden";
    li.appendChild(children);

    // Click anywhere on the row: select + expand-if-not-expanded.
    // Clicking only the toggle triangle also collapses if already expanded.
    toggle.onclick = function (e) {
      stop(e);
      if (state.expanded[key]) collapse(key, toggle, children);
      else expand(sc, path, key, toggle, children);
    };
    row.onclick = function () {
      setActive(sc, path);
      if (!state.expanded[key]) expand(sc, path, key, toggle, children);
    };

    if (state.expanded[key]) {
      populateChildren(sc, path, key, toggle, children);
    }
    return li;
  }

  function expand(sc, path, key, toggleEl, childrenEl) {
    state.expanded[key] = true;
    childrenEl.className = "tree-children";
    toggleEl.innerHTML = "&#9662;";
    populateChildren(sc, path, key, toggleEl, childrenEl);
  }

  function collapse(key, toggleEl, childrenEl) {
    state.expanded[key] = false;
    childrenEl.className = "tree-children hidden";
    toggleEl.innerHTML = "&#9656;";
  }

  function populateChildren(sc, path, key, toggleEl, childrenEl) {
    var cached = state.cache[key];
    if (cached && cached.entries) {
      renderFolderChildren(sc, path, cached.entries, childrenEl);
      return;
    }
    if (cached && cached.loading) return;

    state.cache[key] = { loading: true };
    childrenEl.innerHTML = '<li class="tree-message muted">Loading&hellip;</li>';
    toggleEl.innerHTML = "&#9676;"; // ◌ while loading

    QFE.ftp.listDir(sc, path, function (err, raw) {
      toggleEl.innerHTML = state.expanded[key] ? "&#9662;" : "&#9656;";
      if (err) {
        state.cache[key] = { error: err.message };
        childrenEl.innerHTML = '<li class="tree-message tree-error">' + escapeHtml(err.message) + '</li>';
        return;
      }
      var entries = QFE.ftp.parseListing(raw);
      var folders = [];
      for (var i = 0; i < entries.length; i++) if (entries[i].isDir) folders.push(entries[i]);
      folders.sort(function (a, b) {
        var la = a.name.toLowerCase(), lb = b.name.toLowerCase();
        return la < lb ? -1 : la > lb ? 1 : 0;
      });
      state.cache[key] = { entries: folders, all: entries };
      renderFolderChildren(sc, path, folders, childrenEl);
      // Notify listeners that the selection's folder listing is ready (so the
      // right pane can populate without re-fetching).
      if (state.activeKey === key && handlers.select) {
        handlers.select({ shortcut: sc, path: path, entries: entries });
      }
    });
  }

  function renderFolderChildren(sc, parentPath, folders, childrenEl) {
    childrenEl.innerHTML = "";
    if (folders.length === 0) {
      childrenEl.innerHTML = '<li class="tree-message muted">(no subfolders)</li>';
      return;
    }
    for (var i = 0; i < folders.length; i++) {
      var f = folders[i];
      childrenEl.appendChild(buildNode(sc, joinPath(parentPath, f.name), f.name, false));
    }
  }

  function setActive(sc, path) {
    var newKey = keyFor(sc.id, path);
    if (state.activeKey !== newKey) {
      clearActiveClass();
      state.activeKey = newKey;
      var row = rootEl.querySelector('[data-key="' + cssEscape(newKey) + '"] > .tree-row');
      if (row) row.className = row.className + " active";
    }
    // Fire select. Include cached entries if we have them so the right pane can
    // render immediately without an FTP round-trip.
    if (handlers.select) {
      var cached = state.cache[newKey];
      var entries = (cached && cached.all) || null;
      handlers.select({ shortcut: sc, path: path, entries: entries });
    }
  }

  function clearActiveClass() {
    var all = rootEl.getElementsByClassName("tree-row");
    for (var i = 0; i < all.length; i++) {
      all[i].className = all[i].className.replace(/\s*\bactive\b/g, "");
    }
  }

  /* ---------- util ---------- */

  function stop(e) {
    e = e || window.event;
    if (e && e.stopPropagation) e.stopPropagation();
    if (e) e.cancelBubble = true;
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function cssEscape(s) {
    // Minimal CSS attribute-value escape (double quotes + backslashes).
    return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  // Programmatically select a node that is already rendered in the tree (the
  // caller must have expanded all ancestors first). Used by the right pane's
  // folder double-click and by breadcrumb clicks.
  function selectKey(scId, path) {
    var key = keyFor(scId, path);
    var li = null;
    var all = rootEl.getElementsByTagName("li");
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute && all[i].getAttribute("data-key") === key) { li = all[i]; break; }
    }
    if (!li) return false;
    // Click the row to trigger the same handler a real mouse click would.
    var rows = li.getElementsByTagName("div");
    for (var j = 0; j < rows.length; j++) {
      if ((rows[j].className || "").indexOf("tree-row") >= 0) {
        rows[j].onclick();
        // Scroll into view (best-effort).
        if (rows[j].scrollIntoView) { try { rows[j].scrollIntoView(); } catch (e) {} }
        return true;
      }
    }
    return false;
  }

  return {
    init: init,
    setShortcuts: setShortcuts,
    setFilter: setFilter,
    onSelect: onSelect,
    getEntries: getEntries,
    selectKey: selectKey,
    joinPath: joinPath
  };
})();

/* ---------------------------------------------------------------
 * Right-pane file list.
 *
 *   QFE.files.render(containerEl, sel, callbacks, filter)
 *       sel       = { shortcut, path, entries }  (entries may be null while loading)
 *       callbacks = { onNavigate(path), onOpen(entry, fullPath) }
 *       filter    = optional lowercase substring applied to entry names
 *   QFE.files.kindFor(entry)  -> "folder" | "image" | "video" | "audio" | "doc" | "file"
 * ------------------------------------------------------------- */

QFE.files = (function () {

  function formatSize(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
    return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  }

  function extension(name) {
    var i = String(name).lastIndexOf(".");
    if (i <= 0 || i === name.length - 1) return "";
    return name.substring(i + 1).toLowerCase();
  }

  var IMAGE_EXT = { jpg: 1, jpeg: 1, png: 1, gif: 1, bmp: 1, webp: 1 };
  var VIDEO_EXT = { mp4: 1, webm: 1, mov: 1, mkv: 1, avi: 1, m4v: 1 };
  var AUDIO_EXT = { mp3: 1, wav: 1, flac: 1, ogg: 1, m4a: 1, aac: 1 };
  var DOC_EXT   = { pdf: 1, doc: 1, docx: 1, xls: 1, xlsx: 1, txt: 1 };

  function kindFor(entry) {
    if (entry.isDir) return "folder";
    var e = extension(entry.name);
    if (IMAGE_EXT[e]) return "image";
    if (VIDEO_EXT[e]) return "video";
    if (AUDIO_EXT[e]) return "audio";
    if (DOC_EXT[e]) return "doc";
    return "file";
  }

  function iconFor(entry) {
    switch (kindFor(entry)) {
      case "folder": return "&#128193;"; // 📁
      case "image":  return "&#128444;"; // 🖼
      case "video":  return "&#127902;"; // 🎬
      case "audio":  return "&#127925;"; // 🎵
      case "doc":    return "&#128196;"; // 📄
      default:       return "&#128196;"; // 📄
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function sortEntries(entries) {
    // Folders first (case-insensitive), then files (case-insensitive).
    var out = entries.slice();
    out.sort(function (a, b) {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      var la = a.name.toLowerCase(), lb = b.name.toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
    return out;
  }

  function render(container, sel, callbacks, filter) {
    if (!sel) {
      container.innerHTML = '<p class="placeholder muted">Select a shortcut to browse its files.</p>';
      return;
    }
    if (sel.entries == null) {
      container.innerHTML = '<p class="placeholder muted">Loading &hellip;</p>';
      return;
    }
    var entries = sortEntries(sel.entries);
    if (filter) {
      var q = String(filter).toLowerCase();
      var filtered = [];
      for (var fi = 0; fi < entries.length; fi++) {
        if (entries[fi].name.toLowerCase().indexOf(q) >= 0) filtered.push(entries[fi]);
      }
      entries = filtered;
    }
    if (entries.length === 0) {
      container.innerHTML = filter
        ? '<p class="placeholder muted">No entries match "' + escapeHtml(filter) + '".</p>'
        : '<p class="placeholder muted">(empty folder)</p>';
      return;
    }

    // Build the table as a string for speed (hundreds of rows possible).
    var html = [
      '<table class="file-table">',
        '<thead><tr>',
          '<th class="col-name">Name</th>',
          '<th class="col-type">Type</th>',
          '<th class="col-size">Size</th>',
          '<th class="col-date">Modified</th>',
        '</tr></thead>',
        '<tbody>'
    ];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var k = kindFor(e);
      var typeLabel = e.isDir ? "Folder" : (extension(e.name).toUpperCase() || "File");
      var size = e.isDir ? "" : formatSize(e.size);
      html.push(
        '<tr data-index="' + i + '" class="entry-row ' + k + '">',
          '<td class="col-name"><span class="file-icon">' + iconFor(e) + '</span>' +
            '<span class="file-name">' + escapeHtml(e.name) + '</span></td>',
          '<td class="col-type muted">' + typeLabel + '</td>',
          '<td class="col-size muted">' + size + '</td>',
          '<td class="col-date muted">' + escapeHtml(e.date) + '</td>',
        '</tr>'
      );
    }
    html.push('</tbody></table>');
    container.innerHTML = html.join("");

    // Wire row interactions. Single-click selects visually; double-click navigates
    // (folders) or opens (files, M10).
    var tbody = container.getElementsByTagName("tbody")[0];
    var rows = tbody ? tbody.getElementsByTagName("tr") : [];

    function clearRowSel() {
      for (var i = 0; i < rows.length; i++) {
        rows[i].className = rows[i].className.replace(/\s*\bselected\b/g, "");
      }
    }

    for (var r = 0; r < rows.length; r++) {
      (function (row) {
        var idx = parseInt(row.getAttribute("data-index"), 10);
        var entry = entries[idx];
        row.onclick = function () {
          clearRowSel();
          row.className += " selected";
          var full = QFE.ui.joinPath(sel.path, entry.name);
          if (entry.isDir) {
            if (callbacks && callbacks.onNavigate) callbacks.onNavigate(full);
          } else {
            if (callbacks && callbacks.onOpen) callbacks.onOpen(entry, full);
          }
        };
      })(rows[r]);
    }
  }

  return {
    render: render,
    kindFor: kindFor
  };
})();
