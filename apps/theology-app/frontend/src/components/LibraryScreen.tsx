import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getWorkSections, listWorks, toSectionNodes, toTitleCaseHeading, toWork } from "../lib/api";
import type { SectionNode, Work, WorkKind } from "../lib/types";

type LibraryScreenProps = {
  selectedWorkId: string | null;
  onOpenWork: (id: string | null) => void;
  onOpenSection: (workId: string, sectionId: string, title: string) => void;
};

const KIND_LABEL: Record<string, string> = {
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
  const [works, setWorks] = useState<Work[]>([]);
  const [roots, setRoots] = useState<SectionNode[]>([]);
  const [stack, setStack] = useState<SectionNode[]>([]);
  const [error, setError] = useState<string | null>(null);
  const work = works.find((w) => w.id === selectedWorkId) ?? null;

  useEffect(() => {
    let cancelled = false;
    listWorks()
      .then((rows) => {
        if (!cancelled) setWorks(rows.map(toWork));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the library.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setStack([]);
    setRoots([]);
    if (!selectedWorkId) return;
    let cancelled = false;
    getWorkSections(selectedWorkId)
      .then((tree) => {
        if (!cancelled) setRoots(toSectionNodes(tree));
      })
      .catch(() => {
        if (!cancelled) setError("Could not open this book.");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedWorkId]);

  const current = stack[stack.length - 1];
  const rows = current?.children ?? roots;

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      {!work ? (
        <>
          <h1 className="font-display text-3xl font-semibold">Library</h1>
          <p className="mt-2 text-sm text-muted">Books and documents.</p>
          {error && <p className="mt-4 text-sm text-muted">{error}</p>}
          <div className="mt-6 flex flex-col gap-3">
            {works.map((w) => (
              <WorkRow key={w.id} work={w} onClick={() => onOpenWork(w.id)} />
            ))}
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => (stack.length ? setStack((s) => s.slice(0, -1)) : onOpenWork(null))}
            className="text-sm font-medium text-accent"
          >
            ← {stack.length ? heading(current?.title ?? work.shortTitle) : "Library"}
          </button>
          <h1 className="mt-3 font-display text-3xl font-semibold">
            {stack.length ? heading(current?.title ?? "") : work.shortTitle}
          </h1>
          {!stack.length && <p className="mt-1 text-sm text-muted">{work.author}</p>}
          <div className="mt-6 flex flex-col gap-2">
            {rows.map((node) => {
              const title = heading(node.title);
              const nested = (node.children?.length ?? 0) > 0;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() =>
                    nested ? setStack((s) => [...s, node]) : onOpenSection(work.id, node.id, title)
                  }
                  className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-3.5 text-left"
                >
                  <span>{title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function heading(title: string): string {
  return toTitleCaseHeading(title);
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
          {KIND_LABEL[work.kind as WorkKind] ?? "Books"}
        </p>
        <p className="mt-1 font-display text-xl font-semibold">{work.shortTitle}</p>
      </div>
      <ChevronRight className="h-5 w-5 text-muted" />
    </button>
  );
}
