#!/usr/bin/env bash
# Deploy changed Docker Compose stacks after a git push.
# Usage: deploy.sh <before-sha> <after-sha>

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BEFORE="${1:?before sha required}"
AFTER="${2:?after sha required}"

cd "$REPO_ROOT"

declare -A STACKS=(
  [caddy]=compose/caddy
  [dashboard]=compose/dashboard
  [pihole]=compose/pihole
  [jellyfin]=compose/jellyfin
  [portainer]=compose/portainer
  [uptime-kuma]=compose/uptime-kuma
  [finance-app]=compose/finance-app
  [guitar-app]=compose/guitar-app
  [theology-app]=compose/theology-app
  [homeassistant]=compose/homeassistant
)

declare -A PATH_PREFIXES=(
  [caddy]=compose/caddy/
  [dashboard]=compose/dashboard/
  [pihole]=compose/pihole/
  [jellyfin]=compose/jellyfin/
  [portainer]=compose/portainer/
  [uptime-kuma]=compose/uptime-kuma/
  [finance-app]=compose/finance-app/
  [guitar-app]=compose/guitar-app/
  [theology-app]=compose/theology-app/
  [homeassistant]=compose/homeassistant/
)

DASHBOARD_PREFIX=apps/dashboard/
FINANCE_APP_PREFIX=apps/finance-app/
GUITAR_APP_PREFIX=apps/guitar-app/
THEOLOGY_APP_PREFIX=apps/theology-app/

matches_stack() {
  local stack="$1"
  local file="$2"
  local prefix="${PATH_PREFIXES[$stack]}"

  if [[ "$file" == "$prefix"* ]]; then
    return 0
  fi

  if [[ "$stack" == "dashboard" && "$file" == "$DASHBOARD_PREFIX"* ]]; then
    return 0
  fi

  if [[ "$stack" == "finance-app" && "$file" == "$FINANCE_APP_PREFIX"* ]]; then
    return 0
  fi

  if [[ "$stack" == "guitar-app" && "$file" == "$GUITAR_APP_PREFIX"* ]]; then
    return 0
  fi

  if [[ "$stack" == "theology-app" && "$file" == "$THEOLOGY_APP_PREFIX"* ]]; then
    return 0
  fi

  return 1
}

declare -a TO_DEPLOY=()

if [[ "$BEFORE" == "0000000000000000000000000000000000000000" ]]; then
  echo "Initial push or unknown base commit — deploying all stacks."
  TO_DEPLOY=(caddy dashboard pihole jellyfin portainer uptime-kuma finance-app guitar-app theology-app homeassistant)
else
  mapfile -t CHANGED < <(git diff --name-only "$BEFORE" "$AFTER")

  if ((${#CHANGED[@]} == 0)); then
    echo "No changed files detected."
    exit 0
  fi

  for stack in "${!PATH_PREFIXES[@]}"; do
    for file in "${CHANGED[@]}"; do
      if matches_stack "$stack" "$file"; then
        TO_DEPLOY+=("$stack")
        break
      fi
    done
  done

  if ((${#TO_DEPLOY[@]} == 0)); then
    echo "No compose stacks matched changed files:"
    printf '  %s\n' "${CHANGED[@]}"
    exit 0
  fi
fi

deploy_stack() {
  local stack="$1"
  local dir="${STACKS[$stack]}"

  echo "==> Deploying $stack ($dir)"
  cd "$REPO_ROOT/$dir"

  case "$stack" in
    dashboard|finance-app|guitar-app|theology-app)
      docker compose up -d --build --remove-orphans
      ;;
    *)
      docker compose pull --quiet 2>/dev/null || true
      docker compose up -d --remove-orphans
      ;;
    esac
}

for stack in "${TO_DEPLOY[@]}"; do
  deploy_stack "$stack"
done

echo "Deploy complete."
