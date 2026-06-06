from __future__ import annotations

from typing import Any

from server.core.config import bundled_providerpacks_dir
from server.storage.json_io import read_json


def list_provider_catalogs() -> list[dict[str, Any]]:
    image_dir = bundled_providerpacks_dir() / "image"
    providers: list[dict[str, Any]] = []
    for path in sorted(image_dir.glob("*.json")):
        data = read_json(path, None)
        if isinstance(data, dict) and data.get("id") and isinstance(data.get("models"), list):
            providers.append(data)
    return providers


def get_provider_catalog(provider_id: str) -> dict[str, Any] | None:
    return next((provider for provider in list_provider_catalogs() if provider["id"] == provider_id), None)


def get_model_catalog(provider_id: str, model_id: str) -> dict[str, Any] | None:
    provider = get_provider_catalog(provider_id)
    if not provider:
        return None
    return next((model for model in provider["models"] if model["id"] == model_id), None)
