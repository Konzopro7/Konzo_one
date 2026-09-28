#!/usr/bin/env bash
set -euo pipefail
umask 077
backup=/var/backups/konzocrm/$(date -u +%Y%m%dT%H%M%SZ)
install -d -m 0700 "$backup"
runuser -u postgres -- pg_dump -Fc konzocrm > "$backup/database.dump"
runuser -u postgres -- pg_restore --list < "$backup/database.dump" > "$backup/database.contents"
tar -czf "$backup/uploads.tar.gz" -C /var/lib/konzocrm/uploads .
cp /etc/konzocrm/server.env "$backup/server.env"
readlink /opt/konzocrm/current > "$backup/release.txt"
echo "Backup complete: $backup"
