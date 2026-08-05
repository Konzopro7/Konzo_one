$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$existing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*src/server.js*" }

if ($existing) {
  Write-Host "API already running (PID: $($existing.ProcessId -join ', '))."
  exit 0
}

$cmd = "Set-Location '$root'; npm.cmd run start --prefix server *> 'server-api.log'"
Start-Process -FilePath powershell.exe -ArgumentList "-NoProfile", "-Command", $cmd -WindowStyle Hidden

Start-Sleep -Seconds 2

try {
  $resp = Invoke-WebRequest -UseBasicParsing "http://localhost:4000/api/health" -TimeoutSec 4
  if ($resp.StatusCode -eq 200) {
    Write-Host "API started successfully on http://localhost:4000"
    exit 0
  }
} catch {
  # Continue to error output below.
}

Write-Host "API did not respond in time. Check server-api.log"
exit 1
