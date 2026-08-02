# Study Desk — native (Expo / React Native)

iPad-first theology study client with **true native scrolling** (`FlatList` / `ScrollView` → `UIScrollView`). Sibling of the web frontend; shares the same mock lib contract.

## Quick start (Expo Go — no paid Apple account)

1. On the iPad: install **Expo Go** from the App Store (requires iOS 15.1+).
2. On the homelab:

```bash
cd apps/theology-app/mobile
npm install
npm start
```

3. On the iPad (same LAN / Tailscale): open Expo Go → enter the URL shown in the terminal
   (typically `exp://192.168.1.156:8081`), or scan the QR code.

Allow **Local Network** when iOS prompts.

### Persistent Metro on the homelab

```bash
# install + enable user service
mkdir -p ~/.config/systemd/user
cp deploy/study-desk-metro.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now study-desk-metro.service
journalctl --user -u study-desk-metro.service -f
```

Metro listens on `0.0.0.0:8081`.

## Free sideload (standalone app icon, no $99)

Uses a free Apple ID **Personal Team**. Certificate lasts **7 days**; re-run from Xcode weekly (or refresh with AltStore/SideStore).

1. On a Mac with Xcode: clone this repo (or sync `apps/theology-app/mobile`).
2. Install deps and generate the native project:

```bash
cd apps/theology-app/mobile
npm install
npx expo prebuild --platform ios
npx pod-install
```

3. Open `ios/StudyDesk.xcworkspace` (or the generated workspace name) in Xcode.
4. **Signing & Capabilities** → Team: your Apple ID (Personal Team).
5. Bundle ID must stay unique: `arpa.home.studydesk` (already set in `app.json`).
6. Select your iPad → Run (▶).
7. On the iPad: **Settings → General → VPN & Device Management** → trust the developer profile.

Weekly refresh: plug in (or use wireless debugging) and Run again from Xcode.

Limit: free accounts can install up to **3** apps this way.

## Networking / ATS

`app.json` already allows insecure HTTP to:

- `*.home.arpa` (including `theology.home.arpa`)
- `192.168.1.156`
- local networking (`NSAllowsLocalNetworking`)

Caddy should expose the future FastAPI backend as `http://theology.home.arpa` → `:8002`.

Override API base at runtime:

```bash
EXPO_PUBLIC_API_BASE=http://192.168.1.156:8002 npm start
```

## What is native here

| Feature | Implementation |
|---------|----------------|
| Bible reader scroll | `FlatList` |
| Chapter change | `react-native-pager-view` (swipe between chapters) |
| Notes keyboard toolbar | `InputAccessoryView` |
| Split panes | `flexDirection: "row"` |
| Theme | NativeWind + theme tokens matching web dark palette |
| Fonts | Figtree / Fraunces / Source Serif 4 via `expo-font` |

## Keep the web frontend

The Vite app in `../frontend` remains the desktop / fallback UI when the 7-day cert lapses.
