# Quick FTP Explorer — User Manual (English)

A zero-install Windows tool for browsing saved FTP-server shortcuts and opening
the files they contain. This manual covers everything a new user needs:
installation, the interface, daily use, troubleshooting, and advanced topics.

---

## 1. Overview

Quick FTP Explorer is a portable Windows application packaged as a single
HTML Application (`.hta`). It lets you:

- Save multiple FTP servers as named **shortcuts**.
- Browse each server's folder hierarchy in a two-panel File-Explorer-style
  layout.
- Open files directly &mdash; images preview in a built-in viewer with
  zoom/pan; everything else (video, PDF, audio, documents, archives) is
  downloaded to a temporary folder and handed to your default Windows app.
- Search shortcuts and filenames live.
- Create, edit, and delete shortcuts from the UI.

Everything is stored as plain files next to the app, so you can back up or
migrate your setup by copying the `config/` folder.

---

## 2. System requirements

- **Operating system:** Windows 10 version 1803 (April 2018) or newer, or
  Windows 11.
- **Disk space:** &lt; 200 KB for the app itself; temporary downloads are
  stored in `config/temp/` and wiped when you start or close the app.
- **No runtimes required:** the app relies on `mshta.exe` (HTML Application
  host) and `curl.exe` (FTP client), both of which ship with Windows
  out-of-the-box.
- **Network:** outbound TCP access to your FTP server(s) on the configured
  port (21 by default; any port is supported).

---

## 3. Installation

1. Obtain the `quick-ftp-explorer.zip` archive (built by `package.bat` or
   downloaded from the project).
2. Extract it to any folder you can write to (Desktop, Documents, a USB key,
   etc.). Do **not** install it under `C:\Program Files\` unless you plan to
   run it as administrator &mdash; it writes to its own `config/` folder.
3. Open the extracted folder and double-click **`quick-ftp-explorer.hta`**.

There is no installer, no registry entry, no service, and no shortcut
automatically created on your Desktop. To "uninstall", delete the folder.

**First-launch note:** on very new Windows installations Microsoft Edge may
ask whether to allow the HTA to run. Click **Allow** or **Run**. The app is
completely local &mdash; it never contacts any host except the FTP servers
you explicitly configure.

---

## 4. First run

When you launch the app for the first time:

1. The window opens with the top bar, two empty panels, and a footer that
   says `0 shortcuts`.
2. The file `config/data.csv` is created automatically with default host and
   port values. See [§11 Defaults](#11-defaults) to customise these.
3. Right-click inside the left panel and choose **New shortcut&hellip;** to
   add your first FTP server.

---

## 5. The interface

```
+------------------------------------------------------------------+
|  ● Quick FTP Explorer    [ Breadcrumb ]           [ Search... ]  |  <- top bar
+----------------+-+-----------------------------------------------+
| SHORTCUTS      | |                                               |
|                | |                                               |
|  ▸ srv-main    | |                                               |
|  ▾ srv-branch  |S|    Name          Type   Size     Modified     |
|    ▸ 2024      |p|    ▸ Archive     Folder ...                   |  <- panels
|    ▸ 2025      |l|    ▸ Live        Folder ...                   |
|  ▸ srv-office  |i|    ◌ photo.jpg   JPG    2.3 MB   2026-04-10   |
|                |t|    ◌ clip.mp4    MP4   12.8 MB   2026-04-08   |
|                | |                                               |
+----------------+-+-----------------------------------------------+
|  3 shortcuts                                 default 127.0.0.1:21|  <- status bar
+------------------------------------------------------------------+
```

### 5.1 Top bar

- **Brand** (left): the app name.
- **Breadcrumb** (centre): shows your current location. Segments are clickable
  &mdash; click any ancestor to jump back to it. The leaf (your current
  folder) is not clickable. When no shortcut is selected, the breadcrumb shows
  _Select a shortcut_.
- **Search** (right): live-filters both panels by substring, case-insensitive.
  See [§10 Searching](#10-searching).

### 5.2 Left panel &mdash; shortcuts and folder tree

Each shortcut appears as a root row with a small server icon and its label.
Clicking a shortcut row:

1. Fetches the root listing from the server.
2. Expands to show its folders.
3. Populates the right panel with the files at the root.

Clicking a folder row expands the tree one more level and shows that folder's
contents on the right. Clicking the small triangle (▸ / ▾) at the left of a
row toggles expansion **without** changing the current selection.

Only folders appear in the tree. Files always live in the right panel.

The left panel is **resizable** &mdash; drag the vertical bar between the two
panels.

### 5.3 Right panel &mdash; file list

The right panel shows a table with:

- **Name** &mdash; with a small icon hinting at the kind (folder, image,
  video, audio, document, generic file).
- **Type** &mdash; "Folder" for folders, otherwise the uppercase extension
  (e.g. `MP4`, `JPG`).
- **Size** &mdash; formatted as B / KB / MB / GB. Empty for folders.
- **Modified** &mdash; the date reported by the server (format depends on
  the server, typically `MMM DD YYYY` or `MMM DD HH:MM` for very recent
  files).

Folders are always listed first, sorted alphabetically; files follow, also
sorted alphabetically.

Clicking a row:
- **Folder** &mdash; navigates into it; the tree expands and the right panel
  updates.
- **File** &mdash; downloads and opens it (see [§9 Opening files](#9-opening-files)).

### 5.4 Status bar

Two pieces of information:

- **Left:** the number of shortcuts saved.
- **Right:** the current default host and port (what `New shortcut&hellip;`
  will prefill).

---

## 6. Creating a shortcut

There are two ways to add a shortcut.

### 6.1 Via the user interface (recommended)

1. **Right-click** anywhere in the left panel.
2. In the context menu that appears, click **New shortcut&hellip;**.
3. Fill the modal dialog:
   - **Username:** the FTP account name. _Required._
   - **Custom label text:** a free-form description appended to the label
     (e.g. `Main office NVR`). Optional.
   - **Host:** the FTP server's address (IP or hostname). Prefilled from
     `config/data.csv`.
   - **Port:** FTP port. Prefilled from `config/data.csv` (21 by default).
   - **Password:** automatically mirrors the username until you edit it
     manually. Matches the common convention where the password equals the
     username; change it if your server uses different credentials.
   - **Label preview:** live preview of the final label, formed as
     `<username> <custom text>` (or just `<username>` if the custom text is
     empty).
4. Click **Save**.

The new shortcut appears in the left panel, sorted alphabetically by label.

The file `config/shortcuts/<username>.json` is written on save; it contains
the label, host, port, username, and password as plain JSON. See
[§13 Files and folders reference](#13-files-and-folders-reference).

### 6.2 By creating the JSON file manually

If you need to create many shortcuts programmatically, you can drop JSON
files directly into `config/shortcuts/`. Each file has this shape:

```json
{
  "label": "main-nvr Main office NVR",
  "host": "192.0.2.10",
  "port": 21,
  "username": "main-nvr",
  "password": "main-nvr"
}
```

The filename must be `<sanitized-username>.json` where sanitized means
alphanumerics plus `.`, `_`, `-`. Other characters are replaced with `_`.

The app picks up new files on its next launch or on any operation that
re-reads the shortcuts list.

---

## 7. Deleting a shortcut

1. **Right-click** the shortcut's root row in the left panel.
2. Click **Delete shortcut**.
3. Confirm the dialog.

The corresponding file in `config/shortcuts/` is deleted. If that shortcut
was currently selected, the right panel clears.

You can also delete a shortcut by manually removing its JSON file from
`config/shortcuts/`, then relaunching the app.

---

## 8. Browsing an FTP server

After clicking a shortcut:

1. A spinner appears in the bottom-right while the root listing is fetched.
2. The shortcut expands to show its folders.
3. The right panel populates with the root's contents.

Each folder you click does the same: fetch, expand, display. Results are
cached in memory for the session, so returning to a folder is instant.
If a listing fails (network error, wrong credentials, server timeout), an
inline red error appears under the node; clicking the node again retries.

To leave a folder:

- **Click an ancestor** in the breadcrumb at the top.
- **Click any folder** in the left tree at any level.
- **Click the triangle** next to a folder in the tree to collapse it without
  navigating.

---

## 9. Opening files

Clicking a file row triggers a download-and-open flow.

### 9.1 Download

The file is streamed via `curl.exe` into `config/temp/` under a unique name
(a timestamp prefix avoids collisions). A spinner in the bottom-right
indicates the download is in progress; multiple concurrent downloads are
supported and the spinner stays until all finish.

### 9.2 Open

- **Images** (`.jpg`, `.jpeg`, `.png`, `.gif`, `.bmp`, `.webp`) open in the
  built-in modal viewer. See [§9.3](#93-in-app-image-viewer).
- **Everything else** (`.mp4`, `.webm`, `.mov`, `.mkv`, `.avi`, `.mp3`,
  `.wav`, `.pdf`, `.docx`, `.zip`, &hellip;) is opened with the Windows
  default application using `start ""`. Your default video player, PDF
  reader, etc. takes over.

### 9.3 In-app image viewer

A dark modal overlay fills the window. Controls in the header:

- **Fit** &mdash; scale the image to fit the viewport (default).
- **100%** &mdash; pixel-perfect, original size.
- **&minus; / +** &mdash; step zoom out / in by 1.25&times;.
- **Open externally** &mdash; launch the same file in your default image
  viewer (useful for printing or further editing).
- **Close (Esc)** &mdash; dismiss the modal. `Esc` key works the same.

Interactions:

- **Mouse wheel** &mdash; zoom in/out.
- **Click and drag** &mdash; pan the image when it overflows the viewport.
- **Click outside the image area** &mdash; dismiss the modal.

### 9.4 Temp folder lifecycle

Downloaded files live in `config/temp/` until one of the following happens:

- The app is launched (all non-dotfile contents of `config/temp/` are wiped).
- The app is closed (same sweep, best-effort).
- A file is held open by an external viewer at close time &mdash; it will be
  wiped on the next launch.

You do not need to clean `config/temp/` manually.

---

## 10. Searching

Start typing in the **Search** field in the top bar. The query is applied
live (no need to press Enter), lowercased, and matched as a substring:

- In the **left panel**, only shortcuts whose **label** contains the query
  are shown. If nothing matches, a _No shortcuts match_ hint appears.
- In the **right panel**, only entries (folders and files) at the currently
  open folder whose **name** contains the query are shown. If nothing
  matches, the panel shows _No entries match_.

The search does not change the tree expansion state; clearing the field
restores everything instantly.

Search is purely local &mdash; it does not recursively fetch remote
folders. To search a sub-folder, open it first, then type.

---

## 11. Defaults

`config/data.csv` stores app-wide defaults used by the **New shortcut&hellip;**
dialog:

```
key,value
default_host,127.0.0.1
default_port,21
```

Open it with any text editor (Notepad is fine). Changes take effect on the
next new-shortcut action &mdash; no reload required. Other keys are ignored
but preserved, so you can add notes for yourself.

If the file does not exist on startup, it is created automatically with
fallback values.

---

## 12. Keyboard shortcuts

| Context | Keys | Action |
|---|---|---|
| Modal (any) | `Esc` | Close the modal |
| Context menu | `Esc` | Dismiss the menu |
| Image viewer | `Esc` | Close the viewer |
| Search box | standard text editing keys | Edit the query live |
| Anywhere | `Alt+F4` | Quit the application (standard Windows) |

---

## 13. Files and folders reference

```
quick-ftp-explorer/
├── quick-ftp-explorer.hta     Entry point. Double-click to run.
├── ui/
│   ├── styles.css             Visual styling.
│   └── js/
│       ├── shell.js           .hta <-> .bat bridge + filesystem helpers.
│       ├── config.js          data.csv + shortcuts persistence.
│       ├── ftp.js             Listing / download / URL-building.
│       ├── ui.js              Left tree + right file table.
│       ├── viewer.js          In-app image viewer.
│       └── app.js             Orchestration / event wiring.
├── scripts/
│   ├── list.bat               curl LIST  -> output file.
│   ├── download.bat           curl RETR  -> output file.
│   └── open.bat               start "" "<local path>".
├── config/
│   ├── data.csv               Editable defaults (host, port, ...).
│   ├── shortcuts/             One <username>.json per shortcut.
│   └── temp/                  Transient downloads. Wiped on start + exit.
├── docs/
│   ├── architecture.md        Developer-facing design notes.
│   ├── user-manual.en.md      This file.
│   └── user-manual.fr.md      French translation.
├── package.bat                Builds dist/quick-ftp-explorer.zip.
├── README.md
└── LICENSE
```

**What you can edit safely:**

- `config/data.csv` &mdash; change defaults at will.
- `config/shortcuts/*.json` &mdash; hand-edit to tweak labels, hosts, credentials.
- `config/temp/` &mdash; safe to delete the contents at any time.

**What you should not touch unless you are developing:**

- `ui/*`, `scripts/*`, the `.hta` file itself.

---

## 14. Troubleshooting

### 14.1 The HTA does not open when I double-click it

- Confirm your Windows version is at least 10.0.17134 (build 1803). Older
  builds may lack `curl.exe` or modern `mshta.exe` behaviour.
- Right-click the `.hta` file, **Properties**, and check **Unblock** if
  present (Windows blocks files downloaded from the internet until
  unblocked).
- Some corporate policies disable `mshta.exe`. If your organisation
  restricts scripting, ask your IT team.

### 14.2 "Failed to connect" / "curl exited with code 7"

The FTP server is unreachable.

- Verify the host and port in the shortcut JSON or the **New shortcut**
  dialog.
- Check your internet connection.
- Check Windows Firewall and any VPN that might block outbound FTP (TCP
  port 21 or whatever port the server uses).

### 14.3 "curl exited with code 67" or "530 Login incorrect"

Wrong username or password.

- Confirm credentials with the server operator.
- Note that by default the app sets `password = username`; if your server
  requires a different password, edit the shortcut JSON or re-create the
  shortcut.

### 14.4 Labels show as garbled characters (é&rarr;Ã©)

The app uses UTF-8 for all file I/O. If you see mojibake, the shortcut JSON
was written by a tool that used a different encoding. Re-create the
shortcut from the UI (the modal always writes UTF-8) or re-save the JSON
file in UTF-8 using a tool like Notepad++.

### 14.5 A file fails to open externally

- Make sure you have a default Windows app associated with the file's
  extension (right-click a local file of the same type &rarr; **Open with**
  &rarr; **Always use this app**).
- The downloaded file still lives in `config/temp/` &mdash; you can open
  it manually from there until the next app launch wipes it.

### 14.6 The app is slow to list a large directory

The slow step is the remote server, not the app. You can:

- Switch to a smaller sub-folder.
- Cache will remember the listing for the session once loaded.

### 14.7 An image or video file is left in `config/temp/` after I close the app

If an external viewer was still holding the file open when you quit, the
sweep could not delete it. Launch the app again &mdash; the startup sweep
picks it up. Or delete the contents of `config/temp/` manually at any
time.

### 14.8 I deleted a shortcut by mistake

Shortcut files are removed from `config/shortcuts/`. Restore them from any
backup you may have; otherwise, recreate via **New shortcut&hellip;**.

---

## 15. Privacy and data handling

- **Local only.** The app makes no outbound connections except to the FTP
  servers you configure. It does not phone home, check for updates, or send
  telemetry.
- **Credentials are stored in plain JSON** in `config/shortcuts/`. They are
  readable by anyone with filesystem access to your machine. Protect the
  folder with Windows file-system permissions if that matters to you.
- **Temp files** contain full copies of whatever you open. They are wiped
  on app start and exit. If you open sensitive content and your machine is
  shared, close the app immediately after viewing.
- **Shortcut labels** may appear in the window title and taskbar; be mindful
  of sensitive information in labels.

---

## 16. Backup and migration

To back up your configuration, copy the **`config/`** folder. To restore,
replace the `config/` folder on another installation with your backup.

To move the app to another machine, copy the whole folder. There are no
registry entries or user-profile files to worry about.

---

## 17. Uninstall

Close the app, then delete the folder. Nothing else to do.

If you configured a file association or created a Desktop shortcut manually,
remove those yourself.

---

## 18. Advanced topics

### 18.1 Command-line usage

The app is a GUI tool; there is no CLI. However, the underlying `.bat`
scripts in `scripts/` can be invoked directly for scripting:

```
scripts\list.bat     <user> <pass> <ftp-url-with-trailing-slash> <output-file>
scripts\download.bat <user> <pass> <ftp-url>                    <output-file>
scripts\open.bat     <local-path>
```

Each script writes stderr to `<output-file>.err` and the exit code to
`<output-file>.done` as the very last step &mdash; handy for polling from
other scripts.

### 18.2 Running test HTAs

Developers can validate the config layer, FTP round-trip, and listing parser
with the HTAs under `tests/`. Each is double-clickable. See
[`docs/architecture.md`](architecture.md) for details.

### 18.3 Packaging your own zip

Run `package.bat` from the project root. It stages a clean copy of the app
(no `.git`, no `tests/`, no user shortcuts, no temp files) and zips it to
`dist/quick-ftp-explorer.zip`.

---

## 19. FAQ

**Q: Does it support FTPS or SFTP?**
A: No. Plain FTP only. This was a deliberate simplification &mdash; the
goal was a zero-dependency app, and the built-in Windows `curl.exe` is the
only FTP client we use.

**Q: Can I upload files or rename remote files?**
A: No. The app is read-only with respect to the remote server.

**Q: Why does it use an HTA? HTAs are legacy.**
A: To make the install "unzip and double-click". Every Windows 10/11
machine already has `mshta.exe` and `curl.exe`, so there is no runtime,
no compilation, and no external dependency. The tradeoff is that the UI
runs on the legacy IE11 rendering engine.

**Q: Does it work on macOS or Linux?**
A: No. Windows-only by design.

**Q: Why are there no icons on some files?**
A: The built-in IE11 engine may not render certain emoji glyphs. Behaviour
is intact; only the icon is affected.

**Q: Can I password-protect the app itself?**
A: Not built-in. Use Windows file-system permissions to restrict access to
the `config/shortcuts/` folder.

---

## 20. Getting help

Open an issue on the project's repository, or read the developer notes in
[`docs/architecture.md`](architecture.md) for a deeper understanding of the
internals.
