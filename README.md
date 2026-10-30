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
> The web app is being built at the root of this repository. Until it lands,
> use the HTA, which now lives in [`legacy/`](legacy/README.md) and keeps
> working wherever `mshta.exe` is allowed.

## License

[MIT](LICENSE)
