import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  BIBLE_ID,
  getWorkSections,
  importCatalogWork,
  listCatalog,
  listWorks,
  readableSectionRows,
  toWork,
  type ApiSection,
} from "../lib/api";
import type { Bookmark, CatalogWork, Work, WorkKind } from "../lib/types";

type LibraryScreenProps = {
  selectedWorkId: string | null;
  bookmarks?: Bookmark[];
  onOpenWork: (id: string | null, title?: string) => void;
  onOpenSection: (
    workId: string,
    sectionId: string,
    title?: string,
    focusLocusId?: string,
  ) => void;
  onJumpToBookmark?: (
    workId: string,
    sectionId: string,
    title?: string,
    focusLocusId?: string,
  ) => void;
  onToast?: (message: string) => void;
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
  bookmarks = [],
  onOpenWork,
  onOpenSection,
  onJumpToBookmark,
  onToast,
}: LibraryScreenProps) {
  const [works, setWorks] = useState<Work[]>([]);
  const [catalog, setCatalog] = useState<CatalogWork[]>([]);
  const [sectionTree, setSectionTree] = useState<ApiSection[]>([]);
  const [bibleBookId, setBibleBookId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [importingId, setImportingId] = useState<string | null>(null);

  const refreshLists = useCallback(async () => {
    const [apiWorks, apiCatalog] = await Promise.all([listWorks(), listCatalog()]);
    setWorks(apiWorks.map(toWork));
    setCatalog(apiCatalog);
  }, []);

  const work = works.find((w) => w.id === selectedWorkId) ?? null;
  const suggested = useMemo(
    () => catalog.filter((c) => !c.inLibrary).slice(0, 12),
    [catalog],
  );
  const titleCase = work?.kind === "catechism";
  const rows = useMemo(
    () => readableSectionRows(sectionTree, { titleCase }),
    [sectionTree, titleCase],
  );
  const isBible = work?.id === BIBLE_ID || work?.kind === "bible";
  const workBookmark = work && !isBible ? bookmarks.find((b) => b.workId === work.id) : null;
  const jumpTo = onJumpToBookmark ?? onOpenSection;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [apiWorks, apiCatalog] = await Promise.all([listWorks(), listCatalog()]);
        if (!cancelled) {
          setWorks(apiWorks.map(toWork));
          setCatalog(apiCatalog);
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

  useEffect(() => {
    setBibleBookId(null);
    if (!selectedWorkId) {
      setSectionTree([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const tree = await getWorkSections(selectedWorkId);
        if (!cancelled) setSectionTree(tree);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedWorkId]);

  // Group rows by parent for a cleaner TOC (especially CCC chapters).
  const groups = useMemo(() => {
    const out: Array<{ key: string; heading?: string; items: typeof rows }> = [];
    for (const row of rows) {
      const key = row.parent ?? "";
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(row);
      } else {
        out.push({ key, heading: row.parent, items: [row] });
      }
    }
    return out;
  }, [rows]);

  const bibleBooks = useMemo(
    () =>
      sectionTree.map((b) => ({
        id: b.id,
        title: b.title,
        chapters: (b.children ?? []).map((ch) => ({
          id: ch.id,
          title: ch.title,
        })),
      })),
    [sectionTree],
  );
  const selectedBibleBook = bibleBooks.find((b) => b.id === bibleBookId) ?? null;

  async function handleImport(c: CatalogWork) {
    if (importingId) return;
    setImportingId(c.id);
    try {
      const result = await importCatalogWork(c.id);
      await refreshLists();
      onToast?.(`Imported ${result.title || c.title}`);
    } catch (err) {
      onToast?.(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <div className="pane-scroll pane-fill overscroll-contain px-5 pb-8 pt-4">
      {!work ? (
        <>
          <h1 className="font-display text-3xl font-semibold">Library</h1>
          <p className="mt-2 text-sm text-muted">Books and documents from your homelab.</p>
          {error ? <p className="mt-4 text-sm text-muted">{error}</p> : null}
          {loading ? <p className="mt-6 text-sm text-muted">Loading…</p> : null}
          <div className="mt-6 flex flex-col gap-3">
            {works.map((w) => (
              <WorkRow key={w.id} work={w} onClick={() => onOpenWork(w.id)} />
            ))}
          </div>
          {suggested.length ? (
            <div className="mt-10">
              <h2 className="font-display text-xl font-semibold">Suggested</h2>
              <p className="mt-1 text-sm text-muted">
                Public-domain works from the catalog — import via the library backend.
              </p>
              <ul className="mt-4 overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
                {suggested.map((c) => {
                  const canDownload = c.downloadable !== false || !c.inLibrary;
                  const busy = importingId === c.id;
                  return (
                    <li key={c.id} className="px-4 py-3.5">
                      <div className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {c.category}
                      </div>
                      <div className="mt-1 font-semibold">{c.title}</div>
                      {c.author ? (
                        <div className="mt-0.5 text-sm text-muted">{c.author}</div>
                      ) : null}
                      {c.summary && c.summary !== c.author ? (
                        <div className="mt-1 text-sm text-muted line-clamp-2">{c.summary}</div>
                      ) : null}
                      {canDownload ? (
                        <button
                          type="button"
                          disabled={!!importingId}
                          onClick={() => void handleImport(c)}
                          className="mt-3 rounded-pill border border-border bg-bg px-3 py-1.5 text-sm font-semibold text-accent disabled:opacity-50"
                        >
                          {busy ? "Downloading…" : "Download"}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => {
              if (isBible && bibleBookId) {
                setBibleBookId(null);
                return;
              }
              onOpenWork(null);
            }}
            className="text-sm font-medium text-accent"
          >
            {isBible && bibleBookId ? "← Books" : "← Library"}
          </button>
          <h1 className="mt-3 font-display text-3xl font-semibold">
            {isBible && selectedBibleBook ? selectedBibleBook.title : work.shortTitle || work.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {isBible && selectedBibleBook
              ? `${selectedBibleBook.chapters.length} chapters`
              : work.author}
          </p>

          {isBible ? (
            <div className="mt-6">
              {!selectedBibleBook ? (
                <ul className="overflow-hidden rounded-2xl border border-border bg-surface divide-y divide-border">
                  {bibleBooks.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        onClick={() => setBibleBookId(book.id)}
                        className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                      >
                        <span>{book.title}</span>
                        <span className="flex items-center gap-2 text-sm text-muted">
                          {book.chapters.length}
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="grid grid-cols-4 gap-2">
                  {selectedBibleBook.chapters.map((ch) => {
                    const label = shortChapterLabel(ch.title);
                    const chBookmark = bookmarks.find(
                      (b) => b.workId === BIBLE_ID && b.sectionId === ch.id,
                    );
                    return (
                      <li key={ch.id} className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onOpenSection(work.id, ch.id, ch.title)}
                          className="rounded-2xl border border-border bg-surface px-2 py-3 text-sm font-semibold"
                        >
                          {label}
                        </button>
                        {chBookmark ? (
                          <button
                            type="button"
                            onClick={() => jumpTo(work.id, ch.id, ch.title)}
                            className="text-[10px] font-semibold leading-tight text-accent"
                          >
                            Jump to bookmark
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {groups.map((group) => (
                <div
                  key={group.key || group.items[0]?.id}
                  className="overflow-hidden rounded-2xl border border-border bg-surface"
                >
                  {group.heading ? (
                    <div className="border-b border-border px-4 py-3 text-sm font-semibold text-muted">
                      {group.heading}
                    </div>
                  ) : null}
                  <ul className="divide-y divide-border">
                    {group.items.map((item) => {
                      const isBookmarkSection = workBookmark?.sectionId === item.id;
                      return (
                        <li key={item.id}>
                          <div className="flex items-center gap-2 px-4 py-3.5">
                            <button
                              type="button"
                              onClick={() => onOpenSection(work.id, item.id, item.title)}
                              className="flex min-w-0 flex-1 items-center justify-between text-left"
                            >
                              <span>{item.title}</span>
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
                            </button>
                            {isBookmarkSection ? (
                              <button
                                type="button"
                                onClick={() => jumpTo(work.id, item.id, item.title)}
                                className="shrink-0 text-xs font-semibold text-accent"
                              >
                                Jump to bookmark
                              </button>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              {!rows.length ? (
                <p className="text-sm text-muted">No readable sections in this work yet.</p>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function shortChapterLabel(title: string) {
  const m = title.match(/(\d+)\s*$/);
  if (m) return m[1];
  return title.replace(/^[A-Za-z]+\s+/, "");
}

function WorkRow({ work, onClick }: { work: Work; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4 text-left"
    >
      <div className="pr-3">
        <div className="text-xs font-semibold text-muted">
          {KIND_LABEL[work.kind] ?? work.kind}
        </div>
        <div className="mt-1 text-lg font-semibold">{work.shortTitle || work.title}</div>
        {work.author ? (
          <div className="mt-1 text-sm text-muted">{work.author}</div>
        ) : null}
        {work.description && work.description !== work.author ? (
          <div className="mt-0.5 text-sm text-muted line-clamp-2">{work.description}</div>
        ) : null}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
    </button>
  );
}
