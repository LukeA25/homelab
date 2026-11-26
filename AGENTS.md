# Agent instructions — homelab

These rules apply to every coding agent (Cursor, Codex, or the Nova-delegated worker) working in this repository. A nested `AGENTS.md` adds rules for its subtree and wins on conflict — for example [`apps/theology-app/mobile/AGENTS.md`](apps/theology-app/mobile/AGENTS.md) pins Expo SDK 54.

Nova's design is specified in `NOVA_MASTER_DESIGN.md`; the repo-specific plan, decisions and deployment runbook are in [`docs/nova/IMPLEMENTATION_PLAN.md`](docs/nova/IMPLEMENTATION_PLAN.md). What an operations agent may do on its own is in [`docs/OPERATIONS_POLICY.md`](docs/OPERATIONS_POLICY.md).

`AGENTS.md` is guidance, not a security boundary. The technical controls are: the worker has no Docker socket, `ops-runner` refuses protected stacks without a user approval relayed by the gateway, `scripts/deploy.sh` never auto-deploys Nova-critical stacks, and the gateway enforces device scopes and approval policy. Keep this file in sync with them.

## Layout

- `apps/<name>/` — application source. `compose/<name>/` — the Docker Compose stack that runs it.
- Runtime data lives on the host under `/srv/appdata/<name>` (homework is the exception: `/home/landerson/homework-test/data`, shared with Apple Shortcuts scripts and mounted read-only by the dashboard). Nova's live state is `/srv/appdata/nova`.
- `/home/landerson/homelab` is both the working checkout and the deploy checkout. CI runs `git reset --hard` here on every push to `main`.

**Never store runtime state in the repo checkout.** Anything a running service writes (memory, persona edits, approvals, events, logs) belongs under `/srv/appdata/<service>`. `apps/assistant/data/` is the pre-Phase-1 location and is untracked once the Phase 1 deploy is applied.

## Protecting Nova's running voice path

The protection is about **runtime impact**, not about which files you touch. You may read and edit any file a task needs. You must **ask the user first** before any action that could interrupt or destabilize Nova's running voice/control path.

> Nova's persona and profile live in `/srv/appdata/nova/context/` and change only through the gateway (versioned and audited). `apps/assistant/seed/` is used only to seed an empty data directory.

### Dependency inventory

| Component | Defined in | Interrupted by | Edits with immediate live effect |
|---|---|---|---|
| `assistant` (Nova gateway: live and push-to-talk voice, device auth, tools, approvals, live-session sideband) | `compose/assistant/`, `apps/assistant/` | stop, restart, rebuild, recreate, `compose/assistant/restart.sh`, `docker compose up` in that stack, `.env` change plus recreate. A restart also ends every live conversation in progress. | files under `/srv/appdata/nova/context/` (read on every turn); `/srv/appdata/nova/nova-config.yaml` (read at each live session start); `/srv/appdata/nova/auth/devices.db` (device registry). Source code is baked into the image. |
| `nova-auth` (per-device sign-in for every gated `*.home.arpa` app and the kiosk routes; Caddy `forward_auth`) | `compose/nova-auth/`, `apps/assistant/app/authsvc.py` | stop, restart, rebuild, recreate; `AUTH_SECRET` change signs every browser out. If it is down, gated hosts fail closed. | `/srv/appdata/nova/auth/devices.db` (read-only mount) |
| `notify` (Nova push delivery) | `compose/notify/`, `apps/notify/` | restart, rebuild or recreate interrupts notification delivery | — |
| `ops-runner` (only holder of the Docker socket; executes approved operations) | `compose/ops-runner/`, `apps/ops-runner/` | any restart or rebuild. **Manual-only**: apply from the host, never through itself or the worker. | — |
| `caddy` (TLS and routing for `assistant.home.arpa` and every `*.home.arpa` host) | `compose/caddy/Caddyfile`, `compose/caddy/private/*.caddy` | restart, reload, recreate | none until reloaded |
| `dashboard` (serves the kiosk `/control`, `/api/rooms` and related routes on the assistant hostname) | `compose/dashboard/`, `apps/dashboard/` | restart, rebuild | none until rebuilt |
| `pihole` (resolves `*.home.arpa` for tailnet clients) | `compose/pihole/` | restart, recreate, DNS record edits via `pihole-FTL --config dns.hosts` | live DNS config edits |
| Docker network `nova-internal` (gateway ↔ worker ↔ ops-runner) | created by hand (runbook) | removal or recreation | — |
| Docker network `edge` (Caddy, `nova-auth`, gateway and dashboard ↔ apps; app ports are host-only) | created by hand (runbook) | removal or recreation | — |
| Host networking | host | `tailscaled` restart or config change, Tailscale serve/funnel changes, Docker daemon restart, firewall changes | — |
`agent-worker` (the Cursor coding agent) is not on the voice path, but it is the remote repair channel: it is **manual-only** and must never be rebuilt or restarted from inside itself. If it is down, use the host recovery path below.

`nova-engine` (post-session memory pass, idle-conversation cleanup) is not on the voice path: if it stops, voice keeps working and finished conversations queue until it returns. It is a routine stack built from `apps/assistant/` and auto-deployed. It writes `/srv/appdata/nova/context/user-model.md` (explicit=false in the audit log) but never persona, profile, settings or devices.

Services Nova calls as tools (Home Assistant, `homework-app`, `finance-app`) are not on the voice path: if they stop, a tool fails but voice keeps working. Notify is protected for Phase 4 delivery.

### Operations that require explicit approval

- Stopping, restarting, rebuilding, recreating, or redeploying any component in the table above.
- Editing files listed under "edits with immediate live effect".
- Changing Docker networks, port bindings, Tailscale configuration, or DNS records that those components use.
- Operating any stack not in the routine list below (including `homeassistant` and `portainer`, which is part of the recovery path).

When asking, state: what you will do, the anticipated impact (what goes down and for how long), the recovery path, how you will verify success, and how to roll back. Approval covers that one operation only.

**Routine stacks** may be started, restarted or rebuilt when a task needs it: `finance-app`, `guitar-app`, `theology-app`, `homework-app`, `learning-app`, `jellyfin`, `uptime-kuma`, `nova-engine`. This list matches `ROUTINE_STACKS` in `apps/ops-runner`; change both together.

### How the worker operates containers

Inside `agent-worker` there is no Docker access. Use `homelab-ops` (`stacks`, `ps`, `logs`, `up`, `rebuild`, `restart`, `request`). Protected stacks return `approval_required` with a request id: stop, and report the request id, what it does and why. The user approves it through Nova (`approve_ops_request`), and only the gateway can tell `ops-runner` to run it. Do not try to work around this.

### Deploys

`scripts/deploy.sh` (run by CI on push to `main`) deploys changed routine stacks and `agent-worker` automatically. It never deploys `caddy`, `dashboard`, `pihole`, `assistant`, `nova-auth`, `notify` or `ops-runner`; it lists them as "NOT deployed". Apply those by hand, after approval, with `cd compose/<stack> && docker compose up -d --build`.

### Recovery path independent of Nova

- SSH to the homelab over Tailscale (`100.101.135.109`) or the LAN.
- `cd /home/landerson/homelab/compose/<stack> && docker compose up -d` (add `--build` for app stacks).
- Portainer at `https://100.101.135.109:9443`.
- App ports are bound to `127.0.0.1` only. If Caddy, DNS or `nova-auth` is down, reach an app from the host (`curl 127.0.0.1:<port>`) or over an SSH tunnel: `ssh -L 8000:127.0.0.1:8000 landerson@100.101.135.109`, then open `http://localhost:8000`. Jellyfin (8096), Home Assistant (8123) and Portainer (9443) stay directly reachable.

## Keeping Nova's capability index accurate

Nova's capabilities are declared in [`apps/assistant/app/capabilities.yaml`](apps/assistant/app/capabilities.yaml): description, JSON schema, required device scope, policy (`automatic`, `approval`, `forbidden`), effect (`read`, `write`) and the read-back text for approvals. The handler lives in `HANDLERS` in `apps/assistant/app/tools.py`. The model's tool list and the bootstrap capability summary are generated from the YAML.

- When you add, change, or remove an app endpoint that Nova uses (homework, finance, dashboard, Home Assistant routes), update the adapter, the YAML entry and the handler in the same change.
- Run `pytest` in `apps/assistant`; `tests/test_registry.py` fails if the YAML and handlers drift.
- Writes that are destructive, security-sensitive, coding-agent change requests, finance categorization rules or budget structure changes use `policy: approval` (see `NOVA_MASTER_DESIGN.md` §7.2).
- Nova must never gain a capability that spends, transfers, or moves money. Do not add one, even behind approval. A test enforces this.

## Changelog

Add an entry to `CHANGELOG.md` for meaningful code, API, infrastructure, container, or architectural changes — anything that matters for operating or recovering the homelab. Skip trivial edits, copy changes, and runtime data changes.

## Secrets

`.env` files and SQLite databases are gitignored. Never commit credentials, print them in output, put them in model context, or write them to logs. Device credentials are shown once at enrollment and stored only as hashes.
