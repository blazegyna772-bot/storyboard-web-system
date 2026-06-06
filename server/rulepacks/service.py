from __future__ import annotations

import re
from pathlib import Path

from server.core.config import bundled_rulepacks_dir
from server.rulepacks.models import Rulepack, RulepackPrompt

VARIABLE_RE = re.compile(r"\{\{\s*([^{}\s]+)\s*\}\}")


def list_rulepacks() -> list[Rulepack]:
    base = bundled_rulepacks_dir()
    if not base.exists():
        return []
    packs: list[Rulepack] = []
    for pack_dir in sorted(p for p in base.iterdir() if p.is_dir()):
        prompts: list[RulepackPrompt] = []
        for md_path in sorted(pack_dir.rglob("*.md")):
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
                )
            )
        packs.append(Rulepack(id=pack_dir.name, name=pack_dir.name, path=str(pack_dir), prompts=prompts))
    return packs


def read_prompt(prompt_id: str) -> dict:
    for pack in list_rulepacks():
        for prompt in pack.prompts:
            if prompt.id == prompt_id:
                return {"prompt": prompt.model_dump(), "content": Path(prompt.path).read_text(encoding="utf-8")}
    raise FileNotFoundError("Prompt not found")
