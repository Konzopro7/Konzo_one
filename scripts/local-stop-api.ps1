$ErrorActionPreference = "Stop"

$targets = Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like "*src/server.js*" }

if (-not $targets) {
  Write-Host "No API process found."
  exit 0
}

foreach ($proc in $targets) {
  Stop-Process -Id $proc.ProcessId -Force
  Write-Host "Stopped API process PID $($proc.ProcessId)."
}
