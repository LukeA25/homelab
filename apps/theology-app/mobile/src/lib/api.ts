/**
 * Homelab API base URL.
 * Prefer theology.home.arpa once Caddy is wired; LAN IP works on Expo Go.
 * ATS allows local networking via app.json NSAllowsLocalNetworking / exception domains.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "http://theology.home.arpa";

export const LAN_FALLBACK = "http://192.168.1.156:8002";
