from __future__ import annotations

from fastapi import APIRouter, HTTPException

from server.story_workflow.models import RunWorkflowAllBody, RunWorkflowNodeBody, UpdateWorkflowArtifactBody
from server.story_workflow.service import get_workflow_artifact, get_workflow_state, run_workflow_all, run_workflow_node, update_workflow_artifact

router = APIRouter(prefix="/api/story-workflow", tags=["story-workflow"])


@router.get("/{project_id}")
async def get_state(project_id: str):
    try:
        return get_workflow_state(project_id).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/{project_id}/artifacts/{node_id}")
async def get_artifact(
    project_id: str,
    node_id: str,
    chapterId: str | None = None,
    episodeId: str | None = None,
    sceneId: str | None = None,
):
    try:
        artifact = get_workflow_artifact(project_id, node_id, chapterId, episodeId, sceneId)
        return {"artifact": artifact.model_dump() if artifact else None}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/{project_id}/run")
async def run_node(project_id: str, body: RunWorkflowNodeBody):
    try:
        return {"artifact": (await run_workflow_node(project_id, body)).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/{project_id}/run-all")
async def run_all(project_id: str, body: RunWorkflowAllBody):
    try:
        return {"artifacts": [artifact.model_dump() for artifact in await run_workflow_all(project_id, body)]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.put("/{project_id}/artifacts/{node_id}")
async def save_artifact(project_id: str, node_id: str, body: UpdateWorkflowArtifactBody):
    try:
        return {"artifact": update_workflow_artifact(project_id, node_id, body).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
