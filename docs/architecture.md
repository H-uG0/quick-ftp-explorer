# Architecture

Quick FTP Explorer is a small self-hosted web app. A browser cannot speak
FTP, so a Node.js server on the VPS is the gateway: it holds the accounts and
the shortcuts (including their FTP passwords), talks FTP to the servers, and
streams files to signed-in users over HTTPS.

```
browser ──HTTPS──> reverse proxy (TLS) ──HTTP──> Node app ──FTP──> FTP server
                                                    │
                                                    └── data/  accounts, shortcuts, secret, audit log
```

The original Windows HTA lives in [`legacy/`](../legacy/README.md) with its
own [architecture notes](../legacy/docs/architecture.md).

## Principles

- **Node.js built-ins** (`node:http`, `node:crypto`, `node:test`); no web
  framework. The only runtime dependency is
  [`basic-ftp`](https://github.com/patrickjuchli/basic-ftp) (MIT, no
  dependencies of its own), for the FTP protocol itself.
- **ffmpeg, when installed**, converts the camera clips browsers can't play
  (see [Playing videos](#playing-videos)). It is a program the server runs,
  not a library. The Docker image includes it; without it, those clips are
  download-only.
- **No build step.** The browser loads `public/` exactly as it is in the
  repository.
- **Secrets stay on the server.** Neither account passwords nor FTP
  passwords are ever sent to a browser.

## Server modules

| File | Role |
|---|---|
| `server/index.js` | Process entry point: config, HTTP server, keep-alive tuning, graceful shutdown. |
| `server/config.js` | Environment variables → validated, frozen config. |
| `server/routes.js` | The application: wires the stores and builds the route table. |
| `server/http.js` | The HTTP toolkit: dispatch, body readers, cookies, static files, security headers, request log. |
| `server/auth.js` | Accounts (`users.json`), scrypt hashing, session tokens, login throttling. |
| `server/store.js` | FTP shortcuts (`shortcuts/*.json`), validation, safe renames. |
| `server/ftp.js` | The FTP gateway: listings and file streaming over `basic-ftp`. |
| `server/video.js` | Makes videos playable: passes browser-ready MP4s through, converts the rest with ffmpeg. |
| `server/zip.js` | Writes a ZIP as it streams: stored entries, CRC-32 on the fly, a data descriptor per entry, no Zip64. |
| `public/js/filetypes.js` | What each file type is and whether it may render inline. Shared by server and browser. |
| `public/js/clips.js` | The camera and the recording time in a clip's name. Shared by server (ZIP entry times) and browser. |
| `server/audit.js` | Append-only audit trail (`audit.jsonl`). |
| `server/files.js` | Atomic writes (temp file + rename), JSON reads, JSON-stream splitting. |
| `server/cli.js` | Account administration and shortcut import from the server's shell. |

The browser side is described in [Browser UI](#browser-ui).

## Request pipeline

Every request goes through `createHandler` in `server/http.js`:

1. Security headers are set: a strict CSP (`default-src 'self'`,
   `frame-ancestors 'none'`, ...), `nosniff`, `Referrer-Policy: same-origin`,
   and HSTS when the request arrived over HTTPS.
2. The request target is parsed. Only origin-form targets (`/path?query`)
   are accepted; `*` and absolute URLs get a 400.
3. The session cookie is resolved to a user, or none.
4. Routes are matched by path, then method. `GET` routes also answer `HEAD`;
   a known path with an unsupported method gets a 405.
5. Writes (`POST`, `PUT`, `PATCH`, `DELETE`) must carry an `Origin` naming
   this host when they carry one at all, and writes under `/api/` must be
   `Content-Type: application/json`.
6. The route's auth level is enforced: `none`, `user` (401 when signed out)
   or `admin` (403 for other roles).
7. The handler runs. A returned value is sent as JSON; a thrown `HttpError`
   becomes `{ "error": "..." }` with its status; anything else is a logged
   500. A browser navigation (`GET` with `Accept: text/html`, for example a
   PDF opened in a new tab) gets the same message as a small, escaped HTML
   page instead of raw JSON. An error after the response started aborts
   the connection, so a client never mistakes a broken response for a
   complete one.
8. One log line per request goes to stdout: time, client IP, user, method,
   URL, status (`(aborted)` if the client left early) and duration.

Paths that match no route fall back to the static files, then 404.

## Static files

`loadStatic` reads `public/` into memory at boot, keyed by URL path, with a
content hash as ETag. No URL is ever turned into a filesystem path, so path
traversal is impossible by construction. Files are served with
`Cache-Control: no-cache`: browsers revalidate (cheap `304`s), so a redeploy
shows up immediately. HTML files are not served by path; `/` and `/login`
serve them through their routes, which apply the sign-in redirects.

In development, `npm run dev` restarts the server whenever a file under
`server/` or `public/` changes.

## Accounts

Accounts are personal and created by an administrator on the server:

```
npm run cli -- user add alice --admin      # or, in Docker:
docker compose exec app node server/cli.js user add alice --admin
```

`user passwd`, `user role`, `user remove` and `user list` complete the set.
Passwords are typed without echo (or piped as the first stdin line) and must
have at least 10 characters. Usernames are case-insensitive and stored in
lower case.

`data/users.json` (mode 0600):

```json
{ "users": { "alice": { "role": "admin", "hash": "scrypt$32768$8$1$<salt>$<key>" } } }
```

- **Roles:** `admin` manages shortcuts; `user` browses only.
- **Hashing:** scrypt, N = 32768, r = 8, p = 1, 16-byte salt, 32-byte key,
  compared with `timingSafeEqual`. Sign-in attempts for unknown usernames
  still run scrypt against a dummy hash, so timing does not reveal which
  accounts exist.
- **Hot reload:** the server re-reads the file whenever its mtime, size or
  inode changes, so CLI changes apply without a restart.

## Sessions

Signing in sets one cookie, `qfe_session`: `HttpOnly`, `SameSite=Lax`,
`Path=/`, `Max-Age` = `SESSION_TTL_HOURS` (12 by default), plus `Secure`
when the request arrived over HTTPS.

The token is stateless: `base64url(JSON {u, exp, v})` + `.` + an
HMAC-SHA256 of that payload. `v` is a fingerprint of the user's password
hash, and every request re-reads the account. So:

- removing an account or changing its password ends its sessions at once;
- a role change applies on the very next request;
- sessions survive restarts and redeploys (there is no session table).

Signing out clears the cookie. The HMAC key is `SESSION_SECRET` when set
(at least 32 characters), otherwise a random secret generated once into
`data/session.secret`. Changing it signs everybody out.

**HTTPS behind a proxy.** With `TRUST_PROXY=1`, the app trusts
`X-Forwarded-Proto` (to set `Secure` and HSTS) and takes the client IP from
the rightmost `X-Forwarded-For` entry, the only one a client cannot forge.
Without it, both headers are ignored. Only set it when the app port is
reachable solely through the proxy.

**Cross-site requests.** `SameSite=Lax` keeps the cookie off cross-site
`POST`s. On top of that, writes must come from this origin, and API writes
must be JSON, which a cross-site HTML form cannot send.

**Login throttling.** Ten failed attempts within 15 minutes block further
attempts for that client IP and for that username (even with the right
password) until the window passes. One limit stops a single client
guessing many accounts; the other stops many clients guessing one.

## Shortcuts

A shortcut is one FTP account to browse, in practice one client's site:
the interface calls them *sites* wherever users look (the pane, the admin
menu, the form, the server's errors), while the code, the API, the file
names and the i18n keys keep "shortcut". Shortcuts are shared by everyone
signed in, and only admins can change them. Each lives in
`data/shortcuts/<id>.json` (mode 0600), in **exactly the legacy HTA's
format**:

```json
{ "label": "main-nvr Main office NVR", "host": "192.0.2.10", "port": 21,
  "username": "main-nvr", "password": "main-nvr" }
```

The id is the username made file-safe (`sanitizeId`: anything outside
`[A-Za-z0-9._-]` becomes `_`), as in the HTA. Hand-edited files with a BOM
are read fine; unreadable files are skipped with a warning.

**Validation** (`validateShortcut`, 400 on failure):

- `username` and `host` are required; `port` defaults to 21 and must be
  1–65535; `label` defaults to the username.
- Hosts must look like a hostname or an IP address. With
  `FTP_ALLOWED_HOSTS` set, they must also be on that list.
- No field may contain control characters. A CR/LF in a username, password
  or path could otherwise smuggle extra commands into the FTP session.
- Passwords are kept exactly as typed. A blank password means
  "username" on create, as in the HTA, and "keep the stored one" on edit,
  **but only while host and port stay the same**. Changing either requires
  the password again; otherwise anyone able to edit a shortcut could point
  it at a server they control and collect the stored password at the next
  login.

**Changes the HTA made unsafely:**

- Creating a shortcut whose id exists is a 409, not a silent overwrite.
- A rename (the username changes, so the id does) writes the new file
  first and deletes the old one only afterwards, so a failed save never
  loses the shortcut. Renaming onto another shortcut is a 409.

### API

| Method + path | Role | Response |
|---|---|---|
| `GET /api/shortcuts` | user | `{ shortcuts: [{ id, label }] }`; admins also get `host`, `port`, `username` |
| `POST /api/shortcuts` | admin | 201 `{ id }` |
| `PUT /api/shortcuts/:id` | admin | `{ id }` (the new id after a rename) |
| `DELETE /api/shortcuts/:id` | admin | 204 |
| `GET /api/users` | admin | `{ users: [{ name, role }] }` |
| `POST /api/users` with `{ name, role, password }` | admin | `201 { name, role }`; 400 (name, password, role), 409 (exists) |
| `PUT /api/users/:name` with `{ role?, password? }` | admin | `{ name, role }`; 400 for your own admin role; a new password ends that account's sessions (yours gets a new cookie) |
| `DELETE /api/users/:name` | admin | 204; 400 for your own account |

`GET /api/me` returns `{ username, role }`, plus, for admins only, the
`defaults: { host, port }` that prefill the "New site" form
(`DEFAULT_FTP_HOST`, `DEFAULT_FTP_PORT`). FTP passwords appear in no
response at all. Browsing only needs a label, so regular users are not even
told where the FTP server lives.

### Browsing API

| Method + path | Role | Response |
|---|---|---|
| `GET /api/shortcuts/:id/list?path=/a/b[&auto=1]` | user | `{ path, entries: [{ name, isDir, isLink, size, date, modified }] }` (see [Listings](#listings)). `auto=1` marks the page's own check for new files, which is audited at most once per 10 minutes ([Listings kept current](#listings-kept-current)) |
| `GET` or `HEAD /api/shortcuts/:id/file?path=/a/b/c.mp4[&download=1]` | user | The file, streamed, with `Range` support |
| `GET` or `HEAD /api/shortcuts/:id/play?path=/a/b/c.avi` | user | The video as an MP4 the browser can play, with `Range` support ([Playing videos](#playing-videos)) |
| `POST /api/shortcuts/:id/zip` with `{ paths, localTime }` | user | `{ url, count, name }`: a single-use link to those files as one ZIP ([ZIP export](#zip-export)) |
| `GET` or `HEAD /api/zip/:token` | user | That ZIP, streamed while it is built |

The entry shape is the one the HTA's parser produced, plus `modified`: `date`
is the listing's raw text, and `modified` the same moment as ISO 8601 text,
or `null`. See [The FTP gateway](#the-ftp-gateway) below.

### Importing shortcuts from the HTA

Because the format is the same, the HTA's `legacy/config/shortcuts/*.json`
files import as they are. The import runs every record through the same
validation as the API:

```
npm run cli -- import legacy/config/shortcuts            # a directory
cat shortcuts/*.json | docker compose exec -T app \
  node server/cli.js import -                            # stdin (Docker)
```

Shortcuts that already exist are skipped unless `--replace` is given. The
command prints one line per skipped or failed file and a summary, and exits
non-zero if any record failed. Reading from stdin works even when the
container's filesystem is read-only. The JSON objects may simply be
concatenated (`cat`), BOMs included.

## The FTP gateway

`server/ftp.js` is the only code that talks to FTP servers. Every request
opens its own connection, logs in, does its one job and closes the
connection, as the HTA's curl calls did.

### Paths

UI paths are `/`-rooted but **relative to the FTP login directory**,
exactly like the HTA's curl URLs (`ftp://host/a/b/` means "a/b inside the
home directory"). The gateway walks them with one `CWD` per segment (curl's
default "multicwd"), then sends a bare `LIST`, or `SIZE` / `RETR` with the
file's basename. Spaces and accents need no escaping.

`parseRemotePath` refuses (400) anything that is not `/`-rooted, any `.` or
`..` segment, control characters (CR/LF would inject FTP commands),
backslashes (a separator on Windows FTP servers, which could hide `..`) and
paths over 1024 characters.

### Passive mode behind NAT

Data connections try EPSV first, then PASV. For PASV the gateway **ignores
the address in the server's reply and connects to the host it is already
talking to**, which is curl's default (`--ftp-skip-pasv-ip`) and what makes
the HTA work with servers behind NAT. Such servers announce their private
address in the reply. basic-ftp 6 refuses that by default, and its
`allowSeparateTransferHost` escape hatch would accept any host (FTP
bounce). The custom mode can only ever reach the server we logged in to.
It deep-imports two helpers from `basic-ftp/dist/transfer.js`, which is
why the dependency is pinned to patch releases (`~6.2.3`); a test proves
both the fix and that plain basic-ftp would fail.

The mode that worked is remembered per server, so a NAT that breaks EPSV
costs one timeout per server, not one per request.

### Listings

`client.list()` uses MLSD when the server offers it, else `LIST`. The Unix
and DOS parsers are more forgiving than the HTA's Unix-only one; on the
legacy fixture they produce the same 8 entries. `LIST -a` is never sent:
curl sends a plain `LIST`, and `-a` adds dotfiles and confuses some servers.
A listing may not exceed 8 MiB or take longer than 60 s (curl had
`--max-time 60`).

Each entry keeps the date as the listing printed it (`date`), and adds
`modified`, the same moment as ISO 8601 text the browser can sort and
filter (`modifiedTime` in `server/ftp.js`):

| Listing | `modified` | Shown |
|---|---|---|
| MLSD (`modify=20261030073012`) | `2026-10-30T07:30:12Z`: exact, UTC | in the browser's time zone |
| Unix `LIST`, recent (`Oct 30 08:30`) | `2026-10-30T08:30`: no zone | as printed |
| Unix `LIST`, older than six months (`Apr 01 2025`) | `2025-04-01`: the day only | the day only |
| Unix long ISO (`2026-10-30 08:30`), DOS (`10-30-26 08:30AM`) | `2026-10-30T08:30` | as printed |
| anything else (`Okt 30 08:30`) | `null` | the raw `date`, muted |

`LIST` prints the FTP server's own clock without naming its time zone, so
those times carry none and the browser shows them as printed. Recent Unix
lines leave out the year: it is the current one, unless that would put the
date more than a day in the future (so `Dec 31 23:50` listed on 1 January
is last year's). Before `modified`, MLSD times were shown in UTC, an hour
or two early in France.

### Streaming files

1. `SIZE` (optional in FTP: without it, the file goes out whole with
   `Accept-Ranges: none` and no length).
2. One `Range` is honoured (`a-b`, `a-`, `-n`); multi-range requests get
   the whole file and ranges past the end get a 416. The transfer then
   starts at the offset (`REST`). This is what lets videos seek.
3. Bytes flow through a small `Writable` into the response, with
   backpressure. Two details matter:
   - **The response is never handed to basic-ftp.** `downloadTo` always
     `end()`s its destination, even after a failure, which would pass a
     truncated file off as complete. The gateway ends the response only
     when the transfer succeeded, and destroys it otherwise.
   - **Headers go out with the first byte**, so an FTP error before any
     data still becomes a clean JSON error.
4. The FTP connection is closed early when the browser goes away (a seek,
   a closed tab), when a bounded range has been sent, or when the reader
   stalls. A paused `<video>` stops reading, and since basic-ftp 6.2 such
   backpressure no longer times out, so after 60 s without progress the
   gateway closes it. The browser simply re-requests when playback resumes.

`HEAD` answers with the headers and never starts a transfer.

### What renders in the browser

`public/js/filetypes.js` is one table, imported by both the server and the
browser, so they cannot disagree. Only images, browser-playable video and
audio, PDF and plain text are served inline. **Everything else, notably
HTML, SVG, XML and scripts, goes out as `application/octet-stream` +
`attachment`**: anyone who can put a file on the FTP server would otherwise
run script in the app's origin and act as the signed-in user. Every file
response also carries `nosniff`, `Cache-Control: private, no-store`, an
RFC 6266 `filename*` (accented names survive) and a `sandbox` CSP. PDFs are
the one exception to the CSP: Chrome's viewer refuses to render under a
sandbox CSP, and a PDF runs no page script. `download=1` forces an
attachment for anything.

### Playing videos

Browsers decode H.264 in MP4 (and WebM), and little else. Cameras also
record MPEG-4 Part 2 (XviD), often in AVI, and some name their MP4 files
`.avi`. `GET /api/shortcuts/:id/play` (`server/video.js`) makes any of them
playable:

1. The gateway fetches the whole file into memory (`gateway.fetch`), up to
   `CONVERT_MAX_MB` (50 MB by default). Bigger files get a 413 and stay
   downloadable. A file whose size changes during the transfer, typically
   the newest clip still being uploaded, gets a 503: try again in a moment.
2. If the bytes already are an MP4 every browser plays (H.264 Baseline,
   Main or High; AAC or MP3 audio), they go out untouched, whatever the
   file is called.
3. Anything else is converted with ffmpeg to H.264 / AAC in an MP4 that
   starts with its index (`+faststart`) and has a keyframe every 2 s, so
   playback starts at once and seeking is precise. ffmpeg works in a
   private temporary folder, deleted as soon as it is done. In Docker,
   `/tmp` is in RAM, so footage never reaches a disk there. At most 2
   conversions run at once, 20 more may wait, and each is stopped after
   2 minutes.
4. The result is served from memory, with `Range` support and the same
   headers as any file (`video/mp4`, inline, sandbox CSP). It is kept for
   10 minutes, within 64 MB, because a browser asks for a video more than
   once. Simultaneous requests for one video share one fetch and conversion.

The input is untrusted, so ffmpeg runs with `-protocol_whitelist file` and
a `-format_whitelist` of real video demuxers (AVI, MP4/MOV, Matroska,
MPEG-TS/PS, raw H.264/H.265/MPEG-4, FLV, ASF, Dahua DAV, MJPEG). Playlist
formats such as HLS or concat, which could read other files or fetch URLs,
are refused.

| Cause | Status |
|---|---|
| larger than `CONVERT_MAX_MB` | 413 |
| ffmpeg can't convert it (damaged file, unknown format) | 415 |
| no ffmpeg on the server | 501 |
| conversion queue full, or the file is still being written | 503 + `Retry-After` |
| a conversion took over 2 minutes | 504 |

413, 415 and 501 are remembered for a minute, so retries cost nothing. At
startup the server prints whether conversion is on.

### ZIP export

Up to 200 files of one site can be downloaded as one archive, in two steps:

1. `POST /api/shortcuts/:id/zip` with `{ paths, localTime }` checks the list
   (1 to 200 file paths, each valid, none twice once normalized; 400
   otherwise) and answers `{ url, count, name }`. The URL,
   `/api/zip/<token>`, works once, for the same user, within 2 minutes;
   anything else is a 404. Links live in memory only, at most 10 waiting
   per user.
2. The page follows the URL like any download, so the browser's download
   manager shows the progress and the page never holds the archive. The
   answer is an `application/zip` attachment named
   `<site label> YYYY-MM-DD HH-MM.zip` after the browser's clock
   (`localTime`), with the characters Windows forbids replaced by `_`, and
   no `Content-Length`. At most 2 archives stream at once on the server: a
   third gets a 503 with `Retry-After: 5`, and its link stays valid. `HEAD`
   uses neither the link nor FTP.

`server/zip.js` writes the archive while the files arrive: stored rather
than compressed (camera clips don't shrink), with the CRC-32 computed on
the way, a data descriptor after each file and UTF-8 names. A second file
with the same name becomes `clip (2).avi`. Each entry's time is the
recorder's clock read from the clip's name (`parseClip`), or else the
export time. There is no Zip64, so an archive stops at 65,535 entries or
2 GiB.

`gateway.zip` holds one FTP connection for the whole archive: one login,
one `PWD`, then for each file back to the login directory, one `CWD` per
segment and `RETR`, with the backpressure and stall timer of single files.
Whatever happens, the archive stays valid and says what it lacks:

- a file that fails before its first byte is left out; one cut off midway
  keeps what arrived;
- a lost connection is opened again once; after a second loss, the
  remaining files are not tried, and neither are those past the limits;
- all of these are listed with the reason in a last `ERRORS.txt` entry
  (`ERREURS.txt` in French), in the language of the user who asked.

The FTP connection closes as soon as the browser goes away. Each export
adds one `export` line to the audit trail, with the shortcut and every path.

### Protecting the server's IP

All users' FTP traffic now leaves from one address, the VPS. That has
consequences the HTA never had:

- **Connection cap.** At most `FTP_MAX_CONNECTIONS` (default 10) connections
  per FTP host at once, for everyone together. Extra requests queue for up
  to 20 s, then get a 503. A slot is handed on only once the old TCP
  connection has fully closed, so a strict per-IP limit on the server is
  never exceeded during the handover. Keep it at or below the server's own
  per-IP limit.
- **Login-failure pause.** After a `530`, the gateway stops trying that
  shortcut for 5 minutes and answers with the cached error. Otherwise users
  clicking around a shortcut with a wrong password could get the VPS banned
  by fail2ban & co., which would lock out every user. An admin editing the
  shortcut lifts the pause immediately.
- `FTP_ALLOWED_HOSTS` is checked again at connect time, which covers
  hand-edited shortcut files too.

### Errors

FTP and network failures become readable messages in the same JSON error
format. They never contain the server's address, which regular users are
not shown:

| Cause | Status |
|---|---|
| `530` login failed | 502. Never 401, which the UI reads as "your session expired". |
| `550` not found / no permission | 404 |
| `421` too many connections, or the queue wait ran out | 503 + `Retry-After` |
| connection refused, DNS failure, timeout | 504 |
| any other FTP reply | 502, with the server's reply text |

## Browser UI

`public/` is served as-is: plain ES modules, no framework, no build step.
It began as a port of the HTA's `ui/`, minus the IE11 workarounds (ES5,
`className` regexes, `onmousewheel`, simulated clicks), and now works like
File Explorer's Details view: a navigation pane, a command bar, one list
that sorts, filters and selects, and a status bar. Pure modules hold the
logic that decides what an operator sees, so `node:test` covers it without
a browser; DOM modules draw it.

| File | Role | HTA counterpart |
|---|---|---|
| `index.html` | The explorer page: top bar, sites pane, command bar, list, status bar, and the native dialogs (site form, help, link fallback, phone filter sheet) | `quick-ftp-explorer.hta` |
| `login.html`, `js/login.js` | The sign-in form, and why the last attempt bounced | (none) |
| `js/api.js` | Every server call; a 401 sends the page back to sign-in | `shell.js` + `config.js` + `ftp.js` |
| `js/app.js` | Wiring: the three views and their pipeline, history and the URL, search, opening files, the commands, the menus' contents, the new-file check, the phone drawer and selection mode, site management | `app.js` |
| `js/ui.js` | The navigation pane, an ARIA tree of Tous les sites and the sites' folders, with Trouver un site; and the listing cache both panes share | `ui.js` (the tree) |
| `js/grid.js` | The right pane's list, one ARIA grid (`role=grid`): sort headers, day headings, check boxes, the selection's display, the pointer and keyboard model | `ui.js` (the files table) |
| `js/listview.js` | Row models, columns, sorts, periods and filters with their counts, day groups, listing diffs, the viewer's list. Pure, unit-tested | (none) |
| `js/selection.js` | File Explorer's selection rules, as pure state changes. Unit-tested | (none) |
| `js/clips.js` | The camera and the recording time in a clip's name. Pure, unit-tested, shared with the server | (none) |
| `js/toolbar.js` | The command bar: Ouvrir, Télécharger, Copier le lien, Trier and the filters; on phones, the filter sheet and its chips | (none) |
| `js/menu.js` | The right-click menus, for the mouse and the keyboard | the admin-only menu in `app.js` |
| `js/accounts.js` | The admins' Accounts dialog: roles, new passwords (suggested, shown once), deletion, new accounts, through `/api/users` | (none: the CLI only) |
| `js/keys.js` | Page-wide shortcuts, the Esc layers, the screen-reader announcer, and the `SHORTCUTS` table that the help and the manuals list | (none) |
| `js/prefs.js` | The four choices this browser remembers, in `localStorage`. Unit-tested | (none) |
| `js/viewer.js` | The viewer, a modal `<dialog>` that steps through a list: images (zoom / pan), video and audio, chained playback | `viewer.js` (images only) |
| `js/util.js` | Pure helpers (paths, times, sizes, natural sort, type-ahead, labels, search matching, folder and clip links), unit-tested | (inline in `ui.js` / `app.js`) |
| `js/search.js` | The folder walk behind the search box, unit-tested | (none: the HTA filtered one folder) |
| `js/i18n.js` | Every text in English and French, shared with the server; the language; sizes, dates and times | (none: English only) |
| `js/filetypes.js` | File kinds and inline types, shared with the server | `kindFor` in `ui.js` |
| `js/icons.js` | The line icons, built once as DOM nodes and cloned | emoji in `ui.js` |
| `styles.css` | The File-Explorer layout in the Dessaud Alarme Service colours, as OKLCH custom properties | `styles.css` |
| `logo.svg` | The logo and favicon: a folder holding a camera lens, on the brand red | (none) |

### The list

**One pipeline for every view.** `renderView()` in `app.js` draws the
right pane's three views (Tous les sites, a folder, search results) the
same way, describe → filter → sort → cap → group:

1. **describe**: `describeEntry(entry, { sc, parent })` turns a listing
   entry into a row model, `{ key, kind, camera, time, precision,
   timeSource, modifiedMs, size, … }`, keyed `<shortcut id>::<path>`.
   Models are memoised per entry object in a `WeakMap`, so redrawing a
   folder of 3,000 files parses no name twice. `columnsFor` adds the Caméra
   column when a file of the unfiltered view has a camera.
2. **filter**: `applyFilters(rows, filters, now)` returns `{ shown, hidden }`.
   Folders always pass, and a period hides files without a time. `facets()`
   counts each camera and kind within the other filters, for the selects.
3. **sort**: `sortRows(rows, sort)`. Folders stay on top. Equal dates fall
   back to the FTP time, then to the name; rows without a value go last in
   both directions. A saved Caméra order falls back to newest first,
   unsaved, on a view without cameras.
4. **cap**: search results only, 500 rows, after the filter and the sort,
   so the rows shown are the first in the chosen order (the newest, by
   default). Matching sites come before them.
5. **group**: sorted by date, `groupByDay(rows, now)` splits the files by
   local day, with folders first and no heading, and undated files last. A
   clip a little in the future (a fast camera clock) counts as today.

`grid.render(container, model, callbacks)` then builds the rows in a
`DocumentFragment`, one row group per day under a sticky heading, wires one
set of delegated listeners, and restores the scroll and the focus by key. Tous les sites skips the filters and the command bar: one
Name column, sorted by name, a choice that is not saved.

**Dates.** A row's `time` is the recording time read from the clip's name,
else the listing's `modified`, the way Windows' Date column prefers the date
a photo was taken. `util.parseTime` reads `…Z` as an exact moment, and
anything without a zone, a bare day included, as this browser's local time,
field by field: never with `Date.parse`, which reads a bare day as UTC.
`formatDateTime` prints `01/11/2026 15:58` in both languages (the app's
English is en-GB); FTP times show minutes, and seconds show only when the
name carries them. The cell's tooltip names the source and adds the FTP
time. A `modified` of `null` shows the raw `date`, muted, and sorts last.

**Clip names.** `parseClip(name)` in `clips.js` reads
`<site or device>_<camera>_<stamp>.<ext>` and `<camera>_<stamp>.<ext>`:

| Stamp | Example | `time` |
|---|---|---|
| 12 digits, `YYYYMMDDhhmm`, the recorder's clock | `1234_Cam 1_202611011558.avi` | `2026-11-01T15:58` |
| 14 digits, `YYYYMMDDhhmmss`, the recorder's clock | `1234_Cam 1_20261101155812.avi` | `2026-11-01T15:58:12` |
| 10 digits, Unix seconds, an exact moment | `12345678_02_1793345412.mp4` | `2026-10-30T07:30:12Z` |

The camera is everything between the first and the last `_`, joined back
with `_` and kept as written (`Cam 1`, `02`); with two parts, it is the
first (`Garage_202611011558.avi`). A name without a stamp, a stamp outside
2000–2099 or an impossible date gives `null`. Results are cached per name.
The server reuses `parseClip` for the times of ZIP entries.

### Selection, keys and menus

**Selection.** It lives in `app.js` as a `selection.js` state,
`{ selected, anchor, focus }` of row keys, so sorting, filtering,
refreshing and redrawing keep it. `retain` drops the rows a filter hides,
and opening another place clears it. `grid.update(selection)` only toggles
a class and `aria-selected`: no row is rebuilt for a selection change.

- **Mouse and pen**: a click selects one row (`click`), Ctrl toggles,
  Shift selects the range from the anchor and Ctrl+Shift adds it; a row's
  check box toggles; a click below the rows clears. A double-click opens.
- **Touch**: the pointer type is recorded on `pointerdown`, and a tap
  opens. A tap with `detail > 1`, or within 400 ms of `grid.hold()` (called
  on every navigation and when the viewer opens), is ignored, so the second
  tap of a double tap never lands on what just appeared. In the phone's
  selection mode, taps toggle instead.
- **Keyboard**: the list and the tree are one Tab stop each, with a roving
  `tabindex` (`focusin` moves it, so Tab comes back to the last row). In the
  list, the arrows, Home/End and Page Up/Down move and select (`move`: Shift
  extends, Ctrl moves the focus only), Space toggles, Ctrl+A selects the
  files shown, Enter opens, and Esc clears the selection, then the search.
  On Tous les sites, letters type ahead. The focused row scrolls into view
  below the sticky header (`scroll-padding-top`); day headings take no
  focus, and ranges skip them.
- A single selected row shows *Double-cliquez (ou appuyez sur Entrée) pour
  ouvrir.* in the status bar, until something has been opened from the
  list once (`prefs.hintDone`).

**Keys.** `keys.js` handles the page-wide ones: Ctrl+F and F3 focus the
search box (not when it already has the focus, so a second press reaches the
browser's own find), Shift+F10 and the Menu key open the menu of the focused
row or tree item, Alt+Up goes up, Backspace goes back, and `?` opens the
help. None acts while a dialog is open, and Backspace, Alt+Up and `?` do
nothing in text fields. F5, Ctrl+L, Alt+Left/Right and the browser's other
keys are left alone. `SHORTCUTS` lists the keys once, for the help dialog
and the manuals.

**Esc layers.** Esc closes one layer at a time. Native dialogs (the viewer,
the site form, the help, the link fallback, the phone's filter sheet) close
themselves through their `cancel` event. The list and the search box use Esc
first, for the selection and the search. Whatever is left goes to a stack
(`layers.push(name, close)`): the menu, the phone's search field, the drawer
and the phone's selection mode, topmost first.

**Menus.** `menu.js` renders a `role=menu` of `menuitem` buttons. It focuses
the first item; the arrows, Home and End move; Enter or Space runs an item;
Esc, Tab, a click elsewhere, a resize or the window losing the focus close
it and give the focus back. One delegated `contextmenu` listener on `#app`
serves rows, tree items, the list's background and, for admins, the tree's
background; a right-click on an unselected row selects it first. Text
fields, links (the breadcrumb's) and dialogs keep the browser's own menu. A
middle click on a folder or site row opens it in a new tab. iOS sends no
`contextmenu` on a long press, so admins also get a ⋯ button on the open
site's tree row.

**The announcer.** One visually hidden `#announcer` (`role=status`) speaks,
debounced by 500 ms: folder loads ("1234 Résidence : 81 éléments"), sort
and filter changes, the start and the end of a search, new files, and the
next clip of a chained playback. The status bar is not a live region, and
moving through rows says nothing extra: `aria-selected` already does.

### Search

The top bar's box finds files and folders by name in the open folder and
all its subfolders, or in every site when none is open (matching sites are
listed first). `search.js` walks the folders through `tree.listing`, so it
shares the listing cache: a second search of a place is instant, and opening
a folder found by a search needs no new listing. The walk reads at most 6
folders at a time and 300 in all, 10 levels deep, and never follows links,
so one search can't flood the FTP server. Typing only re-filters what has
been read: words are folded (lower case, no accents) and must all appear, in
any order (`matchFolded` in `util.js`), and the matched parts are
highlighted with `<mark>` text nodes. The results then go through
[the list's pipeline](#the-list), filters and sort included, before the
500-row cap, and redraw at most every 300 ms while the walk runs. Going to
any folder ends the search, as in File Explorer; `Esc` or × clears it, and
starting or clearing it in the same place keeps the filters.

### Listings kept current

**One listing per folder, shared by both panes.** `tree.listing(sc, path)`
returns a cached promise and records when the listing arrived (`loadedAt`,
the status bar's *Mis à jour à*); the tree and the right pane both use it.
In the HTA the right pane depended on the tree having rendered the folder's
node, which caused two bugs that are gone now:

- after a failed listing, the right pane stayed on "Loading…";
- clicking a folder while the search hid its tree node did the same.

Failed listings are retried on the next request. Responses that arrive
after the user moved on are ignored.

**Refreshing.** **↻** reloads the open folder with
`tree.refresh(sc, path, { quiet: true })`. The rows stay on screen
(`aria-busy`), the selection, focus and scroll are kept by key, and files
that appeared are tagged *Nouveau*. A failure leaves the rows and shows a
notice with Réessayer. A quiet refresh redraws the tree only when the
subfolders changed, so it never takes the focus away from it. Coming back to
a folder whose listing is more than 60 s old shows the cached rows at once
and reloads them in the background.

**New files while you look.** Every 60 s (a chained `setTimeout`, so checks
never overlap), the page lists the open folder again with `list?auto=1`,
but only while a folder is open, the tab is visible, the user has pressed a
key or the pointer in the last 30 minutes, and no search, viewer, menu or
dialog is open. When the tab becomes visible after more than 60 s, the check
runs at once. `diffListing` compares the names. New files are never slipped
in under the reader's eyes: a notice says "2 nouveaux fichiers · Afficher",
and Afficher stores the new listing (`tree.store`) and redraws it with the
new files tagged *Nouveau* for 10 minutes, or until opened. A listing that
only lost files is applied at once. A failed check is silent; the next one
tries again. While a sliding period (*Dernière heure*…) is active, the view
is also redrawn every 60 s.

On the server, `list?auto=1` reaches the audit trail only when the same
user has had no listing of that folder audited in the last 10 minutes
(an in-memory map, pruned past 5,000 entries); ordinary listings always do.
A folder watched all day thus adds at most 144 lines, not one a minute.

### Navigation, the URL and history

**The tree.** `ui.js` draws an ARIA tree: Tous les sites first, then each
site with its folders only. `tree.reveal(sc, path)` marks the site, every
folder on the way and the target as open, selects the target, and
re-renders. Nodes fill in as their parents' listings arrive. Breadcrumb
links, Up and the list's folder rows all navigate this way, so any folder
can be reached whether or not its ancestors were open. In the HTA, the
target had to be rendered already. A folder whose listing has no subfolders
loses its chevron and `aria-expanded`. The arrows move, expand and collapse
but never open anything, since each opening costs an FTP listing; Enter or
Space opens. Trouver un site (`tree.find`) keeps the sites whose label has
every typed word, plus the open one, and lists nothing over FTP. Up
(`goUp`) opens the parent folder, or Tous les sites from a site's root, and
selects the place it came from (`pendingSelect`).

**The URL names the place.** `#/` is Tous les sites, and
`#/<shortcut id>/<folder>/<folder>` a folder, each part URL-encoded
(`formatHash` / `parseHash` in `util.js`). The breadcrumb's segments are
real links to these, so Ctrl+click, a middle click and "copy link address"
work as on any link.

- Every navigation pushes a history entry (`pushEntry`), unless the URL
  already names that place, so Back and Forward move between places and
  loops are impossible. `popstate` / `hashchange` and page load call
  `followUrl()`, which shows the place. Links to unknown shortcuts fall back
  to Tous les sites quietly.
- `history.state` is `{ idx, view, viewer }`:
  - `idx` numbers the entries: a push writes the current index + 1, and
    also stores it in `sessionStorage` as `qfe.maxIdx` (in try/catch), since
    a push drops anything ahead. The ← button is disabled at index 0, so it
    never leaves the app, and → at `qfe.maxIdx`.
  - `view` is `{ query, filters, selected, focusKey, scrollTop }`, with up
    to 200 selected keys. It is written with `replaceState` 300 ms after a
    change, and at once before a push. Back, Forward and a reload (F5)
    bring the search, the filters, the selection and the scroll back from
    it; a new navigation starts clean.
  - `viewer` is `{ key }`. Opening the viewer pushes an entry with the same
    URL; Précédent and Suivant update its key with `replaceState`; closing
    it (Esc, Fermer) calls `history.back()`. On `popstate`, an entry without
    `viewer` closes the viewer and selects the last clip shown, and going
    Forward to one with `viewer` reopens that clip. So Back, Alt+← and the
    phone's back gesture close the viewer instead of changing the folder
    behind it.
- **`?open=<name>`** after the folder is a clip link
  (`#/1234/Cameras?open=1234_Cam%201_202611011558.avi`), and only an
  arrival form: `followUrl` rewrites the entry to the folder's URL, opens
  the folder, then selects the clip and opens it, and the viewer pushes its
  own entry, so Back closes the viewer and stays in the folder. A clip that
  is no longer listed gives a notice instead. `parseHash` takes the query
  from the first literal `?`, which can't occur inside an encoded segment,
  and accepts a bare name only.
- Signing in keeps the link. Browsers carry the fragment across the
  `/` → `/login` redirect; `login.js` copies it into the form's `next`
  field, and the server redirects back to `/` + `next` after sign-in.
  `next` is accepted only as `#/` followed by printable ASCII, so it can
  never redirect out of the app; clip links pass too.
- An expired session (a 401 from the API) keeps it too.

### Narrow screens

At 700 px and below (phones), one media query does most of the work, and
`app.js` toggles a few classes:

- The top bar keeps ☰, the current place's name (the breadcrumb's last
  part), ⌕ and ↻, 44 px each. ⌕ lays the search field across the bar (an
  Esc layer); Back, Forward and Up are hidden, since the system's Back
  covers them.
- The sites pane becomes a drawer (`drawer-open`) over a scrim; while it is
  open the main area and the status bar are `inert`. It closes on any
  choice, on Esc and on a tap outside, and it starts closed, the page
  showing Tous les sites. Its foot holds the account controls, moved there
  from the status bar: the same nodes, so the sign-out form keeps working.
- The command bar keeps Trier, Filtres and Sélectionner. Filtres opens a
  bottom-sheet `<dialog>`; the filter controls move into it while it is open
  and back afterwards, so no id is duplicated. A line of chips shows the
  active filters and the count.
- Rows become two lines: the whole name, never cut, then a muted "date ·
  caméra · taille" (the time alone under a day heading). The column header
  and the status bar are hidden.
- Sélectionner starts selection mode (`#app.selecting`, an Esc layer): a
  check box on every file, taps that toggle, and a bar at the bottom with
  the count, Tout sélectionner, the link and Télécharger. ×, Esc, leaving
  the folder or unticking the last file ends it.
- The viewer keeps Fermer and the caption on top, and puts Précédent, the
  position, Suivant, the link and Télécharger in a bottom bar with 48 px
  targets.

### Opening files

**Opening a file** follows `filetypes.js`:

- videos, and the images and audio the browser can show, open in the viewer
  (`listview.viewable`);
- other inline types (PDF, text) open in a new tab;
- everything else is fetched with `download=1`.

**The viewer** is a native `<dialog>` opened with `showModal()`, so the page
behind it is inert. It steps through
`playlist(rows, key, selected)`: the rows as shown, viewable ones only, or
just the selection when two or more files are selected and the opened one
is among them; there is no wrap-around. ←/→ and Home/End step unless the
`<video>` or `<audio>` element has the focus (its own keys then seek), Page
Up/Down always step, and Space plays or pauses. For 400 ms after opening,
clicks on the stage are swallowed, so the end of a double-click or a double
tap pauses nothing. "Lecture enchaînée" (`prefs.autoplay`) plays the next
clip a second after one ends and announces it; a key or a click in that
second cancels it.

The viewer uses the browser's own `<video>` / `<audio>`, which seek
through HTTP range requests. MP4, WebM and MOV files stream straight from
FTP, and if the browser can't decode one, the viewer switches to `/play`.
Other videos (AVI, MKV, DAV...) go to `/play` at once. Each step, and the
closing, removes the media source, which aborts the request and so frees
the FTP connection; nothing is loaded in advance. When nothing plays, the
viewer asks the server why (a one-byte request returns the JSON error) and
shows that, with a download link.

**Downloads and links.** Télécharger downloads one file with `download=1`.
Two to 200 files of one site go through the [ZIP export](#zip-export): the
page posts the paths with its local time, then follows the returned link, so
the browser's download list shows the progress. More files, or files from
several sites (search results), disable the button, with a tooltip saying
why. Copier le lien builds `location.origin + location.pathname` + the hash
of each selected row (a clip's with `?open=`), one per line, or of the open
folder. On touch screens with `navigator.share` it opens the share sheet;
when `navigator.clipboard.writeText` fails, a small dialog shows the links,
selected.

### Roles, languages and look

**Roles in the UI.** Everyone gets the right-click menus. Admins also get
`+ Nouveau site`, Modifier le site… and Supprimer le site in a site's menu,
Nouveau site… on the tree's background, and the ⋯ button. The site form is a
native `<dialog>` that shows server errors inline (400/409) instead of
`alert()`; deleting still asks with `confirm()`. Edit leaves the password
empty, because the stored one never reaches the browser.

**English and French.** `i18n.js` holds every text in both languages, as
one table that the server imports too (like `filetypes.js`), with plural
forms chosen by `Intl.PluralRules` and numbers by `toLocaleString`
("12 345 résultats"). The language is the `qfe_lang` cookie, set by the
switch in the status bar and on the sign-in page, else the best match of
the browser's preferences (`Accept-Language`, `navigator.languages`),
else English. Pages carry `data-i18n` / `data-i18n-attr` keys and start
hidden (`i18n-pending`) until `translatePage()` has run, with a one-second
CSS fallback so a broken script can never leave a blank page. Sizes read
"1,5 Ko" in French. Times read "01/04/2026 14:34" in both languages, as
Windows lists them, with a long form for tooltips ("mercredi 1 avril 2026 à
14:34") and day headings; a date without a readable time keeps the
listing's own text, "Apr 01 2026" becoming "1 avr. 2026" in French. French
texts carry a no-break space before ":" and inside « », and a narrow one
before ";", "?" and "!". On the server, `HttpError` takes
`msg(key, params)`: logs and tests see English, and `fail()` answers in the
reader's language, the error page included; parameters can be messages
themselves (a field name inside "{field} is required"), and FTP replies
stay as the server sent them.

**Look and accessibility.** The palette comes from the Dessaud Alarme
Service logo: an ink navy carries the frame (top bar, sign-in header,
primary buttons), and the signal red is kept for the logo, for errors and
for Supprimer le site. Selection, filters and new-file tags use the navy and
words. Neutrals are tinted toward the navy. The colours are OKLCH custom
properties at the top of `styles.css`, and text and controls meet WCAG AA
contrast. Sizes are in `rem`, 13 px at the least, and heights that hold
text are minimums, so larger text never gets clipped; on phones every row
and button is at least 44 px tall; and
`prefers-reduced-motion` turns transitions off. The page has landmarks (the
top bar as banner, `nav` for the sites and the breadcrumb, `main`, the
status bar as `footer`), visually hidden `h1` and `h2` headings naming the
page and the view, and a skip button to the list. Selected rows carry a
tint, a bar and a tick, never colour alone, and Windows contrast themes
(`forced-colors`) get system colours for the selection, the focus, `<mark>`
and the check boxes. The splitter is a `role=separator`: drag it, click it
to step through three widths, or use the arrow keys, Home, End and Enter.
The product and design principles behind these choices are in
[PRODUCT.md](../PRODUCT.md).

**Safety.** Every name that comes from an FTP server reaches the page via
`textContent` / DOM nodes, never as HTML. The page has no inline scripts or
styles, so it runs under the strict `default-src 'self'` CSP. Dialogs are
native `<dialog>`s. The browser's storage holds preferences only:
`localStorage` keeps four (`prefs.js`: `qfe.sort`, `qfe.leftPaneWidth`,
`qfe.hintDone`, `qfe.autoplay`), each read and written inside try/catch, so
a private window or blocked storage simply gives the defaults, and
`sessionStorage` keeps `qfe.maxIdx`. No file name is ever stored there; the
views kept in `history.state` (search words, filters, selected keys) live
and go with the tab's history.

## Audit trail

`data/audit.jsonl` gets one JSON object per line for security-relevant
events, each with time, user and client IP:

- `login`, `login_failed`, `login_blocked`, `logout`;
- `shortcut_create`, `shortcut_update` (with `renamedTo` after a rename),
  `shortcut_delete`, each with the shortcut `id`;
- `user_create` (`account`, `role`), `user_update` (`account`, and `role` or
  `password: true`), `user_delete` (`account`): the admins' Accounts dialog;
- `list` (shortcut `id` and `path`), `file` (`id`, `path`, and
  `download: true` for forced downloads) and `play` (`id`, `path`: a video
  opened through `/play`). A file is logged once per opening: ranged
  requests that do not start at byte 0 (video seeks) are not logged again.
  The page's own checks for new files (`list?auto=1`) are logged only when
  the same user has had no listing of that folder logged in the last 10
  minutes ([Listings kept current](#listings-kept-current)); other listings
  always are;
- `export` (`id`, `count` and every `path`): a ZIP of several files,
  when it starts streaming.

Passwords are never logged. CCTV footage is personal data, so who accessed
what must be accountable. Writes are queued so lines never interleave, and
a failed write is reported on stderr without failing the request.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface to listen on (`0.0.0.0` in Docker). |
| `PORT` | `8080` | Port to listen on. |
| `DATA_DIR` | `./data` | Accounts, shortcuts, session secret and audit log. Back it up; never commit it. |
| `TRUST_PROXY` | off | Trust `X-Forwarded-Proto` / `X-Forwarded-For` from a reverse proxy. |
| `SESSION_SECRET` | generated | HMAC key for sessions (≥ 32 characters). |
| `SESSION_TTL_HOURS` | `12` | Session lifetime. |
| `DEFAULT_FTP_HOST` | `127.0.0.1` | Host prefilled in the "New site" form. |
| `DEFAULT_FTP_PORT` | `21` | Port prefilled in the "New site" form. |
| `FTP_ALLOWED_HOSTS` | any | Comma-separated hosts shortcuts may point at, e.g. your one FTP server. |
| `FTP_TIMEOUT_MS` | `15000` | How long the FTP server may stay silent before a request fails. |
| `FTP_MAX_CONNECTIONS` | `10` | Simultaneous FTP connections per server, for all users together. |
| `FFMPEG_PATH` | `ffmpeg` | The ffmpeg program that converts videos (found on the `PATH` by default). |
| `CONVERT_MAX_MB` | `50` | Largest video the server fetches to play in the browser; bigger ones are download-only. |

`npm run dev` and `npm run cli` also read a local `.env` file when present.

## Tests

`npm test` runs `node:test` over `tests/*.test.js` with no test
dependencies:

- `tests/auth.test.js`: hashing, the account store, tokens (tampering,
  expiry, revocation), the session secret, the limiter.
- `tests/store.test.js`: the shortcut store. It ports the legacy
  `test-config.hta` assertions (`sanitizeId`, UTF-8 round trip, CRUD) and
  adds 409s, safe renames, the password rules and validation.
- `tests/shortcuts.test.js`: the shortcut API by role, no password in any
  response, the audit trail, and `cli import` run as a real subprocess.
- `tests/filetypes.test.js`: nothing that can carry script is ever inline.
- `tests/util.test.js`: the UI's pure helpers (natural sort, labels, sizes,
  paths and parent paths, `parseTime` with and without a zone, type-ahead,
  folder and clip links, search matching with accents and several words).
- `tests/clips.test.js`: clip names: site, camera and the recorder's time
  to the minute or the second, Unix seconds, underscores, accents and
  spaces in a camera's name, and names without a real stamp.
- `tests/listview.test.js`: the list's logic. Row models and the Caméra
  column; every sort with its tie-breaks; the periods (recent ones without
  an end, yesterday over a clock change, around a time, custom ranges in
  either order); the filters and their counts; the newest file; listing
  diffs; day headings; the viewer's list.
- `tests/selection.test.js`: File Explorer's selection rules: click, Ctrl,
  Shift, Ctrl+Shift, the keys, select all, rows leaving the view.
- `tests/prefs.test.js`: saved preferences come back, invalid ones are
  refused, and storage that throws gives the defaults without an error.
- `tests/i18n.test.js`: both languages have every text with the same
  slots, French typography, every key the code and pages use exists,
  plurals and number formats, the language choice, sizes, dates and times
  as Windows lists them, and the server's errors in French (cookie,
  `Accept-Language`, field names, the error page).
- `tests/search.test.js`: the search's folder walk against a fake listing:
  every depth, links not followed, the folder, depth and concurrency
  limits, unreadable folders, cancellation.
- `tests/ftp.test.js`: path and range parsing, error mapping,
  `modifiedTime` for MLSD, Unix and DOS lines (the missing year included)
  and unknown dates, parity with the legacy parser on
  `tests/fixtures/listing-unix.txt`, and the gateway
  against a server. Covered: the exact `CWD a` / `CWD b` / `LIST`
  sequence, login-directory-relative paths, NAT'd PASV (and proof plain
  basic-ftp fails there), MLSD, the login-failure pause, the connection
  cap and queue, deadlines, abandoned requests.
- `tests/files-api.test.js`: browsing over HTTP: exact bytes, ranges, 416,
  `HEAD`, HTML/SVG served as attachments, PDF handling, servers without
  `SIZE`, FTP connections closing when a download is abandoned, a range is
  satisfied, or the reader stalls, and the audit of listings (the page's
  own checks, `auto=1`, once per 10 minutes).
- `tests/video.test.js`: telling browser-ready MP4s apart (built box by box
  in `tests/helpers/mp4.js`), and the converter with a stand-in for ffmpeg
  (`tests/helpers/fake-ffmpeg.js`): passthrough, temporary files cleaned
  up, the whitelists, shared and cached results, which failures are
  remembered, the queue limit. With ffmpeg installed it also converts real
  XviD clips, in AVI and in MP4; without, those tests are skipped.
- `tests/play-api.test.js`: `/play` over HTTP: an H.264 MP4 named `.avi`
  goes out untouched, other clips are converted, ranges, `HEAD`, the size
  limit with and without `SIZE`, errors, the audit trail, and a server
  without ffmpeg.
- `tests/zip.test.js`: the ZIP writer, read back by a central-directory
  reader of its own: exact bytes, CRCs, UTF-8 names, DOS times from clip
  names, empty, failed and cut-off entries, duplicate names, the limits.
- `tests/zip-api.test.js`: the ZIP export over HTTP against the fake FTP
  server: one login per archive, the link's rules (single use, its user, 2
  minutes), the 400 / 404 / 503 answers, `HEAD`, an abandoned download,
  a missing or cut-off file listed in `ERRORS.txt` / `ERREURS.txt`, a
  lost connection reopened once, the audit line.
- `tests/http.test.js`: the real server on an ephemeral port with a
  throwaway data directory (`tests/helpers/app.js`): pages, static files,
  headers, sign-in (a folder or clip link survives it), sign-out,
  throttling, proxy handling, the audit trail.
- `tests/hygiene.test.js`: fails if the repository tracks runtime data
  (shortcut JSON, `data.csv`, `data/`, `.env`) or any routable IPv4 address.
  It exists because of the 2026-04-21 leak.
- `tests/deploy.test.js`: guards on the deployment files. The
  `.dockerignore` allowlist, no blanket `COPY`, a non-root user, ffmpeg in
  the image, the app service unpublished and hardened, Caddy's keep-alive
  below the app's, and a pipeline that deploys only `main`, only when
  enabled, only to the pinned host key, with server details kept secret.
- `tests/deploy-script.test.js`: `qfe-deploy` run by bash against a
  throwaway git origin and a fake `docker`: it deploys commits of `main`,
  refuses any other request without touching anything, and rolls back a
  version that doesn't come up. Linux and macOS (CI); skipped on Windows.

`tests/helpers/fake-ftp-server.js` is a small, real FTP server (`node:net`,
read-only) with switches for awkward servers: no EPSV, a private PASV
address, MLSD, no `SIZE`/`REST`, connection caps, stalls, slow listings.
It logs every command, so tests can assert what was sent. No test ever
touches a real FTP server.

For development, `npm run dev:ftp` serves a demo tree on `127.0.0.1:2121`
(user `demo`, password `demo`): a real PNG and PDF, accented names,
HTML/SVG files that must download, and a `Cameras` folder of clips named
the way recorders name them, for the Caméra and Date columns, the filters
and the viewer's steps. Two cameras use 12-digit stamps and a third channel
Unix seconds, dated back from the moment the server starts; their content
is filler, so they don't play. `node tests/dev-ftp.js --root <folder>`
serves a local folder instead, e.g. real clips to try video seeking.

CI (`.github/workflows/ci.yml`) runs the suite on Node 22 and 24 for every
push and pull request, and builds and smoke-tests the Docker image: hardened
as in production, it must answer `/healthz`, report video conversion on,
and pass its own health check. Pushes to `main` then deploy (below).

## Deployment

See the [deployment guide](deployment.md). In short:

- `Dockerfile`: `node:24-alpine` plus Alpine's ffmpeg, production
  dependencies only, code owned by root, the app runs as `node`, health
  check on `/healthz`.
- `docker-compose.yml`: the app (not published, read-only filesystem, no
  capabilities, `no-new-privileges`, 512 MB, `TRUST_PROXY=1`, a `qfe-data`
  volume) behind Caddy (`deploy/Caddyfile`), which serves `DOMAIN` with an
  automatic certificate. Logs rotate at 5 × 10 MB.
- `deploy/bootstrap.sh`: prepares a fresh Debian or Ubuntu server once
  (Docker from Docker's repository, firewall, automatic updates, the
  `deploy` user, the checkout in `/opt/quick-ftp-explorer`, `.env`).
- Continuous deployment: after the tests and the image check, the `deploy`
  job of `ci.yml` sends `deploy <commit>` over SSH, with a key that can run
  nothing but `qfe-deploy` (`deploy/remote-deploy.sh`). That script checks
  the commit is on `main`, checks it out, rebuilds, restarts with
  `docker compose up --wait`, and returns to the previous commit if the app
  doesn't come up healthy. It is switched on by the `DEPLOY_ENABLED`
  variable; the server's details are GitHub secrets.
