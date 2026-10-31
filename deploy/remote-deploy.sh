#!/usr/bin/env bash
# qfe-deploy - the only thing the CI's SSH key can do on the server.
#
# deploy/bootstrap.sh installs this file as /usr/local/bin/qfe-deploy (owned
# by root) and binds it to the CI's key in ~deploy/.ssh/authorized_keys:
#
#   command="/usr/local/bin/qfe-deploy",restrict ssh-ed25519 AAAA... ci
#
# Whatever the client asks for arrives in SSH_ORIGINAL_COMMAND, and only two
# requests are accepted:
#
#   deploy <40-hex commit>   check out that commit of main, rebuild, restart;
#                            if the app doesn't come up healthy, go back to
#                            the previous commit
#   status                   the deployed commit and the containers' state
#
# An administrator can run it by hand too: sudo -u deploy qfe-deploy status
# (QFE_APP_DIR and QFE_DEPLOY_LOG exist for tests: sshd passes no such
# variables from a client, and `restrict` refuses key-supplied ones.)
set -euo pipefail

APP_DIR="${QFE_APP_DIR:-/opt/quick-ftp-explorer}"
LOG="${QFE_DEPLOY_LOG:-$HOME/deploys.log}"
request="${SSH_ORIGINAL_COMMAND-$*}"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" | tee -a "$LOG"; }
die() { echo "qfe-deploy: $2" >&2; exit "$1"; }

cd "$APP_DIR" || die 1 "no checkout at $APP_DIR"

if [[ "$request" == "status" ]]; then
  echo "commit $(git rev-parse HEAD)"
  docker compose ps --format 'table {{.Service}}\t{{.Status}}'
  exit 0
fi
[[ "$request" =~ ^deploy\ ([0-9a-f]{40})$ ]] || die 2 'usage: "deploy <40-hex commit>" or "status"'
target="${BASH_REMATCH[1]}"

# One deployment at a time.
exec 9>"$APP_DIR/.git/qfe-deploy.lock"
flock -n 9 || die 75 "another deployment is running"

git fetch --quiet --prune origin
git merge-base --is-ancestor "$target" origin/main 2>/dev/null || die 2 "$target is not a commit of main"
previous="$(git rev-parse HEAD)"

# Untracked files stay: .env, and a docker-compose.override.yml if any.
# Chained with &&: `set -e` does not apply inside a function called from `if`.
up() {
  git -c advice.detachedHead=false checkout --quiet --force --detach "$1" &&
    docker compose pull --quiet caddy &&
    docker compose build --pull app &&
    docker compose up -d --remove-orphans --wait --wait-timeout 180
}

log "deploying $target (was $previous)"
if up "$target"; then
  docker image prune -f >/dev/null || true
  log "deployed $target"
else
  log "deploying $target failed; rolling back to $previous"
  up "$previous" || log "ROLLBACK FAILED: the stack needs a look"
  exit 1
fi
