#!/usr/bin/env bash
# Install / refresh the user systemd unit that keeps Metro available for Expo Go.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNIT_DIR="${HOME}/.config/systemd/user"
UNIT_NAME="study-desk-metro.service"
NODE_BIN="$(dirname "$(command -v node)")"

mkdir -p "$UNIT_DIR"

# No CI=1: that disables Metro file watching. Stdout is journald, which is fine.
cat >"$UNIT_DIR/$UNIT_NAME" <<EOF
[Unit]
Description=Study Desk Expo Metro (LAN)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${ROOT}
Environment=PATH=${NODE_BIN}:/usr/local/bin:/usr/bin:/bin
Environment=EXPO_NO_TELEMETRY=1
Environment=REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.156
ExecStart=${NODE_BIN}/npx expo start --lan --port 8081
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now "$UNIT_NAME"
systemctl --user restart "$UNIT_NAME"
echo "Enabled ${UNIT_NAME}. Logs: journalctl --user -u ${UNIT_NAME} -f"
echo "On iPad Expo Go open: exp://192.168.1.156:8081"
systemctl --user status "$UNIT_NAME" --no-pager || true
