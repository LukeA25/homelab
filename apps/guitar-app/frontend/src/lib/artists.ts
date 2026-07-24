/** Split collaboration credits into individual artist names. */
const ARTIST_SPLIT_RE =
  /\s*(?:&|\+|\bx\b|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b)\s*/i;

export function splitArtists(artistField: string): string[] {
  const parts = artistField
    .split(ARTIST_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);

  const seen = new Map<string, string>();
  for (const part of parts) {
    const key = part.toLowerCase();
    if (!seen.has(key)) seen.set(key, part);
  }
  return [...seen.values()];
}

export function songHasArtist(songArtist: string, filterArtist: string): boolean {
  const target = filterArtist.trim().toLowerCase();
  if (!target) return false;
  return splitArtists(songArtist).some((name) => name.toLowerCase() === target);
}
