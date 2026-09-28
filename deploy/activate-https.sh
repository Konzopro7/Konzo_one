#!/usr/bin/env bash
set -euo pipefail
# Only run once both hostnames resolve to this VPS and port 80 is reachable.
install -d -m 0755 /var/www/konzocrm-acme
certbot certonly --webroot -w /var/www/konzocrm-acme \
    --cert-name konzocrm.com -d konzocrm.com -d www.konzocrm.com \
    --non-interactive --agree-tos --register-unsafely-without-email
cp /etc/nginx/sites-available/konzocrm /var/backups/konzocrm/nginx-before-https.conf
install -m 0644 /opt/konzocrm/current/deploy/nginx-https.conf /etc/nginx/sites-available/konzocrm
if ! nginx -t; then
    cp /var/backups/konzocrm/nginx-before-https.conf /etc/nginx/sites-available/konzocrm
    exit 1
fi
systemctl reload nginx
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\nnginx -t && systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/konzocrm-reload.sh
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/konzocrm-reload.sh
systemctl enable --now certbot.timer
curl --fail --silent --show-error https://konzocrm.com/api/health
