#!/usr/bin/env bash
# Removes git worktrees for branches that are conservatively PROVEN to be
# already merged into origin/main -- never guessed at.
#
# Safety model (read before changing this script):
#   - Dry-run by default. Nothing is deleted unless the script is invoked
#     with --apply. Without it, every candidate is printed as "WOULD REMOVE"
#     or "SKIPPED" with a reason, and no filesystem/git state changes.
#   - This script does NOT run `git fetch`. It makes no network calls at
#     all. The caller is responsible for updating refs (e.g. `git fetch
#     --prune`) before running this script -- otherwise `origin/main` here
#     is whatever the caller's local refs already say it is.
#   - A worktree is only ever a removal candidate if ALL of the following
#     are true: it is not detached, it has a known local branch, that
#     branch is a real ancestor of origin/main (proved with
#     `git merge-base --is-ancestor`, not by checking whether a same-named
#     origin/<branch> ref happens to be missing -- a missing remote ref
#     means nothing about merge status, e.g. a squash-merged branch or a
#     branch that was simply never pushed both look identical to that
#     check, and the latter is exactly what destroyed an in-progress,
#     not-yet-pushed worktree the last time this script's predecessor ran),
#     and `git status --porcelain` in that worktree is completely empty
#     (no uncommitted changes, staged or not, tracked or not).
#   - Removal uses only `git worktree remove <path>` (no --force). If git
#     refuses (e.g. git itself detects untracked/modified files it knows
#     about, or the worktree is locked), the script prints SKIPPED and
#     moves on -- it never falls back to rm -rf, Remove-Item -Recurse, or
#     any other manual deletion. A worktree git won't remove cleanly is
#     left for a human to look at, not force-deleted.
#   - The current/main worktree (the one this script is invoked from) is
#     always skipped, unconditionally.
#
# Known, accepted limitation: a SQUASH-merged branch's commit is NOT an
# ancestor of origin/main (squash produces a brand-new commit on main with
# different parents), so `git merge-base --is-ancestor` returns false for
# it and this script will skip it -- printed as SKIPPED with the ancestry
# reason, not silently ignored. This is intentional: the previous version
# of this script treated "no origin/<branch> ref" as proof of a merge,
# which is also true for a squash-merged branch, but is indistinguishable
# from a branch that was simply never pushed -- exactly the false positive
# that deleted an active, in-progress worktree. Trading squash-merged
# branches staying un-auto-removed for never again deleting active work is
# the correct tradeoff here. Clean up squash-merged branches' worktrees by
# hand (or extend this script's ancestry check deliberately, with the same
# rigor) once you've confirmed the branch is really done.
#
# Also out of scope on purpose: leftover folders no longer registered in
# `git worktree list`, and junctions/symlinks. Those are not worktrees as
# far as git is concerned, so this script does not touch them at all --
# clean those up manually after confirming by hand what they are.
set -euo pipefail

APPLY=0
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

cd "$(dirname "${BASH_SOURCE[0]}")/.."
# git worktree list --porcelain prints each worktree's path in whatever
# form git itself considers canonical for the platform (e.g. on Windows/
# git-bash this is a drive-letter path like "D:/GitHub/Alrahma", NOT the
# POSIX-style "/d/GitHub/Alrahma" that a plain `pwd` would give in the same
# shell). Comparing against a plain `pwd` silently fails to match on that
# platform, which would defeat the "never touch the main worktree" guard
# entirely without any error. `git rev-parse --show-toplevel` returns the
# exact same form `git worktree list --porcelain` uses, on every platform,
# since both come from the same git binary -- verified directly against
# this repo's own worktrees before relying on it here.
MAIN_PATH="$(git rev-parse --show-toplevel)"

if [ "$APPLY" -eq 1 ]; then
  echo "Mode: APPLY (worktrees proven safe will be removed)"
else
  echo "Mode: DRY-RUN (nothing will be removed; pass --apply to actually remove)"
fi
echo

git worktree list --porcelain | awk '
  /^worktree / { if (path != "") print path "\t" branch "\t" detached; path=$0; sub(/^worktree /,"",path); branch=""; detached="" }
  /^branch /   { branch=$0; sub(/^branch refs\/heads\//,"",branch) }
  /^detached/  { detached="1" }
  END { if (path != "") print path "\t" branch "\t" detached }
' | while IFS=$'\t' read -r path branch detached; do
    [ -z "$path" ] && continue

    if [ "$path" = "$MAIN_PATH" ]; then
      continue
    fi

    if [ -n "$detached" ]; then
      echo "SKIPPED $path -- detached HEAD, no branch to evaluate"
      continue
    fi

    if [ -z "$branch" ]; then
      echo "SKIPPED $path -- no local branch found for this worktree"
      continue
    fi

    if ! git merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
      echo "SKIPPED $path (branch: $branch) -- not proven merged into origin/main (git merge-base --is-ancestor failed; this is also expected for squash-merged branches, see header comment)"
      continue
    fi

    if [ -n "$(git -C "$path" status --porcelain 2>/dev/null)" ]; then
      echo "SKIPPED $path (branch: $branch) -- working tree is not clean (uncommitted changes present)"
      continue
    fi

    if [ "$APPLY" -eq 1 ]; then
      if git worktree remove "$path" 2>/dev/null; then
        echo "REMOVED $path (branch: $branch)"
      else
        echo "SKIPPED $path (branch: $branch) -- git worktree remove refused (see git's own output above, if any); no fallback deletion was attempted"
      fi
    else
      echo "WOULD REMOVE $path (branch: $branch) -- proven ancestor of origin/main, clean working tree"
    fi
  done

echo
echo "Note: this script never runs 'git worktree prune' or removes any path"
echo "not listed by 'git worktree list --porcelain' above. Leftover folders"
echo "or junctions that are no longer registered git worktrees need manual"
echo "cleanup after you've confirmed by hand what they are."
