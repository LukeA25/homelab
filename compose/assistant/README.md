# Nova gateway (assistant)

Nova's gateway and the current voice turn API for the nightstand Pi, the browser push-to-talk page and the kiosk. The Pi never runs the LLM — it only captures audio and plays replies.

**URL:** https://assistant.home.arpa (port 8006). Nova-critical: read `AGENTS.md` before restarting or rebuilding.

## Pieces

| Container | Role |
|---|---|
| `assistant` (this stack) | Device auth, capability registry, approvals, audit log, voice turns |
| `agent-worker` (`compose/agent-worker`) | Cursor coding agent; no Docker socket |
| `ops-runner` (`compose/ops-runner`) | Only container with the Docker socket; runs approved operations |
| `nova-engine` (`compose/nova-engine`) | Post-session memory pass; closes idle push-to-talk conversations |

They talk over the internal Docker network `nova-internal`. Live state is in `/srv/appdata/nova`:

```
context/persona.md, context/profile.md    seeded from apps/assistant/seed on first start
context/user-model.md                      Nova's working understanding (rewritten by the memory pass)
nova-config.yaml                           settings Nova may change on request (validated, audited)
auth/devices.db                            enrolled devices (hashed credentials, scopes)
nova.db                                    approvals
conversations.db                           sessions, transcripts, usage, cost, search index
history/observations.jsonl                 append-only evidence behind the user model
history/context-versions/                  every previous persona/profile/user-model version
logs/operations.jsonl                      gateway actions, auth decisions, approvals
logs/state-changes.jsonl                   persona/profile changes with diffs and evidence
```

## Devices

Every client needs its own credential, sent as `X-Assistant-Token: …` or `Authorization: Bearer …`. Query-string tokens are not accepted; WebSockets use a 60-second single-use ticket from `POST /api/ws-ticket` (`/ws/voice?ticket=…`).

```bash
docker exec assistant python -m app.devices enroll iphone --scopes '*'
docker exec assistant python -m app.devices enroll ipad --scopes 'nova.voice,theology.*'
docker exec assistant python -m app.devices list
docker exec assistant python -m app.devices set-scopes ipad --scopes 'nova.voice'
docker exec assistant python -m app.devices revoke ipad
```

Scopes: `nova.voice` (talk to Nova), `home.lights`, `home.scenes`, `home.tv`, `weather.read`, `homework.read`, `homework.write`, `finance.read`, `nova.persona`, `nova.profile`, `nova.memory`, `nova.config`, `worker.status`, `worker.query`, `worker.change`, `ops.approve`. `*` and prefixes like `home.*` work.

App sign-in (checked by `nova-auth` at Caddy): `app.home` (dashboard, homepage, kiosk), `app.finance`, `app.guitar`, `app.theology`, `app.homework`, `app.learning`, `app.notify`; `app.*` grants all. Example for an iPad limited to theology: `--scopes 'app.theology'`.

The old shared `ASSISTANT_DEVICE_TOKEN` is imported once as device `legacy-shared` with full access so existing clients keep working. `/api/health` warns while it is active. The public default value is refused unless `ALLOW_DEFAULT_LEGACY_TOKEN=true`.

## Approvals

Capabilities with `policy: approval` (Cursor change requests, protected-stack operations) never run straight from the model. The gateway records a single-use approval bound to the exact arguments, device and session, and Nova reads it back. The user's very next utterance decides it: a short clear yes runs it, anything else declines or cancels it. A tap on Confirm in the UI (`POST /api/approvals/{id}` or the Cursor proposal buttons) works too, from a device that holds the capability's scope.

## Tools

Declared in `apps/assistant/app/capabilities.yaml` (see `AGENTS.md`). Currently: lights, scenes, TV app, weather, homework list/add, read-only finance summary, persona and profile rewrites, memory search and observations, settings, coding-agent status/questions/change requests, and protected-operation approvals.

## Protocol

- `POST /api/live/start` JSON `{ sdp }` → `{ conversation_id, sdp, budget, idle_end_s, max_minutes }` (402 when this month's voice spend is over the limit). The gateway runs the session's tools over its own sideband.
- `POST /api/live/{id}/end`, `GET /api/live/{id}` (active, seconds, cost), `GET /api/usage` (month-to-date budget)
- `POST /api/turn` multipart `audio` → `{ transcript, reply, actions, audio_base64, cursor_proposal }`
- `POST /api/turn/text` JSON `{ text }` — same response (no mic)
- `WS /ws/voice?ticket=…` — `start` → binary chunks → `end` → status events + `result`
- `GET /api/devices/me`, `GET /api/approvals`, `POST /api/approvals/{id}` `{decision: yes|no}`
- `GET /api/last-turn` is still unauthenticated for the kiosk display (known gap; see the plan)

## Live voice settings (`.env`, not changeable by Nova)

| Variable | Default |
|---|---|
| `LIVE_MODEL` / `LIVE_BACKEND_MODEL` | `gpt-live-1` / `gpt-6-luna` |
| `VOICE_BUDGET_WARN_USD` / `VOICE_BUDGET_LIMIT_USD` | `25` / `40` (per calendar month, `DISPLAY_TZ`) |
| `LIVE_IDLE_END_SECONDS` / `LIVE_MAX_MINUTES` | `120` / `30` |
| `LIVE_ACTIVE_USD_PER_MIN` / `LIVE_PAUSED_USD_PER_MIN` | `0.05` / `0.02` (cost estimate only) |

## Mic / HTTPS

Chrome only allows `getUserMedia` on HTTPS or localhost. Use https://assistant.home.arpa (Caddy internal CA), or tunnel: `ssh -L 8006:127.0.0.1:8006 landerson@100.101.135.109` and open http://localhost:8006.

Pi kiosk and wake client: [`apps/assistant/pi/README.md`](../../apps/assistant/pi/README.md). Put the Pi's own device credential in `ASSISTANT_DEVICE_TOKEN` in its `wake.env`.

## Tests

```bash
cd apps/assistant && pip install -r requirements.txt pytest && pytest
```
