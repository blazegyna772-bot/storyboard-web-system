from __future__ import annotations

from fastapi import APIRouter, HTTPException

from server.rulepacks.service import list_rulepacks, read_prompt

router = APIRouter(prefix="/api/rulepacks", tags=["rulepacks"])


@router.get("")
async def get_rulepacks():
    return {"rulepacks": [pack.model_dump() for pack in list_rulepacks()]}


@router.get("/prompts/{prompt_id:path}")
async def get_prompt(prompt_id: str):
    try:
        return read_prompt(prompt_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Prompt not found")
