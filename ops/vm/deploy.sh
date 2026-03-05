#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$(cd "$SCRIPT_DIR/.." && pwd)/config.env}"

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing config file: $CONFIG_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$CONFIG_FILE"

: "${REPO_URL:?REPO_URL is required}"
: "${BRANCH:?BRANCH is required}"
: "${APP_NAME:?APP_NAME is required}"
: "${DEPLOY_ROOT:?DEPLOY_ROOT is required}"
: "${LIVE_WEB_ROOT:?LIVE_WEB_ROOT is required}"
: "${STATUS_ROOT:?STATUS_ROOT is required}"
: "${SERVER_ENV_SOURCE:?SERVER_ENV_SOURCE is required}"

REPO_DIR="$DEPLOY_ROOT/repo"
RELEASES_DIR="$DEPLOY_ROOT/releases"
CURRENT_LINK="$DEPLOY_ROOT/current"
LOG_PATH="$STATUS_ROOT/data/deploy.log"
STATUS_JSON="$STATUS_ROOT/data/status.json"
HISTORY_JSON="$STATUS_ROOT/data/history.json"
LOCK_DIR="$DEPLOY_ROOT/lock"
ECOSYSTEM_FILE="$DEPLOY_ROOT/ecosystem.config.cjs"
KEEP_RELEASES="${KEEP_RELEASES:-3}"

mkdir -p "$REPO_DIR" "$RELEASES_DIR" "$LIVE_WEB_ROOT" "$STATUS_ROOT/data" "$STATUS_ROOT/assets"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "Another deployment is already running." >&2
  exit 0
fi
trap 'rmdir "$LOCK_DIR"' EXIT

exec > >(tee "$LOG_PATH") 2>&1

iso_now() {
  date -u +"%Y-%m-%dT%H:%M:%SZ"
}

write_status() {
  local status="$1"
  local target_commit="${2:-}"
  local deployed_commit="${3:-}"
  local message="${4:-}"
  local started_at="${5:-}"
  local finished_at="${6:-}"
  local release_path="${7:-}"
  local duration_sec="${8:-}"

  cat > "$STATUS_JSON" <<EOF
{
  "repoUrl": "$REPO_URL",
  "branch": "$BRANCH",
  "status": "$status",
  "message": $(printf '%s' "$message" | jq -Rs .),
  "targetCommit": "$target_commit",
  "deployedCommit": "$deployed_commit",
  "startedAt": "$started_at",
  "finishedAt": "$finished_at",
  "durationSec": ${duration_sec:-0},
  "releasePath": "$release_path",
  "logPath": "/status/data/deploy.log",
  "historyPath": "/status/data/history.json",
  "updatedAt": "$(iso_now)"
}
EOF
}

append_history() {
  local status="$1"
  local commit="$2"
  local message="$3"
  local started_at="$4"
  local finished_at="$5"
  local duration_sec="$6"

  local commit_subject=""
  local commit_author=""
  local commit_date=""
  local commit_url=""
  if [[ -n "$commit" ]] && git -C "$REPO_DIR" cat-file -e "$commit^{commit}" 2>/dev/null; then
    commit_subject="$(git -C "$REPO_DIR" show -s --format=%s "$commit")"
    commit_author="$(git -C "$REPO_DIR" show -s --format=%an "$commit")"
    commit_date="$(git -C "$REPO_DIR" show -s --format=%cI "$commit")"
    commit_url="${REPO_URL%.git}/commit/$commit"
  fi

  local tmp_json
  tmp_json="$(mktemp)"
  if [[ -f "$HISTORY_JSON" ]]; then
    jq --arg status "$status" \
       --arg commit "$commit" \
       --arg message "$message" \
       --arg startedAt "$started_at" \
       --arg finishedAt "$finished_at" \
       --argjson durationSec "${duration_sec:-0}" \
       --arg subject "$commit_subject" \
       --arg author "$commit_author" \
       --arg commitDate "$commit_date" \
       --arg commitUrl "$commit_url" \
       '.history = ([{
          status: $status,
          commit: $commit,
          message: $message,
          startedAt: $startedAt,
          finishedAt: $finishedAt,
          durationSec: $durationSec,
          commitSubject: $subject,
          commitAuthor: $author,
          commitDate: $commitDate,
          commitUrl: $commitUrl
        }] + (.history // []))[:20]' \
       "$HISTORY_JSON" > "$tmp_json"
  else
    jq -n \
      --arg status "$status" \
      --arg commit "$commit" \
      --arg message "$message" \
      --arg startedAt "$started_at" \
      --arg finishedAt "$finished_at" \
      --argjson durationSec "${duration_sec:-0}" \
      --arg subject "$commit_subject" \
      --arg author "$commit_author" \
      --arg commitDate "$commit_date" \
      --arg commitUrl "$commit_url" \
      '{history: [{
        status: $status,
        commit: $commit,
        message: $message,
        startedAt: $startedAt,
        finishedAt: $finishedAt,
        durationSec: $durationSec,
        commitSubject: $subject,
        commitAuthor: $author,
        commitDate: $commitDate,
        commitUrl: $commitUrl
      }]}' > "$tmp_json"
  fi
  mv "$tmp_json" "$HISTORY_JSON"
}

STARTED_AT="$(iso_now)"
RELEASE_DIR=""

on_error() {
  local exit_code=$?
  local finished_at
  finished_at="$(iso_now)"
  local duration_sec
  duration_sec="$(( $(date -u +%s -d "$finished_at") - $(date -u +%s -d "$STARTED_AT") ))"
  local failed_commit="${TARGET_COMMIT:-}"
  local message="Deployment failed."
  write_status "failed" "$failed_commit" "${CURRENT_COMMIT:-}" "$message" "$STARTED_AT" "$finished_at" "$RELEASE_DIR" "$duration_sec"
  append_history "failed" "$failed_commit" "$message" "$STARTED_AT" "$finished_at" "$duration_sec"
  if [[ -n "$RELEASE_DIR" ]]; then
    rm -rf "$RELEASE_DIR"
  fi
  exit "$exit_code"
}

trap on_error ERR

if [[ ! -d "$REPO_DIR/.git" ]]; then
  git clone --filter=blob:none --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

git -C "$REPO_DIR" fetch origin "$BRANCH" --prune

TARGET_COMMIT="$(git -C "$REPO_DIR" rev-parse "origin/$BRANCH")"
CURRENT_COMMIT=""
if [[ -e "$CURRENT_LINK/.git" ]]; then
  CURRENT_COMMIT="$(git -C "$CURRENT_LINK" rev-parse HEAD)"
fi

if [[ "${1:-}" != "--force" ]] && [[ -n "$CURRENT_COMMIT" ]] && [[ "$CURRENT_COMMIT" == "$TARGET_COMMIT" ]]; then
  write_status "idle" "$TARGET_COMMIT" "$CURRENT_COMMIT" "No new commit to deploy." "$STARTED_AT" "$(iso_now)" "$CURRENT_LINK" "0"
  exit 0
fi

write_status "running" "$TARGET_COMMIT" "$CURRENT_COMMIT" "Building new release." "$STARTED_AT" "" "" "0"

RELEASE_NAME="$(date -u +%Y%m%d%H%M%S)-${TARGET_COMMIT:0:7}"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_NAME"

git -C "$REPO_DIR" worktree add --detach "$RELEASE_DIR" "$TARGET_COMMIT"
cp "$SERVER_ENV_SOURCE" "$RELEASE_DIR/server/.env"

pushd "$RELEASE_DIR" >/dev/null
pnpm install --frozen-lockfile
pnpm build
popd >/dev/null

pushd "$RELEASE_DIR/server" >/dev/null
pnpm install --frozen-lockfile
pnpm build
popd >/dev/null

rsync -a --delete "$RELEASE_DIR/out/" "$LIVE_WEB_ROOT/"
ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"
pm2 startOrReload "$ECOSYSTEM_FILE" --update-env
pm2 save

find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d | sort | head -n -"${KEEP_RELEASES}" 2>/dev/null | while read -r old_release; do
  if [[ "$old_release" != "$RELEASE_DIR" ]]; then
    git -C "$REPO_DIR" worktree remove "$old_release" --force || rm -rf "$old_release"
  fi
done

FINISHED_AT="$(iso_now)"
DURATION_SEC="$(( $(date -u +%s -d "$FINISHED_AT") - $(date -u +%s -d "$STARTED_AT") ))"
COMMIT_SUBJECT="$(git -C "$REPO_DIR" show -s --format=%s "$TARGET_COMMIT")"

write_status "success" "$TARGET_COMMIT" "$TARGET_COMMIT" "$COMMIT_SUBJECT" "$STARTED_AT" "$FINISHED_AT" "$RELEASE_DIR" "$DURATION_SEC"
append_history "success" "$TARGET_COMMIT" "$COMMIT_SUBJECT" "$STARTED_AT" "$FINISHED_AT" "$DURATION_SEC"

trap - ERR
trap 'rmdir "$LOCK_DIR"' EXIT
