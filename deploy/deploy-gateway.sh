#!/usr/bin/env bash
# Install as /usr/local/sbin/konzocrm-deploy-gateway, root:root 0755.
# Invoked only by a forced SSH command and a narrowly scoped sudo rule.
set -Eeuo pipefail
export PATH=/opt/konzocrm/node/bin:/usr/sbin:/usr/bin:/sbin:/bin
umask 022
if [[ ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([a-f0-9]{40})$ ]]; then
    commit=${BASH_REMATCH[1]}
else
    echo 'Only deploy <40-character commit SHA> is permitted.' >&2
    exit 64
fi
exec 9>/run/lock/konzocrm-deploy.lock
flock -w 900 9
repository=https://github.com/Konzopro7/Konzo_one.git
source_repo=/var/lib/konzocrm-source.git
head_commit=$(git ls-remote "$repository" refs/heads/main | cut -f1)
if [[ "$commit" != "$head_commit" ]]; then
    echo 'This commit is no longer the head of main; deployment skipped.'
    exit 0
fi
if [[ ! -d "$source_repo" ]]; then
    git clone --bare "$repository" "$source_repo"
    chmod 0700 "$source_repo"
fi
git --git-dir="$source_repo" fetch --no-tags origin main
test "$(git --git-dir="$source_repo" rev-parse FETCH_HEAD)" = "$commit"
previous=$(readlink -f /opt/konzocrm/current)
[[ "$previous" == /opt/konzocrm/releases/* ]]
if [[ -f "$previous/.deployed-commit" ]] && [[ "$(cat "$previous/.deployed-commit")" == "$commit" ]]; then
    echo "Commit $commit is already deployed."
    exit 0
fi
release="/opt/konzocrm/releases/$(date -u +%Y%m%dT%H%M%SZ)-${commit:0:12}"
install -d -m 0755 -o konzocrm-deploy -g konzocrm-deploy "$release"
# Repository contents are extracted and built without root or production secrets.
git --git-dir="$source_repo" archive "$commit" | runuser -u konzocrm-deploy -- tar -xf - -C "$release"
build() {
    runuser -u konzocrm-deploy -- env -i \
      HOME=/var/cache/konzocrm-ci PATH="$PATH" VITE_API_URL=/api "$@"
}
build npm ci --prefix "$release/server" --omit=dev --no-audit --no-fund
build npm ci --prefix "$release/client" --no-audit --no-fund
build npm run build --prefix "$release/client" -- --base=/
test -f "$release/client/dist/index.html"
test ! -e "$release/server/.env"
test ! -e "$release/server/uploads"
chown -R root:root "$release"
chmod -R a+rX "$release"
ln -s /var/lib/konzocrm/uploads "$release/server/uploads"
printf '%s\n' "$commit" > "$release/.deployed-commit"

# Migrations run with the existing service account, not PostgreSQL superuser/root.
migrate() {
    (cd "$release/server"; runuser -u konzocrm -- env -i \
      HOME=/var/lib/konzocrm PATH="$PATH" DOTENV_CONFIG_PATH=/etc/konzocrm/server.env \
      node --import dotenv/config src/migrate.js "$@")
}
migrate --dry-run
# Do not publish an older release if main advanced during the build.
head_commit=$(git ls-remote "$repository" refs/heads/main | cut -f1)
if [[ "$commit" != "$head_commit" ]]; then
    echo 'Main advanced during the build; deployment skipped.'
    exit 0
fi
/usr/local/sbin/konzocrm-backup
service_stopped=false
activated=false
switch_release() {
    ln -sfn "$1" /opt/konzocrm/.next-release
    mv -Tf /opt/konzocrm/.next-release /opt/konzocrm/current
}
rollback() {
    status=$?
    if [[ "$status" == 0 ]]; then status=1; fi
    trap - ERR HUP INT TERM
    if [[ "$activated" == true ]]; then
        switch_release "$previous"
        echo 'Previous code release restored; applied migrations are retained.' >&2
    fi
    if [[ "$service_stopped" == true ]]; then systemctl restart konzocrm; fi
    exit "${status:-1}"
}
trap rollback ERR HUP INT TERM
service_stopped=true
systemctl stop konzocrm
migrate
switch_release "$release"
activated=true
systemctl start konzocrm
healthy=false
for attempt in $(seq 1 30); do
    if curl -fsS http://127.0.0.1:4000/api/health | grep -q '"status":"ok"'; then
        healthy=true
        break
    fi
    sleep 1
done
test "$healthy" = true
curl -fsS --resolve konzocrm.com:443:76.13.115.72 https://konzocrm.com/api/health | grep -q '"status":"ok"'
page=$(curl -fsS --resolve konzocrm.com:443:76.13.115.72 https://konzocrm.com/login)
[[ "$page" == *'/assets/'* ]]
trap - ERR HUP INT TERM
echo "Deployment successful: $commit"
