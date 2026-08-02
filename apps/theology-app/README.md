# Study Desk — theology app

## Packages

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | React + Vite web UI (desktop / Safari fallback) |
| [`mobile/`](mobile/) | Expo / React Native iPad client (native scroll) |

## Run web

```bash
cd frontend && npm install && npm run dev -- --host 0.0.0.0 --port 5175
```

## Run mobile (Expo Go)

```bash
cd mobile && npm install && npm start
```

See [`mobile/README.md`](mobile/README.md) for Expo Go, Metro systemd, free Xcode sideload, and ATS notes.

## Homelab

- Web: Vite `:5175`
- Metro: `:8081`
- Future API: `theology.home.arpa` → `:8002` (Caddy entry already reserved)
