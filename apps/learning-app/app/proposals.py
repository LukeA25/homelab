"""Structures the voice tutor can save. Review drafts are not part of the learning loop."""
from typing import Literal

from pydantic import Field

from .recap import Strict


class IdeaDraft(Strict):
    title: str = Field(default='', max_length=150)
    idea: str = Field(default='', max_length=4000)
    why: str = Field(default='', max_length=4000)
    direction: str = Field(default='', max_length=2000)
    starting_point: str = Field(default='', max_length=4000)
    source: str = Field(default='', max_length=8000)
    suggestion: str = Field(default='', max_length=2000)


class IdeaBatch(Strict):
    ideas: list[IdeaDraft] = Field(min_length=1, max_length=20)


class PreferenceDraft(Strict):
    text: str = Field(min_length=1, max_length=240)


class PathDraft(Strict):
    title: str = Field(default='', max_length=150)
    category: str = Field(default='', max_length=150)
    goal: str = Field(default='', max_length=2000)
    depth: str = Field(default='Conversational fluency', max_length=150)
    excludes: str = Field(default='', max_length=2000)
    outcomes: list[str] = Field(default_factory=list, max_length=20)
    concepts: list[str] = Field(default_factory=list, max_length=30)
    idea_id: str | None = None


class ConceptIn(Strict):
    title: str = Field(min_length=1, max_length=150)
    objectives: list[str] = Field(min_length=1, max_length=12)
    teaching_notes: str = Field(default='', max_length=4000)
    requires: list[str] = Field(default_factory=list, max_length=8)
    knowledge_id: str | None = None
    summary: str = Field(default='', max_length=2000)


class PathCreate(Strict):
    title: str = Field(min_length=1, max_length=150)
    category: str = Field(min_length=1, max_length=150)
    goal: str = Field(min_length=1, max_length=2000)
    depth: str = Field(min_length=1, max_length=150)
    excludes: str = Field(default='', max_length=2000)
    outcomes: list[str] = Field(min_length=1, max_length=20)
    concepts: list[ConceptIn] = Field(min_length=1, max_length=30)


class ConceptPatch(Strict):
    id: str | None = None
    title: str | None = Field(default=None, max_length=150)
    objectives: list[str] | None = Field(default=None, max_length=12)
    teaching_notes: str | None = Field(default=None, max_length=4000)
    requires: list[str] | None = Field(default=None, max_length=8)
    knowledge_id: str | None = None
    summary: str | None = Field(default=None, max_length=2000)
    delete: bool = False


class TreePatch(Strict):
    status: Literal['active', 'paused', 'planned', 'completed'] | None = None
    title: str | None = Field(default=None, max_length=150)
    category: str | None = Field(default=None, max_length=150)
    goal: str | None = Field(default=None, max_length=2000)
    depth: str | None = Field(default=None, max_length=150)
    excludes: str | None = Field(default=None, max_length=2000)
    outcomes: list[str] | None = Field(default=None, max_length=20)
    concepts: list[ConceptPatch] | None = Field(default=None, max_length=30)


class CloseTopic(Strict):
    concept_id: str | None = None
    knowledge_id: str | None = None
    summary: str = Field(default='', max_length=8000)
    evidence: str = Field(default='', max_length=8000)
    confidence: str = Field(default='Not assessed', max_length=100)
    state: Literal['introduced', 'developing', 'understood', 'needs-review']


class CloseSession(Strict):
    topics: list[CloseTopic] = Field(min_length=1, max_length=30)
    questions: list[str] = Field(default_factory=list, max_length=30)
    path: TreePatch | None = None


class KnowledgeQuery(Strict):
    query: str = Field(default='', max_length=200)
    subject: str = Field(default='', max_length=150)
