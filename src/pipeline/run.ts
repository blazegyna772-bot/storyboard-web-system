import { buildScriptQualityReport } from "../lib/scriptQuality";
import { analyzeScript } from "../lib/storyboard";
import type { AnalysisOptions, ScriptAnalysis } from "../lib/storyboard";
import { buildArtifactBundle } from "./artifacts";
import type { PipelineArtifactBundle } from "./artifacts";
import { defaultPipelineConfig } from "./defaults";
import { getDefaultLlmConfig, runP1Executors } from "./llmExecutor";
import type { LlmExecutorConfig, PipelineLogEntry, PipelineRun, PipelineStage, StageResult } from "./types";

export interface LocalPipelineOutput {
  analysis: ScriptAnalysis;
  run: PipelineRun;
  artifactBundle: PipelineArtifactBundle;
}

export async function runLocalPipeline(script: string, options: AnalysisOptions, llmConfig: LlmExecutorConfig = getDefaultLlmConfig()): Promise<LocalPipelineOutput> {
  const runId = `RUN-${Date.now().toString(36).toUpperCase()}`;
  const startedAt = isoNow();
  const stageResults: StageResult[] = [];
  const logs: PipelineLogEntry[] = [];

  const quality = buildScriptQualityReport(script);
  const analysis = analyzeScript(quality.cleanedScript, options);
  const p1Output = await runP1Executors(script, analysis, llmConfig);
  const enrichedAnalysis = mergeAssetPromptArtifacts(analysis, p1Output);
  logs.push(...p1Output.clean.logs);
  pushExecutedStage(stageResults, logs, findStage("clean_script"), {
    artifactSummary: `${quality.stats.lines} 行，${quality.stats.episodes} 集，${p1Output.clean.artifact.issues.length} 个疑点；Schema ${p1Output.clean.validation.ok ? "通过" : "失败"}。`,
    extraLogs: p1Output.clean.logs,
    traces: [p1Output.clean.trace],
    durationMs: p1Output.clean.durationMs,
  });

  pushExecutedStage(stageResults, logs, findStage("segment_script"), {
    artifactSummary: `${enrichedAnalysis.episodes.length} 集，${enrichedAnalysis.totalCharacters.toLocaleString()} 字。`,
  });

  const episodeSupportLogs = p1Output.episodeSupport.flatMap((item) => item.logs);
  logs.push(...episodeSupportLogs);
  pushExecutedStage(stageResults, logs, findStage("build_episode_support"), {
    artifactSummary: `${executorName(llmConfig)}：${p1Output.episodeSupport.length} 集，${p1Output.episodeSupport.reduce((sum, item) => sum + countEpisodeSupportFacts(item.artifact), 0)} 条集级辅助。`,
    extraLogs: episodeSupportLogs,
    traces: p1Output.episodeSupport.map((item) => item.trace),
    durationMs: p1Output.episodeSupport.reduce((sum, item) => sum + item.durationMs, 0),
  });

  const sceneContextLogs = p1Output.sceneContext.flatMap((item) => item.logs);
  logs.push(...sceneContextLogs);
  const sceneContextValidationOk = p1Output.sceneContext.every((item) => item.validation.ok);
  if (sceneContextValidationOk) {
    pushExecutedStage(stageResults, logs, findStage("plan_scene_context"), {
    artifactSummary: `${executorName(llmConfig)}：${p1Output.sceneContext.length} 条场级上下文，${p1Output.sceneContext.reduce((sum, item) => sum + item.artifact.sceneSpatialTimeline.length, 0)} 个空间时序点。`,
    extraLogs: sceneContextLogs,
    traces: p1Output.sceneContext.map((item) => item.trace),
    durationMs: p1Output.sceneContext.reduce((sum, item) => sum + item.durationMs, 0),
    });
  } else {
    pushBlockedStage(stageResults, logs, findStage("plan_scene_context"), {
      artifactSummary: `${executorName(llmConfig)}：场级上下文返回但 Schema 未通过。`,
      blockReason: p1Output.sceneContext.flatMap((item) => item.validation.errors).slice(0, 8).join("；"),
      extraLogs: sceneContextLogs,
      traces: p1Output.sceneContext.map((item) => item.trace),
      durationMs: p1Output.sceneContext.reduce((sum, item) => sum + item.durationMs, 0),
    });
  }

  const assetPromptLogs = p1Output.assetPrompts.flatMap((item) => item.logs);
  logs.push(...assetPromptLogs);
  pushExecutedStage(stageResults, logs, findStage("extract_asset_prompts"), {
    artifactSummary: `${executorName(llmConfig)}：${p1Output.assetPrompts.reduce((sum, item) => sum + item.artifact.assets.length, 0)} 个资产描述/生图提示词。`,
    extraLogs: assetPromptLogs,
    traces: p1Output.assetPrompts.map((item) => item.trace),
    durationMs: p1Output.assetPrompts.reduce((sum, item) => sum + item.durationMs, 0),
  });
  pushSimulatedStage(stageResults, logs, findStage("plan_scene_storyboard"), {
    artifactSummary: "规则版镜头拆分，尚非场级视听规划。",
    blockReason: "LLM executor 未接入，未生成真实场级分镜统筹。",
  });
  pushSimulatedStage(stageResults, logs, findStage("generate_block_shots"), {
    artifactSummary: `${enrichedAnalysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0)} 个规则版镜头。`,
    blockReason: "当前由规则函数 buildShots 生成，未执行块级 LLM。",
  });
  pushSimulatedStage(stageResults, logs, findStage("build_video_prompts"), {
    artifactSummary: `${enrichedAnalysis.episodes.reduce((sum, episode) => sum + episode.prompts.length, 0)} 条规则版视频提示词。`,
    blockReason: "当前为模板拼接提示词，未接 LLM 提示词执行器。",
  });
  pushExecutedStage(stageResults, logs, findStage("validate"), {
    artifactSummary: `${enrichedAnalysis.warnings.length} 条项目警告，真源 schema 仍待补。`,
  });
  pushExecutedStage(stageResults, logs, findStage("export"), {
    artifactSummary: "导出器可生成项目 ZIP；OutputAdapter 尚未完全接管导出逻辑。",
  });

  const run: PipelineRun = {
    runId,
    projectId: "local-default",
    trigger: "manual_generate",
    status: stageResults.some((stage) => stage.status === "blocked") ? "blocked" : "done",
    startedAt,
    finishedAt: isoNow(),
    stageResults,
    logs,
  };

  return { analysis: enrichedAnalysis, run, artifactBundle: buildArtifactBundle(quality.cleanedScript, enrichedAnalysis, p1Output) };
}

function findStage(stageId: string) {
  const stage = defaultPipelineConfig.stages.find((item) => item.id === stageId);
  if (!stage) throw new Error(`Missing pipeline stage: ${stageId}`);
  return stage;
}

function pushExecutedStage(
  stageResults: StageResult[],
  logs: PipelineLogEntry[],
  stage: PipelineStage,
  result: Pick<StageResult, "artifactSummary"> & { extraLogs?: PipelineLogEntry[]; durationMs?: number; traces?: StageResult["traces"] },
) {
  const startedAt = performance.now();
  const log = createPipelineLog(stage.id, "success", `${stage.name}完成`, result.artifactSummary);
  const stageLogs = result.extraLogs?.length ? [...result.extraLogs, log] : [log];
  stageResults.push({
    stageId: stage.id,
    stageName: stage.name,
    status: "done",
    executor: stage.executor,
    artifactRole: stage.artifactRole,
    inputRefs: stage.inputRefs,
    outputRefs: stage.outputRefs,
    startedAt: isoNow(),
    finishedAt: isoNow(),
    durationMs: result.durationMs ?? Math.max(1, Math.round(performance.now() - startedAt)),
    artifactSummary: result.artifactSummary,
    logs: stageLogs,
    traces: result.traces,
  });
  logs.push(log);
}

function pushSimulatedStage(
  stageResults: StageResult[],
  logs: PipelineLogEntry[],
  stage: PipelineStage,
  result: Pick<StageResult, "artifactSummary" | "blockReason">,
) {
  const log = createPipelineLog(stage.id, "warning", `${stage.name}为规则模拟`, result.blockReason ?? result.artifactSummary);
  stageResults.push({
    stageId: stage.id,
    stageName: stage.name,
    status: "blocked",
    executor: stage.executor,
    artifactRole: stage.artifactRole,
    inputRefs: stage.inputRefs,
    outputRefs: stage.outputRefs,
    artifactSummary: result.artifactSummary,
    blockReason: result.blockReason,
    logs: [log],
  });
  logs.push(log);
}

function pushBlockedStage(
  stageResults: StageResult[],
  logs: PipelineLogEntry[],
  stage: PipelineStage,
  result: Pick<StageResult, "artifactSummary" | "blockReason"> & { extraLogs?: PipelineLogEntry[]; durationMs?: number; traces?: StageResult["traces"] },
) {
  const log = createPipelineLog(stage.id, "error", `${stage.name}失败`, result.blockReason ?? result.artifactSummary);
  stageResults.push({
    stageId: stage.id,
    stageName: stage.name,
    status: "blocked",
    executor: stage.executor,
    artifactRole: stage.artifactRole,
    inputRefs: stage.inputRefs,
    outputRefs: stage.outputRefs,
    durationMs: result.durationMs,
    artifactSummary: result.artifactSummary,
    blockReason: result.blockReason,
    logs: [...(result.extraLogs ?? []), log],
    traces: result.traces,
  });
  logs.push(log);
}

function createPipelineLog(
  source: string,
  level: PipelineLogEntry["level"],
  message: string,
  detail?: string,
): PipelineLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    source,
    level,
    message,
    detail,
  };
}

function isoNow() {
  return new Date().toISOString();
}

function countEpisodeSupportFacts(artifact: Awaited<ReturnType<typeof runP1Executors>>["episodeSupport"][number]["artifact"]) {
  return artifact.revealOrder.length + artifact.emotionArc.length + artifact.relationshipConstraints.length + artifact.propContinuity.length + artifact.visualStrategy.length + artifact.forbiddenEarlyReveals.length;
}

function executorName(config: LlmExecutorConfig) {
  return config.model;
}

function mergeAssetPromptArtifacts(analysis: ScriptAnalysis, output: Awaited<ReturnType<typeof runP1Executors>>): ScriptAnalysis {
  return {
    ...analysis,
    episodes: analysis.episodes.map((episode) => {
      const artifact = output.assetPrompts.find((item) => item.artifact.episodeId === episode.episodeId)?.artifact;
      if (!artifact) return episode;
      const mergedByName = new Map(episode.assets.map((asset) => [asset.name, asset]));
      const llmAssets = artifact.assets.map((asset) => ({
        ...mergedByName.get(asset.name),
        assetId: asset.assetId,
        type: asset.type,
        name: asset.name,
        description: asset.description,
        continuity: asset.continuity,
        imagePrompt: asset.imagePrompt,
        reliability: asset.reliability,
        sourceRefs: asset.sourceRefs,
        firstSeenShotId: mergedByName.get(asset.name)?.firstSeenShotId ?? episode.shots.find((shot) => shot.action.includes(asset.name) || shot.dialogue.includes(asset.name) || shot.scene.includes(asset.name))?.shotId ?? `${episode.episodeId}-S001`,
      }));
      return {
        ...episode,
        assets: llmAssets,
        shots: episode.shots.map((shot) => ({
          ...shot,
          assets: llmAssets
            .filter((asset) => shot.action.includes(asset.name) || shot.dialogue.includes(asset.name) || shot.scene.includes(asset.name))
            .map((asset) => asset.assetId),
        })),
      };
    }),
  };
}
