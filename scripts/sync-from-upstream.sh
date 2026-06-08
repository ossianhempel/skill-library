#!/usr/bin/env bash
# Merge the latest open-source Skill Library into this fork while preserving
# fork-local files (CI config, AGENTS.md, etc.).
#
# Workflow: app fixes land in the OSS source repo first, then run this script
# in the company fork to pull them in before deploy.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/ossianhempel/skill-library.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
TARGET_BRANCH="${TARGET_BRANCH:-$(git branch --show-current)}"
FORK_SYNC_CONF="${FORK_SYNC_CONF:-$ROOT/fork-sync.conf}"

declare -a FORK_LOCAL_PATHS=()
DO_PUSH=false
DO_REBASE=false
DO_DRY_RUN=false
DO_VERIFY=false
ALLOW_UPSTREAM=false

usage() {
  cat <<'EOF'
Usage: ./scripts/sync-from-upstream.sh [options]

Merge the latest upstream OSS release into this fork. Fork-local files listed in
fork-sync.conf are backed up before the merge and restored afterward.

Options:
  --push            Push the result to origin after a successful merge
  --rebase          Rebase onto upstream instead of merge
  --dry-run         Fetch upstream and show pending changes; do not merge
  --verify          Run pnpm verify after merge
  --allow-upstream  Allow running in the upstream repo (for script testing)
  -h, --help        Show this help

Configuration (optional fork-sync.conf at repo root):
  UPSTREAM_URL       Git URL for OSS (default: github.com/ossianhempel/skill-library)
  UPSTREAM_BRANCH    Branch to sync (default: main)
  UPSTREAM_REMOTE    Remote name (default: upstream)
  FORK_LOCAL_PATHS   Bash array of paths to preserve across merges

Example fork-sync.conf:
  FORK_LOCAL_PATHS=(
    "azure-pipelines.yml"
    "AGENTS.md"
  )

Scheduled drift checks (CI): ./scripts/check-upstream-drift.sh — see docs/forking.md
EOF
}

log() {
  printf '%s\n' "$*"
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

load_config() {
  if [[ ! -f "$FORK_SYNC_CONF" ]]; then
    return 0
  fi

  # shellcheck source=/dev/null
  source "$FORK_SYNC_CONF"
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --push)
        DO_PUSH=true
        ;;
      --rebase)
        DO_REBASE=true
        ;;
      --dry-run)
        DO_DRY_RUN=true
        ;;
      --verify)
        DO_VERIFY=true
        ;;
      --allow-upstream)
        ALLOW_UPSTREAM=true
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        die "unknown option: $1 (run with --help)"
        ;;
    esac
    shift
  done
}

require_clean_tree() {
  if [[ -n "$(git status --porcelain)" ]]; then
    die "working tree is not clean; commit or stash changes before syncing"
  fi
}

assert_fork() {
  if [[ "$ALLOW_UPSTREAM" == true ]]; then
    return 0
  fi

  if ! git remote get-url origin >/dev/null 2>&1; then
    die "no origin remote configured"
  fi

  local origin_url
  origin_url="$(git remote get-url origin)"
  if [[ "$origin_url" == *"ossianhempel/skill-library"* ]]; then
    die "origin points at upstream OSS; run this script from a fork, or pass --allow-upstream"
  fi
}

ensure_upstream_remote() {
  if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    local current_url
    current_url="$(git remote get-url "$UPSTREAM_REMOTE")"
    if [[ "$current_url" != "$UPSTREAM_URL" ]]; then
      log "Updating ${UPSTREAM_REMOTE} URL -> ${UPSTREAM_URL}"
      git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
    fi
    return 0
  fi

  log "Adding remote ${UPSTREAM_REMOTE} -> ${UPSTREAM_URL}"
  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
}

backup_fork_local() {
  BACKUP_DIR="$(mktemp -d)"
  local path
  for path in "${FORK_LOCAL_PATHS[@]}"; do
    if [[ -z "$path" ]]; then
      continue
    fi
    if [[ -f "$path" ]]; then
      mkdir -p "$BACKUP_DIR/$(dirname "$path")"
      cp "$path" "$BACKUP_DIR/$path"
      log "Backed up fork-local file: ${path}"
    fi
  done
}

restore_fork_local() {
  local path restored=0
  for path in "${FORK_LOCAL_PATHS[@]}"; do
    if [[ -z "$path" ]]; then
      continue
    fi
    if [[ -f "$BACKUP_DIR/$path" ]]; then
      mkdir -p "$(dirname "$path")"
      cp "$BACKUP_DIR/$path" "$path"
      log "Restored fork-local file: ${path}"
      restored=1
    fi
  done

  rm -rf "$BACKUP_DIR"

  if [[ "$restored" -eq 1 ]] && [[ -n "$(git status --porcelain -- "${FORK_LOCAL_PATHS[@]}")" ]]; then
    log "Fork-local files were re-applied after merge; review with git diff before pushing."
  fi
}

fetch_upstream() {
  log "Fetching ${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}..."
  git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"
}

show_pending() {
  local upstream_ref="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
  log ""
  log "Commits in upstream not in ${TARGET_BRANCH}:"
  git --no-pager log --oneline "${TARGET_BRANCH}..${upstream_ref}" || true
  log ""
  log "Commits in ${TARGET_BRANCH} not in upstream:"
  git --no-pager log --oneline "${upstream_ref}..${TARGET_BRANCH}" || true
  log ""
  log "File diff summary (upstream -> ${TARGET_BRANCH}):"
  git --no-pager diff --stat "${TARGET_BRANCH}..${upstream_ref}" || true
}

sync_branch() {
  local upstream_ref="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"

  if [[ "$DO_REBASE" == true ]]; then
    log "Rebasing ${TARGET_BRANCH} onto ${upstream_ref}..."
    git rebase "$upstream_ref"
  else
    log "Merging ${upstream_ref} into ${TARGET_BRANCH}..."
    git merge --no-edit "$upstream_ref"
  fi
}

run_verify() {
  if [[ "$DO_VERIFY" != true ]]; then
    return 0
  fi

  log "Running pnpm verify..."
  corepack enable
  pnpm install --frozen-lockfile
  pnpm verify
}

push_origin() {
  if [[ "$DO_PUSH" != true ]]; then
    log "Sync complete. Push to origin when ready: git push origin ${TARGET_BRANCH}"
    return 0
  fi

  log "Pushing ${TARGET_BRANCH} to origin..."
  git push origin "$TARGET_BRANCH"
}

main() {
  parse_args "$@"
  load_config
  require_clean_tree
  assert_fork
  ensure_upstream_remote
  fetch_upstream

  if [[ "$DO_DRY_RUN" == true ]]; then
    show_pending
    log "Dry run complete; no changes made."
    exit 0
  fi

  backup_fork_local
  sync_branch
  restore_fork_local
  run_verify
  push_origin
  log "Done."
}

main "$@"
