#!/usr/bin/env bash
set -euo pipefail

# push-main.sh — Local convenience script to push to main
# Pulls latest, pushes, and shows current/upcoming version info.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# Verify we're on main
BRANCH=$(git -C "$REPO_ROOT" branch --show-current)
if [[ "$BRANCH" != "main" ]]; then
  echo "ERROR: Not on main branch (currently on '$BRANCH')" >&2
  echo "Switch to main first: git checkout main" >&2
  exit 1
fi

# Pull latest
echo "Pulling latest from origin/main..."
git -C "$REPO_ROOT" pull --rebase origin main

# Push
echo "Pushing to origin/main..."
git -C "$REPO_ROOT" push origin main

# Show current version
echo ""
if [[ -f "$REPO_ROOT/version.json" ]]; then
  VERSION=$(python3 -c "import json; d=json.load(open('$REPO_ROOT/version.json')); print(f\"{d['version']}  (r{d['release']:05d})  [{d['model']}]\")")
  echo "Current version: $VERSION"
fi

echo ""
echo "Pushed. Version will be bumped by GitHub Actions."
echo "Watch the workflow: https://github.com/modern-investor/portsie/actions"
