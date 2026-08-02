/**
 * Mobile UI contract v0.5
 *
 * - Notes: TextInput lines + InputAccessoryView format toolbar.
 * - Native ScrollView/FlatList (UIScrollView) — no web overflow hacks.
 * - Chapter change via pager-view / gesture edge swipe.
 * - Split via columns icon on a tab (picker), not drag.
 */

export const UI_CONTRACT_VERSION = "0.5.0-mobile";

export const TAB_KINDS = ["bible", "ask", "library", "notes"] as const;

export const NOTE_LINE_FORMATS = ["text", "header", "quote", "comment", "link"] as const;

export const SUGGESTED_API = {
  works: "GET /api/works",
  bibleChapter: "GET /api/bible/chapters/:id",
  ask: "POST /api/ask",
  notes: "CRUD /api/notes (title + body text)",
  annotations: "CRUD /api/highlights|/api/bookmarks",
} as const;
