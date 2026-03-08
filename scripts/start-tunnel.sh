#!/usr/bin/env bash
# Start a Cloudflare quick tunnel and update the GitHub Gist with the URL.
# Usage: GH_TOKEN=ghp_xxx ./scripts/start-tunnel.sh
#
# Requires: cloudflared, curl, jq (or grep/sed)

set -euo pipefail

GIST_ID="ad6fdfac579afd74a797613efaf483ea"
GH_TOKEN="${GH_TOKEN:?Set GH_TOKEN to a GitHub token with gist scope}"
TUNNEL_PORT="${TUNNEL_PORT:-80}"

echo "[tunnel] Starting cloudflared tunnel on port $TUNNEL_PORT..."

# Start cloudflared in background, capture stderr for the URL
TUNNEL_LOG=$(mktemp)
cloudflared tunnel --url "http://localhost:$TUNNEL_PORT" 2>"$TUNNEL_LOG" &
CF_PID=$!

# Wait for the tunnel URL to appear in the log (up to 30 seconds)
TUNNEL_URL=""
for i in $(seq 1 30); do
  TUNNEL_URL=$(grep -oP 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1 || true)
  if [[ -n "$TUNNEL_URL" ]]; then
    break
  fi
  sleep 1
done

if [[ -z "$TUNNEL_URL" ]]; then
  echo "[tunnel] ERROR: Could not detect tunnel URL after 30 seconds"
  cat "$TUNNEL_LOG"
  kill "$CF_PID" 2>/dev/null || true
  rm -f "$TUNNEL_LOG"
  exit 1
fi

echo "[tunnel] Tunnel URL: $TUNNEL_URL"
echo "[tunnel] Updating Gist $GIST_ID..."

# Update the Gist with the new URL
curl -sS -X PATCH \
  -H "Authorization: token $GH_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.github.com/gists/$GIST_ID" \
  -d "{\"files\":{\"backend-url.json\":{\"content\":\"{\\\"url\\\":\\\"$TUNNEL_URL\\\"}\"}}}" \
  > /dev/null

echo "[tunnel] Gist updated. Frontend will auto-discover: $TUNNEL_URL"
echo "[tunnel] Press Ctrl+C to stop"

# Save URL to file for reference
echo "$TUNNEL_URL" > /tmp/tunnel-url.txt

# Wait for cloudflared to exit
wait "$CF_PID"
