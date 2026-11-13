import { useEffect, useMemo, useRef } from "react";
import { Check, Pause, Play } from "lucide-react";
import type { BibleYearDay, BibleYearLink, BibleYearReading } from "../lib/api";
import type { ReadingChapterFocus } from "../lib/types";
import {
  loadBibleYear,
  playDay,
  positionFor,
  retryBibleYear,
  seekPlayback,
  setCurrentDay,
  setDayCompleted,
  togglePlayback,
  useBibleYearPlan,
  useBibleYearPlayer,
} from "../lib/bibleYear";

type BibleYearScreenProps = {
  day: number | null;
  onDayChange: (day: number) => void;
  onOpenBibleSection: (
    sectionId: string,
    title: string,
    focus?: {
      focusLocusId?: string | null;
      readingVerseStart?: number | null;
      readingVerseEnd?: number | null;
      readingVerses?: number[] | null;
      readingChapters?: ReadingChapterFocus[] | null;
    },
  ) => void;
};

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remain = whole % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  return `${minutes}:${String(remain).padStart(2, "0")}`;
}

function AudioControls({
  dayNumber,
  title,
  compact,
  onPlay,
}: {
  dayNumber: number;
  title: string;
  compact?: boolean;
  onPlay?: () => void;
}) {
  const player = useBibleYearPlayer();
  const active = player.day === dayNumber;
  const duration = active ? player.duration : 0;
  const current = active ? player.currentTime : positionFor(dayNumber);
  const playing = active && player.playing;

  return (
    <div className={compact ? "" : "mt-3"}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (active) togglePlayback();
            else onPlay?.();
          }}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-[#0b0d10]"
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
        </button>
        <div className="min-w-0 flex-1">
          {compact ? (
            <p className="truncate text-sm font-semibold">
              Day {dayNumber}
              {title ? ` · ${title}` : ""}
            </p>
          ) : null}
          <div className="mt-1 flex items-center gap-2 text-xs tabular-nums text-muted">
            <span className="w-12 shrink-0">{formatClock(current)}</span>
            <input
              aria-label="Episode time"
              type="range"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.1}
              value={Math.min(current, duration > 0 ? duration : 0)}
              disabled={!active || duration <= 0}
              onChange={(event) => seekPlayback(Number(event.target.value))}
              className="h-1 w-full accent-accent disabled:opacity-40"
            />
            <span className="w-12 shrink-0 text-right">{duration > 0 ? formatClock(duration) : "–:––"}</span>
          </div>
        </div>
      </div>
      {active && player.error ? <p className="mt-2 text-sm text-muted">{player.error}</p> : null}
    </div>
  );
}

export function BibleYearMiniPlayer({
  hidden,
  onOpen,
}: {
  hidden: boolean;
  onOpen: (day: number) => void;
}) {
  const player = useBibleYearPlayer();
  if (hidden || player.day == null || !player.audioUrl) return null;
  const day = player.day;
  return (
    <div className="safe-bottom shrink-0 border-t border-border bg-bg-elevated px-3 pt-2">
      <div className="mx-auto flex max-w-3xl items-center gap-2 pb-1">
        <div className="min-w-0 flex-1">
          <AudioControls dayNumber={day} title={player.title} compact />
        </div>
        <button type="button" onClick={() => onOpen(day)} className="shrink-0 px-2 text-sm font-medium text-accent">
          Readings
        </button>
      </div>
    </div>
  );
}

export function BibleYearScreen({ day, onDayChange, onOpenBibleSection }: BibleYearScreenProps) {
  const { plan, error, loading } = useBibleYearPlan();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadBibleYear();
  }, []);

  useEffect(() => {
    if (plan && day == null) onDayChange(plan.currentDay);
  }, [plan, day, onDayChange]);

  const view = plan?.days.find((item) => item.day === day) ?? null;
  const completed = useMemo(() => new Set(plan?.completedDays ?? []), [plan]);

  if (error) {
    return (
      <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
        <h1 className="font-display text-3xl font-semibold">Bible in a Year</h1>
        <p className="mt-4 text-sm text-muted">{error}</p>
        <button type="button" onClick={retryBibleYear} className="btn-accent mt-4 rounded-full px-4 py-2 text-sm font-semibold">
          Try again
        </button>
      </div>
    );
  }

  if (!plan || !view) {
    return (
      <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
        <h1 className="font-display text-3xl font-semibold">Bible in a Year</h1>
        <p className="mt-4 text-sm text-muted">{loading ? "Loading the year…" : "Loading…"}</p>
      </div>
    );
  }

  const doneCount = plan.completedDays.length;
  const isCurrent = view.day === plan.currentDay;
  const finished = completed.has(view.day);
  const groups: Array<{ period: string; days: BibleYearDay[] }> = [];
  for (const item of plan.days) {
    const last = groups[groups.length - 1];
    if (!last || last.period !== item.period) groups.push({ period: item.period, days: [item] });
    else last.days.push(item);
  }

  function openLink(link: BibleYearLink, reading: BibleYearReading) {
    if (!link.sectionId) return;
    const readingChapters = reading.links
      .filter((item) => item.sectionId)
      .map((item) => ({
        sectionId: item.sectionId as string,
        verseStart: item.verseStart,
        verseEnd: item.verseEnd,
      }));
    onOpenBibleSection(link.sectionId, link.label, {
      readingVerseStart: link.verseStart,
      readingVerseEnd: link.verseEnd,
      readingChapters,
    });
  }

  return (
    <div ref={scroller} className="pane-scroll pane-fill overscroll-contain px-5 pb-10 pt-4">
      <h1 className="font-display text-3xl font-semibold">Bible in a Year</h1>
      <p className="mt-2 text-sm text-muted">
        {doneCount} of {plan.totalDays} days finished
        {isCurrent ? "" : ` · you are on day ${plan.currentDay}`}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface">
        <div
          className="h-full bg-accent"
          style={{ width: `${Math.min(100, (doneCount / plan.totalDays) * 100)}%` }}
        />
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={view.day <= 1}
          onClick={() => onDayChange(view.day - 1)}
          className="text-sm font-medium text-accent disabled:opacity-30"
        >
          Previous
        </button>
        <div className="text-center">
          <p className="font-display text-4xl font-semibold">Day {view.day}</p>
          <p className="mt-1 text-sm text-muted">{view.period}</p>
        </div>
        <button
          type="button"
          disabled={view.day >= plan.totalDays}
          onClick={() => onDayChange(view.day + 1)}
          className="text-sm font-medium text-accent disabled:opacity-30"
        >
          Next
        </button>
      </div>

      <h2 className="mt-4 text-center font-display text-2xl font-semibold">{view.title}</h2>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Readings</p>
        <ul className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
          {view.readings.map((reading) => (
            <li key={reading.reference} className="px-4 py-3">
              <p className="text-sm text-muted">{reading.reference}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {reading.links.length ? (
                  reading.links.map((link) => (
                    <button
                      key={`${link.sectionId}-${link.label}`}
                      type="button"
                      disabled={!link.sectionId}
                      onClick={() => openLink(link, reading)}
                      className="rounded-full border border-border bg-bg px-3 py-1.5 text-sm font-semibold text-accent disabled:opacity-40"
                    >
                      {link.label}
                    </button>
                  ))
                ) : (
                  <span className="text-sm">{reading.reference}</span>
                )}
              </div>
              {reading.links.some((link) => link.note) ? (
                <p className="mt-2 text-xs text-muted">
                  {[...new Set(reading.links.map((link) => link.note).filter(Boolean))].join(" ")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">Opens in this Bible (NABRE). The podcast reads the RSV-2CE.</p>
      </div>

      <div className="mt-5 rounded-2xl border border-border bg-surface px-4 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Episode</p>
        {view.audioUrl ? (
          <AudioControls dayNumber={view.day} title={view.title} onPlay={() => playDay(view)} />
        ) : (
          <p className="mt-3 text-sm text-muted">This day's audio isn't in the feed yet.</p>
        )}
        <p className="mt-2 text-xs text-muted">Played from the Bible in a Year feed. The recording stays on their server.</p>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => {
            const wasCurrent = view.day === plan.currentDay;
            void setDayCompleted(view.day, !finished)
              .then((progress) => {
                if (wasCurrent && !finished) onDayChange(progress.currentDay);
              })
              .catch(() => undefined);
          }}
          className="btn-accent rounded-full px-4 py-3 text-sm font-semibold"
        >
          {finished ? "Mark as not finished" : "Mark this day finished"}
        </button>
        {!isCurrent ? (
          <button
            type="button"
            onClick={() => void setCurrentDay(view.day).catch(() => undefined)}
            className="rounded-full border border-border px-4 py-3 text-sm font-semibold"
          >
            This is my day
          </button>
        ) : null}
      </div>

      <div className="mt-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">The year</p>
        {groups.map((group) => (
          <section key={`${group.period}-${group.days[0]?.day}`} className="mt-4">
            <h3 className="text-sm font-semibold text-muted">
              {group.period}
              <span className="ml-2 font-normal">
                Days {group.days[0]?.day}–{group.days[group.days.length - 1]?.day}
              </span>
            </h3>
            <ul className="mt-2 overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
              {group.days.map((item) => {
                const selected = item.day === view.day;
                const itemDone = completed.has(item.day);
                return (
                  <li key={item.day}>
                    <button
                      type="button"
                      onClick={() => {
                        onDayChange(item.day);
                        scroller.current?.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-3 text-left ${selected ? "bg-accent-soft" : ""}`}
                    >
                      <span
                        className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                          itemDone ? "border-accent bg-accent text-[#0b0d10]" : "border-border text-transparent"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                      <span className="w-8 shrink-0 font-semibold tabular-nums">{item.day}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        <span className="block truncate text-sm text-muted">
                          {item.readings.map((reading) => reading.reference).join(" · ")}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
