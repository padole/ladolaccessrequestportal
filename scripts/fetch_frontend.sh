#!/usr/bin/env bash
# Download the prebuilt React frontend (published by scripts/publish-frontend.ps1)
# into frontend/dist. Run from the project root on the server:  bash scripts/fetch_frontend.sh
set -euo pipefail
cd "$(dirname "$0")/.."

repo="${FRONTEND_REPO:-$(git remote get-url origin | sed -E 's#(\.git)?$##; s#^.*github\.com[:/]##')}"
url="https://github.com/${repo}/releases/download/frontend-latest/frontend-dist.zip"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

echo "Downloading ${url}"
curl -fsSL "$url" -o "$tmp/frontend-dist.zip"
python3 -m zipfile -e "$tmp/frontend-dist.zip" "$tmp/dist"
test -f "$tmp/dist/index.html" || { echo "Download did not contain index.html" >&2; exit 1; }
rm -rf frontend/dist
mkdir -p frontend
mv "$tmp/dist" frontend/dist
echo "Frontend installed in frontend/dist"
