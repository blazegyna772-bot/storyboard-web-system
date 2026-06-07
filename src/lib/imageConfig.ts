import type { ImageGenerationConfig } from "./providerConfig";

export const imageConfigStorageKey = "storyboard-image-generation-config-v1";

export const defaultImageGenerationConfig: ImageGenerationConfig = {
  mode: "provider",
  provider: "geeknow",
  model: "gemini-3.1-flash-image-preview",
  baseUrl: "https://api.geeknow.ai",
  apiKey: "",
  hasApiKey: false,
  aspectRatio: "16:9",
  imageSize: "1K",
  size: "1920x1080",
  requestTimeout: 300,
  downloadTimeout: 300,
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
    mode: "provider",
    apiKey,
    hasApiKey: Boolean(apiKey.trim()),
    requestTimeout: Number(config.requestTimeout ?? defaultImageGenerationConfig.requestTimeout),
    downloadTimeout: Number(config.downloadTimeout ?? defaultImageGenerationConfig.downloadTimeout),
  };
}
