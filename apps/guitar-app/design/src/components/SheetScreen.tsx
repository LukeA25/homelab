import { ArrowLeft, ExternalLink, Minus, Plus, Youtube } from "lucide-react";
import { useMemo, useState } from "react";
import { STYLE_LABELS } from "../data/songs";
import type { Song, Status } from "../lib/types";
import { transposeChord, transposeKey } from "../lib/transpose";
import { MiniMetronome } from "./MiniMetronome";
import { Page } from "./Page";
import { SongArt } from "./SongArt";
import { MetaTag, StatusTag } from "./StatusTag";

type SheetScreenProps = {
  song: Song;
  onBack: () => void;
  onStatusChange?: (status: Status) => void;
};

function coverThemeVars(hue: number): React.CSSProperties {
  return {
    ["--sheet-accent" as string]: `hsl(${hue} 78% 62%)`,
    ["--sheet-accent-soft" as string]: `hsl(${hue} 70% 55% / 0.18)`,
    ["--sheet-accent-glow" as string]: `hsl(${hue} 80% 55% / 0.4)`,
    ["--sheet-wash" as string]: `hsl(${hue} 70% 42% / 0.38)`,
    ["--sheet-wash-soft" as string]: `hsl(${(hue + 28) % 360} 65% 40% / 0.22)`,
  };
}

function TransposeControls({
  semitones,
  soundingKey,
  onDown,
  onUp,
  className = "",
  compact = false,
}: {
  semitones: number;
  soundingKey: string;
  onDown: () => void;
  onUp: () => void;
  className?: string;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div
        className={`panel flex h-full flex-col justify-between rounded-2xl p-2.5 ${className}`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted">Transpose</p>
        <div className="my-1.5 flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={onDown}
            className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent"
            aria-label="Transpose down"
          >
            <Minus className="h-3 w-3" />
          </button>
          <div className="min-w-0 px-1 text-center">
            <p className="font-mono text-sm font-bold tabular-nums leading-none">
              {semitones === 0 ? "0" : semitones > 0 ? `+${semitones}` : `${semitones}`}
            </p>
            <p className="truncate text-[9px] text-muted">{soundingKey}</p>
          </div>
          <button
            type="button"
            onClick={onUp}
            className="grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent"
            aria-label="Transpose up"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <p className="text-center text-[9px] text-muted">Key shift</p>
      </div>
    );
  }

  return (
    <div
      className={`panel flex items-center justify-between rounded-2xl px-3 py-2.5 ${className}`}
    >
      <button
        type="button"
        onClick={onDown}
        className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent"
        aria-label="Transpose down"
      >
        <Minus className="h-5 w-5" />
      </button>
      <div className="px-3 text-center">
        <p className="text-sm font-semibold">Transpose</p>
        <p className="font-mono text-xs text-muted">
          {semitones === 0 ? "Original" : semitones > 0 ? `+${semitones}` : `${semitones}`} ·{" "}
          {soundingKey}
        </p>
      </div>
      <button
        type="button"
        onClick={onUp}
        className="grid h-10 w-10 place-items-center rounded-full bg-accent-soft text-accent"
        aria-label="Transpose up"
      >
        <Plus className="h-5 w-5" />
      </button>
    </div>
  );
}

export function SheetScreen({ song, onBack, onStatusChange }: SheetScreenProps) {
  const [semitones, setSemitones] = useState(0);
  const soundingKey = useMemo(
    () => transposeKey(song.key, semitones + song.capo),
    [song.key, song.capo, semitones],
  );
  const themeVars = useMemo(() => coverThemeVars(song.artHue), [song.artHue]);

  return (
    <div className="sheet-theme min-h-full" style={themeVars}>
      <Page denseBottom>
        <header className="mb-5 flex items-center gap-3 md:mb-6">
          <button
            type="button"
            onClick={onBack}
            className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface text-text md:hidden"
            aria-label="Back to library"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onBack}
            className="hidden items-center gap-2 rounded-pill border border-border bg-surface px-4 py-2 text-sm text-muted transition hover:text-text md:inline-flex"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to library
          </button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:items-start lg:gap-10">
          <aside className="min-w-0 space-y-4 lg:sticky lg:top-8">
            <div className="flex items-start gap-3 sm:gap-4 lg:flex-col lg:gap-5">
              <SongArt
                title={song.title}
                artist={song.artist}
                hasArt={song.hasArt}
                artHue={song.artHue}
                size="lg"
              />
              <div className="min-w-0 flex-1 pt-0.5 lg:pt-0">
                <h1 className="text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
                  {song.title}
                </h1>
                <p className="mt-1 text-base text-muted md:text-lg">{song.artist}</p>

                <p className="mt-3 text-sm text-muted">
                  Written key <span className="text-text">{song.key}</span>
                  {song.capo > 0 ? ` · Capo ${song.capo}` : ""}
                  {" · "}
                  Sounds <span className="text-accent">{soundingKey}</span>
                  {" · "}
                  <span className="text-text">{song.bpm} BPM</span>
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusTag
                    status={song.status}
                    editable
                    onChange={onStatusChange}
                  />
                  <MetaTag>{song.genre}</MetaTag>
                  <MetaTag>{STYLE_LABELS[song.style]}</MetaTag>
                </div>
              </div>
            </div>

            {song.links.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {song.links.map((link) => (
                  <a
                    key={`${link.label}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-pill border border-border bg-surface px-3 py-2 text-sm text-text hover:border-accent"
                  >
                    {link.type === "youtube" ? (
                      <Youtube className="h-4 w-4 text-accent" />
                    ) : (
                      <ExternalLink className="h-4 w-4 text-accent" />
                    )}
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </aside>

          <div className="min-w-0 space-y-3">
            {/* Always above the lyrics box */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <MiniMetronome bpm={song.bpm} compact />
              <TransposeControls
                compact
                semitones={semitones}
                soundingKey={soundingKey}
                onDown={() => setSemitones((n) => n - 1)}
                onUp={() => setSemitones((n) => n + 1)}
              />
            </div>

            <section className="panel min-w-0 rounded-panel p-4 sm:p-5 md:p-8 lg:p-10">
              <div className="mx-auto max-w-2xl space-y-5">
                {song.lines.map((line, idx) => {
                  if (line.kind === "section") {
                    return (
                      <p key={`s-${idx}`} className="pt-2 text-sm font-semibold text-accent">
                        {line.label}
                      </p>
                    );
                  }

                  return (
                    <div key={`l-${idx}`} className="space-y-1">
                      <div className="grid grid-cols-4 gap-2 font-mono text-sm font-semibold text-accent md:text-base">
                        {line.chords.map((chord, i) => (
                          <span key={i}>
                            {chord ? transposeChord(chord, semitones) : "\u00a0"}
                          </span>
                        ))}
                      </div>
                      <p className="text-[1.05rem] leading-relaxed text-text md:text-lg">
                        {line.words}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      </Page>
    </div>
  );
}
