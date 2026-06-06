from __future__ import annotations

from fastapi import APIRouter, HTTPException

from server.system.dialogs import pick_directory

router = APIRouter(prefix="/api/system", tags=["system"])


@router.post("/pick-directory")
async def post_pick_directory():
    try:
        return {"rootPath": pick_directory()}
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
