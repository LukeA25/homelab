import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getPrayer, getReadings, listPrayers } from "../lib/api";
import type { PrayerItem, ReadingsDay } from "../lib/types";

type PrayersScreenProps = {
  view: string | null;
  onNavigate: (view: string | null) => void;
  onOpenBibleSection: (
    sectionId: string,
    title: string,
    focus?: {
      focusLocusId?: string | null;
      readingVerseStart?: number | null;
      readingVerseEnd?: number | null;
      readingVerses?: number[] | null;
    },
  ) => void;
};

export function PrayersScreen({
  view,
  onNavigate,
  onOpenBibleSection,
}: PrayersScreenProps) {
  const [items, setItems] = useState<PrayerItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const rows = await listPrayers();
        if (!cancelled) {
          setItems(rows);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (view === "mass-readings" || view === "readings") {
    return (
      <ReadingsView
        onBack={() => onNavigate(null)}
        onOpenBibleSection={onOpenBibleSection}
      />
    );
  }

  if (view) {
    return <PrayerDetailView prayerId={view} onBack={() => onNavigate(null)} />;
  }

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      <h1 className="font-display text-3xl font-semibold">Prayers</h1>
      <p className="mt-2 text-sm text-muted">Daily readings and fixed prayers.</p>
      {error ? <p className="mt-4 text-sm text-muted">{error}</p> : null}
      {loading ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      <ul className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onNavigate(item.id)}
              className="flex w-full items-center justify-between px-4 py-3.5 text-left"
            >
              <div className="pr-3">
                <div className="font-semibold">{item.title}</div>
                <div className="mt-0.5 text-sm text-muted">{item.subtitle}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ReadingsView({
  onBack,
  onOpenBibleSection,
}: {
  onBack: () => void;
  onOpenBibleSection: PrayersScreenProps["onOpenBibleSection"];
}) {
  const [day, setDay] = useState<ReadingsDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getReadings();
        if (!cancelled) setDay(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-accent">
        ← Prayers
      </button>
      <h1 className="mt-3 font-display text-3xl font-semibold">Mass Readings</h1>
      {error ? <p className="mt-4 text-sm text-muted">{error}</p> : null}
      {!day && !error ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      {day ? (
        <>
          <p className="mt-2 text-sm text-muted">
            {day.date}
            {day.celebration ? ` · ${day.celebration}` : ""}
            {day.season ? ` · ${day.season}` : ""}
          </p>
          {day.error ? (
            <p className="mt-4 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-muted">
              {day.error}
            </p>
          ) : null}
          <ul className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
            {day.readings.map((r) => (
              <li key={`${r.type}-${r.reference}`}>
                <button
                  type="button"
                  disabled={!r.sectionId}
                  onClick={() => {
                    if (r.sectionId) {
                      onOpenBibleSection(r.sectionId, r.reference, {
                        focusLocusId: r.focusLocusId,
                        readingVerseStart: r.verseStart,
                        readingVerseEnd: r.verseEnd,
                        readingVerses: r.verses,
                      });
                    }
                  }}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left disabled:opacity-50"
                >
                  <div className="pr-3">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {r.label || r.type}
                    </div>
                    <div className="mt-1 font-semibold">{r.reference}</div>
                  </div>
                  {r.sectionId ? <ChevronRight className="h-4 w-4 text-muted" /> : null}
                </button>
              </li>
            ))}
          </ul>
          {!day.readings.length && !day.error ? (
            <p className="mt-6 text-sm text-muted">No readings returned for this date.</p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function PrayerDetailView({
  prayerId,
  onBack,
}: {
  prayerId: string;
  onBack: () => void;
}) {
  const [prayer, setPrayer] = useState<PrayerItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await getPrayer(prayerId);
        if (!cancelled) setPrayer(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prayerId]);

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      <button type="button" onClick={onBack} className="text-sm font-medium text-accent">
        ← Prayers
      </button>
      {error ? <p className="mt-4 text-sm text-muted">{error}</p> : null}
      {!prayer && !error ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
      {prayer ? (
        <>
          <h1 className="mt-3 font-display text-3xl font-semibold">{prayer.title}</h1>
          <p className="mt-1 text-sm text-muted">{prayer.subtitle}</p>
          <div className="mt-6 whitespace-pre-wrap font-serif text-base leading-relaxed">
            {prayer.body}
          </div>
        </>
      ) : null}
    </div>
  );
}
