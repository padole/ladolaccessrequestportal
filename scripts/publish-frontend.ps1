# Build the React frontend and publish it as a GitHub Release asset, so servers
# without Node (e.g. PythonAnywhere free) can download it with fetch_frontend.sh.
#
# Usage (from the project root, in PowerShell):  .\scripts\publish-frontend.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$tag = 'frontend-latest'
$zip = Join-Path $env:TEMP 'frontend-dist.zip'

$gh = (Get-Command gh -ErrorAction SilentlyContinue).Source
if (-not $gh) { $gh = 'C:\Program Files\GitHub CLI\gh.exe' }

Push-Location (Join-Path $root 'frontend')
try {
    # Only install when needed: `npm ci` deletes node_modules first, which fails
    # (and leaves it half-deleted) while a Vite dev server holds esbuild.exe open.
    if (-not (Test-Path 'node_modules\.bin')) {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'npm run build failed' }
} finally { Pop-Location }

# Zip with Python: PowerShell 5's Compress-Archive writes backslash paths that break on Linux.
python -c "import shutil,sys; shutil.make_archive(sys.argv[1][:-4], 'zip', sys.argv[2])" $zip (Join-Path $root 'frontend\dist')
if ($LASTEXITCODE -ne 0) { throw 'zipping failed' }

Push-Location $root
try {
    # "release not found" on stderr is expected the first time; PowerShell 5 would
    # treat it as a fatal error under 'Stop', so check the exit code instead.
    $ErrorActionPreference = 'Continue'
    & $gh release view $tag *> $null
    $exists = $LASTEXITCODE -eq 0
    $ErrorActionPreference = 'Stop'
    if (-not $exists) {
        & $gh release create $tag $zip --title 'Frontend build (latest)' --notes 'Built React frontend. Download with scripts/fetch_frontend.sh. Replaced on every publish.' --latest=false
    } else {
        & $gh release upload $tag $zip --clobber
    }
    if ($LASTEXITCODE -ne 0) { throw 'uploading to GitHub failed' }
} finally { Pop-Location }
Write-Host "Published frontend build to release '$tag'."
