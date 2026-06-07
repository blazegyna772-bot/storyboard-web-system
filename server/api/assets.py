from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

from server.assets.models import AssetImageGenerateRequest, AssetReviewBundle
from server.assets.service import delete_asset_candidate_image, extract_character_records, extract_prop_records, extract_scene_records, generate_asset_image, get_asset_image_path, read_asset_bundle, select_asset_image_and_confirm, store_asset_image, write_asset_bundle
from server.image_providers.service import ImageProviderError
from server.projects.service import require_active_root

router = APIRouter(prefix="/api/projects/{project_id}/assets", tags=["assets"])


class AssetImageUploadBody(BaseModel):
    kind: str
    assetId: str
    filename: str
    dataUrl: str


class AssetImageSelectBody(BaseModel):
    kind: str
    assetId: str
    sourcePath: str


class AssetImageDeleteBody(BaseModel):
    sourcePath: str


@router.get("")
async def get_project_assets(project_id: str):
    try:
        root = require_active_root()
        return read_asset_bundle(root, project_id).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.put("")
async def save_project_assets(project_id: str, bundle: AssetReviewBundle):
    try:
        root = require_active_root()
        return write_asset_bundle(root, project_id, bundle).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/extract/characters")
async def extract_project_characters(project_id: str):
    try:
        root = require_active_root()
        return (await extract_character_records(root, project_id)).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/extract/scenes")
async def extract_project_scenes(project_id: str):
    try:
        root = require_active_root()
        return (await extract_scene_records(root, project_id)).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/extract/props")
async def extract_project_props(project_id: str):
    try:
        root = require_active_root()
        return (await extract_prop_records(root, project_id)).model_dump()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/images")
async def upload_project_asset_image(project_id: str, body: AssetImageUploadBody):
    try:
        root = require_active_root()
        return store_asset_image(root, project_id, body.kind, body.assetId, body.filename, body.dataUrl)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/images/select")
async def select_project_asset_image(project_id: str, body: AssetImageSelectBody):
    try:
        root = require_active_root()
        return select_asset_image_and_confirm(root, project_id, body.kind, body.assetId, body.sourcePath)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image not found")


@router.post("/images/delete-candidate")
async def delete_project_asset_candidate_image(project_id: str, body: AssetImageDeleteBody):
    try:
        root = require_active_root()
        return delete_asset_candidate_image(root, project_id, body.sourcePath)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image not found")


@router.post("/images/generate")
async def generate_project_asset_image(project_id: str, body: AssetImageGenerateRequest):
    try:
        root = require_active_root()
        return await generate_asset_image(root, project_id, body.kind, body.assetId, body.prompt)
    except ImageProviderError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.get("/images/{bucket}/{kind}/{filename}")
async def get_project_asset_image(project_id: str, bucket: str, kind: str, filename: str):
    try:
        root = require_active_root()
        return FileResponse(get_asset_image_path(root, project_id, bucket, kind, filename))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Image not found")

