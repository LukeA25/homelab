/**
 * Homelab Study Desk API client.
 * Content (Bible, CCC, library) comes from the FastAPI backend.
 * Notes / highlights / bookmarks stay local until those endpoints exist.
 */

import type { Paragraph, SectionNode, Work, WorkKind } from "./types";

export const BIBLE_ID = "bible-nabre";
export const DEFAULT_BIBLE_SECTION = "bible-nabre/Ps/23";

export const API_BASE =
  (import.meta as ImportMeta & { env?: { VITE_API_BASE?: string } }).env?.VITE_API_BASE ??
  "http://theology.home.arpa";

export type ApiWork = {
  id: string;
  title: string;
  shortTitle: string;
  author: string;
  kind: string;
  category: string;
  description: string;
  translation?: string | null;
  blockCount: number;
};

export type ApiSection = {
  id: string;
  title: string;
  level: number;
  blockCount?: number;
  /** Substantive paragraphs only; title stubs report 0. */
  contentBlockCount?: number;
  children: ApiSection[];
};

function sectionHasReadableContent(node: ApiSection): boolean {
  // Prefer the backend's contentBlockCount (excludes headings / "Article 1" labels).
  if ((node.contentBlockCount ?? 0) > 0) return true;
  // Fallback for older API responses.
  if (node.contentBlockCount === undefined && (node.blockCount ?? 0) > 0) return true;
  return (node.children ?? []).some(sectionHasReadableContent);
}

const TITLE_CASE_SMALL = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "by",
  "from",
  "at",
  "vs",
]);

/** Title-case ALL-CAPS heading words; leave already-mixed words alone. */
export function toTitleCaseHeading(title: string): string {
  let wordIdx = 0;
  return title.replace(/[A-Za-z][A-Za-z']*/g, (word) => {
    const idx = wordIdx++;
    if (/^[IVXLCDM]+$/i.test(word) && word.length <= 4) {
      return word.toUpperCase();
    }
    const isAllCaps = word === word.toUpperCase() && /[A-Z]/.test(word);
    const isAllLower = word === word.toLowerCase();
    if (!isAllCaps && !isAllLower) return word;
    const lower = word.toLowerCase();
    if (idx > 0 && TITLE_CASE_SMALL.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

/** Flatten a section tree into openable rows, skipping empty / title-only nodes. */
export function readableSectionRows(
  roots: ApiSection[],
  opts?: { titleCase?: boolean },
): Array<{ id: string; title: string; parent?: string }> {
  const rows: Array<{ id: string; title: string; parent?: string }> = [];
  const format = opts?.titleCase
    ? toTitleCaseHeading
    : (s: string) => s;

  function walk(nodes: ApiSection[], parentTitle?: string) {
    for (const node of nodes) {
      if (!sectionHasReadableContent(node)) continue;
      const kids = (node.children ?? []).filter(sectionHasReadableContent);
      const selfReadable = (node.contentBlockCount ?? 0) > 0
        || (node.contentBlockCount === undefined && (node.blockCount ?? 0) > 0);
      const title = format(node.title);
      const parent = parentTitle ? format(parentTitle) : undefined;

      if (kids.length) {
        // Grouping node (chapter/article): list readable children under it.
        // If it also has its own intro paragraphs, surface it as its own row first.
        if (selfReadable) {
          rows.push({ id: node.id, title, parent });
        }
        walk(kids, node.title);
      } else if (selfReadable) {
        rows.push({ id: node.id, title, parent });
      }
    }
  }

  walk(roots);
  return rows;
}

export type ApiParagraph = {
  id: string;
  locusId: string;
  label: string;
  kind: string;
  text: string;
  verse?: number | null;
};

export type ApiBlockDetail = ApiParagraph & {
  workId: string;
  sectionId?: string | null;
};

export type ChapterRef = {
  workId: string;
  sectionId: string;
  bookTitle: string;
  chapterTitle: string;
};

/** Ordered readable sections for swipe navigation in the library reader. */
export function flattenReadableChapters(
  roots: ApiSection[],
  workId: string,
  opts?: { titleCase?: boolean },
): ChapterRef[] {
  return readableSectionRows(roots, opts).map((row) => ({
    workId,
    sectionId: row.id,
    bookTitle: row.parent ?? "",
    chapterTitle: row.title,
  }));
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}${body ? `: ${body.slice(0, 160)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}${text ? `: ${text.slice(0, 160)}` : ""}`);
  }
  return res.json() as Promise<T>;
}

export function toWork(w: ApiWork): Work {
  return {
    id: w.id,
    title: w.title,
    shortTitle: w.shortTitle || w.title,
    author: w.author,
    kind: (w.kind as WorkKind) || "book",
    description: w.description,
  };
}

export function toSectionNodes(nodes: ApiSection[]): SectionNode[] {
  return nodes.map((n) => ({
    id: n.id,
    title: n.title,
    children: n.children?.length ? toSectionNodes(n.children) : undefined,
  }));
}

export function toParagraph(p: ApiParagraph): Paragraph {
  const verse =
    p.verse ??
    (p.kind === "verse" && /^\d+$/.test(p.label) ? Number(p.label) : undefined);
  return {
    id: p.id,
    locusId: p.locusId,
    label: p.label,
    verse,
    text: p.text,
    kind: p.kind,
  };
}

const SUPERSCRIPT_DIGITS: Record<string, string> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** Convert 12 → ¹² so verse markers sit inline without wrapping the line. */
export function toSuperscriptDigits(value: string | number): string {
  return String(value).replace(/\d/g, (d) => SUPERSCRIPT_DIGITS[d] ?? d);
}

/** Group Bible blocks into heading breaks + flowing verse paragraphs. */
export type BibleRun =
  | { type: "heading"; paragraph: Paragraph }
  | { type: "paragraph"; verses: Paragraph[] };

export function groupBibleRuns(paragraphs: Paragraph[]): BibleRun[] {
  const runs: BibleRun[] = [];
  let buf: Paragraph[] = [];
  const flush = () => {
    if (buf.length) {
      runs.push({ type: "paragraph", verses: buf });
      buf = [];
    }
  };
  for (const p of paragraphs) {
    if (p.kind === "heading") {
      flush();
      runs.push({ type: "heading", paragraph: p });
    } else {
      buf.push(p);
    }
  }
  flush();
  return runs;
}

export function listWorks(): Promise<ApiWork[]> {
  return apiGet("/api/works");
}

export function getWorkSections(workId: string): Promise<ApiSection[]> {
  return apiGet(`/api/works/${encodeURIComponent(workId)}/sections`);
}

export function getSectionBlocks(sectionId: string): Promise<ApiParagraph[]> {
  // FastAPI path converter — keep slashes in the section id.
  return apiGet(`/api/sections/${sectionId}/blocks`);
}

export function getLocus(workId: string, locusId: string): Promise<ApiBlockDetail[]> {
  return apiGet(`/api/locus/${encodeURIComponent(workId)}/${locusId}`);
}

export function searchLibrary(q: string, limit = 12): Promise<{
  query: string;
  total: number;
  hits: Array<{
    workId: string;
    workTitle: string;
    locusId: string;
    label: string;
    kind: string;
    snippet: string;
  }>;
}> {
  return apiGet(`/api/search?q=${encodeURIComponent(q)}&limit=${limit}`);
}

export type AskApiResponse = {
  answer: string;
  resources: Array<{
    locus: { workId: string; locusId: string; label: string };
    reason: string;
  }>;
  citations: Array<{
    locus: { workId: string; locusId: string; label: string };
    snippet: string;
  }>;
  bullets: string[];
  recommendations?: Array<{
    catalogId: string;
    title: string;
    author: string;
    inLibrary: boolean;
    workId?: string | null;
    reason: string;
    sectionId?: string | null;
    sectionTitle?: string | null;
  }>;
  actionsTaken?: Array<{
    type: string;
    noteId?: string | null;
    title?: string | null;
    message: string;
  }>;
  pendingActions?: Array<{
    type: string;
    noteId?: string | null;
    title?: string | null;
    section?: string | null;
    message: string;
  }>;
  threadId?: string | null;
};

/** RAG Ask against the Study Desk library (FTS + gpt-4o-mini on the API). */
export function askLibrary(
  question: string,
  opts?: {
    seed?: string;
    limit?: number;
    allowActions?: boolean;
    threadId?: string | null;
    noteIds?: string[];
    confirmedActions?: Array<Record<string, unknown>>;
  },
): Promise<AskApiResponse> {
  return apiPost<AskApiResponse>("/api/ask", {
    question,
    seed: opts?.seed,
    limit: opts?.limit ?? 8,
    allowActions: opts?.allowActions ?? true,
    threadId: opts?.threadId ?? undefined,
    noteIds: opts?.noteIds ?? [],
    confirmedActions: opts?.confirmedActions ?? [],
  });
}

export function listAskThreads(): Promise<
  Array<{ id: string; title: string; createdAt: string; updatedAt: string }>
> {
  return apiGet("/api/ask/threads");
}

export function createAskThread(title?: string): Promise<{
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}> {
  return apiPost("/api/ask/threads", { title: title ?? null });
}

export function updateAskThread(
  id: string,
  title: string,
): Promise<{ id: string; title: string; createdAt: string; updatedAt: string }> {
  return apiPatch(`/api/ask/threads/${encodeURIComponent(id)}`, { title });
}

export function deleteAskThread(id: string): Promise<{ ok: boolean }> {
  return apiDelete(`/api/ask/threads/${encodeURIComponent(id)}`);
}

export function listAskMessages(threadId: string): Promise<
  Array<{
    id: string;
    threadId: string;
    role: string;
    content: string;
    response?: AskApiResponse | null;
    createdAt: string;
  }>
> {
  return apiGet(`/api/ask/threads/${encodeURIComponent(threadId)}/messages`);
}

export function listPrayers(): Promise<
  Array<{ id: string; title: string; subtitle: string; kind: string; sort: number }>
> {
  return apiGet("/api/prayers");
}

export function getPrayer(id: string): Promise<{
  id: string;
  title: string;
  subtitle: string;
  kind: string;
  sort: number;
  body?: string | null;
}> {
  return apiGet(`/api/prayers/${encodeURIComponent(id)}`);
}

export function getReadings(date?: string): Promise<{
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
}> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiGet(`/api/readings${q}`);
}

export function listCatalog(): Promise<
  Array<{
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
  }>
> {
  return apiGet("/api/catalog");
}

export function importCatalogWork(catalogId: string): Promise<{
  ok: boolean;
  workId: string;
  title: string;
  message: string;
}> {
  return apiPost(`/api/catalog/${encodeURIComponent(catalogId)}/import`, {});
}

export function listNotes(): Promise<
  Array<{ id: string; title: string; section: string; body: string; createdAt: string; updatedAt: string }>
> {
  return apiGet("/api/notes");
}

export function createNote(body: {
  title?: string;
  section?: string;
  body?: string;
}): Promise<{ id: string; title: string; section: string; body: string; createdAt: string; updatedAt: string }> {
  return apiPost("/api/notes", body);
}

export function updateNote(
  id: string,
  body: { title?: string; section?: string; body?: string },
): Promise<{ id: string; title: string; section: string; body: string; createdAt: string; updatedAt: string }> {
  return apiPatch(`/api/notes/${encodeURIComponent(id)}`, body);
}

export function deleteNote(id: string): Promise<{ ok: boolean }> {
  return apiDelete(`/api/notes/${encodeURIComponent(id)}`);
}

export function listHighlights(): Promise<
  Array<{ id: string; workId: string; paragraphId: string; locusId: string; color: string; createdAt: string }>
> {
  return apiGet("/api/highlights");
}

export function createHighlight(body: {
  workId: string;
  paragraphId: string;
  locusId: string;
  color?: string;
}): Promise<{ id: string; workId: string; paragraphId: string; locusId: string; color: string; createdAt: string }> {
  return apiPost("/api/highlights", body);
}

export function deleteHighlight(id: string): Promise<{ ok: boolean }> {
  return apiDelete(`/api/highlights/${encodeURIComponent(id)}`);
}

export function listBookmarks(): Promise<
  Array<{
    id: string;
    workId: string;
    scope?: string;
    sectionId?: string;
    paragraphId: string;
    locusId: string;
    label: string;
    note: string;
    createdAt: string;
  }>
> {
  return apiGet("/api/bookmarks");
}

export function createBookmark(body: {
  workId: string;
  paragraphId: string;
  locusId: string;
  sectionId?: string;
  scope?: string;
  label?: string;
  note?: string;
}): Promise<{
  id: string;
  workId: string;
  scope?: string;
  sectionId?: string;
  paragraphId: string;
  locusId: string;
  label: string;
  note: string;
  createdAt: string;
}> {
  return apiPost("/api/bookmarks", body);
}

export function deleteBookmark(id: string): Promise<{ ok: boolean }> {
  return apiDelete(`/api/bookmarks/${encodeURIComponent(id)}`);
}

/** Flatten a bible section tree into ordered chapter refs. */
export function flattenBibleChapters(roots: ApiSection[], workId = BIBLE_ID): ChapterRef[] {
  const out: ChapterRef[] = [];
  for (const book of roots) {
    for (const ch of book.children ?? []) {
      out.push({
        workId,
        sectionId: ch.id,
        bookTitle: book.title,
        chapterTitle: ch.title,
      });
    }
  }
  return out;
}

export function adjacentChapter(
  chapters: ChapterRef[],
  sectionId: string,
  delta: number,
): ChapterRef | null {
  const idx = chapters.findIndex((c) => c.sectionId === sectionId);
  if (idx < 0) return null;
  return chapters[idx + delta] ?? null;
}

export function sectionTitleFromChapters(
  chapters: ChapterRef[],
  sectionId: string,
  fallback?: string,
): string {
  const hit = chapters.find((c) => c.sectionId === sectionId);
  if (hit) return hit.chapterTitle;
  if (fallback) return fallback;
  const parts = sectionId.split("/");
  return parts[parts.length - 1] || sectionId;
}
