from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant"]
    content: str


class LlmChatRequest(BaseModel):
    provider: str | None = None
    model: str | None = None
    baseUrl: str | None = None
    apiKey: str | None = None
    temperature: float | None = None
    jsonMode: bool | None = None
    maxTokens: int | None = None
    stageId: str | None = None
    label: str | None = None
    promptId: str | None = None
    messages: list[ChatMessage] = Field(default_factory=list)


class LlmChatError(BaseModel):
    error: str
    detail: Any | None = None

