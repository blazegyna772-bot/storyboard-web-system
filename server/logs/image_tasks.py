from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from server.core.config import IMAGE_TASK_FILE
from server.storage.json_io import read_json, write_json

MAX_IMAGE_TASKS = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_image_tasks(limit: int = 100) -> list[dict[str, Any]]:
    tasks = read_json(IMAGE_TASK_FILE, [])
    if not isinstance(tasks, list):
        return []
    return tasks[: max(1, min(limit, MAX_IMAGE_TASKS))]


def upsert_image_task(task: dict[str, Any]) -> dict[str, Any]:
    tasks = list_image_tasks(MAX_IMAGE_TASKS)
    task_id = str(task.get("taskId") or "")
    if not task_id:
        raise ValueError("taskId is required")
    existing = next((item for item in tasks if isinstance(item, dict) and item.get("taskId") == task_id), {})
    next_task = {
        **existing,
        **task,
        "updatedAt": task.get("updatedAt") or now_iso(),
    }
    if not next_task.get("startedAt"):
        next_task["startedAt"] = now_iso()
    kept = [item for item in tasks if not (isinstance(item, dict) and item.get("taskId") == task_id)]
    write_json(IMAGE_TASK_FILE, [next_task, *kept][:MAX_IMAGE_TASKS])
    return next_task


def clear_image_tasks() -> None:
    write_json(IMAGE_TASK_FILE, [])
