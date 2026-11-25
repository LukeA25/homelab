# Nova status

Snapshot of what is running, what is still yours to do, and what the later phases are. The design is in `NOVA_MASTER_DESIGN.md`. The build record and runbooks are in `docs/nova/IMPLEMENTATION_PLAN.md`. What may be restarted without asking is in `AGENTS.md`.

Updated 2026-11-25, after Phase 2 was applied (commit `ed5ba39`, gateway rebuilt the same evening).

## Running now

| Piece | What it does | How it is deployed |
|---|---|---|
| `assistant` | Nova gateway: live voice, push-to-talk, device auth, tools, approvals, audit | Manual. A rebuild drops voice for about 10 seconds. |
| `nova-auth` | Sign-in for `*.home.arpa` apps (`auth.home.arpa`) | Manual. If it is down, gated apps fail closed. |
| `nova-engine` | After a conversation ends: summary, observations, user-model rewrite. Also closes idle push-to-talk conversations. | Routine. CI deploys it. Voice keeps working if it stops. |
| `caddy` | HTTPS and routing | Manual. |
| `ops-runner` | Only container with the Docker socket | Manual, and never from inside itself. |
| `agent-worker` | Cursor coding agent | Manual, and never from inside itself. |

Live data is `/srv/appdata/nova`. The repo only holds source, seeds and schemas.

## Done

### Phase 0 — inventory

`AGENTS.md`, `CHANGELOG.md`, `docs/OPERATIONS_POLICY.md`, and the implementation plan.

### Phase 1 — trusted gateway (deployed)

- Per-device credentials (`nova_<id>_<secret>`), stored as hashes, with scopes. The old shared token is revoked.
- Capability index in `apps/assistant/app/capabilities.yaml`. Every tool call is checked for scope, arguments and policy. Nova cannot spend or move money.
- Spoken approvals: Nova reads the action back, and the user's next reply decides it. A Confirm tap works too. The model cannot approve itself.
- Audit logs under `/srv/appdata/nova/logs`. Persona and profile live in `/srv/appdata/nova/context` and change only through the gateway, with every old version kept.
- Coding agent moved out of the voice container into `agent-worker` (no Docker socket). `ops-runner` is the only thing that can restart containers, and it refuses Nova-critical stacks until you approve the request through Nova.
- CI no longer auto-deploys `caddy`, `dashboard`, `pihole`, `assistant`, `nova-auth` or `ops-runner`.

### Phase 1b — app lockdown (applied)

- One sign-in per device at `auth.home.arpa`. App hostnames check `app.<name>` scopes. Scripts can still send a bearer credential.
- App ports bind to `127.0.0.1`. Caddy reaches them by container name on the internal `edge` network.
- Jellyfin, Home Assistant and Portainer keep their own logins and their direct ports. Uptime Kuma is only through Caddy.
- Pi-hole was left as it was: the running container also serves LAN DNS, and `compose/pihole/.env` is missing, so recreating it from the repo would drop LAN DNS.
- The Raspberry Pi nightstand client is retired. Its `pi-wake` credential is revoked. `internships-app` is out of scope for now.
- Active devices: `iphone`, `laptop`, `ipad2`, all with full access. Revoked: `legacy-shared`, `kiosk`, `ipad`, `pi-wake`.

### Phase 2 — live voice and memory (applied 2026-11-25 evening)

- **Talk to Nova** on `https://assistant.home.arpa` starts a GPT Live conversation (`gpt-live-1`, tools on `gpt-6-luna`). Push-to-talk and typed turns still work.
- The browser only carries audio and captions. The gateway holds the API key and runs every tool, so scopes, approvals and audit are the same as push-to-talk.
- A conversation ends when you tap End, after 2 minutes of quiet, or at 30 minutes.
- Cost is tracked per conversation. The page shows the month's spend. It warns at $25 and refuses new live conversations above $40. Push-to-talk still works past that.
- Conversations, observations and a user model are saved under `/srv/appdata/nova`. About a minute after a conversation ends, `nova-engine` writes a summary, labelled observations, and (when warranted) a new user model. It never edits persona, profile or settings.
- Nova can change, when you ask: planner time, planning window, weekly review, and voice. She cannot change the budget, the models or the limits.
- The page can be added to the home screen (Share → Add to Home Screen on iPhone and iPad).

Checked before and after the rebuild: 90 gateway tests; a real live session connected and billed correctly ($0.0125 for 15 seconds of silence); a real memory pass wrote a summary, two observations and a user model. After the rebuild, health was clean and the new page, manifest and icons were served through Caddy.

Left out of Phase 2 on purpose:

- Nothing records what you say while the connection is still opening. Wait until the button says "go ahead."
- No speech wake word. The gateway's own 2-minute timer ends a quiet conversation.

## Still to do (no new phase)

These are leftovers. None of them block using Nova.

- Try a live conversation from the phone: reload the page, say something after "go ahead," and confirm the month's spend shows under the button. After it ends, `docker logs nova-engine` should show a `memory pass` line.
- Add Nova to the home screen on the phone, iPad and laptop if you want it as an app.
- Point the Uptime Kuma monitors at container names (`http://finance-app:8000` and the rest). Kuma is on `edge`, so the old host-port URLs no longer reach the apps.
- Back up `/srv/appdata/nova`. It now holds conversation history as well as devices, persona and profile.
- Optional: Home Assistant firewall so port 8123 is only reachable on Tailscale, localhost and Docker. You run it; it is not persistent until it is added to `/etc/nftables.conf`. Undo with `sudo nft delete table inet ha_guard`.
- Optional: remove `CURSOR_API_KEY` from `compose/assistant/.env` if it is still there. The coding agent has its own copy.
- Rebuild `ops-runner` by hand sometime. The repo now lists `nova-engine` as a routine stack, but the running ops-runner still has the old list, so Nova cannot restart the engine for you until that rebuild. Voice does not depend on it.
- Reconcile `compose/pihole` with the running container before ever recreating Pi-hole.

## Upcoming and in-progress work

### Phase 3 — events and the daily planner

In the checkout, nova-engine now polls a durable schedule for the four homework checks and records their outcomes. Deployment and phone delivery remain pending. The general planner, system-event intake, voice scheduling and natural-language automations are still open.

Nova starts acting on a schedule. An event store, a daily plan at the planner time, and automations you write. The first automation is the homework check at 6:15, 8, 10 and 11 PM. Offers she makes in conversation ("I'll remind you Friday night") do nothing until this exists. `nova-config.yaml` from Phase 2 is the settings file this phase will schedule against.

### Phase 4 — notifications and Do Not Disturb

Nova can reach you first. Notifications that follow an iPhone Shortcut's Do Not Disturb signal, wait while you are busy, drop when they go stale, and open the right app. `notify` becomes Nova-critical when this ships.

### Phase 5 — goals, calendar, location, memory seeding

Goals and a calendar (provider not chosen), arrive/leave events, periodic cleanup of the user model, and an import of a ChatGPT export after you review it.

### Phase 6 — worker and resilience

Uptime Kuma alerts, diagnostics, smoother follow-up on coding-agent jobs, and only the automatic repairs the operations policy allows.

## Decisions still open

Calendar provider. Gym data source. Whether anything is reachable from outside Tailscale. How long to keep conversations and observations, and where the backup lives. How much Nova may repair on her own.
