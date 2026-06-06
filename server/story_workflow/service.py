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


NODES: list[WorkflowNode] = [
    WorkflowNode(
        id="01A",
        title="全剧剧情地图",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本",
        outputSummary="剧情大纲、类型基调、章节地图、关键转折",
        promptPath="story_workflow_01a_structure/prompt.md",
    ),
    WorkflowNode(
        id="01B",
        title="角色身份与关系变化",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本 + 01A",
        outputSummary="角色功能、身份视觉阶段、关系变化、认知状态",
        promptPath="story_workflow_01b_characters/prompt.md",
        dependsOn=["01A"],
    ),
    WorkflowNode(
        id="01C",
        title="伏笔与连续性风险",
        page="planning",
        scope="全剧",
        inputSummary="全集剧本 + 01A",
        outputSummary="伏笔 callback、视觉母题、关键道具、反复空间、资产变化风险",
        promptPath="story_workflow_01c_risks/prompt.md",
        dependsOn=["01A"],
    ),
    WorkflowNode(
        id="01D",
        title="全剧汇总",
        page="planning",
        scope="全剧",
        inputSummary="01A + 01B + 01C",
        outputSummary="程序机械合并 01A/01B/01C，不理解剧情",
        promptPath="story_workflow_01d_bible/prompt.md",
        dependsOn=["01A", "01B", "01C"],
    ),
    WorkflowNode(
        id="02",
        title="章节任务卡",
        page="planning",
        scope="章节",
        inputSummary="章节剧本 + 01D",
        outputSummary="章节功能、情绪主调、母题/伏笔、章节钩子、每集标题和一句话梗概",
        promptPath="story_workflow_02_chapters/prompt.md",
        dependsOn=["01D"],
    ),
    WorkflowNode(
        id="03",
        title="单集任务卡",
        page="storyboard",
        scope="单集",
        inputSummary="本集剧本 + 02 + 前后集概要 + 必要 01 风险",
        outputSummary="本集任务、情绪标签、钩子类型、镜头放大细节、节奏和承接",
        promptPath="story_workflow_03_episode_card/prompt.md",
        dependsOn=["02"],
    ),
    WorkflowNode(
        id="04",
        title="场次简报",
        page="storyboard",
        scope="场次",
        inputSummary="本场剧本 + 03 + 前后场摘要",
        outputSummary="戏剧任务、角色进入状态、潜台词、强调信息、空间关系、节奏和悬念",
        promptPath="story_workflow_04_scene_brief/prompt.md",
        dependsOn=["03"],
    ),
    WorkflowNode(
        id="05",
        title="分镜执行",
        page="storyboard",
        scope="场次",
        inputSummary="本场剧本 + 03 + 可选 04 + 资产真源占位",
        outputSummary="镜号、景别、机位运动、画面动作、对白、音效、转场、资产引用",
        promptPath="story_workflow_05_storyboard/prompt.md",
        dependsOn=["03"],
    ),
    WorkflowNode(
        id="06",
        title="视频提示词",
        page="video",
        scope="镜头",
        inputSummary="已确认分镜 + 资产真源图占位 + 视频模型规则",
        outputSummary="视频正向提示词、参考图路径、时长、画幅、运动、负向提示词、模型参数",
        promptPath="story_workflow_06_video_prompt/prompt.md",
        dependsOn=["05"],
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
        artifact = read_workflow_artifact(base, node)
        if artifact:
            artifacts[node.id] = artifact
    return WorkflowState(projectId=project_id, nodes=NODES, episodes=build_episode_refs(project.script), artifacts=artifacts)


async def run_workflow_node(project_id: str, body: RunWorkflowNodeBody) -> WorkflowArtifact:
    node = next((item for item in NODES if item.id == body.nodeId), None)
    if not node:
        raise HTTPException(status_code=404, detail="Workflow node not found")

    root = require_active_root()
    project = read_project(root, project_id, include_script=True)
    base = project_dir(root, project) / "artifacts" / WORKFLOW_DIR
    base.mkdir(parents=True, exist_ok=True)

    state = get_workflow_state(project_id)
    variables = build_node_variables(project.script, state.artifacts, body)
    input_summary = summarize_variables_for_log(variables)

    running_artifact = build_workflow_artifact(
        base,
        nodeId=node.id,
        title=node.title,
        status="running",
        updatedAt=now_iso(),
        inputSummary=input_summary,
    )
    write_workflow_meta(base, running_artifact)

    if node.id == "01D":
        output = build_01d_mechanical_summary(state.artifacts)
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
                label=f"{node.id} {node.title}",
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
        write_workflow_meta(base, artifact)
        raise

    write_workflow_output(base, artifact)
    return artifact


async def run_workflow_all(project_id: str, body: RunWorkflowAllBody) -> list[WorkflowArtifact]:
    node_ids = body.nodeIds or [node.id for node in NODES]
    artifacts: list[WorkflowArtifact] = []
    for node_id in node_ids:
        artifact = await run_workflow_node(
            project_id,
            RunWorkflowNodeBody(
                nodeId=node_id,
                episodeId=body.episodeId,
                sceneId=body.sceneId,
                maxTokens=body.maxTokens,
            ),
        )
        artifacts.append(artifact)
    return artifacts


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
    write_workflow_output(base, artifact)
    return artifact


def read_workflow_artifact(base: Path, node: WorkflowNode) -> WorkflowArtifact | None:
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


def build_01d_mechanical_summary(artifacts: dict[str, WorkflowArtifact]) -> dict[str, Any]:
    output_01a = artifacts.get("01A").output if artifacts.get("01A") else {}
    output_01b = artifacts.get("01B").output if artifacts.get("01B") else {}
    output_01c = artifacts.get("01C").output if artifacts.get("01C") else {}
    return {
        "series_bible_summary": output_01a if isinstance(output_01a, dict) else {},
        "chapter_map": output_01a.get("chapter_map", []) if isinstance(output_01a, dict) else [],
        "character_arc_summary": output_01b if isinstance(output_01b, dict) else {},
        "must_track_items": output_01c if isinstance(output_01c, dict) else {},
    }


def read_node_prompt(node: WorkflowNode) -> tuple[str, str]:
    try:
        return read_active_prompt_by_path(node.promptPath)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail=f"Missing prompt file: {node.promptPath}")


def build_node_variables(script: str, artifacts: dict[str, WorkflowArtifact], body: RunWorkflowNodeBody) -> dict[str, str]:
    episodes = split_project_script(script)
    selected_episode = select_episode_text(episodes, body.episodeId)
    scenes = split_episode_scenes(selected_episode["text"])
    selected_scene = select_scene_text(scenes, body.sceneId)
    previous_episode, next_episode = adjacent_episode_summaries(episodes, selected_episode["episodeId"])
    previous_scene, next_scene = adjacent_scene_summaries(scenes, selected_scene["sceneId"])
    chapter_script = script
    return {
        "全集剧本": script,
        "章节剧本": chapter_script,
        "本集剧本": selected_episode["text"],
        "本场剧本": selected_scene["text"],
        "当前集编号": selected_episode["episodeId"],
        "当前场编号": selected_scene["sceneId"],
        "前后集概要": f"上一集：{previous_episode}\n下一集：{next_episode}",
        "前后场概要": f"上一场：{previous_scene}\n下一场：{next_scene}",
        "01A全剧叙事结构": artifact_text(artifacts, "01A"),
        "01B角色弧线与关系": artifact_text(artifacts, "01B"),
        "01C伏笔与连续性风险": artifact_text(artifacts, "01C"),
        "01D叙事圣经": artifact_text(artifacts, "01D"),
        "02章节任务卡": artifact_text(artifacts, "02"),
        "03单集任务卡": artifact_text(artifacts, "03"),
        "04场次简报": artifact_text(artifacts, "04"),
        "05分镜脚本": artifact_text(artifacts, "05"),
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
    if node.id.startswith("01"):
        return "请根据系统提示处理全集剧本。"
    if node.id == "02":
        return "请根据系统提示处理当前章节/当前集所在章节信息。"
    if node.id == "03":
        return f"请输出 {variables['当前集编号']} 的单集任务卡。"
    if node.id in {"04", "05"}:
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
        "章节剧本",
        "本集剧本",
        "本场剧本",
        "01D叙事圣经",
        "02章节任务卡",
        "03单集任务卡",
        "04场次简报",
        "05分镜脚本",
    ]
    return " / ".join(f"{key}:{len(variables.get(key, ''))}字" for key in keys if variables.get(key))


def default_max_tokens(node_id: str) -> int:
    if node_id in {"01A", "01B", "01C"}:
        return 12000
    if node_id in {"05", "06"}:
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
