from __future__ import annotations

from fastapi import APIRouter, HTTPException

from server.logs.image_service import clear_image_logs, get_image_log, list_image_logs
from server.logs.image_tasks import clear_image_tasks, list_image_tasks
from server.logs.service import clear_llm_logs, get_llm_log, list_llm_logs

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("/llm")
async def get_llm_logs(limit: int = 100):
    return {"logs": list_llm_logs(limit)}


@router.get("/llm/{log_id}")
async def get_llm_log_detail(log_id: str):
    log = get_llm_log(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return {"log": log}


@router.delete("/llm")
async def delete_llm_logs():
    clear_llm_logs()
    return {"ok": True}


@router.get("/image")
async def get_image_logs(limit: int = 100):
    return {"logs": list_image_logs(limit)}


@router.get("/image/tasks")
async def get_image_tasks(limit: int = 100):
    return {"tasks": list_image_tasks(limit)}


@router.get("/image/{log_id}")
async def get_image_log_detail(log_id: str):
    log = get_image_log(log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Log not found")
    return {"log": log}


@router.delete("/image")
async def delete_image_logs():
    clear_image_logs()
    clear_image_tasks()
    return {"ok": True}
