#!/usr/bin/env bash
# Deploy changed Docker Compose stacks after a git push.
# Usage: deploy.sh <before-sha> <after-sha>
#
# Nova-critical stacks (MANUAL) are detected but never deployed here; the run
# lists them so they can be applied by hand after approval (see AGENTS.md).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BEFORE="${1:?before sha required}"
AFTER="${2:?after sha required}"

cd "$REPO_ROOT"

# stack -> path prefixes that trigger it (space-separated)
declare -A TRIGGERS=(
  [caddy]="compose/caddy/"
  [dashboard]="compose/dashboard/ apps/dashboard/"
  [pihole]="compose/pihole/"
  [jellyfin]="compose/jellyfin/"
  [portainer]="compose/portainer/"
  [uptime-kuma]="compose/uptime-kuma/"
  [finance-app]="compose/finance-app/ apps/finance-app/"
  [guitar-app]="compose/guitar-app/ apps/guitar-app/"
  [theology-app]="compose/theology-app/ apps/theology-app/"
  [learning-app]="compose/learning-app/ apps/learning-app/"
  [homework-app]="compose/homework-app/ apps/homework-app/"
  [homeassistant]="compose/homeassistant/"
  [notify]="compose/notify/ apps/notify/"
  [agent-worker]="compose/agent-worker/ apps/agent-worker/"
  [assistant]="compose/assistant/ apps/assistant/"
  [nova-auth]="compose/nova-auth/ apps/assistant/"
  [ops-runner]="compose/ops-runner/ apps/ops-runner/"
)

# Never auto-deployed: they carry Nova's voice/control path or its approval channel.
MANUAL=(caddy dashboard pihole assistant nova-auth ops-runner)

# Built from source rather than pulled.
BUILT=(dashboard finance-app guitar-app theology-app homework-app learning-app notify agent-worker)

contains() {
  local needle="$1"; shift
  local item
  for item in "$@"; do [[ "$item" == "$needle" ]] && return 0; done
  return 1
}

matches_stack() {
  local stack="$1" file="$2" prefix
  for prefix in ${TRIGGERS[$stack]}; do
    [[ "$file" == "$prefix"* ]] && return 0
  done
  return 1
}

declare -a TO_DEPLOY=()
declare -a SKIPPED=()

if [[ "$BEFORE" == "0000000000000000000000000000000000000000" ]]; then
  echo "Initial push or unknown base commit — deploying all automatic stacks."
  CANDIDATES=("${!TRIGGERS[@]}")
else
  mapfile -t CHANGED < <(git diff --name-only "$BEFORE" "$AFTER")

  if ((${#CHANGED[@]} == 0)); then
    echo "No changed files detected."
    exit 0
  fi

  CANDIDATES=()
  for stack in "${!TRIGGERS[@]}"; do
    for file in "${CHANGED[@]}"; do
      if matches_stack "$stack" "$file"; then
        CANDIDATES+=("$stack")
        break
      fi
    done
  done
fi

for stack in "${CANDIDATES[@]}"; do
  if contains "$stack" "${MANUAL[@]}"; then
    SKIPPED+=("$stack")
  else
    TO_DEPLOY+=("$stack")
  fi
done

deploy_stack() {
  local stack="$1"
  local dir="compose/$stack"

  echo "==> Deploying $stack ($dir)"
  cd "$REPO_ROOT/$dir"

  if contains "$stack" "${BUILT[@]}"; then
    docker compose up -d --build --remove-orphans
  else
    docker compose pull --quiet 2>/dev/null || true
    docker compose up -d --remove-orphans
  fi
}

for stack in "${TO_DEPLOY[@]}"; do
  deploy_stack "$stack"
done

if ((${#SKIPPED[@]} > 0)); then
  echo
  echo "Nova-critical stacks changed but were NOT deployed (manual, approval required):"
  printf '  %s\n' "${SKIPPED[@]}"
fi

if ((${#TO_DEPLOY[@]} == 0 && ${#SKIPPED[@]} == 0)); then
  echo "No compose stacks matched changed files."
fi

echo "Deploy complete."
