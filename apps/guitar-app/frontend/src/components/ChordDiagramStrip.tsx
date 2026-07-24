import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { lookupChordPosition } from "../lib/chordDiagrams";
import { ChordDiagram } from "./ChordDiagram";

type ChordDiagramStripProps = {
  chords: string[];
  pageSize?: number;
};

export function ChordDiagramStrip({ chords, pageSize = 4 }: ChordDiagramStripProps) {
  const diagrams = useMemo(() => {
    return chords
      .map((name) => {
        const hit = lookupChordPosition(name);
        if (!hit) return null;
        return { name, ...hit };
      })
      .filter((d): d is NonNullable<typeof d> => Boolean(d));
  }, [chords]);

  const pages = Math.max(1, Math.ceil(diagrams.length / pageSize));
  const [page, setPage] = useState(0);
  const safePage = Math.min(page, pages - 1);
  const slice = diagrams.slice(safePage * pageSize, safePage * pageSize + pageSize);

  if (diagrams.length === 0) return null;

  return (
    <section className="panel rounded-panel p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Chords</p>
        {pages > 1 && (
          <div className="flex items-center gap-1 text-xs text-muted">
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-full border border-border disabled:opacity-40"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              aria-label="Previous chords"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[4.5rem] text-center tabular-nums">
              {safePage + 1} of {pages}
            </span>
            <button
              type="button"
              className="grid h-7 w-7 place-items-center rounded-full border border-border disabled:opacity-40"
              disabled={safePage >= pages - 1}
              onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
              aria-label="Next chords"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
        {slice.map((d) => (
          <ChordDiagram
            key={d.name}
            label={d.label}
            frets={d.position.frets}
            fingers={d.position.fingers}
            baseFret={d.position.baseFret}
            barres={d.position.barres}
          />
        ))}
      </div>
    </section>
  );
}
