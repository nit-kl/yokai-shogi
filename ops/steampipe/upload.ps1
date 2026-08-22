# Upload Hyakkiban (App 5138130) via SteamPipe.
# Enter the password when steamcmd asks. Do not put credentials in this file.
#
# Usage:
#   cd C:\Users\kojil\Documents\Dev\yokai-shogi
#   .\ops\steampipe\upload.ps1
#
# If Depot ID is not 5138131, edit ops/steampipe/app_build_5138130.vdf first.

param(
  [string]$SteamUser = "",
  [string]$SdkRoot = "C:\Users\kojil\Documents\Dev\steamworks_sdk_165",
  [string]$RepoRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
  $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$builder = Join-Path $SdkRoot "sdk\tools\ContentBuilder"
$steamcmd = Join-Path $builder "builder\steamcmd.exe"
$content = Join-Path $builder "content\hyakkiban"
$vdfSrc = Join-Path $PSScriptRoot "app_build_5138130.vdf"
$vdfDst = Join-Path $builder "scripts\app_build_5138130.vdf"
$exe = Join-Path $RepoRoot "src-tauri\target\release\yokai-shogi.exe"
$dll = Join-Path $RepoRoot "src-tauri\target\release\steam_api64.dll"

if (-not (Test-Path $steamcmd)) { throw "steamcmd not found: $steamcmd" }
if (-not (Test-Path $vdfSrc)) { throw "VDF not found: $vdfSrc" }
if (-not (Test-Path $exe)) { throw "Run npm run tauri:build first: $exe" }
if (-not (Test-Path $dll)) { throw "steam_api64.dll missing next to exe: $dll" }

New-Item -ItemType Directory -Force -Path $content | Out-Null
Copy-Item $exe $content -Force
Copy-Item $dll $content -Force
Copy-Item $vdfSrc $vdfDst -Force

Write-Host "Files for depot:"
Get-ChildItem $content | ForEach-Object { Write-Host ("  {0}  ({1} bytes)" -f $_.Name, $_.Length) }

if (-not $SteamUser) {
  $SteamUser = Read-Host "Steam login (Partner account with Edit App Metadata)"
}
if (-not $SteamUser) { throw "Steam login is empty" }

Push-Location (Join-Path $builder "builder")
try {
  & $steamcmd "+login" $SteamUser "+run_app_build" $vdfDst "+quit"
  if ($LASTEXITCODE -ne 0) { throw "steamcmd failed with exit code $LASTEXITCODE" }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "If upload succeeded, set the build live:"
Write-Host "  https://partner.steamgames.com/apps/builds/5138130"
