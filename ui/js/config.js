/*
 * config.js - persistence layer.
 *
 *   readDefaults()        {default_host, default_port, ...} from config/data.csv
 *   listShortcuts()       array of {id, label, host, port, username, password}
 *   saveShortcut(obj)     writes config/shortcuts/<sanitized-username>.json
 *   deleteShortcut(id)    removes that file
 *   parseCsv(text)        small CSV reader (quoted-field aware)
 *
 * data.csv format (key,value pairs; header row required):
 *   key,value
 *   default_host,127.0.0.1
 *   default_port,21
 *
 * Shortcut file format (one JSON per shortcut):
 *   { label, host, port, username, password }
 *
 * Written in ES5 for the IE11 engine.
 */

var QFE = QFE || {};

QFE.config = (function () {
  var DATA_CSV = QFE.shell.absPath("config\\data.csv");
  var CONFIG_DIR = QFE.shell.absPath("config");
  var SHORTCUTS_DIR = QFE.shell.absPath("config\\shortcuts");

  // Placeholder values written to config/data.csv on first launch. Edit
  // config/data.csv directly to change them; this fallback is intentionally
  // generic so the repository ships no environment-specific data.
  var DEFAULT_DEFAULTS = {
    default_host: "127.0.0.1",
    default_port: "21"
  };

  function seedDefaultsIfMissing() {
    QFE.shell.ensureFolder(CONFIG_DIR);
    if (QFE.shell.fileExists(DATA_CSV)) return;
    var lines = ["key,value"];
    for (var k in DEFAULT_DEFAULTS) {
      if (DEFAULT_DEFAULTS.hasOwnProperty(k)) {
        lines.push(k + "," + DEFAULT_DEFAULTS[k]);
      }
    }
    QFE.shell.writeText(DATA_CSV, lines.join("\n") + "\n");
  }

  // Minimal CSV parser. Handles quoted fields with "" escapes. No embedded newlines.
  function parseCsv(text) {
    var rows = [];
    var lines = text.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line === "") continue;
      var cols = [];
      var cur = "";
      var inQuotes = false;
      for (var j = 0; j < line.length; j++) {
        var ch = line.charAt(j);
        if (inQuotes) {
          if (ch === '"') {
            if (j + 1 < line.length && line.charAt(j + 1) === '"') { cur += '"'; j++; }
            else inQuotes = false;
          } else {
            cur += ch;
          }
        } else {
          if (ch === '"') inQuotes = true;
          else if (ch === ",") { cols.push(cur); cur = ""; }
          else cur += ch;
        }
      }
      cols.push(cur);
      rows.push(cols);
    }
    return rows;
  }

  function readDefaults() {
    seedDefaultsIfMissing();
    var rows = parseCsv(QFE.shell.readText(DATA_CSV));
    var out = {};
    for (var i = 0; i < rows.length; i++) {
      if (i === 0 && rows[i][0] === "key") continue;
      if (rows[i].length >= 2) out[rows[i][0]] = rows[i][1];
    }
    if (!out.default_host) out.default_host = DEFAULT_DEFAULTS.default_host;
    out.default_port = parseInt(out.default_port || DEFAULT_DEFAULTS.default_port, 10);
    return out;
  }

  function sanitizeId(s) {
    return String(s).replace(/[^A-Za-z0-9._-]/g, "_");
  }

  function shortcutPath(id) {
    return SHORTCUTS_DIR + "\\" + sanitizeId(id) + ".json";
  }

  function listShortcuts() {
    QFE.shell.ensureFolder(SHORTCUTS_DIR);
    var names = QFE.shell.listFiles(SHORTCUTS_DIR, /\.json$/i);
    var out = [];
    for (var i = 0; i < names.length; i++) {
      var path = SHORTCUTS_DIR + "\\" + names[i];
      try {
        var obj = JSON.parse(QFE.shell.readText(path));
        obj.id = names[i].replace(/\.json$/i, "");
        out.push(obj);
      } catch (e) { /* skip malformed */ }
    }
    out.sort(function (a, b) {
      var la = (a.label || "").toLowerCase();
      var lb = (b.label || "").toLowerCase();
      return la < lb ? -1 : la > lb ? 1 : 0;
    });
    return out;
  }

  function saveShortcut(sc) {
    QFE.shell.ensureFolder(SHORTCUTS_DIR);
    var id = sanitizeId(sc.username);
    var obj = {
      label: sc.label,
      host: sc.host,
      port: parseInt(sc.port, 10) || 21,
      username: sc.username,
      password: sc.password
    };
    QFE.shell.writeText(shortcutPath(id), JSON.stringify(obj, null, 2));
    return id;
  }

  function deleteShortcut(id) {
    QFE.shell.deleteIfExists(shortcutPath(id));
  }

  return {
    readDefaults: readDefaults,
    listShortcuts: listShortcuts,
    saveShortcut: saveShortcut,
    deleteShortcut: deleteShortcut,
    seedDefaultsIfMissing: seedDefaultsIfMissing,
    parseCsv: parseCsv,
    sanitizeId: sanitizeId
  };
})();
