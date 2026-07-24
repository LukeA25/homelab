import { Check, Loader2, Music2, Search, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { api, type SongCreateInput } from "../lib/api";
import type { CatalogTrack, Style } from "../lib/types";
import { Page, PageHeader } from "./Page";
import { SongArt } from "./SongArt";

type AddScreenProps = {
  onCreate: (input: SongCreateInput) => Promise<void>;
};

type FetchStatus = "idle" | "loading" | "done" | "missing" | "error";

type FetchItem = {
  label: string;
  status: FetchStatus;
  detail?: string;
};

function FetchProgress({ items }: { items: FetchItem[] }) {
  const visible = items.some((i) => i.status !== "idle");
  if (!visible) return null;

  const settled = items.filter((i) => i.status !== "idle" && i.status !== "loading").length;
  const loading = items.some((i) => i.status === "loading");
  const pct = Math.round((settled / items.length) * 100);

  return (
    <div className="space-y-2 rounded-2xl border border-border bg-surface/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted">
          {loading ? "Fetching from online…" : "Catalog lookup"}
        </p>
        <p className="font-mono text-[10px] tabular-nums text-muted">{pct}%</p>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-border/80">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-xs">
            {item.status === "loading" && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent" />
            )}
            {item.status === "done" && (
              <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
            )}
            {(item.status === "missing" || item.status === "error") && (
              <X className="h-3.5 w-3.5 shrink-0 text-muted" />
            )}
            {item.status === "idle" && (
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-border" />
            )}
            <span className="text-muted">{item.label}</span>
            {item.detail && (
              <span className="ml-auto truncate text-text">{item.detail}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AddScreen({ onCreate }: AddScreenProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [style, setStyle] = useState<Style>("chords");
  const [bpm, setBpm] = useState(90);
  const [key, setKey] = useState("G");
  const [capo, setCapo] = useState(0);
  const [chordPaste, setChordPaste] = useState("");
  const [genre, setGenre] = useState("Other");
  const [artHue, setArtHue] = useState<number | null>(null);
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null);
  const [itunesId, setItunesId] = useState<string | null>(null);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [lyricsNote, setLyricsNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogTrack[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lyricsStatus, setLyricsStatus] = useState<FetchStatus>("idle");
  const [lyricsDetail, setLyricsDetail] = useState<string | undefined>();
  const [bpmStatus, setBpmStatus] = useState<FetchStatus>("idle");
  const [bpmDetail, setBpmDetail] = useState<string | undefined>();
  const [keyStatus, setKeyStatus] = useState<FetchStatus>("idle");
  const [keyDetail, setKeyDetail] = useState<string | undefined>();

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      api
        .catalogSearch(query.trim())
        .then(setResults)
        .catch((err) => {
          setResults([]);
          setSearchError(err instanceof Error ? err.message : "Search failed");
        })
        .finally(() => setSearching(false));
    }, 350);
    return () => window.clearTimeout(handle);
  }, [query]);

  async function applyTrack(track: CatalogTrack) {
    setTitle(track.title);
    setArtist(track.artist);
    setGenre(track.genre || "Other");
    setArtHue(track.artHue);
    setArtworkUrl(track.artworkUrl ?? null);
    setItunesId(track.id);
    setTrackUrl(track.url ?? null);
    setQuery("");
    setResults([]);
    setLyricsNote(null);

    setLyricsStatus("loading");
    setLyricsDetail(undefined);
    setBpmStatus("loading");
    setBpmDetail(undefined);
    setKeyStatus("loading");
    setKeyDetail(undefined);

    const lyricsPromise = api
      .catalogLyrics(track.title, track.artist, track.durationMs)
      .then((lyr) => {
        if (lyr.found && lyr.chordPro && !chordPaste.trim()) {
          setChordPaste(lyr.chordPro);
          setLyricsStatus("done");
          setLyricsDetail("loaded");
        } else if (lyr.instrumental) {
          setLyricsStatus("done");
          setLyricsDetail("instrumental");
        } else if (lyr.found) {
          setLyricsStatus("done");
          setLyricsDetail("found");
        } else {
          setLyricsStatus("missing");
          setLyricsDetail("not found");
        }
        return lyr;
      })
      .catch(() => {
        setLyricsStatus("error");
        setLyricsDetail("failed");
        return null;
      });

    const metaPromise = api
      .catalogAudioMeta(track.title, track.artist, track.durationMs)
      .then((meta) => {
        if (meta?.bpm) {
          setBpm(meta.bpm);
          setBpmStatus("done");
          setBpmDetail(`${meta.bpm}`);
        } else {
          setBpmStatus("missing");
          setBpmDetail("not found");
        }
        if (meta?.key) {
          setKey(meta.key);
          setKeyStatus("done");
          setKeyDetail(meta.key);
        } else {
          setKeyStatus("missing");
          setKeyDetail("not found");
        }
        return meta;
      })
      .catch(() => {
        setBpmStatus("error");
        setBpmDetail("failed");
        setKeyStatus("error");
        setKeyDetail("failed");
        return null;
      });

    const [lyr, meta] = await Promise.all([lyricsPromise, metaPromise]);

    const metaBits: string[] = [];
    if (meta?.bpm) metaBits.push(`${meta.bpm} BPM`);
    if (meta?.key) metaBits.push(`key ${meta.key}`);

    if (lyr?.found && lyr.chordPro) {
      setLyricsNote(
        metaBits.length
          ? `Lyrics + ${metaBits.join(" · ")} loaded — tweak if your arrangement differs.`
          : "Lyrics loaded — add chords below or paste Ultimate Guitar / ChordPro.",
      );
    } else if (lyr?.instrumental) {
      setLyricsNote(
        metaBits.length
          ? `Instrumental · ${metaBits.join(" · ")} — add chords manually if you want.`
          : "Marked instrumental on LRCLIB — add chords manually if you want.",
      );
    } else if (!lyr?.found) {
      setLyricsNote(
        metaBits.length
          ? `No lyrics · ${metaBits.join(" · ")} filled from catalog.`
          : "No lyrics found — paste chords/lyrics or leave empty.",
      );
    } else if (metaBits.length) {
      setLyricsNote(`Filled ${metaBits.join(" · ")} from catalog.`);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) {
      setError("Title and artist are required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const links: NonNullable<SongCreateInput["links"]> = [];
      if (trackUrl || itunesId) {
        links.push({
          label: "Apple Music",
          url:
            trackUrl ||
            `https://music.apple.com/us/search?term=${encodeURIComponent(`${title} ${artist}`)}`,
          type: "other",
        });
      }
      const yt = youtubeUrl.trim();
      if (yt) {
        links.push({
          label: "YouTube",
          url: yt.startsWith("http") ? yt : `https://${yt}`,
          type: "youtube",
        });
      }
      await onCreate({
        title: title.trim(),
        artist: artist.trim(),
        genre,
        style,
        bpm,
        key: key.trim() || "C",
        capo,
        status: "want",
        hasArt: Boolean(artworkUrl),
        artHue: artHue ?? undefined,
        artworkUrl,
        appleMusicId: itunesId,
        chordPro: chordPaste.trim() || undefined,
        links: links.length > 0 ? links : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save song");
      setSaving(false);
    }
  }

  return (
    <Page>
      <PageHeader
        eyebrow="Add song"
        title="New entry"
        description="Search iTunes for art and metadata, pull lyrics, then optionally paste chords."
      />

      <form
        onSubmit={handleSubmit}
        className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]"
      >
        <div className="space-y-3">
          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="panel space-y-3 rounded-panel p-4">
            <p className="text-sm font-semibold">Find on iTunes</p>
            <label className="glass flex items-center gap-3 rounded-pill px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Song or artist…"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
              />
            </label>
            {searchError && <p className="text-xs text-danger">{searchError}</p>}
            {searching && <p className="text-xs text-muted">Searching…</p>}
            {results.length > 0 && (
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {results.map((track) => (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => applyTrack(track)}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface"
                  >
                    <SongArt
                      title={track.title}
                      artist={track.artist}
                      hasArt={Boolean(track.artworkUrl)}
                      artHue={track.artHue}
                      artworkUrl={track.artworkUrl}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{track.title}</p>
                      <p className="truncate text-xs text-muted">
                        {track.artist}
                        {track.album ? ` · ${track.album}` : ""}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <FetchProgress
              items={[
                { label: "Lyrics", status: lyricsStatus, detail: lyricsDetail },
                { label: "BPM", status: bpmStatus, detail: bpmDetail },
                { label: "Key", status: keyStatus, detail: keyDetail },
              ]}
            />
            {lyricsNote && <p className="text-xs text-muted">{lyricsNote}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="Song title"
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Artist</span>
              <input
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="Artist"
                required
              />
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Style</span>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as Style)}
                className="glass w-full appearance-none rounded-card px-4 py-3 text-sm outline-none"
              >
                <option value="fingerpicking">Fingerpicking</option>
                <option value="chords">Chords</option>
                <option value="mix">Mix</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">BPM</span>
              <input
                type="number"
                min={40}
                max={220}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value) || 90)}
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Key</span>
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
                placeholder="G"
                list="fretwork-keys"
              />
              <datalist id="fretwork-keys">
                {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B", "Am", "Em", "Dm"].map(
                  (k) => (
                    <option key={k} value={k} />
                  ),
                )}
              </datalist>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">Capo</span>
              <input
                type="number"
                min={0}
                max={12}
                value={capo}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setCapo(Number.isFinite(n) ? Math.min(12, Math.max(0, n)) : 0);
                }}
                className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
              YouTube (optional)
            </span>
            <input
              type="url"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              className="glass w-full rounded-card px-4 py-3 text-sm outline-none focus:border-accent"
              placeholder="https://www.youtube.com/watch?v=…"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs uppercase tracking-wider text-muted">
              Lyrics / chords (optional)
            </span>
            <textarea
              rows={12}
              value={chordPaste}
              onChange={(e) => setChordPaste(e.target.value)}
              className="glass w-full rounded-card px-4 py-3 font-mono text-sm outline-none focus:border-accent"
              placeholder={
                "Paste Ultimate Guitar format:\n[Verse]\nAm          G\nHello       world"
              }
            />
          </label>

          <button
            type="submit"
            disabled={saving}
            className="btn-accent flex w-full items-center justify-center gap-2 rounded-pill py-3.5 text-sm shadow-glow disabled:opacity-60 sm:max-w-xs"
          >
            <Music2 className="h-4 w-4" />
            {saving ? "Saving…" : "Save to library"}
          </button>
        </div>

        <aside className="panel hidden rounded-panel p-6 lg:block">
          <h2 className="text-lg font-semibold">Tips</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            <li>iTunes fills title, artist, and artwork (free, no key)</li>
            <li>BPM / key auto-fill from TheAudioDB when available</li>
            <li>Lyrics come from LRCLIB when available</li>
            <li>Paste a YouTube link for practice / reference</li>
            <li>Paste chords from Ultimate Guitar anytime — no scraping</li>
            <li>Song sheets show chord diagrams automatically</li>
          </ul>
          {(artworkUrl || title) && (
            <div className="mt-6">
              <p className="mb-2 text-xs uppercase tracking-wider text-muted">Preview</p>
              <SongArt
                title={title || "Song"}
                artist={artist || "Artist"}
                hasArt={Boolean(artworkUrl)}
                artHue={artHue ?? 200}
                artworkUrl={artworkUrl}
                size="cover"
              />
            </div>
          )}
        </aside>
      </form>
    </Page>
  );
}
