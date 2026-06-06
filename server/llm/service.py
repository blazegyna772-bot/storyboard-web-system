from __future__ import annotations

import time
from typing import Any

from fastapi import HTTPException

from server.llm.models import LlmChatRequest
from server.logs.service import append_llm_log
from server.settings.service import get_settings


async def call_openai_compatible(request: LlmChatRequest) -> dict[str, Any]:
    import httpx

    settings = get_settings().llm
    base_url = (request.baseUrl or settings.baseUrl or "https://api.deepseek.com").rstrip("/")
    api_key = request.apiKey or settings.apiKey
    model = request.model or settings.model
    temperature = request.temperature if request.temperature is not None else settings.temperature
    json_mode = request.jsonMode if request.jsonMode is not None else settings.jsonMode
    max_tokens = request.maxTokens or 6000
    label = request.label or request.stageId or "llm-chat"
    started = time.perf_counter()

    if not api_key.strip():
        append_llm_log({
            "level": "error",
            "stageId": request.stageId,
            "label": label,
            "model": model,
            "baseUrl": base_url,
            "durationMs": 0,
            "message": "缺少 API Key",
        })
        raise HTTPException(status_code=400, detail="Missing API key")
    if not request.messages:
        raise HTTPException(status_code=400, detail="Missing messages")

    payload: dict[str, Any] = {
        "model": model,
        "messages": [message.model_dump() for message in request.messages],
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                json=payload,
            )
    except Exception as error:
        duration = round((time.perf_counter() - started) * 1000)
        append_llm_log({
            "level": "error",
            "stageId": request.stageId,
            "label": label,
            "promptId": request.promptId,
            "model": model,
            "baseUrl": base_url,
            "durationMs": duration,
            "message": "LLM 请求异常",
            "detail": str(error),
        })
        raise HTTPException(status_code=502, detail=str(error)) from error

    duration = round((time.perf_counter() - started) * 1000)
    text = response.text
    response_json = None
    if response.is_success:
        try:
            response_json = response.json()
        except Exception:
            response_json = None
    append_llm_log({
        "level": "success" if response.is_success else "error",
        "stageId": request.stageId,
        "label": label,
        "promptId": request.promptId,
        "model": model,
        "baseUrl": base_url,
        "statusCode": response.status_code,
        "durationMs": duration,
        "message": "LLM 调用完成" if response.is_success else "LLM 调用失败",
        "request": {
            "messageCount": len(request.messages),
            "systemChars": sum(len(item.content) for item in request.messages if item.role == "system"),
            "userChars": sum(len(item.content) for item in request.messages if item.role == "user"),
            "jsonMode": json_mode,
            "maxTokens": max_tokens,
            "temperature": temperature,
        },
        "messages": payload["messages"],
        "responsePreview": text[:1200],
        "responseText": text,
        "responseJson": response_json,
    })
    if not response.is_success:
        raise HTTPException(status_code=response.status_code, detail=text[:2000])
    return response_json if response_json is not None else response.json()
