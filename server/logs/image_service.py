from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from server.core.config import IMAGE_LOG_FILE
from server.storage.json_io import read_json, write_json

MAX_IMAGE_LOGS = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def append_image_log(entry: dict[str, Any]) -> dict[str, Any]:
    logs = read_json(IMAGE_LOG_FILE, [])
    if not isinstance(logs, list):
        logs = []
    next_entry = {
        "id": entry.get("id") or f"IMGLOG-{uuid4().hex[:10]}",
        "time": entry.get("time") or now_iso(),
        **entry,
    }
    write_json(IMAGE_LOG_FILE, [next_entry, *logs][:MAX_IMAGE_LOGS])
    return next_entry


def list_image_logs(limit: int = 100) -> list[dict[str, Any]]:
    logs = read_json(IMAGE_LOG_FILE, [])
    if not isinstance(logs, list):
        return []
    return logs[: max(1, min(limit, MAX_IMAGE_LOGS))]


def get_image_log(log_id: str) -> dict[str, Any] | None:
    logs = read_json(IMAGE_LOG_FILE, [])
    if not isinstance(logs, list):
        return None
    for log in logs:
        if isinstance(log, dict) and log.get("id") == log_id:
            return log
    return None


def clear_image_logs() -> None:
    write_json(IMAGE_LOG_FILE, [])
