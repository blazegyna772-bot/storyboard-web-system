import type { AssetDescription } from "../lib/storyboard";
import type { ImageGenerationConfig, PipelineLogEntry } from "./types";

export type AssetImageStatus = "pending" | "running" | "done" | "failed" | "locked";

export interface AssetImageCandidate {
  candidateId: string;
  assetId: string;
  prompt: string;
  imageUrl?: string;
  status: AssetImageStatus;
  error?: string;
  createdAt: string;
}

export interface AssetImageJobResult {
  candidate: AssetImageCandidate;
  logs: PipelineLogEntry[];
}

export async function generateAssetImage(asset: AssetDescription, config: ImageGenerationConfig): Promise<AssetImageJobResult> {
  const startedAt = performance.now();
  const prompt = asset.imagePrompt || `${asset.name}，${asset.description}，${asset.continuity}`;
  if (!config.apiKey?.trim() || !config.baseUrl?.trim()) {
    const candidate = buildCandidate(asset.assetId, prompt, "failed", undefined, "图片生成接口未配置 baseUrl 或 API Key。");
    return {
      candidate,
      logs: [log("image", "error", `${asset.name} 生图失败`, candidate.error)],
    };
  }

  try {
    const response = await fetch("/api/image/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.model,
        prompt,
        size: config.size,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    const imageUrl = data.imageUrl as string | undefined;
    const candidate = buildCandidate(asset.assetId, prompt, "done", imageUrl);
    return {
      candidate,
      logs: [log("image", "success", `${asset.name} 生图完成`, `${config.model}，${Math.round(performance.now() - startedAt)}ms。`)],
    };
  } catch (error) {
    const candidate = buildCandidate(asset.assetId, prompt, "failed", undefined, error instanceof Error ? error.message : "未知生图错误。");
    return {
      candidate,
      logs: [log("image", "error", `${asset.name} 生图失败`, candidate.error)],
    };
  }
}

function buildCandidate(assetId: string, prompt: string, status: AssetImageStatus, imageUrl?: string, error?: string): AssetImageCandidate {
  return {
    candidateId: `IMG-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    assetId,
    prompt,
    imageUrl,
    status,
    error,
    createdAt: new Date().toISOString(),
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
