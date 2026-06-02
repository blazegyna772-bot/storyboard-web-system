import { analyzeScript } from "./storyboard";
import type { AnalysisOptions, ScriptAnalysis } from "./storyboard";
import { buildArtifactBundle } from "../pipeline/artifacts";
import type { ArtifactRecord, LockRecord, TaskRecord } from "../pipeline/artifacts";
import type { AssetImageCandidate } from "../pipeline/imageGeneration";
import type { PipelineRun } from "../pipeline/types";

const storeKey = "storyboard-project-store-v1";

export interface ProjectVersion {
  versionId: string;
  name: string;
  createdAt: string;
  summary: string;
  snapshot: {
    script: string;
    options: AnalysisOptions;
    analysis: ScriptAnalysis;
    latestRun: PipelineRun | null;
    artifacts: ArtifactRecord[];
    locks: LockRecord[];
    tasks: TaskRecord[];
    imageCandidates: AssetImageCandidate[];
  };
}

export interface StoryboardProject {
  projectId: string;
  name: string;
  updatedAt: string;
  script: string;
  options: AnalysisOptions;
  analysis: ScriptAnalysis;
  latestRun: PipelineRun | null;
  artifacts: ArtifactRecord[];
  locks: LockRecord[];
  tasks: TaskRecord[];
  imageCandidates: AssetImageCandidate[];
  versions: ProjectVersion[];
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
    updatedAt: now,
    script: input.script,
    options: input.options,
    analysis: input.analysis,
    latestRun: input.latestRun,
    artifacts: input.artifacts ?? bundle.artifacts,
    locks: input.locks ?? bundle.locks,
    tasks: input.tasks ?? bundle.tasks,
    imageCandidates: input.imageCandidates ?? [],
    versions: [],
  };
  return addProjectVersion(project, "初始版本");
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

export function addProjectVersion(project: StoryboardProject, versionName: string): StoryboardProject {
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    versions: [createVersion(versionName, project), ...project.versions].slice(0, 30),
  };
}

export function restoreProjectVersion(project: StoryboardProject, versionId: string): StoryboardProject {
  const version = project.versions.find((item) => item.versionId === versionId);
  if (!version) return project;
  return {
    ...project,
    updatedAt: new Date().toISOString(),
    script: version.snapshot.script,
    options: version.snapshot.options,
    analysis: version.snapshot.analysis,
    latestRun: version.snapshot.latestRun,
    artifacts: version.snapshot.artifacts,
    locks: version.snapshot.locks,
    tasks: version.snapshot.tasks,
    imageCandidates: version.snapshot.imageCandidates ?? [],
  };
}

export function createVersion(name: string, project: StoryboardProject): ProjectVersion {
  return {
    versionId: createId("VER"),
    name,
    createdAt: new Date().toISOString(),
    summary: `${project.analysis.episodes.length} 集 / ${project.analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0)} 资产 / ${project.analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0)} 镜头`,
    snapshot: {
      script: project.script,
      options: project.options,
      analysis: project.analysis,
      latestRun: project.latestRun,
      artifacts: project.artifacts,
      locks: project.locks,
      tasks: project.tasks,
      imageCandidates: project.imageCandidates,
    },
  };
}

function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
}
