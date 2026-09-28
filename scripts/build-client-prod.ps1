param([string]$ApiUrl = "https://api.konzocrm.com/api")

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$previousApiUrl = $env:VITE_API_URL
try {
  $env:VITE_API_URL = $ApiUrl
  npm run build --prefix client
  if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
} finally {
  $env:VITE_API_URL = $previousApiUrl
}

Write-Host ""
Write-Host "Frontend build complete."
Write-Host "Deploy contents from: client/dist"
