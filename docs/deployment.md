# Deploying Quick FTP Explorer

This guide is for the administrator who installs and runs Quick FTP
Explorer on a server. End users only need the address and an account; see
the [user manual](user-manual.en.md).

The recommended setup is **Docker Compose**: the app plus
[Caddy](https://caddyserver.com) in front of it, which obtains and renews
the HTTPS certificate on its own. A [setup without
Docker](#10-without-docker) is described at the end.

```
users ──HTTPS──> Caddy (:443) ──> app (:8080, not published) ──FTP──> your FTP server
                                     └── volume qfe-data: accounts, shortcuts, audit log
```

---

## 1. What you need

- A **Linux server** (VPS) with a public IP address. 1 vCPU and 512 MB–1 GB
  of RAM are plenty. Every file a user opens streams through it, so check
  the monthly bandwidth allowance if staff watch a lot of footage.
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
Give every person their own account: the audit trail is per account, and
removing someone affects nobody else.

---

## 7. Updating

```
cd quick-ftp-explorer
git pull
docker compose build --pull app     # also picks up a patched Node.js base image
docker compose pull caddy
docker compose up -d
```

Sessions survive the update; nobody has to sign in again.

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

1. Install **Node.js 22 or newer** and **Caddy** from your distribution's
   or the vendors' packages.
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
| Videos won't play | A browser codec limitation. Users can download the file ([user manual §6.2](user-manual.en.md#62-video-and-audio)). |

### Trying the stack locally

`DOMAIN=localhost` works for a local test: Caddy then uses its own local
certificate authority, so browsers show a certificate warning. To test
against the demo FTP server (`npm run dev:ftp` on the host), use
`host.docker.internal` as the shortcut's host.
