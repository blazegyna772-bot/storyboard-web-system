from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class BackendRoot(BaseModel):
    rootName: str
    rootPath: str
    isActive: bool


class RootState(BaseModel):
    roots: list[BackendRoot]
    activeRootPath: str = ""


class AnalysisOptions(BaseModel):
    genreProfile: str = ""
    directorProfile: str = ""
    targetShotSeconds: int = 15
    aspectRatio: str = "9:16"
    contentType: str = "短剧"

    model_config = {"extra": "allow"}


class StoryboardProject(BaseModel):
    projectId: str
    name: str
    folderName: str | None = None
    rootName: str | None = None
    updatedAt: str
    script: str = ""
    options: dict[str, Any] = Field(default_factory=dict)
    analysis: dict[str, Any] = Field(default_factory=dict)
    latestRun: dict[str, Any] | None = None
    artifacts: list[dict[str, Any]] = Field(default_factory=list)
    locks: list[dict[str, Any]] = Field(default_factory=list)
    tasks: list[dict[str, Any]] = Field(default_factory=list)
    imageCandidates: list[dict[str, Any]] = Field(default_factory=list)

    model_config = {"extra": "allow"}
