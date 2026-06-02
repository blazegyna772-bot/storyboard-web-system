import { buildContextPack } from "../lib/contextPack";
import { buildScriptQualityReport } from "../lib/scriptQuality";
import type { ScriptAnalysis } from "../lib/storyboard";
import type { P1ExecutorOutput } from "./llmExecutor";

export type ArtifactKind =
  | "cleaned_script"
  | "script_issues"
  | "episodes"
  | "episode_support"
  | "scene_context"
  | "assets"
  | "shots"
  | "prompts"
  | "validation_report"
  | "delivery_files";

export type LockScope = "asset" | "episode" | "scene" | "block" | "shot" | "prompt";
export type TaskStatus = "pending" | "running" | "done" | "failed" | "blocked" | "needs_review";

export interface ArtifactRecord {
  artifactId: string;
  kind: ArtifactKind;
  stageId: string;
  role: "support" | "final" | "validation" | "delivery";
  title: string;
  summary: string;
  sourceRefs: string[];
  downstreamRefs: string[];
  updatedAt: string;
  reliability: "rule" | "llm" | "human_confirmed" | "simulated";
  contentPreview?: string;
}

export interface LockRecord {
  lockId: string;
  scope: LockScope;
  targetId: string;
  label: string;
  status: "unlocked" | "locked" | "needs_review";
  reason: string;
  updatedAt: string;
}

export interface TaskRecord {
  taskId: string;
  stageId: string;
  label: string;
  status: TaskStatus;
  scope: LockScope | "project" | "export";
  targetId: string;
  updatedAt: string;
  detail: string;
}

export interface PipelineArtifactBundle {
  artifacts: ArtifactRecord[];
  locks: LockRecord[];
  tasks: TaskRecord[];
}

export function buildArtifactBundle(script: string, analysis: ScriptAnalysis, p1Output?: P1ExecutorOutput): PipelineArtifactBundle {
  const quality = buildScriptQualityReport(script);
  const contextPack = buildContextPack(analysis);
  const allAssets = analysis.episodes.flatMap((episode) => episode.assets);
  const allShots = analysis.episodes.flatMap((episode) => episode.shots);
  const allPrompts = analysis.episodes.flatMap((episode) => episode.prompts);

  const artifacts: ArtifactRecord[] = [
    artifact(
      "cleaned_script",
      "clean_script",
      "support",
      "清洗稿",
      `${quality.stats.lines} 行，${p1Output?.clean.artifact.issues.length ?? quality.issues.length} 个疑点`,
      ["raw_script"],
      ["segment_script"],
      p1Output ? "llm" : "rule",
      p1Output?.clean.artifact.cleanedScript.slice(0, 220),
    ),
    artifact(
      "script_issues",
      "clean_script",
      "validation",
      "剧本疑点",
      `${p1Output?.clean.artifact.issues.length ?? quality.issues.length} 个疑点`,
      ["raw_script"],
      ["human_review"],
      p1Output ? "llm" : "rule",
      p1Output?.clean.artifact.issues.map((issue) => issue.message).join("；").slice(0, 220),
    ),
    artifact("episodes", "segment_script", "support", "分集分场分块", `${analysis.episodes.length} 集`, ["cleaned_script"], ["build_episode_support", "plan_scene_context"], "rule"),
    artifact(
      "episode_support",
      "build_episode_support",
      "support",
      "集级辅助",
      p1Output ? `${p1Output.episodeSupport.reduce((sum, item) => sum + item.artifact.revealOrder.length + item.artifact.emotionArc.length + item.artifact.relationshipConstraints.length + item.artifact.propContinuity.length + item.artifact.visualStrategy.length + item.artifact.forbiddenEarlyReveals.length, 0)} 条集级辅助` : `${contextPack.episodes.length} 条集级辅助`,
      ["episodes"],
      ["plan_scene_context", "plan_scene_storyboard", "generate_block_shots", "build_video_prompts"],
      p1Output ? "llm" : "simulated",
      p1Output?.episodeSupport.flatMap((item) => item.artifact.visualStrategy.map((fact) => fact.fact)).join("；").slice(0, 220),
    ),
    artifact(
      "scene_context",
      "plan_scene_context",
      "support",
      "场级连续性",
      p1Output ? `${p1Output.sceneContext.length} 条场级上下文，${p1Output.sceneContext.reduce((sum, item) => sum + item.artifact.sceneSpatialTimeline.length, 0)} 个空间时序点` : `${contextPack.sceneBeats.length} 条场级上下文`,
      ["episodes", "episode_support"],
      ["plan_scene_storyboard", "generate_block_shots", "build_video_prompts"],
      p1Output ? "llm" : "simulated",
      p1Output?.sceneContext.map((item) => item.artifact.scenePurpose).join("；").slice(0, 220),
    ),
    artifact(
      "assets",
      "extract_asset_prompts",
      "final",
      "资产描述",
      p1Output?.assetPrompts?.length ? `${p1Output.assetPrompts.reduce((sum, item) => sum + item.artifact.assets.length, 0)} 个资产描述/生图提示词` : `${allAssets.length} 个资产`,
      ["episodes", "episode_support", "scene_context"],
      ["asset_image", "build_video_prompts"],
      p1Output?.assetPrompts?.length ? "llm" : "simulated",
      p1Output?.assetPrompts.flatMap((item) => item.artifact.assets.map((asset) => `${asset.name}：${asset.description}`)).join("；").slice(0, 220),
    ),
    artifact("shots", "generate_block_shots", "final", "分镜镜头", `${allShots.length} 个镜头`, ["scene_context", "assets"], ["build_video_prompts"], "simulated"),
    artifact("prompts", "build_video_prompts", "final", "视频提示词", `${allPrompts.length} 条提示词`, ["shots", "assets"], ["export"], "simulated"),
    artifact("validation_report", "validate", "validation", "校验报告", `${analysis.warnings.length} 条项目警告`, ["assets", "shots", "prompts"], ["export"], "rule"),
    artifact("delivery_files", "export", "delivery", "交付文件", "项目 ZIP 可导出", ["assets", "shots", "prompts"], [], "rule"),
  ];

  return {
    artifacts,
    locks: [
      ...allAssets.map((asset) => lock("asset", asset.assetId, asset.name, "needs_review", "资产描述和候选图未人工确认。")),
      ...allShots.map((shot) => lock("shot", shot.shotId, shot.shotId, "unlocked", "镜头尚未锁定，可重跑。")),
      ...allPrompts.map((prompt) => lock("prompt", prompt.promptId, prompt.promptId, "unlocked", "提示词尚未锁定，可重写。")),
    ],
    tasks: [
      task("clean_script", "剧本清洗", "done", "project", "project", "规则清洗已完成。"),
      task("segment_script", "分集分场分块", "done", "project", "project", "规则分集已完成。"),
      task("build_episode_support", "集级辅助", p1Output ? "done" : "blocked", "episode", "all", p1Output ? "LLM 已生成集级辅助，可审阅来源和用途。" : "等待 LLM executor。"),
      task("plan_scene_context", "场级连续性", p1Output ? "done" : "blocked", "scene", "all", p1Output ? "LLM 已生成场级上下文和空间时序点。" : "等待 LLM executor 和空间时序 schema。"),
      task("extract_asset_prompts", "资产描述", p1Output?.assetPrompts?.length ? "needs_review" : "blocked", "asset", "all", p1Output?.assetPrompts?.length ? "LLM 已生成资产描述和生图提示词，等待人工确认/生图。" : "等待 LLM executor。"),
      task("generate_block_shots", "块级分镜", "blocked", "block", "all", "等待场级规划和 LLM executor。"),
      task("build_video_prompts", "视频提示词", "blocked", "prompt", "all", "等待锁定资产和真实镜头规划。"),
      task("export", "交付导出", "done", "export", "project", "ZIP 导出器可用。"),
    ],
  };
}

function artifact(
  kind: ArtifactKind,
  stageId: string,
  role: ArtifactRecord["role"],
  title: string,
  summary: string,
  sourceRefs: string[],
  downstreamRefs: string[],
  reliability: ArtifactRecord["reliability"],
  contentPreview?: string,
): ArtifactRecord {
  return {
    artifactId: `${stageId}:${kind}`,
    kind,
    stageId,
    role,
    title,
    summary,
    sourceRefs,
    downstreamRefs,
    updatedAt: new Date().toISOString(),
    reliability,
    contentPreview,
  };
}

function lock(
  scope: LockScope,
  targetId: string,
  label: string,
  status: LockRecord["status"],
  reason: string,
): LockRecord {
  return {
    lockId: `${scope}:${targetId}`,
    scope,
    targetId,
    label,
    status,
    reason,
    updatedAt: new Date().toISOString(),
  };
}

function task(
  stageId: string,
  label: string,
  status: TaskStatus,
  scope: TaskRecord["scope"],
  targetId: string,
  detail: string,
): TaskRecord {
  return {
    taskId: `${stageId}:${scope}:${targetId}`,
    stageId,
    label,
    status,
    scope,
    targetId,
    updatedAt: new Date().toISOString(),
    detail,
  };
}
