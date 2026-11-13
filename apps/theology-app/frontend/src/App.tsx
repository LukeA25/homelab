import { useCallback, useEffect, useRef, useState } from "react";
import { AskScreen } from "./components/AskScreen";
import { BibleScreen } from "./components/BibleScreen";
import { BibleYearMiniPlayer, BibleYearScreen } from "./components/BibleYearScreen";
import { LaunchScreen } from "./components/LaunchScreen";
import { LibraryScreen } from "./components/LibraryScreen";
import { NotesScreen } from "./components/NotesScreen";
import { PrayersScreen } from "./components/PrayersScreen";
import { ReaderScreen } from "./components/ReaderScreen";
import { TabBar, newTabId } from "./components/TabBar";
import {
  BIBLE_ID,
  DEFAULT_BIBLE_SECTION,
  createBookmark,
  createHighlight,
  createNote,
  deleteBookmark,
  deleteHighlight,
  deleteNote,
  getLocus,
  listBookmarks,
  listHighlights,
  listNotes,
  updateNote,
} from "./lib/api";
import { UI_CONTRACT_VERSION } from "./lib/contract";
import { INITIAL_TOPICS } from "./lib/mockData";
import { selectionClipboardPayload } from "./lib/selectionClipboard";
import type {
  Bookmark,
  Highlight,
  NoteDoc,
  NoteSection,
  Paragraph,
  ReadingChapterFocus,
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
  const saved = localStorage.getItem(BIBLE_SECTION_KEY);
  if (!saved || !saved.includes("/")) return DEFAULT_BIBLE_SECTION;
  return saved;
}

function titleFromSectionId(sectionId: string): string {
  const parts = sectionId.split("/");
  if (parts.length >= 2) return parts.slice(-2).join(" ");
  return sectionId;
}

function defaultTitle(kind: TabKind): string {
  if (kind === "prayers") return "Prayers";
  if (kind === "bible") return "Bible";
  if (kind === "ask") return "Ask";
  if (kind === "library") return "Library";
  if (kind === "notes") return "Notes";
  if (kind === "bible-year") return "Bible Year";
  return "Reader";
}

function mapNote(n: {
  id: string;
  title: string;
  section: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}): NoteDoc {
  return {
    id: n.id,
    title: n.title,
    section: n.section === "apologetics" ? "apologetics" : "personal",
    body: n.body,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

function mapHighlight(h: {
  id: string;
  workId: string;
  paragraphId: string;
  locusId: string;
  color: string;
  createdAt: string;
}): Highlight {
  const color = h.color === "sage" || h.color === "sky" ? h.color : "amber";
  return { ...h, color };
}

function mapBookmark(b: {
  id: string;
  workId: string;
  scope?: string;
  sectionId?: string;
  paragraphId: string;
  locusId: string;
  label: string;
  note: string;
  createdAt: string;
}): Bookmark {
  return {
    id: b.id,
    workId: b.workId,
    scope: b.scope || undefined,
    sectionId: b.sectionId || undefined,
    paragraphId: b.paragraphId,
    locusId: b.locusId,
    label: b.label,
    note: b.note || undefined,
    createdAt: b.createdAt,
  };
}

/** Match backend create_bookmark scope (one movable pin per work / Bible book). */
function bookmarkScope(workId: string, sectionId: string): string {
  if (workId.startsWith("bible-") && sectionId) {
    const parts = sectionId.split("/");
    return parts.length >= 2 ? parts.slice(0, 2).join("/") : workId;
  }
  return workId;
}

export default function App() {
  const [tabs, setTabs] = useState<WorkspaceTab[]>([]);
  const [layout, setLayout] = useState<WorkspaceLayout | null>(null);
  const [leftIds, setLeftIds] = useState<string[]>([]);
  const [rightIds, setRightIds] = useState<string[]>([]);
  const [activePane, setActivePane] = useState<"left" | "right">("left");
  const [isLandscape, setIsLandscape] = useState(
    () => typeof window !== "undefined" && window.innerWidth > window.innerHeight,
  );
  const landscapeRef = useRef(isLandscape);
  const layoutRef = useRef(layout);
  const tabsRef = useRef(tabs);
  const leftIdsRef = useRef(leftIds);
  const rightIdsRef = useRef(rightIds);
  layoutRef.current = layout;
  tabsRef.current = tabs;
  leftIdsRef.current = leftIds;
  rightIdsRef.current = rightIds;

  const [textSize] = useState(readTextSize);
  const [bibleSectionDefault] = useState(readBibleSection);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [notes, setNotes] = useState<NoteDoc[]>([]);
  const [topics] = useState<Topic[]>(INITIAL_TOPICS);
  const [notesFilter, setNotesFilter] = useState<NoteSection | "all">("all");
  const [clipboardHint, setClipboardHint] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refreshNotes = useCallback(async () => {
    try {
      const rows = await listNotes();
      setNotes(rows.map(mapNote));
    } catch {
      /* keep existing */
    }
  }, []);

  const refreshAnnotations = useCallback(async () => {
    try {
      const [hls, bms] = await Promise.all([listHighlights(), listBookmarks()]);
      setHighlights(hls.map(mapHighlight));
      setBookmarks(bms.map(mapBookmark));
    } catch {
      /* keep existing */
    }
  }, []);

  useEffect(() => {
    void refreshNotes();
    void refreshAnnotations();
  }, [refreshNotes, refreshAnnotations]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2000);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    function sync() {
      setIsLandscape(window.innerWidth > window.innerHeight);
    }
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
    };
  }, []);

  useEffect(() => {
    const lay = layoutRef.current;
    if (!lay || tabsRef.current.length === 0) {
      landscapeRef.current = isLandscape;
      return;
    }
    const was = landscapeRef.current;
    if (isLandscape === was) return;
    landscapeRef.current = isLandscape;

    if (isLandscape && !was) {
      const focus = lay.mode === "single" ? lay.focusId : lay.leftId;
      setLeftIds(tabsRef.current.map((t) => t.id));
      setRightIds([]);
      setActivePane("left");
      setLayout({ mode: "split", leftId: focus, rightId: null, ratio: 0.5 });
      return;
    }

    if (!isLandscape && was) {
      const keep = lay.mode === "split" ? lay.leftId : lay.focusId;
      const left = leftIdsRef.current;
      const right = rightIdsRef.current;
      const merged = [...left, ...right.filter((id) => !left.includes(id))];
      setTabs((prev) => {
        const map = new Map(prev.map((t) => [t.id, t]));
        return merged.map((id) => map.get(id)).filter(Boolean) as WorkspaceTab[];
      });
      setLeftIds(merged);
      setRightIds([]);
      setActivePane("left");
      setLayout({ mode: "single", focusId: keep });
    }
  }, [isLandscape]);

  function updateTab(id: string, patch: Partial<WorkspaceTab>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function focusTab(id: string) {
    setLayout((prev) => {
      if (prev?.mode === "split") {
        if (rightIdsRef.current.includes(id)) {
          setActivePane("right");
          return { ...prev, rightId: id };
        }
        setActivePane("left");
        if (!leftIdsRef.current.includes(id)) {
          setLeftIds((ids) => [...ids.filter((x) => x !== id), id]);
          setRightIds((ids) => ids.filter((x) => x !== id));
        }
        return { ...prev, leftId: id };
      }
      setActivePane("left");
      return { mode: "single", focusId: id };
    });
  }

  function moveTabToSide(id: string, side: "left" | "right") {
    const left = leftIdsRef.current;
    const right = rightIdsRef.current;
    const onLeft = left.includes(id);
    const onRight = right.includes(id);
    if (side === "left" && onLeft && !onRight) return;
    if (side === "right" && onRight && !onLeft) return;

    if (side === "right") {
      const nextLeft = left.filter((x) => x !== id);
      const nextRight = right.includes(id) ? right : [...right, id];
      setLeftIds(nextLeft);
      setRightIds(nextRight);
      setLayout((prev) => {
        if (prev?.mode !== "split") return prev;
        return {
          ...prev,
          leftId: prev.leftId === id ? nextLeft[0] ?? prev.leftId : prev.leftId,
          rightId: id,
        };
      });
      setActivePane("right");
      return;
    }

    const nextRight = right.filter((x) => x !== id);
    const nextLeft = left.includes(id) ? left : [...left, id];
    setRightIds(nextRight);
    setLeftIds(nextLeft);
    setLayout((prev) => {
      if (prev?.mode !== "split") return prev;
      return {
        ...prev,
        leftId: id,
        rightId: prev.rightId === id ? nextRight[0] ?? null : prev.rightId,
      };
    });
    setActivePane("left");
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const remaining = prev.filter((t) => t.id !== id);
      setLeftIds((ids) => ids.filter((x) => x !== id));
      setRightIds((ids) => ids.filter((x) => x !== id));
      setLayout((lay) => {
        if (!lay) return null;
        if (lay.mode === "single") {
          if (lay.focusId !== id) return lay;
          return remaining.length
            ? { mode: "single", focusId: remaining[remaining.length - 1]!.id }
            : null;
        }
        if (lay.leftId === id) {
          const nextLeft = leftIdsRef.current.filter((x) => x !== id)[0];
          if (nextLeft) return { ...lay, leftId: nextLeft };
          if (lay.rightId) return { mode: "single", focusId: lay.rightId };
          return remaining.length
            ? { mode: "single", focusId: remaining[remaining.length - 1]!.id }
            : null;
        }
        if (lay.rightId === id) {
          const nextRight = rightIdsRef.current.filter((x) => x !== id)[0] ?? null;
          return { ...lay, rightId: nextRight };
        }
        return lay;
      });
      return remaining;
    });
  }

  /** Close a book/note tab and return to the Library tab (create if needed). */
  function closeTabAndFocusLibrary(closingId: string) {
    const side = sideOfTab(closingId);
    setTabs((prev) => {
      let next = prev.filter((t) => t.id !== closingId);
      let lib = next.find((t) => t.kind === "library");
      if (!lib) {
        lib = { id: newTabId(), kind: "library", title: "Library", libraryWorkId: null };
        next = [...next, lib];
      }
      const libId = lib.id;
      queueMicrotask(() => {
        const lay = layoutRef.current;
        if (lay?.mode === "split") {
          const preferRight = side === "right";
          if (preferRight) {
            setLeftIds((ids) => ids.filter((x) => x !== closingId && x !== libId));
            setRightIds((ids) => {
              const filtered = ids.filter((x) => x !== closingId);
              return filtered.includes(libId) ? filtered : [...filtered, libId];
            });
            setLayout({ ...lay, rightId: libId });
            setActivePane("right");
          } else {
            setRightIds((ids) => ids.filter((x) => x !== closingId && x !== libId));
            setLeftIds((ids) => {
              const filtered = ids.filter((x) => x !== closingId);
              return filtered.includes(libId) ? filtered : [...filtered, libId];
            });
            setLayout({ ...lay, leftId: libId });
            setActivePane("left");
          }
        } else {
          setLeftIds((ids) => {
            const filtered = ids.filter((x) => x !== closingId);
            return filtered.includes(libId) ? filtered : [...filtered, libId];
          });
          setRightIds((ids) => ids.filter((x) => x !== closingId && x !== libId));
          setLayout({ mode: "single", focusId: libId });
        }
      });
      return next;
    });
  }

  /** Close a note tab and return to the Notes list tab (create if needed). */
  function closeTabAndFocusNotesList(closingId: string) {
    const side = sideOfTab(closingId);
    setTabs((prev) => {
      let next = prev.filter((t) => t.id !== closingId);
      let list = next.find((t) => t.kind === "notes" && !t.notesDocId);
      if (!list) {
        list = { id: newTabId(), kind: "notes", title: "Notes", notesDocId: null };
        next = [...next, list];
      }
      const listId = list.id;
      queueMicrotask(() => {
        const lay = layoutRef.current;
        if (lay?.mode === "split") {
          const preferRight = side === "right";
          if (preferRight) {
            setLeftIds((ids) => ids.filter((x) => x !== closingId && x !== listId));
            setRightIds((ids) => {
              const filtered = ids.filter((x) => x !== closingId);
              return filtered.includes(listId) ? filtered : [...filtered, listId];
            });
            setLayout({ ...lay, rightId: listId });
            setActivePane("right");
          } else {
            setRightIds((ids) => ids.filter((x) => x !== closingId && x !== listId));
            setLeftIds((ids) => {
              const filtered = ids.filter((x) => x !== closingId);
              return filtered.includes(listId) ? filtered : [...filtered, listId];
            });
            setLayout({ ...lay, leftId: listId });
            setActivePane("left");
          }
        } else {
          setLeftIds((ids) => {
            const filtered = ids.filter((x) => x !== closingId);
            return filtered.includes(listId) ? filtered : [...filtered, listId];
          });
          setRightIds((ids) => ids.filter((x) => x !== closingId && x !== listId));
          setLayout({ mode: "single", focusId: listId });
        }
      });
      return next;
    });
  }

  function sideOfTab(tabId: string): "left" | "right" | null {
    if (layoutRef.current?.mode !== "split") return null;
    if (rightIdsRef.current.includes(tabId)) return "right";
    if (leftIdsRef.current.includes(tabId)) return "left";
    return null;
  }

  function placeNewTab(id: string, preferredSide?: "left" | "right" | null) {
    const lay = layoutRef.current;
    if (lay?.mode === "split") {
      const side = preferredSide ?? activePane;
      if (side === "right") {
        setLeftIds((ids) => ids.filter((x) => x !== id));
        setRightIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
        setActivePane("right");
        setLayout({ ...lay, rightId: id });
      } else {
        setRightIds((ids) => ids.filter((x) => x !== id));
        setLeftIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
        setActivePane("left");
        setLayout({ ...lay, leftId: id });
      }
      return;
    }
    if (isLandscape) {
      setLeftIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
      setRightIds([]);
      setActivePane("left");
      setLayout({ mode: "split", leftId: id, rightId: null, ratio: 0.5 });
      landscapeRef.current = true;
      return;
    }
    setLeftIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setLayout({ mode: "single", focusId: id });
  }

  function focusOrPlaceTab(id: string, preferredSide?: "left" | "right" | null) {
    if (preferredSide && layoutRef.current?.mode === "split") {
      moveTabToSide(id, preferredSide);
      setLayout((prev) => {
        if (prev?.mode !== "split") return prev;
        return preferredSide === "right" ? { ...prev, rightId: id } : { ...prev, leftId: id };
      });
      setActivePane(preferredSide);
      return;
    }
    focusTab(id);
  }

  /** When a link is clicked in a split, open the Bible on the other side. */
  function oppositePane(sourceTabId?: string): "left" | "right" | null {
    if (!sourceTabId || layoutRef.current?.mode !== "split") return null;
    const side = sideOfTab(sourceTabId);
    if (side === "left") return "right";
    if (side === "right") return "left";
    return null;
  }

  function addTab(
    kind: Exclude<TabKind, "reader">,
    extras: Partial<WorkspaceTab> = {},
    preferredSide?: "left" | "right" | null,
  ) {
    // One Notes *list* tab; one tab per open note document.
    if (kind === "notes") {
      const docId = extras.notesDocId ?? null;
      const existing = tabs.find((t) =>
        docId ? t.kind === "notes" && t.notesDocId === docId : t.kind === "notes" && !t.notesDocId,
      );
      if (existing) {
        if (Object.keys(extras).length) updateTab(existing.id, extras);
        focusOrPlaceTab(existing.id, preferredSide);
        return existing.id;
      }
    } else {
      // Bible / library / prayers / ask: at most one tab of that kind.
      const existing = tabs.find((t) => t.kind === kind);
      if (existing) {
        if (Object.keys(extras).length) {
          updateTab(existing.id, { ...extras, title: extras.title ?? existing.title });
        }
        focusOrPlaceTab(existing.id, preferredSide);
        return existing.id;
      }
    }

    const id = newTabId();
    const tab: WorkspaceTab = {
      id,
      kind,
      title: defaultTitle(kind),
      bibleSectionId: kind === "bible" ? bibleSectionDefault : undefined,
      libraryWorkId: kind === "library" ? null : undefined,
      notesDocId: kind === "notes" ? null : undefined,
      prayersView: kind === "prayers" ? null : undefined,
      ...extras,
    };
    if (kind === "bible" && tab.bibleSectionId) {
      tab.title = extras.title || titleFromSectionId(tab.bibleSectionId);
    }
    if (kind === "notes" && tab.notesDocId) {
      tab.title = extras.title || "Note";
    }
    setTabs((prev) => [...prev, tab]);
    placeNewTab(id, preferredSide);
    return id;
  }

  function openBibleSection(
    sectionId: string,
    title?: string,
    focus?: {
      focusLocusId?: string | null;
      readingVerseStart?: number | null;
      readingVerseEnd?: number | null;
      readingVerses?: number[] | null;
      readingChapters?: ReadingChapterFocus[] | null;
    },
    sourceTabId?: string,
  ) {
    const heading = title || titleFromSectionId(sectionId);
    const readingChapters = focus
      ? focus.readingChapters?.length
        ? focus.readingChapters
        : [
            {
              sectionId,
              verseStart: focus.readingVerseStart ?? null,
              verseEnd: focus.readingVerseEnd ?? null,
              verses: focus.readingVerses?.length ? [...focus.readingVerses] : null,
              focusLocusId: focus.focusLocusId ?? null,
            },
          ]
      : null;
    const current = readingChapters?.find((chapter) => chapter.sectionId === sectionId) ?? null;
    const focusPatch = focus
      ? {
          focusLocusId: current?.focusLocusId ?? focus.focusLocusId ?? null,
          focusNonce: Date.now(),
          readingVerseStart: current?.verseStart ?? focus.readingVerseStart ?? null,
          readingVerseEnd: current?.verseEnd ?? focus.readingVerseEnd ?? null,
          readingVerses: current?.verses?.length
            ? [...current.verses]
            : focus.readingVerses?.length
              ? [...focus.readingVerses]
              : null,
          readingChapters,
        }
      : {
          focusLocusId: null,
          focusNonce: undefined,
          readingVerseStart: null,
          readingVerseEnd: null,
          readingVerses: null,
          readingChapters: null,
        };
    addTab(
      "bible",
      { bibleSectionId: sectionId, title: heading, ...focusPatch },
      oppositePane(sourceTabId),
    );
    localStorage.setItem(BIBLE_SECTION_KEY, sectionId);
  }

  /** Open a library work as its own tab (bible / one tab per book). */
  function openWorkTab(
    workId: string,
    title?: string,
    preferredSide?: "left" | "right" | null,
  ) {
    if (workId === BIBLE_ID || workId.startsWith("bible-")) {
      addTab(
        "bible",
        {
          bibleSectionId: bibleSectionDefault,
          title: title || "Bible",
        },
        preferredSide,
      );
      return;
    }
    const existing = tabs.find((t) => t.kind === "reader" && t.readerWorkId === workId);
    if (existing) {
      if (title) updateTab(existing.id, { title });
      focusOrPlaceTab(existing.id, preferredSide);
      return;
    }
    const id = newTabId();
    setTabs((prev) => [
      ...prev,
      {
        id,
        kind: "reader",
        title: title || "Book",
        readerWorkId: workId,
        readerSectionId: undefined,
      },
    ]);
    placeNewTab(id, preferredSide);
  }

  function openLibraryWork(workId: string) {
    openWorkTab(workId);
  }

  function openNoteTab(
    docId: string,
    title?: string,
    preferredSide?: "left" | "right" | null,
  ) {
    addTab("notes", { notesDocId: docId, title: title || "Note" }, preferredSide);
  }

  function openReaderSection(
    workId: string,
    sectionId: string,
    title?: string,
    focus?: { focusLocusId?: string | null },
    preferredSide?: "left" | "right" | null,
  ) {
    const heading = title || titleFromSectionId(sectionId);
    const focusPatch = focus?.focusLocusId
      ? { readerFocusLocusId: focus.focusLocusId, readerFocusNonce: Date.now() }
      : { readerFocusLocusId: null, readerFocusNonce: undefined };

    if (workId === BIBLE_ID) {
      openBibleSection(sectionId, heading, focus?.focusLocusId ? { focusLocusId: focus.focusLocusId } : undefined);
      return;
    }

    const existing = tabs.find((t) => t.kind === "reader" && t.readerWorkId === workId);
    if (existing) {
      updateTab(existing.id, {
        readerSectionId: sectionId,
        title: heading,
        ...focusPatch,
      });
      focusOrPlaceTab(existing.id, preferredSide);
      return;
    }
    const id = newTabId();
    setTabs((prev) => [
      ...prev,
      {
        id,
        kind: "reader",
        title: heading,
        readerWorkId: workId,
        readerSectionId: sectionId,
        ...focusPatch,
      },
    ]);
    placeNewTab(id, preferredSide);
  }

  function openLocus(workId: string, locusId: string, sourceTabId?: string) {
    void (async () => {
      try {
        const blocks = await getLocus(workId || BIBLE_ID, locusId);
        const hit = blocks[0];
        if (!hit?.sectionId) return;
        const sectionId = hit.sectionId;
        const title = titleFromSectionId(sectionId);
        if (hit.workId === BIBLE_ID || workId === BIBLE_ID) {
          openBibleSection(sectionId, title, { focusLocusId: locusId }, sourceTabId);
          return;
        }
        openReaderSection(hit.workId, sectionId, title, { focusLocusId: locusId }, oppositePane(sourceTabId));
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Could not open locus");
      }
    })();
  }

  function toggleHighlights(workId: string, paragraphs: Paragraph[]) {
    void (async () => {
      const current = highlights;
      const paraIds = new Set(paragraphs.map((p) => p.id));
      const matching = current.filter((h) => h.workId === workId && paraIds.has(h.paragraphId));
      const allHighlighted =
        paragraphs.length > 0 &&
        paragraphs.every((p) => matching.some((h) => h.paragraphId === p.id));

      try {
        if (allHighlighted) {
          const ids = new Set(matching.map((h) => h.id));
          setHighlights((prev) => prev.filter((h) => !ids.has(h.id)));
          await Promise.all(matching.map((h) => deleteHighlight(h.id)));
          return;
        }
        const toCreate = paragraphs.filter(
          (p) => !matching.some((h) => h.paragraphId === p.id),
        );
        for (const para of toCreate) {
          const created = await createHighlight({
            workId,
            paragraphId: para.id,
            locusId: para.locusId,
            color: "amber",
          });
          setHighlights((prev) => [mapHighlight(created), ...prev]);
        }
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Highlight failed");
      }
    })();
  }

  function bookmarkParas(workId: string, paragraphs: Paragraph[], sectionId: string) {
    void (async () => {
      try {
        const para = paragraphs[0];
        if (!para) return;
        const scope = bookmarkScope(workId, sectionId);
        const existing = bookmarks.find((b) => (b.scope ?? b.workId) === scope);
        if (existing && paragraphs.some((p) => p.id === existing.paragraphId)) {
          await deleteBookmark(existing.id);
          setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
          setToast("Bookmark removed");
          return;
        }
        const created = await createBookmark({
          workId,
          paragraphId: para.id,
          locusId: para.locusId,
          sectionId,
          label: para.locusId,
        });
        const mapped = mapBookmark(created);
        setBookmarks((prev) => [mapped, ...prev.filter((b) => (b.scope ?? b.workId) !== scope)]);
        setToast("Bookmarked");
      } catch (err) {
        setToast(err instanceof Error ? err.message : "Bookmark failed");
      }
    })();
  }

  function copyToNotes(paragraphs: Paragraph[]) {
    const payload = selectionClipboardPayload(paragraphs);
    const ref = paragraphs.map((p) => p.locusId).join("; ");
    void navigator.clipboard?.writeText(payload).catch(() => undefined);
    setClipboardHint(ref);
    setToast("Copied");
  }

  function askSplit(fromTabId: string, paragraphs: Paragraph[]) {
    const seed = paragraphs.map((p) => `${p.locusId}: ${p.text}`).join("\n");
    const existingAsk = tabs.find((t) => t.kind === "ask");
    const askId = existingAsk?.id ?? newTabId();
    if (!existingAsk) {
      setTabs((prev) => [
        ...prev,
        { id: askId, kind: "ask", title: "Ask", askSeed: seed.slice(0, 180) },
      ]);
    } else {
      updateTab(askId, { askSeed: seed.slice(0, 180), title: "Ask" });
    }

    const lay = layoutRef.current;
    if (lay?.mode === "split" || isLandscape) {
      setLeftIds((ids) => {
        const withoutAsk = ids.filter((x) => x !== askId);
        return withoutAsk.includes(fromTabId) ? withoutAsk : [...withoutAsk, fromTabId];
      });
      setRightIds((ids) => (ids.includes(askId) ? ids : [...ids.filter((x) => x !== askId), askId]));
      setActivePane("right");
      setLayout({
        mode: "split",
        leftId: fromTabId,
        rightId: askId,
        ratio: lay?.mode === "split" ? lay.ratio : 0.5,
      });
    } else {
      setLeftIds((ids) => (ids.includes(askId) ? ids : [...ids, askId]));
      setLayout({ mode: "single", focusId: askId });
    }
  }

  function renderPane(tabId: string | null) {
    if (!tabId) {
      return (
        <div className="flex h-full items-center justify-center px-8 text-center text-sm font-medium text-muted">
          No window
        </div>
      );
    }
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return null;

    if (tab.kind === "prayers") {
      return (
        <PrayersScreen
          view={tab.prayersView ?? null}
          onNavigate={(view) => {
            const title =
              view === null
                ? "Prayers"
                : view === "mass-readings" || view === "readings"
                  ? "Mass Readings"
                  : "Prayer";
            updateTab(tab.id, { prayersView: view, title });
          }}
          onOpenBibleSection={(sectionId, title, focus) =>
            openBibleSection(sectionId, title, focus, tab.id)
          }
        />
      );
    }

    if (tab.kind === "bible") {
      const sectionId = tab.bibleSectionId ?? bibleSectionDefault;
      return (
        <BibleScreen
          sectionId={sectionId}
          highlights={highlights}
          bookmarks={bookmarks}
          focusLocusId={tab.focusLocusId}
          focusNonce={tab.focusNonce}
          readingVerseStart={tab.readingVerseStart}
          readingVerseEnd={tab.readingVerseEnd}
          readingVerses={tab.readingVerses}
          highlightHold={Boolean(
            tab.readingChapters?.some((chapter) => chapter.sectionId === sectionId),
          )}
          textSize={textSize}
          onSectionChange={(id, title) => {
            const span = tab.readingChapters ?? [];
            const hit = span.find((chapter) => chapter.sectionId === id);
            updateTab(tab.id, {
              bibleSectionId: id,
              title: title || titleFromSectionId(id),
              ...(hit
                ? {
                    focusLocusId: hit.focusLocusId ?? null,
                    focusNonce: Date.now(),
                    readingVerseStart: hit.verseStart ?? null,
                    readingVerseEnd: hit.verseEnd ?? null,
                    readingVerses: hit.verses?.length ? [...hit.verses] : null,
                    readingChapters: span,
                  }
                : {
                    focusLocusId: undefined,
                    focusNonce: undefined,
                    readingVerseStart: undefined,
                    readingVerseEnd: undefined,
                    readingVerses: undefined,
                    readingChapters: undefined,
                  }),
            });
            localStorage.setItem(BIBLE_SECTION_KEY, id);
          }}
          onToggleHighlights={(paras) => toggleHighlights(BIBLE_ID, paras)}
          onBookmark={(paras) => bookmarkParas(BIBLE_ID, paras, sectionId)}
          onAskSplit={(paras) => askSplit(tab.id, paras)}
          onCopyToNotes={copyToNotes}
        />
      );
    }

    if (tab.kind === "bible-year") {
      return (
        <BibleYearScreen
          day={tab.bibleYearDay ?? null}
          onDayChange={(next) => updateTab(tab.id, { bibleYearDay: next })}
          onOpenBibleSection={(sectionId, title, focus) =>
            openBibleSection(sectionId, title, focus, tab.id)
          }
        />
      );
    }

    if (tab.kind === "ask") {
      return (
        <AskScreen
          seed={tab.askSeed}
          threadId={tab.askThreadId}
          onThreadIdChange={(id) => updateTab(tab.id, { askThreadId: id })}
          onOpenLocus={(workId, locusId) => openLocus(workId, locusId, tab.id)}
          onOpenWork={openLibraryWork}
          onOpenSection={(workId, sectionId, title) =>
            openReaderSection(workId, sectionId, title)
          }
          onNotesChanged={() => void refreshNotes()}
          onBackgroundComplete={(msg) => setToast(msg)}
        />
      );
    }

    if (tab.kind === "library") {
      const hubSide = sideOfTab(tab.id);
      return (
        <LibraryScreen
          selectedWorkId={null}
          bookmarks={bookmarks}
          onToast={setToast}
          onOpenWork={(id, title) => {
            if (id) openWorkTab(id, title, hubSide);
          }}
          onOpenSection={(workId, sectionId, title, focusLocusId) => {
            const heading = title || titleFromSectionId(sectionId);
            openReaderSection(
              workId,
              sectionId,
              heading,
              focusLocusId ? { focusLocusId } : undefined,
              hubSide,
            );
          }}
          onJumpToBookmark={(workId, sectionId, title, focusLocusId) => {
            const heading = title || titleFromSectionId(sectionId);
            openReaderSection(workId, sectionId, heading, {
              focusLocusId: focusLocusId ?? null,
            }, hubSide);
          }}
        />
      );
    }

    if (tab.kind === "notes") {
      const isNoteTab = !!tab.notesDocId;
      const hubSide = sideOfTab(tab.id);
      return (
        <NotesScreen
          docs={notes}
          openDocId={tab.notesDocId ?? null}
          sectionFilter={notesFilter}
          clipboardHint={clipboardHint}
          onSectionFilter={setNotesFilter}
          onOpenDoc={(id) => {
            if (isNoteTab) {
              if (id === null) closeTabAndFocusNotesList(tab.id);
              return;
            }
            if (id) {
              const doc = notes.find((d) => d.id === id);
              openNoteTab(id, doc?.title, hubSide);
            }
          }}
          onCreateDoc={(section) => {
            void (async () => {
              try {
                const doc = mapNote(await createNote({ title: "Untitled", section, body: "" }));
                setNotes((prev) => [doc, ...prev]);
                openNoteTab(doc.id, doc.title, hubSide);
              } catch (err) {
                setToast(err instanceof Error ? err.message : "Could not create note");
              }
            })();
          }}
          onUpdateDoc={(doc) => {
            setNotes((prev) => prev.map((d) => (d.id === doc.id ? doc : d)));
            setTabs((prev) =>
              prev.map((t) =>
                t.kind === "notes" && t.notesDocId === doc.id
                  ? { ...t, title: doc.title || "Note" }
                  : t,
              ),
            );
            void updateNote(doc.id, {
              title: doc.title,
              section: doc.section,
              body: doc.body,
            }).catch(() => undefined);
          }}
          onDeleteDoc={(id) => {
            void (async () => {
              try {
                await deleteNote(id);
                setNotes((prev) => prev.filter((d) => d.id !== id));
                const openTabs = tabs.filter((t) => t.kind === "notes" && t.notesDocId === id);
                for (const t of openTabs) closeTabAndFocusNotesList(t.id);
                setToast("Note deleted");
              } catch (err) {
                setToast(err instanceof Error ? err.message : "Delete failed");
              }
            })();
          }}
          onOpenLocus={(workId, locusId) => openLocus(workId, locusId, tab.id)}
        />
      );
    }

    if (tab.kind === "reader" && tab.readerWorkId) {
      const workId = tab.readerWorkId;
      if (!tab.readerSectionId) {
        return (
          <LibraryScreen
            selectedWorkId={workId}
            bookmarks={bookmarks}
            onToast={setToast}
            onOpenWork={(id) => {
              if (id === null) closeTabAndFocusLibrary(tab.id);
            }}
            onOpenSection={(_wId, sectionId, title, focusLocusId) => {
              const heading = title || titleFromSectionId(sectionId);
              updateTab(tab.id, {
                readerSectionId: sectionId,
                title: heading,
                readerFocusLocusId: focusLocusId ?? null,
                readerFocusNonce: focusLocusId ? Date.now() : undefined,
              });
            }}
            onJumpToBookmark={(_wId, sectionId, title, focusLocusId) => {
              const heading = title || titleFromSectionId(sectionId);
              updateTab(tab.id, {
                readerSectionId: sectionId,
                title: heading,
                readerFocusLocusId: focusLocusId ?? null,
                readerFocusNonce: Date.now(),
              });
            }}
          />
        );
      }
      const sectionId = tab.readerSectionId;
      return (
        <ReaderScreen
          workId={workId}
          sectionId={sectionId}
          title={tab.title}
          highlights={highlights}
          bookmarks={bookmarks}
          textSize={textSize}
          focusLocusId={tab.readerFocusLocusId}
          focusNonce={tab.readerFocusNonce}
          onFocusClear={() =>
            updateTab(tab.id, { readerFocusLocusId: undefined, readerFocusNonce: undefined })
          }
          onBack={() => {
            updateTab(tab.id, {
              readerSectionId: undefined,
              readerFocusLocusId: null,
              readerFocusNonce: undefined,
            });
          }}
          onSectionChange={(id, nextTitle) => {
            updateTab(tab.id, {
              readerSectionId: id,
              title: nextTitle || titleFromSectionId(id),
              readerFocusLocusId: undefined,
              readerFocusNonce: undefined,
            });
          }}
          onToggleHighlights={(paras) => toggleHighlights(workId, paras)}
          onBookmark={(paras) => bookmarkParas(workId, paras, sectionId)}
          onAskSplit={(paras) => askSplit(tab.id, paras)}
          onCopyToNotes={copyToNotes}
        />
      );
    }

    return null;
  }

  void topics;

  const bibleYearVisible =
    !!layout &&
    (layout.mode === "single"
      ? tabs.some((tab) => tab.id === layout.focusId && tab.kind === "bible-year")
      : tabs.some(
          (tab) =>
            (tab.id === layout.leftId || tab.id === layout.rightId) && tab.kind === "bible-year",
        ));

  if (tabs.length === 0 || !layout) {
    return (
      <div className="app-shell bg-bg text-text">
        <div className="min-h-0 flex-1">
          <LaunchScreen onOpen={(kind) => addTab(kind)} />
        </div>
        <BibleYearMiniPlayer
          hidden={false}
          onOpen={(day) => addTab("bible-year", { bibleYearDay: day })}
        />
        <span className="sr-only" data-ui-contract={UI_CONTRACT_VERSION} />
      </div>
    );
  }

  return (
    <div className="app-shell bg-bg text-text">
      <TabBar
        tabs={tabs}
        split={layout.mode === "split"}
        leftIds={layout.mode === "split" ? leftIds : tabs.map((t) => t.id)}
        rightIds={layout.mode === "split" ? rightIds : []}
        leftFocusId={layout.mode === "single" ? layout.focusId : layout.leftId}
        rightFocusId={layout.mode === "split" ? layout.rightId : null}
        onFocus={focusTab}
        onClose={closeTab}
        onAdd={(kind) => addTab(kind as Exclude<TabKind, "reader">)}
        onMoveToSide={moveTabToSide}
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
              {renderPane(leftIds.includes(layout.leftId) ? layout.leftId : null)}
            </div>
            <div className="relative h-full min-w-0 overflow-hidden" style={{ flex: "1 1 0%" }}>
              {renderPane(
                layout.rightId && rightIds.includes(layout.rightId) ? layout.rightId : null,
              )}
            </div>
          </div>
        )}
      </div>

      <BibleYearMiniPlayer
        hidden={bibleYearVisible}
        onOpen={(day) => addTab("bible-year", { bibleYearDay: day })}
      />

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
