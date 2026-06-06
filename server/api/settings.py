from __future__ import annotations

from fastapi import APIRouter

from server.image_providers.registry import list_provider_catalogs
from server.settings.service import get_image_api_key, get_llm_api_key, public_settings, save_general_settings, save_image_settings, save_llm_settings

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("")
async def get_app_settings():
    return public_settings().model_dump()


@router.put("/llm")
async def put_llm_settings(payload: dict):
    return save_llm_settings(payload).model_dump()


@router.put("/general")
async def put_general_settings(payload: dict):
    return save_general_settings(payload).model_dump()


@router.get("/image-providers")
async def get_image_provider_catalogs():
    return {"providers": list_provider_catalogs()}


@router.put("/image")
async def put_image_settings(payload: dict):
    return save_image_settings(payload).model_dump()


@router.get("/image/key")
async def get_image_key():
    return {"apiKey": get_image_api_key()}


@router.get("/llm/key")
async def get_llm_key():
    return {"apiKey": get_llm_api_key()}
