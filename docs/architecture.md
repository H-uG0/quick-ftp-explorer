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

- **Roles:** `admin` will manage shortcuts; `user` browses only.
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

A shortcut is one FTP account to browse. Shortcuts are shared by everyone
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

`GET /api/me` returns `{ username, role }`, plus, for admins only, the
`defaults: { host, port }` that prefill the "New shortcut" form
(`DEFAULT_FTP_HOST`, `DEFAULT_FTP_PORT`). FTP passwords appear in no
response at all. Browsing only needs a label, so regular users are not even
told where the FTP server lives.

### Browsing API

| Method + path | Role | Response |
|---|---|---|
| `GET /api/shortcuts/:id/list?path=/a/b` | user | `{ path, entries: [{ name, isDir, isLink, size, date, modified }] }` (see [Listings](#listings)) |
| `GET` or `HEAD /api/shortcuts/:id/file?path=/a/b/c.mp4[&download=1]` | user | The file, streamed, with `Range` support |
| `GET` or `HEAD /api/shortcuts/:id/play?path=/a/b/c.avi` | user | The video as an MP4 the browser can play, with `Range` support ([Playing videos](#playing-videos)) |
| `POST /api/shortcuts/:id/zip` with `{ paths, localTime }` | user | `{ url, count, name }`: a single-use link to those files as one ZIP ([ZIP export](#zip-export)) |
| `GET` or `HEAD /api/zip/:token` | user | That ZIP, streamed while it is built |

The entry shape is the one the HTA's parser produced, so the ported UI
consumes it unchanged. See [The FTP gateway](#the-ftp-gateway) below.

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
It is a port of the HTA's `ui/`: same two-panel layout, same module
boundaries, same behaviour, minus the IE11 workarounds (ES5, `className`
regexes, `onmousewheel`, simulated clicks).

| File | Role | HTA counterpart |
|---|---|---|
| `index.html` | The explorer page | `quick-ftp-explorer.hta` |
| `login.html`, `js/login.js` | The sign-in form, and why the last attempt bounced | (none) |
| `js/api.js` | Every server call; a 401 sends the page back to sign-in | `shell.js` + `config.js` + `ftp.js` |
| `js/ui.js` | `tree` (left pane) and `files` (right-pane table) | `ui.js` |
| `js/viewer.js` | Modal viewer: images (zoom / pan), video and audio | `viewer.js` (images only) |
| `js/app.js` | Wiring: selection, breadcrumb, search, opening files, splitter, shortcut management | `app.js` |
| `js/util.js` | Pure helpers (paths, sizes, natural sort, labels, search matching), unit-tested | (inline in `ui.js` / `app.js`) |
| `js/search.js` | The folder walk behind the search box, unit-tested | (none: the HTA filtered one folder) |
| `js/i18n.js` | Every text in English and French, shared with the server; the language; French sizes and dates | (none: English only) |
| `js/filetypes.js` | File kinds and inline types, shared with the server | `kindFor` in `ui.js` |
| `js/icons.js` | The tree's and table's line icons, built as DOM nodes | emoji in `ui.js` |
| `styles.css` | The File-Explorer layout in the Dessaud Alarme Service colours, as OKLCH custom properties | `styles.css` |
| `logo.svg` | The logo and favicon: a folder holding a camera lens, on the brand red | (none) |

**Search, as in File Explorer.** The top bar's box finds files and folders
by name in the open folder and all its subfolders, or in every site when
none is open (matching sites are listed first). `search.js` walks the
folders through `tree.listing`, so it shares the listing cache: a second
search of a place is instant, and opening a folder found by a search
needs no new listing. The walk reads at most 6 folders at a time and 300
in all, 10 levels deep, and never follows links, so one search can't flood
the FTP server. Typing only re-filters what has been read: words are
folded (lower case, no accents) and must all appear, in any order
(`matchFolded` in `util.js`), and the matched parts are highlighted with
`<mark>` text nodes. Going to any folder ends the search, as in File
Explorer; `Esc` clears it. At most 500 results are drawn.

**One listing per folder, shared by both panes.** `tree.listing(sc, path)`
returns a cached promise; the tree and the right pane both use it. In the
HTA the right pane depended on the tree having rendered the folder's node,
which caused two bugs that are gone now:

- after a failed listing, the right pane stayed on "Loading…";
- clicking a folder while the search hid its tree node did the same.

Failed listings are retried on the next request. **↻** (`tree.refresh`)
drops one folder's listing and loads it again. Responses that arrive after
the user moved on are ignored.

**Navigation.** `tree.reveal(sc, path)` marks the shortcut, every folder on
the way and the target as open, selects the target, and re-renders. Nodes
fill in as their parents' listings arrive. Breadcrumb segments and folder
rows in the table both navigate this way, so any folder can be reached
whether or not its ancestors were open. In the HTA, the target had to be
rendered already.

**The URL names the open folder.** `#/<shortcut id>/<folder>/<folder>`,
each part URL-encoded (`formatHash` / `parseHash` in `util.js`):

- Every navigation pushes a history entry, unless the URL already names
  that folder, so Back and Forward move between folders and loops are
  impossible.
- `popstate` / `hashchange` and page load call `followUrl()`, which
  reveals the folder. Links to unknown shortcuts are dropped quietly.
- Signing in keeps the link. Browsers carry the fragment across the
  `/` → `/login` redirect; `login.js` copies it into the form's `next`
  field, and the server redirects back to `/` + `next` after sign-in.
  `next` is accepted only as `#/` followed by printable ASCII, so it can
  never redirect out of the app.
- An expired session (a 401 from the API) keeps it too.

**Narrow screens** (≤ 700 px, i.e. phones). The left pane becomes a drawer
behind a **☰** button. It starts open when no folder is shown, and closes
on any selection, on `Esc` or on a tap outside. The table drops its Type
and Modified columns, the splitter disappears and the top bar compacts.
CSS media queries do most of it; `app.js` only toggles `drawer-open`.

**Opening a file** follows `filetypes.js`:

- images, playable audio and **every video** open in the viewer;
- other inline types (PDF, text) open in a new tab;
- everything else is fetched with `download=1`.

The viewer uses the browser's own `<video>` / `<audio>`, which seek
through HTTP range requests. MP4, WebM and MOV files stream straight from
FTP, and if the browser can't decode one, the viewer switches to `/play`.
Other videos (AVI, MKV, DAV...) go to `/play` at once. Closing the viewer
removes the media source, which aborts the request and so frees the FTP
connection. When nothing plays, the viewer asks the server why (a one-byte
request returns the JSON error) and shows that, with a download link.

**Roles in the UI.** Admins get `+ New` and a right-click menu (New / Edit
/ Delete); everyone else keeps the browser's own context menu. Shortcut
forms show server errors inline (400/409) instead of `alert()`. Edit leaves
the password empty, because the stored one never reaches the browser.

**English and French.** `i18n.js` holds every text in both languages, as
one table that the server imports too (like `filetypes.js`), with plural
forms chosen by `Intl.PluralRules` and numbers by `toLocaleString`
("12 345 résultats"). The language is the `qfe_lang` cookie, set by the
switch in the status bar and on the sign-in page, else the best match of
the browser's preferences (`Accept-Language`, `navigator.languages`),
else English. Pages carry `data-i18n` / `data-i18n-attr` keys and start
hidden (`i18n-pending`) until `translatePage()` has run, with a one-second
CSS fallback so a broken script can never leave a blank page. Sizes read
"1,5 Ko" and the listing's Unix dates ("Apr 01 2026") "1 avr. 2026" in
French. On the server, `HttpError` takes `msg(key, params)`: logs and
tests see English, and `fail()` answers in the reader's language, the
error page included; parameters can be messages themselves (a field name
inside "{field} is required"), and FTP replies stay as the server sent
them.

**Look and accessibility.** The palette comes from the Dessaud Alarme
Service logo: an ink navy carries the frame (top bar, sign-in header,
primary buttons), and the signal red is kept for the logo and for errors.
Neutrals are tinted toward the navy. The colours are OKLCH custom
properties at the top of `styles.css`, and text and controls meet WCAG AA
contrast. Sizes are in `rem`, so the browser's text-size setting applies;
on phones every row and button is at least 44 px tall; and
`prefers-reduced-motion` turns transitions off. The product and design
principles behind these choices are in [PRODUCT.md](../PRODUCT.md).

**Safety.** Every name that comes from an FTP server reaches the page via
`textContent` / DOM nodes, never as HTML. The page has no inline scripts or
styles, so it runs under the strict `default-src 'self'` CSP. Only the
splitter width is kept in `localStorage`, as a convenience.

## Audit trail

`data/audit.jsonl` gets one JSON object per line for security-relevant
events, each with time, user and client IP:

- `login`, `login_failed`, `login_blocked`, `logout`;
- `shortcut_create`, `shortcut_update` (with `renamedTo` after a rename),
  `shortcut_delete`, each with the shortcut `id`;
- `list` (shortcut `id` and `path`), `file` (`id`, `path`, and
  `download: true` for forced downloads) and `play` (`id`, `path`: a video
  opened through `/play`). A file is logged once per opening: ranged
  requests that do not start at byte 0 (video seeks) are not logged again;
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
| `DEFAULT_FTP_HOST` | `127.0.0.1` | Host prefilled in the "New shortcut" form. |
| `DEFAULT_FTP_PORT` | `21` | Port prefilled in the "New shortcut" form. |
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
  paths, folder links, search matching with accents and several words).
- `tests/i18n.test.js`: both languages have every text with the same
  slots, every key the code and pages use exists, plurals and number
  formats, the language choice, sizes and dates, and the server's errors
  in French (cookie, `Accept-Language`, field names, the error page).
- `tests/search.test.js`: the search's folder walk against a fake listing:
  every depth, links not followed, the folder, depth and concurrency
  limits, unreadable folders, cancellation.
- `tests/ftp.test.js`: path and range parsing, error mapping, parity with
  the legacy parser on `tests/fixtures/listing-unix.txt`, and the gateway
  against a server. Covered: the exact `CWD a` / `CWD b` / `LIST`
  sequence, login-directory-relative paths, NAT'd PASV (and proof plain
  basic-ftp fails there), MLSD, the login-failure pause, the connection
  cap and queue, deadlines, abandoned requests.
- `tests/files-api.test.js`: browsing over HTTP: exact bytes, ranges, 416,
  `HEAD`, HTML/SVG served as attachments, PDF handling, servers without
  `SIZE`, and FTP connections closing when a download is abandoned, a
  range is satisfied, or the reader stalls.
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
  headers, sign-in, sign-out, throttling, proxy handling, the audit trail.
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
(user `demo`, password `demo`): a real PNG and PDF, accented names, and
HTML/SVG files that must download. `node tests/dev-ftp.js --root <folder>`
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
