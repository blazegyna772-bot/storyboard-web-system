export type ReliabilityLevel = "explicit" | "inferred" | "needs_review";

export interface SourceRef {
  refId: string;
  text: string;
  confidence: ReliabilityLevel;
}

export interface ScriptCleanArtifact {
  cleanedScript: string;
  issues: Array<{
    id: string;
    severity: "info" | "warning" | "error";
    category: "format" | "naming" | "continuity" | "typo" | "missing_info";
    message: string;
    sourceRefs: SourceRef[];
  }>;
  sourceReliability: ReliabilityLevel;
}

export interface EpisodeSupportArtifact {
  episodeId: string;
  revealOrder: SupportFact[];
  emotionArc: SupportFact[];
  relationshipConstraints: SupportFact[];
  propContinuity: SupportFact[];
  visualStrategy: SupportFact[];
  forbiddenEarlyReveals: SupportFact[];
}

export interface SupportFact {
  id: string;
  fact: string;
  useAs: "constraint" | "parameter" | "warning";
  usedBy: Array<"plan_scene_context" | "plan_scene_storyboard" | "generate_block_shots" | "build_video_prompts">;
  sourceRefs: SourceRef[];
  reliability: ReliabilityLevel;
}

export interface SceneContextArtifact {
  sceneId: string;
  episodeId: string;
  scenePurpose: string;
  entrancesExits: SupportFact[];
  propFlow: SupportFact[];
  spatialAnchors: SupportFact[];
  sceneSpatialTimeline: Array<{
    beatId: string;
    order: number;
    state: string;
    sourceRefs: SourceRef[];
    reliability: ReliabilityLevel;
  }>;
  continuityNotes: SupportFact[];
}

export interface AssetPromptArtifact {
  episodeId: string;
  assets: Array<{
    assetId: string;
    type: "角色" | "场景" | "道具";
    name: string;
    description: string;
    imagePrompt: string;
    continuity: string;
    sourceRefs: SourceRef[];
    reliability: ReliabilityLevel;
  }>;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateScriptCleanArtifact(value: unknown): ValidationResult {
  const errors: string[] = [];
  const item = value as Partial<ScriptCleanArtifact>;
  if (!item || typeof item !== "object") errors.push("结果不是对象。");
  if (typeof item.cleanedScript !== "string") errors.push("cleanedScript 必须是字符串。");
  if (!Array.isArray(item.issues)) errors.push("issues 必须是数组。");
  if (!isReliability(item.sourceReliability)) errors.push("sourceReliability 非法。");
  for (const issue of item.issues ?? []) {
    if (!Array.isArray(issue.sourceRefs) || issue.sourceRefs.length === 0) {
      errors.push(`issue ${issue.id ?? "unknown"} 缺少 sourceRefs。`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateEpisodeSupportArtifact(value: unknown): ValidationResult {
  const errors: string[] = [];
  const item = value as Partial<EpisodeSupportArtifact>;
  if (!item || typeof item !== "object") errors.push("结果不是对象。");
  if (typeof item.episodeId !== "string") errors.push("episodeId 必须是字符串。");
  for (const field of ["revealOrder", "emotionArc", "relationshipConstraints", "propContinuity", "visualStrategy", "forbiddenEarlyReveals"] as const) {
    validateSupportFacts(field, item[field], errors);
  }
  return { ok: errors.length === 0, errors };
}

export function validateSceneContextArtifact(value: unknown): ValidationResult {
  const errors: string[] = [];
  const item = value as Partial<SceneContextArtifact>;
  if (!item || typeof item !== "object") errors.push("结果不是对象。");
  if (typeof item.sceneId !== "string") errors.push("sceneId 必须是字符串。");
  if (typeof item.episodeId !== "string") errors.push("episodeId 必须是字符串。");
  if (typeof item.scenePurpose !== "string") errors.push("scenePurpose 必须是字符串。");
  for (const field of ["entrancesExits", "propFlow", "spatialAnchors", "continuityNotes"] as const) {
    validateSupportFacts(field, item[field], errors);
  }
  if (!Array.isArray(item.sceneSpatialTimeline)) {
    errors.push("sceneSpatialTimeline 必须是数组。");
  } else {
    for (const timeline of item.sceneSpatialTimeline) {
      if (!timeline.state || !Array.isArray(timeline.sourceRefs) || timeline.sourceRefs.length === 0) {
        errors.push(`timeline ${timeline.beatId ?? "unknown"} 缺少 state 或 sourceRefs。`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateAssetPromptArtifact(value: unknown): ValidationResult {
  const errors: string[] = [];
  const item = value as Partial<AssetPromptArtifact>;
  if (!item || typeof item !== "object") errors.push("结果不是对象。");
  if (typeof item.episodeId !== "string") errors.push("episodeId 必须是字符串。");
  if (!Array.isArray(item.assets)) {
    errors.push("assets 必须是数组。");
  } else {
    for (const asset of item.assets) {
      if (!asset.assetId) errors.push("asset 缺少 assetId。");
      if (!asset.name) errors.push(`${asset.assetId ?? "unknown"} 缺少 name。`);
      if (!asset.description) errors.push(`${asset.assetId ?? "unknown"} 缺少 description。`);
      if (!asset.imagePrompt) errors.push(`${asset.assetId ?? "unknown"} 缺少 imagePrompt。`);
      if (!asset.continuity) errors.push(`${asset.assetId ?? "unknown"} 缺少 continuity。`);
      if (!Array.isArray(asset.sourceRefs) || asset.sourceRefs.length === 0) errors.push(`${asset.assetId ?? "unknown"} 缺少 sourceRefs。`);
      if (!isReliability(asset.reliability)) errors.push(`${asset.assetId ?? "unknown"} reliability 非法。`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateSupportFacts(field: string, value: unknown, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${field} 必须是数组。`);
    return;
  }
  for (const fact of value as Partial<SupportFact>[]) {
    if (!fact.fact) errors.push(`${field} 存在空 fact。`);
    if (!fact.useAs) errors.push(`${field} ${fact.id ?? "unknown"} 缺少 useAs。`);
    if (!Array.isArray(fact.usedBy) || fact.usedBy.length === 0) errors.push(`${field} ${fact.id ?? "unknown"} 缺少 usedBy。`);
    if (!Array.isArray(fact.sourceRefs) || fact.sourceRefs.length === 0) errors.push(`${field} ${fact.id ?? "unknown"} 缺少 sourceRefs。`);
    if (!isReliability(fact.reliability)) errors.push(`${field} ${fact.id ?? "unknown"} reliability 非法。`);
  }
}

function isReliability(value: unknown): value is ReliabilityLevel {
  return value === "explicit" || value === "inferred" || value === "needs_review";
}
