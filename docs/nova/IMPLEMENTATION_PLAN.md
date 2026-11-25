# Nova V1 implementation plan

How `NOVA_MASTER_DESIGN.md` maps onto this repository. The design document is authoritative for behavior; this file records what already exists, the decisions made for this repo, and the build order. Update it when a decision changes or a phase completes.

## Decisions (2026-11-25)

| Topic | Decision |
|---|---|
| Gateway | Evolve `apps/assistant` into the Nova gateway rather than building a parallel service. |
| Coding worker | Move the Cursor worker out of the `assistant` container into its own container. It gets a restricted ops helper that refuses to touch Nova-critical stacks without a gateway-issued approval. |
| Event engine | Scheduler, background reasoner and notification queue run in a separate `nova-engine` container sharing the Nova datastore, so engine changes do not restart voice. |
| Live state | `/srv/appdata/nova` (context files, SQLite, history, logs). The repo holds templates, schemas and seed files only. |
| Device scope enforcement | Move app ports off the tailnet now, and put per-device auth in front of app hostnames at Caddy (`forward_auth` to the gateway). |
| Approval channel | Spoken approval after read-back, enforced by the gateway (see "Spoken approval"). A UI tap is also accepted. |
| Deploy | Remove Nova-critical stacks from automatic deploy; deploy them manually after approval. |

## Existing components

| Design component | Exists today | Plan |
|---|---|---|
| Gateway / tool dispatcher | `apps/assistant` (FastAPI, port 8006, `assistant.home.arpa`). Tools in `app/tools.py`: lights, scenes, weather, TV app, homework list/add, finance summary, persona update, Cursor status/propose. | Extend: device registry, capability registry, policy, approvals, audit log. |
| Voice | Assistant: per-turn speech-to-text → Responses API (`gpt-5.4`) → text-to-speech, over HTTP and `/ws/voice`. `apps/learning-app/app/voice.py`: WebRTC session negotiation for hosted realtime voice (`gpt-live-1` with Responses delegation, and `gpt-realtime`). | Port the learning-app negotiation into the gateway for phone voice. Keep the per-turn path for the Pi wake-word client. Verify current model IDs and pricing at implementation time. |
| Clients | Browser push-to-talk (`apps/assistant/static`), Pi wake-word client and kiosk (`apps/assistant/pi`), kiosk `/control` page served by the dashboard. | Keep. iPhone starts as a home-screen web app; native packaging is out of scope. |
| Coding worker | `apps/assistant/app/cursor_agent.py`: Cursor SDK in a background thread, proposals in a JSON file, confirmed by an on-screen tap. | Reuse the code in its own container. |
| Persona | `apps/assistant/data/persona.md`, append-only updates, tracked in git and read live. | Split into `persona.md` and `profile.md` under `/srv/appdata/nova/context`. Rewrite on update instead of appending; audit every change. |
| Conversation memory | In memory, 5-minute TTL. | Build durable transcripts, user model and append-only history. |
| Notifications | `apps/notify`: Web Push per app hostname, shared send token, no send history, DND or priority. | Keep as the delivery transport. Build notification records, DND queue and relevance in `nova-engine`. |
| Health events | Uptime Kuma, not integrated. | Use its webhook notifications as a system-event producer. |
| Event engine, planner, automations, config | None. | Build in `nova-engine`. |
| Finance | No money-movement endpoints. Categorization rules (`/api/rules`) and budget projections (`/api/projections`) exist. | Register reads and categorization as automatic; rules and projection changes require approval. |
| Public HTTPS fallback | Tailscale Funnel on port 10000 serves only the dashboard's read-only guest cast screen. | Build a separate gateway-only ingress in a later phase. |

The Nova-critical runtime dependency inventory is maintained in [`AGENTS.md`](../../AGENTS.md).

## Known conflicts and how the plan resolves them

1. **Worker inside the voice container with the Docker socket.** Resolved by the worker container decision. Until then, `AGENTS.md` forbids the in-container worker from modifying `assistant`.
2. **CI auto-deploys critical stacks and resets the live checkout.** Resolved by deploy gating (Phase 1) and by moving runtime state out of the repo.
3. **Runtime state tracked in git.** `apps/assistant/data/*` moves to `/srv/appdata/nova` in Phase 1.
4. **Single shared device token; unauthenticated app APIs.** Resolved by per-device credentials, port rebinding and Caddy `forward_auth` (Phase 1b).
5. **Notification transport limits.** iOS delivers Web Push only to home-screen web apps, subscriptions are per hostname rather than per device, and there is no priority field. Phase 4 adds device-aware subscriptions; opening voice from a notification tap must be tested on the phone (a second tap may be required to start the microphone).
6. **Worker interaction model.** The existing worker is asynchronous. Questions will use a bounded synchronous wait; change requests return "running" and report completion by notification or in the next session, without holding a voice session open.

## Spoken approval

The model must not be able to approve its own actions.

- For a protected action, the gateway creates a single-use approval bound to the exact action and parameters, the session, the originating device and a short expiry, and returns read-back text.
- Nova reads it back. Approval is accepted only when the user's own input transcription (forwarded by the client from the realtime session) contains an affirmative after the read-back was delivered. A model tool call alone never counts.
- Ambiguous, late, or mismatched responses fail closed. A tap in the client UI is an alternative path to the same approval record.
- Every approval request, grant, denial and expiry is audited.

## Resolved: auth service placement (2026-11-25)

`forward_auth` must not make every app depend on the gateway. The device registry is a SQLite file (`/srv/appdata/nova/devices.db`) read through `apps/assistant/app/devices.py` and `store.py`, which use only the standard library. In Phase 1b a small `nova-auth` container — built from the same source with a different entrypoint — mounts that directory read-only and answers Caddy's `forward_auth` checks. The gateway owns enrollment and revocation; `nova-auth` only verifies. Restarting or rebuilding the gateway therefore never locks you out of the apps. If `nova-auth` itself is down, app hostnames fail closed and recovery is over SSH to direct ports or the host.

## Caddy `forward_auth` and port rebinding — implications

These are Phase 1b concerns to resolve before that change is applied:

- **Upstream reachability.** Every Caddy upstream, and the dashboard's guest and cast proxies, target `100.101.135.109:<port>`. Rebinding app ports to localhost requires Caddy and the apps to share a Docker network (or Caddy to use host networking), and the dashboard upstream env vars to change.
- **Home Assistant** uses host networking on 8123 and cannot be rebound the same way; it needs a host firewall rule or a Tailscale ACL.
- **Dependency cycle.** With `forward_auth`, every app hostname depends on the gateway. If the gateway is down, the apps are unreachable through Caddy. Options: run auth as a small separate service rather than inside `assistant`, or accept that recovery uses SSH. Avoid making the gateway's own recovery depend on itself.
- **Browsers and kiosks.** App pages loaded in a browser need a device credential (cookie set at enrollment). The TV, Pi kiosk, iPad and Apple Shortcuts each need their own enrolled credential and scope.
- **Funnel guest screen** keeps working only if the guest proxy can still reach the apps after rebinding.
- **Rollout.** This recreates Caddy, the dashboard, `assistant` and every app stack. Do it in one approved maintenance window with a written rollback (restore the previous Caddyfile and compose files and `docker compose up -d`).

## Phases

Each item that restarts or redeploys a Nova-critical component is applied only after explicit approval, per `AGENTS.md`.

### Phase 0 — Inventory and baseline (done 2026-11-25)

Root `AGENTS.md`, `CHANGELOG.md`, `docs/OPERATIONS_POLICY.md`, this plan.

### Phase 1 — Trusted gateway (deployed 2026-11-25; runbook complete; devices pi-wake/kiosk/iphone/laptop enrolled, legacy-shared revoked)

Built as planned below, with these specifics: capabilities in `apps/assistant/app/capabilities.yaml`; approvals in `/srv/appdata/nova/nova.db`; audit logs as JSONL under `/srv/appdata/nova/logs`; worker in `compose/agent-worker`; Docker access only through `compose/ops-runner`. Tests: `apps/assistant/tests` (50), `apps/ops-runner/tests` (8), `apps/agent-worker/tests` (5).

Known gaps carried forward:
- `GET /api/last-turn` stays unauthenticated until the dashboard kiosk client sends its credential (needs a dashboard rebuild).
- Worker read-only queries are read-only by instruction, not by filesystem permission.
- The capability registry is the model-facing index; the enforced schema check is a subset of JSON Schema.

#### Deployment runbook

Steps 4 and 6 interrupt Nova's voice path and need explicit approval at the time.

1. **Secrets** (no runtime effect). Generate three tokens with `openssl rand -hex 32`. Create `compose/agent-worker/.env` (`CURSOR_API_KEY` moved from `compose/assistant/.env`, `WORKER_TOKEN`, `OPS_WORKER_TOKEN`) and `compose/ops-runner/.env` (`OPS_WORKER_TOKEN`, `OPS_GATEWAY_TOKEN`). Add `WORKER_TOKEN`, `OPS_GATEWAY_TOKEN` and, because the live token is the public default, `ALLOW_DEFAULT_LEGACY_TOKEN=true` to `compose/assistant/.env`.
2. **Network** (no runtime effect): `docker network create --internal nova-internal`.
3. **New services** (no effect on running services): `docker compose up -d --build` in `compose/ops-runner`, then `compose/agent-worker`.
4. **Gateway** (voice outage of roughly 10–30 seconds): `cd compose/assistant && docker compose up -d --build`. Persona and profile are seeded from `apps/assistant/seed` (the same content as the current persona file). Old Cursor proposal history in `apps/assistant/data/cursor_proposals.json` is not migrated; it contains nothing in progress.
   - Verify: `/api/health` shows the legacy warning; the Pi and kiosk still work; a text turn controls a light; `cursor_status` reports the worker reachable; `homelab-ops stacks` works inside `agent-worker`.
   - Rollback: `git checkout <previous commit> -- apps/assistant compose/assistant && cd compose/assistant && docker compose up -d --build` (the old files in `apps/assistant/data/` are still on disk).
5. **Enroll devices** (no runtime effect): one credential each for the Pi (`wake.env` on the Pi), the kiosk (open `/control?token=…` once), the phone and the laptop browser.
6. **Retire the shared token** (affects only clients still on it): `python -m app.devices revoke legacy-shared`, remove `ALLOW_DEFAULT_LEGACY_TOKEN` and `ASSISTANT_DEVICE_TOKEN`, recreate `assistant`.
7. **Untrack old state**: `git rm --cached apps/assistant/data/persona.md apps/assistant/data/cursor_proposals.json`, add `apps/assistant/data/` to `.gitignore`, commit.

#### Original Phase 1 scope

- Create `/srv/appdata/nova` layout; move persona (split into persona and profile) and Cursor proposals there; gitignore and stop tracking the old files.
- Device registry (SQLite, hashed credentials, revocation, scopes) replacing `ASSISTANT_DEVICE_TOKEN`; no query-string tokens except a short-lived WebSocket ticket.
- Capability registry (YAML in repo, validated at startup and in tests against handlers): description, schema, required scope, policy (automatic / approval / forbidden). Bootstrap capability summary generated from it, replacing the hand-written list in `pipeline.py`.
- Policy engine, approval records, spoken approval flow.
- Structured audit log (gateway operations) and a separate state-change audit, both append-only, under `/srv/appdata/nova/logs`.
- Worker container with restricted ops helper; gateway calls it with a bounded timeout.
- Deploy gating: remove `caddy`, `dashboard` and `pihole` from automatic deploy; add a manual path for critical stacks.
- Tests: unauthorized device, out-of-scope tool (including via the model), protected action without approval, finance money movement unavailable.

### Phase 1b — App lockdown (applied 2026-11-25 18:51–18:56 UTC)

Applied with one deviation: **Pi-hole was left unchanged.** The running container was created from an older compose file that also binds DNS on the LAN (`192.168.1.156:53`) and its `compose/pihole/.env` no longer exists, so recreating it from the repo would drop LAN DNS. Its admin UI stays on `0.0.0.0:8080` (own password) and Caddy still proxies to it there. Reconcile `compose/pihole` with the running container before ever recreating it. The Raspberry Pi nightstand client has been retired and its `pi-wake` credential revoked.

Note: `compose/caddy/Caddyfile` is bind-mounted as a single file. Editors and `sed -i` replace the file, so `caddy reload` keeps reading the old one; recreate Caddy (`docker compose up -d --force-recreate`) after editing.

Decisions (2026-11-25): single sign-in per device at `auth.home.arpa`; apps with their own login (Jellyfin, Home Assistant, Uptime Kuma, Pi-hole, Portainer) keep it; Jellyfin, Home Assistant and Portainer stay directly reachable, Uptime Kuma and Pi-hole only through Caddy; Home Assistant gets an nftables rule run by the user; `internships-app` is out of scope for now. The homework Shortcuts run `add.py` over SSH and touch no app port.

Design:
- `nova-auth` (`apps/assistant/app/authsvc.py`, image built from the gateway source) answers `forward_auth` at `/verify?app=<name>`; a device needs scope `app.<name>` (`home` covers the dashboard, homepage and kiosk routes). Browsers without a session are redirected to `auth.home.arpa/login`, sign in once with their credential (or a `#token=` link), and come back through `/__auth/callback` with a 60-second single-use code that becomes a host-bound, HTTPS-only session cookie. Scripts send `Authorization: Bearer <credential>`. Every check re-reads the registry, so revocation is immediate.
- The device registry moves to `/srv/appdata/nova/auth/devices.db` (migrated automatically by the gateway) and uses SQLite's rollback journal, so `nova-auth` mounts only that directory, read-only, with a read-only root filesystem and no network except `edge`.
- App ports bind to `127.0.0.1`; Caddy, `nova-auth`, the gateway and the dashboard reach apps by container name on the internal Docker network `edge`. Plain-HTTP app hosts redirect to HTTPS. The gateway's port 8006 also becomes host-only, closing direct access to `/api/last-turn`, which Caddy now gates as `app.home`.
- Rehearsed end to end on an isolated network with the real Caddyfile (redirect to sign-in, 401 for API calls, bearer scope check, sign-in hand-off, code replay, host binding, revocation, assistant-host gating).

#### Phase 1b maintenance window

Expected impact: app hostnames unavailable for 2–3 minutes in total; voice drops for about 5 seconds twice (gateway and Caddy recreate); DNS pauses about 10 seconds (Pi-hole recreate). Every browser then signs in once per device.

Prechecks (no live effect):
1. On the Pi, `ASSISTANT_URL` in `wake.env` is unset or `https://assistant.home.arpa` (port 8006 becomes host-only).
2. `compose/nova-auth/.env` with `AUTH_SECRET` (`openssl rand -hex 32`).
3. `docker network create --internal edge`.
4. Tag rollback images: `assistant-assistant:pre-1b`, `dashboard-dashboard:pre-1b`.

Window, in order:
1. Gateway: `cd compose/assistant && docker compose up -d --build`. Check health, `auth/devices.db` exists, device list unchanged.
2. `cd compose/nova-auth && docker compose up -d --build`. Check `/health` from the gateway container.
3. DNS: add `100.101.135.109 auth.home.arpa` to the full `dns.hosts` list with `pihole-FTL --config dns.hosts`.
4. Apps: `docker compose up -d` in `finance-app`, `guitar-app`, `theology-app`, `homework-app`, `learning-app`, `notify`, `uptime-kuma`.
5. `cd compose/dashboard && docker compose up -d --build`; `cd compose/pihole && docker compose up -d`.
6. `cd compose/caddy && docker compose up -d` (recreate: joins `edge`, loads the new Caddyfile).
7. Verify: every gated host redirects to sign-in; `auth.home.arpa` loads; Nova health through Caddy; Jellyfin, Home Assistant, Uptime Kuma, Pi-hole and Portainer load; app ports refuse connections on `100.101.135.109`; guest screen answers on `127.0.0.1:8010`.
8. Sign in each device once. Pi kiosk: open `https://auth.home.arpa/login?rd=https://assistant.home.arpa/control#token=<pi-wake credential>` in its Chromium.
9. Uptime Kuma monitors move to container names (`http://finance-app:8000`, …); Kuma is on `edge`.
10. Commit and push only after the window: routine app stacks auto-deploy and need `edge` and the new Caddyfile.

Home Assistant firewall (user, with sudo; optional, not persistent across reboots unless added to `/etc/nftables.conf`): accept TCP 8123 on `lo`, `tailscale0`, `docker0` and `br-*`, drop it elsewhere (the LAN). The Home Assistant phone app then needs Tailscale at home too. Remove with `sudo nft delete table inet ha_guard`.

Rollback: `git checkout 45f4e16 -- compose apps/dashboard apps/assistant scripts/deploy.sh`, move the registry back (`docker exec assistant mv /data/auth/devices.db /data/devices.db`), then `docker compose up -d --build` in `assistant`, the app stacks, `dashboard`, `pihole` and `caddy`, and `docker compose down` in `nova-auth`.

### Phase 2 — Voice and context (built 2026-11-25; not yet applied)

Decisions: GPT Live (`gpt-live-1`, $0.05/min active, $0.02/min standby) with `gpt-6-luna` as the tool backend; warn at $25/month and refuse new live sessions above $40 (push-to-talk keeps working); a live conversation ends after 2 minutes of silence or at 30 minutes; the client is Nova's web page, installable as a home-screen app.

- **Live sessions** (`app/live.py`): the browser posts its WebRTC offer to `POST /api/live/start`; the gateway creates the session with the server's key and attaches to its sideband WebSocket. Every tool call runs in the gateway through `dispatch` (scopes, approvals and audit unchanged); the browser carries only audio and captions. Spoken approvals are settled from the transcript with the same rule as push-to-talk, and the outcome is reported to the voice through `session.commentary.append`. The gateway closes sessions on silence, at the limit, when the user ends them, and on shutdown; sessions left open by a crash are closed at startup.
- **Bootstrap** (`app/bootstrap.py`): one briefing for both engines: rules, the device's capability summary, persona, profile, the user-model summary, current time and the last three conversation summaries.
- **Conversations** (`conversations.db`): sessions, turns, usage, cost and a full-text index over turns, observations and summaries. Push-to-talk turns are grouped into conversations split by 10 minutes of inactivity.
- **Memory**: `history/observations.jsonl` (append-only, labelled statement / outcome / inference / pattern, with source) and `context/user-model.md` (rewritten by the memory pass, versioned, audited with `explicit_instruction: false`).
- **Settings** (`nova-config.yaml`): planner time, planning window, weekly review, voice. Validated; changed only through `update_setting` and audited. Budget, models and limits are `.env` settings Nova cannot change.
- **New capabilities**: `search_memory`, `read_user_model`, `recent_conversations`, `note_observation` (scope `nova.memory`); `get_settings`, `update_setting` (scope `nova.config`).
- **`nova-engine`** (`compose/nova-engine`, same image, `python -m app.engine`): closes idle push-to-talk conversations and runs one structured memory pass per finished conversation, with retries and backoff. Routine stack, auto-deployed.

Not done from the original Phase 2 scope: a microphone buffer that captures speech during connect (the page says "Connecting…" until the line is open instead), and the speech wake policy (its request shape is unverified; the gateway's own silence timer ends sessions).

Apply runbook:

1. Create `compose/nova-engine/.env` from `.env.example` with the OpenAI key (copy it from `compose/assistant/.env` without printing it). This must exist before the push, or the CI deploy of `nova-engine` fails.
2. With approval: `cd compose/assistant && docker compose up -d --build` (about 10 seconds of voice downtime). Verify `/api/health`, `/api/usage`, a push-to-talk turn, then a live conversation from a phone.
3. `cd compose/nova-engine && docker compose up -d --build`; check `docker logs nova-engine` for "nova-engine started", and after a conversation, for a "memory pass" line.

Rollback: `docker compose down` in `nova-engine`; check out the previous `apps/assistant` and rebuild `assistant`. The new data files (`conversations.db`, `history/observations.jsonl`, `context/user-model.md`, `nova-config.yaml`) are ignored by the old gateway.

### Phase 3 — Event engine and planner

SQLite event store with atomic state transitions and idempotency keys; due-event polling; authenticated system-event intake; daily planner; `automations.md`; validated `nova-config.yaml`; reconciliation; homework 6:15 / 8 / 10 / 11 PM check as the first deterministic event.

### Phase 4 — Notifications and DND

Notification records, DND state from an iOS Shortcut with stale-state handling, durable queue, relevance and expiry, collapse on release, app and deep-link routing validated against the registry, conversation invitations carrying event context. Update `AGENTS.md` to mark `notify` Nova-critical.

### Phase 5 — Goals, calendar, location, memory seeding

Common goals interface via adapters, calendar provider (open), geofence events, user-model consolidation with preserved evidence, ChatGPT export import with user review.

### Phase 6 — Worker and resilience

Approval continuation for worker operations, Uptime Kuma webhook events with debounce, diagnostics, and any automatic repairs the operations policy authorizes.

## Open items

Calendar provider; gym data source; public HTTPS ingress design; backup and retention policy (now including `conversations.db` and `history/`); self-healing scope.
