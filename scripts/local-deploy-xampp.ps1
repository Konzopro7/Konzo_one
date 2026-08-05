$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$target = "C:\xampp\htdocs\konzotech-one"

npm run build --prefix client -- --base /konzotech-one/

if (-not (Test-Path $target)) {
  New-Item -ItemType Directory -Path $target | Out-Null
}

robocopy "client\dist" $target /MIR /NFL /NDL /NJH /NJS /NC /NS | Out-Null

if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

Write-Host "Frontend deployed to $target"
Write-Host "Open: http://localhost/konzotech-one/"
