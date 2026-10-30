/*
 * shell.js - the HTA <-> .bat bridge and filesystem helpers.
 *
 *   runBat(scriptRelPath, args)          fire a .bat, non-blocking
 *   waitForDone(outputPath, cb, timeout) poll for <outputPath>.done marker
 *   readText / writeText                 UTF-8 via ADODB.Stream
 *   listFiles(folder, regex?)            enumerate files (IE11 Enumerator)
 *   ensureFolder(path)                   recursive mkdir
 *
 * Convention: every .bat takes an output path as its last argument. It writes
 * stdout to that path and then touches "<output>.done" as the very last step.
 * JS fires the .bat hidden + non-blocking, then polls for the marker.
 *
 * Written in ES5 because HTA runs on the legacy Trident (IE11) engine.
 */

var QFE = QFE || {};

QFE.shell = (function () {
  var wshell = new ActiveXObject("WScript.Shell");
  var fso = new ActiveXObject("Scripting.FileSystemObject");

  function getAppDir() {
    var href = location.href;
    if (href.indexOf("file:///") === 0) {
      href = href.substring(8);
    } else if (href.indexOf("file://") === 0) {
      href = href.substring(7);
    }
    href = unescape(href).replace(/\//g, "\\");
    var idx = href.lastIndexOf("\\");
    var dir = idx > 0 ? href.substring(0, idx) : href;
    // Walk up to the project root so test HTAs in tests/ resolve paths the same
    // way the main HTA does. The "scripts" folder is the unambiguous root marker.
    var probe = dir;
    for (var hops = 0; hops < 4; hops++) {
      if (fso.FolderExists(probe + "\\scripts") && fso.FolderExists(probe + "\\ui")) {
        return probe;
      }
      var up = probe.lastIndexOf("\\");
      if (up <= 0) break;
      probe = probe.substring(0, up);
    }
    return dir;
  }

  var APP_DIR = getAppDir();

  function absPath(relPath) {
    return APP_DIR + "\\" + String(relPath).replace(/\//g, "\\");
  }

  function quote(arg) {
    return '"' + String(arg).replace(/"/g, '""') + '"';
  }

  function runBat(scriptRelPath, args) {
    var script = absPath(scriptRelPath);
    var parts = [];
    for (var i = 0; i < args.length; i++) parts.push(quote(args[i]));
    // Outer quotes around the cmd /c argument so cmd.exe preserves inner quoting.
    var cmd = 'cmd.exe /c ""' + script + '" ' + parts.join(" ") + '"';
    wshell.Run(cmd, 0, false);
  }

  function fileExists(path) { return fso.FileExists(path); }

  function readText(path) {
    if (!fso.FileExists(path)) return "";
    var stream = new ActiveXObject("ADODB.Stream");
    stream.Type = 2;            // adTypeText
    stream.Charset = "utf-8";
    stream.Open();
    stream.LoadFromFile(path);
    var text = stream.ReadText();
    stream.Close();
    // Strip BOM if present.
    if (text.length && text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
    return text;
  }

  function writeText(path, content) {
    var textStream = new ActiveXObject("ADODB.Stream");
    textStream.Type = 2;
    textStream.Charset = "utf-8";
    textStream.Open();
    textStream.WriteText(content);
    // Convert to binary and skip the UTF-8 BOM (3 bytes) so consumers see
    // pure UTF-8 without a BOM. Safer for CSVs and cross-tool interop.
    textStream.Position = 0;
    textStream.Type = 1;        // adTypeBinary
    textStream.Position = 3;
    var binStream = new ActiveXObject("ADODB.Stream");
    binStream.Type = 1;
    binStream.Mode = 3;         // adModeReadWrite
    binStream.Open();
    textStream.CopyTo(binStream);
    textStream.Close();
    binStream.SaveToFile(path, 2); // 2 = adSaveCreateOverWrite
    binStream.Close();
  }

  function deleteIfExists(path) {
    if (fso.FileExists(path)) {
      try { fso.DeleteFile(path, true); } catch (e) { /* ignore */ }
    }
  }

  function ensureFolder(path) {
    if (fso.FolderExists(path)) return;
    var parent = fso.GetParentFolderName(path);
    if (parent && !fso.FolderExists(parent)) ensureFolder(parent);
    fso.CreateFolder(path);
  }

  function listFiles(folderPath, filterRegex) {
    if (!fso.FolderExists(folderPath)) return [];
    var folder = fso.GetFolder(folderPath);
    var e = new Enumerator(folder.Files);
    var out = [];
    for (; !e.atEnd(); e.moveNext()) {
      var name = e.item().Name;
      if (!filterRegex || filterRegex.test(name)) out.push(name);
    }
    return out;
  }

  // Best-effort recursive wipe: deletes each file / subfolder individually and
  // swallows failures (external viewers may still hold a lock). Skips dotfiles
  // like .gitkeep so the folder survives a fresh clone.
  function wipeFolder(folderPath) {
    var deleted = 0, skipped = 0;
    if (!fso.FolderExists(folderPath)) {
      ensureFolder(folderPath);
      return { deleted: 0, skipped: 0 };
    }
    var folder = fso.GetFolder(folderPath);
    var files = new Enumerator(folder.Files);
    for (; !files.atEnd(); files.moveNext()) {
      var name = files.item().Name;
      if (name.charAt(0) === ".") continue;
      try { files.item().Delete(true); deleted++; } catch (e) { skipped++; }
    }
    var subs = new Enumerator(folder.SubFolders);
    for (; !subs.atEnd(); subs.moveNext()) {
      var sname = subs.item().Name;
      if (sname.charAt(0) === ".") continue;
      try { subs.item().Delete(true); deleted++; } catch (e) { skipped++; }
    }
    return { deleted: deleted, skipped: skipped };
  }

  function waitForDone(outputPath, onReady, timeoutMs) {
    // For text outputs (e.g. directory listings). Reads outputPath as UTF-8 on completion.
    waitForMarker(outputPath + ".done", timeoutMs, function (err, exitCode) {
      if (err) { onReady(err, "", exitCode); return; }
      var content = readText(outputPath);
      onReady(null, content, exitCode);
    });
  }

  function waitForDoneMarker(outputPath, onReady, timeoutMs) {
    // For binary outputs (e.g. downloads). Does not read outputPath; passes exit code.
    waitForMarker(outputPath + ".done", timeoutMs, onReady);
  }

  function waitForMarker(donePath, timeoutMs, onReady) {
    var elapsed = 0;
    var step = 100;
    var timer = setInterval(function () {
      if (fileExists(donePath)) {
        clearInterval(timer);
        var raw = readText(donePath);
        deleteIfExists(donePath);
        // .done file contains the exit code as a decimal integer.
        var code = parseInt((raw || "0").replace(/\s+/g, ""), 10);
        if (isNaN(code)) code = 0;
        onReady(null, code);
        return;
      }
      elapsed += step;
      if (timeoutMs && elapsed >= timeoutMs) {
        clearInterval(timer);
        onReady(new Error("Timed out after " + timeoutMs + "ms waiting for " + donePath), -1);
      }
    }, step);
  }

  return {
    appDir: function () { return APP_DIR; },
    absPath: absPath,
    runBat: runBat,
    waitForDone: waitForDone,
    waitForDoneMarker: waitForDoneMarker,
    fileExists: fileExists,
    readText: readText,
    writeText: writeText,
    deleteIfExists: deleteIfExists,
    ensureFolder: ensureFolder,
    listFiles: listFiles,
    wipeFolder: wipeFolder,
    fso: fso
  };
})();
