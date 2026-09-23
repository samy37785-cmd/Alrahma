#!/usr/bin/env bash
# Removes git worktrees (and their folders) for branches that have already
# been merged and deleted from origin, so merged feature folders don't pile
# up on disk as orphaned, disconnected copies.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

git fetch --prune origin >/dev/null 2>&1

git worktree list --porcelain | awk '
  /^worktree / { if (path != "") print path "\t" branch; path=$0; sub(/^worktree /,"",path); branch="" }
  /^branch /   { branch=$0; sub(/^branch refs\/heads\//,"",branch) }
  END { if (path != "") print path "\t" branch }
' | while IFS=$'\t' read -r path branch; do
    [ "$path" = "$(pwd)" ] && continue
    [ -z "$branch" ] && continue
    if ! git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
      echo "Removing merged worktree: $path (branch: $branch)"
      git worktree remove --force "$path" 2>/dev/null \
        || rm -rf "$path" 2>/dev/null \
        || echo "  WARNING: could not fully remove $path (folder may be locked by another program); rerun this script later"
    fi
  done

git worktree prune
