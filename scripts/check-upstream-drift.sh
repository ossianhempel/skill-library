#!/usr/bin/env bash
# Report whether this fork is behind upstream OSS. Exit 0 if up to date, 1 if behind.
# Use in scheduled CI to get notified without merging automatically.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

UPSTREAM_URL="${UPSTREAM_URL:-https://github.com/ossianhempel/skill-library.git}"
UPSTREAM_BRANCH="${UPSTREAM_BRANCH:-main}"
UPSTREAM_REMOTE="${UPSTREAM_REMOTE:-upstream}"
TARGET_BRANCH="${TARGET_BRANCH:-$(git branch --show-current)}"
FORK_SYNC_CONF="${FORK_SYNC_CONF:-$ROOT/fork-sync.conf}"
MAX_LOG="${MAX_LOG:-20}"

usage() {
  cat <<'EOF'
Usage: ./scripts/check-upstream-drift.sh [options]

Fetch upstream and print how many commits the current branch is behind.
Exits 0 when up to date, 1 when behind (for CI alerts).

Options:
  --fetch-only   Skip adding upstream remote; assume fetch already ran
  -h, --help     Show this help

Reads optional fork-sync.conf for UPSTREAM_URL, UPSTREAM_BRANCH, UPSTREAM_REMOTE.
EOF
}

DO_FETCH=true

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --fetch-only)
        DO_FETCH=false
        ;;
      -h | --help)
        usage
        exit 0
        ;;
      *)
        printf 'error: unknown option: %s\n' "$1" >&2
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
}

load_config() {
  if [[ ! -f "$FORK_SYNC_CONF" ]]; then
    return 0
  fi

  # shellcheck source=/dev/null
  source "$FORK_SYNC_CONF"
}

ensure_upstream_remote() {
  if git remote get-url "$UPSTREAM_REMOTE" >/dev/null 2>&1; then
    local current_url
    current_url="$(git remote get-url "$UPSTREAM_REMOTE")"
    if [[ "$current_url" != "$UPSTREAM_URL" ]]; then
      git remote set-url "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
    fi
    return 0
  fi

  git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
}

main() {
  parse_args "$@"
  load_config
  ensure_upstream_remote

  if [[ "$DO_FETCH" == true ]]; then
    git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" --quiet
  fi

  local upstream_ref="${UPSTREAM_REMOTE}/${UPSTREAM_BRANCH}"
  local behind ahead

  behind="$(git rev-list --count "${TARGET_BRANCH}..${upstream_ref}" 2>/dev/null || echo 0)"
  ahead="$(git rev-list --count "${upstream_ref}..${TARGET_BRANCH}" 2>/dev/null || echo 0)"

  printf 'branch: %s\n' "$TARGET_BRANCH"
  printf 'upstream: %s\n' "$upstream_ref"
  printf 'behind: %s\n' "$behind"
  printf 'ahead: %s\n' "$ahead"

  if [[ "$behind" -eq 0 ]]; then
    printf 'status: up to date with upstream\n'
    exit 0
  fi

  printf 'status: behind upstream by %s commit(s)\n' "$behind"
  printf '\nNew upstream commits:\n'
  git --no-pager log --oneline "${TARGET_BRANCH}..${upstream_ref}" | head -n "$MAX_LOG"
  printf '\nSync with: ./scripts/sync-from-upstream.sh --dry-run\n'
  printf 'Then merge: ./scripts/sync-from-upstream.sh --verify --push\n'
  exit 1
}

main "$@"
