/*
 * ftp.js - thin JS layer over the curl .bat wrappers.
 *
 *   buildUrl(sc, remotePath, trailingSlash)    ftp://host:port/path[/]
 *   listDir(sc, remotePath, onDone)            onDone(err, rawListingText)
 *   download(sc, remotePath, localPath, onDone) onDone(err)
 *   openExternally(localPath)                  start "" "<localPath>" via open.bat
 *
 * All ops are non-blocking: the .bat runs hidden, JS polls for the .done marker.
 * ES5 for the IE11 engine.
 */

var QFE = QFE || {};

QFE.ftp = (function () {

  function buildUrl(sc, remotePath, trailingSlash) {
    var p = String(remotePath == null ? "" : remotePath);
    // Strip a leading slash; we add one unconditionally below.
    if (p.charAt(0) === "/") p = p.substring(1);
    // URL-encode each segment independently so spaces and accented chars in
    // filenames (e.g. "report with accents éàü.pdf") survive, while directory
    // separators stay literal.
    var segs = p === "" ? [] : p.split("/");
    for (var i = 0; i < segs.length; i++) segs[i] = encodeURIComponent(segs[i]);
    var url = "ftp://" + sc.host + ":" + sc.port + "/" + segs.join("/");
    if (trailingSlash && url.charAt(url.length - 1) !== "/") url += "/";
    return url;
  }

  function uniqueName(prefix, ext) {
    // Milliseconds + a random suffix to avoid collisions if clicked twice quickly.
    var r = Math.floor(Math.random() * 1e6);
    return prefix + "_" + (new Date().getTime()) + "_" + r + (ext ? ("." + ext) : "");
  }

  function listDir(sc, remotePath, onDone) {
    QFE.shell.ensureFolder(QFE.shell.absPath("config\\temp"));
    var outPath = QFE.shell.absPath("config\\temp\\" + uniqueName("list", "txt"));
    QFE.shell.deleteIfExists(outPath);
    QFE.shell.deleteIfExists(outPath + ".err");
    QFE.shell.deleteIfExists(outPath + ".done");

    var url = buildUrl(sc, remotePath, true);
    QFE.shell.runBat("scripts\\list.bat", [sc.username, sc.password, url, outPath]);
    QFE.shell.waitForDone(outPath, function (err, content, code) {
      var errText = QFE.shell.readText(outPath + ".err");
      QFE.shell.deleteIfExists(outPath);
      QFE.shell.deleteIfExists(outPath + ".err");
      if (err) { onDone(err, null); return; }
      if (code !== 0) {
        var msg = errText || ("curl exited with code " + code);
        onDone(new Error(msg.replace(/\s+$/, "")), null);
        return;
      }
      onDone(null, content);
    }, 65000);
  }

  function download(sc, remotePath, localPath, onDone) {
    QFE.shell.deleteIfExists(localPath);
    QFE.shell.deleteIfExists(localPath + ".err");
    QFE.shell.deleteIfExists(localPath + ".done");

    var url = buildUrl(sc, remotePath, false);
    QFE.shell.runBat("scripts\\download.bat", [sc.username, sc.password, url, localPath]);
    QFE.shell.waitForDoneMarker(localPath, function (err, code) {
      var errText = QFE.shell.readText(localPath + ".err");
      QFE.shell.deleteIfExists(localPath + ".err");
      if (err) { onDone(err); return; }
      if (code !== 0) {
        var msg = errText || ("curl exited with code " + code);
        onDone(new Error(msg.replace(/\s+$/, "")));
        return;
      }
      onDone(null);
    }, 610000);
  }

  function openExternally(localPath) {
    QFE.shell.runBat("scripts\\open.bat", [localPath]);
  }

  /*
   * parseListing - turn raw Unix-style `ls -l` output (what curl LIST returns)
   * into a list of {name, isDir, isLink, size, date}.
   *
   * Line shape:
   *   drwxr-xr-x 2 ftp ftp  4096 Apr 01 2026 folder name
   *   -rw-r--r-- 1 ftp ftp 12345 Apr 01 12:34 file with spaces.mp4
   *   lrwxrwxrwx 1 ftp ftp     7 Jan 01 2020 link -> target
   *
   * Columns 1..8 are fixed-token; the name begins at column 9 and may contain
   * spaces, so we consume eight whitespace tokens and take the rest as the name.
   * "total N" headers, ".", "..", and lines not starting with d/-/l are skipped.
   */
  function parseListing(text) {
    var out = [];
    if (text == null) return out;
    var lines = String(text).split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line) continue;
      if (/^total\s+\d+\s*$/.test(line)) continue;
      var ch = line.charAt(0);
      if (ch !== "d" && ch !== "-" && ch !== "l") continue;

      var parts = [];
      var rest = line;
      for (var j = 0; j < 8; j++) {
        var m = /^(\S+)\s+/.exec(rest);
        if (!m) break;
        parts.push(m[1]);
        rest = rest.substring(m[0].length);
      }
      if (parts.length < 8 || rest === "") continue;

      var name = rest;
      if (ch === "l") {
        var arrow = name.indexOf(" -> ");
        if (arrow >= 0) name = name.substring(0, arrow);
      }
      if (name === "." || name === "..") continue;

      var size = parseInt(parts[4], 10);
      if (isNaN(size)) size = 0;

      out.push({
        name: name,
        isDir: ch === "d",
        isLink: ch === "l",
        size: size,
        date: parts[5] + " " + parts[6] + " " + parts[7]
      });
    }
    return out;
  }

  return {
    buildUrl: buildUrl,
    listDir: listDir,
    download: download,
    openExternally: openExternally,
    parseListing: parseListing
  };
})();
