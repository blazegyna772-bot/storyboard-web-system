from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


WorkflowNodeId = Literal[
    "story_map",
    "character_summary",
    "continuity",
    "series_summary",
    "chapter_summary",
    "episode_summary",
    "scene_summary",
    "storyboard_design",
    "video_prompt",
]


class WorkflowNode(BaseModel):
    id: WorkflowNodeId
    title: str
    page: Literal["planning", "storyboard", "video"]
    scope: str
    inputSummary: str
    outputSummary: str
    promptPath: str
    dependsOn: list[WorkflowNodeId] = Field(default_factory=list)


class WorkflowArtifact(BaseModel):
    nodeId: WorkflowNodeId
    title: str
    status: Literal["idle", "running", "done", "error"] = "idle"
    updatedAt: str = ""
    inputSummary: str = ""
    output: dict[str, Any] = Field(default_factory=dict)
    rawText: str = ""
    error: str = ""


class WorkflowSceneRef(BaseModel):
    sceneId: str
    title: str


class WorkflowEpisodeRef(BaseModel):
    episodeId: str
    title: str
    scenes: list[WorkflowSceneRef] = Field(default_factory=list)


class WorkflowState(BaseModel):
    projectId: str
    nodes: list[WorkflowNode]
    episodes: list[WorkflowEpisodeRef] = Field(default_factory=list)
    artifacts: dict[str, WorkflowArtifact] = Field(default_factory=dict)


class RunWorkflowNodeBody(BaseModel):
    nodeId: WorkflowNodeId
    episodeId: str | None = None
    sceneId: str | None = None
    chapterId: str | None = None
    maxTokens: int | None = None


class RunWorkflowAllBody(BaseModel):
    nodeIds: list[WorkflowNodeId] = Field(default_factory=list)
    episodeId: str | None = None
    sceneId: str | None = None
    chapterId: str | None = None
    chapterIds: list[str] = Field(default_factory=list)
    maxTokens: int | None = None


class UpdateWorkflowArtifactBody(BaseModel):
    output: dict[str, Any] = Field(default_factory=dict)
    rawText: str = ""
    chapterId: str | None = None
