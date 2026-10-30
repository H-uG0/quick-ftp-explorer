# Quick FTP Explorer

A small self-hosted web app to browse saved FTP shortcuts and open the files
they contain &mdash; camera footage, snapshots, PDFs &mdash; with as little
friction as possible. Deploy it once on a server; everyone else opens a URL,
signs in and browses, from any device, with nothing to install.

> It started as a zero-install Windows HTA (`mshta.exe` + `curl.exe`).
> Corporate security policies (AppLocker, WDAC, Defender
> attack-surface-reduction rules) block `mshta.exe` in most businesses, hence
> this web version. The HTA lives on, unchanged, in
> [`legacy/`](legacy/README.md).

## Features

- **File-Explorer-style browsing.** Shortcut and folder tree on the left,
  name / type / size / modified table on the right, breadcrumb, live search,
  refresh, resizable panes.
- **Links and the Back button.** The address bar names the open folder:
  bookmark it, send it to a colleague (it survives the sign-in page), and
  move between folders with Back and Forward.
- **Phones too.** On narrow screens the shortcuts become a slide-in panel
  and the table keeps only what fits.
- **Open files in the browser.** Images in a viewer with zoom and pan;
  video and audio in the browser's player, with seeking; PDFs and text in a
  new tab; everything else downloads.
- **Personal accounts.** Admins manage the shared shortcuts (`+ New`, or
  right-click for Edit / Delete); everyone else browses.
- **Safe by design.**
  - FTP passwords never reach a browser.
  - Files on the FTP server can never run script in the app.
  - Writes are protected against cross-site requests.
  - Sign-ins are throttled.
  - An audit trail records sign-ins, shortcut changes and every opened file
    or folder.
- **Works where the HTA worked.** Passive mode behaves like curl, so FTP
  servers behind NAT keep working. Paths are relative to the login
  directory, as before. Existing HTA shortcuts import as they are.
- **Gentle on your FTP server.** All users now connect from one IP, so
  connections per server are capped and queued, and a failing login pauses
  the shortcut instead of risking an IP ban.
- **Small.** Node.js plus one dependency
  ([`basic-ftp`](https://github.com/patrickjuchli/basic-ftp)). No framework,
  no build step.

## Try it locally

Requirements: Node.js 22 or newer.

```
npm install
npm run cli -- user add alice --admin    # first account; prompts for a password
npm run dev:ftp                          # terminal 1: a demo FTP server on 127.0.0.1:2121
npm run dev                              # terminal 2: the app on http://127.0.0.1:8080
```

Sign in, click **+ New**, and create a shortcut with username `demo`, host
`127.0.0.1` and port `2121`. The password defaults to the username. You can
now browse a demo tree with an image, a PDF, accented names, and HTML and
SVG files that download instead of rendering.

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
