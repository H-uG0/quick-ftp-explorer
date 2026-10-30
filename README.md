# Quick FTP Explorer

Browse saved FTP-server shortcuts and open the files they contain &mdash;
camera footage, snapshots, PDFs &mdash; with as little friction as possible.

> **Work in progress: moving to a web app.** The original version is a
> zero-install Windows HTA (`mshta.exe` + `curl.exe`). Corporate security
> policies (AppLocker, WDAC, Defender attack-surface-reduction rules)
> commonly block `mshta.exe`, which makes it unusable in most businesses. The
> project is therefore becoming a small self-hosted web app: deploy it once on
> a VPS, then everyone opens a URL, signs in and browses &mdash; from any
> device, with nothing to install.
>
> The web app is being built at the root of this repository. The server
> side works today: personal accounts and sign-in, the shortcut store
> (including import of your HTA shortcuts), and the FTP gateway (folder
> listings, and file streaming with seeking). The browser UI on top of it
> comes next. Until it lands, use the HTA, which now lives in
> [`legacy/`](legacy/README.md) and keeps working wherever `mshta.exe` is
> allowed.

## Development

Requirements: Node.js 22 or newer. The only runtime dependency is
[`basic-ftp`](https://github.com/patrickjuchli/basic-ftp).

```
npm install
npm run cli -- user add alice --admin           # first account (prompts for a password)
npm run cli -- import legacy/config/shortcuts   # optional: bring your HTA shortcuts along
npm run dev                                     # http://127.0.0.1:8080, restarts on changes
npm run dev:ftp                                 # optional: a demo FTP server on 127.0.0.1:2121
npm test
```

With `npm run dev:ftp` running, a shortcut with host `127.0.0.1`, port
`2121` and username `demo` browses a demo tree; no real FTP server needed.

Runtime data (accounts, shortcuts, session secret, audit log) goes to
`./data/`, which is gitignored. Settings come from environment variables (or a local `.env`
file); every one has a working default. See
[`docs/architecture.md`](docs/architecture.md) for the configuration table,
the request pipeline and the session design.

## License

[MIT](LICENSE)
