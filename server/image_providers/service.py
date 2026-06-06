from __future__ import annotations

import base64
import asyncio
import re
from typing import Any
from uuid import uuid4

import httpx

from server.image_providers.registry import get_model_catalog
from server.logs.image_service import append_image_log
from server.logs.image_tasks import now_iso, upsert_image_task
from server.settings.service import get_settings


class ImageProviderError(Exception):
    pass


_image_semaphore: asyncio.Semaphore | None = None
_image_semaphore_limit = 0


def get_image_semaphore(limit: int) -> asyncio.Semaphore:
    global _image_semaphore, _image_semaphore_limit
    normalized = max(1, min(int(limit), 8))
    if _image_semaphore is None or _image_semaphore_limit != normalized:
        _image_semaphore = asyncio.Semaphore(normalized)
        _image_semaphore_limit = normalized
    return _image_semaphore


async def generate_image_bytes(prompt: str, reference_images: list[dict[str, str]] | None = None) -> list[dict[str, Any]]:
    task_id = f"IMG-{uuid4().hex[:10]}"
    settings = get_settings().image
    if not settings.apiKey.strip():
        raise ImageProviderError("生图 API Key 未配置")
    model = get_model_catalog(settings.provider, settings.model)
    if not model:
        raise ImageProviderError(f"未找到模型配置: {settings.provider}/{settings.model}")
    base_url = (settings.runtimeBaseUrl or settings.baseUrl).rstrip("/")
    protocol = model.get("protocol")
    started_at = now_iso()
    upsert_image_task({
        "taskId": task_id,
        "category": "image",
        "type": "生图任务",
        "status": "running",
        "provider": settings.provider,
        "model": settings.model,
        "baseUrl": base_url,
        "protocol": protocol,
        "promptPreview": prompt[:800],
        "startedAt": started_at,
        "endedAt": "",
        "message": "生图任务执行中",
    })
    append_image_log({
        "taskId": task_id,
        "level": "info",
        "message": "开始生图调用",
        "provider": settings.provider,
        "model": settings.model,
        "baseUrl": base_url,
        "protocol": protocol,
        "promptPreview": prompt[:800],
    })
    semaphore = get_image_semaphore(get_settings().general.imageConcurrency)
    try:
        async with semaphore:
            return await execute_image_generation(task_id, settings, base_url, protocol, prompt)
    except Exception as exc:
        upsert_image_task({
            "taskId": task_id,
            "status": "error",
            "endedAt": now_iso(),
            "message": str(exc),
        })
        raise


async def execute_image_generation(task_id: str, settings: Any, base_url: str, protocol: str, prompt: str) -> list[dict[str, Any]]:
    try:
        if protocol == "gemini-generate-content":
            results = await call_gemini_generate_content(task_id, base_url, settings.apiKey, settings.model, prompt, settings.aspectRatio, settings.imageSize, settings.requestTimeout)
        elif protocol == "openai-images":
            results = await call_openai_images(task_id, base_url, settings.apiKey, settings.model, prompt, settings.size, settings.requestTimeout)
        else:
            raise ImageProviderError(f"暂不支持的生图协议: {protocol}")
        images = await materialize_provider_images(results, settings.downloadTimeout)
        for image in images:
            image["taskId"] = task_id
        ended_at = now_iso()
        upsert_image_task({
            "taskId": task_id,
            "status": "success",
            "endedAt": ended_at,
            "imageCount": len(images),
            "message": "生图任务成功",
        })
        append_image_log({
            "taskId": task_id,
            "level": "success",
            "message": "生图调用完成",
            "provider": settings.provider,
            "model": settings.model,
            "imageCount": len(images),
        })
        return images
    except Exception as exc:
        raise


async def call_openai_images(task_id: str, base_url: str, api_key: str, model: str, prompt: str, size: str, timeout: int) -> list[dict[str, Any]]:
    url = f"{base_url}/v1/images/generations"
    payload = {
        "model": model,
        "prompt": prompt,
        "n": 1,
        "size": size,
        "quality": "high",
        "response_format": "url",
    }
    data = await post_json(task_id, url, api_key, payload, timeout)
    items = data.get("data")
    if not isinstance(items, list) or not items:
        raise ImageProviderError("API 未返回有效图片结果")
    return [item for item in items if isinstance(item, dict)]


async def call_gemini_generate_content(task_id: str, base_url: str, api_key: str, model: str, prompt: str, aspect_ratio: str, image_size: str, timeout: int) -> list[dict[str, Any]]:
    url = f"{base_url}/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseModalities": ["IMAGE", "TEXT"],
            "temperature": 1.0,
            "topP": 0.95,
            "maxOutputTokens": 8192,
            "imageConfig": {
                "aspectRatio": aspect_ratio,
                "imageSize": image_size or "1K",
            },
        },
    }
    data = await post_json(task_id, url, api_key, payload, timeout)
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    if not isinstance(parts, list) or not parts:
        raise ImageProviderError("Gemini 响应未包含图片候选")
    return [part for part in parts if isinstance(part, dict)]


async def post_json(task_id: str, url: str, api_key: str, payload: dict[str, Any], timeout: int) -> dict[str, Any]:
    safe_payload = mask_large_image_fields(payload)
    append_image_log({
        "taskId": task_id,
        "level": "info",
        "message": "发送生图请求",
        "url": url,
        "payload": safe_payload,
    })
    async with httpx.AsyncClient(timeout=max(timeout, 30)) as client:
        response = await client.post(
            url,
            json=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        )
    if response.status_code >= 400:
        append_image_log({
            "taskId": task_id,
            "level": "error",
            "message": "生图接口返回错误",
            "url": url,
            "statusCode": response.status_code,
            "detail": response.text[:1200],
        })
        raise ImageProviderError(f"生图接口错误 HTTP {response.status_code}: {response.text[:500]}")
    try:
        return response.json()
    except ValueError as exc:
        raise ImageProviderError("生图接口响应不是 JSON") from exc


async def materialize_provider_images(results: list[dict[str, Any]], download_timeout: int) -> list[dict[str, Any]]:
    images: list[dict[str, Any]] = []
    for result in results:
        for item in extract_image_sources(result):
            if item["type"] == "url":
                data = await download_image(item["value"], download_timeout)
                images.append({"bytes": data, "sourceUrl": item["value"], "mimeType": detect_mime_from_bytes(data)})
            else:
                decoded = decode_base64_image(item["value"])
                images.append({"bytes": decoded, "sourceUrl": "", "mimeType": detect_mime_from_bytes(decoded)})
    if not images:
        raise ImageProviderError("生图响应中未解析到图片")
    return images


def extract_image_sources(result: dict[str, Any]) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    if result.get("url"):
        sources.append({"type": "url", "value": str(result["url"])})
    if result.get("b64_json"):
        sources.append({"type": "base64", "value": str(result["b64_json"])})
    inline = result.get("inlineData") or result.get("inline_data")
    if isinstance(inline, dict) and inline.get("data"):
        value = str(inline["data"])
        sources.append({"type": "url" if value.startswith(("http://", "https://")) else "base64", "value": value})
    text = result.get("text")
    if isinstance(text, str):
        sources.extend(extract_sources_from_text(text))
    return sources


def extract_sources_from_text(text: str) -> list[dict[str, str]]:
    sources: list[dict[str, str]] = []
    for match in re.finditer(r"data:image/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=]+)", text):
        sources.append({"type": "base64", "value": match.group(1)})
    for match in re.finditer(r"!\[[^\]]*\]\((https?://[^)]+)\)", text):
        sources.append({"type": "url", "value": match.group(1)})
    return sources


async def download_image(url: str, timeout: int) -> bytes:
    async with httpx.AsyncClient(timeout=max(timeout, 30), follow_redirects=True) as client:
        response = await client.get(url, headers={"Accept": "image/*,*/*;q=0.8", "User-Agent": "ScriptStoryboardSystem/0.1"})
    if response.status_code >= 400:
        raise ImageProviderError(f"图片下载失败 HTTP {response.status_code}")
    return response.content


def decode_base64_image(value: str) -> bytes:
    if "," in value and value.strip().startswith("data:"):
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value)
    except ValueError as exc:
        raise ImageProviderError("图片 base64 解码失败") from exc


def detect_mime_from_bytes(data: bytes) -> str:
    if data.startswith(b"\x89PNG"):
        return "image/png"
    if data.startswith(b"RIFF") and b"WEBP" in data[:16]:
        return "image/webp"
    return "image/jpeg"


def mask_large_image_fields(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: ("<image-data>" if key in {"image", "inlineData", "inline_data"} else mask_large_image_fields(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [mask_large_image_fields(item) for item in value]
    if isinstance(value, str) and len(value) > 1000:
        return value[:1000] + "...<truncated>"
    return value
