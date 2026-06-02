import type { ImageGenerationConfig } from "./types";

export const imageConfigStorageKey = "storyboard-image-generation-config-v1";

export const defaultImageGenerationConfig: ImageGenerationConfig = {
  mode: "openai-compatible",
  provider: "openai-compatible",
  model: "gpt-image-2",
  baseUrl: "",
  apiKey: "",
  hasApiKey: false,
  size: "1024x1024",
};

export function loadImageGenerationConfig(): ImageGenerationConfig {
  const raw = localStorage.getItem(imageConfigStorageKey);
  if (!raw) return defaultImageGenerationConfig;
  try {
    return normalizeImageConfig(JSON.parse(raw) as Partial<ImageGenerationConfig>);
  } catch {
    localStorage.removeItem(imageConfigStorageKey);
    return defaultImageGenerationConfig;
  }
}

export function saveImageGenerationConfig(config: ImageGenerationConfig) {
  localStorage.setItem(imageConfigStorageKey, JSON.stringify(normalizeImageConfig(config)));
}

export function normalizeImageConfig(config: Partial<ImageGenerationConfig>): ImageGenerationConfig {
  const apiKey = config.apiKey ?? "";
  return {
    ...defaultImageGenerationConfig,
    ...config,
    mode: "openai-compatible",
    apiKey,
    hasApiKey: Boolean(apiKey.trim()),
  };
}
