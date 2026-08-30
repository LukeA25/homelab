# Homelab

Personal homelab infrastructure and custom apps, managed with Docker Compose. Services are exposed on the LAN via local DNS (`*.home.arpa`) and reverse-proxied through Caddy.

## Architecture

```
Browser / Tailscale client
        │
        ▼
   Caddy (:80)          ← compose/caddy
        │
        ├── homepage.home.arpa   → Homepage (:3000)
        ├── kuma.home.arpa       → Uptime Kuma (:3001)
        ├── jellyfin.home.arpa   → Jellyfin (:8096)
        ├── pihole.home.arpa     → Pi-hole admin (:8080)
        ├── portainer.home.arpa      → Portainer (:9443)
        ├── finance.home.arpa        → Finance app (:8000)
        └── homeassistant.home.arpa  → Home Assistant (:8123)
```

Service **config** (compose files, YAML, Caddyfile, DNS records) lives in this repo under `compose/<service>/`. **Runtime data** (databases, caches, TLS certs, blocklists cache) stays on the host at `/srv/appdata/<service>`. Jellyfin media is mounted from `/srv/media`.

## Repository layout

```
homelab/
├── apps/
│   └── finance-app/       # Custom budgeting app (FastAPI + React)
└── compose/
    ├── caddy/             # Reverse proxy; Caddyfile in git, TLS state in /srv/appdata
    ├── finance-app/
    ├── homeassistant/     # Home automation (host networking on :8123)
    ├── homepage/
    │   └── config/        # services.yaml, widgets.yaml, etc.
    ├── jellyfin/
    ├── pihole/
    │   └── config/        # adlists.list, dnsmasq.d local DNS
    ├── portainer/
    └── uptime-kuma/
```

Each service has its own Compose stack under `compose/<name>/`. Stacks are started independently from their directory.

### Config vs. runtime data

| Service | In git (edit here) | On host only (runtime) |
|---------|-------------------|------------------------|
| Caddy | `compose/caddy/Caddyfile` | `/srv/appdata/caddy/{data,config}` (TLS certs) |
| Homepage | `compose/homepage/config/*.yaml` | — |
| Pi-hole | `compose/pihole/config/` (adlists, local DNS) | `/srv/appdata/pihole/etc-pihole` (query log, blocklist cache) |
| Jellyfin | — | `/srv/appdata/jellyfin/{config,cache}` (library DB, transcodes) |
| Finance app | `apps/finance-app/` source | `/srv/appdata/finance-app` (SQLite) |
| Uptime Kuma | — | `/srv/appdata/uptime-kuma` (monitor DB) |
| Portainer | — | `/srv/appdata/portainer` (Portainer DB) |
| Home Assistant | — | `/srv/appdata/homeassistant` (config + DB) |

## Services

| Service | Compose path | URL | Port | Notes |
|---------|--------------|-----|------|-------|
| [Caddy](https://caddyserver.com/) | `compose/caddy` | — | 80 | Reverse proxy for all `*.home.arpa` hosts |
| [Homepage](https://gethomepage.dev/) | `compose/homepage` | http://homepage.home.arpa | 3000 | Service dashboard; reads Docker socket |
| [Uptime Kuma](https://github.com/louislam/uptime-kuma) | `compose/uptime-kuma` | http://kuma.home.arpa | 3001 | Uptime monitoring |
| [Jellyfin](https://jellyfin.org/) | `compose/jellyfin` | http://jellyfin.home.arpa | 8096 | Media server |
| [Pi-hole](https://pi-hole.net/) | `compose/pihole` | http://pihole.home.arpa | 8080 (admin), 53 (DNS) | DNS ad-blocking; bound on Tailscale |
| [Portainer](https://www.portainer.io/) | `compose/portainer` | http://portainer.home.arpa | 9443 | Container management UI |
| [Home Assistant](https://www.home-assistant.io/) | `compose/homeassistant` | http://homeassistant.home.arpa | 8123 | Home automation; host networking |
| Finance app | `compose/finance-app` | http://finance.home.arpa | 8000 | Custom app (see below) |

Update the Tailscale upstream IP in `compose/caddy/Caddyfile` and local DNS in `compose/pihole/config/dnsmasq.d/99-homelab-dns.conf` if the host address changes.

## Getting started

### Prerequisites

- Docker and Docker Compose
- Host directories under `/srv/appdata/` (and `/srv/media` for Jellyfin)
- Local DNS records for `*.home.arpa` pointing at the homelab host (Pi-hole custom DNS works well here)

### Start a service

For Pi-hole and the finance app, copy the `.env.example` to `.env` in that stack's directory first (see [Configuration notes](#configuration-notes)).

```bash
cd compose/<service>
docker compose up -d
```

Example:

```bash
cd compose/caddy
docker compose up -d
```

Caddy should be running before relying on the friendly hostnames; individual services can still be reached directly by port.

### Stop a service

```bash
cd compose/<service>
docker compose down
```

## Finance app

A single-user budgeting and investment tracking app built on [Plaid](https://plaid.com/). Plaid is only called on demand (bank linking and manual refresh) because it bills per API call; normal page loads read cached data from SQLite.

**Stack:** FastAPI · SQLModel/SQLite · React · Vite · Tailwind · ECharts · TanStack Query

### Features

- **Dashboard** — overview and spending trends
- **Spending** — category breakdowns and charts
- **Budget** — monthly projections vs. actuals
- **Transactions** — browse, categorize, and assign subcategories
- **Investments** — holdings and investment transactions
- **Accounts** — linked bank accounts via Plaid Link
- **Settings** — categories, subcategories, mapping rules, and budget projections

### Run in Docker (production)

1. Create `compose/finance-app/.env` (gitignored):

   ```env
   PLAID_CLIENT_ID=your_client_id
   PLAID_SECRET=your_secret
   PLAID_ENV=sandbox          # or production
   PLAID_PRODUCTS=transactions
   PLAID_COUNTRY_CODES=US
   ```

2. Build and start:

   ```bash
   cd compose/finance-app
   docker compose up -d --build
   ```

   Data is stored in `/srv/appdata/finance-app` (SQLite database and related files).

### Local development

**Backend** (from `apps/finance-app`):

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export PLAID_CLIENT_ID=...
export PLAID_SECRET=...
export PLAID_ENV=sandbox
uvicorn app.main:app --reload --port 8000
```

**Frontend** (from `apps/finance-app/frontend`):

```bash
npm install
npm run dev
```

Vite serves the SPA on port 5173 and proxies `/api` to the backend on port 8000.

The production Docker image is a multi-stage build: Node builds the frontend, then Python serves both the API and static assets.

## Automated deploy (GitHub Actions)

Pushes to `main` trigger a self-hosted runner on the homelab to `git pull` and redeploy only the Compose stacks whose files changed.

### One-time setup on GitHub

1. Open [github.com/LukeA25/homelab/settings/actions](https://github.com/LukeA25/homelab/settings/actions)
2. Under **Actions permissions**, choose **Allow all actions and reusable workflows** (or restrict to verified creators if you prefer)
3. Go to **Settings → Actions → Runners → New self-hosted runner**
4. Select **Linux** and **x64** — GitHub shows install commands; run them on the homelab (see below)

### One-time setup on the homelab

Run as your normal user (`landerson` — must be in the `docker` group):

```bash
# Example — use the exact commands GitHub shows on the runner setup page
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64-2.XXX.X.tar.gz -L https://github.com/actions/runner/releases/download/v2.XXX.X/actions-runner-linux-x64-2.XXX.X.tar.gz
tar xzf ./actions-runner-linux-x64-2.XXX.X.tar.gz
./config.sh --url https://github.com/LukeA25/homelab --token <TOKEN_FROM_GITHUB>
sudo ./svc.sh install landerson
sudo ./svc.sh start
```

Notes:

- The token is single-use and expires quickly — generate it from the GitHub runner page right before running `config.sh`
- Install the service as `landerson` so it can run `docker compose` without sudo
- The workflow deploys from `/home/landerson/homelab` (where your `.env` files already live), not a separate checkout directory
- Ensure `compose/finance-app/.env` and `compose/pihole/.env` exist on the host before deploying those stacks

### What gets deployed

| Changed paths | Stack restarted |
|---------------|-----------------|
| `compose/caddy/` | caddy |
| `compose/homepage/` | homepage |
| `compose/pihole/` | pihole |
| `compose/jellyfin/` | jellyfin |
| `compose/portainer/` | portainer |
| `compose/uptime-kuma/` | uptime-kuma |
| `compose/homeassistant/` | homeassistant |
| `compose/finance-app/` or `apps/finance-app/` | finance-app (rebuilt) |

README-only or unrelated changes skip deploy. The logic lives in `scripts/deploy.sh`.

### Verify it works

1. Commit and push `.github/workflows/deploy.yml` and `scripts/deploy.sh`
2. Make a small change (e.g. edit `compose/homepage/config/services.yaml`) and push to `main`
3. Check **Actions** tab on GitHub — the workflow should run on your self-hosted runner

## Configuration notes

- **Secrets:** `.env` files and `*.db` / SQLite files are gitignored. Keep Plaid credentials and Pi-hole passwords out of version control.
- **Pi-hole:** Copy `compose/pihole/.env.example` to `.env` and set `FTLCONF_webserver_api_password`. Local DNS records for `*.home.arpa` are in `compose/pihole/config/dnsmasq.d/99-homelab-dns.conf`; ad block lists are in `compose/pihole/config/adlists.list`. DNS listens on the LAN IP and Tailscale IP (configured in `docker-compose.yaml`).
- **Homepage:** Edit `compose/homepage/config/services.yaml` (and related YAML) to change the dashboard. `HOMEPAGE_ALLOWED_HOSTS` in `docker-compose.yaml` must include any hostname or IP you use to reach the dashboard.
- **Portainer:** Caddy proxies to Portainer's HTTPS port with `tls_insecure_skip_verify` because Portainer uses a self-signed cert.
- **Home Assistant:** Uses host networking on port 8123 (official container layout). Config lives in `/srv/appdata/homeassistant`. Reverse-proxy trust for Caddy is already set in HA's HTTP settings storage; onboarding is done in the UI at `http://homeassistant.home.arpa` (or `http://100.101.135.109:8123`).

## Network

Services use the `home.arpa` special-use domain. Pi-hole maps each subdomain to the Tailscale IP (`100.101.135.109`). Access is via Tailscale; Caddy reverse-proxy upstreams also target that Tailscale IP.
