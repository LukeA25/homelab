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
| `assistant` (Nova gateway: voice turns, device auth, tools, approvals) | `compose/assistant/`, `apps/assistant/` | stop, restart, rebuild, recreate, `compose/assistant/restart.sh`, `docker compose up` in that stack, `.env` change plus recreate | files under `/srv/appdata/nova/context/` (read on every turn); `/srv/appdata/nova/devices.db` (auth). Source code is baked into the image. |
| `ops-runner` (only holder of the Docker socket; executes approved operations) | `compose/ops-runner/`, `apps/ops-runner/` | any restart or rebuild. **Manual-only**: apply from the host, never through itself or the worker. | — |
| `caddy` (TLS and routing for `assistant.home.arpa` and every `*.home.arpa` host) | `compose/caddy/Caddyfile`, `compose/caddy/private/*.caddy` | restart, reload, recreate | none until reloaded |
| `dashboard` (serves the Pi kiosk `/control`, `/api/rooms` and related routes on the assistant hostname) | `compose/dashboard/`, `apps/dashboard/` | restart, rebuild | none until rebuilt |
| `pihole` (resolves `*.home.arpa` for tailnet clients) | `compose/pihole/` | restart, recreate, DNS record edits via `pihole-FTL --config dns.hosts` | live DNS config edits |
| Docker network `nova-internal` (gateway ↔ worker ↔ ops-runner) | created by hand (runbook) | removal or recreation | — |
| Host networking | host | `tailscaled` restart or config change, Tailscale serve/funnel changes, Docker daemon restart, firewall changes | — |
| Raspberry Pi nightstand client | `apps/assistant/pi/` (deployed by hand to `raspberrypi`) | `homelab-wake.service` / `homelab-kiosk.service` restart or reconfiguration | — |

`agent-worker` (the Cursor coding agent) is not on the voice path, but it is the remote repair channel: it is **manual-only** and must never be rebuilt or restarted from inside itself. If it is down, use the host recovery path below.

Services Nova calls as tools (Home Assistant, `homework-app`, `finance-app`, `notify`) are not on the voice path: if they stop, a tool fails but voice keeps working. `notify` becomes Nova-critical once Nova notifications ship (Phase 4); update this table then.

### Operations that require explicit approval

- Stopping, restarting, rebuilding, recreating, or redeploying any component in the table above.
- Editing files listed under "edits with immediate live effect".
- Changing Docker networks, port bindings, Tailscale configuration, or DNS records that those components use.
- Operating any stack not in the routine list below (including `homeassistant` and `portainer`, which is part of the recovery path).

When asking, state: what you will do, the anticipated impact (what goes down and for how long), the recovery path, how you will verify success, and how to roll back. Approval covers that one operation only.

**Routine stacks** may be started, restarted or rebuilt when a task needs it: `finance-app`, `guitar-app`, `theology-app`, `homework-app`, `learning-app`, `jellyfin`, `uptime-kuma`, `notify` (until Phase 4). This list matches `ROUTINE_STACKS` in `apps/ops-runner`; change both together.

### How the worker operates containers

Inside `agent-worker` there is no Docker access. Use `homelab-ops` (`stacks`, `ps`, `logs`, `up`, `rebuild`, `restart`, `request`). Protected stacks return `approval_required` with a request id: stop, and report the request id, what it does and why. The user approves it through Nova (`approve_ops_request`), and only the gateway can tell `ops-runner` to run it. Do not try to work around this.

### Deploys

`scripts/deploy.sh` (run by CI on push to `main`) deploys changed routine stacks and `agent-worker` automatically. It never deploys `caddy`, `dashboard`, `pihole`, `assistant` or `ops-runner`; it lists them as "NOT deployed". Apply those by hand, after approval, with `cd compose/<stack> && docker compose up -d --build`.

### Recovery path independent of Nova

- SSH to the homelab over Tailscale (`100.101.135.109`) or the LAN.
- `cd /home/landerson/homelab/compose/<stack> && docker compose up -d` (add `--build` for app stacks).
- Portainer at `https://100.101.135.109:9443`.
- Every service is reachable directly by host port if Caddy or DNS is down (see `README.md` service table).

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
