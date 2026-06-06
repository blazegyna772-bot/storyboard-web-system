from __future__ import annotations

from fastapi import APIRouter

from server.llm.models import LlmChatRequest
from server.llm.service import call_openai_compatible

router = APIRouter(prefix="/api/llm", tags=["llm"])


@router.post("/chat")
async def chat(payload: LlmChatRequest):
    return await call_openai_compatible(payload)

