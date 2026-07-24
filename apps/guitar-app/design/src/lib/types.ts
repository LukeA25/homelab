export type Style = "fingerpicking" | "chords" | "mix";
export type Status = "know" | "learning" | "rusty" | "want";
export type ThemeId = "teal" | "purple" | "amber";
export type Screen = "library" | "tracks" | "playlists" | "sheet" | "add" | "settings" | "metronome";

export type SongLink = {
  label: string;
  url: string;
  type: "youtube" | "tab" | "other";
};

export type ChordLine =
  | { kind: "section"; label: string }
  | { kind: "lyric"; chords: string[]; words: string };

export type Song = {
  id: string;
  title: string;
  artist: string;
  genre: string;
  style: Style;
  status: Status;
  key: string;
  capo: number;
  bpm: number;
  hasArt: boolean;
  artHue: number;
  /** ISO date — last time you opened/practiced this song */
  lastPracticed: string;
  featured?: boolean;
  links: SongLink[];
  lines: ChordLine[];
};

export type Playlist = {
  id: string;
  name: string;
  description: string;
  songIds: string[];
  artHue: number;
};

export type DiscoverTrack = {
  id: string;
  title: string;
  artist: string;
  artHue: number;
};
