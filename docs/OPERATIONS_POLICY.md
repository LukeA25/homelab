# Operations policy

What a coding or operations agent (including the worker Nova delegates to) may do to diagnose and repair the homelab. Runtime protection rules in [`AGENTS.md`](../AGENTS.md) always apply on top of this document.

Self-healing is intentionally limited in V1. Nova may notice failures and request repairs through the worker, but automatic remediation beyond the "automatic" column below needs a policy update first.

## Actions

| Category | Automatic | Requires explicit approval | Never |
|---|---|---|---|
| Diagnostics | `docker ps`, `docker logs`, `docker inspect`, `docker stats`; reading compose files and configs; calling `/api/health` endpoints; reading Uptime Kuma state | — | Printing `.env` contents or secrets |
| Unrelated stacks (see `AGENTS.md`) | Start a stopped stack; one restart or rebuild when a task or a confirmed failure needs it | Repeated restarts after a failed first attempt | Restart loops |
| Nova-critical stacks (see `AGENTS.md` inventory) | — | Any stop, restart, rebuild, recreate, reload or redeploy | Acting from inside the component being restarted |
| Code and config changes | Edits with no live effect | Edits with immediate live effect; pushes that trigger auto-deploy of a critical stack | Pushing secrets |
| Data | Reading app data for diagnosis | Restoring from backup; schema migrations on shared databases (homework) | Deleting runtime data under `/srv/appdata` or `/home/landerson/homework-test/data` |
| Host | Reading system state | Package updates, Docker daemon or Tailscale changes, firewall changes | Disabling the external recovery path (SSH, Portainer) |

## Rules for any repair

- Before a repair, state the observed failure, the intended action, its impact, how you will verify it worked, and how to roll it back.
- Attempt a given automatic repair at most once per incident. If it fails, stop and report.
- Do not retry an operation whose outcome is unknown if it could have mutated state. Check state first.
- A known intentional restart is not an outage. Do not alert or repair during it.
- Never trigger a repair from a reasoning pass that was itself triggered by a repair (no recursive loops).
- Record what was attempted, the approval (if any) and the outcome. Once the gateway audit log exists (Phase 1), log there.

## Pending decisions

- Which failures, if any, Nova may repair without asking.
- Backoff and escalation timing for flapping monitors.

## Technical enforcement

The worker has no Docker socket. Its `homelab-ops` tool talks to `ops-runner`, which runs routine-stack operations directly, turns protected-stack operations into pending requests that only the gateway can execute after the user approves, and refuses `ops-runner` and `agent-worker` entirely. Every operation is recorded in `/srv/appdata/ops-runner/ops.jsonl`.
