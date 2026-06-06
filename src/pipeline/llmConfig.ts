import type { LlmExecutorConfig } from "./types";

export const llmConfigStorageKey = "storyboard-llm-executor-config-v1";

export const defaultLlmExecutorConfig: LlmExecutorConfig = {
  mode: "openai-compatible",
  provider: "deepseek",
  model: "deepseek-chat",
  baseUrl: "https://api.deepseek.com",
  apiKey: "",
  hasApiKey: false,
  temperature: 0.2,
  jsonMode: true,
};

export function loadLlmExecutorConfig(): LlmExecutorConfig {
  const raw = localStorage.getItem(llmConfigStorageKey);
  if (!raw) return defaultLlmExecutorConfig;
  try {
    const parsed = JSON.parse(raw) as Partial<LlmExecutorConfig>;
    return normalizeLlmConfig({ ...parsed, apiKey: "", hasApiKey: false });
  } catch {
    localStorage.removeItem(llmConfigStorageKey);
    return defaultLlmExecutorConfig;
  }
}

export function saveLlmExecutorConfig(config: LlmExecutorConfig) {
  localStorage.setItem(llmConfigStorageKey, JSON.stringify(normalizeLlmConfig({ ...config, apiKey: "" })));
}

export function normalizeLlmConfig(config: Partial<LlmExecutorConfig>): LlmExecutorConfig {
  const apiKey = config.apiKey ?? "";
  return {
    ...defaultLlmExecutorConfig,
    ...config,
    mode: "openai-compatible",
    apiKey,
    hasApiKey: Boolean(apiKey.trim()) || Boolean(config.hasApiKey),
  };
}
