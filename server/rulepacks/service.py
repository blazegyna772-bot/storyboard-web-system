from __future__ import annotations

import base64
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path

from server.core.config import APP_PROMPT_LIBRARY_FILE, bundled_rulepacks_dir
from server.rulepacks.models import PromptLibrary, PromptTemplateGroup, PromptVersion, Rulepack, RulepackPrompt
from server.storage.json_io import read_json, write_json

VARIABLE_RE = re.compile(r"\{\{\s*([^{}\s]+)\s*\}\}")


def list_rulepacks() -> list[Rulepack]:
    base = bundled_rulepacks_dir()
    if not base.exists():
        return []
    packs: list[Rulepack] = []
    for pack_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        prompts: list[RulepackPrompt] = []
        for md_path in sorted(pack_dir.rglob("*.md")):
            if md_path.name != "prompt.md":
                continue
            rel = md_path.relative_to(pack_dir)
            stage = rel.parts[0] if len(rel.parts) > 1 else "general"
            text = md_path.read_text(encoding="utf-8")
            prompts.append(
                RulepackPrompt(
                    id=f"{pack_dir.name}:{rel.as_posix()}",
                    name=md_path.stem,
                    stage=stage,
                    path=str(md_path),
                    variables=sorted(set(VARIABLE_RE.findall(text))),
                    activeVersionId=get_active_version_id(f"{pack_dir.name}:{rel.as_posix()}"),
                )
            )
        packs.append(Rulepack(id=pack_dir.name, name=pack_dir.name, path=str(pack_dir), prompts=prompts))
    return packs


def read_prompt(prompt_id: str) -> dict:
    for pack in list_rulepacks():
        for prompt in pack.prompts:
            if prompt.id == prompt_id:
                official = official_version(prompt)
                active = active_version(prompt.id) or official
                return {"prompt": prompt.model_dump(), "content": active.content, "version": active.model_dump()}
    raise FileNotFoundError("Prompt not found")


def list_prompt_library() -> PromptLibrary:
    groups: list[PromptTemplateGroup] = []
    user_store = read_prompt_store()
    for pack in list_rulepacks():
        for prompt in pack.prompts:
            official = official_version(prompt)
            official_backups = official_backup_versions(prompt)
            user_versions = official_backups + [PromptVersion(**item) for item in user_store.get("versions", {}).get(prompt.id, []) if isinstance(item, dict)]
            active_id = get_active_version_id(prompt.id)
            groups.append(
                PromptTemplateGroup(
                    prompt=prompt,
                    official=official,
                    userVersions=user_versions,
                    activeVersionId=active_id,
                )
            )
    return PromptLibrary(groups=groups)


def create_prompt_version(data: dict) -> PromptVersion:
    prompt = find_prompt(str(data.get("promptId") or ""))
    source = data.get("sourceVersionId")
    source_version = get_prompt_version(prompt.id, str(source)) if source else active_version(prompt.id) or official_version(prompt)
    now = now_iso()
    version = PromptVersion(
        id=f"user-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}-{secrets.token_hex(3)}",
        promptId=prompt.id,
        name=str(data.get("name") or f"{source_version.name} 副本"),
        description=str(data.get("description") or source_version.description),
        content=str(data.get("content") or source_version.content),
        source="user",
        readonly=False,
        variables=sorted(set(VARIABLE_RE.findall(str(data.get("content") or source_version.content)))),
        createdAt=now,
        updatedAt=now,
    )
    store = read_prompt_store()
    versions = store.setdefault("versions", {}).setdefault(prompt.id, [])
    versions.append(version.model_dump())
    store.setdefault("active", {})[prompt.id] = version.id
    write_prompt_store(store)
    return version


def update_prompt_version(version_id: str, data: dict) -> PromptVersion:
    store = read_prompt_store()
    for prompt_id, versions in store.get("versions", {}).items():
        for index, item in enumerate(versions):
            if item.get("id") != version_id:
                continue
            current = PromptVersion(**item)
            content = str(data.get("content") if "content" in data else current.content)
            updated = current.model_copy(
                update={
                    "name": str(data.get("name") if "name" in data else current.name),
                    "description": str(data.get("description") if "description" in data else current.description),
                    "content": content,
                    "variables": sorted(set(VARIABLE_RE.findall(content))),
                    "updatedAt": now_iso(),
                }
            )
            versions[index] = updated.model_dump()
            write_prompt_store(store)
            return updated
    raise FileNotFoundError("Prompt version not found")


def delete_prompt_version(version_id: str) -> None:
    store = read_prompt_store()
    for prompt_id, versions in list(store.get("versions", {}).items()):
        next_versions = [item for item in versions if item.get("id") != version_id]
        if len(next_versions) == len(versions):
            continue
        store["versions"][prompt_id] = next_versions
        if store.get("active", {}).get(prompt_id) == version_id:
            store.setdefault("active", {})[prompt_id] = official_version_id(prompt_id)
        write_prompt_store(store)
        return
    raise FileNotFoundError("Prompt version not found")


def activate_prompt_version(prompt_id: str, version_id: str) -> PromptVersion:
    prompt = find_prompt(prompt_id)
    version = get_prompt_version(prompt.id, version_id)
    store = read_prompt_store()
    store.setdefault("active", {})[prompt.id] = version.id
    write_prompt_store(store)
    return version


def read_active_prompt_by_path(prompt_path: str) -> tuple[str, str]:
    prompt_id = f"default:{prompt_path}"
    prompt = find_prompt(prompt_id)
    version = active_version(prompt.id) or official_version(prompt)
    return version.content, version.id


def find_prompt(prompt_id: str) -> RulepackPrompt:
    for pack in list_rulepacks():
        for prompt in pack.prompts:
            if prompt.id == prompt_id:
                return prompt
    raise FileNotFoundError("Prompt not found")


def get_prompt_version(prompt_id: str, version_id: str) -> PromptVersion:
    prompt = find_prompt(prompt_id)
    official = official_version(prompt)
    if version_id == official.id:
        return official
    for backup in official_backup_versions(prompt):
        if version_id == backup.id:
            return backup
    for item in read_prompt_store().get("versions", {}).get(prompt_id, []):
        if item.get("id") == version_id:
            return PromptVersion(**item)
    raise FileNotFoundError("Prompt version not found")


def active_version(prompt_id: str) -> PromptVersion | None:
    active_id = get_active_version_id(prompt_id)
    try:
        return get_prompt_version(prompt_id, active_id)
    except FileNotFoundError:
        return None


def get_active_version_id(prompt_id: str) -> str:
    active_id = read_prompt_store().get("active", {}).get(prompt_id)
    return str(active_id or official_version_id(prompt_id))


def official_version(prompt: RulepackPrompt) -> PromptVersion:
    content = Path(prompt.path).read_text(encoding="utf-8")
    return PromptVersion(
        id=official_version_id(prompt.id),
        promptId=prompt.id,
        name=f"官方 - {prompt.name}",
        description="系统内置官方版本，只读，不可修改。",
        content=content,
        source="official",
        readonly=True,
        variables=sorted(set(VARIABLE_RE.findall(content))),
        createdAt="",
        updatedAt="",
    )


def official_backup_versions(prompt: RulepackPrompt) -> list[PromptVersion]:
    prompt_path = Path(prompt.path)
    versions: list[PromptVersion] = []
    for backup_path in sorted(prompt_path.parent.glob("prompt.bak*.md")):
        content = backup_path.read_text(encoding="utf-8")
        suffix = backup_path.name.removeprefix("prompt.").removesuffix(".md")
        versions.append(
            PromptVersion(
                id=official_backup_version_id(prompt.id, backup_path.name),
                promptId=prompt.id,
                name=f"官方 - {prompt.name} - {suffix}",
                description="系统内置官方备份版本，只读，不可修改。",
                content=content,
                source="official",
                readonly=True,
                variables=sorted(set(VARIABLE_RE.findall(content))),
                createdAt="",
                updatedAt="",
            )
        )
    return versions


def official_version_id(prompt_id: str) -> str:
    encoded = base64.urlsafe_b64encode(prompt_id.encode("utf-8")).decode("ascii").rstrip("=")
    return f"official-{encoded}"


def official_backup_version_id(prompt_id: str, filename: str) -> str:
    encoded = base64.urlsafe_b64encode(f"{prompt_id}:{filename}".encode("utf-8")).decode("ascii").rstrip("=")
    return f"official-{encoded}"


def read_prompt_store() -> dict:
    parsed = read_json(APP_PROMPT_LIBRARY_FILE, {})
    if not isinstance(parsed, dict):
        return {"active": {}, "versions": {}}
    active = parsed.get("active") if isinstance(parsed.get("active"), dict) else {}
    versions = parsed.get("versions") if isinstance(parsed.get("versions"), dict) else {}
    return {"active": active, "versions": versions}


def write_prompt_store(store: dict) -> None:
    write_json(APP_PROMPT_LIBRARY_FILE, {
        "active": store.get("active", {}),
        "versions": store.get("versions", {}),
    })


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
