#!/bin/sh
# Builds the pre-fix PRAMAN baseline (commit 643fbe0, the parent of the
# verify-cancellation fix) into the ignored .praman/self-check/baseline folder.
# Uses `git archive`, so the repository's branches and worktrees are not changed.
set -eu
commit=643fbe0
root=$(git rev-parse --show-toplevel)
dest="$root/.praman/self-check/baseline"
if [ -e "$dest" ]; then
  echo "Baseline already exists: $dest (remove it to rebuild)" >&2
  exit 1
fi
mkdir -p "$dest"
git -C "$root" archive "$commit" src package.json tsconfig.json | tar -x -C "$dest"
ln -s "$root/node_modules" "$dest/node_modules"
(cd "$dest" && "$root/node_modules/.bin/tsc" -p .)
echo "Baseline $commit built: $dest/dist/cli.js"
