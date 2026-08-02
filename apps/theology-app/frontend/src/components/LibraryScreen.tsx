import { ChevronRight } from "lucide-react";
import { SECTIONS, WORKS } from "../lib/mockData";
import type { Work, WorkKind } from "../lib/types";

type LibraryScreenProps = {
  selectedWorkId: string | null;
  onOpenWork: (id: string | null) => void;
  onOpenSection: (workId: string, sectionId: string) => void;
};

const KIND_LABEL: Record<WorkKind, string> = {
  bible: "Scripture",
  catechism: "Church",
  summa: "Theology",
  book: "Books",
  fathers: "Fathers",
};

export function LibraryScreen({
  selectedWorkId,
  onOpenWork,
  onOpenSection,
}: LibraryScreenProps) {
  const work = WORKS.find((w) => w.id === selectedWorkId) ?? null;

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      {!work ? (
        <>
          <h1 className="font-display text-3xl font-semibold">Library</h1>
          <p className="mt-2 text-sm text-muted">Books and documents.</p>
          <div className="mt-6 flex flex-col gap-3">
            {WORKS.map((w) => (
              <WorkRow key={w.id} work={w} onClick={() => onOpenWork(w.id)} />
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onOpenWork(null)}
            className="text-sm font-medium text-accent"
          >
            ← Library
          </button>
          <h1 className="mt-3 font-display text-3xl font-semibold">{work.shortTitle}</h1>
          <p className="mt-1 text-sm text-muted">{work.author}</p>
          <div className="mt-6 flex flex-col gap-4">
            {(SECTIONS[work.id] ?? []).map((root) => (
              <div key={root.id} className="overflow-hidden rounded-2xl border border-border bg-surface">
                <div className="border-b border-border px-4 py-3 text-sm font-semibold text-muted">
                  {root.title}
                </div>
                <ul className="divide-y divide-border">
                  {(root.children ?? [{ id: root.id, title: "Open" }]).map((child) => (
                    <li key={child.id}>
                      <button
                        type="button"
                        onClick={() => onOpenSection(work.id, child.id)}
                        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                      >
                        {child.title}
                        <ChevronRight className="h-4 w-4 text-muted" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function WorkRow({ work, onClick }: { work: Work; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4 text-left active:scale-[0.99]"
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
          {KIND_LABEL[work.kind]}
        </p>
        <p className="mt-1 font-display text-xl font-semibold">{work.shortTitle}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted" />
    </button>
  );
}
