#!/usr/bin/env bash
# Installs the gsc-indexing-debugger Claude Code skill into the current project.
# Usage (from your project's repo root):
#   curl -sL https://raw.githubusercontent.com/tushar33/gsc-indexing-debugger/main/install.sh | bash
set -euo pipefail

REPO="https://github.com/tushar33/gsc-indexing-debugger.git"
DEST=".claude/skills/gsc-indexing-debugger"

if [ -d "$DEST" ]; then
  echo "$DEST already exists — remove it first if you want to reinstall." >&2
  exit 1
fi

mkdir -p .claude/skills
git clone --depth 1 --quiet "$REPO" "$DEST"
rm -rf "$DEST/.git"

echo "Installed to $DEST."
echo "Optional: cp $DEST/gsc-indexing-debugger.config.example.json $DEST/gsc-indexing-debugger.config.json and fill in your site details."
echo 'Ask Claude Code: "Use the gsc-indexing-debugger skill" to get started.'
