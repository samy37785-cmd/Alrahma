#!/usr/bin/env bash
# Removes git worktrees (and their folders) for branches that have already
# been merged and deleted from origin, so merged feature folders don't pile
# up on disk as orphaned, disconnected copies.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

git fetch --prune origin >/dev/null 2>&1

while IFS= read -r line; do
  path=""
  branch=""
  while IFS= read -r entry; do
    case "$entry" in
      worktree\ *) path="${entry#worktree }" ;;
      branch\ *) branch="${entry#branch refs/heads/}" ;;
    esac
  done <<< "$line"

  [ -z "$path" ] && continue
  [ "$path" = "$(pwd)" ] && continue
  [ -z "$branch" ] && continue

  if ! git show-ref --verify --quiet "refs/remotes/origin/$branch"; then
    echo "Removing merged worktree: $path (branch: $branch)"
    git worktree remove --force "$path" 2>/dev/null || rm -rf "$path"
  fi
done < <(git worktree list --porcelain | awk 'BEGIN{RS="\n\n"} {print}')

git worktree prune
