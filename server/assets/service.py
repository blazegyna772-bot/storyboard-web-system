from __future__ import annotations

import json
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
CHAPTER_ASSET_EXTRACT_PROMPT = "default:asset_extract_chapter/prompt.md"
CHAPTER_ASSET_KIND_ROOTS = {
    "characters": "CHAR",
    "scenes": "SCENE",
    "props": "PROP",
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


async def extract_chapter_asset_records(root_path: Path, project_id: str) -> AssetReviewBundle:
    base = get_project_base(root_path, project_id)
    episodes = read_project_episode_texts(base)
    if not any(episode["text"].strip() for episode in episodes):
        raise ValueError("当前项目没有可用于资产提取的剧本")
    chapter_refs = asset_chapter_refs(base, episodes)
    prompt_detail = read_prompt(CHAPTER_ASSET_EXTRACT_PROMPT)
    prompt = prompt_detail["content"]
    bundle = empty_asset_bundle()
    records: dict[str, list[dict[str, Any]]] = {kind: [] for kind in ASSET_KINDS}
    true_sources: dict[str, list[dict[str, Any]]] = {kind: [] for kind in ASSET_KINDS}
    global_clues = asset_global_clues_text(base)
    for chapter_ref in chapter_refs:
        chapter_script = "\n\n".join(episode["text"] for episode in episodes if episode["episodeId"] in set(chapter_ref["episode_ids"]))
        if not chapter_script.strip():
            continue
        system_prompt = render_asset_prompt(prompt, {
            "当前章节编号": chapter_ref["chapter_id"],
            "当前章节剧本": chapter_script,
            "全局资产线索": global_clues,
            "已有资产索引": asset_registry_index_text(true_sources),
        })
        response = await call_openai_compatible(
            LlmChatRequest(
                stageId="asset_extract_chapter",
                label=f"章节资产提取 {chapter_ref['chapter_id']}",
                promptId=prompt_detail.get("version", {}).get("id") or CHAPTER_ASSET_EXTRACT_PROMPT,
                jsonMode=True,
                maxTokens=12000,
                messages=[
                    ChatMessage(role="system", content=system_prompt),
                    ChatMessage(role="user", content="请按系统提示词输出 JSON。"),
                ],
            )
        )
        chapter_records = parse_chapter_asset_records(response, chapter_ref["chapter_id"])
        for kind in ASSET_KINDS:
            for record in chapter_records[kind]:
                merged = merge_chapter_asset_record(kind, record, true_sources[kind], chapter_ref["chapter_id"])
                records[kind].append(merged["record"])
                if merged["true_source"]:
                    true_sources[kind].append(merged["true_source"])
    for kind in ASSET_KINDS:
        bundle.records[kind] = records[kind]
        bundle.trueSources[kind] = true_sources[kind]
        write_json(base / "records" / f"{kind}_extract.json", records[kind])
        write_json(base / "true_sources" / f"{kind}.json", true_sources[kind])
    write_json(base / "records" / "chapter_asset_extract.json", {"chapters": chapter_refs, "records": records})
    return read_asset_bundle(root_path, project_id)


async def extract_asset_records(root_path: Path, project_id: str, kind: str) -> AssetReviewBundle:
    config = ASSET_EXTRACT_CONFIG.get(kind)
    if not config:
        raise ValueError("Unsupported asset kind")
    base = get_project_base(root_path, project_id)
    script = read_project_script_text(base)
    if not script.strip():
        raise ValueError("当前项目没有可用于资产提取的剧本")
    prompt_detail = read_prompt(config["prompt"])
    prompt = prompt_detail["content"]
    system_prompt = render_asset_prompt(prompt, {
        "全集剧本": script,
        "角色概要": read_story_workflow_artifact_text(base, "character_summary") if kind == "characters" else "",
        "信息连续性": read_story_workflow_artifact_text(base, "continuity") if kind in {"scenes", "props"} else "",
    })
    response = await call_openai_compatible(
        LlmChatRequest(
            stageId=config["stage"],
            label=config["label"],
            promptId=prompt_detail.get("version", {}).get("id") or config["prompt"],
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
    bundle.trueSources[kind] = [build_true_source_from_record(kind, record, index) for index, record in enumerate(records)]
    write_json(base / "records" / config["file"], records)
    write_json(base / "true_sources" / f"{kind}.json", bundle.trueSources[kind])
    return read_asset_bundle(root_path, project_id)


def render_asset_prompt(template: str, variables: dict[str, str]) -> str:
    rendered = template
    for key, value in variables.items():
        rendered = rendered.replace("{{" + key + "}}", value)
    return rendered


def read_story_workflow_artifact_text(base: Path, node_id: str) -> str:
    data = read_json(base / "artifacts" / "story_workflow" / f"{node_id}.json", None)
    if not isinstance(data, dict) or not data:
        return ""
    return json.dumps(data, ensure_ascii=False, indent=2)


def build_true_source_from_record(kind: str, record: dict[str, Any], index: int) -> dict[str, str]:
    if kind == "characters":
        base_name = str(record.get("version_of") or infer_asset_base_name(str(record.get("name") or "")) or record.get("name") or "")
        name = str(record.get("name") or "")
        return {
            "id": str(record.get("id") or build_asset_id("CHAR", base_name, name, index)),
            "name": name,
            "base_name": base_name,
            "appearance": str(record.get("appearance") or ""),
            "outfit": str(record.get("outfit") or ""),
            "image_prompt": "，".join(item for item in [str(record.get("appearance") or ""), str(record.get("outfit") or "")] if item),
            "continuity": "保持同一版本的年龄感、发型、脸型、服装结构和关键配饰一致。",
            "status": "draft",
        }
    if kind == "scenes":
        name = str(record.get("name") or "")
        visual_description = str(record.get("visual_description") or "")
        fixed_elements = str(record.get("fixed_elements") or "")
        return {
            "id": str(record.get("id") or build_asset_id("SCENE", name, name, index)),
            "name": name,
            "description": visual_description,
            "fixed_elements": fixed_elements,
            "aliases": str(record.get("aliases") or ""),
            "first_seen": str(record.get("first_seen") or ""),
            "state_trigger": str(record.get("state_trigger") or ""),
            "image_prompt": "，".join(item for item in [name, visual_description, fixed_elements] if item),
            "continuity": "保持空间结构、固定陈设、光源方向和可复用角度一致。",
            "status": "draft",
        }
    name = str(record.get("name") or "")
    appearance = str(record.get("appearance") or "")
    state_changes = str(record.get("state_changes") or "")
    return {
        "id": str(record.get("id") or build_asset_id("PROP", name, name, index)),
        "name": name,
        "description": "，".join(item for item in [appearance, state_changes] if item),
        "appearance": appearance,
        "aliases": str(record.get("aliases") or ""),
        "holder_or_location": str(record.get("holder_or_location") or ""),
        "state_changes": state_changes,
        "first_seen": str(record.get("first_seen") or ""),
        "plot_role": str(record.get("plot_role") or ""),
        "image_prompt": "，".join(item for item in [name, appearance] if item),
        "continuity": "保持外观、材质、尺寸、持有人和状态变化一致。",
        "status": "draft",
    }


def infer_asset_base_name(name: str) -> str:
    return re.split(r"[-－—_/（(]", name.strip(), maxsplit=1)[0].strip()


def build_asset_id(prefix: str, base_name: str, name: str, index: int) -> str:
    raw = base_name or name or str(index + 1)
    slug = re.sub(r"[^0-9A-Za-z\u4e00-\u9fff]+", "", raw).upper()
    return f"{prefix}-{slug or index + 1}-{index + 1:02d}"


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
    return ""


def read_project_episode_texts(base: Path) -> list[dict[str, str]]:
    episodes_dir = base / "input" / "episodes"
    episode_files = sorted(episodes_dir.glob("*.txt"), key=lambda item: item.name)
    episodes: list[dict[str, str]] = []
    for index, file in enumerate(episode_files):
        text = file.read_text(encoding="utf-8").strip()
        if not text:
            continue
        number = marker_number(file.stem) or index + 1
        episodes.append({"episodeId": f"EP{number:02d}", "title": file.stem, "text": text})
    if episodes:
        return episodes
    script = read_project_script_text(base)
    return [{"episodeId": "EP01", "title": "EP01", "text": script}]


def asset_chapter_refs(base: Path, episodes: list[dict[str, str]]) -> list[dict[str, Any]]:
    story_map = read_json(base / "artifacts" / "story_workflow" / "story_map.json", {})
    chapter_map = story_map.get("chapter_map") if isinstance(story_map, dict) else []
    refs: list[dict[str, Any]] = []
    for index, item in enumerate(chapter_map if isinstance(chapter_map, list) else []):
        if not isinstance(item, dict):
            continue
        chapter_id = normalize_chapter_id(item.get("chapter_id") or index + 1)
        episode_ids = episode_ids_from_range(str(item.get("episode_range") or ""), episodes)
        if not episode_ids:
            continue
        refs.append({"chapter_id": chapter_id, "episode_ids": episode_ids, "episode_range": str(item.get("episode_range") or "")})
    if refs:
        return refs
    return [{"chapter_id": "chapter_01", "episode_ids": [episode["episodeId"] for episode in episodes], "episode_range": ""}]


def asset_global_clues_text(base: Path) -> str:
    story_base = base / "artifacts" / "story_workflow"
    clues = {
        "character_summary": read_json(story_base / "character_summary.json", {}),
        "continuity": read_json(story_base / "continuity.json", {}),
        "series_summary": read_json(story_base / "series_summary.json", {}),
    }
    compact = {key: value for key, value in clues.items() if value}
    if not compact:
        return "未找到全局资产线索。"
    return json.dumps(compact, ensure_ascii=False, separators=(",", ":"))


def normalize_chapter_id(value: Any) -> str:
    number = marker_number(str(value or "1")) or 1
    return f"chapter_{number:02d}"


def episode_ids_from_range(episode_range: str, episodes: list[dict[str, str]]) -> list[str]:
    if not episode_range:
        return []
    numbers = [marker_number(match.group(1)) for match in re.finditer(r"(?:EP|第)?\s*([0-9０-９一二三四五六七八九十百零〇两]+)", episode_range, re.I)]
    numbers = [number for number in numbers if number > 0]
    if not numbers:
        return []
    start, end = (numbers[0], numbers[-1]) if len(numbers) > 1 else (numbers[0], numbers[0])
    if start > end:
        start, end = end, start
    valid_ids = {episode["episodeId"] for episode in episodes}
    return [f"EP{number:02d}" for number in range(start, end + 1) if f"EP{number:02d}" in valid_ids]


def marker_number(value: str) -> int:
    raw = str(value or "").strip()
    if not raw:
        return 0
    normalized_digits = raw.translate(str.maketrans("０１２３４５６７８９", "0123456789"))
    digit_match = re.search(r"\d+", normalized_digits)
    if digit_match:
        return int(digit_match.group(0))
    numerals = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    if "十" in raw:
        left, _, right = raw.partition("十")
        tens = numerals.get(left, 1) if left else 1
        ones = numerals.get(right, 0) if right else 0
        return tens * 10 + ones
    return numerals.get(raw, 0)


def infer_asset_version_label(name: str, base_name: str) -> str:
    if base_name and name.startswith(base_name):
        return name[len(base_name):].lstrip("-_ /").strip()
    return ""


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


def parse_chapter_asset_records(response: dict[str, Any], chapter_id: str) -> dict[str, list[dict[str, Any]]]:
    content = response.get("choices", [{}])[0].get("message", {}).get("content", "")
    if not isinstance(content, str):
        return {kind: [] for kind in ASSET_KINDS}
    content = content.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", content, flags=re.DOTALL)
    if fenced:
        content = fenced.group(1).strip()
    parsed = json.loads(content)
    if not isinstance(parsed, dict):
        return {kind: [] for kind in ASSET_KINDS}
    return {
        "characters": normalize_chapter_asset_rows(parsed.get("characters"), "characters", chapter_id),
        "scenes": normalize_chapter_asset_rows(parsed.get("scenes"), "scenes", chapter_id),
        "props": normalize_chapter_asset_rows(parsed.get("props"), "props", chapter_id),
    }


def normalize_chapter_asset_rows(rows: Any, kind: str, chapter_id: str) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for row in _normalize_list(rows):
        action = str(row.get("action") or "create_asset").strip()
        if action not in {"use_existing", "create_asset", "create_version"}:
            action = "create_asset"
        display_name = str(row.get("display_name") or row.get("name") or "").strip()
        if not display_name:
            continue
        normalized.append({
            "chapter_id": chapter_id,
            "kind": kind,
            "action": action,
            "display_name": display_name,
            "asset_id": str(row.get("asset_id") or "").strip(),
            "version_id": str(row.get("version_id") or "").strip(),
            "version_name": str(row.get("version_name") or "默认版").strip() or "默认版",
            "asset_note": limit_text(row.get("asset_note"), 40),
            "version_note": limit_text(row.get("version_note"), 40),
            "evidence": limit_text(row.get("evidence"), 60),
            "aliases": normalize_aliases(row.get("aliases")),
        })
    return normalized


def merge_chapter_asset_record(kind: str, record: dict[str, Any], rows: list[dict[str, Any]], chapter_id: str) -> dict[str, Any]:
    action = str(record.get("action") or "create_asset")
    asset_id = str(record.get("asset_id") or "").strip()
    version_id = str(record.get("version_id") or "").strip()
    display_name = str(record.get("display_name") or "").strip()
    existing_asset = find_asset_row(rows, asset_id, "")
    if action == "use_existing" and version_id:
        existing_version = find_asset_row(rows, asset_id, version_id)
        if existing_version:
            return {"record": {**record, "asset_id": existing_version.get("asset_id") or existing_version.get("id"), "version_id": existing_version.get("version_id") or existing_version.get("id")}, "true_source": None}
    if action == "create_version" and existing_asset:
        asset_id = str(existing_asset.get("asset_id") or existing_asset.get("id") or asset_id)
    elif not asset_id:
        asset_id = build_asset_id(CHAPTER_ASSET_KIND_ROOTS[kind], display_name, display_name, len(rows))
    if not version_id:
        version_id = next_version_id(asset_id, rows)
    true_source = build_chapter_true_source(kind, record, asset_id, version_id, chapter_id)
    return {"record": {**record, "asset_id": asset_id, "version_id": version_id}, "true_source": true_source}


def build_chapter_true_source(kind: str, record: dict[str, Any], asset_id: str, version_id: str, chapter_id: str) -> dict[str, str]:
    display_name = str(record.get("display_name") or "")
    version_name = str(record.get("version_name") or "默认版")
    asset_note = str(record.get("asset_note") or "")
    version_note = str(record.get("version_note") or "")
    evidence = str(record.get("evidence") or "")
    row = {
        "id": version_id,
        "asset_id": asset_id,
        "version_id": version_id,
        "name": display_name,
        "version_name": version_name,
        "description": asset_note,
        "version_note": version_note,
        "aliases": str(record.get("aliases") or ""),
        "first_seen": chapter_id,
        "evidence": evidence,
        "image_prompt": "，".join(item for item in [display_name, asset_note, version_note] if item),
        "continuity": "保持资产与版本识别说明一致。",
        "status": "draft",
    }
    if kind == "characters":
        row["base_name"] = display_name
        row["appearance"] = version_note or asset_note
        row["outfit"] = ""
    elif kind == "scenes":
        row["fixed_elements"] = version_note
        row["state_trigger"] = evidence
    else:
        row["appearance"] = version_note or asset_note
        row["state_changes"] = version_note
        row["plot_role"] = evidence
    return row


def find_asset_row(rows: list[dict[str, Any]], asset_id: str, version_id: str) -> dict[str, Any] | None:
    for row in rows:
        row_asset_id = str(row.get("asset_id") or row.get("id") or "")
        row_version_id = str(row.get("version_id") or row.get("id") or "")
        if asset_id and row_asset_id != asset_id:
            continue
        if version_id and row_version_id != version_id:
            continue
        return row
    return None


def next_version_id(asset_id: str, rows: list[dict[str, Any]]) -> str:
    count = 1
    for row in rows:
        if str(row.get("asset_id") or row.get("id") or "") == asset_id:
            count += 1
    return f"{asset_id}_v{count:02d}"


def asset_registry_index_text(true_sources: dict[str, list[dict[str, Any]]]) -> str:
    index = {kind: [compact_asset_registry_row(row, kind) for row in rows] for kind, rows in true_sources.items()}
    if not any(index.values()):
        return "空资产索引。本章出现的有效资产需要创建新资产。"
    return json.dumps(index, ensure_ascii=False, separators=(",", ":"))


def compact_asset_registry_row(row: dict[str, Any], kind: str) -> dict[str, str]:
    item = {
        "asset_id": str(row.get("asset_id") or row.get("id") or ""),
        "display_name": str(row.get("name") or ""),
        "category": asset_kind_cn(kind),
        "version_id": str(row.get("version_id") or row.get("id") or ""),
        "version_name": str(row.get("version_name") or infer_asset_version_label(str(row.get("name") or ""), str(row.get("base_name") or "")) or "默认版"),
        "asset_note": str(row.get("description") or row.get("appearance") or ""),
        "version_note": str(row.get("version_note") or row.get("fixed_elements") or row.get("state_changes") or ""),
        "first_seen": str(row.get("first_seen") or ""),
        "aliases": str(row.get("aliases") or ""),
    }
    return {key: value for key, value in item.items() if value}


def asset_kind_cn(kind: str) -> str:
    return {"characters": "角色", "scenes": "场景", "props": "物品"}.get(kind, kind)


def limit_text(value: Any, max_length: int) -> str:
    text = str(value or "").strip()
    return text[:max_length]


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
