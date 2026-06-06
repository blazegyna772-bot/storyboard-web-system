from __future__ import annotations

from pydantic import BaseModel, Field


class RulepackPrompt(BaseModel):
    id: str
    name: str
    stage: str
    path: str
    variables: list[str] = Field(default_factory=list)


class Rulepack(BaseModel):
    id: str
    name: str
    path: str
    prompts: list[RulepackPrompt] = Field(default_factory=list)
