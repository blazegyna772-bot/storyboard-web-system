import { backendRequest } from "./backendApi";
import type { ImageGenerationConfig, LlmExecutorConfig } from "../pipeline/types";

export interface BackendHealth {
  status: string;
  service: string;
}

export interface BackendSettings {
  general: {
    imageConcurrency: number;
  };
  llm: Omit<LlmExecutorConfig, "mode" | "apiKey">;
  image: Omit<ImageGenerationConfig, "mode" | "apiKey">;
}

export interface ImageProviderField {
  key: keyof ImageGenerationConfig | "apiKey";
  label: string;
  type: "password" | "select" | "model-select" | "model-size" | "number";
  source?: "baseUrls" | "models" | "aspectRatios" | "imageSizes" | "sizeMap";
  required?: boolean;
  min?: number;
  max?: number;
}

export interface ImageProviderModel {
  id: string;
  label: string;
  protocol: string;
  endpointTemplate: string;
  aspectRatios: string[];
  imageSizes: string[];
  sizeMap?: Record<string, string>;
  defaultAspectRatio: string;
  defaultImageSize: string;
  defaultSize: string;
  supportsReferenceImages: boolean;
  supportsMultipleImages: boolean;
}

export interface ImageProviderCatalog {
  id: string;
  name: string;
  description: string;
  baseUrls: Array<{ label: string; url: string }>;
  models: ImageProviderModel[];
  defaultModel: string;
  fields: ImageProviderField[];
}

export interface BackendRulepackPrompt {
  id: string;
  name: string;
  stage: string;
  path: string;
  variables: string[];
}

export interface BackendRulepack {
  id: string;
  name: string;
  path: string;
  prompts: BackendRulepackPrompt[];
}

export interface BackendPromptDetail {
  prompt: BackendRulepackPrompt;
  content: string;
}

export interface BackendLlmLog {
  id: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  stageId?: string;
  label?: string;
  promptId?: string;
  model?: string;
  baseUrl?: string;
  statusCode?: number;
  durationMs?: number;
  message: string;
  detail?: string;
  responsePreview?: string;
  responseText?: string;
  messages?: Array<{ role: string; content: string }>;
  messagesPreview?: Array<{ role: string; chars: number; preview: string }>;
  responseChars?: number;
  request?: {
    messageCount?: number;
    systemChars?: number;
    userChars?: number;
    jsonMode?: boolean;
  };
}

export interface BackendImageLog {
  id: string;
  taskId?: string;
  time: string;
  level: "info" | "success" | "warning" | "error";
  message: string;
  provider?: string;
  model?: string;
  baseUrl?: string;
  protocol?: string;
  promptPreview?: string;
  url?: string;
  statusCode?: number;
  detail?: string;
  payload?: unknown;
  imageCount?: number;
}

export interface BackendImageTask {
  taskId: string;
  category?: "image";
  type?: string;
  status: "running" | "success" | "error" | "warning";
  provider?: string;
  model?: string;
  baseUrl?: string;
  protocol?: string;
  promptPreview?: string;
  startedAt: string;
  endedAt?: string;
  updatedAt?: string;
  message?: string;
  imageCount?: number;
  selected?: { id?: string; label?: string; url?: string; path?: string };
  candidates?: Array<{ id?: string; label?: string; url?: string; path?: string }>;
  assetId?: string;
  assetKind?: string;
  projectId?: string;
}

export function getBackendHealth() {
  return backendRequest<BackendHealth>("/api/health");
}

export function getBackendSettings() {
  return backendRequest<BackendSettings>("/api/settings");
}

export function saveBackendLlmSettings(config: LlmExecutorConfig) {
  return backendRequest<BackendSettings>("/api/settings/llm", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function saveBackendGeneralSettings(config: BackendSettings["general"]) {
  return backendRequest<BackendSettings>("/api/settings/general", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function listBackendImageProviders() {
  return backendRequest<{ providers: ImageProviderCatalog[] }>("/api/settings/image-providers");
}

export function saveBackendImageSettings(config: ImageGenerationConfig) {
  const { apiKey, ...rest } = config;
  const body = apiKey?.trim() ? { ...rest, apiKey } : rest;
  return backendRequest<BackendSettings>("/api/settings/image", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function getBackendImageApiKey() {
  return backendRequest<{ apiKey: string }>("/api/settings/image/key");
}

export function getBackendLlmApiKey() {
  return backendRequest<{ apiKey: string }>("/api/settings/llm/key");
}

export function listBackendRulepacks() {
  return backendRequest<{ rulepacks: BackendRulepack[] }>("/api/rulepacks");
}

export function loadBackendPrompt(promptId: string) {
  return backendRequest<BackendPromptDetail>(`/api/rulepacks/prompts/${encodeURIComponent(promptId)}`);
}

export function listBackendLlmLogs(limit = 80) {
  return backendRequest<{ logs: BackendLlmLog[] }>(`/api/logs/llm?limit=${limit}`);
}

export function getBackendLlmLog(logId: string) {
  return backendRequest<{ log: BackendLlmLog }>(`/api/logs/llm/${encodeURIComponent(logId)}`);
}

export function clearBackendLlmLogs() {
  return backendRequest<{ ok: true }>("/api/logs/llm", { method: "DELETE" });
}

export function listBackendImageLogs(limit = 100) {
  return backendRequest<{ logs: BackendImageLog[] }>(`/api/logs/image?limit=${limit}`);
}

export function listBackendImageTasks(limit = 100) {
  return backendRequest<{ tasks: BackendImageTask[] }>(`/api/logs/image/tasks?limit=${limit}`);
}

export function getBackendImageLog(logId: string) {
  return backendRequest<{ log: BackendImageLog }>(`/api/logs/image/${encodeURIComponent(logId)}`);
}

export function clearBackendImageLogs() {
  return backendRequest<{ ok: true }>("/api/logs/image", { method: "DELETE" });
}
