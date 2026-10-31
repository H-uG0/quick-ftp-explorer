#!/usr/bin/env bash
# bootstrap.sh - prepares a fresh Debian or Ubuntu server (an IONOS VPS, or
# any other) for Quick FTP Explorer and its continuous deployment. Run it
# once, as root; running it again is safe and applies changed options.
#
#   curl -fsSLO https://raw.githubusercontent.com/H-uG0/quick-ftp-explorer/main/deploy/bootstrap.sh
#   less bootstrap.sh                  # read it before running it as root
#   bash bootstrap.sh --domain files.example.com --ftp-host 192.0.2.10 \
#     --ftp-port 21 --ci-key "ssh-ed25519 AAAA... github-actions"
#
# Steps (docs/deployment.md, "Continuous deployment"):
#   1. git, curl, ufw, automatic security updates, and Docker Engine with
#      the Compose plugin from Docker's own apt repository;
#   2. firewall: the SSH port(s) in use, 80/tcp, 443/tcp and 443/udp;
#   3. the "deploy" user: docker group, no password, and one SSH key, the
#      CI's, which can run nothing but /usr/local/bin/qfe-deploy;
#   4. the app in /opt/quick-ftp-explorer, with its .env;
#   5. the stack built and started, then the next steps.
#
# Options:
#   --domain NAME      public hostname, its DNS pointing here (required once)
#   --ftp-host HOST    the FTP server: prefilled in "New shortcut", and the
#   --ftp-port PORT      only host shortcuts may point at (FTP_ALLOWED_HOSTS)
#   --ci-key "KEY"     the CI's SSH public key (one line); can come later
#   --repo URL         git repository to deploy from (default: GitHub)
#   --no-firewall      leave the firewall alone (managed elsewhere)
#   --no-start         install and configure, but don't start the stack
set -euo pipefail

APP_DIR=/opt/quick-ftp-explorer
DEPLOY_USER=deploy
REPO=https://github.com/H-uG0/quick-ftp-explorer.git
domain="" ftp_host="" ftp_port="" ci_key="" firewall=1 start=1

die() { echo "bootstrap: $*" >&2; exit 1; }
step() { printf '\n== %s\n' "$*"; }
value() { [[ $# -ge 2 && -n "$2" ]] || die "$1 needs a value"; }

while (($#)); do
  case "$1" in
    --domain) value "$@"; domain="$2"; shift 2 ;;
    --ftp-host) value "$@"; ftp_host="$2"; shift 2 ;;
    --ftp-port) value "$@"; ftp_port="$2"; shift 2 ;;
    --ci-key) value "$@"; ci_key="$2"; shift 2 ;;
    --repo) value "$@"; REPO="$2"; shift 2 ;;
    --no-firewall) firewall=0; shift ;;
    --no-start) start=0; shift ;;
    -h|--help) sed -n '2,/^set -euo/{/^set -euo/d;s/^# \{0,1\}//;p}' "$0"; exit 0 ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
done

# Values end up in .env and sed expressions: allow only what they need.
[[ -z "$domain" || "$domain" =~ ^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$ ]] || die "invalid --domain"
[[ -z "$ftp_host" || "$ftp_host" =~ ^[A-Za-z0-9.:-]{1,253}$ ]] || die "invalid --ftp-host"
[[ -z "$ftp_port" || ( "$ftp_port" =~ ^[0-9]{1,5}$ && "$ftp_port" -ge 1 && "$ftp_port" -le 65535 ) ]] || die "invalid --ftp-port"
[[ -z "$ci_key" || "$ci_key" =~ ^(ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa)\ [A-Za-z0-9+/]+=*(\ [^\"]*)?$ ]] ||
  die "--ci-key must be one public key line, e.g. \"ssh-ed25519 AAAA... github-actions\""

[[ $EUID -eq 0 ]] || die "run it as root"
# shellcheck disable=SC1091
. /etc/os-release
[[ "$ID" == debian || "$ID" == ubuntu ]] || die "Debian or Ubuntu only (this is $ID)"
env_file="$APP_DIR/.env"
[[ -f "$env_file" || -n "$domain" ]] || die "--domain is required the first time"

step "Packages and Docker"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q ca-certificates curl git ufw unattended-upgrades
if ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL "https://download.docker.com/linux/$ID/gpg" -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc]" \
    "https://download.docker.com/linux/$ID ${VERSION_CODENAME} stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -q
  apt-get install -y -q docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker >/dev/null 2>&1 || echo "note: systemctl could not enable the docker service"
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF

if ((firewall)); then
  step "Firewall"
  # Keep every port sshd listens on open, or this would lock us out.
  ssh_ports="$(sshd -T 2>/dev/null | awk '$1 == "port" { print $2 }')"
  for port in ${ssh_ports:-22}; do ufw allow "$port/tcp" >/dev/null; done
  for rule in 80/tcp 443/tcp 443/udp; do ufw allow "$rule" >/dev/null; done
  ufw --force enable >/dev/null
  ufw status
fi

step "The deploy user"
id "$DEPLOY_USER" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$DEPLOY_USER"
passwd -l "$DEPLOY_USER" >/dev/null   # SSH keys only
usermod -aG docker "$DEPLOY_USER"
home="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
as_deploy() { runuser -u "$DEPLOY_USER" -- env HOME="$home" "$@"; }

if [[ -n "$ci_key" ]]; then
  install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$home/.ssh"
  # The CI's key is the only one, and it can only run qfe-deploy.
  printf 'command="/usr/local/bin/qfe-deploy",restrict %s\n' "$ci_key" > "$home/.ssh/authorized_keys"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
  echo "The CI's key is installed."
fi

step "The app"
if [[ ! -d "$APP_DIR/.git" ]]; then
  install -d -m 755 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"
  as_deploy git clone --quiet --branch main "$REPO" "$APP_DIR"
fi
install -m 0755 -o root -g root "$APP_DIR/deploy/remote-deploy.sh" /usr/local/bin/qfe-deploy

if [[ ! -f "$env_file" ]]; then
  install -m 600 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR/.env.example" "$env_file"
fi
set_env() {   # replace "KEY=..." or "#KEY=...", else append
  if grep -qE "^#?$1=" "$env_file"; then
    sed -i -E "s|^#?$1=.*|$1=$2|" "$env_file"
  else
    printf '%s=%s\n' "$1" "$2" >> "$env_file"
  fi
}
if [[ -n "$domain" ]]; then set_env DOMAIN "$domain"; fi
if [[ -n "$ftp_host" ]]; then set_env DEFAULT_FTP_HOST "$ftp_host"; set_env FTP_ALLOWED_HOSTS "$ftp_host"; fi
if [[ -n "$ftp_port" ]]; then set_env DEFAULT_FTP_PORT "$ftp_port"; fi
# Names only: the values (FTP server, domain) don't belong in a terminal log.
echo "$env_file sets: $(grep -oE '^[A-Z_]+=' "$env_file" | tr -d '=' | paste -sd ' ')"

if ((start)); then
  step "Starting the stack (the first build takes a few minutes)"
  (cd "$APP_DIR" && as_deploy docker compose up -d --build --wait --wait-timeout 300)
  (cd "$APP_DIR" && as_deploy docker compose ps)
fi

step "Done"
echo "Deployed commit: $(as_deploy git -C "$APP_DIR" rev-parse HEAD)"
if command -v ssh-keygen >/dev/null; then
  echo "This server's SSH host keys (check them against DEPLOY_KNOWN_HOSTS):"
  for key in /etc/ssh/ssh_host_*_key.pub; do [[ -f "$key" ]] && ssh-keygen -lf "$key"; done
fi
cat <<EOF

Next:
  1. The first administrator:
       cd $APP_DIR && runuser -u $DEPLOY_USER -- docker compose exec app node server/cli.js user add <name> --admin
  2. Shortcuts from the HTA, from the PC that has them:
       cat legacy/config/shortcuts/*.json | ssh root@<this server> \\
         "cd $APP_DIR && runuser -u $DEPLOY_USER -- docker compose exec -T app node server/cli.js import -"
  3. Continuous deployment: docs/deployment.md, "Continuous deployment".
EOF
