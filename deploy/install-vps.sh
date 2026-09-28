#!/usr/bin/env bash
# Fresh, separate installation on the existing Ubuntu VPS. Run as root.
# Private transfer files must be in /root/konzocrm-transfer, mode 0700.
set -euo pipefail
umask 077
transfer=/root/konzocrm-transfer
test -f "$transfer/release.tar.gz"
test -f "$transfer/database.sql"
test -f "$transfer/server.env"
test ! -e /opt/konzocrm/current
if runuser -u postgres -- psql -Atc "SELECT 1 FROM pg_database WHERE datname='konzocrm'" | grep -q 1; then
    echo 'Existing konzoCRM database: use an update procedure, not this installer.' >&2
    exit 1
fi

id konzocrm >/dev/null 2>&1 || useradd --system --home-dir /var/lib/konzocrm --shell /usr/sbin/nologin konzocrm
install -d -m 0755 /opt/konzocrm
install -d -m 0750 -o konzocrm -g konzocrm /var/lib/konzocrm /var/lib/konzocrm/uploads
install -d -m 0700 /var/backups/konzocrm
install -d -m 0750 -o root -g konzocrm /etc/konzocrm

node_version=v24.21.0
node_archive="node-${node_version}-linux-x64.tar.xz"
curl --fail --silent --show-error "https://nodejs.org/dist/${node_version}/${node_archive}" -o "$transfer/$node_archive"
curl --fail --silent --show-error "https://nodejs.org/dist/${node_version}/SHASUMS256.txt" -o "$transfer/SHASUMS256.txt"
(cd "$transfer"; grep " ${node_archive}$" SHASUMS256.txt | sha256sum --check)
install -d -m 0755 /opt/konzocrm/node
tar -xJf "$transfer/$node_archive" -C /opt/konzocrm/node --strip-components=1
export PATH=/opt/konzocrm/node/bin:$PATH

release="/opt/konzocrm/releases/$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0755 "$release"
tar -xzf "$transfer/release.tar.gz" -C "$release"
chmod -R a+rX "$release"
(cd "$release/server"; npm ci --omit=dev --no-audit --no-fund)
chmod -R a+rX "$release/server/node_modules"
ln -s /var/lib/konzocrm/uploads "$release/server/uploads"
tar -xzf "$transfer/uploads.tar.gz" -C /var/lib/konzocrm/uploads
chown -R konzocrm:konzocrm /var/lib/konzocrm/uploads
install -m 0640 -o root -g konzocrm "$transfer/server.env" /etc/konzocrm/server.env
ln -s "$release" /opt/konzocrm/current

install -m 0600 "$transfer/database.dump" /var/backups/konzocrm/before-hosting.dump
runuser -u postgres -- psql -v ON_ERROR_STOP=1 < "$transfer/create-db.sql"
# Only the newly created database is restored; no existing table/database is dropped.
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d konzocrm < "$transfer/database.sql" > "$transfer/restore.log"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d konzocrm <<'SQL'
GRANT ALL ON SCHEMA public TO konzocrm;
GRANT ALL ON ALL TABLES IN SCHEMA public TO konzocrm;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO konzocrm;
DO $$ DECLARE item record; BEGIN
FOR item IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
EXECUTE format('ALTER TABLE public.%I OWNER TO konzocrm',item.tablename);
END LOOP; END $$;
UPDATE agency_settings SET logo_url = regexp_replace(logo_url,'^http://(localhost|127\.0\.0\.1):4000/uploads/','https://konzocrm.com/uploads/') WHERE logo_url ~ '^http://(localhost|127\.0\.0\.1):4000/uploads/';
UPDATE users SET avatar_url = regexp_replace(avatar_url,'^http://(localhost|127\.0\.0\.1):4000/uploads/','https://konzocrm.com/uploads/') WHERE avatar_url ~ '^http://(localhost|127\.0\.0\.1):4000/uploads/';
SQL

install -m 0644 "$release/deploy/konzocrm.service" /etc/systemd/system/konzocrm.service
systemctl daemon-reload
systemctl enable --now konzocrm
for attempt in $(seq 1 20); do
    if curl -fsS http://127.0.0.1:4000/api/health; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:4000/api/health
install -m 0644 "$release/deploy/nginx.conf" /etc/nginx/sites-available/konzocrm
ln -s /etc/nginx/sites-available/konzocrm /etc/nginx/sites-enabled/konzocrm
nginx -t
systemctl reload nginx
echo 'Application installed. DNS and HTTPS activation remain necessary.'
