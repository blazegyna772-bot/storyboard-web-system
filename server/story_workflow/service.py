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


NODES: list[WorkflowNode] = [
    WorkflowNode(
        id="story_map",
        title="剧情地图",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本",
        outputSummary="剧情大纲、类型基调、章节地图、关键转折",
        promptPath="story_workflow_story_map/prompt.md",
    ),
    WorkflowNode(
        id="character_summary",
        title="角色概要",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本 + 剧情地图",
        outputSummary="角色功能、身份视觉阶段、关系变化、认知状态",
        promptPath="story_workflow_character_summary/prompt.md",
        dependsOn=["story_map"],
    ),
    WorkflowNode(
        id="continuity",
        title="信息连续性",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本 + 剧情地图",
        outputSummary="伏笔 callback、视觉母题、关键道具、反复空间、资产变化风险",
        promptPath="story_workflow_continuity/prompt.md",
        dependsOn=["story_map"],
    ),
    WorkflowNode(
        id="series_summary",
        title="全集概要",
        page="planning",
        scope="全剧",
        inputSummary="剧情地图 + 角色概要 + 信息连续性",
        outputSummary="程序机械合并上游全剧产物，不理解剧情",
        promptPath="story_workflow_series_summary/prompt.md",
        dependsOn=["story_map", "character_summary", "continuity"],
    ),
    WorkflowNode(
        id="chapter_summary",
        title="章节概要",
        page="planning",
        scope="章节",
        inputSummary="当前章节剧本 + 全集概要",
        outputSummary="章节功能、情绪主调、母题/伏笔、章节钩子、每集标题和一句话梗概",
        promptPath="story_workflow_chapter_summary/prompt.md",
        dependsOn=["series_summary"],
    ),
    WorkflowNode(
        id="episode_summary",
        title="单集概要",
        page="storyboard",
        scope="单集",
        inputSummary="本集剧本 + 当前章节概要 + 前后集概要 + 必要连续性风险",
        outputSummary="本集任务、情绪标签、钩子类型、镜头放大细节、节奏和承接",
        promptPath="story_workflow_episode_summary/prompt.md",
        dependsOn=["chapter_summary"],
    ),
    WorkflowNode(
        id="scene_summary",
        title="场次概要",
        page="storyboard",
        scope="场次",
        inputSummary="本场剧本 + 当前单集概要 + 前后场摘要",
        outputSummary="戏剧任务、角色进入状态、潜台词、强调信息、空间关系、节奏和悬念",
        promptPath="story_workflow_scene_summary/prompt.md",
        dependsOn=["episode_summary"],
    ),
    WorkflowNode(
        id="storyboard_design",
        title="分镜设计",
        page="storyboard",
        scope="场次",
        inputSummary="本场剧本 + 当前单集概要 + 可选当前场次概要 + 资产真源占位",
        outputSummary="镜号、景别、机位运动、画面动作、对白、音效、转场、资产引用",
        promptPath="story_workflow_storyboard_design/prompt.md",
        dependsOn=["episode_summary"],
    ),
    WorkflowNode(
        id="video_prompt",
        title="视频提示词",
        page="video",
        scope="镜头",
        inputSummary="已确认分镜 + 资产真源图占位 + 视频模型规则",
        outputSummary="视频正向提示词、参考图路径、时长、画幅、运动、负向提示词、模型参数",
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


def get_workflow_artifact(project_id: str, node_id: str, chapter_id: str | None = None) -> WorkflowArtifact | None:
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
    variables = build_node_variables(base, project.script, state.artifacts, body)
    input_summary = summarize_variables_for_log(variables)
    chapter_ref = select_chapter_ref(
        state.artifacts,
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

    prompt, prompt_version_id = read_node_prompt(node)
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
        else:
            write_workflow_meta(base, artifact)
        raise

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
                            maxTokens=body.maxTokens,
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
                maxTokens=body.maxTokens,
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
    write_workflow_output(base, artifact)
    return artifact


def read_workflow_artifact(base: Path, node: WorkflowNode) -> WorkflowArtifact | None:
    if node.id == "chapter_summary":
        return None
    output_data = read_json(base / f"{node.id}.json", None)
    meta_data = read_json(base / f"{node.id}.meta.json", {})
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
    incoming_cards = as_list(parsed.get("chapter_cards"))
    if not incoming_cards and parsed:
        incoming_cards = [parsed]
    cards: list[dict[str, Any]] = []
    for item in incoming_cards:
        card = as_dict(item)
        if not card:
            continue
        card["chapter_id"] = chapter_id
        card.setdefault("episode_range", chapter_ref.get("episode_range") or "")
        cards.append(card)
    output = {key: value for key, value in parsed.items() if key != "chapter_review_risks"}
    return {**output, "chapter_cards": cards}


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
    card = as_dict(next(iter(as_list(output.get("chapter_cards"))), {}))
    return str(card.get("episode_range") or "")


def build_series_mechanical_summary(artifacts: dict[str, WorkflowArtifact]) -> dict[str, Any]:
    story_map = artifacts.get("story_map").output if artifacts.get("story_map") else {}
    character_summary = artifacts.get("character_summary").output if artifacts.get("character_summary") else {}
    continuity = artifacts.get("continuity").output if artifacts.get("continuity") else {}
    return {
        "series_bible_summary": story_map if isinstance(story_map, dict) else {},
        "chapter_map": story_map.get("chapter_map", []) if isinstance(story_map, dict) else [],
        "character_summary": character_summary if isinstance(character_summary, dict) else {},
        "must_track_items": continuity if isinstance(continuity, dict) else {},
    }


def read_node_prompt(node: WorkflowNode) -> tuple[str, str]:
    try:
        return read_active_prompt_by_path(node.promptPath)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail=f"Missing prompt file: {node.promptPath}")


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
    return {
        "全集剧本": script,
        "当前章节剧本": chapter_script,
        "当前集剧本": selected_episode["text"],
        "当前场剧本": selected_scene["text"],
        "当前章节编号": chapter_ref["chapter_id"],
        "当前集编号": selected_episode["episodeId"],
        "当前场编号": selected_scene["sceneId"],
        "前后集概要": f"上一集：{previous_episode}\n下一集：{next_episode}",
        "前后场概要": f"上一场：{previous_scene}\n下一场：{next_scene}",
        "剧情地图": artifact_text(artifacts, "story_map"),
        "角色概要": artifact_text(artifacts, "character_summary"),
        "信息连续性": artifact_text(artifacts, "continuity"),
        "全集概要": artifact_text(artifacts, "series_summary"),
        "当前章节概要": current_chapter_summary,
        "当前单集概要": artifact_text(artifacts, "episode_summary"),
        "当前场次概要": artifact_text(artifacts, "scene_summary"),
        "当前分镜设计": artifact_text(artifacts, "storyboard_design"),
        "资产真源": "资产审阅衔接暂不接入；当前只允许使用剧本中的原名，不得发明资产 ID。",
        "视频模型规则": "竖屏短剧，默认 9:16。输出字段必须可给后续视频模型配置层继续转换。",
    }


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
        return f"请输出 {variables['当前集编号']} 的单集概要。"
    if node.id in {"scene_summary", "storyboard_design"}:
        return f"请处理 {variables['当前集编号']} / {variables['当前场编号']}。"
    return "请根据已确认分镜输出视频提示词。"


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


def summarize_variables_for_log(variables: dict[str, str]) -> str:
    keys = [
        "全集剧本",
        "当前章节剧本",
        "当前集剧本",
        "当前场剧本",
        "全集概要",
        "当前章节概要",
        "当前单集概要",
        "当前场次概要",
        "当前分镜设计",
    ]
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
