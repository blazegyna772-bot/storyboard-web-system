import { analyzeScript } from "./storyboard";
import type { AnalysisOptions, ScriptAnalysis } from "./storyboard";
import { buildArtifactBundle } from "../pipeline/artifacts";
import type { ArtifactRecord, LockRecord, TaskRecord } from "../pipeline/artifacts";
import type { AssetImageCandidate } from "../pipeline/imageGeneration";
import type { PipelineRun } from "../pipeline/types";

const storeKey = "storyboard-project-store-v1";

export interface StoryboardProject {
  projectId: string;
  name: string;
  folderName?: string;
  rootName?: string;
  updatedAt: string;
  script: string;
  options: AnalysisOptions;
  analysis: ScriptAnalysis;
  latestRun: PipelineRun | null;
  artifacts: ArtifactRecord[];
  locks: LockRecord[];
  tasks: TaskRecord[];
  imageCandidates: AssetImageCandidate[];
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
  latestRun: PipelineRun | null;
  artifacts?: ArtifactRecord[];
  locks?: LockRecord[];
  tasks?: TaskRecord[];
  imageCandidates?: AssetImageCandidate[];
}

export function loadProjectStore(fallbackScript: string, fallbackOptions: AnalysisOptions): ProjectStoreState {
  const raw = localStorage.getItem(storeKey);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as ProjectStoreState;
      if (parsed.projects?.length && parsed.activeProjectId) {
        return {
          ...parsed,
          projects: parsed.projects.map((project) => {
            const bundle = buildArtifactBundle(project.script, project.analysis);
            return {
              ...project,
              options: normalizeAnalysisOptions(project.options, fallbackOptions),
              folderName: project.folderName ?? toSafeFolderName(project.name),
              artifacts: project.artifacts ?? bundle.artifacts,
              locks: project.locks ?? bundle.locks,
              tasks: project.tasks ?? bundle.tasks,
              imageCandidates: project.imageCandidates ?? [],
            };
          }),
        };
      }
    } catch {
      localStorage.removeItem(storeKey);
    }
  }

  const defaultProject = createProject({
    name: "默认项目",
    script: fallbackScript,
    options: fallbackOptions,
    analysis: analyzeScript(fallbackScript, fallbackOptions),
    latestRun: null,
  });
  const initialState = {
    activeProjectId: defaultProject.projectId,
    projects: [defaultProject],
  };
  saveProjectStore(initialState);
  return initialState;
}

export function saveProjectStore(state: ProjectStoreState) {
  localStorage.setItem(storeKey, JSON.stringify(state));
}

export function createProject(input: Omit<ProjectSnapshotInput, "projectId">): StoryboardProject {
  const now = new Date().toISOString();
  const bundle = buildArtifactBundle(input.script, input.analysis);
  const project: StoryboardProject = {
    projectId: createId("PRJ"),
    name: input.name,
    folderName: toSafeFolderName(input.name),
    updatedAt: now,
    script: input.script,
    options: input.options,
    analysis: input.analysis,
    latestRun: input.latestRun,
    artifacts: input.artifacts ?? bundle.artifacts,
    locks: input.locks ?? bundle.locks,
    tasks: input.tasks ?? bundle.tasks,
    imageCandidates: input.imageCandidates ?? [],
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
    latestRun: input.latestRun,
    artifacts: input.artifacts ?? project.artifacts ?? [],
    locks: input.locks ?? project.locks ?? [],
    tasks: input.tasks ?? project.tasks ?? [],
    imageCandidates: input.imageCandidates ?? project.imageCandidates ?? [],
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
