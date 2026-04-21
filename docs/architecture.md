# Architecture

## Why HTA + .bat

Every Windows 10 (&ge; 1803) and 11 machine ships with `mshta.exe` and
`curl.exe`. An HTML Application (`.hta`) is HTML + JS rendered by `mshta.exe`
with full access to the filesystem and shell via `Scripting.FileSystemObject`
and `WScript.Shell`. Pair that with `curl.exe` (which speaks FTP) and the full
stack is already on the target machine &mdash; no Python, no Node, no .NET, no
compile step.

Install becomes "unzip + double-click", which was the hard requirement.

The tradeoff is that HTAs use the legacy Trident (IE11) rendering engine, so
the UI code is ES5 + flexbox (no Grid, no ES6 arrow fns, no Promises) with
HTML5 `<video>` / `<img>` for media.

## Layers

```
+--------------------------------------------------------+
| quick-ftp-explorer.hta    UI shell, loads JS below     |
+--------------------------------------------------------+
| ui/js/app.js              orchestration + event wiring |
| ui/js/ui.js               left tree + right file table |
| ui/js/viewer.js           image + video modal          |
+--------------------------------------------------------+
| ui/js/config.js           data.csv + shortcuts CRUD    |
| ui/js/ftp.js              FTP ops + LIST parser        |
+--------------------------------------------------------+
| ui/js/shell.js            .bat bridge + FSO helpers    |
+--------------------------------------------------------+
| scripts/list.bat          curl LIST                    |
| scripts/download.bat      curl RETR                    |
| scripts/open.bat          start "" "<path>"            |
+--------------------------------------------------------+
```

## .bat bridge contract

Every `.bat` takes an output path as its last argument. On completion, it
writes stdout to that path (or, for `download.bat`, the output path IS the
downloaded file) and then touches `<output>.done` containing the exit code as
the very last step. JS fires the `.bat` hidden and non-blocking, then polls
for the marker.

```
.hta / JS                                      scripts/*.bat
----------                                     -------------
QFE.shell.runBat("scripts\\list.bat", args) -> cmd /c ""scripts\list.bat" ...
QFE.shell.waitForDoneMarker(out, cb, ms)       (reads stdin, runs curl)
    polls <out>.done                           writes output -> <out>
                                               writes stderr -> <out>.err
                                               writes exit   -> <out>.done
```

This avoids freezing the UI thread, which would otherwise happen with a
synchronous `WScript.Shell.Exec().StdOut.ReadAll()`. See `ui/js/shell.js`.

## UTF-8 I/O

FSO's native `OpenTextFile` is ASCII-or-UTF-16 only. Shortcut labels and
filenames commonly contain accented characters (`é`, `à`, `ü`, `ô`, `ç`, ...),
so `QFE.shell.readText` / `writeText` go through ADODB.Stream with
`Charset="utf-8"`. Writes go through an extra binary copy step that skips the
BOM so consumers see pure UTF-8; reads strip a leading BOM defensively.

## Project root resolution

`getAppDir()` walks up from the location of the running HTA until it finds
the `scripts/` + `ui/` pair that only the project root has (at most four
hops). This means the main HTA (at the root) resolves on hop 0 and test HTAs
in `tests/` resolve on hop 1; both agree on the same project root, so
`absPath("tests/fixtures/...")` always lands in the same place.

## Persistence

`config/data.csv` holds editable app-wide defaults as `key,value` rows with a
header. `readDefaults()` re-reads per call, so user edits take effect on the
next action.

`config/shortcuts/<sanitized-username>.json` holds one shortcut per file. One
file per shortcut means creating, deleting, or hand-editing has no coupling
to the others.

Both `config/data.csv` and `config/shortcuts/*` are gitignored &mdash; they
may contain environment-specific or credential data, and must not be
committed. `DEFAULT_DEFAULTS` in `ui/js/config.js` is intentionally generic
(`127.0.0.1:21`) so the repository carries no deployment data.

## FTP layer

`ui/js/ftp.js` exposes:

- `buildUrl(sc, path, trailingSlash)` &mdash; splits the remote path into
  segments and `encodeURIComponent`s each one so spaces and accents in
  filenames survive without corrupting the slash structure.
- `listDir(sc, remotePath, cb)` &mdash; LIST + parse.
- `download(sc, remotePath, localPath, cb)` &mdash; RETR into a local file.
  Uses `waitForDoneMarker` (not `waitForDone`) so we don't reread the binary
  file as UTF-8 text.
- `openExternally(localPath)` &mdash; `open.bat` -> `start "" "<path>"`.
- `parseListing(text)` &mdash; pure function: Unix `ls -l` -> records of
  `{ name, isDir, isLink, size, date }`. Handles `total N` headers, `.` / `..`
  entries, filenames with spaces, and symlinks.

Credentials are passed to curl via `-u user:pass`. That leaks them to the
process command line for the lifetime of the curl invocation &mdash; acceptable
for a single-user local tool.

## Left-pane tree (`QFE.ui`)

The left pane is a folder tree, not a flat list. Shortcut rows are roots;
their children are folders discovered via `QFE.ftp.listDir`. Files are
intentionally excluded &mdash; they belong in the right pane.

State is keyed by `"<shortcutId>::<path>"`:

- `state.expanded[key] = true` &mdash; node is open.
- `state.cache[key] = { loading | entries+all | error }` &mdash; per-folder
  listing cache. `entries` is folders only (for the tree). `all` is the full
  parsed listing and is what the right pane consumes.
- `state.activeKey` &mdash; which node is selected.
- `state.filter` &mdash; lowercased substring used by `setFilter` to hide
  non-matching shortcut roots.

Re-expanding an already-loaded path is instant (no FTP round trip). A node
that errored out is retried on the next expand. Clicking a row selects it and
expands it; clicking only the toggle triangle collapses without changing the
selection.

## Right-pane file list (`QFE.files`)

`QFE.files.render(container, sel, callbacks, filter)` paints a name / type /
size / modified table from the parsed listing, folders first. Clicking a
folder row calls `callbacks.onNavigate(fullPath)`; clicking a file row calls
`callbacks.onOpen(entry, fullPath)`. The search filter hides non-matching
rows before the table is painted.

## File open + temp lifecycle

When the user clicks a file, `app.js` picks a unique path under
`config/temp/<ms>_<sanitized-name>`, runs `download.bat`, and &mdash; on
success &mdash; either opens the file in `QFE.viewer` (images only) or
hands it off with `scripts/open.bat` via `start ""`.

`config/temp/` is wiped by `QFE.shell.wipeFolder` on app load and on
`window.onbeforeunload`. Both sweeps are best-effort: files held open by an
external viewer will survive the first sweep attempt and be removed on the
next app launch, when the process that held the lock is gone.

## In-app viewer (`QFE.viewer`)

A dark modal overlay for images only. Fit / 100% / zoom-in / zoom-out
buttons, mouse-wheel zoom, and drag-to-pan. Esc closes. An "Open externally"
button lets the user hand the same file off to their system image viewer
without re-downloading.

Every other kind &mdash; videos included &mdash; bypasses the viewer and
goes straight through `QFE.ftp.openExternally`, which is a plain
`start "" "<local-path>"` so the user's default app handles playback /
rendering.

## Context menu + new/edit-shortcut modal

Right-click anywhere in the left pane shows a floating menu clamped to the
viewport. "New shortcut" is always available; "Edit shortcut" and
"Delete shortcut" are enabled only when the right-clicked target is a
shortcut root row.

The same modal serves both New and Edit, dispatched on the `editingId`
state variable (`null` = New, otherwise the id of the shortcut being
edited). On submit, the handler:

1. Validates `username` and `host`.
2. If `editingId` is set and the sanitized new username differs from
   `editingId`, deletes the old JSON file first &mdash; a rename is a
   clean delete-then-save so no stale file survives.
3. Writes the new JSON.
4. If the rename invalidated the current selection, clears it; otherwise
   the tree preserves its expand state via `QFE.ui.setShortcuts`.

The modal prefills host/port from `config/data.csv` for New, and from the
shortcut's own values for Edit. Password auto-mirrors the username field
only in New-shortcut mode; in Edit mode, `_touched` is set true so the
original password is never silently overwritten.
