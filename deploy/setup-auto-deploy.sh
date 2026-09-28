#!/usr/bin/env bash
# One-time operator setup; public key already transferred over trusted root SSH.
set -euo pipefail
test "$(id -u)" = 0
key_file=/root/konzocrm-transfer/github_actions_ed25519.pub
gateway=/root/konzocrm-transfer/deploy-gateway.sh
test -f "$key_file"
test -f "$gateway"
bash -n "$gateway"
ssh-keygen -lf "$key_file" >/dev/null
id konzocrm-deploy >/dev/null 2>&1 || useradd --system --home-dir /var/lib/konzocrm-deploy --shell /bin/bash konzocrm-deploy
install -d -m 0755 -o root -g root /var/lib/konzocrm-deploy /var/lib/konzocrm-deploy/.ssh
install -d -m 0750 -o konzocrm-deploy -g konzocrm-deploy /var/cache/konzocrm-ci
install -m 0755 -o root -g root "$gateway" /usr/local/sbin/konzocrm-deploy-gateway
printf 'restrict,command="/usr/bin/sudo -n /usr/local/sbin/konzocrm-deploy-gateway" %s\n' "$(cat "$key_file")" > /var/lib/konzocrm-deploy/.ssh/authorized_keys
chmod 0644 /var/lib/konzocrm-deploy/.ssh/authorized_keys
cat > /etc/sudoers.d/konzocrm-deploy <<'SUDO'
Defaults:konzocrm-deploy env_keep += "SSH_ORIGINAL_COMMAND"
konzocrm-deploy ALL=(root) NOPASSWD: /usr/local/sbin/konzocrm-deploy-gateway
SUDO
chmod 0440 /etc/sudoers.d/konzocrm-deploy
visudo -cf /etc/sudoers.d/konzocrm-deploy
echo 'Restricted GitHub deployment access installed.'
