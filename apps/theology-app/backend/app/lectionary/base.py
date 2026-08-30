"""Lectionary provider interface and normalized reading shapes."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional, Protocol


@dataclass
class NormalizedReading:
    type: str  # first_reading | responsorial | second_reading | gospel | alleluia | ...
    reference: str
    label: str = ""


@dataclass
class NormalizedDay:
    date: str  # YYYY-MM-DD
    celebration: str = ""
    season: str = ""
    readings: list[NormalizedReading] = field(default_factory=list)
    source: str = ""
    error: Optional[str] = None


class LectionaryProvider(Protocol):
    name: str

    def fetch(self, date: str) -> NormalizedDay: ...
