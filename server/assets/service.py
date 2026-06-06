from __future__ import annotations

from pathlib import Path
from typing import Any
import base64
import binascii
import re
import secrets
import shutil
from datetime import datetime, timezone

from server.assets.models import AssetReviewBundle
from server.image_providers.service import generate_image_bytes
from server.logs.image_tasks import upsert_image_task
from server.projects.service import list_projects, project_dir
from server.rulepacks.service import read_prompt
from server.storage.json_io import read_json, write_json
from server.llm.models import ChatMessage, LlmChatRequest
from server.llm.service import call_openai_compatible

ASSET_KINDS = ("characters", "scenes", "props")
ASSET_EXTRACT_CONFIG = {
    "characters": {
        "prompt": "default:asset_extract_characters/prompt.md",
        "stage": "asset_extract_characters",
        "label": "全集角色记录提取",
        "root": "characters",
        "file": "characters_extract.json",
    },
    "scenes": {
        "prompt": "default:asset_extract_scenes/prompt.md",
        "stage": "asset_extract_scenes",
        "label": "全集场景记录提取",
        "root": "scenes",
        "file": "scenes_extract.json",
    },
    "props": {
        "prompt": "default:asset_extract_props/prompt.md",
        "stage": "asset_extract_props",
        "label": "全集道具记录提取",
        "root": "props",
        "file": "props_extract.json",
    },
}


def empty_asset_bundle() -> AssetReviewBundle:
    return AssetReviewBundle(
        records={kind: [] for kind in ASSET_KINDS},
        trueSources={kind: [] for kind in ASSET_KINDS},
    )


def get_project_base(root_path: Path, project_id: str) -> Path:
    for project in list_projects(root_path):
        if project.projectId == project_id:
            return project_dir(root_path, project)
    raise FileNotFoundError("Project not found")


def safe_asset_filename(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|\s]+', "-", value.strip())
    cleaned = re.sub(r"-+", "-", cleaned).strip("-")
    return cleaned or "asset-image"


def read_asset_bundle(root_path: Path, project_id: str) -> AssetReviewBundle:
    base = get_project_base(root_path, project_id)
    bundle = empty_asset_bundle()
    for kind in ASSET_KINDS:
        bundle.records[kind] = _read_list(base / "records" / f"{kind}_extract.json")
        bundle.trueSources[kind] = _read_list(base / "true_sources" / f"{kind}.json")
    return bundle


def write_asset_bundle(root_path: Path, project_id: str, bundle: AssetReviewBundle) -> AssetReviewBundle:
    base = get_project_base(root_path, project_id)
    for kind in ASSET_KINDS:
        write_json(base / "records" / f"{kind}_extract.json", _normalize_list(bundle.records.get(kind)))
        write_json(base / "true_sources" / f"{kind}.json", _normalize_list(bundle.trueSources.get(kind)))
    return read_asset_bundle(root_path, project_id)


def store_asset_image(root_path: Path, project_id: str, kind: str, asset_id: str, filename: str, data_url: str) -> dict[str, str]:
    if kind not in ASSET_KINDS:
        raise ValueError("Unsupported asset kind")
    base = get_project_base(root_path, project_id)
    header, encoded = split_data_url(data_url)
    suffix = Path(filename).suffix.lower() or suffix_from_data_url(header)
    safe_asset_id = safe_asset_filename(asset_id or "asset")
    stored_name = f"{safe_asset_id}_{secrets.token_hex(4)}{suffix}"
    target = base / "assets" / "candidates" / kind / stored_name
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.write_bytes(base64.b64decode(encoded))
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid image data") from exc
    return {
        "id": f"IMG-{secrets.token_hex(4).upper()}",
        "label": Path(filename).stem or "导入图片",
        "url": asset_image_url(project_id, "candidates", kind, stored_name),
        "path": str(target.relative_to(base)),
    }


def store_asset_image_bytes(root_path: Path, project_id: str, kind: str, asset_id: str, filename: str, data: bytes) -> dict[str, str]:
    if kind not in ASSET_KINDS:
        raise ValueError("Unsupported asset kind")
    base = get_project_base(root_path, project_id)
    suffix = Path(filename).suffix.lower() or ".png"
    safe_asset_id = safe_asset_filename(asset_id or "asset")
    stored_name = f"{safe_asset_id}_{secrets.token_hex(4)}{suffix}"
    target = base / "assets" / "candidates" / kind / stored_name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(data)
    return {
        "id": f"IMG-{secrets.token_hex(4).upper()}",
        "label": Path(filename).stem or "生成图片",
        "url": asset_image_url(project_id, "candidates", kind, stored_name),
        "path": str(target.relative_to(base)),
    }


async def generate_asset_image(root_path: Path, project_id: str, kind: str, asset_id: str, prompt: str) -> dict[str, Any]:
    if kind not in ASSET_KINDS:
        raise ValueError("Unsupported asset kind")
    if not asset_id.strip():
        raise ValueError("缺少资产 ID")
    if not prompt.strip():
        raise ValueError("缺少生图提示词")
    base = get_project_base(root_path, project_id)
    images = await generate_image_bytes(prompt.strip())
    candidates = []
    selected = None
    for index, image in enumerate(images):
        suffix = suffix_from_mime(image.get("mimeType", "image/png"))
        stored = store_asset_image_bytes(root_path, project_id, kind, asset_id, f"{asset_id}_generated_{index + 1}{suffix}", image["bytes"])
        candidates.append({
            "id": stored["id"],
            "label": f"生成图 {index + 1}",
            "url": stored["url"],
        })
        if index == 0:
            selected = select_asset_image(root_path, project_id, kind, asset_id, stored["url"])
    if not selected:
        raise ValueError("未生成有效图片")
    task_id = str(images[0].get("taskId") or "") if images else ""
    bundle = read_asset_bundle(root_path, project_id)
    rows = bundle.trueSources.get(kind, [])
    updated_at = datetime.now(timezone.utc).isoformat()
    for row in rows:
        if str(row.get("id") or row.get("name") or "") == asset_id:
            existing = parse_candidate_list(row.get("image_candidates"))
            row["selected_image"] = selected["url"]
            row["image_url"] = selected["url"]
            row["image_path"] = selected["path"]
            row["image_updated_at"] = updated_at
            row["image_candidates"] = json_stringify_candidates((candidates + existing)[:12])
            row["status"] = "confirmed"
            break
    write_json(base / "true_sources" / f"{kind}.json", rows)
    if task_id:
        upsert_image_task({
            "taskId": task_id,
            "selected": selected,
            "candidates": candidates,
            "assetId": asset_id,
            "assetKind": kind,
            "projectId": project_id,
            "message": "生图任务成功，真源图片已更新",
        })
    return {
        "selected": selected,
        "candidates": candidates,
        "bundle": read_asset_bundle(root_path, project_id).model_dump(),
    }


def select_asset_image(root_path: Path, project_id: str, kind: str, asset_id: str, source_path: str) -> dict[str, str]:
    if kind not in ASSET_KINDS:
        raise ValueError("Unsupported asset kind")
    base = get_project_base(root_path, project_id)
    source = resolve_project_asset_path(base, source_path)
    if "candidates" not in source.relative_to(base).parts and "selected" not in source.relative_to(base).parts:
        raise ValueError("Invalid source image path")
    suffix = source.suffix.lower() or ".jpg"
    safe_asset_id = safe_asset_filename(asset_id or source.stem)
    target = base / "assets" / "selected" / kind / f"{safe_asset_id}{suffix}"
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, target)
    return {
        "id": f"SEL-{safe_asset_id}",
        "label": safe_asset_id,
        "url": asset_image_url(project_id, "selected", kind, target.name),
        "path": str(target.relative_to(base)),
    }


def select_asset_image_and_confirm(root_path: Path, project_id: str, kind: str, asset_id: str, source_path: str) -> dict[str, Any]:
    selected = select_asset_image(root_path, project_id, kind, asset_id, source_path)
    bundle = read_asset_bundle(root_path, project_id)
    rows = bundle.trueSources.get(kind, [])
    updated_at = datetime.now(timezone.utc).isoformat()
    for row in rows:
        if str(row.get("id") or row.get("name") or "") == asset_id:
            row["selected_image"] = selected["url"]
            row["image_url"] = selected["url"]
            row["image_path"] = selected["path"]
            row["image_updated_at"] = updated_at
            row["status"] = "confirmed"
            break
    base = get_project_base(root_path, project_id)
    write_json(base / "true_sources" / f"{kind}.json", rows)
    return {
        **selected,
        "bundle": read_asset_bundle(root_path, project_id).model_dump(),
    }


def delete_asset_candidate_image(root_path: Path, project_id: str, source_path: str) -> dict[str, bool]:
    base = get_project_base(root_path, project_id)
    target = resolve_project_asset_path(base, source_path)
    relative_parts = target.relative_to(base).parts
    if len(relative_parts) < 4 or relative_parts[0] != "assets" or relative_parts[1] != "candidates":
        raise ValueError("只能删除候选图片")
    if not target.exists():
        raise FileNotFoundError("Image not found")
    target.unlink()
    return {"ok": True}


def asset_image_url(project_id: str, bucket: str, kind: str, filename: str) -> str:
    return f"/api/projects/{project_id}/assets/images/{bucket}/{kind}/{filename}"


def get_asset_image_path(root_path: Path, project_id: str, bucket: str, kind: str, filename: str) -> Path:
    if kind not in ASSET_KINDS:
        raise ValueError("Unsupported asset kind")
    if bucket not in ("candidates", "selected"):
        raise ValueError("Unsupported image bucket")
    base = get_project_base(root_path, project_id)
    target = (base / "assets" / bucket / kind / Path(filename).name).resolve()
    allowed_root = (base / "assets" / bucket / kind).resolve()
    if allowed_root not in target.parents:
        raise ValueError("Invalid image path")
    if not target.exists():
        raise FileNotFoundError("Image not found")
    return target


def get_legacy_asset_image_path(root_path: Path, project_id: str, kind: str, filename: str) -> Path:
    if kind not in ASSET_KINDS:
        raise ValueError("Unsupported asset kind")
    base = get_project_base(root_path, project_id)
    target = (base / "assets" / kind / Path(filename).name).resolve()
    allowed_root = (base / "assets" / kind).resolve()
    if allowed_root not in target.parents:
        raise ValueError("Invalid image path")
    if not target.exists():
        raise FileNotFoundError("Image not found")
    return target


def resolve_project_asset_path(base: Path, source_path: str) -> Path:
    normalized = source_path.strip()
    if normalized.startswith("/api/projects/"):
        parts = normalized.split("/assets/images/", 1)
        if len(parts) != 2:
            raise ValueError("Invalid image url")
        bucket, kind, filename = parts[1].split("/", 2)
        return get_asset_path_from_parts(base, bucket, kind, filename)
    if normalized.startswith("assets/"):
        parts = normalized.split("/")
        if len(parts) < 4:
            raise ValueError("Invalid image path")
        return get_asset_path_from_parts(base, parts[1], parts[2], "/".join(parts[3:]))
    raise ValueError("Invalid image path")


def get_asset_path_from_parts(base: Path, bucket: str, kind: str, filename: str) -> Path:
    if bucket not in ("candidates", "selected") or kind not in ASSET_KINDS:
        raise ValueError("Invalid image path")
    target = (base / "assets" / bucket / kind / Path(filename).name).resolve()
    allowed_root = (base / "assets" / bucket / kind).resolve()
    if allowed_root not in target.parents:
        raise ValueError("Invalid image path")
    if not target.exists():
        raise FileNotFoundError("Image not found")
    return target


def split_data_url(data_url: str) -> tuple[str, str]:
    if "," not in data_url:
        return "", data_url
    header, encoded = data_url.split(",", 1)
    return header, encoded


def suffix_from_data_url(header: str) -> str:
    if "image/png" in header:
        return ".png"
    if "image/webp" in header:
        return ".webp"
    return ".jpg"


def suffix_from_mime(mime_type: str) -> str:
    if "webp" in mime_type:
        return ".webp"
    if "jpeg" in mime_type or "jpg" in mime_type:
        return ".jpg"
    return ".png"


def parse_candidate_list(value: Any) -> list[dict[str, Any]]:
    import json

    if isinstance(value, list):
        return [item for item in value if isinstance(item, dict)]
    if isinstance(value, str) and value.strip():
        try:
            parsed = json.loads(value)
            return [item for item in parsed if isinstance(item, dict)] if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def json_stringify_candidates(value: list[dict[str, Any]]) -> str:
    import json

    return json.dumps(value, ensure_ascii=False)


async def extract_character_records(root_path: Path, project_id: str) -> AssetReviewBundle:
    return await extract_asset_records(root_path, project_id, "characters")


async def extract_scene_records(root_path: Path, project_id: str) -> AssetReviewBundle:
    return await extract_asset_records(root_path, project_id, "scenes")


async def extract_prop_records(root_path: Path, project_id: str) -> AssetReviewBundle:
    return await extract_asset_records(root_path, project_id, "props")


async def extract_asset_records(root_path: Path, project_id: str, kind: str) -> AssetReviewBundle:
    config = ASSET_EXTRACT_CONFIG.get(kind)
    if not config:
        raise ValueError("Unsupported asset kind")
    base = get_project_base(root_path, project_id)
    script = read_project_script_text(base)
    if not script.strip():
        raise ValueError("当前项目没有可用于资产提取的剧本")
    prompt = read_prompt(config["prompt"])["content"]
    system_prompt = prompt.replace("{{全集剧本}}", script)
    response = await call_openai_compatible(
        LlmChatRequest(
            stageId=config["stage"],
            label=config["label"],
            promptId=config["prompt"],
            jsonMode=True,
            maxTokens=12000,
            messages=[
                ChatMessage(role="system", content=system_prompt),
                ChatMessage(role="user", content="请按系统提示词输出 JSON。"),
            ],
        )
    )
    records = parse_asset_records(response, kind)
    bundle = read_asset_bundle(root_path, project_id)
    bundle.records[kind] = records
    write_json(base / "records" / config["file"], records)
    return read_asset_bundle(root_path, project_id)


def read_project_script_text(base: Path) -> str:
    episodes_dir = base / "input" / "episodes"
    episode_files = sorted(episodes_dir.glob("*.txt"), key=lambda item: item.name)
    if episode_files:
        texts = []
        for file in episode_files:
            text = file.read_text(encoding="utf-8").strip()
            if text:
                texts.append(text)
        return "\n\n".join(texts)
    legacy_file = base / "input" / "script.txt"
    return legacy_file.read_text(encoding="utf-8") if legacy_file.exists() else ""


def parse_character_records(response: dict[str, Any]) -> list[dict[str, Any]]:
    return parse_asset_records(response, "characters")


def parse_asset_records(response: dict[str, Any], kind: str) -> list[dict[str, Any]]:
    import json
    import re

    content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(content, str):
        return []
    content = content.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", content, flags=re.DOTALL)
    if fenced:
        content = fenced.group(1).strip()
    parsed = json.loads(content)
    if isinstance(parsed, list):
        rows = parsed
    elif isinstance(parsed, dict):
        rows = parsed.get(ASSET_EXTRACT_CONFIG[kind]["root"], [])
    else:
        rows = []
    if kind == "characters":
        return normalize_character_records(rows)
    if kind == "scenes":
        return normalize_scene_records(rows)
    if kind == "props":
        return normalize_prop_records(rows)
    return _normalize_list(rows)


def normalize_character_records(rows: Any) -> list[dict[str, Any]]:
    normalized = []
    for row in _normalize_list(rows):
        normalized.append({
            "name": str(row.get("name") or ""),
            "version_of": str(row.get("version_of") or row.get("base_name") or ""),
            "appearance": str(row.get("appearance") or ""),
            "outfit": str(row.get("outfit") or ""),
            "first_seen": str(row.get("first_seen") or ""),
            "trigger": str(row.get("trigger") or ""),
            "appearance_source": str(row.get("appearance_source") or ""),
            "plot_source": str(row.get("plot_source") or ""),
        })
    return normalized


def normalize_scene_records(rows: Any) -> list[dict[str, Any]]:
    normalized = []
    for row in _normalize_list(rows):
        normalized.append({
            "name": str(row.get("name") or ""),
            "aliases": normalize_aliases(row.get("aliases")),
            "visual_description": str(row.get("visual_description") or row.get("description") or ""),
            "fixed_elements": str(row.get("fixed_elements") or ""),
            "first_seen": str(row.get("first_seen") or ""),
            "state_trigger": str(row.get("state_trigger") or ""),
            "visual_source": str(row.get("visual_source") or row.get("evidence") or ""),
            "plot_source": str(row.get("plot_source") or ""),
        })
    return normalized


def normalize_prop_records(rows: Any) -> list[dict[str, Any]]:
    normalized = []
    for row in _normalize_list(rows):
        normalized.append({
            "name": str(row.get("name") or ""),
            "aliases": normalize_aliases(row.get("aliases")),
            "appearance": str(row.get("appearance") or row.get("description") or ""),
            "holder_or_location": str(row.get("holder_or_location") or ""),
            "state_changes": str(row.get("state_changes") or row.get("states") or ""),
            "first_seen": str(row.get("first_seen") or ""),
            "plot_role": str(row.get("plot_role") or ""),
            "appearance_source": str(row.get("appearance_source") or row.get("evidence") or ""),
            "plot_source": str(row.get("plot_source") or ""),
        })
    return normalized


def normalize_aliases(value: Any) -> str:
    if isinstance(value, list):
        return ",".join(str(item) for item in value if item)
    return str(value or "")


def _read_list(path: Path) -> list[dict[str, Any]]:
    parsed = read_json(path, [])
    return _normalize_list(parsed)


def _normalize_list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]
