from __future__ import annotations

from pydantic import BaseModel, Field


class RulepackPrompt(BaseModel):
    id: str
    name: str
    stage: str
    path: str
    variables: list[str] = Field(default_factory=list)
    source: str = "official"
    readonly: bool = True
    activeVersionId: str = ""


class Rulepack(BaseModel):
    id: str
    name: str
    path: str
    prompts: list[RulepackPrompt] = Field(default_factory=list)


class PromptVersion(BaseModel):
    id: str
    promptId: str
    name: str
    description: str = ""
    content: str
    source: str = "user"
    readonly: bool = False
    variables: list[str] = Field(default_factory=list)
    createdAt: str = ""
    updatedAt: str = ""


class PromptTemplateGroup(BaseModel):
    prompt: RulepackPrompt
    official: PromptVersion
    userVersions: list[PromptVersion] = Field(default_factory=list)
    activeVersionId: str


class PromptLibrary(BaseModel):
    groups: list[PromptTemplateGroup] = Field(default_factory=list)
