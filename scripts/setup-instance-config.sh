#!/usr/bin/env bash
# Create registry.config.json from the tracked example when setting up a fork or local deploy.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

EXAMPLE="$ROOT/registry.config.example.json"
TARGET="$ROOT/registry.config.json"

if [[ ! -f "$EXAMPLE" ]]; then
  printf 'error: missing %s\n' "$EXAMPLE" >&2
  exit 1
fi

if [[ -f "$TARGET" ]]; then
  printf 'registry.config.json already exists — no changes made\n'
  exit 0
fi

cp "$EXAMPLE" "$TARGET"
printf 'Created registry.config.json from registry.config.example.json\n'
printf 'Edit registry.config.json with your company branding, workspace id, and public URL.\n'
printf 'That file is gitignored and will not be overwritten by upstream syncs.\n'
