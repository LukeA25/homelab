import type {
  AppConfig,
  FinanceSummary,
  HomeworkResponse,
  Room,
  ServiceGroup,
  SystemStats,
  Weather,
} from "./types";

const BASE = "/api";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      /* use status text */
    }
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

export interface LightControl {
  on: boolean;
  brightness_pct?: number;
  color_temp_kelvin?: number;
  rgb_color?: number[];
}

export const api = {
  services: () => request<{ groups: ServiceGroup[] }>("/services"),
  rooms: () => request<{ rooms: Room[] }>("/rooms"),
  setRoom: (roomId: string, body: LightControl) =>
    request<Room>(`/rooms/${encodeURIComponent(roomId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  setAllRooms: (body: LightControl) =>
    request<{ rooms: Room[] }>("/rooms/all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  weather: () => request<{ weather: Weather | null }>("/weather"),
  finance: (refresh = false) => {
    const qs = refresh ? "?refresh=true" : "";
    return request<FinanceSummary>(`/finance/summary${qs}`);
  },
  homework: () => request<HomeworkResponse>("/homework"),
  system: () => request<SystemStats>("/system"),
  config: () => request<AppConfig>("/config"),
};
