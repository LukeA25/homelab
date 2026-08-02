# Study Desk API stub (port 8002)

Stdlib HTTP stub so `theology.home.arpa` reverses somewhere while clients use mock data.

```bash
cd apps/theology-app/backend-stub
python3 server.py
# → http://0.0.0.0:8002/health
```

Optional user service:

```bash
cp deploy/theology-stub.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now theology-stub.service
```
