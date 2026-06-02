export type PipelineStageStatus = "pending" | "ready" | "running" | "done" | "blocked";
export type PipelineGranularity = "project" | "episode" | "scene" | "block" | "shot" | "export";
export type PipelineArtifactRole = "final" | "support" | "validation" | "delivery";

export interface PipelineStage {
  id: string;
  name: string;
  description: string;
  granularity: PipelineGranularity;
  artifactRole: PipelineArtifactRole;
  purpose: string;
  inputRefs: string[];
  outputRefs: string[];
  executor: "rule" | "llm" | "image" | "export";
  status: PipelineStageStatus;
  dependencies: string[];
  lockPolicy?: string;
  rerunScopes?: string[];
}

export interface RulePack {
  id: string;
  name: string;
  description: string;
  appliesTo: string[];
  rules: string[];
}

export interface GenreProfile {
  id: string;
  name: string;
  description: string;
  priorities: string[];
}

export interface DirectorProfile {
  id: string;
  name: string;
  description: string;
  shotLanguage: string[];
}

export interface OutputAdapter {
  id: string;
  name: string;
  description: string;
  files: string[];
}

export interface PipelineConfig {
  id: string;
  name: string;
  inputMode: string;
  genreProfileId: string;
  directorProfileId: string;
  rulePackIds: string[];
  outputAdapterId: string;
  stages: PipelineStage[];
}

export interface PipelineRunSummary {
  totalStages: number;
  doneStages: number;
  blockedStages: number;
  llmStages: number;
  ruleStages: number;
  finalStages: number;
  supportStages: number;
  outputFiles: string[];
}

export type PipelineRunStatus = "idle" | "running" | "done" | "failed" | "blocked";

export interface PipelineLogEntry {
  id: string;
  time: string;
  source: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  detail?: string;
}

export type LlmProviderMode = "openai-compatible";

export interface LlmExecutorConfig {
  mode: LlmProviderMode;
  provider: "deepseek" | "openai-compatible";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey: boolean;
  temperature: number;
  jsonMode: boolean;
}

export interface LlmCallTrace {
  traceId: string;
  stageId: string;
  label: string;
  promptId: string;
  promptName: string;
  systemPrompt: string;
  userPrompt: string;
  outputContract: string;
  rawResponse: string;
  parsedJson?: unknown;
  validationErrors: string[];
  durationMs: number;
}

export interface ImageGenerationConfig {
  mode: "openai-compatible";
  provider: "openai-compatible";
  model: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey: boolean;
  size: string;
}

export interface StageResult {
  stageId: string;
  stageName: string;
  status: PipelineStageStatus;
  executor: PipelineStage["executor"];
  artifactRole: PipelineArtifactRole;
  inputRefs: string[];
  outputRefs: string[];
  startedAt?: string;
  finishedAt?: string;
  durationMs?: number;
  artifactSummary: string;
  blockReason?: string;
  logs: PipelineLogEntry[];
  traces?: LlmCallTrace[];
}

export interface PipelineRun {
  runId: string;
  projectId: string;
  trigger: "manual_generate" | "manual_rerun" | "import" | "export";
  status: PipelineRunStatus;
  startedAt: string;
  finishedAt?: string;
  stageResults: StageResult[];
  logs: PipelineLogEntry[];
}
