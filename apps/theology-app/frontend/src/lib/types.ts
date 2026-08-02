/**
 * Frontend UI contract v0.3 — tabbed workspace + split panes.
 */

export type NoteSection = "personal" | "apologetics";

export type TabKind = "bible" | "library" | "ask" | "notes" | "reader";

export type WorkspaceTab = {
  id: string;
  kind: TabKind;
  title: string;
  bibleSectionId?: string;
  libraryWorkId?: string | null;
  readerWorkId?: string;
  readerSectionId?: string;
  /** notes: null = list view; string = open document */
  notesDocId?: string | null;
  askSeed?: string;
};

export type WorkspaceLayout =
  | { mode: "single"; focusId: string }
  | { mode: "split"; leftId: string; rightId: string; ratio: number };

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
};

export type AskMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AskResponse;
  createdAt: string;
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
