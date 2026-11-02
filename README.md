# Quick FTP Explorer

A small self-hosted web app to browse the FTP accounts of your sites and open
the files they contain &mdash; camera footage, snapshots, PDFs &mdash; with
as little friction as possible. Deploy it once on a server; everyone else opens a URL,
signs in and browses, from any device, with nothing to install.

> It started as a zero-install Windows HTA (`mshta.exe` + `curl.exe`).
> Corporate security policies (AppLocker, WDAC, Defender
> attack-surface-reduction rules) block `mshta.exe` in most businesses, hence
> this web version. The HTA lives on, unchanged, in
> [`legacy/`](legacy/README.md).

## Features

- **File-Explorer-style browsing.** The sites and their folders on the
  left, starting from *All sites*; on the right, a list with **Camera** and
  **Date** columns read from the clips' names (else the FTP time, in the
  browser's time zone), newest first, with a heading per day. Breadcrumb
  links, Back / Forward / Up, refresh, resizable panes.
- **Sort and filter.** Sort by any column, from the headers or a *Sort*
  list that says the order in words. Filter by period (last hour, today,
  yesterday, around a given time, a custom range…), camera and file type,
  each choice with its count.
- **Select like in Explorer.** A click selects, a double-click or Enter
  opens; Ctrl, Shift, check boxes and Ctrl+A select several files. The
  keyboard reaches everything: arrow keys in the list and the tree,
  Shift+F10 for the right-click menus everyone gets, Ctrl+F for the search,
  `?` for help.
- **Step through clips.** The viewer has Previous / Next through the list
  as shown (or the selection), can play clips one after another, and the
  Back button closes it.
- **Several clips as one ZIP.** Up to 200 files of a site download as a
  single archive, streamed as it is built; a file that couldn't be added is
  listed in an `ERRORS.txt` inside it.
- **Keeps up with new clips.** The open folder is checked every minute
  while someone is looking at it; new files are announced ("2 new files ·
  Show") and tagged, never slipped in under the pointer.
- **In French and in English.** The interface follows the browser's
  language, with a switch to change it; error messages, dates and sizes
  too.
- **Search that finds things.** Files and folders by name, in the open
  folder and all its subfolders or in every site, ignoring case and
  accents; results show where each one is, and follow the sort and the
  filters.
- **Links and the Back button.** The address bar names the open folder:
  bookmark it, or copy a link to a folder or to one clip, which opens in
  the viewer (links survive the sign-in page). Back, Forward and F5 bring
  back the search, the filters and the selection.
- **Phones too.** On narrow screens the sites become a slide-in panel;
  each row shows its date under the name; sort, filters and a selection
  mode sit within thumb reach.
- **Open files in the browser.** Images in a viewer with zoom and pan;
  video and audio in the browser's player, with seeking; PDFs and text in a
  new tab; everything else downloads.
- **Camera clips just play.** Videos browsers can't decode (XviD/MPEG-4 in
  `.avi`, `.mkv`, `.dav`...) are converted to H.264 on the server with
  ffmpeg, and MP4 files a camera named `.avi` play as they are.
- **Personal accounts.** Admins manage the shared sites (`+ New site`, or
  right-click for Edit / Delete); everyone else browses.
- **Safe by design.**
  - FTP passwords never reach a browser.
  - Files on the FTP server can never run script in the app.
  - Writes are protected against cross-site requests.
  - Sign-ins are throttled.
  - An audit trail records sign-ins, site changes, every opened file or
    folder, and every ZIP download.
- **Works where the HTA worked.** Passive mode behaves like curl, so FTP
  servers behind NAT keep working. Paths are relative to the login
  directory, as before. Existing HTA shortcuts import as they are.
- **Gentle on your FTP server.** All users now connect from one IP, so
  connections per server are capped and queued, a failing login pauses
  the site instead of risking an IP ban, and a ZIP uses a single
  connection.
- **Small.** Node.js plus one dependency
  ([`basic-ftp`](https://github.com/patrickjuchli/basic-ftp)), and ffmpeg
  for video conversion (the Docker image includes it). No framework, no
  build step.

## Try it locally

Requirements: Node.js 22.2 or newer. Optional: [ffmpeg](https://ffmpeg.org/)
on the `PATH` (or `FFMPEG_PATH`), to play videos browsers can't decode.

```
npm install
npm run cli -- user add alice --admin    # first account; prompts for a password
npm run dev:ftp                          # terminal 1: a demo FTP server on 127.0.0.1:2121
npm run dev                              # terminal 2: the app on http://127.0.0.1:8080
```

Sign in, click **+ New site**, and create a site with username `demo`, host
`127.0.0.1` and port `2121`. The password defaults to the username. You can
now browse a demo tree with an image, a PDF, accented names, HTML and SVG
files that download instead of rendering, and a `Cameras` folder of clips
named the way recorders name them (`1234_Cam 1_<time>.avi`), dated from
the moment the demo server started: try the Camera and Date columns, the
filters and Previous / Next in the viewer. Their content is filler, so the
viewer says they can't be played.

To bring your HTA shortcuts along:
`npm run cli -- import legacy/config/shortcuts`.

## Deploying

On a Linux server with Docker and a domain name pointing at it:

```
git clone https://github.com/H-uG0/quick-ftp-explorer.git && cd quick-ftp-explorer
cp .env.example .env            # set DOMAIN, DEFAULT_FTP_HOST, FTP_ALLOWED_HOSTS
docker compose up -d --build    # the app + Caddy, which gets the HTTPS certificate
docker compose exec app node server/cli.js user add alice --admin
```

On a fresh Debian or Ubuntu server, `deploy/bootstrap.sh` does all of that
in one go, and GitHub Actions can then deploy every push to `main` over SSH,
rolling back if the new version doesn't come up
([continuous deployment](docs/deployment.md#13-continuous-deployment)).

The [deployment guide](docs/deployment.md) covers what it doesn't:
preparing the FTP server now that all users connect from one IP, importing
the HTA's shortcuts, accounts, updates, backups, the audit trail, running
behind an existing reverse proxy, and running without Docker.

## Documentation

- User manual: [English](docs/user-manual.en.md) &middot; [Français](docs/user-manual.fr.md)
- [Deployment guide](docs/deployment.md), for administrators
- [Architecture](docs/architecture.md): request pipeline, accounts and
  sessions, the shortcut store, the FTP gateway, the browser UI,
  configuration, tests.
- [Product and design principles](PRODUCT.md): who it is for, and the
  Dessaud Alarme Service look.
- The original Windows app: [`legacy/`](legacy/README.md)

## Development

```
npm run dev       # restarts on changes to server/ or public/
npm run dev:ftp   # demo FTP server; `node tests/dev-ftp.js --root <folder>` serves a real folder
npm test          # node:test, no test dependencies, no real FTP server needed
```

Runtime data (accounts, shortcuts, session secret, audit log) goes to
`./data/`. It is gitignored and must never be committed: shortcut files
hold FTP passwords. Settings come from environment variables, or a local
`.env` file; see the [configuration table](docs/architecture.md#configuration).

## License

[MIT](LICENSE)
