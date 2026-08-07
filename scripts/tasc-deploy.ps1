[CmdletBinding()]
param(
  [switch]$Deploy,
  [switch]$PackageOnly,
  [switch]$SkipInstall,
  [switch]$SkipChecks,
  [switch]$SkipArchiveUpload,
  [string]$Timestamp = (Get-Date -Format "yyyyMMdd-HHmmss"),
  [string]$OutputDir = "C:\workflow\output\deploy\tascagency",
  [string]$HostName = $env:TASC_DEPLOY_HOST,
  [string]$User = $env:TASC_DEPLOY_USER,
  [string]$KeyPath = $env:TASC_DEPLOY_KEY,
  [string]$RemoteAppRoot = "/var/www/tascagency"
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Invoke-CommandChecked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

function Assert-NoMatches {
  param(
    [string[]]$Arguments,
    [string]$Message
  )

  & rg @Arguments
  if ($LASTEXITCODE -eq 0) {
    throw $Message
  }
  if ($LASTEXITCODE -gt 1) {
    throw "rg failed while checking: $Message"
  }
}

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebRoot = Resolve-Path -LiteralPath (Join-Path $ScriptRoot "..")
$ArchiveRoot = New-Item -ItemType Directory -Force -Path $OutputDir
$ArchivePath = Join-Path $ArchiveRoot.FullName "tascagency-release-$Timestamp.tar.gz"

if ([string]::IsNullOrWhiteSpace($HostName)) {
  $HostName = "13.62.147.204"
}

if ([string]::IsNullOrWhiteSpace($User)) {
  $User = "ec2-user"
}

Set-Location -LiteralPath $WebRoot

if (-not $SkipChecks) {
  if (-not $SkipInstall) {
    Write-Step "Installing locked dependencies"
    Invoke-CommandChecked "pnpm" @("install", "--frozen-lockfile")
  }

  Write-Step "Lint"
  Invoke-CommandChecked "pnpm" @("lint")

  Write-Step "TypeScript"
  Invoke-CommandChecked "pnpm" @("exec", "tsc", "--noEmit", "--incremental", "false", "--pretty", "false")

  Write-Step "Production build"
  Invoke-CommandChecked "pnpm" @("build")

  Write-Step "Source leak checks"
  Assert-NoMatches @("-n", "-F", "Downloads\", "src", "public", ".next/static") "Local Downloads path leaked into deployable assets."
  Assert-NoMatches @("-n", "-i", "C:\\Users\\|AyuGram|codex-clipboard|127\\.0\\.0\\.1:3115|localhost:3115", "src", "public", ".next/static") "Local/dev-only reference leaked into deployable assets."
  Assert-NoMatches @("-n", "-i", "1_LENS_alpha\\.webm|1_LENS_alpha-poster\\.webp", "src", "next.config.ts", ".next/static", ".next/routes-manifest.json") "Unversioned Hero lens media reference leaked into deployable assets."

  $LegacyHeroAssets = @(
    "public/media/1_LENS_alpha.webm",
    "public/media/1_LENS_alpha-poster.webp"
  )
  foreach ($LegacyHeroAsset in $LegacyHeroAssets) {
    if (Test-Path -LiteralPath $LegacyHeroAsset) {
      throw "Unversioned Hero lens media file remains in public media: $LegacyHeroAsset"
    }
  }
}

Write-Step "Packaging release archive"
if (Test-Path -LiteralPath $ArchivePath) {
  Remove-Item -LiteralPath $ArchivePath -Force
}

$DeployPublicAllowlist = @(
  "favicon.ico",
  "media/hero-earth-poster-1080-20260715.webp",
  "media/hero-earth-alpha-720-60fps-t2-20260804.webm",
  "media/hero-earth-alpha-480-30fps-mobile-20260722.webm",
  "media/hero-earth-safari-packed-720-60fps-t2-20260804.mp4",
  "media/hero-earth-safari-packed-480-30fps-mobile-20260722.mp4",
  "media/hero-mission-transition-20260712.svg",
  "media/safari-static-starfield-20260713.svg",
  "media/clients-flare-white-diagonal-20260716.svg",
  "media/clients-flare-white-diagonal-2304x1296-20260801.webp",
  "media/clients-flare-white-diagonal-4096x2304-20260801.webp",
  "media/tasc-office-map-static-20260802.webp",
  "media/1_LENS_alpha-poster-20260709.webp",
  "media/interactive-stars-overlay-20260716.svg",
  "media/clients-light-streak.png",
  "media/services-frame-0-poster-final-20260718.webp",
  "media/services-keyframes-packed-1280-gop15-t4-20260801.mp4",
  "media/services-keyframes-packed-960-gop15-t4-20260801.mp4",
  "media/services-keyframes-packed-1280x360-gop15-20260807.mp4",
  "media/services-keyframes-desktop-final-20260718.webm",
  "media/services-keyframes-mobile-alpha-960-20260803.webm",
  "media/services-keyframes-mobile-alpha-640-gop15-20260807.webm",
  "media/services-mobile-static-frame.webp",
  "media/services-stop-1-poster-final-20260718.webp",
  "media/services-stop-2-poster-final-20260718.webp",
  "media/services-stop-3-poster-final-20260718.webp",
  "media/datum-news-poster-20260714.webp",
  "media/datum-news-loop-desktop-20260718.mp4",
  "media/datum-news-loop-mobile-lowbit-20260722.mp4",
  "media/datum-news-loop-desktop-vp9-20260718.webm",
  "media/datum-news-loop-mobile-vp9-20260718.webm",
  "media/domino-cta-forward-desktop-20260718.mp4",
  "media/domino-cta-forward-mobile-20260718.mp4",
  "media/domino-cta-forward-desktop-vp9-20260718.webm",
  "media/domino-cta-forward-mobile-vp9-20260718.webm",
  "media/domino-cta-reverse-desktop-20260718.mp4",
  "media/domino-cta-reverse-mobile-20260718.mp4",
  "media/domino-cta-reverse-desktop-vp9-20260718.webm",
  "media/domino-cta-reverse-mobile-vp9-20260718.webm",
  "media/domino-forward-poster-1120-20260807.webp",
  "media/vision-logo-glass-20260710.webp",
  "media/process-gradient-original-20260709.webp",
  "media/process-horizon-bg.webp",
  "media/process-horizon-desktop-20260709.webp",
  "media/process-horizon-mobile-20260709.webp",
  "media/process-horizon-source-20260709.jpg",
  "media/tasc-reveal-alpha-poster.webp",
  "media/tasc-logo-20260710.svg"
)

# Keep deployment packaging coupled to every media reference in the source, not
# just the runtime media contract. Checking only `runtime-media.ts` let the
# Clients flare plates, the office map and a Hero poster ship as 404s: they are
# referenced straight from components and CSS, so the old guard never saw them.
$MediaReferenceSources = Get-ChildItem -LiteralPath "src" -Recurse -File -Include *.ts, *.tsx, *.css
$SourceMediaReferences = $MediaReferenceSources |
  ForEach-Object { [regex]::Matches((Get-Content -LiteralPath $_.FullName -Raw), '/media/([A-Za-z0-9._\-/]+)') } |
  ForEach-Object { "media/$($_.Groups[1].Value)" } |
  Sort-Object -Unique
foreach ($SourceMediaReference in $SourceMediaReferences) {
  if ($DeployPublicAllowlist -notcontains $SourceMediaReference) {
    throw "Referenced media is not included in deploy allowlist: public/$SourceMediaReference"
  }
}

$PublicRoot = (Resolve-Path -LiteralPath (Join-Path $WebRoot "public")).Path.TrimEnd("\")
$PublicExcludes = @()
foreach ($AllowedPublicFile in $DeployPublicAllowlist) {
  $AllowedPath = Join-Path $PublicRoot ($AllowedPublicFile -replace "/", [IO.Path]::DirectorySeparatorChar)
  if (-not (Test-Path -LiteralPath $AllowedPath -PathType Leaf)) {
    throw "Required deploy media is missing: public/$AllowedPublicFile"
  }
}

Get-ChildItem -LiteralPath $PublicRoot -File -Recurse | ForEach-Object {
  $Relative = $_.FullName.Substring($PublicRoot.Length).TrimStart("\").Replace("\", "/")
  if ($DeployPublicAllowlist -notcontains $Relative) {
    $PublicExcludes += "--exclude=public/$Relative"
  }
}

$TarArguments = @(
  "--exclude=node_modules",
  "--exclude=.next",
  "--exclude=.env",
  "--exclude=.env.*",
  "--exclude=.git",
  "--exclude=qa-artifacts",
  "--exclude=test-results",
  "--exclude=.playwright-cli",
  "--exclude=.playwright-*",
  "--exclude=*.log",
  "--exclude=*.ttf",
  "--exclude=*.otf",
  "--exclude=tsconfig.tsbuildinfo",
  "-czf",
  $ArchivePath,
  "-C",
  $WebRoot,
  "."
)

Invoke-CommandChecked "tar" ($PublicExcludes + $TarArguments)

$ArchiveItem = Get-Item -LiteralPath $ArchivePath
Write-Host "Release archive: $($ArchiveItem.FullName)"
Write-Host "Archive size: $([Math]::Round($ArchiveItem.Length / 1MB, 2)) MB"

if ($PackageOnly -or -not $Deploy) {
  Write-Host ""
  Write-Host "Package is ready. To deploy with the same gate, run: scripts/tasc-deploy.ps1 -Deploy -SkipInstall" -ForegroundColor Green
  exit 0
}

Write-Step "Deploying release $Timestamp to $User@$HostName"

$SshArgs = @(
  "-o", "BatchMode=yes",
  "-o", "IdentitiesOnly=yes",
  "-o", "ConnectTimeout=20",
  "-o", "ServerAliveInterval=15",
  "-o", "ServerAliveCountMax=6"
)
if (-not [string]::IsNullOrWhiteSpace($KeyPath)) {
  $SshArgs += @("-i", $KeyPath)
}

if (-not [string]::IsNullOrWhiteSpace($env:TASC_DEPLOY_PROXY_COMMAND)) {
  $SshArgs += @("-o", "ProxyCommand=$($env:TASC_DEPLOY_PROXY_COMMAND)")
}

$SshTarget = "$User@$HostName"
$RemoteArchive = "/home/$User/tascagency-release-$Timestamp.tar.gz"
$RemoteDeployScript = "/home/$User/tascagency-deploy-$Timestamp.sh"
$ScpArgs = @("-O") + $SshArgs

if ($SkipArchiveUpload) {
  Write-Step "Reusing verified remote release archive"
  Invoke-CommandChecked "ssh" ($SshArgs + @($SshTarget, "test -s '$RemoteArchive'"))
} else {
  Invoke-CommandChecked "scp" ($ScpArgs + @($ArchivePath, "${SshTarget}:${RemoteArchive}"))
}

$RemoteScript = @'
set -euo pipefail

TS="$1"
REMOTE_ARCHIVE="$2"
APP_ROOT="$3"
RELEASE="$APP_ROOT/releases/$TS"
PREVIOUS_RELEASE="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"
SWITCHED=0

export PATH="/opt/node-v22/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

rollback_on_error() {
  status=$?
  set +e
  if [ "$SWITCHED" -eq 1 ] && [ -n "$PREVIOUS_RELEASE" ] && [ -d "$PREVIOUS_RELEASE" ]; then
    ln -sfn "$PREVIOUS_RELEASE" "$APP_ROOT/current-rollback"
    mv -Tf "$APP_ROOT/current-rollback" "$APP_ROOT/current"
    pm2 delete tascagency >/dev/null 2>&1 || true
    pm2 start "$APP_ROOT/start-tascagency.sh" --name tascagency --time >/dev/null 2>&1 || true
    pm2 save >/dev/null 2>&1 || true
  fi
  case "$RELEASE" in
    "$APP_ROOT"/releases/*)
      if [ "$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)" != "$RELEASE" ]; then
        rm -rf -- "$RELEASE"
      fi
      ;;
  esac
  rm -f -- "$REMOTE_ARCHIVE" "$0"
  exit "$status"
}
trap rollback_on_error ERR

mkdir -p "$APP_ROOT/releases"
rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$REMOTE_ARCHIVE" -C "$RELEASE"

cat > "$APP_ROOT/start-tascagency.sh" <<STARTSCRIPT
#!/usr/bin/env bash
set -euo pipefail
export PATH="/opt/node-v22/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"
if [ -r "$APP_ROOT/shared/app.env" ]; then
  set -a
  . "$APP_ROOT/shared/app.env"
  set +a
fi
cd "$APP_ROOT/current"
pnpm exec next start -H 127.0.0.1 -p 3000
STARTSCRIPT
chmod +x "$APP_ROOT/start-tascagency.sh"

cd "$RELEASE"
corepack enable >/dev/null 2>&1 || true
pnpm install --frozen-lockfile
pnpm build
sudo -u postgres psql -v ON_ERROR_STOP=1 -d tascagency -f "$RELEASE/db/migrations/001_lead_submissions.sql"
pnpm prune --prod

ln -sfn "$RELEASE" "$APP_ROOT/current-new"
mv -Tf "$APP_ROOT/current-new" "$APP_ROOT/current"
SWITCHED=1

pm2 delete tascagency >/dev/null 2>&1 || true
pm2 start "$APP_ROOT/start-tascagency.sh" --name tascagency --time
pm2 save

for attempt in $(seq 1 30); do
  if curl -fsSI http://127.0.0.1:3000 >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsSI http://127.0.0.1:3000 >/dev/null
curl -fsS http://127.0.0.1:3000/api/health | grep -q '"status":"healthy"'
sudo nginx -t
sudo systemctl reload nginx
curl -fsSI https://tascagency.com/ >/dev/null
curl -fsSI https://www.tascagency.com/ >/dev/null

CURRENT_RELEASE="$(readlink -f "$APP_ROOT/current")"
for candidate in "$APP_ROOT"/releases/*; do
  [ -d "$candidate" ] || continue
  candidate="$(readlink -f "$candidate")"
  if [ "$candidate" = "$CURRENT_RELEASE" ] || { [ -n "$PREVIOUS_RELEASE" ] && [ "$candidate" = "$PREVIOUS_RELEASE" ]; }; then
    continue
  fi
  case "$candidate" in
    "$APP_ROOT"/releases/*) rm -rf -- "$candidate" ;;
  esac
done

trap - ERR
rm -f -- "$REMOTE_ARCHIVE" "$0"

echo "Deployed $TS to $APP_ROOT/current"
'@

$LocalRemoteScript = Join-Path $ArchiveRoot.FullName "tascagency-remote-deploy-$Timestamp.sh"
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($LocalRemoteScript, $RemoteScript, $Utf8NoBom)

try {
  Invoke-CommandChecked "scp" ($ScpArgs + @($LocalRemoteScript, "${SshTarget}:${RemoteDeployScript}"))
  Invoke-CommandChecked "ssh" ($SshArgs + @($SshTarget, "bash '$RemoteDeployScript' '$Timestamp' '$RemoteArchive' '$RemoteAppRoot'"))
} finally {
  if (Test-Path -LiteralPath $LocalRemoteScript) {
    Remove-Item -LiteralPath $LocalRemoteScript -Force
  }
}

Write-Host ""
Write-Host "Production deploy complete: https://tascagency.com/" -ForegroundColor Green
