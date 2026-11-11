/**
 * Frontend UI contract v0.3 — tabbed workspace + split panes.
 */

export type NoteSection = "personal" | "apologetics";

export type TabKind = "prayers" | "bible" | "library" | "ask" | "notes" | "reader" | "bible-year";

export type WorkspaceTab = {
  id: string;
  kind: TabKind;
  title: string;
  bibleSectionId?: string;
  libraryWorkId?: string | null;
  readerWorkId?: string;
  readerSectionId?: string;
  /** One-shot scroll/highlight when opening the Bible */
  focusLocusId?: string | null;
  focusNonce?: number;
  readingVerseStart?: number | null;
  readingVerseEnd?: number | null;
  readingVerses?: number[] | null;
  /** One-shot scroll/highlight when opening reader from bookmark */
  readerFocusLocusId?: string | null;
  readerFocusNonce?: number;
  /** notes: null = list view; string = open document */
  notesDocId?: string | null;
  askSeed?: string;
  askThreadId?: string | null;
  /** prayers hub: null = index; readings | prayer id */
  prayersView?: string | null;
  /** Bible in a Year day being viewed */
  bibleYearDay?: number | null;
};

export type WorkspaceLayout =
  | { mode: "single"; focusId: string }
  | { mode: "split"; leftId: string; rightId: string | null; ratio: number };

export type WorkKind = "bible" | "catechism" | "summa" | "book" | "fathers";

export type LocusRef = {
  workId: string;
  locusId: string;
  label: string;
};

export type Work = {
  id: string;
  title: string;
  shortTitle: string;
  author: string;
  kind: WorkKind;
  description: string;
};

export type SectionNode = {
  id: string;
  title: string;
  children?: SectionNode[];
};

export type Paragraph = {
  id: string;
  locusId: string;
  label: string;
  verse?: number;
  text: string;
  kind?: string;
};

export type ReadingPosition = {
  workId: string;
  sectionId: string;
  paragraphId: string;
  updatedAt: string;
};

export type Highlight = {
  id: string;
  workId: string;
  paragraphId: string;
  locusId: string;
  color: "amber" | "sage" | "sky";
  createdAt: string;
};

export type Bookmark = {
  id: string;
  workId: string;
  scope?: string;
  sectionId?: string;
  paragraphId: string;
  locusId: string;
  label: string;
  note?: string;
  createdAt: string;
};

export type NoteDoc = {
  id: string;
  title: string;
  section: NoteSection;
  /** Plain text file body (markdown-ish line prefixes for format) */
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type Topic = {
  id: string;
  title: string;
  summary: string;
  keyPoints: string[];
  linkedSources: LocusRef[];
  notes: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AskCitation = {
  locus: LocusRef;
  snippet: string;
};

export type AskResourceCard = {
  locus: LocusRef;
  reason: string;
};

export type AskResponse = {
  answer: string;
  resources: AskResourceCard[];
  citations: AskCitation[];
  bullets: string[];
  recommendations?: AskRecommendation[];
  actionsTaken?: AskActionTaken[];
  pendingActions?: AskPendingAction[];
  threadId?: string | null;
};

export type AskRecommendation = {
  catalogId: string;
  title: string;
  author: string;
  inLibrary: boolean;
  workId?: string | null;
  reason: string;
  sectionId?: string | null;
  sectionTitle?: string | null;
};

export type AskActionTaken = {
  type: string;
  noteId?: string | null;
  title?: string | null;
  message: string;
};

export type AskPendingAction = {
  type: string;
  noteId?: string | null;
  title?: string | null;
  section?: string | null;
  message: string;
};

export type AskThread = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AskChatMessage = {
  id: string;
  threadId: string;
  role: "user" | "assistant" | string;
  content: string;
  response?: AskResponse | null;
  createdAt: string;
};

export type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AskResponse;
  createdAt: string;
};

export type PrayerItem = {
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  sort: number;
  body?: string | null;
};

export type CatalogWork = {
  id: string;
  title: string;
  author: string;
  category: string;
  topics: string[];
  summary: string;
  sourceUrl?: string | null;
  rights: string;
  rightsHint: string;
  inLibrary: boolean;
  workId?: string | null;
  downloadable?: boolean;
};

export type ReadingsDay = {
  date: string;
  celebration: string;
  season: string;
  source: string;
  error?: string | null;
  readings: Array<{
    type: string;
    reference: string;
    label: string;
    sectionId?: string | null;
    focusLocusId?: string | null;
    verseStart?: number | null;
    verseEnd?: number | null;
    verses?: number[];
  }>;
};

export type SearchResultKind = "scripture" | "book" | "note" | "topic";

export type SearchResult = {
  id: string;
  kind: SearchResultKind;
  title: string;
  snippet: string;
  locus?: LocusRef;
  noteId?: string;
  topicId?: string;
};

export type ChapterRef = {
  workId: string;
  sectionId: string;
  bookTitle: string;
  chapterTitle: string;
};

/** @deprecated kept for launch typing */
export type AppScreen = TabKind | "launch" | "search" | "topic";
