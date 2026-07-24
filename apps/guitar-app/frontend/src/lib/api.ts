import type { CatalogTrack, Playlist, Song, Status, Style } from "./types";

const BASE = "/api";

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, opts);
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      if (body?.detail) {
        message = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
      }
    } catch {
      // keep status text
    }
    throw new Error(message);
  }
  return res.status === 204 ? (null as T) : ((await res.json()) as T);
}

function json<T>(method: string, path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export type SongCreateInput = {
  title: string;
  artist: string;
  genre?: string;
  style?: Style;
  status?: Status;
  key?: string;
  capo?: number;
  bpm?: number;
  hasArt?: boolean;
  artHue?: number;
  artworkUrl?: string | null;
  appleMusicId?: string | null;
  chordPro?: string;
  links?: Song["links"];
  lines?: Song["lines"];
};

export type PlaylistInput = {
  name: string;
  description?: string;
  songIds: string[];
  artHue?: number;
};

export type LyricsResult = {
  found: boolean;
  plainLyrics?: string | null;
  instrumental?: boolean;
  chordPro?: string | null;
  lines?: Song["lines"];
};

export type AudioMetaResult = {
  found: boolean;
  bpm?: number | null;
  key?: string | null;
  source?: string | null;
  matchedTitle?: string | null;
  matchedArtist?: string | null;
  album?: string | null;
};

export const api = {
  listSongs: () => request<Song[]>("/songs"),
  getSong: (id: string) => request<Song>(`/songs/${id}`),
  createSong: (body: SongCreateInput) => json<Song>("POST", "/songs", body),
  updateSong: (id: string, body: Record<string, unknown>) =>
    json<Song>("PATCH", `/songs/${id}`, body),
  deleteSong: (id: string) => request<null>(`/songs/${id}`, { method: "DELETE" }),

  listPlaylists: () => request<Playlist[]>("/playlists"),
  createPlaylist: (body: PlaylistInput) => json<Playlist>("POST", "/playlists", body),
  updatePlaylist: (id: string, body: Partial<PlaylistInput>) =>
    json<Playlist>("PATCH", `/playlists/${id}`, body),
  deletePlaylist: (id: string) => request<null>(`/playlists/${id}`, { method: "DELETE" }),

  catalogStatus: () =>
    request<{ configured: boolean; provider: string }>("/catalog/status"),
  catalogSearch: (q: string, limit = 12) =>
    request<CatalogTrack[]>(
      `/catalog/search?q=${encodeURIComponent(q)}&limit=${limit}`,
    ),
  catalogDiscover: (artist: string, limit = 8) =>
    request<{ artist: string | null; tracks: CatalogTrack[] }>(
      `/catalog/discover?artist=${encodeURIComponent(artist)}&limit=${limit}`,
    ),
  catalogLyrics: (title: string, artist: string, durationMs?: number | null) => {
    const params = new URLSearchParams({ title, artist });
    if (durationMs) params.set("durationMs", String(durationMs));
    return request<LyricsResult>(`/catalog/lyrics?${params}`);
  },
  catalogAudioMeta: (title: string, artist: string, durationMs?: number | null) => {
    const params = new URLSearchParams({ title, artist });
    if (durationMs) params.set("durationMs", String(durationMs));
    return request<AudioMetaResult>(`/catalog/audio-meta?${params}`);
  },
};
