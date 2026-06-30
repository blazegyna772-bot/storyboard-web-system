from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from server.core.config import LLM_LOG_FILE
from server.storage.json_io import read_json, write_json

MAX_LLM_LOGS = 300


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_llm_logs(limit: int = 100) -> list[dict[str, Any]]:
    logs = read_json(LLM_LOG_FILE, [])
    if not isinstance(logs, list):
        return []
    return [summarize_llm_log(log) for log in logs[: max(1, min(limit, MAX_LLM_LOGS))]]


def get_llm_log(log_id: str) -> dict[str, Any] | None:
    logs = read_json(LLM_LOG_FILE, [])
    if not isinstance(logs, list):
        return None
    for log in logs:
        if isinstance(log, dict) and log.get("id") == log_id:
            return log
    return None


def append_llm_log(entry: dict[str, Any]) -> dict[str, Any]:
    logs = read_json(LLM_LOG_FILE, [])
    if not isinstance(logs, list):
        logs = []
    next_entry = {
        "id": entry.get("id") or f"LLM-{uuid4().hex[:10]}",
        "time": entry.get("time") or now_iso(),
        **entry,
    }
    write_json(LLM_LOG_FILE, [next_entry, *logs][:MAX_LLM_LOGS])
    return next_entry


def clear_llm_logs() -> None:
    write_json(LLM_LOG_FILE, [])


def summarize_llm_log(log: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(log, dict):
        return {}
    summary = dict(log)
    if "messages" in summary:
        summary["messagesPreview"] = [
            {
                "role": message.get("role"),
                "chars": len(message.get("content", "")),
                "preview": message.get("content", "")[:600],
            }
            for message in summary.get("messages", [])
            if isinstance(message, dict)
        ]
        summary.pop("messages", None)
    if "responseText" in summary:
        summary["responseChars"] = len(summary.get("responseText", ""))
        summary.pop("responseText", None)
    if "responseJson" in summary:
        summary.pop("responseJson", None)
    return summary
