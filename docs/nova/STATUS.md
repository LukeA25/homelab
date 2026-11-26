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

Implemented in the checkout for evening homework. The engine writes a reminder in the same transaction as the homework check, holds it while Focus is on or unknown, and checks the homework app again before release. Newer checks replace queued reminders. Each slot expires at the next check or midnight. The existing notify service sends to subscriptions on the homework hostname. History distinguishes push-service acceptance, zero subscriptions, cancellation, expiry, and uncertain sends. The send has zero offline TTL to avoid a late reminder. A DND change after handoff cannot recall an in-flight push.

**Setup and phone acceptance test**

On 2026-11-26, Notify, assistant, homework-app and nova-engine were rebuilt from the checkout. Local health checks passed, the DND and Kuma routes were present, and the engine started without errors. The iPhone subscription, Focus automation and real push still need a device test. The ops-runner and agent-worker builds remain pending manual host deployment.

1. Schedule approved rebuilds of assistant, notify and ops-runner. Apply notify first for TTL support. Use the existing host recovery procedure and prior images for rollback. Configure the engine's private environment with the existing notify token, then apply the routine homework-app and nova-engine builds. Keep credentials outside the checkout. Check gateway, notify and homework health before testing. Rolling back the engine stops the new delivery path. Preserve events.db.
2. Open the HTTPS Homework app from its iPhone Home Screen icon and tap **Enable homework reminders**. Each device opts in on that hostname. Test the real subscription, push and tap back to Homework.
3. Authorize a phone credential for `notifications.dnd`. For Focus on/off Shortcut automations send `PUT https://assistant.home.arpa/api/dnd` with a bearer credential and JSON containing `enabled` (boolean) and `observed_at` (ISO timestamp with offset). Send an initial current-state report and refresh at least daily. GET the same endpoint to verify on/off/unknown. The default is to hold after 24 hours without a fresh report.
4. With homework due at 11:59 PM, turn Focus on before a check. Verify silence, turn it off, and verify one still-relevant reminder. Repeat after marking the work complete and verify silence. Inspect `GET /api/notifications` with `notifications.read`. A send accepted by Web Push does not establish that a phone displayed or opened it.

For the SSH-based Shortcut, store the dedicated `notifications.dnd` credential in `~/.config/nova/focus-token` under the same SSH user as the assignment Shortcut, with mode `600`. In each Do Not Disturb automation, reuse its SSH connection settings and run `python3 /home/landerson/homelab/scripts/nova-focus.py on` or `python3 /home/landerson/homelab/scripts/nova-focus.py off`. The same script accepts `status` for a read-only check. Set both automations to Run Immediately and toggle Focus once to verify both reports.

**Still to implement:** conversation invitations with voice context, generic routing and priorities, per-device delivery preferences and engagement telemetry. The current DND gate covers Nova's homework path. Other applications that call notify directly keep their own delivery behavior.

### Phase 5 — goals, calendar, location, memory seeding

Nova's `learning_goals` tool (scope `learning.goals`) reads actual path goals and statuses from Learning Grove. Phone geofence automations can POST to `/api/events/location` with `events.location`, a short place slug, `transition` of `arrive` or `leave`, and a timezone-aware `observed_at`. Duplicate and out-of-order transitions are filtered per device/place. Reports over an hour old are rejected. `recent_place_events` (scope `location.read`) returns historical transitions. The phone supplies region detection. Real-world accuracy and dwell filtering are pending.

**iCloud CalDAV setup**

1. Fill in `ICLOUD_CALDAV_USERNAME` with your Apple Account email and `ICLOUD_CALDAV_APP_PASSWORD` with your app-specific password in the private, gitignored `compose/nova-engine/.env`. Keep its permissions at 600.
2. From the repo root run `uv run --script scripts/check-nova-caldav.py`. It checks discovery over HTTPS and prints only the number of iCloud calendars found by default. Add `--show-names` to identify calendars locally. The command does not require a running container or a restart.
3. The user approved reading all iCloud calendars discovered by this account. Discovery succeeded for six calendars. Reading their events in the planner remains pending.

**Memory seeding:** Optional local import using `python -m app.memory_seed conversations.json reviewed.json` from the assistant package. Keep both files private outside the checkout. The review file is a JSON array of objects containing `conversation_id`, `message_id` and an exact `excerpt` of up to 1,000 characters from a user message. Only include excerpts you want Nova to retain. The importer verifies every selection before appending observations with source references. Re-importing the same selection skips duplicates. No personal export has been imported.

**Decisions and testing:** Choose which source records gym visits, and which places you want the phone to report. Test arrival/departure on the actual phone and check Learning Grove goals on a scoped device. Calendar integration, adaptive gym planning, weekly recalibration, and notification outcome analysis are pending engineering work. Reviewed memory seeding is optional.

### Phase 6 — worker and resilience

Implemented in the checkout. Kuma heartbeats feed debounced monitor diagnostics. Worker jobs can return protected-operation request IDs that Nova can follow through approval and execution. The gateway and engine are deployed. On 2026-11-26, an unauthenticated request from inside Kuma reached Nova and returned HTTP 401. Kuma had no active Nova webhook and Nova had received zero monitor states. Configure a notification and verify a real heartbeat. The worker and ops-runner deployments and live worker verification remain pending. Automatic repairs triggered by monitor events await a policy decision.

## Decisions still open

Gym data source. Whether anything is reachable from outside Tailscale. How long to keep conversations and observations, and where the backup lives. How much Nova may repair on her own.
