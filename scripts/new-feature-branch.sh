#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: scripts/new-feature-branch.sh <branch-name>"
  echo "Example: scripts/new-feature-branch.sh feat/catalog-compare-polish"
  exit 1
fi

branch_name="$1"

if [[ ! "$branch_name" =~ ^(feat|fix|chore|refactor|docs)/.+$ ]]; then
  echo "Branch name should start with feat/, fix/, chore/, refactor/, or docs/"
  exit 1
fi

git fetch origin

if git show-ref --verify --quiet refs/heads/main; then
  git checkout main
else
  git checkout -b main origin/main
fi

git pull --ff-only origin main
git checkout -b "$branch_name"

echo "Created and switched to $branch_name from latest main."
