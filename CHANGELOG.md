# Changelog

Meaningful code, API, infrastructure, container and architectural changes. See `AGENTS.md` for what belongs here. Git history holds the full detail.

## 2026-11-25 — Nova Phase 2: live voice and memory (built, not yet applied)

- **Live voice**: GPT Live conversations from Nova's web page (`POST /api/live/start`, `/api/live/{id}/end`, `GET /api/live/{id}`). The gateway holds the OpenAI key and a server-side sideband per session; all tool calls run through the gateway's dispatcher with scopes, approvals and audit. Push-to-talk is unchanged.
- **Budget**: per-session usage and cost in `conversations.db`; warning at $25/month, new live sessions refused above $40 (`VOICE_BUDGET_WARN_USD`, `VOICE_BUDGET_LIMIT_USD`); `GET /api/usage`. Sessions end after 2 minutes of silence or 30 minutes (`LIVE_IDLE_END_SECONDS`, `LIVE_MAX_MINUTES`).
- **Shared bootstrap** for live and push-to-talk: rules, capability summary, persona, profile, user-model summary, time, recent conversation summaries.
- **Durable conversations** with full-text search; **observations** (`history/observations.jsonl`, append-only, labelled by evidence type); **user model** (`context/user-model.md`, versioned).
- **`nova-config.yaml`**: validated settings Nova may change on request (planner time, planning window, weekly review, voice). Budget and models stay in `.env`.
- New capabilities: `search_memory`, `read_user_model`, `recent_conversations`, `note_observation`, `get_settings`, `update_setting`.
- **New `nova-engine` stack** (routine, auto-deployed): post-session memory pass and idle-conversation cleanup. Added to `ROUTINE_STACKS` in ops-runner (effective at its next manual rebuild).
- Web page renamed Nova, installable as a home-screen app (manifest and icons).

## 2026-11-25 — Nova Phase 1b: app lockdown (applied)

- Pi-hole left unchanged: the running container differs from `compose/pihole` (LAN DNS binding, missing `.env`). Its admin UI stays on port 8080 with its own password.
- Raspberry Pi nightstand client retired; `pi-wake` credential revoked.

- New `nova-auth` service: per-device sign-in for app hostnames through Caddy `forward_auth`, one sign-in per device at `auth.home.arpa`, per-app scopes (`app.finance`, `app.home`, …), bearer credentials for scripts.
- App ports (finance, guitar, theology, homework, learning, notify, dashboard, Uptime Kuma, Nova gateway) bind to `127.0.0.1`; Caddy and internal callers use container names on the new internal `edge` network. Plain-HTTP app hosts redirect to HTTPS.
- Device registry moves to `/srv/appdata/nova/auth/devices.db` (automatic migration) with a rollback journal so `nova-auth` can mount it read-only.
- `scripts/deploy.sh` never auto-deploys `nova-auth`.

## 2026-11-25 — Nova Phase 1: trusted gateway (deployed; legacy shared token revoked)

- **Gateway (`apps/assistant`)**: per-device revocable credentials with scopes (`devices.db`, CLI `python -m app.devices`); the shared token is imported once as `legacy-shared`, and the public default is refused unless `ALLOW_DEFAULT_LEGACY_TOKEN=true`. Query-string tokens removed; WebSockets use single-use tickets.
- **Capability registry** `apps/assistant/app/capabilities.yaml` with scope, policy and effect per tool; model tools and the bootstrap summary are generated from it per device. Dispatcher enforces scope, argument schema and policy on every call.
- **Approvals**: single-use, bound to arguments, device, session and expiry. Resolved only by the user's next utterance or a UI tap; the model cannot approve.
- **Audit**: append-only `logs/operations.jsonl` (actions, auth failures, denials, approvals, with request IDs and redaction) and `logs/state-changes.jsonl` (persona/profile diffs with evidence).
- **Context**: persona split into `persona.md` and `profile.md` under `/srv/appdata/nova/context`, rewritten rather than appended, with every previous version kept.
- **New `agent-worker`** stack: the Cursor agent moved out of the voice container; no Docker socket; read-only `ask_worker` queries with bounded wait; idempotent job ids.
- **New `ops-runner`** stack: sole holder of the Docker socket; routine stacks run directly, protected stacks need a gateway-relayed approval, `ops-runner` and `agent-worker` are manual-only.
- **Deploy gating**: `scripts/deploy.sh` no longer auto-deploys `caddy`, `dashboard`, `pihole`, `assistant` or `ops-runner`; it lists them as skipped.
- `assistant` no longer mounts the repo or the Docker socket; state moves to `/srv/appdata/nova`.
- Fixed: the Cursor edit popup always showed because its CSS overrode `hidden`. Web UI files are now served with `Cache-Control: no-cache` so browsers pick up fixes.
- Web UI saves the device credential in the browser, accepts a one-time `/#token=…` link, and shows which device it is signed in as.
- Fixed: a light *status* question could change the lights. The pre-existing light nudge told the model to call a light-changing tool whenever a message mentioned lights. It now fires only when the model claims a change without calling any tool.
- Deployed 2026-11-25 02:48 UTC: `ops-runner`, `agent-worker`, `nova-internal` network, and the new gateway (still accepting the legacy token). Rollback image: `assistant-assistant:pre-phase1`.

## 2026-11-25

- Added root `AGENTS.md` with the Nova-critical runtime dependency inventory, approval rules, recovery path and capability-index maintenance rules.
- Added `docs/OPERATIONS_POLICY.md` (what an operations agent may do automatically versus with approval) and `docs/nova/IMPLEMENTATION_PLAN.md` (Nova V1 inventory, decisions and phases).
- Baseline: services as listed in `README.md`, plus `assistant` (port 8006, deployed manually), `notify` (8008) and `learning-app` (8009). No runtime changes.
