from __future__ import annotations

from fastapi import APIRouter, HTTPException

from server.rulepacks.service import (
    activate_prompt_version,
    create_prompt_version,
    delete_prompt_version,
    list_prompt_library,
    list_rulepacks,
    read_prompt,
    update_prompt_version,
)

router = APIRouter(prefix="/api/rulepacks", tags=["rulepacks"])


@router.get("")
async def get_rulepacks():
    return {"rulepacks": [pack.model_dump() for pack in list_rulepacks()]}


@router.get("/library")
async def get_prompt_library():
    return list_prompt_library().model_dump()


@router.get("/prompts/{prompt_id:path}")
async def get_prompt(prompt_id: str):
    try:
        return read_prompt(prompt_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt not found")


@router.post("/versions")
async def post_prompt_version(payload: dict):
    try:
        return {"version": create_prompt_version(payload).model_dump(), "library": list_prompt_library().model_dump()}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt not found")


@router.put("/versions/{version_id}")
async def put_prompt_version(version_id: str, payload: dict):
    try:
        return {"version": update_prompt_version(version_id, payload).model_dump(), "library": list_prompt_library().model_dump()}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt version not found")


@router.delete("/versions/{version_id}")
async def remove_prompt_version(version_id: str):
    try:
        delete_prompt_version(version_id)
        return {"ok": True, "library": list_prompt_library().model_dump()}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt version not found")


@router.put("/prompts/active")
async def put_active_prompt_version_by_body(payload: dict):
    try:
        version = activate_prompt_version(str(payload.get("promptId") or ""), str(payload.get("versionId") or ""))
        return {"version": version.model_dump(), "library": list_prompt_library().model_dump()}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt or version not found")


@router.put("/prompts/{prompt_id:path}/active")
async def put_active_prompt_version(prompt_id: str, payload: dict):
    try:
        version = activate_prompt_version(prompt_id, str(payload.get("versionId") or ""))
        return {"version": version.model_dump(), "library": list_prompt_library().model_dump()}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt or version not found")
