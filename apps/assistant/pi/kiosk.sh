#!/usr/bin/env bash
# Same as a working: chromium --kiosk <url>
# Plus Google API keys from env file (needed for browser wake).
set -euo pipefail
export HOME="${HOME:-/home/homelab}"

if [[ -f "$HOME/.config/homelab/chromium-google-api.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.config/homelab/chromium-google-api.env"
  set +a
fi

exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --autoplay-policy=no-user-gesture-required \
  --auto-accept-camera-and-microphone-capture \
  --use-fake-ui-for-media-stream \
  https://assistant.home.arpa/control
