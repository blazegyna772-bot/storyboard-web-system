from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from server.projects.models import StoryboardProject
from server.projects.service import (
    activate_root,
    add_root,
    create_project_record,
    delete_project,
    get_root_state,
    list_projects,
    read_project,
    remove_root,
    require_active_root,
    write_project,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


class RootBody(BaseModel):
    rootPath: str


class CreateProjectBody(BaseModel):
    name: str = ""
    options: dict = {}


class SaveProjectBody(BaseModel):
    project: StoryboardProject


@router.get("/roots")
async def roots():
    return get_root_state().model_dump()


@router.post("/roots")
async def create_root(body: RootBody):
    return add_root(body.rootPath).model_dump()


@router.post("/roots/active")
async def set_active_root(body: RootBody):
    return activate_root(body.rootPath).model_dump()


@router.post("/roots/remove")
async def delete_root(body: RootBody):
    return remove_root(body.rootPath).model_dump()


@router.get("")
async def projects():
    try:
        root = require_active_root()
        return {"projects": [project.model_dump() for project in list_projects(root)]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("")
async def create_project(body: CreateProjectBody):
    try:
        root = require_active_root()
        project = create_project_record(body.name, body.options)
        return {"project": write_project(root, project).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{project_id}")
async def get_project(project_id: str):
    try:
        root = require_active_root()
        return {"project": read_project(root, project_id, include_script=True).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.put("/{project_id}")
async def save_project(project_id: str, body: SaveProjectBody):
    if body.project.projectId != project_id:
        raise HTTPException(status_code=400, detail="Project id mismatch")
    try:
        root = require_active_root()
        return {"project": write_project(root, body.project).model_dump()}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/{project_id}")
async def remove_project(project_id: str):
    try:
        root = require_active_root()
        delete_project(root, project_id)
        return {"ok": True}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")
