param(
    [string]$VpsHost = '76.13.115.72',
    [string]$SshUser = 'root'
)

$ErrorActionPreference = 'Stop'
$sshKey = Join-Path $env:USERPROFILE '.ssh\hostinger_deploy'
if (-not (Test-Path -LiteralPath $sshKey)) {
    throw "Clé SSH introuvable : $sshKey"
}

function Read-PrivateValue([string]$prompt, [string]$pattern) {
    $secure = Read-Host $prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
        $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
    if ($value -notmatch $pattern) {
        throw "Format incorrect pour $prompt"
    }
    return $value
}

Write-Host 'Stripe Live — konzoCRM.com'
Write-Host 'Les valeurs saisies ne seront pas affichées et ne seront pas enregistrées dans le dépôt.'
$secretKey = Read-PrivateValue 'Clé secrète Live (sk_live_ ou rk_live_)' '^(sk|rk)_live_[A-Za-z0-9]+$'
$publishableKey = Read-PrivateValue 'Clé publique Live (pk_live_)' '^pk_live_[A-Za-z0-9]+$'
$webhookSecret = Read-PrivateValue 'Secret du webhook Live (whsec_)' '^whsec_[A-Za-z0-9]+$'

$values = [ordered]@{
    STRIPE_MODE                  = 'live'
    STRIPE_SECRET_KEY            = $secretKey
    STRIPE_PUBLISHABLE_KEY       = $publishableKey
    STRIPE_WEBHOOK_SECRET        = $webhookSecret
    STRIPE_PRICE_PRO_MONTHLY     = 'price_1UdulYKcDgd5vPf20HzXLgM3'
    STRIPE_PRICE_PREMIUM_MONTHLY = 'price_1UdumUKcDgd5vPf2xGjNUmgH'
}
$payload = $values | ConvertTo-Json -Compress
$encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($payload))
$secretKey = $publishableKey = $webhookSecret = $payload = $null

$remoteScript = @'
import base64
import datetime
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

values = json.loads(base64.b64decode('__PAYLOAD__'))
assert re.fullmatch(r'(sk|rk)_live_[A-Za-z0-9]+', values['STRIPE_SECRET_KEY'])
assert re.fullmatch(r'pk_live_[A-Za-z0-9]+', values['STRIPE_PUBLISHABLE_KEY'])
assert re.fullmatch(r'whsec_[A-Za-z0-9]+', values['STRIPE_WEBHOOK_SECRET'])

for key, amount in [('STRIPE_PRICE_PRO_MONTHLY', 4900), ('STRIPE_PRICE_PREMIUM_MONTHLY', 9900)]:
    request = urllib.request.Request(
        'https://api.stripe.com/v1/prices/' + values[key],
        headers={'Authorization': 'Bearer ' + values['STRIPE_SECRET_KEY']},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        price = json.load(response)
    if not (price['livemode'] and price['active'] and price['currency'] == 'cad'
            and price['unit_amount'] == amount and price['recurring']['interval'] == 'month'):
        raise RuntimeError('Un prix Stripe Live ne correspond pas au forfait prévu.')
print('Prix Pro et Premium vérifiés dans Stripe Live.', flush=True)

path = Path('/etc/konzocrm/server.env')
original = path.read_text()
stat = path.stat()
updated = original
for key, value in values.items():
    if not re.fullmatch(r'[A-Z_]+', key) or '\n' in value or '\r' in value:
        raise RuntimeError('Valeur de configuration invalide.')
    line = key + '=' + value
    pattern = re.compile(r'^' + re.escape(key) + r'=.*$', re.MULTILINE)
    if pattern.search(updated):
        updated = pattern.sub(lambda match: line, updated)
    else:
        updated += ('\n' if not updated.endswith('\n') else '') + line + '\n'

stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = path.with_name(path.name + '.before-stripe-live-' + stamp)
shutil.copy2(path, backup)
os.chmod(backup, 0o600)
fd, temp_name = tempfile.mkstemp(prefix='.server.env.', dir=str(path.parent))
try:
    with os.fdopen(fd, 'w') as output:
        output.write(updated)
        output.flush()
        os.fsync(output.fileno())
    os.chmod(temp_name, stat.st_mode & 0o777)
    os.chown(temp_name, stat.st_uid, stat.st_gid)
    os.replace(temp_name, path)
finally:
    if os.path.exists(temp_name):
        os.unlink(temp_name)

try:
    subprocess.run(['systemctl', 'restart', 'konzocrm'], check=True, timeout=30)
    for attempt in range(10):
        try:
            with urllib.request.urlopen('https://konzocrm.com/api/payments/availability', timeout=15) as response:
                status = json.load(response)
            if status.get('realPaymentsReady') is True:
                break
        except Exception:
            pass
        time.sleep(2)
    else:
        raise RuntimeError('Le CRM ne confirme pas la disponibilité des paiements Live.')
except Exception:
    shutil.copy2(backup, path)
    os.chmod(path, stat.st_mode & 0o777)
    os.chown(path, stat.st_uid, stat.st_gid)
    subprocess.run(['systemctl', 'restart', 'konzocrm'], check=False, timeout=30)
    raise

print('Stripe Live actif sur konzoCRM.com. Aucun paiement réel de test n’a été lancé.', flush=True)
'@

$remoteScript = $remoteScript.Replace('__PAYLOAD__', $encoded)
$encoded = $null
$sshTarget = "${SshUser}@${VpsHost}"
$sshArgs = @('-i', $sshKey, '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=yes', $sshTarget, 'python3 -')
$remoteScript | & ssh @sshArgs
if ($LASTEXITCODE -ne 0) {
    throw 'Activation interrompue. Le serveur reste en mode test ou a été restauré automatiquement.'
}
