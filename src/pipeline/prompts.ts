import type { EpisodeResult, ScriptAnalysis } from "../lib/storyboard";
import type { PipelineStage } from "./types";
import { loadPromptLibrary, renderSelectedPrompt, type PromptStageId } from "./promptLibrary";

export interface PromptTemplate {
  stageId: string;
  promptId: string;
  promptName: string;
  system: string;
  user: string;
  outputContract: string;
  exampleOutput: string;
}

export function buildCleanScriptPrompt(script: string): PromptTemplate {
  return renderPrompt("clean_script", {
    分集剧本: clip(script, 12000),
  });
}

export function buildEpisodeSupportPrompt(episode: EpisodeResult): PromptTemplate {
  return renderPrompt("build_episode_support", {
    集编号: episode.episodeId,
    分集剧本: clip(episode.sourceText, 12000),
  });
}

export function buildSceneContextPrompt(analysis: ScriptAnalysis, episode: EpisodeResult): PromptTemplate {
  const sceneNames = [...new Set(episode.shots.map((shot) => shot.scene))];
  return renderPrompt("plan_scene_context", {
    集编号: episode.episodeId,
    题材: analysis.options.genreProfile,
    导演风格: analysis.options.directorProfile,
    场景列表: sceneNames.join("、") || "未识别",
    分集剧本: clip(episode.sourceText, 12000),
  });
}

export function buildAssetPromptPrompt(analysis: ScriptAnalysis, episode: EpisodeResult): PromptTemplate {
  return renderPrompt("extract_asset_prompts", {
    集编号: episode.episodeId,
    题材: analysis.options.genreProfile,
    导演风格: analysis.options.directorProfile,
    分集剧本: clip(episode.sourceText, 12000),
  });
}

export function describeStagePromptUse(stage: PipelineStage) {
  if (stage.id === "clean_script") return "清洗稿 + 审校疑点，作为后续剧本统筹输入源。";
  if (stage.id === "build_episode_support") return "集级辅助，作为后续场级与局部重跑的约束或参数。";
  if (stage.id === "plan_scene_context") return "场级连续性，作为首次规划与局部重跑的锁定上下文。";
  if (stage.id === "extract_asset_prompts") return "LLM 从剧本识别资产，并输出最终资产描述和生图提示词。";
  return "当前阶段暂未配置 Prompt 模板。";
}

function renderPrompt(stageId: PromptStageId, variables: Record<string, string | number | undefined>): PromptTemplate {
  const rendered = renderSelectedPrompt(loadPromptLibrary(), stageId, variables);
  return {
    stageId,
    promptId: rendered.prompt.promptId,
    promptName: rendered.prompt.name,
    system: rendered.system,
    user: rendered.user,
    outputContract: rendered.outputContract,
    exampleOutput: rendered.prompt.exampleOutput,
  };
}

function clip(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[已截断：真实执行器应按集/场分批处理并保留 sourceRefs]`;
}
