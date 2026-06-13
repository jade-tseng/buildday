#!/usr/bin/env bash
# Usage: bash scripts/new-session.sh <taskname>
#
# Creates ../buildday-<taskname>/ as a git worktree on branch feat/<taskname>
# from origin/main. Each concurrent Claude Code session gets its own worktree
# to avoid file collisions (shared index, node_modules, build artifacts).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_PARENT="$(dirname "$REPO_ROOT")"

if [[ $# -lt 1 ]]; then
  echo "Usage: bash scripts/new-session.sh <taskname>" >&2
  echo "  taskname: lowercase letters, numbers, hyphens (e.g. api-cache, ui-dispatch)" >&2
  exit 1
fi

TASKNAME="$1"

if ! echo "$TASKNAME" | grep -qE '^[a-z0-9][a-z0-9-]*$'; then
  echo "Error: taskname must be lowercase letters, numbers, and hyphens only." >&2
  exit 1
fi

BRANCH="feat/$TASKNAME"
WORKTREE_PATH="$REPO_PARENT/buildday-$TASKNAME"

if [[ -d "$WORKTREE_PATH" ]]; then
  echo "Error: $WORKTREE_PATH already exists." >&2
  echo "  To resume: open that directory in Claude Code." >&2
  echo "  To remove a stale worktree: git worktree remove \"$WORKTREE_PATH\"" >&2
  exit 1
fi

if git -C "$REPO_ROOT" show-ref --verify --quiet "refs/heads/$BRANCH" ||
   git -C "$REPO_ROOT" show-ref --verify --quiet "refs/remotes/origin/$BRANCH"; then
  echo "Error: branch '$BRANCH' already exists locally or on remote." >&2
  echo "  Another session may own this taskname. Choose a different name." >&2
  exit 1
fi

echo "Fetching from origin..."
git -C "$REPO_ROOT" fetch origin

echo "Creating worktree: $WORKTREE_PATH  (branch: $BRANCH from origin/main)"
git -C "$REPO_ROOT" worktree add -b "$BRANCH" "$WORKTREE_PATH" origin/main

echo ""
echo "  Path:   $WORKTREE_PATH"
echo "  Branch: $BRANCH"
echo ""
echo "Next steps:"
echo "  1. Open in Claude Code:    claude \"$WORKTREE_PATH\""
echo "  2. Check other agents:     gh pr list --repo jade-tseng/buildday"
echo "  3. At session end, push:   git push -u origin $BRANCH && gh pr create ..."
echo "  4. When done, clean up:    git worktree remove \"$WORKTREE_PATH\""
echo ""
echo "See CLAUDE.md for the full multi-agent protocol."
