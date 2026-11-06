# Study Desk — theology app

Web app in the same shape as the other homelab apps: a Vite frontend and a FastAPI `app/` package, served together from one container.

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | React + Vite UI |
| [`app/`](app/) | FastAPI library, Bible, notes, and Ask API |
| [`Dockerfile`](Dockerfile) | Builds the UI, then serves it and `/api` on port 8000 |

Compose: `compose/theology-app` → `theology.home.arpa` on port 8002.

```bash
cd compose/theology-app && docker compose up -d --build
```

Local UI (proxies `/api` to `127.0.0.1:8002`):

```bash
cd frontend && npm install && npm run dev
```

The Expo client under [`mobile/`](mobile/) is optional and still talks to `http://theology.home.arpa`.
