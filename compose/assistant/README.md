# Voice assistant

Homelab voice brain for the nightstand Pi (and desktop testing). The Pi never runs the LLM — it only captures audio and plays replies.

**URL:** http://assistant.home.arpa (port 8006)

## Quick start

1. Copy env and fill secrets:

   ```bash
   cd compose/assistant
   cp .env.example .env
   # Set OPENAI_API_KEY, HA_TOKEN (same as dashboard), ASSISTANT_DEVICE_TOKEN
   docker compose up -d --build
   ```

2. Open http://assistant.home.arpa — hold **Hold to talk**, or use the text box.

3. Pi kiosk + mic client: see [`apps/assistant/pi/README.md`](../apps/assistant/pi/README.md).

## Mic / HTTPS

Chrome only allows `getUserMedia` on **HTTPS** or **localhost**.

- **Permanent (LAN):** open **https://assistant.home.arpa**  
  (Caddy TLS on :443 with an internal CA — accept the cert warning once.)  
  **https://assistant.home.arpa:8443** still works as an alias.
- **Quick test from your laptop:** run this **on the laptop** (not the homelab):

  ```bash
  ssh -L 8006:127.0.0.1:8006 landerson@100.101.135.109
  ```

  Then open **http://localhost:8006** — mic works without HTTPS.

All `/api/*` routes (and `/ws/voice`) require `ASSISTANT_DEVICE_TOKEN` via:

- Header `X-Assistant-Token: …`, or
- `Authorization: Bearer …`, or
- Query `?token=…` (WebSocket)

## Tools

- Room lights (bedroom / living_room) via Home Assistant
- Scenes: sleep, wake (1% warm), study
- List / add homework
- Read-only finance summary (via dashboard `/api/finance/summary`)
- `cursor_status` / `propose_cursor_edit` — Cursor jobs are **confirm-gated** on the web UI
- Cursor agents can run `docker compose` on this host (Docker socket mounted into the assistant container — treat that like root)
- Nightstand control panel: **https://assistant.home.arpa/control** (same cert as the voice UI)

## Protocol

- `POST /api/turn` multipart `audio` → `{ transcript, reply, actions, audio_base64, cursor_proposal }`
- `POST /api/turn/text` JSON `{ text }` — same response (no mic)
- `WS /ws/voice?token=…` — `start` → binary chunks → `end` → status events + `result`
