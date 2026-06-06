from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AssetReviewBundle(BaseModel):
    records: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)
    trueSources: dict[str, list[dict[str, Any]]] = Field(default_factory=dict)


class AssetImageGenerateRequest(BaseModel):
    kind: str
    assetId: str
    prompt: str
