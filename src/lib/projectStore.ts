import { analyzeScript } from "./storyboard";
import type { AnalysisOptions, EpisodeResult, ScriptAnalysis } from "./storyboard";

export interface StoryboardProject {
  projectId: string;
  name: string;
  folderName?: string;
  rootName?: string;
  createdAt?: string;
  updatedAt: string;
  description?: string;
  owner?: string;
  status?: string;
  coverImage?: string;
  script: string;
  options: AnalysisOptions;
  analysis: ScriptAnalysis;
}

export interface ProjectStoreState {
  activeProjectId: string;
  projects: StoryboardProject[];
}

export interface ProjectSnapshotInput {
  projectId?: string;
  name: string;
  script: string;
  options: AnalysisOptions;
  analysis: ScriptAnalysis;
}

export function createProject(input: Omit<ProjectSnapshotInput, "projectId">): StoryboardProject {
  const now = new Date().toISOString();
  const project: StoryboardProject = {
    projectId: createId("PRJ"),
    name: input.name,
    folderName: toSafeFolderName(input.name),
    createdAt: now,
    updatedAt: now,
    description: "",
    owner: "",
    status: "制作中",
    coverImage: "",
    script: input.script,
    options: input.options,
    analysis: input.analysis,
  };
  return project;
}

export function updateProjectSnapshot(project: StoryboardProject, input: ProjectSnapshotInput): StoryboardProject {
  return {
    ...project,
    name: input.name,
    createdAt: project.createdAt || project.updatedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    description: project.description ?? "",
    owner: project.owner ?? "",
    status: project.status ?? "制作中",
    coverImage: project.coverImage ?? "",
    script: input.script,
    options: input.options,
    analysis: input.analysis,
  };
}

export function normalizeProjectOptions(options: Partial<AnalysisOptions> | undefined, fallback: AnalysisOptions): AnalysisOptions {
  const targetShotSeconds = Number(options?.targetShotSeconds ?? fallback.targetShotSeconds);
  return {
    genreProfile: options?.genreProfile || fallback.genreProfile || "都市情感短剧",
    directorProfile: options?.directorProfile || fallback.directorProfile || "强冲突快节奏",
    targetShotSeconds: Number.isFinite(targetShotSeconds) ? targetShotSeconds : 5,
    aspectRatio: options?.aspectRatio || fallback.aspectRatio || "9:16",
    contentType: options?.contentType || fallback.contentType || "短剧",
  };
}

export function normalizeProject(project: StoryboardProject, fallbackOptions: AnalysisOptions): StoryboardProject {
  const options = normalizeProjectOptions(project.options, fallbackOptions);
  return {
    ...project,
    folderName: project.folderName || toSafeFolderName(project.name),
    createdAt: project.createdAt || project.updatedAt || new Date().toISOString(),
    updatedAt: project.updatedAt || new Date().toISOString(),
    description: project.description ?? "",
    owner: project.owner ?? "",
    status: project.status ?? "制作中",
    coverImage: project.coverImage ?? "",
    script: project.script ?? "",
    options,
    analysis: normalizeProjectAnalysis(project.script ?? "", project.analysis, options),
  };
}

export function normalizeProjectAnalysis(script: string, analysis: ScriptAnalysis | undefined, options: AnalysisOptions): ScriptAnalysis {
  const normalizedOptions = normalizeProjectOptions(options, options);
  const nextAnalysis = analyzeScript(script, normalizedOptions);
  if (!Array.isArray(analysis?.episodes) || !analysis.episodes.length) return nextAnalysis;
  if (script.trim() && nextAnalysis.episodes.length !== analysis.episodes.length) return nextAnalysis;
  if (script.trim() && analysis.totalCharacters !== script.trim().length) return nextAnalysis;
  return {
    ...analysis,
    totalCharacters: Number.isFinite(Number(analysis.totalCharacters)) ? Number(analysis.totalCharacters) : nextAnalysis.totalCharacters,
    options: normalizedOptions,
    episodes: analysis.episodes.map((episode, index) => normalizeEpisodeResult(episode, nextAnalysis.episodes[index])),
    warnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
  };
}

function normalizeEpisodeResult(episode: Partial<EpisodeResult> | undefined, fallback: EpisodeResult | undefined): EpisodeResult {
  const sourceText = episode?.sourceText ?? fallback?.sourceText ?? "";
  return {
    episodeId: episode?.episodeId || fallback?.episodeId || "EP01",
    title: episode?.title || fallback?.title || episode?.episodeId || "EP01",
    logline: episode?.logline || fallback?.logline || "",
    sourceText,
    characterCount: Number.isFinite(Number(episode?.characterCount)) ? Number(episode?.characterCount) : sourceText.length,
    assets: Array.isArray(episode?.assets) ? episode.assets : fallback?.assets ?? [],
    shots: Array.isArray(episode?.shots) ? episode.shots : fallback?.shots ?? [],
    prompts: Array.isArray(episode?.prompts) ? episode.prompts : fallback?.prompts ?? [],
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

export function createDefaultProjectName(existingCount: number) {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `${date}-${String(existingCount + 1).padStart(3, "0")}`;
}

export function toSafeFolderName(value: string) {
  const cleaned = value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ");
  return cleaned || createDefaultProjectName(0);
}
