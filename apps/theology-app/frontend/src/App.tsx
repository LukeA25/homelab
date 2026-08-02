import { useEffect, useState } from "react";
import { AskScreen } from "./components/AskScreen";
import { BibleScreen } from "./components/BibleScreen";
import { LaunchScreen } from "./components/LaunchScreen";
import { LibraryScreen } from "./components/LibraryScreen";
import { NotesScreen } from "./components/NotesScreen";
import { ReaderScreen } from "./components/ReaderScreen";
import { TabBar, newTabId } from "./components/TabBar";
import { UI_CONTRACT_VERSION } from "./lib/contract";
import {
  BIBLE_ID,
  INITIAL_BOOKMARKS,
  INITIAL_HIGHLIGHTS,
  INITIAL_NOTES,
  INITIAL_TOPICS,
  PARAGRAPHS,
  findParagraphByLocus,
  mockAsk,
  sectionTitle,
} from "./lib/mockData";
import type {
  AskMessage,
  Bookmark,
  Highlight,
  NoteDoc,
  NoteSection,
  Paragraph,
  TabKind,
  Topic,
  WorkspaceLayout,
  WorkspaceTab,
} from "./lib/types";

const SIZE_KEY = "study-desk-text-size";
const BIBLE_SECTION_KEY = "study-desk-bible-section";

function readTextSize(): number {
  const v = Number(localStorage.getItem(SIZE_KEY));
  return Number.isFinite(v) && v >= 0.95 && v <= 1.6 ? v : 1.25;
}

function readBibleSection(): string {
  return localStorage.getItem(BIBLE_SECTION_KEY) || "ps.23";
}

function defaultTitle(kind: TabKind): string {
  if (kind === "bible") return "Bible";
  if (kind === "ask") return "Ask";
  if (kind === "library") return "Library";
  if (kind === "notes") return "Notes";
  return "Reader";
}

export default function App() {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [layout, setLayout] = useState<WorkspaceLayout | null>(null);
  const [textSize] = useState(readTextSize);
  const [bibleSectionDefault] = useState(readBibleSection);
  const [highlights, setHighlights] = useState<Highlight[]>(INITIAL_HIGHLIGHTS);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(INITIAL_BOOKMARKS);
  const [notes, setNotes] = useState<NoteDoc[]>(INITIAL_NOTES);
  const [topics] = useState<Topic[]>(INITIAL_TOPICS);
  const [askByTab, setAskByTab] = useState<Record<string, AskMessage[]>>({});
  const [notesFilter, setNotesFilter] = useState<NoteSection | "all">("all");
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const focusId =
    layout?.mode === "single"
      ? layout.focusId
      : layout?.mode === "split"
        ? layout.leftId
        : null;
  const rightId = layout?.mode === "split" ? layout.rightId : null;

  function updateTab(id: string, patch: Partial<WorkspaceTab>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function addTab(kind: Exclude<TabKind, "reader">, extras: Partial<WorkspaceTab> = {}) {
    const id = newTabId();
    const tab: WorkspaceTab = {
      id,
      kind,
      title: defaultTitle(kind),
      bibleSectionId: kind === "bible" ? bibleSectionDefault : undefined,
      libraryWorkId: kind === "library" ? null : undefined,
      notesDocId: kind === "notes" ? null : undefined,
      ...extras,
    };
    if (kind === "bible" && tab.bibleSectionId) {
      tab.title = sectionTitle(BIBLE_ID, tab.bibleSectionId);
    }
    setTabs((prev) => [...prev, tab]);
    setLayout({ mode: "single", focusId: id });
    return id;
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      setLayout((lay) => {
        if (!lay) return null;
        if (lay.mode === "single") {
          if (lay.focusId !== id) return lay;
          return remaining.length
            ? { mode: "single", focusId: remaining[remaining.length - 1].id }
            : null;
        }
        if (lay.leftId === id) return { mode: "single", focusId: lay.rightId };
        if (lay.rightId === id) return { mode: "single", focusId: lay.leftId };
        return lay;
      });
      return remaining;
    });
  }

  function focusTab(id: string) {
    setLayout((prev) => {
      if (prev?.mode === "split") {
        if (id === prev.leftId || id === prev.rightId) return prev;
        return { mode: "split", leftId: id, rightId: prev.rightId, ratio: prev.ratio };
      }
      return { mode: "single", focusId: id };
    });
  }

  function splitRight(rightId: string) {
    const left =
      layout?.mode === "single"
        ? layout.focusId
        : layout?.mode === "split"
          ? layout.leftId
          : tabs[0]?.id;
    if (!left || left === rightId) {
      setLayout({ mode: "single", focusId: rightId });
      return;
    }
    setLayout({ mode: "split", leftId: left, rightId, ratio: 0.55 });
  }

  function splitWithNew(leftId: string, kind: Exclude<TabKind, "reader">) {
    const id = newTabId();
    const tab: WorkspaceTab = {
      id,
      kind,
      title: defaultTitle(kind),
      bibleSectionId: kind === "bible" ? bibleSectionDefault : undefined,
      libraryWorkId: kind === "library" ? null : undefined,
      notesDocId: kind === "notes" ? null : undefined,
    };
    if (kind === "bible" && tab.bibleSectionId) {
      tab.title = sectionTitle(BIBLE_ID, tab.bibleSectionId);
    }
    setTabs((prev) => [...prev, tab]);
    setLayout({ mode: "split", leftId, rightId: id, ratio: 0.55 });
  }

  function openLocus(workId: string, locusId: string) {
    const hit = findParagraphByLocus(locusId);
    if (!hit) return;
    if (hit.workId === BIBLE_ID || workId === BIBLE_ID) {
      const existing = tabs.find((t) => t.kind === "bible");
      if (existing) {
        updateTab(existing.id, {
          bibleSectionId: hit.sectionId,
          title: sectionTitle(BIBLE_ID, hit.sectionId),
        });
        focusTab(existing.id);
        localStorage.setItem(BIBLE_SECTION_KEY, hit.sectionId);
      } else {
        addTab("bible", {
          bibleSectionId: hit.sectionId,
          title: sectionTitle(BIBLE_ID, hit.sectionId),
        });
      }
      return;
    }
    const id = newTabId();
    const tab: WorkspaceTab = {
      id,
      kind: "reader",
      title: sectionTitle(hit.workId, hit.sectionId),
      readerWorkId: hit.workId,
      readerSectionId: hit.sectionId,
    };
    setTabs((prev) => [...prev, tab]);
    setLayout({ mode: "single", focusId: id });
  }

  function toggleHighlight(workId: string, paragraph: Paragraph) {
    setHighlights((prev) => {
      if (prev.some((h) => h.paragraphId === paragraph.id)) {
        return prev.filter((h) => h.paragraphId !== paragraph.id);
      }
      return [
        {
          id: `hl-${Date.now()}`,
          workId,
          paragraphId: paragraph.id,
          locusId: paragraph.locusId,
          color: "amber",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ];
    });
  }

  function bookmarkParas(workId: string, paragraphs: Paragraph[]) {
    const now = new Date().toISOString();
    setBookmarks((prev) => {
      let next = [...prev];
      for (const para of paragraphs) {
        if (next.some((b) => b.paragraphId === para.id)) continue;
        next = [
          {
            id: `bm-${now}-${para.id}`,
            workId,
            paragraphId: para.id,
            locusId: para.locusId,
            label: para.locusId,
            createdAt: now,
          },
          ...next,
        ];
      }
      return next;
    });
    setToast("Bookmarked");
  }

  function copyToNotes(paragraphs: Paragraph[]) {
    const ref = paragraphs.map((p) => p.locusId).join("; ");
    const linkText = `[${ref}](studydesk://${paragraphs[0]?.locusId ?? ref})`;
    void navigator.clipboard?.writeText(linkText).catch(() => undefined);
    setClipboardHint(ref);
    setToast("Reference copied");

    const notesTab = tabs.find((t) => t.kind === "notes");
    if (notesTab) {
      updateTab(notesTab.id, { notesDocId: null });
      if (layout?.mode === "split") {
        setLayout({
          mode: "split",
          leftId: layout.leftId,
          rightId: notesTab.id,
          ratio: layout.ratio,
        });
      } else {
        focusTab(notesTab.id);
      }
    } else {
      addTab("notes");
    }
  }

  function askSplit(fromTabId: string, paragraphs: Paragraph[]) {
    const seed = paragraphs.map((p) => `${p.locusId}: ${p.text}`).join("\n");
    const response = mockAsk(seed);
    const stamp = new Date().toISOString();
    const askId = newTabId();
    const askTab: WorkspaceTab = {
      id: askId,
      kind: "ask",
      title: "Ask",
      askSeed: seed.slice(0, 180),
    };
    setTabs((prev) => [...prev, askTab]);
    setAskByTab((prev) => ({
      ...prev,
      [askId]: [
        { id: `u-${stamp}`, role: "user", content: seed.slice(0, 240), createdAt: stamp },
        {
          id: `a-${stamp}`,
          role: "assistant",
          content: response.answer,
          response,
          createdAt: stamp,
        },
      ],
    }));
    setLayout({ mode: "split", leftId: fromTabId, rightId: askId, ratio: 0.55 });
  }

  function renderPane(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    if (tab.kind === "bible") {
      const sectionId = tab.bibleSectionId ?? bibleSectionDefault;
      return (
        <BibleScreen
          sectionId={sectionId}
          highlights={highlights}
          bookmarks={bookmarks}
          textSize={textSize}
          onSectionChange={(id) => {
            updateTab(tab.id, { bibleSectionId: id, title: sectionTitle(BIBLE_ID, id) });
            localStorage.setItem(BIBLE_SECTION_KEY, id);
          }}
          onToggleHighlight={(paragraphId) => {
            const para = (PARAGRAPHS[sectionId] ?? []).find((p) => p.id === paragraphId);
            if (para) toggleHighlight(BIBLE_ID, para);
          }}
          onBookmark={(paras) => bookmarkParas(BIBLE_ID, paras)}
          onAskSplit={(paras) => askSplit(tab.id, paras)}
          onCopyToNotes={copyToNotes}
        />
      );
    }

    if (tab.kind === "ask") {
      return (
        <AskScreen
          messages={askByTab[tab.id] ?? []}
          seed={tab.askSeed}
          onSend={(m) =>
            setAskByTab((prev) => ({
              ...prev,
              [tab.id]: [...(prev[tab.id] ?? []), m],
            }))
          }
          onOpenLocus={openLocus}
        />
      );
    }

    if (tab.kind === "library") {
      return (
        <LibraryScreen
          selectedWorkId={tab.libraryWorkId ?? null}
          onOpenWork={(id) => updateTab(tab.id, { libraryWorkId: id })}
          onOpenSection={(workId, sectionId) => {
            if (workId === BIBLE_ID) {
              addTab("bible", {
                bibleSectionId: sectionId,
                title: sectionTitle(BIBLE_ID, sectionId),
              });
              return;
            }
            const id = newTabId();
            setTabs((prev) => [
              ...prev,
              {
                id,
                kind: "reader",
                title: sectionTitle(workId, sectionId),
                readerWorkId: workId,
                readerSectionId: sectionId,
              },
            ]);
            setLayout({ mode: "single", focusId: id });
          }}
        />
      );
    }

    if (tab.kind === "notes") {
      return (
        <NotesScreen
          docs={notes}
          openDocId={tab.notesDocId ?? null}
          sectionFilter={notesFilter}
          clipboardHint={clipboardHint}
          onSectionFilter={setNotesFilter}
          onOpenDoc={(id) => updateTab(tab.id, { notesDocId: id, title: id ? "Note" : "Notes" })}
          onCreateDoc={(section) => {
            const now = new Date().toISOString();
            const doc: NoteDoc = {
              id: `n-${now}`,
              title: "Untitled",
              section,
              body: "",
              createdAt: now,
              updatedAt: now,
            };
            setNotes((prev) => [doc, ...prev]);
            updateTab(tab.id, { notesDocId: doc.id, title: doc.title });
          }}
          onUpdateDoc={(doc) => {
            setNotes((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
            updateTab(tab.id, { title: doc.title || "Note" });
          }}
          onOpenLocus={openLocus}
        />
      );
    }

    if (tab.kind === "reader" && tab.readerWorkId && tab.readerSectionId) {
      const workId = tab.readerWorkId;
      const sectionId = tab.readerSectionId;
      return (
        <ReaderScreen
          workId={workId}
          sectionId={sectionId}
          highlights={highlights}
          bookmarks={bookmarks}
          textSize={textSize}
          onBack={() => {
            closeTab(tab.id);
            addTab("library", { libraryWorkId: workId });
          }}
          onToggleHighlight={(paragraphId) => {
            const para = (PARAGRAPHS[sectionId] ?? []).find((p) => p.id === paragraphId);
            if (para) toggleHighlight(workId, para);
          }}
          onBookmark={(paras) => bookmarkParas(workId, paras)}
          onAskSplit={(paras) => askSplit(tab.id, paras)}
          onCopyToNotes={copyToNotes}
        />
      );
    }

    return null;
  }

  // silence unused topics for now (brush-up later in notes)
  void topics;

  if (tabs.length === 0 || !layout) {
    return (
      <div className="app-shell bg-bg text-text">
        <LaunchScreen onOpen={(kind) => addTab(kind)} />
        <span className="sr-only" data-ui-contract={UI_CONTRACT_VERSION} />
      </div>
    );
  }

  return (
    <div className="app-shell bg-bg text-text">
      <TabBar
        tabs={tabs}
        focusId={focusId}
        splitRightId={rightId}
        onFocus={focusTab}
        onClose={closeTab}
        onAdd={(kind) => addTab(kind as Exclude<TabKind, "reader">)}
        onSplitRight={(rightId) => {
          if (focusId && focusId !== rightId) {
            setLayout({ mode: "split", leftId: focusId, rightId, ratio: 0.55 });
          } else {
            splitRight(rightId);
          }
        }}
        onSplitWithNew={splitWithNew}
        onClearSplit={() => {
          if (layout.mode === "split") {
            setLayout({ mode: "single", focusId: layout.leftId });
          }
        }}
      />

      <div className="pane-host">
        {layout.mode === "single" && (
          <div className="pane-fill">{renderPane(layout.focusId)}</div>
        )}
        {layout.mode === "split" && (
          <div className="pane-fill flex overflow-hidden">
            <div
              className="relative h-full overflow-hidden border-r border-border"
              style={{ width: `${layout.ratio * 100}%`, flex: "none" }}
            >
              {renderPane(layout.leftId)}
            </div>
            <div className="relative h-full min-w-0 overflow-hidden" style={{ flex: "1 1 0%" }}>
              {renderPane(layout.rightId)}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 top-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] z-[60] flex justify-center px-4">
          <div className="anim-sheet rounded-pill border border-border bg-bg-elevated px-4 py-2 text-sm font-medium">
            {toast}
          </div>
        </div>
      )}

      <span className="sr-only" data-ui-contract={UI_CONTRACT_VERSION} />
    </div>
  );
}
