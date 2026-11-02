# Deploying Quick FTP Explorer

This guide is for the administrator who installs and runs Quick FTP
Explorer on a server. End users only need the address and an account; see
the [user manual](user-manual.en.md).

The recommended setup is **Docker Compose**: the app plus
[Caddy](https://caddyserver.com) in front of it, which obtains and renews
the HTTPS certificate on its own. On a fresh Debian or Ubuntu server (an
IONOS VPS, for instance) one script does the whole installation, and
GitHub Actions can then deploy every change on its own: see
[§13](#13-continuous-deployment). A [setup without
Docker](#10-without-docker) is described too.

```
users ──HTTPS──> Caddy (:443) ──> app (:8080, not published) ──FTP──> your FTP server
                                     └── volume qfe-data: accounts, shortcuts, audit log
```

---

## 1. What you need

- A **Linux server** (VPS) with a public IP address. 1 vCPU and 512 MB–1 GB
  of RAM are plenty. Every file a user opens streams through it, so check
  the monthly bandwidth allowance if staff watch a lot of footage. Videos
  browsers can't play (XviD, AVI...) are converted on the server with
  ffmpeg, which the image includes: for typical camera clips, a few seconds
  long, that takes well under a second of CPU.
- **Docker Engine** with the **Compose plugin** (`docker compose version`).
- A **domain name** you can point at the server, e.g. `files.example.com`.
- **Network access from the server to the FTP server**: the control port
  (21, or yours) and the passive data ports.

---

## 2. Prepare the network and the FTP server

1. **DNS.** Create an `A` (and `AAAA` if you have IPv6) record for your
   domain pointing at the server. Caddy needs it to obtain the
   certificate.
2. **Firewall on the server.** Open TCP 80 and 443 (and UDP 443 for
   HTTP/3), plus your SSH port. Nothing else needs to be reachable: the
   app's own port is never published.
3. **The FTP server.** With the HTA, each user connected from their own
   machine. Now **every user's traffic comes from this one server's IP
   address**. On the FTP server:
   - **Allow the server's IP** if the FTP server or its firewall filters by
     address. Allow the passive port range too.
   - **Per-IP connection limit.** If the FTP server has one, keep it at or
     above `FTP_MAX_CONNECTIONS` (default 10), or lower that setting to
     match.
   - **fail2ban and similar tools.** Exempt the server's IP from automatic
     bans. One shortcut with a wrong password must not lock everybody out.
     The app already pauses a shortcut for 5 minutes after a failed login.
   - **Read-only accounts with strong passwords.** The app only reads, and
     users never type FTP passwords any more. If these accounts are also
     used by cameras to upload, or still use password = username, consider
     creating dedicated read-only accounts with long random passwords, and
     put those in the shortcuts.

---

## 3. Install

On a fresh Debian or Ubuntu server, `deploy/bootstrap.sh` does all of this
section and more (Docker, firewall, automatic updates, the deploy user):
see [§13](#13-continuous-deployment). By hand:

```
git clone https://github.com/H-uG0/quick-ftp-explorer.git
cd quick-ftp-explorer
cp .env.example .env
nano .env                       # set DOMAIN, DEFAULT_FTP_HOST, ...
docker compose up -d --build
docker compose ps               # app should be "healthy", caddy "running"
```

Open `https://<your domain>`. The sign-in page should load over HTTPS. If
it doesn't, see [§12](#12-troubleshooting).

### Settings (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `DOMAIN` | (required) | Public hostname Caddy serves and gets a certificate for. |
| `DEFAULT_FTP_HOST` / `DEFAULT_FTP_PORT` | `127.0.0.1` / `21` | Prefilled in the "New shortcut" form. |
| `FTP_ALLOWED_HOSTS` | any | Comma-separated hosts shortcuts may point at. **Recommended**: set it to your FTP server. |
| `FTP_MAX_CONNECTIONS` | `10` | Simultaneous FTP connections per server, all users together. |
| `FTP_TIMEOUT_MS` | `15000` | How long the FTP server may stay silent before a request fails. |
| `CONVERT_MAX_MB` | `50` | Largest video the server converts or plays from memory; bigger ones are download-only. The server holds such a video in memory while it works, within the 512 MB limit of `docker-compose.yml`. |
| `FFMPEG_PATH` | `ffmpeg` | Only without Docker: where ffmpeg is, if it isn't on the `PATH`. |
| `SESSION_TTL_HOURS` | `12` | How long a sign-in lasts. |
| `SESSION_SECRET` | generated | Leave unset: a random secret is created in the data volume. Changing it signs everybody out. |

`docker-compose.yml` sets `HOST`, `PORT`, `DATA_DIR` and `TRUST_PROXY=1`
itself. After editing `.env`, run `docker compose up -d` to apply it.

---

## 4. The first administrator

```
docker compose exec app node server/cli.js user add alice --admin
```

You are prompted twice for the password (at least 10 characters, not
shown while typing). Sign in with it and you can manage shortcuts.

The server's log shows a reminder for as long as no account exists.

---

## 5. Shortcuts

Create them in the web interface (**+ New**), or import the HTA's shortcut
files. The format is the same. From the machine that has the HTA:

```
scp legacy/config/shortcuts/*.json you@server:qfe-shortcuts/
```

Then on the server:

```
cat ~/qfe-shortcuts/*.json | docker compose exec -T app node server/cli.js import -
rm -r ~/qfe-shortcuts           # they contain FTP passwords
```

The import validates every record like the web form does. It skips
shortcuts that already exist (add `--replace` to overwrite them), prints
one line per skipped or rejected file, and ends with a summary.

---

## 6. Accounts

All account commands run on the server:

```
docker compose exec app node server/cli.js user add bob            # a regular user
docker compose exec app node server/cli.js user add carol --admin  # an administrator
docker compose exec app node server/cli.js user passwd bob         # new password; signs bob out everywhere
docker compose exec app node server/cli.js user role bob admin     # or: user
docker compose exec app node server/cli.js user remove bob         # signs bob out everywhere
docker compose exec app node server/cli.js user list
```

Changes apply immediately, with no restart. Usernames are case-insensitive.
Once the first administrator exists, administrators can also do all of
this in the app, under **Accounts** in the status bar (user manual §8.4).
Give every person their own account: the audit trail is per account, and
removing someone affects nobody else.

---

## 7. Updating

With continuous deployment ([§13](#13-continuous-deployment)), every push to
`main` updates the server once the tests pass. By hand:

```
cd quick-ftp-explorer
git pull
docker compose build --pull app     # also picks up a patched Node.js base image
docker compose pull caddy
docker compose up -d
```

Sessions survive the update; nobody has to sign in again. Now and then,
build with `--pull --no-cache` instead: that also installs the latest
ffmpeg, whose layer Docker otherwise reuses until the base image changes.

---

## 8. Backups

Everything worth keeping is in the `qfe-data` volume:

| File | Contents |
|---|---|
| `users.json` | Accounts (password hashes) and roles |
| `shortcuts/*.json` | Shortcuts, **including FTP passwords** |
| `session.secret` | The session key |
| `audit.jsonl` | The audit trail |

Back it up while the app runs (the volume's name is prefixed with the
project directory's name; check with `docker volume ls`):

```
docker run --rm -v quick-ftp-explorer_qfe-data:/data:ro -v "$PWD":/backup alpine \
  tar czf /backup/qfe-data-$(date +%F).tgz -C /data .
```

Restore into a stopped app:

```
docker compose stop app
docker run --rm -v quick-ftp-explorer_qfe-data:/data -v "$PWD":/backup alpine \
  sh -c 'tar xzf /backup/qfe-data-YYYY-MM-DD.tgz -C /data && chown -R 1000:1000 /data'
docker compose start app
```

Store backups as carefully as the server itself: they contain FTP
passwords. The `caddy-data` volume holds certificates. Caddy can always
obtain new ones, so backing it up is optional.

---

## 9. Logs and the audit trail

- **Request log**: `docker compose logs -f app`. One line per request: time,
  client IP, user, method, URL, status, duration. Docker keeps 5 × 10 MB.
- **Audit trail**: `audit.jsonl` in the data volume. One JSON line per
  sign-in (including failures), shortcut change, folder listing and file
  opening. To read it:

  ```
  docker compose exec app cat /data/audit.jsonl | tail -n 50
  docker compose exec app grep '"user":"bob"' /data/audit.jsonl
  ```

Recordings from CCTV are personal data. The audit trail is how you account
for who accessed which recording. Define a retention period that fits your
obligations (under the GDPR, ask your data protection officer), then
archive and truncate the file accordingly. For example, from a monthly cron
job on the host:

```
docker compose exec -T app sh -c 'cat /data/audit.jsonl' | gzip > audit-$(date +%Y-%m).jsonl.gz
docker compose exec -T app sh -c ': > /data/audit.jsonl'
```

---

## 10. Without Docker

1. Install **Node.js 22.2 or newer**, **Caddy** and **ffmpeg** from your
   distribution's or the vendors' packages (`sudo apt install ffmpeg` on
   Debian and Ubuntu). Without ffmpeg the app still works, but videos
   browsers can't play are download-only; the service log says so at
   startup.
2. Install the app, without development files, as an unprivileged user:

   ```
   sudo useradd --system --home /opt/quick-ftp-explorer --shell /usr/sbin/nologin qfe
   sudo git clone https://github.com/H-uG0/quick-ftp-explorer.git /opt/quick-ftp-explorer
   cd /opt/quick-ftp-explorer && sudo npm ci --omit=dev
   sudo install -d -o qfe -g qfe -m 700 /var/lib/quick-ftp-explorer
   ```

3. A systemd unit, `/etc/systemd/system/quick-ftp-explorer.service`:

   ```
   [Unit]
   Description=Quick FTP Explorer
   After=network-online.target

   [Service]
   User=qfe
   WorkingDirectory=/opt/quick-ftp-explorer
   Environment=HOST=127.0.0.1 PORT=8080 DATA_DIR=/var/lib/quick-ftp-explorer TRUST_PROXY=1
   EnvironmentFile=-/etc/quick-ftp-explorer.env
   ExecStart=/usr/bin/node server/index.js
   Restart=on-failure
   NoNewPrivileges=true
   ProtectSystem=strict
   ReadWritePaths=/var/lib/quick-ftp-explorer
   PrivateTmp=true

   [Install]
   WantedBy=multi-user.target
   ```

   Then `sudo systemctl enable --now quick-ftp-explorer`. Put the
   `.env`-style settings in `/etc/quick-ftp-explorer.env` (mode 600).
   Video conversion writes each clip to `/tmp` while ffmpeg runs, and
   deletes it right after; `PrivateTmp` keeps it private to the service.

4. `/etc/caddy/Caddyfile`:

   ```
   files.example.com {
       encode zstd gzip
       reverse_proxy 127.0.0.1:8080 {
           transport http {
               keepalive 30s
           }
       }
   }
   ```

5. Run the CLI as the service user, with the same data directory:

   ```
   sudo -u qfe env DATA_DIR=/var/lib/quick-ftp-explorer node server/cli.js user add alice --admin
   ```

### Behind an existing reverse proxy

If the server already runs nginx (or another proxy) on ports 80/443, drop
the `caddy` service and publish the app on the loopback interface only.
Create a `docker-compose.override.yml`:

```yaml
services:
  app:
    ports:
      - "127.0.0.1:8080:8080"
  caddy:
    profiles: ["disabled"]
```

Then proxy to it. With nginx:

```
location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_buffering off;          # stream videos instead of buffering them
    proxy_read_timeout 1h;        # long downloads
    client_max_body_size 64k;
}
```

Whatever the proxy, it must pass the original `Host`, set
`X-Forwarded-Proto` and **append** the client address to
`X-Forwarded-For`. The app takes the rightmost entry as the client.

---

## 11. Security checklist

- HTTPS only: Caddy redirects HTTP and sends HSTS (via the app).
- The app's port is not published (Docker), or listens on `127.0.0.1` only
  (systemd). `TRUST_PROXY=1` is safe **only** in that situation.
- Set `FTP_ALLOWED_HOSTS` to your FTP server: shortcuts can then never point
  elsewhere.
- One account per person; remove accounts when people leave
  (`user remove` ends their sessions at once).
- Keep the image up to date ([§7](#7-updating)).
- Restrict access to the data volume and its backups: they contain FTP
  passwords.

The container already runs as a non-root user, with a read-only
filesystem, no Linux capabilities, `no-new-privileges` and a 512 MB memory
limit. See `docker-compose.yml`.

---

## 12. Troubleshooting

| Symptom | Check |
|---|---|
| No certificate / browser warning | `docker compose logs caddy`. The DNS record must point at the server, and ports 80 and 443 must be open. |
| `app` never becomes healthy | `docker compose logs app`; often an invalid `.env` value, reported at start. |
| *Can't reach the FTP server* | From the server, test the FTP port, e.g. `nc -vz <ftp host> 21`. Firewall or allowlist on the FTP side? |
| Listings time out but sign-in to FTP works | Passive data ports blocked between the server and the FTP server. Open them for the server's IP. |
| *The FTP server refused the connection: 421 …* | The FTP server's per-IP limit is lower than `FTP_MAX_CONNECTIONS`: lower the setting. |
| *FTP login failed: 530* on every shortcut at once | The server's IP may have been banned or not allowed by the FTP server ([§2](#2-prepare-the-network-and-the-ftp-server)). |
| Users are signed out after every update | `SESSION_SECRET` is set to a value that changes, or the data volume was recreated. |
| Videos won't play: *the server has no converter (ffmpeg)* | Without Docker: install ffmpeg, or set `FFMPEG_PATH`. The app's startup lines say whether conversion is on. |
| Videos won't play: *too big to play here* | Over `CONVERT_MAX_MB`: raise it (memory permitting), or download the file ([user manual §6.2](user-manual.en.md#62-video-and-audio)). |

### Trying the stack locally

`DOMAIN=localhost` works for a local test: Caddy then uses its own local
certificate authority, so browsers show a certificate warning. To test
against the demo FTP server (`npm run dev:ftp` on the host), use
`host.docker.internal` as the shortcut's host.

---

## 13. Continuous deployment

Once it is set up, every push to `main` is tested, built into the Docker
image, smoke-tested, then deployed to the server over SSH. A deployment
that doesn't come up healthy rolls itself back. Until it is switched on
(`DEPLOY_ENABLED`, below), the pipeline only tests.

```
push to main ──> tests (Node 22, 24) ──────┐
                 image: build + smoke test ┴─> ssh deploy@server "deploy <commit>"
                                                └─> qfe-deploy: checkout, build, restart, health check
                                                    (back to the previous commit if unhealthy)
```

The pieces: `.github/workflows/ci.yml` (the pipeline),
`deploy/bootstrap.sh` (prepares the server, once) and
`deploy/remote-deploy.sh` (installed on the server as `qfe-deploy`).

### 13.1 What to ask the server's owner

- **SSH access** as `root` (or a user with `sudo`): the server's IP
  address, its SSH port, and a password or, better, your public key.
- **The system:** Debian 12 or Ubuntu 22.04 / 24.04. On a new IONOS VPS,
  pick Ubuntu 24.04.
- **A domain name** for the app (for example `videos.` + the company's
  domain), and someone who can create its DNS `A` record pointing at the
  server.
- **IONOS:** the server's firewall policy in the Cloud Panel must allow TCP
  22, 80 and 443 (and UDP 443 for HTTP/3). The default Linux policy also
  opens TCP 8443, which the app doesn't use.
- **The FTP server:** allow the new server's IP address, as in
  [§2](#2-prepare-the-network-and-the-ftp-server).

### 13.2 Setting it up, once

1. **A key pair for the pipeline**, on your PC. No passphrase: GitHub keeps
   the private half as a secret.

   ```
   ssh-keygen -t ed25519 -N "" -C github-actions -f qfe-ci
   ```

2. **Prepare the server.** Connect as `root` and run the bootstrap script,
   pasting the one line of `qfe-ci.pub` after `--ci-key`:

   ```
   curl -fsSLO https://raw.githubusercontent.com/H-uG0/quick-ftp-explorer/main/deploy/bootstrap.sh
   less bootstrap.sh               # read what you run as root
   bash bootstrap.sh --domain files.example.com --ftp-host 192.0.2.10 --ftp-port 21 \
     --ci-key "ssh-ed25519 AAAA... github-actions"
   ```

   It installs Docker from Docker's own repository, git and automatic
   security updates; opens the SSH port, 80 and 443 in the firewall; creates
   the `deploy` user; clones the app into `/opt/quick-ftp-explorer`; writes
   `.env` (`--ftp-host` also becomes `FTP_ALLOWED_HOSTS`); then builds and
   starts the stack. `bash bootstrap.sh --help` lists the options; running
   it again is safe. It ends with the server's SSH host key fingerprints and
   the commands for the first administrator and the shortcut import
   ([§4](#4-the-first-administrator), [§5](#5-shortcuts)).

3. **Pin the server's host key.** On your PC:

   ```
   ssh-keyscan -p 22 <server address> > known_hosts
   ssh-keygen -lf known_hosts
   ```

   The fingerprints must match those the bootstrap script printed;
   otherwise you are not talking to your server.

4. **GitHub.** In the repository's *Settings → Environments*, create an
   environment named `production`. Optionally add *Required reviewers*,
   so that each deployment waits for an approval, and limit its deployment
   branches to `main`. Then add these **environment secrets**:

   | Secret | Value |
   |---|---|
   | `DEPLOY_HOST` | the server's IP address or hostname |
   | `DEPLOY_PORT` | its SSH port, if it isn't 22 |
   | `DEPLOY_USER` | only if it isn't `deploy` |
   | `DEPLOY_SSH_KEY` | the content of `qfe-ci`, the private key |
   | `DEPLOY_KNOWN_HOSTS` | the content of `known_hosts` from step 3 |
   | `DEPLOY_DOMAIN` | the app's domain, for the final check |

   Finally, under *Settings → Secrets and variables → Actions →
   Variables*, add `DEPLOY_ENABLED` = `true`. Delete `qfe-ci` from your PC,
   or keep it in a password manager.

5. **Try it:** *Actions → ci → Run workflow* on `main`. The deploy job ends
   with `deployed <commit>` and a successful check of
   `https://<domain>/healthz`.

### 13.3 Day to day

- **Deploying:** push or merge to `main`. Pull requests and other branches
  are only tested.
- **Rolling back:** *Actions → ci → Run workflow*, with an earlier commit of
  `main` in the *commit* field.
- **Pausing:** set `DEPLOY_ENABLED` to `false`.
- **On the server:** `sudo -u deploy qfe-deploy status` shows the deployed
  commit and the containers; `~deploy/deploys.log` lists every deployment.
- **Settings:** edit `/opt/quick-ftp-explorer/.env` on the server, then
  `cd /opt/quick-ftp-explorer && sudo -u deploy docker compose up -d`.
  Deployments keep `.env`, and a `docker-compose.override.yml` if you add
  one.

### 13.4 How it is secured

- **The pipeline's key can't open a shell.** In `~deploy/.ssh/authorized_keys`
  it is bound to `qfe-deploy` (`command="/usr/local/bin/qfe-deploy",restrict`),
  which accepts only `deploy <full commit id>`, for a commit of `main`, and
  `status`. The script is owned by `root`; a deployment can't change it.
- **The pipeline only talks to your server.** It checks the server's host
  key against `DEPLOY_KNOWN_HOSTS` (`StrictHostKeyChecking=yes`).
- **The repository and its Actions logs are public.** The server's address,
  port, domain and key are therefore secrets, which GitHub masks in the
  logs. Pull requests from forks get no secrets and never deploy.
- **Whoever can push to `main` can deploy.** Protect the branch (*Settings
  → Branches*: require a pull request and passing checks), and consider
  required reviewers on the `production` environment.
- `deploy` belongs to the `docker` group, which is as powerful as `root`,
  like anything that runs Docker. It has no password and no other key.
- Docker publishes Caddy's ports 80 and 443 itself, past the `ufw` rules;
  nothing else is published, so the firewall governs everything else.
- Once your own key works for `root` (or a `sudo` user), turn off SSH
  password logins: `PasswordAuthentication no` in
  `/etc/ssh/sshd_config.d/`, then `systemctl reload ssh`.
