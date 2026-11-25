# Changelog

Meaningful code, API, infrastructure, container and architectural changes. See `AGENTS.md` for what belongs here. Git history holds the full detail.

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
- Fixed: a light *status* question could change the lights. The pre-existing light nudge told the model to call a light-changing tool whenever a message mentioned lights. It now fires only when the model claims a change without calling any tool.
- Deployed 2026-11-25 02:48 UTC: `ops-runner`, `agent-worker`, `nova-internal` network, and the new gateway (still accepting the legacy token). Rollback image: `assistant-assistant:pre-phase1`.

## 2026-11-25

- Added root `AGENTS.md` with the Nova-critical runtime dependency inventory, approval rules, recovery path and capability-index maintenance rules.
- Added `docs/OPERATIONS_POLICY.md` (what an operations agent may do automatically versus with approval) and `docs/nova/IMPLEMENTATION_PLAN.md` (Nova V1 inventory, decisions and phases).
- Baseline: services as listed in `README.md`, plus `assistant` (port 8006, deployed manually), `notify` (8008) and `learning-app` (8009). No runtime changes.
