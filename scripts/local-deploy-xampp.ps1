$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$target = "C:\xampp\htdocs\konzotech-one"

npm run build --prefix client -- --base /konzotech-one/
if ($LASTEXITCODE -ne 0) {
  throw "Frontend build failed; existing deployment was preserved."
}

if (-not (Test-Path $target)) {
  New-Item -ItemType Directory -Path $target | Out-Null
}

$resolvedTarget = [System.IO.Path]::GetFullPath($target)
if ($resolvedTarget -ne "C:\xampp\htdocs\konzotech-one") {
  throw "Unexpected deployment directory."
}

# Keep the existing Apache configuration and avoid deleting unrelated files.
robocopy "client\dist" $resolvedTarget /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null

if ($LASTEXITCODE -gt 7) {
  throw "robocopy failed with exit code $LASTEXITCODE"
}

@'
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /konzotech-one/
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule ^ index.html [L]
</IfModule>
'@ | Set-Content -LiteralPath (Join-Path $resolvedTarget '.htaccess') -Encoding ASCII

Write-Host "Frontend deployed to $target"
Write-Host "Open: http://localhost/konzotech-one/"
