/**
 * UI contract freeze v0.4
 *
 * - Notes are plain text files; line tools rewrite the current line (# / > / // / link).
 * - Format toolbar docks above the on-screen keyboard via visualViewport.
 * - Fixed app height (measured px in --app-h); each pane scrolls independently.
 * - Split via columns icon on a tab (picker), not drag.
 */

export const UI_CONTRACT_VERSION = "0.4.0-frontend";

export const TAB_KINDS = ["bible", "ask", "library", "notes"] as const;

export const NOTE_LINE_FORMATS = ["text", "header", "quote", "comment", "link"] as const;

export const SUGGESTED_API = {
  works: "GET /api/works",
  bibleChapter: "GET /api/bible/chapters/:id",
  ask: "POST /api/ask",
  notes: "CRUD /api/notes (title + body text)",
  annotations: "CRUD /api/highlights|/api/bookmarks",
} as const;
