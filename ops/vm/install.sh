#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_ROOT="${REMOTE_ROOT:-/opt/somnia2-deployer}"
STATUS_ROOT="${STATUS_ROOT:-/var/www/somnia2-status}"
NGINX_SITE="${NGINX_SITE:-/etc/nginx/sites-available/somnia2}"

mkdir -p "$REMOTE_ROOT" "$REMOTE_ROOT/bin" "$REMOTE_ROOT/releases" "$STATUS_ROOT/data" "$STATUS_ROOT/assets"

install -m 755 "$ROOT_DIR/deploy.sh" "$REMOTE_ROOT/bin/deploy.sh"
install -m 755 "$ROOT_DIR/check.sh" "$REMOTE_ROOT/bin/check.sh"
install -m 644 "$ROOT_DIR/ecosystem.config.cjs" "$REMOTE_ROOT/ecosystem.config.cjs"

if [[ ! -f "$REMOTE_ROOT/config.env" ]]; then
  install -m 600 "$ROOT_DIR/config.env.example" "$REMOTE_ROOT/config.env"
fi

if [[ ! -f "$REMOTE_ROOT/server.env" ]]; then
  echo "Missing $REMOTE_ROOT/server.env. Copy your backend env there before first deploy." >&2
fi

install -m 644 "$ROOT_DIR/status-site/index.html" "$STATUS_ROOT/index.html"
install -m 644 "$ROOT_DIR/status-site/styles.css" "$STATUS_ROOT/assets/styles.css"
install -m 644 "$ROOT_DIR/status-site/app.js" "$STATUS_ROOT/assets/app.js"
ln -sfn "$STATUS_ROOT" /var/www/somnia2/status

cat > /etc/systemd/system/somnia2-deploy.service <<EOF
[Unit]
Description=Somnia2 deployment check
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$REMOTE_ROOT
Environment=HOME=/root
Environment=PM2_HOME=/root/.pm2
Environment=USER=root
ExecStart=$REMOTE_ROOT/bin/check.sh
EOF

cat > /etc/systemd/system/somnia2-deploy.timer <<EOF
[Unit]
Description=Run Somnia2 deployment check every minute

[Timer]
OnBootSec=30s
OnUnitActiveSec=60s
Unit=somnia2-deploy.service

[Install]
WantedBy=timers.target
EOF

python3 - "$NGINX_SITE" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text()
status_block = """
    location = /status {
        return 301 /status/;
    }

    location = /status/ {
        rewrite ^ /status/index.html break;
    }
""".strip()

if "location = /status" not in text:
    marker = "    location / {\n        try_files $uri $uri/ $uri.html /index.html;\n    }\n"
    if marker not in text:
        raise SystemExit("Expected nginx location block not found.")
    text = text.replace(marker, status_block + "\n\n" + marker)
    path.write_text(text)
elif "location ^~ /status/data/" in text:
    start = text.index("location = /status")
    end = text.index("    location / {", start)
    text = text[:start] + status_block + "\n\n" + text[end:]
    path.write_text(text)
PY

systemctl daemon-reload
nginx -t
systemctl reload nginx
systemctl enable --now somnia2-deploy.timer

if [[ ! -f "$STATUS_ROOT/data/history.json" ]]; then
  cat > "$STATUS_ROOT/data/history.json" <<EOF
{"history":[]}
EOF
  chmod 644 "$STATUS_ROOT/data/history.json"
fi

if [[ ! -f "$STATUS_ROOT/data/status.json" ]]; then
  cat > "$STATUS_ROOT/data/status.json" <<EOF
{
  "repoUrl": "",
  "branch": "main",
  "status": "idle",
  "message": "Awaiting first deployment.",
  "targetCommit": "",
  "deployedCommit": "",
  "startedAt": "",
  "finishedAt": "",
  "durationSec": 0,
  "releasePath": "",
  "logPath": "/status/data/deploy.log",
  "historyPath": "/status/data/history.json",
  "updatedAt": ""
}
EOF
  chmod 644 "$STATUS_ROOT/data/status.json"
fi

touch "$STATUS_ROOT/data/deploy.log"
chmod 644 "$STATUS_ROOT/data/deploy.log"
