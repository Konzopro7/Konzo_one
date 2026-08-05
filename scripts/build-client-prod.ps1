$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$env:VITE_API_URL = "https://api.one.konzotech.agency/api"
npm run build --prefix client

Write-Host ""
Write-Host "Frontend build complete."
Write-Host "Deploy contents from: client/dist"
