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
> The web app is being built at the root of this repository: personal
> accounts and sign-in work today; the file browser comes next. Until it
> lands, use the HTA, which now lives in [`legacy/`](legacy/README.md) and
> keeps working wherever `mshta.exe` is allowed.

## Development

Requirements: Node.js 22 or newer. There are no runtime dependencies yet.

```
npm install
npm run cli -- user add alice --admin    # first account (prompts for a password)
npm run dev                              # http://127.0.0.1:8080, restarts on changes
npm test
```

Runtime data (accounts, session secret, audit log) goes to `./data/`, which
is gitignored. Settings come from environment variables (or a local `.env`
file); every one has a working default. See
[`docs/architecture.md`](docs/architecture.md) for the configuration table,
the request pipeline and the session design.

## License

[MIT](LICENSE)
