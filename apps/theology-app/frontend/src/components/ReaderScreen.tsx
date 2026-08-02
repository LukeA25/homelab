import { PARAGRAPHS, sectionTitle } from "../lib/mockData";
import type { Bookmark, Highlight, Paragraph } from "../lib/types";

type ReaderScreenProps = {
  workId: string;
  sectionId: string;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  onBack: () => void;
  onToggleHighlight: (paragraphId: string) => void;
  onBookmark: (paragraphs: Paragraph[]) => void;
  onAskSplit: (paragraphs: Paragraph[]) => void;
  onCopyToNotes: (paragraphs: Paragraph[]) => void;
  textSize: number;
};

export function ReaderScreen({
  workId,
  sectionId,
  highlights,
  bookmarks,
  onBack,
  onToggleHighlight,
  onBookmark,
  onAskSplit,
  onCopyToNotes,
  textSize,
}: ReaderScreenProps) {
  const paragraphs = PARAGRAPHS[sectionId] ?? [];
  const hlSet = new Set(
    highlights.filter((h) => h.workId === workId).map((h) => h.paragraphId),
  );
  const bmSet = new Set(
    bookmarks.filter((b) => b.workId === workId).map((b) => b.paragraphId),
  );
  const selectedParas = paragraphs.filter((p) => hlSet.has(p.id));

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <header className="absolute inset-x-0 top-0 z-20 flex items-center gap-3 border-b border-border bg-bg px-4 py-3">
        <button type="button" onClick={onBack} className="text-sm font-medium text-accent">
          ← Back
        </button>
        <h1 className="truncate font-display text-lg font-semibold">
          {sectionTitle(workId, sectionId)}
        </h1>
      </header>

      <div
        className="pane-scroll pane-fill reader-prose overscroll-contain px-5 pb-28 pt-16"
        style={{
          ["--reader-size" as string]: `${textSize}rem`,
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div className="mx-auto max-w-xl space-y-3">
          {paragraphs.map((p) => {
            const highlighted = hlSet.has(p.id);
            const bookmarked = bmSet.has(p.id);
            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => onToggleHighlight(p.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggleHighlight(p.id);
                  }
                }}
                className={`w-full cursor-pointer rounded-xl px-2 py-2 text-left ${
                  highlighted ? "bg-accent-soft" : ""
                }`}
              >
                <span className="mr-2 text-xs font-semibold text-muted">{p.label}</span>
                <span className={bookmarked ? "verse-underline" : undefined}>{p.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {selectedParas.length > 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3">
          <div className="pointer-events-auto flex gap-1 rounded-pill border border-border bg-bg-elevated px-2 py-2 shadow-panel">
            <button
              type="button"
              onClick={() => onCopyToNotes(selectedParas)}
              className="rounded-pill px-3 py-2 text-sm font-medium"
            >
              Add note
            </button>
            <button
              type="button"
              onClick={() => onAskSplit(selectedParas)}
              className="rounded-pill px-3 py-2 text-sm font-medium"
            >
              Ask AI
            </button>
            <button
              type="button"
              onClick={() => onBookmark(selectedParas)}
              className="rounded-pill px-3 py-2 text-sm font-medium"
            >
              Bookmark
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
