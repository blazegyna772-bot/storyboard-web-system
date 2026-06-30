from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from server.llm.models import ChatMessage, LlmChatRequest
from server.llm.service import call_openai_compatible
from server.projects.service import project_dir, read_project, require_active_root
from server.rulepacks.service import read_active_prompt_by_path
from server.storage.json_io import read_json, write_json
from server.story_workflow.models import (
    RunWorkflowAllBody,
    RunWorkflowNodeBody,
    UpdateWorkflowArtifactBody,
    WorkflowArtifact,
    WorkflowEpisodeRef,
    WorkflowNode,
    WorkflowSceneRef,
    WorkflowState,
)


WORKFLOW_DIR = "story_workflow"
CHAPTER_SUMMARY_DIR = "chapter_summary"
EPISODE_SCENE_PROMPT_PATH = "story_workflow_episode_summary_integrated/prompt.md"
EPISODE_SCOPED_NODES = {"episode_summary"}
SCENE_SCOPED_NODES = {"scene_summary", "storyboard_design", "video_prompt"}


NODES: list[WorkflowNode] = [
    WorkflowNode(
        id="story_map",
        title="剧情结构图",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本",
        outputSummary="生产章节划分、全剧剧情结构",
        promptPath="story_workflow_story_map/prompt.md",
    ),
    WorkflowNode(
        id="character_summary",
        title="角色状态图",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本 + 剧情结构图",
        outputSummary="角色身份、处境、关系、认知等剧情状态变化",
        promptPath="story_workflow_character_summary/prompt.md",
        dependsOn=["story_map"],
    ),
    WorkflowNode(
        id="continuity",
        title="视觉资产状态图",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本 + 剧情结构图",
        outputSummary="线索道具、重要空间、视觉影调的跨集状态变化",
        promptPath="story_workflow_continuity/prompt.md",
        dependsOn=["story_map"],
    ),
    WorkflowNode(
        id="series_summary",
        title="全剧信息流汇总",
        page="planning",
        scope="全剧",
        inputSummary="剧情结构图 + 角色状态图 + 视觉资产状态图",
        outputSummary="程序机械合并上游全剧产物，不理解剧情",
        promptPath="story_workflow_series_summary/prompt.md",
        dependsOn=["story_map", "character_summary", "continuity"],
    ),
    WorkflowNode(
        id="chapter_summary",
        title="章节概要",
        page="planning",
        scope="章节",
        inputSummary="当前章节剧本 + 全剧信息流汇总",
        outputSummary="章节级信息流、集级定位、跨集视觉连续性",
        promptPath="story_workflow_chapter_summary/prompt.md",
        dependsOn=["series_summary"],
    ),
    WorkflowNode(
        id="episode_summary",
        title="单集概要",
        page="storyboard",
        scope="单集",
        inputSummary="本集剧本 + 当前章节概要 + 前后集概要",
        outputSummary="单集信息流；集场一体模式下输出场次概要",
        promptPath="story_workflow_episode_summary/prompt.md",
        dependsOn=["chapter_summary"],
    ),
    WorkflowNode(
        id="scene_summary",
        title="场次概要",
        page="storyboard",
        scope="场次",
        inputSummary="本场剧本 + 当前单集概要 + 前后场摘要",
        outputSummary="场级信息流快照",
        promptPath="story_workflow_scene_summary/prompt.md",
        dependsOn=["episode_summary"],
    ),
    WorkflowNode(
        id="storyboard_design",
        title="分块规划",
        page="storyboard",
        scope="场次",
        inputSummary="本场剧本 + 当前场次概要 + 资产索引",
        outputSummary="视频块、剧本真源、估时、结束状态、块级补充信息",
        promptPath="story_workflow_storyboard_design/prompt.md",
        dependsOn=["episode_summary"],
    ),
    WorkflowNode(
        id="video_prompt",
        title="视频提示词",
        page="video",
        scope="生成块",
        inputSummary="当前生成块 + 场级信息流 + 块级补充",
        outputSummary="视频块提示词和资产引用",
        promptPath="story_workflow_video_prompt/prompt.md",
        dependsOn=["storyboard_design"],
    ),
]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_workflow_state(project_id: str) -> WorkflowState:
    root = require_active_root()
    project = read_project(root, project_id, include_script=True)
    base = project_dir(root, project) / "artifacts" / WORKFLOW_DIR
    artifacts: dict[str, WorkflowArtifact] = {}
    for node in NODES:
        if node.id == "chapter_summary":
            continue
        artifact = read_workflow_artifact(base, node)
        if artifact:
            artifacts[node.id] = artifact
    return WorkflowState(projectId=project_id, nodes=NODES, episodes=build_episode_refs(project.script), artifacts=artifacts)


def get_workflow_artifact(
    project_id: str,
    node_id: str,
    chapter_id: str | None = None,
    episode_id: str | None = None,
    scene_id: str | None = None,
) -> WorkflowArtifact | None:
    node = next((item for item in NODES if item.id == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Workflow node not found")
    root = require_active_root()
    project = read_project(root, project_id, include_script=False)
    base = project_dir(root, project) / "artifacts" / WORKFLOW_DIR
    if node.id == "chapter_summary" and chapter_id:
        return read_single_chapter_summary_artifact(base, node, chapter_id)
    if node.id == "chapter_summary":
        return None
    if is_scoped_workflow_node(node.id):
        return read_scoped_workflow_artifact(base, node, episode_id, scene_id)
    return read_workflow_artifact(base, node)


async def run_workflow_node(project_id: str, body: RunWorkflowNodeBody) -> WorkflowArtifact:
    node = next((item for item in NODES if item.id == body.nodeId), None)
    if not node:
        raise HTTPException(status_code=404, detail="Workflow node not found")

    root = require_active_root()
    project = read_project(root, project_id, include_script=True)
    base = project_dir(root, project) / "artifacts" / WORKFLOW_DIR
    base.mkdir(parents=True, exist_ok=True)

    state = get_workflow_state(project_id)
    context_artifacts = workflow_artifacts_for_context(base, state.artifacts, body.episodeId, body.sceneId)
    variables = build_node_variables(base, project.script, context_artifacts, body)
    input_summary = summarize_variables_for_log(variables, node)
    chapter_ref = select_chapter_ref(
        context_artifacts,
        split_project_script(project.script),
        variables.get("当前集编号", body.episodeId or "EP01"),
        body.chapterId,
    )

    running_artifact = build_workflow_artifact(
        base,
        nodeId=node.id,
        title=node.title,
        status="running",
        updatedAt=now_iso(),
        inputSummary=input_summary,
    )
    if node.id == "chapter_summary":
        write_chapter_summary_meta(base, node, chapter_ref, running_artifact)
    elif is_scoped_workflow_node(node.id):
        write_scoped_workflow_meta(base, running_artifact, variables.get("当前集编号"), variables.get("当前场编号"))
    else:
        write_workflow_meta(base, running_artifact)

    if node.id == "series_summary":
        output = build_series_mechanical_summary(state.artifacts)
        artifact = WorkflowArtifact(
            nodeId=node.id,
            title=node.title,
            status="done",
            updatedAt=now_iso(),
            inputSummary=input_summary,
            output=output,
            rawText=json.dumps(output, ensure_ascii=False, indent=2),
        )
        write_workflow_output(base, artifact)
        return artifact

    prompt, prompt_version_id = read_node_prompt(node, body.executionMode)
    system_prompt = render_template(prompt, variables)
    user_prompt = build_user_prompt(node, variables)

    try:
        response = await call_openai_compatible(
            LlmChatRequest(
                stageId=f"story-workflow:{node.id}",
                label=node.title,
                promptId=prompt_version_id,
                jsonMode=True,
                maxTokens=body.maxTokens or default_max_tokens(node.id),
                messages=[
                    ChatMessage(role="system", content=system_prompt),
                    ChatMessage(role="user", content=user_prompt),
                ],
            )
        )
        content = extract_response_content(response)
        parsed = parse_json_text(content)
        if node.id == "chapter_summary":
            parsed = normalize_chapter_summary_output(parsed, chapter_ref)
            artifact = WorkflowArtifact(
                nodeId=node.id,
                title=node.title,
                status="done",
                updatedAt=now_iso(),
                inputSummary=input_summary,
                output=parsed,
                rawText=content,
            )
            write_chapter_summary_output(base, node, chapter_ref, artifact)
            return artifact
        if node.id == "episode_summary" and body.executionMode == "integrated":
            episode_output, scene_output = normalize_episode_scene_output(parsed, variables)
            artifact = WorkflowArtifact(
                nodeId=node.id,
                title=node.title,
                status="done",
                updatedAt=now_iso(),
                inputSummary=input_summary,
                output=episode_output,
                rawText=content,
            )
            scene_node = require_node("scene_summary")
            scene_artifact = WorkflowArtifact(
                nodeId=scene_node.id,
                title=scene_node.title,
                status="done",
                updatedAt=artifact.updatedAt,
                inputSummary=input_summary,
                output=scene_output,
                rawText=content,
            )
            write_scoped_workflow_output(base, scene_artifact, variables.get("当前集编号"), variables.get("当前场编号"))
        else:
            if node.id == "video_prompt":
                parsed = normalize_video_prompt_output(parsed, variables.get("当前分块规划", ""))
                parsed = merge_video_prompt_output(context_artifacts.get("video_prompt"), parsed, replace_all=is_full_scene_video_prompt(body))
            artifact = WorkflowArtifact(
                nodeId=node.id,
                title=node.title,
                status="done",
                updatedAt=now_iso(),
                inputSummary=input_summary,
                output=parsed,
                rawText=content,
            )
    except Exception as exc:
        artifact = build_workflow_artifact(
            base,
            nodeId=node.id,
            title=node.title,
            status="error",
            updatedAt=now_iso(),
            inputSummary=input_summary,
            error=str(exc),
        )
        if node.id == "chapter_summary":
            write_chapter_summary_meta(base, node, chapter_ref, artifact)
        elif is_scoped_workflow_node(node.id):
            write_scoped_workflow_meta(base, artifact, variables.get("当前集编号"), variables.get("当前场编号"))
        else:
            write_workflow_meta(base, artifact)
        raise

    if is_scoped_workflow_node(node.id):
        write_scoped_workflow_output(base, artifact, variables.get("当前集编号"), variables.get("当前场编号"))
    else:
        write_workflow_output(base, artifact)
    return artifact


async def run_workflow_all(project_id: str, body: RunWorkflowAllBody) -> list[WorkflowArtifact]:
    node_ids = body.nodeIds or [node.id for node in NODES]
    artifacts: list[WorkflowArtifact] = []
    for node_id in node_ids:
        if node_id == "chapter_summary":
            chapter_ids = body.chapterIds or workflow_chapter_ids(project_id)
            if chapter_ids:
                for chapter_id in chapter_ids:
                    artifact = await run_workflow_node(
                        project_id,
                        RunWorkflowNodeBody(
                            nodeId=node_id,
                            episodeId=body.episodeId,
                            sceneId=body.sceneId,
                            chapterId=chapter_id,
                            executionMode=body.executionMode,
                            maxTokens=body.maxTokens,
                            targetChapterCount=body.targetChapterCount,
                        ),
                    )
                    artifacts.append(artifact)
                continue
        artifact = await run_workflow_node(
            project_id,
            RunWorkflowNodeBody(
                nodeId=node_id,
                episodeId=body.episodeId,
                sceneId=body.sceneId,
                chapterId=body.chapterId,
                executionMode=body.executionMode,
                maxTokens=body.maxTokens,
                targetChapterCount=body.targetChapterCount,
            ),
        )
        artifacts.append(artifact)
    return artifacts


def workflow_chapter_ids(project_id: str) -> list[str]:
    state = get_workflow_state(project_id)
    root = require_active_root()
    project = read_project(root, project_id, include_script=True)
    episodes = split_project_script(project.script)
    chapter_map = extract_chapter_map(state.artifacts)
    chapter_ids = [normalize_chapter_id(chapter.get("chapter_id")) for chapter in chapter_map if as_dict(chapter)]
    if chapter_ids:
        return chapter_ids
    return [normalize_chapter_id(select_chapter_ref(state.artifacts, episodes, episodes[0]["episodeId"], None).get("chapter_id"))]


def update_workflow_artifact(project_id: str, node_id: str, body: UpdateWorkflowArtifactBody) -> WorkflowArtifact:
    node = next((item for item in NODES if item.id == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail="Workflow node not found")
    root = require_active_root()
    project = read_project(root, project_id, include_script=False)
    base = project_dir(root, project) / "artifacts" / WORKFLOW_DIR
    base.mkdir(parents=True, exist_ok=True)
    raw_text = body.rawText.strip() or json.dumps(body.output, ensure_ascii=False, indent=2)
    output = body.output
    if not output and raw_text:
        output = parse_json_text(raw_text)
    artifact = WorkflowArtifact(
        nodeId=node.id,
        title=node.title,
        status="done",
        updatedAt=now_iso(),
        inputSummary="人工编辑保存",
        output=output,
        rawText=raw_text,
    )
    if node.id == "chapter_summary":
        chapter_id = normalize_chapter_id(body.chapterId or first_chapter_id(output))
        chapter_ref = {"chapter_id": chapter_id, "episode_range": chapter_card_episode_range(output), "episode_ids": []}
        artifact.output = normalize_chapter_summary_output(output, chapter_ref)
        write_chapter_summary_output(base, node, chapter_ref, artifact)
        return artifact
    if is_scoped_workflow_node(node.id):
        write_scoped_workflow_output(base, artifact, body.episodeId, body.sceneId)
        return artifact
    write_workflow_output(base, artifact)
    return artifact


def is_scoped_workflow_node(node_id: str) -> bool:
    return node_id in EPISODE_SCOPED_NODES or node_id in SCENE_SCOPED_NODES


def normalize_episode_id(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "EP01"
    match = re.search(r"([0-9０-９]+)", raw)
    if match:
        return f"EP{marker_number(match.group(1)):02d}"
    match = re.search(r"([一二三四五六七八九十百零〇两]+)", raw)
    if match:
        return f"EP{marker_number(match.group(1)):02d}"
    return re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_") or "EP01"


def normalize_scene_id(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "SC01"
    match = re.search(r"([0-9０-９]+)", raw)
    if match:
        return f"SC{marker_number(match.group(1)):02d}"
    match = re.search(r"([一二三四五六七八九十百零〇两]+)", raw)
    if match:
        return f"SC{marker_number(match.group(1)):02d}"
    return re.sub(r"[^A-Za-z0-9_-]+", "_", raw).strip("_") or "SC01"


def scoped_artifact_dir(base: Path, node_id: str) -> Path:
    return base / node_id


def scoped_artifact_stem(node_id: str, episode_id: str | None, scene_id: str | None) -> str:
    episode = normalize_episode_id(episode_id)
    if node_id in EPISODE_SCOPED_NODES:
        return episode
    return f"{episode}_{normalize_scene_id(scene_id)}"


def scoped_artifact_path(base: Path, node_id: str, episode_id: str | None, scene_id: str | None) -> Path:
    return scoped_artifact_dir(base, node_id) / f"{scoped_artifact_stem(node_id, episode_id, scene_id)}.json"


def scoped_artifact_meta_path(base: Path, node_id: str, episode_id: str | None, scene_id: str | None) -> Path:
    return scoped_artifact_dir(base, node_id) / f"{scoped_artifact_stem(node_id, episode_id, scene_id)}.meta.json"


def read_scoped_workflow_artifact(base: Path, node: WorkflowNode, episode_id: str | None, scene_id: str | None) -> WorkflowArtifact | None:
    if node.id == "chapter_summary":
        return None
    output_path = scoped_artifact_path(base, node.id, episode_id, scene_id)
    meta_path = scoped_artifact_meta_path(base, node.id, episode_id, scene_id)
    artifact = read_workflow_artifact_from_paths(node, output_path, meta_path)
    if artifact:
        return artifact
    return read_workflow_artifact(base, node)


def write_scoped_workflow_output(base: Path, artifact: WorkflowArtifact, episode_id: str | None, scene_id: str | None) -> None:
    write_json(scoped_artifact_path(base, artifact.nodeId, episode_id, scene_id), artifact.output)
    write_scoped_workflow_meta(base, artifact, episode_id, scene_id)


def write_scoped_workflow_meta(base: Path, artifact: WorkflowArtifact, episode_id: str | None, scene_id: str | None) -> None:
    write_json(
        scoped_artifact_meta_path(base, artifact.nodeId, episode_id, scene_id),
        {
            "nodeId": artifact.nodeId,
            "title": artifact.title,
            "episodeId": normalize_episode_id(episode_id),
            "sceneId": normalize_scene_id(scene_id) if artifact.nodeId in SCENE_SCOPED_NODES else "",
            "status": artifact.status,
            "updatedAt": artifact.updatedAt,
            "inputSummary": artifact.inputSummary,
            "rawText": artifact.rawText,
            "error": artifact.error,
        },
    )


def workflow_artifacts_for_context(
    base: Path,
    artifacts: dict[str, WorkflowArtifact],
    episode_id: str | None,
    scene_id: str | None,
) -> dict[str, WorkflowArtifact]:
    context = dict(artifacts)
    for node_id in EPISODE_SCOPED_NODES | SCENE_SCOPED_NODES:
        node = require_node(node_id)
        scoped = read_scoped_workflow_artifact(base, node, episode_id, scene_id)
        if scoped:
            context[node_id] = scoped
    return context


def read_workflow_artifact(base: Path, node: WorkflowNode) -> WorkflowArtifact | None:
    if node.id == "chapter_summary":
        return None
    return read_workflow_artifact_from_paths(node, base / f"{node.id}.json", base / f"{node.id}.meta.json")


def read_workflow_artifact_from_paths(node: WorkflowNode, output_path: Path, meta_path: Path) -> WorkflowArtifact | None:
    output_data = read_json(output_path, None)
    meta_data = read_json(meta_path, {})
    if not isinstance(meta_data, dict):
        meta_data = {}
    if not isinstance(output_data, dict):
        if meta_data:
            status = meta_data.get("status") if meta_data.get("status") in {"idle", "running", "done", "error"} else "idle"
            return WorkflowArtifact(
                nodeId=node.id,
                title=str(meta_data.get("title") or node.title),
                status=status,
                updatedAt=str(meta_data.get("updatedAt") or ""),
                inputSummary=str(meta_data.get("inputSummary") or ""),
                output={},
                rawText=str(meta_data.get("rawText") or ""),
                error=str(meta_data.get("error") or ""),
            )
        return None

    # Backward compatibility for older wrapped artifact files.
    if "output" in output_data or "rawText" in output_data or "status" in output_data:
        output = output_data.get("output") if isinstance(output_data.get("output"), dict) else {}
        meta_data = {**output_data, **meta_data}
    else:
        output = output_data

    status = meta_data.get("status") if meta_data.get("status") in {"idle", "running", "done", "error"} else "done"
    return WorkflowArtifact(
        nodeId=node.id,
        title=str(meta_data.get("title") or node.title),
        status=status,
        updatedAt=str(meta_data.get("updatedAt") or ""),
        inputSummary=str(meta_data.get("inputSummary") or ""),
        output=output,
        rawText=str(meta_data.get("rawText") or json.dumps(output, ensure_ascii=False, indent=2)),
        error=str(meta_data.get("error") or ""),
    )


def build_workflow_artifact(base: Path, **updates: Any) -> WorkflowArtifact:
    node_id = updates.get("nodeId")
    node = next((item for item in NODES if item.id == node_id), None)
    output: dict[str, Any] = {}
    if node:
        current = read_workflow_artifact(base, node)
        output = current.output if current else {}
    return WorkflowArtifact(output=output, **updates)


def write_workflow_output(base: Path, artifact: WorkflowArtifact) -> None:
    write_json(base / f"{artifact.nodeId}.json", artifact.output)
    write_workflow_meta(base, artifact)


def write_workflow_meta(base: Path, artifact: WorkflowArtifact) -> None:
    write_json(
        base / f"{artifact.nodeId}.meta.json",
        {
            "nodeId": artifact.nodeId,
            "title": artifact.title,
            "status": artifact.status,
            "updatedAt": artifact.updatedAt,
            "inputSummary": artifact.inputSummary,
            "rawText": artifact.rawText,
            "error": artifact.error,
        },
    )


def chapter_summary_dir(base: Path) -> Path:
    return base / CHAPTER_SUMMARY_DIR


def normalize_chapter_id(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return "chapter_01"
    match = re.search(r"([0-9０-９]+)", raw)
    if match:
        return f"chapter_{marker_number(match.group(1)):02d}"
    match = re.search(r"([一二三四五六七八九十百零〇两]+)", raw)
    if match:
        return f"chapter_{marker_number(match.group(1)):02d}"
    if raw.upper().startswith("CH"):
        return normalize_chapter_id(raw[2:])
    if raw.startswith("chapter_"):
        return raw
    return raw


def chapter_number_label(chapter_id: str) -> str:
    number = marker_number(chapter_id.replace("chapter_", "").replace("CH", "")) or 1
    return f"第{number}章"


def chapter_file_name(chapter_id: str) -> str:
    number = marker_number(normalize_chapter_id(chapter_id).replace("chapter_", "")) or 1
    return f"chapter_summary_{number:02d}.json"


def chapter_meta_name(chapter_id: str) -> str:
    number = marker_number(normalize_chapter_id(chapter_id).replace("chapter_", "")) or 1
    return f"chapter_summary_{number:02d}.meta.json"


def chapter_summary_path(base: Path, chapter_id: str) -> Path:
    return chapter_summary_dir(base) / chapter_file_name(chapter_id)


def chapter_summary_meta_path(base: Path, chapter_id: str) -> Path:
    return chapter_summary_dir(base) / chapter_meta_name(chapter_id)


def read_chapter_summary_output_file(base: Path, chapter_id: str) -> dict[str, Any]:
    output = read_json(chapter_summary_path(base, chapter_id), None)
    return output if isinstance(output, dict) else {}


def read_chapter_summary_meta_file(base: Path, chapter_id: str) -> dict[str, Any]:
    meta = read_json(chapter_summary_meta_path(base, chapter_id), None)
    return meta if isinstance(meta, dict) else {}


def first_chapter_id(output: dict[str, Any]) -> str:
    cards = as_list(output.get("chapter_cards"))
    if cards:
        card = as_dict(cards[0])
        if card.get("chapter_id"):
            return normalize_chapter_id(card.get("chapter_id"))
    return normalize_chapter_id(output.get("chapter_id"))


def normalize_chapter_summary_output(parsed: dict[str, Any], chapter_ref: dict[str, Any]) -> dict[str, Any]:
    chapter_id = normalize_chapter_id(chapter_ref.get("chapter_id"))
    if parsed.get("chapter_flow") or parsed.get("episode_outline"):
        output = {key: value for key, value in parsed.items() if key != "chapter_review_risks"}
        output["chapter_id"] = chapter_id
        output.setdefault("chapter_source_scope", text_value(chapter_ref.get("chapter_name")))
        output.setdefault("episode_range", chapter_ref.get("episode_range") or "")
        output.setdefault("chapter_flow", {})
        output.setdefault("episode_outline", [])
        output.setdefault("review_notes", [])
        return output

    incoming_cards = as_list(parsed.get("chapter_cards"))
    card = as_dict(incoming_cards[0]) if incoming_cards else parsed
    chapter_flow = {
        "narrative": text_value(card.get("chapter_function") or card.get("chapter_note")),
        "character_state": "",
        "asset_refs": [],
        "space_state": "",
        "visual_tone": text_value(card.get("emotional_tone")),
        "continuity": normalize_continuity_items(card.get("required_motifs_or_foreshadowing")),
    }
    episode_outline = []
    for item in as_list(card.get("episode_titles")):
        episode = as_dict(item)
        if not episode:
            continue
        episode_outline.append({
            "episode_id": text_value(episode.get("episode_id")),
            "episode_position": "",
            "episode_note": text_value(episode.get("one_line_synopsis") or episode.get("title")),
        })
    return {
        "chapter_id": chapter_id,
        "chapter_source_scope": text_value(card.get("chapter_name") or chapter_ref.get("chapter_name")),
        "episode_range": text_value(card.get("episode_range") or chapter_ref.get("episode_range")),
        "chapter_flow": chapter_flow,
        "episode_outline": episode_outline,
        "review_notes": as_list(parsed.get("review_notes") or parsed.get("chapter_review_risks")),
    }


def read_chapter_summary_meta(base: Path, chapter_id: str) -> dict[str, Any]:
    return read_chapter_summary_meta_file(base, chapter_id)


def write_chapter_summary_meta(base: Path, node: WorkflowNode, chapter_ref: dict[str, Any], artifact: WorkflowArtifact) -> None:
    chapter_id = normalize_chapter_id(chapter_ref.get("chapter_id"))
    write_json(
        chapter_summary_meta_path(base, chapter_id),
        {
            "nodeId": artifact.nodeId,
            "title": artifact.title,
            "chapterId": chapter_id,
            "status": artifact.status,
            "updatedAt": artifact.updatedAt,
            "inputSummary": artifact.inputSummary,
            "rawText": artifact.rawText,
            "error": artifact.error,
        },
    )


def write_chapter_summary_output(base: Path, node: WorkflowNode, chapter_ref: dict[str, Any], artifact: WorkflowArtifact) -> None:
    chapter_id = normalize_chapter_id(chapter_ref.get("chapter_id"))
    artifact.output = normalize_chapter_summary_output(artifact.output, {**chapter_ref, "chapter_id": chapter_id})
    write_json(chapter_summary_path(base, chapter_id), artifact.output)
    write_chapter_summary_meta(base, node, {**chapter_ref, "chapter_id": chapter_id}, artifact)


def read_single_chapter_summary_artifact(base: Path, node: WorkflowNode, chapter_id: str) -> WorkflowArtifact | None:
    normalized_id = normalize_chapter_id(chapter_id)
    output = read_chapter_summary_output_file(base, normalized_id)
    meta = read_chapter_summary_meta_file(base, normalized_id)
    if not output and not meta:
        return None
    status = meta.get("status") if meta.get("status") in {"idle", "running", "done", "error"} else ("done" if output else "idle")
    return WorkflowArtifact(
        nodeId=node.id,
        title=node.title,
        status=status,
        updatedAt=str(meta.get("updatedAt") or ""),
        inputSummary=str(meta.get("inputSummary") or ""),
        output=output,
        rawText=str(meta.get("rawText") or json.dumps(output, ensure_ascii=False, indent=2)),
        error=str(meta.get("error") or ""),
    )


def chapter_card_episode_range(output: dict[str, Any]) -> str:
    if output.get("episode_range"):
        return str(output.get("episode_range") or "")
    card = as_dict(next(iter(as_list(output.get("chapter_cards"))), {}))
    return str(card.get("episode_range") or "")


def build_series_mechanical_summary(artifacts: dict[str, WorkflowArtifact]) -> dict[str, Any]:
    story_map = artifacts.get("story_map").output if artifacts.get("story_map") else {}
    character_summary = artifacts.get("character_summary").output if artifacts.get("character_summary") else {}
    continuity = artifacts.get("continuity").output if artifacts.get("continuity") else {}
    story_map = story_map if isinstance(story_map, dict) else {}
    character_summary = character_summary if isinstance(character_summary, dict) else {}
    continuity = continuity if isinstance(continuity, dict) else {}
    review_notes: list[Any] = []
    for output in (story_map, character_summary, continuity):
        review_notes.extend(as_list(output.get("review_notes")))
    return {
        "series_flow": {
            "narrative": text_value(story_map.get("series_narrative") or story_map.get("mainline")),
            "character_state": character_summary.get("character_flows") or character_summary.get("main_characters") or "",
            "asset_refs": [],
            "space_state": continuity.get("space_flows") or continuity.get("recurring_spaces") or "",
            "visual_tone": continuity.get("visual_tone_flows") or continuity.get("visual_motifs") or "",
            "continuity": continuity.get("visual_continuities") or continuity.get("asset_change_risks") or [],
        },
        "chapter_map": story_map.get("chapter_map", []),
        "review_notes": review_notes,
    }


def require_node(node_id: str) -> WorkflowNode:
    node = next((item for item in NODES if item.id == node_id), None)
    if not node:
        raise HTTPException(status_code=500, detail=f"Missing workflow node: {node_id}")
    return node


def normalize_episode_scene_output(parsed: dict[str, Any], variables: dict[str, str]) -> tuple[dict[str, Any], dict[str, Any]]:
    episode_id = variables.get("当前集编号") or "EP01"
    episode_output = as_dict(parsed.get("episode_summary"))
    if not episode_output:
        episode_output = {
            key: value
            for key, value in parsed.items()
            if key not in {"scene_summaries", "scene_summary"}
        }
    episode_output["episode_id"] = str(episode_output.get("episode_id") or episode_id)
    episode_output.setdefault("episode_position_note", "")
    episode_output.setdefault("review_notes", [])

    incoming_scenes = as_list(parsed.get("scene_summaries"))
    if not incoming_scenes and parsed.get("scene_summary"):
        incoming_scenes = [parsed.get("scene_summary")]
    scene_summaries: list[dict[str, Any]] = []
    for index, item in enumerate(incoming_scenes, start=1):
        scene = as_dict(item)
        if not scene:
            continue
        scene["episode_id"] = str(scene.get("episode_id") or episode_id)
        scene["scene_id"] = str(scene.get("scene_id") or f"SC{index:02d}")
        scene_summaries.append(normalize_scene_summary_item(scene))
    return episode_output, {"episode_id": episode_id, "scene_summaries": scene_summaries}


def normalize_scene_summary_item(scene: dict[str, Any]) -> dict[str, Any]:
    if scene.get("scene_flow"):
        scene.setdefault("review_notes", [])
        return scene
    asset_bindings = as_dict(scene.get("asset_bindings"))
    asset_refs: list[Any] = []
    for key in ("characters", "scenes", "props"):
        asset_refs.extend(as_list(asset_bindings.get(key)))
    scene_flow = {
        "narrative": text_value(scene.get("scene_dramatic_task") or scene.get("must_emphasize_information")),
        "character_state": scene.get("character_entry_states") or "",
        "asset_refs": normalize_asset_refs(asset_refs),
        "space_state": text_value(scene.get("spatial_relation")),
        "visual_tone": text_value(scene.get("rhythm_atmosphere")),
        "continuity": normalize_continuity_items(scene.get("continuity_risks") or scene.get("carry_over_or_hook")),
    }
    return {
        "episode_id": text_value(scene.get("episode_id")),
        "scene_id": text_value(scene.get("scene_id")),
        "scene_position": text_value(scene.get("scene_position")),
        "scene_source_scope": text_value(scene.get("scene_source_scope") or scene.get("scene_name")),
        "scene_flow": scene_flow,
        "review_notes": as_list(scene.get("review_notes")),
    }


def normalize_continuity_items(value: Any) -> list[dict[str, str]]:
    items = as_list(value)
    if not items and text_present(value):
        items = [value]
    normalized: list[dict[str, str]] = []
    for item in items:
        record = as_dict(item)
        if record:
            target = text_value(record.get("target") or record.get("target_name") or record.get("name") or record.get("motif"))
            note = text_value(record.get("note") or record.get("risk") or record.get("state_risk") or record.get("change_or_risk") or record.get("reason") or record)
        else:
            target = ""
            note = text_value(item)
        if target or note:
            normalized.append({"target": target, "note": note})
    return normalized


def normalize_asset_refs(value: Any) -> list[dict[str, str]]:
    refs = as_list(value)
    if not refs and text_present(value):
        refs = [value]
    normalized: list[dict[str, str]] = []
    for item in refs:
        record = as_dict(item)
        if record:
            display_name = text_value(record.get("display_name") or record.get("name") or record.get("base_name"))
            asset_id = text_value(record.get("asset_id") or record.get("id"))
            version_id = text_value(record.get("version_id") or record.get("version") or record.get("version_label"))
        else:
            display_name = text_value(item)
            asset_id = ""
            version_id = ""
        if display_name or asset_id or version_id:
            normalized.append({
                "display_name": display_name,
                "asset_id": asset_id,
                "version_id": version_id,
            })
    return normalized


def scene_summary_text_for_scene(artifacts: dict[str, WorkflowArtifact], scene_id: str) -> str:
    artifact = artifacts.get("scene_summary")
    if not artifact:
        return ""
    selected = select_scene_summary_output(artifact.output, scene_id)
    if selected:
        return json.dumps(selected, ensure_ascii=False, indent=2)
    return artifact_text(artifacts, "scene_summary")


def select_scene_summary_output(output: dict[str, Any], scene_id: str) -> dict[str, Any]:
    scene_summaries = as_list(output.get("scene_summaries"))
    if not scene_summaries:
        return output
    normalized_scene_id = str(scene_id or "").strip()
    for item in scene_summaries:
        scene = as_dict(item)
        if str(scene.get("scene_id") or "").strip() == normalized_scene_id:
            return scene
    return as_dict(scene_summaries[0]) if scene_summaries else {}


def read_node_prompt(node: WorkflowNode, execution_mode: str = "separate") -> tuple[str, str]:
    try:
        if node.id == "episode_summary" and execution_mode == "integrated":
            return read_active_prompt_by_path(EPISODE_SCENE_PROMPT_PATH)
        return read_active_prompt_by_path(node.promptPath)
    except FileNotFoundError:
        prompt_path = EPISODE_SCENE_PROMPT_PATH if node.id == "episode_summary" and execution_mode == "integrated" else node.promptPath
        raise HTTPException(status_code=500, detail=f"Missing prompt file: {prompt_path}")


def build_node_variables(base: Path, script: str, artifacts: dict[str, WorkflowArtifact], body: RunWorkflowNodeBody) -> dict[str, str]:
    episodes = split_project_script(script)
    selected_episode = select_episode_text(episodes, body.episodeId)
    scenes = split_episode_scenes(selected_episode["text"])
    selected_scene = select_scene_text(scenes, body.sceneId)
    previous_episode, next_episode = adjacent_episode_summaries(episodes, selected_episode["episodeId"])
    previous_scene, next_scene = adjacent_scene_summaries(scenes, selected_scene["sceneId"])
    chapter_ref = select_chapter_ref(artifacts, episodes, selected_episode["episodeId"], body.chapterId)
    chapter_script = build_chapter_script(episodes, chapter_ref)
    current_chapter_summary = chapter_summary_output_text(base, chapter_ref["chapter_id"])
    current_block_plan = video_block_plan_text_for_scene(artifacts, selected_episode["episodeId"], selected_scene["sceneId"], body)
    return {
        "全集剧本": script,
        "目标章节数": target_chapter_count_text(body.targetChapterCount),
        "当前章节剧本": chapter_script,
        "当前集剧本": selected_episode["text"],
        "当前场剧本": selected_scene["text"],
        "当前章节编号": chapter_ref["chapter_id"],
        "当前集编号": selected_episode["episodeId"],
        "当前场编号": selected_scene["sceneId"],
        "当前集场次数": str(len(scenes)),
        "当前集场次列表": "\n".join(f"{scene['sceneId']}：{scene['title']}" for scene in scenes),
        "前后集概要": f"上一集：{previous_episode}\n下一集：{next_episode}",
        "前后场概要": f"上一场：{previous_scene}\n下一场：{next_scene}",
        "剧情地图": artifact_text(artifacts, "story_map"),
        "角色概要": artifact_text(artifacts, "character_summary"),
        "信息连续性": artifact_text(artifacts, "continuity"),
        "全集概要": artifact_text(artifacts, "series_summary"),
        "当前章节概要": current_chapter_summary,
        "当前单集概要": artifact_text(artifacts, "episode_summary"),
        "当前场次概要": scene_summary_text_for_scene(artifacts, selected_scene["sceneId"]),
        "当前分块规划": current_block_plan,
        "视频提示词生成模式": video_prompt_generation_mode(body),
        "上一块视频提示词": previous_video_prompt_from_block_plan_text(current_block_plan),
        "资产真源": asset_reference_index_text(base.parent.parent),
    }


def video_prompt_generation_mode(body: RunWorkflowNodeBody) -> str:
    if body.blockId:
        return "当前块"
    if body.blockStart or body.blockEnd:
        return "区间"
    return "整场"


def is_full_scene_video_prompt(body: RunWorkflowNodeBody) -> bool:
    return not body.blockId and not body.blockStart and not body.blockEnd


def asset_reference_index_text(project_base: Path) -> str:
    index = {
        "characters": compact_asset_index_rows(project_base / "true_sources" / "characters.json", "角色"),
        "scenes": compact_asset_index_rows(project_base / "true_sources" / "scenes.json", "场景"),
        "props": compact_asset_index_rows(project_base / "true_sources" / "props.json", "道具"),
    }
    if not any(index.values()):
        return "未找到资产索引；只能使用剧本原名，asset_id 留空，禁止发明资产 ID。"
    return json.dumps(index, ensure_ascii=False, separators=(",", ":"))


def compact_asset_index_rows(path: Path, asset_type: str) -> list[dict[str, Any]]:
    rows = read_json(path, [])
    if not isinstance(rows, list):
        return []
    compacted: list[dict[str, Any]] = []
    for row in rows:
        record = as_dict(row)
        if not record:
            continue
        name = text_value(record.get("name"))
        base_name = text_value(record.get("base_name"))
        item = {
            "asset_id": text_value(record.get("id")),
            "version_id": text_value(record.get("version_id") or record.get("id")),
            "name": name,
            "base_name": base_name,
            "type": asset_type,
            "version_label": infer_asset_version_label(name, base_name),
            "status": text_value(record.get("status")),
        }
        compacted_item = {key: value for key, value in item.items() if text_present(value)}
        if compacted_item:
            compacted.append(compacted_item)
    return compacted


def infer_asset_version_label(name: str, base_name: str) -> str:
    if base_name and name.startswith(base_name):
        version = name[len(base_name):].lstrip("-_ /")
        return version.strip()
    return ""


def text_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def compact_asset_rows(path: Path, keys: list[str]) -> list[dict[str, Any]]:
    rows = read_json(path, [])
    if not isinstance(rows, list):
        return []
    compacted: list[dict[str, Any]] = []
    for row in rows:
        record = as_dict(row)
        if not record:
            continue
        item = {key: record.get(key) for key in keys if text_present(record.get(key))}
        if item:
            compacted.append(item)
    return compacted


def text_present(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict)):
        return bool(value)
    return True


def build_episode_refs(script: str) -> list[WorkflowEpisodeRef]:
    refs: list[WorkflowEpisodeRef] = []
    for episode in split_project_script(script):
      scenes = split_episode_scenes(episode["text"])
      refs.append(
          WorkflowEpisodeRef(
              episodeId=episode["episodeId"],
              title=episode["title"],
              scenes=[WorkflowSceneRef(sceneId=scene["sceneId"], title=scene["title"]) for scene in scenes],
          )
      )
    return refs


def build_user_prompt(node: WorkflowNode, variables: dict[str, str]) -> str:
    if node.id in {"story_map", "character_summary", "continuity"}:
        return "请根据系统提示处理全集剧本。"
    if node.id == "chapter_summary":
        return f"请输出 {variables['当前章节编号']} 的章节概要。"
    if node.id == "episode_summary":
        return f"请输出 {variables['当前集编号']} 的集级或集场一体产物。"
    if node.id in {"scene_summary", "storyboard_design"}:
        return f"请处理 {variables['当前集编号']} / {variables['当前场编号']}。"
    if node.id == "video_prompt":
        return "请根据当前分块规划中的 video_blocks 输出 video_prompts；只输出 JSON。"
    return "请根据系统提示输出结果。"


def target_chapter_count_text(value: int | None) -> str:
    if not value:
        return "未指定"
    try:
        count = int(value)
    except (TypeError, ValueError):
        return "未指定"
    if count <= 0:
        return "未指定"
    return str(min(count, 99))


def render_template(template: str, variables: dict[str, str]) -> str:
    rendered = template
    for key, value in variables.items():
        rendered = rendered.replace("{{" + key + "}}", value)
    return rendered


def artifact_text(artifacts: dict[str, WorkflowArtifact], node_id: str) -> str:
    artifact = artifacts.get(node_id)
    if not artifact or not artifact.output:
        return ""
    return json.dumps(artifact.output, ensure_ascii=False, indent=2)


def video_block_plan_text_for_scene(artifacts: dict[str, WorkflowArtifact], episode_id: str, scene_id: str, body: RunWorkflowNodeBody) -> str:
    artifact = artifacts.get("storyboard_design")
    if not artifact or not artifact.output:
        return ""
    output = strip_storyboard_review_notes(artifact.output)
    if not isinstance(output, dict):
        return json.dumps(output, ensure_ascii=False, indent=2)
    output_episode = text_value(output.get("episode_id"))
    output_scene = text_value(output.get("scene_id"))
    if output_episode == episode_id and output_scene == scene_id:
        return json.dumps(filter_video_blocks_for_request(artifacts, output, body), ensure_ascii=False, indent=2)
    return json.dumps({
        "episode_id": episode_id,
        "scene_id": scene_id,
        "video_blocks": [],
        "warning": "未找到当前集/场对应的分块规划，请先运行当前场分块规划。",
    }, ensure_ascii=False, indent=2)


def filter_video_blocks_for_request(artifacts: dict[str, WorkflowArtifact], output: dict[str, Any], body: RunWorkflowNodeBody) -> dict[str, Any]:
    blocks = [as_dict(item) for item in as_list(output.get("video_blocks")) if as_dict(item)]
    if not blocks:
        return output
    selected_ids = requested_block_ids(blocks, body)
    if not selected_ids:
        return output
    selected_set = set(selected_ids)
    previous_prompt = previous_video_prompt_for_block(artifacts, output, selected_ids[0])
    return {
        **output,
        "video_blocks": [block for block in blocks if text_value(block.get("block_id")) in selected_set],
        "previous_video_prompt": previous_prompt,
        "requested_block_range": {
            "block_start": selected_ids[0],
            "block_end": selected_ids[-1],
        },
    }


def requested_block_ids(blocks: list[dict[str, Any]], body: RunWorkflowNodeBody) -> list[str]:
    ids = [text_value(block.get("block_id")) for block in blocks if text_value(block.get("block_id"))]
    if body.blockId:
        block_id = text_value(body.blockId)
        return [block_id] if block_id in ids else []
    if not body.blockStart and not body.blockEnd:
        return []
    start = text_value(body.blockStart) or ids[0]
    end = text_value(body.blockEnd) or start
    if start not in ids or end not in ids:
        return []
    start_index = ids.index(start)
    end_index = ids.index(end)
    if start_index > end_index:
        start_index, end_index = end_index, start_index
    return ids[start_index:end_index + 1]


def previous_video_prompt_for_block(artifacts: dict[str, WorkflowArtifact], output: dict[str, Any], block_id: str) -> str:
    blocks = [as_dict(item) for item in as_list(output.get("video_blocks")) if as_dict(item)]
    ids = [text_value(block.get("block_id")) for block in blocks]
    if block_id not in ids:
        return ""
    index = ids.index(block_id)
    if index <= 0:
        return ""
    previous_id = ids[index - 1]
    video_prompt = artifacts.get("video_prompt")
    if not video_prompt or video_prompt.status != "done":
        return f"上一块编号：{previous_id}，暂无已生成提示词。"
    prompts = video_prompt_items(video_prompt.output)
    previous_group = next((item for item in prompts if text_value(item.get("block_id")) == previous_id), {})
    prompt = text_value(previous_group.get("prompt"))
    if not prompt:
        return f"上一块编号：{previous_id}，暂无已生成提示词。"
    return f"上一块编号：{previous_id}\n{prompt}"


def merge_video_prompt_output(existing_artifact: WorkflowArtifact | None, parsed: Any, replace_all: bool = False) -> Any:
    parsed_dict = as_dict(parsed)
    new_prompts = video_prompt_items(parsed_dict)
    if replace_all:
        return parsed
    if not existing_artifact or not existing_artifact.output or not new_prompts:
        return parsed
    existing_prompts = video_prompt_items(existing_artifact.output)
    if not existing_prompts:
        return parsed
    merged_by_id = {
        text_value(item.get("block_id")): item
        for item in existing_prompts
        if text_value(item.get("block_id"))
    }
    for item in new_prompts:
        block_id = text_value(item.get("block_id"))
        if block_id:
            merged_by_id[block_id] = item
    order = [text_value(item.get("block_id")) for item in existing_prompts]
    for item in new_prompts:
        block_id = text_value(item.get("block_id"))
        if block_id and block_id not in order:
            order.append(block_id)
    return {
        **existing_artifact.output,
        **parsed_dict,
        "video_prompts": [merged_by_id[block_id] for block_id in order if block_id in merged_by_id],
    }


def previous_video_prompt_from_block_plan_text(value: str) -> str:
    if not value:
        return ""
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return ""
    return text_value(as_dict(parsed).get("previous_video_prompt"))


def normalize_video_prompt_output(parsed: Any, block_plan_text: str) -> dict[str, Any]:
    parsed_dict = as_dict(parsed)
    plan = parse_json_text(block_plan_text) if block_plan_text else {}
    plan_dict = as_dict(plan)
    blocks = [as_dict(item) for item in as_list(plan_dict.get("video_blocks")) if as_dict(item)]
    prompt_items = video_prompt_items(parsed_dict)
    prompt_by_block_id: dict[str, dict[str, Any]] = {}
    for item in prompt_items:
        prompt_item = as_dict(item)
        block_id = text_value(prompt_item.get("block_id"))
        if block_id:
            prompt_by_block_id[block_id] = prompt_item
    video_prompts: list[dict[str, Any]] = []
    for index, block in enumerate(blocks):
        block_id = text_value(block.get("block_id")) or f"VB{index + 1:03d}"
        prompt_item = prompt_by_block_id.get(block_id, {})
        prompt = normalized_prompt_text(prompt_item)
        if not prompt:
            prompt = text_value(prompt_item.get("prompt"))
        block_overrides = as_dict(block.get("flow_overrides"))
        prompt_asset_refs = normalize_asset_refs(prompt_item.get("asset_refs"))
        block_asset_refs = normalize_asset_refs(block_overrides.get("asset_refs") or block.get("asset_refs"))
        video_prompts.append({
            "block_id": block_id,
            "prompt": prompt,
            "asset_refs": prompt_asset_refs or block_asset_refs,
        })
    if not video_prompts:
        raise ValueError("视频提示词输出无有效块，请检查 LLM JSON 输出。")
    missing = [text_value(item.get("block_id")) for item in video_prompts if not text_value(item.get("prompt"))]
    if missing:
        raise ValueError(f"视频提示词缺少块内容：{', '.join(missing)}")
    return {
        "episode_id": text_value(plan_dict.get("episode_id")),
        "scene_id": text_value(plan_dict.get("scene_id")),
        "video_prompts": video_prompts,
    }


def video_prompt_items(output: dict[str, Any]) -> list[dict[str, Any]]:
    return [as_dict(item) for item in as_list(output.get("video_prompts")) if as_dict(item)]


def normalized_prompt_text(prompt_item: dict[str, Any]) -> str:
    lines = as_list(prompt_item.get("prompt_lines"))
    if lines:
        return "\n".join(text_value(line) for line in lines if text_present(line)).strip()
    prompt = prompt_item.get("prompt")
    if isinstance(prompt, list):
        return "\n".join(text_value(line) for line in prompt if text_present(line)).strip()
    return text_value(prompt)


def strip_storyboard_review_notes(value: Any) -> Any:
    if isinstance(value, list):
        return [strip_storyboard_review_notes(item) for item in value]
    if isinstance(value, dict):
        return {
            key: strip_storyboard_review_notes(item)
            for key, item in value.items()
            if key != "review_notes"
        }
    return value


def chapter_summary_output_text(base: Path, chapter_id: str) -> str:
    output = read_chapter_summary_output_file(base, chapter_id)
    if not output:
        return ""
    return json.dumps(output, ensure_ascii=False, indent=2)


def select_chapter_ref(
    artifacts: dict[str, WorkflowArtifact],
    episodes: list[dict[str, str]],
    episode_id: str,
    requested_chapter_id: str | None,
) -> dict[str, Any]:
    chapter_map = extract_chapter_map(artifacts)
    if requested_chapter_id:
        requested_key = normalize_chapter_id(requested_chapter_id)
        matched = next((chapter for chapter in chapter_map if normalize_chapter_id(chapter.get("chapter_id")) == requested_key), None)
        if matched:
            return normalize_chapter_ref(matched, episodes, episode_id)
    for chapter in chapter_map:
        ref = normalize_chapter_ref(chapter, episodes, episode_id)
        if episode_id in ref["episode_ids"]:
            return ref
    return {
        "chapter_id": "chapter_01",
        "episode_range": f"{episodes[0]['episodeId']}-{episodes[-1]['episodeId']}" if episodes else "EP01",
        "episode_ids": [episode["episodeId"] for episode in episodes],
    }


def extract_chapter_map(artifacts: dict[str, WorkflowArtifact]) -> list[dict[str, Any]]:
    series_summary = artifacts.get("series_summary").output if artifacts.get("series_summary") else {}
    story_map = artifacts.get("story_map").output if artifacts.get("story_map") else {}
    candidates = []
    if isinstance(series_summary, dict):
        candidates = as_list(series_summary.get("chapter_map"))
        summary = as_dict(series_summary.get("series_bible_summary"))
        if not candidates:
            candidates = as_list(summary.get("chapter_map"))
    if not candidates and isinstance(story_map, dict):
        candidates = as_list(story_map.get("chapter_map"))
    return [as_dict(item) for item in candidates if as_dict(item)]


def normalize_chapter_ref(chapter: dict[str, Any], episodes: list[dict[str, str]], fallback_episode_id: str) -> dict[str, Any]:
    chapter_id = normalize_chapter_id(chapter.get("chapter_id"))
    episode_range = str(chapter.get("episode_range") or "").strip()
    episode_ids = episode_ids_from_range(episode_range, episodes)
    if not episode_ids:
        episode_ids = [fallback_episode_id]
    return {
        "chapter_id": chapter_id,
        "chapter_name": chapter.get("chapter_name") or chapter.get("chapter_title") or "",
        "chapter_function": chapter.get("chapter_function") or "",
        "episode_range": episode_range,
        "episode_ids": episode_ids,
    }


def build_chapter_script(episodes: list[dict[str, str]], chapter_ref: dict[str, Any]) -> str:
    episode_ids = set(as_list(chapter_ref.get("episode_ids")))
    selected = [episode for episode in episodes if episode["episodeId"] in episode_ids]
    return "\n\n".join(episode["text"] for episode in selected or episodes)


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


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def extract_response_content(response: dict[str, Any]) -> str:
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        message = choices[0].get("message") if isinstance(choices[0], dict) else None
        content = message.get("content") if isinstance(message, dict) else None
        if isinstance(content, str):
            return content
    return json.dumps(response, ensure_ascii=False)


def parse_json_text(text: str) -> dict[str, Any]:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", cleaned, re.S)
        if not match:
            return {"raw": text}
        parsed = json.loads(match.group(0))
    return parsed if isinstance(parsed, dict) else {"items": parsed}


def summarize_variables_for_log(variables: dict[str, str], node: WorkflowNode) -> str:
    keys_by_node = {
        "story_map": ["全集剧本", "目标章节数"],
        "character_summary": ["全集剧本", "剧情地图"],
        "continuity": ["全集剧本", "剧情地图"],
        "series_summary": ["剧情地图", "角色概要", "信息连续性"],
        "chapter_summary": ["当前章节剧本", "全集概要"],
        "episode_summary": ["当前集剧本", "当前章节概要", "前后集概要"],
        "scene_summary": ["当前场剧本", "当前单集概要", "前后场概要"],
        "storyboard_design": ["当前场剧本", "当前场次概要", "资产真源"],
        "video_prompt": ["当前分块规划", "当前场次概要", "上一块视频提示词", "资产真源"],
    }
    keys = keys_by_node.get(node.id, [])
    return " / ".join(f"{key}:{len(variables.get(key, ''))}字" for key in keys if variables.get(key))


def default_max_tokens(node_id: str) -> int:
    if node_id in {"story_map", "character_summary", "continuity"}:
        return 12000
    if node_id in {"storyboard_design", "video_prompt"}:
        return 10000
    return 8000


def split_project_script(script: str) -> list[dict[str, str]]:
    normalized = script.replace("\r\n", "\n").strip()
    if not normalized:
        return [{"episodeId": "EP01", "title": "EP01", "text": ""}]
    pattern = re.compile(r"(?m)^\s*(?:第\s*([0-9０-９一二三四五六七八九十百零〇两]+)\s*[集话]|EP\s*([0-9０-９]+)|Episode\s*([0-9０-９]+))(?:\s+.*)?$")
    matches = list(pattern.finditer(normalized))
    if not matches:
        return [{"episodeId": "EP01", "title": "EP01", "text": normalized}]
    episodes: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        raw_number = next((group for group in match.groups() if group), "") or str(index + 1)
        number = marker_number(raw_number) or index + 1
        episodes.append({"episodeId": f"EP{number:02d}", "title": match.group(0).strip(), "text": normalized[start:end].strip()})
    return episodes


def split_episode_scenes(text: str) -> list[dict[str, str]]:
    normalized = text.strip()
    if not normalized:
        return [{"sceneId": "SC01", "title": "SC01", "text": ""}]
    pattern = re.compile(
        r"(?m)^\s*(?:"
        r"场景|场次|"
        r"第\s*[0-9０-９一二三四五六七八九十百零〇两]+\s*场|"
        r"[0-9０-９]+\s*[-－]\s*[0-9０-９]+|"
        r"[0-9０-９]+\s*[\.、]\s*"
        r")(?:[一二三四五六七八九十百零〇两0-9０-９]+)?[：:、.\s].*$"
    )
    matches = list(pattern.finditer(normalized))
    if not matches:
        return [{"sceneId": "SC01", "title": "SC01", "text": normalized}]
    scenes: list[dict[str, str]] = []
    for index, match in enumerate(matches):
        start = match.start()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(normalized)
        scenes.append({"sceneId": f"SC{index + 1:02d}", "title": match.group(0).strip(), "text": normalized[start:end].strip()})
    return scenes


def select_episode_text(episodes: list[dict[str, str]], episode_id: str | None) -> dict[str, str]:
    if episode_id:
        matched = next((item for item in episodes if item["episodeId"] == episode_id), None)
        if matched:
            return matched
    return episodes[0]


def select_scene_text(scenes: list[dict[str, str]], scene_id: str | None) -> dict[str, str]:
    if scene_id:
        matched = next((item for item in scenes if item["sceneId"] == scene_id), None)
        if matched:
            return matched
    return scenes[0]


def adjacent_episode_summaries(episodes: list[dict[str, str]], episode_id: str) -> tuple[str, str]:
    index = next((idx for idx, item in enumerate(episodes) if item["episodeId"] == episode_id), 0)
    return clip(episodes[index - 1]["text"], 500) if index > 0 else "无", clip(episodes[index + 1]["text"], 500) if index + 1 < len(episodes) else "无"


def adjacent_scene_summaries(scenes: list[dict[str, str]], scene_id: str) -> tuple[str, str]:
    index = next((idx for idx, item in enumerate(scenes) if item["sceneId"] == scene_id), 0)
    return clip(scenes[index - 1]["text"], 400) if index > 0 else "无", clip(scenes[index + 1]["text"], 400) if index + 1 < len(scenes) else "无"


def clip(text: str, limit: int) -> str:
    return text[:limit] + ("..." if len(text) > limit else "")


def marker_number(value: str) -> int:
    normalized = value.replace("０", "0").replace("１", "1").replace("２", "2").replace("３", "3").replace("４", "4").replace("５", "5").replace("６", "6").replace("７", "7").replace("８", "8").replace("９", "9")
    if normalized.isdigit():
        return int(normalized)
    digits = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    if normalized == "十":
        return 10
    if "十" in normalized:
        left, right = normalized.split("十", 1)
        return (digits.get(left, 1) if left else 1) * 10 + (digits.get(right, 0) if right else 0)
    return digits.get(normalized, 0)
