# Architecture

Quick FTP Explorer is a small self-hosted web app. A browser cannot speak
FTP, so a Node.js server on the VPS is the gateway: it holds the accounts and
the shortcuts (including their FTP passwords), talks FTP to the servers, and
streams files to signed-in users over HTTPS.

```
browser ──HTTPS──> reverse proxy (TLS) ──HTTP──> Node app ──FTP──> FTP server
                                                    │
                                                    └── data/  accounts, secret, audit log
```

The original Windows HTA lives in [`legacy/`](../legacy/README.md) with its
own [architecture notes](../legacy/docs/architecture.md).

## Principles

- **Node.js built-ins only** (`node:http`, `node:crypto`, `node:test`); no
  web framework. The one planned runtime dependency is `basic-ftp`, for the
  FTP protocol itself.
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
| `server/audit.js` | Append-only audit trail (`audit.jsonl`). |
| `server/files.js` | Atomic writes (temp file + rename) and JSON reads. |
| `server/cli.js` | Account administration from the server's shell. |

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
   500. An error after the response started aborts the connection, so a
   client never mistakes a broken response for a complete one.
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

## Audit trail

`data/audit.jsonl` gets one JSON object per line for security-relevant
events: `login`, `login_failed`, `login_blocked`, `logout`, each with time,
user and client IP. CCTV footage is personal data, so who accessed what
must be accountable. Writes are queued so lines never interleave, and a
failed write is reported on stderr without failing the request.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `HOST` | `127.0.0.1` | Interface to listen on (`0.0.0.0` in Docker). |
| `PORT` | `8080` | Port to listen on. |
| `DATA_DIR` | `./data` | Accounts, session secret and audit log. Back it up; never commit it. |
| `TRUST_PROXY` | off | Trust `X-Forwarded-Proto` / `X-Forwarded-For` from a reverse proxy. |
| `SESSION_SECRET` | generated | HMAC key for sessions (≥ 32 characters). |
| `SESSION_TTL_HOURS` | `12` | Session lifetime. |

`npm run dev` and `npm run cli` also read a local `.env` file when present.

## Tests

`npm test` runs `node:test` over `tests/*.test.js` with no test
dependencies:

- `tests/auth.test.js`: hashing, the account store, tokens (tampering,
  expiry, revocation), the session secret, the limiter.
- `tests/http.test.js`: the real server on an ephemeral port with a
  throwaway data directory (`tests/helpers/app.js`): pages, static files,
  headers, sign-in, sign-out, throttling, proxy handling, the audit trail.
- `tests/hygiene.test.js`: fails if the repository tracks runtime data
  (shortcut JSON, `data.csv`, `data/`, `.env`) or any routable IPv4 address.
  It exists because of the 2026-04-21 leak.

CI (`.github/workflows/test.yml`) runs the suite on Node 22 and 24 for every
push and pull request.
