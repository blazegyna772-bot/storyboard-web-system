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

export interface ImageGenerationConfig {
  mode: "provider";
  provider: string;
  model: string;
  baseUrl?: string;
  runtimeBaseUrl?: string;
  apiKey?: string;
  hasApiKey: boolean;
  aspectRatio: string;
  imageSize: string;
  size: string;
  requestTimeout: number;
  downloadTimeout: number;
}
