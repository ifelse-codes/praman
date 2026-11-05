#!/usr/bin/env bash
# Prepare a squashed, privacy-safe branch for the public PRAMAN repository.
# This script does NOT push and does not touch the working repository.
# Usage: scripts/prepare-public-repo.sh <empty-directory>
set -euo pipefail

dest="$1"
if [ -z "$dest" ]; then
  echo 'usage: scripts/prepare-public-repo.sh <empty-directory>' >&2
  exit 1
fi
if [ -e "$dest" ] && [ "$(ls -A "$dest" 2>/dev/null)" ]; then
  echo "destination must be empty: $dest" >&2
  exit 1
fi
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$dest"
git clone --no-hardlinks "$root" "$dest/repo"
cd "$dest/repo"
git checkout --orphan release
git add -A
git -c user.name='PRAMAN contributors' -c user.email='praman@users.noreply.github.com' \
    commit -m 'PRAMAN: evidence-driven verification toolkit for AI coding agents'
git branch -M main
git remote remove origin >/dev/null 2>&1 || true
echo
echo "Prepared squashed public branch in: $dest/repo"
echo "Authors in the new branch: $(git log --format='%an <%ae>' | sort -u | head -1)"
echo "Tracked files: $(git ls-files | wc -l | tr -d ' ')"
echo
echo 'Next steps:'
echo '  1. Create a PUBLIC GitHub repository with an MIT license visible in About.'
echo '  2. cd "$dest/repo" && npm ci && npm run lint && npm run lint:tests && npm run build && npm test -- --maxWorkers=2'
echo '  3. git remote add origin <your-repo-url> && git push -u origin main'
echo '  4. Watch CI (Ubuntu + macOS). Do not claim a remote result until it is green.'
