"""Drafts the voice tutor may propose. Saving happens through separate app routes."""
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
