import { analyzeScript } from "./storyboard";
import type { AnalysisOptions, ScriptAnalysis } from "./storyboard";

export interface StoryboardProject {
  projectId: string;
  name: string;
  folderName?: string;
  rootName?: string;
  updatedAt: string;
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
    updatedAt: now,
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
    updatedAt: new Date().toISOString(),
    script: input.script,
    options: input.options,
    analysis: input.analysis,
  };
}

export function normalizeProjectAnalysis(script: string, analysis: ScriptAnalysis | undefined, options: AnalysisOptions): ScriptAnalysis {
  const nextAnalysis = analyzeScript(script, options);
  if (!analysis?.episodes?.length) return nextAnalysis;
  if (script.trim() && nextAnalysis.episodes.length !== analysis.episodes.length) return nextAnalysis;
  if (script.trim() && analysis.totalCharacters !== script.trim().length) return nextAnalysis;
  return {
    ...analysis,
    options,
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}

function normalizeAnalysisOptions(options: AnalysisOptions | undefined, fallback: AnalysisOptions): AnalysisOptions {
  return {
    genreProfile: options?.genreProfile ?? fallback.genreProfile,
    directorProfile: options?.directorProfile ?? fallback.directorProfile,
    targetShotSeconds: options?.targetShotSeconds ?? fallback.targetShotSeconds,
    aspectRatio: options?.aspectRatio ?? fallback.aspectRatio,
    contentType: options?.contentType ?? fallback.contentType,
  };
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
