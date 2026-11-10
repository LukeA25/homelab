from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class Topic(Strict):
    concept_id: str
    summary: str = Field(max_length=8000)
    evidence: str = Field(max_length=8000)
    confidence: str = Field(max_length=100)
    state: Literal['introduced','developing','understood','needs-review']

class Recap(Strict):
    schema_version: Literal['0.1']
    session_id: str
    tree_id: str
    topics: list[Topic] = Field(min_length=1,max_length=30)
    questions: list[str] = Field(default_factory=list,max_length=30)

