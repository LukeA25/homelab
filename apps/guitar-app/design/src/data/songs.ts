import type { DiscoverTrack, Playlist, Song } from "../lib/types";

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

export const MOCK_SONGS: Song[] = [
  {
    id: "1",
    title: "Blackbird",
    artist: "The Beatles",
    genre: "Folk",
    style: "fingerpicking",
    status: "know",
    key: "G",
    capo: 0,
    bpm: 92,
    hasArt: true,
    artHue: 160,
    lastPracticed: daysAgo(2),
    links: [
      { label: "Tutorial", url: "https://youtube.com", type: "youtube" },
      { label: "Tab notes", url: "#", type: "tab" },
    ],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["G", "", "Am", ""], words: "Blackbird singing in the dead of night" },
      { kind: "lyric", chords: ["G", "A7", "D", ""], words: "Take these broken wings and learn to fly" },
      { kind: "lyric", chords: ["C", "A7", "D", ""], words: "All your life" },
      { kind: "lyric", chords: ["G", "Em", "C", "D"], words: "You were only waiting for this moment to arise" },
    ],
  },
  {
    id: "9",
    title: "Yesterday",
    artist: "The Beatles",
    genre: "Folk",
    style: "chords",
    status: "know",
    key: "F",
    capo: 0,
    bpm: 96,
    hasArt: true,
    artHue: 210,
    lastPracticed: daysAgo(12),
    links: [],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["F", "Em7", "A7", "Dm"], words: "Yesterday, all my troubles seemed so far away" },
    ],
  },
  {
    id: "10",
    title: "Let It Be",
    artist: "The Beatles",
    genre: "Rock",
    style: "chords",
    status: "rusty",
    key: "C",
    capo: 0,
    bpm: 72,
    hasArt: true,
    artHue: 280,
    lastPracticed: daysAgo(48),
    links: [],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["C", "G", "Am", "F"], words: "When I find myself in times of trouble" },
    ],
  },
  {
    id: "2",
    title: "Wish You Were Here",
    artist: "Pink Floyd",
    genre: "Rock",
    style: "mix",
    status: "know",
    key: "Em",
    capo: 0,
    bpm: 62,
    hasArt: true,
    artHue: 28,
    lastPracticed: daysAgo(1),
    featured: true,
    links: [{ label: "Where I learned it", url: "https://youtube.com", type: "youtube" }],
    lines: [
      { kind: "section", label: "Intro" },
      { kind: "lyric", chords: ["Em", "G", "Em", "G"], words: "(riff)" },
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["C", "D", "Am", ""], words: "So, so you think you can tell" },
      { kind: "lyric", chords: ["G", "D", "C", "Am"], words: "Heaven from Hell, blue skies from pain" },
    ],
  },
  {
    id: "3",
    title: "Fast Car",
    artist: "Tracy Chapman",
    genre: "Folk",
    style: "fingerpicking",
    status: "learning",
    key: "C",
    capo: 2,
    bpm: 104,
    hasArt: false,
    artHue: 200,
    lastPracticed: daysAgo(0),
    links: [{ label: "Fingerstyle lesson", url: "https://youtube.com", type: "youtube" }],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["C", "G", "Em", "D"], words: "You got a fast car, I want a ticket to anywhere" },
      { kind: "lyric", chords: ["C", "G", "Em", "D"], words: "Maybe we make a deal, maybe together we can get somewhere" },
    ],
  },
  {
    id: "4",
    title: "Hotel California",
    artist: "Eagles",
    genre: "Rock",
    style: "mix",
    status: "rusty",
    key: "Bm",
    capo: 0,
    bpm: 74,
    hasArt: true,
    artHue: 340,
    lastPracticed: daysAgo(67),
    links: [{ label: "Solo breakdown", url: "https://youtube.com", type: "youtube" }],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["Bm", "F#", "A", "E"], words: "On a dark desert highway, cool wind in my hair" },
      { kind: "lyric", chords: ["G", "D", "Em", "F#"], words: "Warm smell of colitas, rising up through the air" },
    ],
  },
  {
    id: "5",
    title: "Hallelujah",
    artist: "Leonard Cohen",
    genre: "Folk",
    style: "chords",
    status: "know",
    key: "C",
    capo: 0,
    bpm: 68,
    hasArt: false,
    artHue: 250,
    lastPracticed: daysAgo(5),
    links: [],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["C", "Am", "", ""], words: "I heard there was a secret chord" },
      { kind: "lyric", chords: ["C", "Am", "", ""], words: "That David played and it pleased the Lord" },
      { kind: "lyric", chords: ["F", "G", "C", "G"], words: "But you don't really care for music, do you?" },
    ],
  },
  {
    id: "6",
    title: "Neon",
    artist: "John Mayer",
    genre: "Blues",
    style: "fingerpicking",
    status: "want",
    key: "E",
    capo: 0,
    bpm: 108,
    hasArt: true,
    artHue: 175,
    lastPracticed: daysAgo(90),
    links: [{ label: "Want to learn", url: "https://youtube.com", type: "youtube" }],
    lines: [
      { kind: "section", label: "Groove" },
      { kind: "lyric", chords: ["E", "B", "C#m", "A"], words: "When tonight is over" },
      { kind: "lyric", chords: ["E", "B", "A", ""], words: "You're gonna turn blue" },
    ],
  },
  {
    id: "7",
    title: "Dust in the Wind",
    artist: "Kansas",
    genre: "Rock",
    style: "fingerpicking",
    status: "learning",
    key: "C",
    capo: 0,
    bpm: 94,
    hasArt: false,
    artHue: 45,
    lastPracticed: daysAgo(3),
    links: [{ label: "Pattern practice", url: "https://youtube.com", type: "youtube" }],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["C", "G/B", "Am", "G"], words: "I close my eyes, only for a moment, and the moment's gone" },
      { kind: "lyric", chords: ["C", "G/B", "Am", "G"], words: "All my dreams pass before my eyes, a curiosity" },
    ],
  },
  {
    id: "8",
    title: "Wonderwall",
    artist: "Oasis",
    genre: "Rock",
    style: "chords",
    status: "know",
    key: "Em",
    capo: 2,
    bpm: 87,
    hasArt: true,
    artHue: 120,
    lastPracticed: daysAgo(8),
    links: [],
    lines: [
      { kind: "section", label: "Verse" },
      { kind: "lyric", chords: ["Em7", "G", "Dsus4", "A7sus4"], words: "Today is gonna be the day that they're gonna throw it back to you" },
      { kind: "lyric", chords: ["Em7", "G", "Dsus4", "A7sus4"], words: "By now you should've somehow realized what you gotta do" },
    ],
  },
];

export const MOCK_PLAYLISTS: Playlist[] = [
  {
    id: "p1",
    name: "Fingerpicking focus",
    description: "Patterns and soft pieces",
    songIds: ["1", "3", "7"],
    artHue: 165,
  },
  {
    id: "p2",
    name: "Campfire chords",
    description: "Easy singalongs",
    songIds: ["5", "8", "10"],
    artHue: 35,
  },
  {
    id: "p3",
    name: "Classic rock night",
    description: "Bigger arrangements",
    songIds: ["2", "4", "8"],
    artHue: 320,
  },
];

/** Mock Apple Music suggestions for an artist you already play a lot */
export const MOCK_DISCOVER: Record<string, DiscoverTrack[]> = {
  "The Beatles": [
    { id: "d1", title: "Here Comes the Sun", artist: "The Beatles", artHue: 48 },
    { id: "d2", title: "While My Guitar Gently Weeps", artist: "The Beatles", artHue: 300 },
    { id: "d3", title: "Come Together", artist: "The Beatles", artHue: 12 },
  ],
};

export const STYLE_LABELS: Record<Song["style"], string> = {
  fingerpicking: "Fingerpicking",
  chords: "Chords",
  mix: "Mix",
};

export const STATUS_LABELS: Record<Song["status"], string> = {
  know: "Know",
  learning: "Learning",
  rusty: "Rusty",
  want: "Want to learn",
};

export function daysSincePracticed(song: Song): number {
  const then = new Date(song.lastPracticed).getTime();
  return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
}

export function songById(id: string): Song | undefined {
  return MOCK_SONGS.find((s) => s.id === id);
}
