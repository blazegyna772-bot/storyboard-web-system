import type { EpisodeResult, ScriptAnalysis } from "../lib/storyboard";
import { buildAssetPromptPrompt, buildCleanScriptPrompt, buildEpisodeSupportPrompt, buildSceneContextPrompt, type PromptTemplate } from "./prompts";
import {
  type AssetPromptArtifact,
  type EpisodeSupportArtifact,
  type SceneContextArtifact,
  type ScriptCleanArtifact,
  validateEpisodeSupportArtifact,
  validateSceneContextArtifact,
  validateScriptCleanArtifact,
  validateAssetPromptArtifact,
  type ValidationResult,
} from "./schemas";
import { defaultLlmExecutorConfig } from "./llmConfig";
import type { LlmCallTrace, LlmExecutorConfig, PipelineLogEntry } from "./types";
import { backendApiBaseUrl } from "../lib/backendApi";

export interface ExecutorResult<T> {
  artifact: T;
  prompt: PromptTemplate;
  validation: ValidationResult;
  logs: PipelineLogEntry[];
  trace: LlmCallTrace;
  durationMs: number;
}

export interface P1ExecutorOutput {
  clean: ExecutorResult<ScriptCleanArtifact>;
  episodeSupport: ExecutorResult<EpisodeSupportArtifact>[];
  sceneContext: ExecutorResult<SceneContextArtifact>[];
  assetPrompts: ExecutorResult<AssetPromptArtifact>[];
}

export function getDefaultLlmConfig(): LlmExecutorConfig {
  return defaultLlmExecutorConfig;
}

export async function runP1Executors(script: string, analysis: ScriptAnalysis, config = getDefaultLlmConfig()): Promise<P1ExecutorOutput> {
  return runRealP1Executors(script, analysis, config);
}

async function runRealP1Executors(script: string, analysis: ScriptAnalysis, config: LlmExecutorConfig): Promise<P1ExecutorOutput> {
  if (!config.apiKey?.trim() && !config.hasApiKey) throw new Error("DeepSeek API Key 未配置。");
  const clean = await runRealCleanScript(script, config);
  const episodeSupport: ExecutorResult<EpisodeSupportArtifact>[] = [];
  for (const episode of analysis.episodes) {
    episodeSupport.push(await runRealEpisodeSupport(episode, config));
  }
  const sceneContext: ExecutorResult<SceneContextArtifact>[] = [];
  for (const episode of analysis.episodes) {
    sceneContext.push(await runRealSceneContext(analysis, episode, config));
  }
  const assetPrompts: ExecutorResult<AssetPromptArtifact>[] = [];
  for (const episode of analysis.episodes) {
    assetPrompts.push(await runRealAssetPrompts(analysis, episode, config));
  }
  return { clean, episodeSupport, sceneContext, assetPrompts };
}

async function runRealCleanScript(script: string, config: LlmExecutorConfig): Promise<ExecutorResult<ScriptCleanArtifact>> {
  const prompt = buildCleanScriptPrompt(script);
  return runRealJsonStage("stage:01", "剧本清洗", prompt, config, validateScriptCleanArtifact);
}

async function runRealEpisodeSupport(episode: EpisodeResult, config: LlmExecutorConfig): Promise<ExecutorResult<EpisodeSupportArtifact>> {
  const prompt = buildEpisodeSupportPrompt(episode);
  return runRealJsonStage("stage:03", `${episode.episodeId} 集级辅助`, prompt, config, validateEpisodeSupportArtifact);
}

async function runRealSceneContext(analysis: ScriptAnalysis, episode: EpisodeResult, config: LlmExecutorConfig): Promise<ExecutorResult<SceneContextArtifact>> {
  const prompt = buildSceneContextPrompt(analysis, episode);
  return runRealJsonStage("stage:04", `${episode.episodeId} 场级上下文`, prompt, config, validateSceneContextArtifact);
}

async function runRealAssetPrompts(analysis: ScriptAnalysis, episode: EpisodeResult, config: LlmExecutorConfig): Promise<ExecutorResult<AssetPromptArtifact>> {
  const prompt = buildAssetPromptPrompt(analysis, episode);
  return runRealJsonStage("stage:05", `${episode.episodeId} 资产描述`, prompt, config, validateAssetPromptArtifact);
}

async function runRealJsonStage<T>(
  source: string,
  label: string,
  prompt: PromptTemplate,
  config: LlmExecutorConfig,
  validate: (value: unknown) => ValidationResult,
): Promise<ExecutorResult<T>> {
  const start = performance.now();
  const response = await fetch(`${backendApiBaseUrl}/api/llm/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      model: config.model,
      temperature: config.temperature,
      jsonMode: config.jsonMode,
      stageId: prompt.stageId,
      label,
      promptId: prompt.promptId,
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: `${prompt.user}\n\n输出契约：${prompt.outputContract}` },
      ],
    }),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`${label} 调用失败：HTTP ${response.status} ${raw.slice(0, 300)}`);
  }
  const parsedResponse = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
  const content = parsedResponse.choices?.[0]?.message?.content;
  if (!content) throw new Error(`${label} 返回为空。`);
  const artifact = parseJsonContent(content) as T;
  const validation = validate(artifact);
  const durationMs = elapsed(start);
  const trace: LlmCallTrace = {
    traceId: `${source}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`,
    stageId: prompt.stageId,
    label,
    promptId: prompt.promptId,
    promptName: prompt.promptName,
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    outputContract: prompt.outputContract,
    rawResponse: content,
    parsedJson: artifact,
    validationErrors: validation.errors,
    durationMs,
  };
  return {
    artifact,
    prompt,
    validation,
    trace,
    durationMs,
    logs: [
      log(
        source,
        validation.ok ? "success" : "error",
        `${label} ${executorLabel(config)} 完成`,
        validation.ok
          ? `Prompt ${prompt.promptName}，Schema 通过，${durationMs}ms。`
          : `Prompt ${prompt.promptName}，Schema 失败：${validation.errors.join("；")}`,
      ),
    ],
  };
}

function log(source: string, level: PipelineLogEntry["level"], message: string, detail?: string): PipelineLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    source,
    level,
    message,
    detail,
  };
}

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(withoutFence);
  }
  return JSON.parse(trimmed);
}

function executorLabel(config: LlmExecutorConfig) {
  return config.model;
}

function elapsed(start: number) {
  return Math.max(1, Math.round(performance.now() - start));
}
