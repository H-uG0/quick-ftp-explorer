# Quick FTP Explorer &mdash; legacy HTA (Windows)

> **Maintenance mode.** This is the original zero-install Windows version,
> kept for machines that still allow `mshta.exe`. Many corporate security
> policies (AppLocker, WDAC, Defender attack-surface-reduction rules) block
> it, which is why the project is moving to a small self-hosted web app
> &mdash; see the [repository README](../README.md). New features land in the
> web app only. Both versions store shortcuts in the same JSON format, so the
> files in `config/shortcuts/` can be carried over.

A tiny zero-install Windows app that lets you browse saved FTP-server shortcuts
and open files (video / image / PDF / audio) with as little friction as
possible. Unzip the folder, double-click the `.hta` &mdash; that's the whole
install.

## Features

- **Zero install.** No Python, no Node, no .NET. Built entirely on Windows
  components (`mshta.exe` + `curl.exe`) that ship with Windows 10 (build 1803,
  April 2018) and later.
- **Two-panel File-Explorer layout** with a draggable splitter, breadcrumb
  navigation, and a live search bar that filters both the shortcut tree (by
  label) and the currently open folder (by entry name).
- **Per-shortcut browsing** with recursive folder expand/collapse in the left
  pane and a name / type / size / modified file table in the right pane.
- **Frictionless file opening.** Click an image row and it streams into an
  in-app viewer (zoom / pan). Every other file type &mdash; videos, PDFs,
  audio, archives, anything else &mdash; downloads to `config/temp/` and
  opens with the OS default app. `config/temp/` is wiped on app start and
  exit, so nothing piles up on disk.
- **Right-click shortcut management.** Right-click in the left pane to
  create, **edit** (same modal, prefilled; rename = safe delete-and-recreate),
  or delete a shortcut. New-shortcut modal is prefilled with
  `config/data.csv` defaults and auto-mirrors password = username.

## Install

1. Run `package.bat` from this `legacy/` folder of a clone; it builds
   `legacy/dist/quick-ftp-explorer.zip`.
2. Unzip anywhere.
3. Double-click `quick-ftp-explorer.hta`.

You can also run it straight from a clone: double-click
`legacy/quick-ftp-explorer.hta`.

**Requirements:** Windows 10 build 1803 or newer. `mshta.exe` and `curl.exe`
are built in.

## Folder layout

```
legacy/
├── quick-ftp-explorer.hta   <- entry point; double-click to launch
├── ui/
│   ├── styles.css
│   └── js/
│       ├── shell.js          .hta <-> .bat bridge + FSO helpers
│       ├── config.js         data.csv + shortcuts CRUD (UTF-8)
│       ├── ftp.js            list / download / URL-build / listing parse
│       ├── ui.js             left tree + right file table
│       ├── viewer.js         in-app image + video modal
│       └── app.js            orchestration
├── scripts/
│   ├── list.bat              curl LIST -> output file
│   ├── download.bat          curl RETR -> output file
│   └── open.bat              start "" "<path>"
├── config/
│   ├── data.csv              editable defaults (default_host, default_port)
│   ├── shortcuts/            one <sanitized-username>.json per shortcut
│   └── temp/                 transient downloads (wiped on start + exit)
├── tests/                    test HTAs + fixtures (not shipped in the zip)
├── docs/                     architecture notes + EN/FR user manuals
├── package.bat               builds dist/quick-ftp-explorer.zip
└── README.md
```

The `LICENSE` file is at the repository root; `package.bat` bundles it.

## Defaults (`config/data.csv`)

Plain CSV, hand-editable. Auto-created on first launch with placeholder
values, then yours to edit:

```csv
key,value
default_host,127.0.0.1
default_port,21
```

Any edits take effect on the next action &mdash; no reload required. Unknown
keys are preserved for your use. `config/data.csv` is gitignored so your
environment-specific values never end up in source control.

## Shortcut files (`config/shortcuts/*.json`)

One JSON per shortcut. The filename is the sanitized username, which is also
what the app uses to address the shortcut internally:

```json
{
  "label": "main-nvr Main office NVR",
  "host": "192.0.2.10",
  "port": 21,
  "username": "main-nvr",
  "password": "main-nvr"
}
```

`config/shortcuts/` is gitignored &mdash; shortcut files may contain
credentials, so they must not be committed.

## Tests

All test HTAs run in the same IE11 engine the app uses at runtime.

- [`tests/test-config.hta`](tests/test-config.hta) &mdash; CRUD + CSV-parser
  assertions for the config layer.
- [`tests/test-parser.hta`](tests/test-parser.hta) &mdash; fixture-driven
  assertions on `QFE.ftp.parseListing`. Auto-runs on open.
- [`tests/test-ftp.hta`](tests/test-ftp.hta) &mdash; manual smoke test: pick a
  saved shortcut, list a path, or download the first file it returns.

The parser is a pure function, so you can also run it from plain Node (from
this `legacy/` folder):

```
node -e "const fs=require('fs'); const ns={};
  (new Function('QFE', fs.readFileSync('ui/js/ftp.js','utf-8')))(ns);
  console.log(ns.ftp.parseListing(fs.readFileSync('tests/fixtures/listing-unix.txt','utf-8')));"
```

## Build / package

Run `package.bat` from this folder. It stages a clean copy of the app
(without `.git`, `tests/`, user shortcuts, or temp files), zips it with
Windows' built-in `tar.exe` (PowerShell `Compress-Archive` fallback), and
drops the result at `legacy/dist/quick-ftp-explorer.zip`.

## User manuals

Thorough step-by-step documentation for end users, in two languages:

- English: [`docs/user-manual.en.md`](docs/user-manual.en.md)
- Français : [`docs/user-manual.fr.md`](docs/user-manual.fr.md)

## Development notes

See [`docs/architecture.md`](docs/architecture.md) for the details, especially
the `.bat` bridge contract (`runBat` / `waitForDone`) and the UTF-8 I/O
strategy (ADODB.Stream with BOM stripping &mdash; required because the default
FSO is ASCII-or-UTF-16 and labels / filenames routinely contain accented
characters).
