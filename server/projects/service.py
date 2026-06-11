from __future__ import annotations

import re
import secrets
import base64
import binascii
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from server.core.config import APP_CONFIG_FILE, default_project_root_dir
from server.projects.models import BackendRoot, RootState, StoryboardProject
from server.storage.json_io import read_json, write_json


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def safe_folder_name(value: str) -> str:
    cleaned = re.sub(r'[\\/:*?"<>|]', "-", value.strip())
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned or default_project_name()


def default_project_name() -> str:
    now = datetime.now()
    return f"{now.year}{now.month:02d}{now.day:02d}-001"


def create_project_id() -> str:
    return f"PRJ-{int(datetime.now().timestamp() * 1000):X}-{secrets.token_hex(2).upper()}"


def read_app_config() -> dict[str, Any]:
    parsed = read_json(APP_CONFIG_FILE, {})
    roots = parsed.get("roots")
    default_root = str(default_project_root_dir().resolve())
    normalized_roots = roots if isinstance(roots, list) else []
    normalized_roots = [default_root, *[str(Path(item).expanduser().resolve()) for item in normalized_roots if str(Path(item).expanduser().resolve()) != default_root]]
    active_root = str(parsed.get("activeRootPath") or "") or default_root
    if active_root not in normalized_roots:
        active_root = default_root
    default_project_root_dir().mkdir(parents=True, exist_ok=True)
    return {
        "roots": normalized_roots,
        "activeRootPath": active_root,
    }


def write_app_config(config: dict[str, Any]) -> None:
    write_json(APP_CONFIG_FILE, config)


def get_root_state() -> RootState:
    config = read_app_config()
    roots = [
        BackendRoot(rootName=Path(root_path).name, rootPath=root_path, isActive=root_path == config["activeRootPath"])
        for root_path in config["roots"]
    ]
    return RootState(roots=roots, activeRootPath=config["activeRootPath"])


def add_root(root_path: str) -> RootState:
    resolved = str(Path(root_path).expanduser().resolve())
    Path(resolved).mkdir(parents=True, exist_ok=True)
    config = read_app_config()
    roots = [resolved, *[item for item in config["roots"] if item != resolved]]
    write_app_config({**config, "roots": roots, "activeRootPath": resolved})
    return get_root_state()


def activate_root(root_path: str) -> RootState:
    resolved = str(Path(root_path).expanduser().resolve())
    Path(resolved).mkdir(parents=True, exist_ok=True)
    config = read_app_config()
    roots = [resolved, *[item for item in config["roots"] if item != resolved]]
    write_app_config({**config, "roots": roots, "activeRootPath": resolved})
    return get_root_state()


def remove_root(root_path: str) -> RootState:
    resolved = str(Path(root_path).expanduser().resolve())
    default_root = str(default_project_root_dir().resolve())
    if resolved == default_root:
        return get_root_state()
    config = read_app_config()
    roots = [item for item in config["roots"] if item != resolved]
    active = "" if config["activeRootPath"] == resolved else config["activeRootPath"]
    write_app_config({"roots": roots, "activeRootPath": active})
    return get_root_state()


def require_active_root() -> Path:
    config = read_app_config()
    active = config["activeRootPath"]
    if not active:
        raise ValueError("未配置当前项目根目录")
    root = Path(active)
    root.mkdir(parents=True, exist_ok=True)
    return root


def empty_analysis(options: dict[str, Any] | None) -> dict[str, Any]:
    return {"totalCharacters": 0, "options": options or {}, "episodes": [], "warnings": []}


def create_project_record(name: str, options: dict[str, Any] | None) -> StoryboardProject:
    safe_name = name.strip() or default_project_name()
    now = now_iso()
    return StoryboardProject(
        projectId=create_project_id(),
        name=safe_name,
        folderName=safe_folder_name(safe_name),
        createdAt=now,
        updatedAt=now,
        description="",
        owner="",
        status="制作中",
        coverImage="",
        script="",
        options=options or {},
        analysis=empty_analysis(options),
    )


def project_dir(root_path: Path, project: StoryboardProject) -> Path:
    return root_path / safe_folder_name(project.folderName or project.name)


def write_project(root_path: Path, project: StoryboardProject) -> StoryboardProject:
    folder_name = safe_folder_name(project.folderName or project.name)
    project.folderName = folder_name
    if not project.createdAt:
        project.createdAt = project.updatedAt or now_iso()
    project.updatedAt = now_iso()
    base = root_path / folder_name
    episodes_dir = base / "input" / "episodes"
    episodes_dir.mkdir(parents=True, exist_ok=True)
    (base / "config").mkdir(parents=True, exist_ok=True)
    (base / "artifacts").mkdir(parents=True, exist_ok=True)
    (base / "exports").mkdir(parents=True, exist_ok=True)

    # Keep episode text separate from project metadata, so large scripts are not read for lists.
    episodes = project.analysis.get("episodes") if isinstance(project.analysis, dict) else None
    episode_texts = [
        (str(episode.get("episodeId") or "EP01"), str(episode.get("sourceText") or ""))
        for episode in episodes or []
        if isinstance(episode, dict)
    ]
    has_episode_text = any(text.strip() for _, text in episode_texts)
    has_project_script = bool(project.script.strip())
    if has_episode_text:
        for old_file in episodes_dir.glob("*.txt"):
            old_file.unlink()
        for episode_id, source_text in episode_texts:
            (episodes_dir / f"{episode_id}.txt").write_text(source_text, encoding="utf-8")
    elif has_project_script:
        for old_file in episodes_dir.glob("*.txt"):
            old_file.unlink()
        (episodes_dir / "EP01.txt").write_text(project.script, encoding="utf-8")
    elif any(episodes_dir.glob("*.txt")):
        existing_manifest = read_json(base / "project.json", None)
        if isinstance(existing_manifest, dict) and isinstance(existing_manifest.get("analysis"), dict):
            project.analysis = existing_manifest["analysis"]

    manifest = project.model_dump()
    manifest["script"] = ""
    write_json(base / "project.json", manifest)
    return project


def read_project_script(base: Path) -> str:
    episodes_dir = base / "input" / "episodes"
    episode_files = sorted(episodes_dir.glob("*.txt"), key=lambda p: p.name)
    if episode_files:
        return "\n\n".join(text for text in (f.read_text(encoding="utf-8").strip() for f in episode_files) if text)
    return ""


def read_project_by_folder(root_path: Path, folder_name: str, include_script: bool) -> StoryboardProject | None:
    base = root_path / folder_name
    manifest = read_json(base / "project.json", None)
    if not isinstance(manifest, dict):
        return None
    manifest["script"] = read_project_script(base) if include_script else ""
    manifest["rootName"] = root_path.name
    manifest.setdefault("projectId", manifest.get("project_id"))
    manifest.setdefault("name", manifest.get("title") or manifest.get("projectId") or folder_name)
    manifest.setdefault("folderName", folder_name)
    manifest.setdefault("updatedAt", manifest.get("updated_at") or manifest.get("created_at") or now_iso())
    manifest.setdefault("createdAt", manifest.get("created_at") or manifest.get("updatedAt") or now_iso())
    manifest.setdefault("description", "")
    manifest.setdefault("owner", "")
    manifest.setdefault("status", "制作中")
    manifest.setdefault("coverImage", "")
    manifest.setdefault("analysis", empty_analysis(manifest.get("options")))
    manifest.setdefault("options", {})
    return StoryboardProject(**manifest)


def list_projects(root_path: Path) -> list[StoryboardProject]:
    projects = []
    for entry in root_path.iterdir() if root_path.exists() else []:
        if not entry.is_dir():
            continue
        try:
            project = read_project_by_folder(root_path, entry.name, include_script=False)
        except Exception:
            project = None
        if project:
            projects.append(project)
    return sorted(projects, key=lambda p: p.updatedAt, reverse=True)


def read_project(root_path: Path, project_id: str, include_script: bool) -> StoryboardProject:
    for project in list_projects(root_path):
        if project.projectId == project_id:
            full = read_project_by_folder(root_path, project.folderName or project.name, include_script)
            if full:
                return full
    raise FileNotFoundError("Project not found")


def delete_project(root_path: Path, project_id: str) -> None:
    project = read_project(root_path, project_id, include_script=False)
    base = project_dir(root_path, project)
    import shutil

    shutil.rmtree(base, ignore_errors=True)


def split_data_url(data_url: str) -> tuple[str, str]:
    if "," not in data_url:
        raise ValueError("Invalid image data")
    header, encoded = data_url.split(",", 1)
    if not header.startswith("data:image/"):
        raise ValueError("Only image data URLs are supported")
    return header, encoded


def suffix_from_data_url(header: str) -> str:
    mime = header.split(";", 1)[0].replace("data:", "")
    return {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(mime, ".png")


def store_project_cover(root_path: Path, project_id: str, filename: str, data_url: str) -> StoryboardProject:
    project = read_project(root_path, project_id, include_script=False)
    base = project_dir(root_path, project)
    header, encoded = split_data_url(data_url)
    suffix = Path(filename).suffix.lower() or suffix_from_data_url(header)
    target = base / "assets" / "project" / f"cover_{secrets.token_hex(4)}{suffix}"
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.write_bytes(base64.b64decode(encoded))
    except (binascii.Error, ValueError) as exc:
        raise ValueError("Invalid image data") from exc
    project.coverImage = project_cover_url(project_id, target.name)
    return write_project(root_path, project)


def project_cover_url(project_id: str, filename: str) -> str:
    return f"/api/projects/{project_id}/cover/{filename}"


def get_project_cover_path(root_path: Path, project_id: str, filename: str) -> Path:
    project = read_project(root_path, project_id, include_script=False)
    base = project_dir(root_path, project)
    target = (base / "assets" / "project" / Path(filename).name).resolve()
    allowed_root = (base / "assets" / "project").resolve()
    if allowed_root not in target.parents:
        raise ValueError("Invalid cover path")
    if not target.exists():
        raise FileNotFoundError("Cover not found")
    return target
