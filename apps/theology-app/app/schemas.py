"""API response shapes.

Field names are camelCase and mirror `frontend/src/lib/types.ts` so the web and
mobile clients can swap their `mockData` imports for fetches without rewriting
their types.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel


class WorkOut(BaseModel):
    id: str
    title: str
    shortTitle: str
    author: str
    kind: str
    category: str
    description: str
    translation: Optional[str] = None
    edition: Optional[str] = None
    source: str
    rights: str
    blockCount: int


class SectionOut(BaseModel):
    id: str
    title: str
    level: int
    blockCount: int = 0
    contentBlockCount: int = 0
    children: list["SectionOut"] = []


class ParagraphOut(BaseModel):
    id: str
    locusId: str
    label: str
    kind: str
    text: str
    verse: Optional[int] = None


class FootnoteOut(BaseModel):
    marker: str
    text: str


class CrossRefOut(BaseModel):
    targetLocus: str
    kind: str


class BlockDetailOut(ParagraphOut):
    workId: str
    sectionId: Optional[str] = None
    footnotes: list[FootnoteOut] = []
    crossrefs: list[CrossRefOut] = []


class BibleBookOut(BaseModel):
    number: int
    name: str
    displayName: str
    testament: str
    canonOrder: int
    chapterCount: int


class ChapterOut(BaseModel):
    workId: str
    book: str
    bookNumber: int
    chapter: int
    sectionId: Optional[str] = None
    paragraphs: list[ParagraphOut]


class ResolvedVerseOut(BaseModel):
    locusId: str
    chapter: int
    verse: int
    label: str
    text: str


class PassageOut(BaseModel):
    reference: str
    book: Optional[str] = None
    workId: Optional[str] = None
    ok: bool
    error: Optional[str] = None
    verses: list[ResolvedVerseOut] = []


class ResolveOut(BaseModel):
    query: str
    passages: list[PassageOut]


class SearchHitOut(BaseModel):
    workId: str
    workTitle: str
    locusId: str
    label: str
    kind: str
    snippet: str


class SearchOut(BaseModel):
    query: str
    total: int
    hits: list[SearchHitOut]


class AskIn(BaseModel):
    question: str
    seed: Optional[str] = None
    limit: int = 8
    allowActions: bool = True
    threadId: Optional[str] = None
    # Note ids the user consented to share for this turn.
    noteIds: list[str] = []
    # Action payloads the user explicitly confirmed (e.g. delete_note).
    confirmedActions: list[dict] = []


class AskHistoryTurn(BaseModel):
    role: str
    content: str


class AskPendingActionOut(BaseModel):
    type: str
    noteId: Optional[str] = None
    title: Optional[str] = None
    section: Optional[str] = None
    message: str = ""


class AskLocusOut(BaseModel):
    workId: str
    locusId: str
    label: str


class AskResourceOut(BaseModel):
    locus: AskLocusOut
    reason: str


class AskCitationOut(BaseModel):
    locus: AskLocusOut
    snippet: str


class AskRecommendationOut(BaseModel):
    catalogId: str
    title: str
    author: str
    inLibrary: bool
    workId: Optional[str] = None
    reason: str = ""
    # Optional chapter / question within an imported work (e.g. Summa Q. 2).
    sectionId: Optional[str] = None
    sectionTitle: Optional[str] = None


class AskActionTakenOut(BaseModel):
    type: str
    noteId: Optional[str] = None
    title: Optional[str] = None
    message: str = ""


class AskOut(BaseModel):
    answer: str
    resources: list[AskResourceOut] = []
    citations: list[AskCitationOut] = []
    bullets: list[str] = []
    recommendations: list[AskRecommendationOut] = []
    actionsTaken: list[AskActionTakenOut] = []
    pendingActions: list[AskPendingActionOut] = []
    threadId: Optional[str] = None


class AskThreadOut(BaseModel):
    id: str
    title: str
    createdAt: str
    updatedAt: str


class AskThreadIn(BaseModel):
    title: Optional[str] = None


class AskThreadUpdate(BaseModel):
    title: str


class AskMessageOut(BaseModel):
    id: str
    threadId: str
    role: str
    content: str
    response: Optional[dict] = None
    createdAt: str


class ReadingRefOut(BaseModel):
    type: str
    reference: str
    label: str
    sectionId: Optional[str] = None
    focusLocusId: Optional[str] = None
    verseStart: Optional[int] = None
    verseEnd: Optional[int] = None
    verses: list[int] = []


class ReadingsOut(BaseModel):
    date: str
    celebration: str
    season: str = ""
    source: str = ""
    error: Optional[str] = None
    readings: list[ReadingRefOut] = []


class PrayerOut(BaseModel):
    id: str
    title: str
    subtitle: str = ""
    kind: str
    sort: int = 0
    body: Optional[str] = None


class CatalogWorkOut(BaseModel):
    id: str
    title: str
    author: str
    category: str
    topics: list[str] = []
    summary: str = ""
    sourceUrl: Optional[str] = None
    rights: str = ""
    rightsHint: str = ""
    inLibrary: bool = False
    workId: Optional[str] = None
    downloadable: bool = False


class CatalogImportOut(BaseModel):
    ok: bool
    workId: str
    title: str
    message: str = ""


class NoteOut(BaseModel):
    id: str
    title: str
    section: str
    body: str
    createdAt: str
    updatedAt: str


class NoteIn(BaseModel):
    title: str = "Untitled"
    section: str = "personal"
    body: str = ""


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    section: Optional[str] = None
    body: Optional[str] = None


class HighlightOut(BaseModel):
    id: str
    workId: str
    paragraphId: str
    locusId: str
    color: str
    createdAt: str


class HighlightIn(BaseModel):
    workId: str
    paragraphId: str
    locusId: str
    color: str = "amber"


class BookmarkOut(BaseModel):
    id: str
    workId: str
    scope: str = ""
    sectionId: str = ""
    paragraphId: str
    locusId: str
    label: str
    note: str = ""
    createdAt: str


class BookmarkIn(BaseModel):
    workId: str
    paragraphId: str
    locusId: str
    sectionId: str = ""
    scope: str = ""
    label: str = ""
    note: str = ""


SectionOut.model_rebuild()
