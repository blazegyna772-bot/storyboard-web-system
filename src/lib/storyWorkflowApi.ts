import { backendRequest } from "./backendApi";

export type StoryWorkflowNodeId = "01A" | "01B" | "01C" | "01D" | "02" | "03" | "04" | "05" | "06";

export interface StoryWorkflowNode {
  id: StoryWorkflowNodeId;
  title: string;
  page: "planning" | "storyboard" | "video";
  scope: string;
  inputSummary: string;
  outputSummary: string;
  promptPath: string;
  dependsOn: StoryWorkflowNodeId[];
}

export interface StoryWorkflowArtifact {
  nodeId: StoryWorkflowNodeId;
  title: string;
  status: "idle" | "running" | "done" | "error";
  updatedAt: string;
  inputSummary: string;
  output: Record<string, unknown>;
  rawText: string;
  error: string;
}

export interface StoryWorkflowSceneRef {
  sceneId: string;
  title: string;
}

export interface StoryWorkflowEpisodeRef {
  episodeId: string;
  title: string;
  scenes: StoryWorkflowSceneRef[];
}

export interface StoryWorkflowState {
  projectId: string;
  nodes: StoryWorkflowNode[];
  episodes: StoryWorkflowEpisodeRef[];
  artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>;
}

export interface RunStoryWorkflowNodeInput {
  nodeId: StoryWorkflowNodeId;
  episodeId?: string;
  sceneId?: string;
  chapterId?: string;
  maxTokens?: number;
}

export function loadStoryWorkflowState(projectId: string) {
  return backendRequest<StoryWorkflowState>(`/api/story-workflow/${encodeURIComponent(projectId)}`);
}

export function runStoryWorkflowNode(projectId: string, input: RunStoryWorkflowNodeInput) {
  return backendRequest<{ artifact: StoryWorkflowArtifact }>(`/api/story-workflow/${encodeURIComponent(projectId)}/run`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function runStoryWorkflowAll(projectId: string, input: RunStoryWorkflowNodeInput & { nodeIds?: StoryWorkflowNodeId[] }) {
  return backendRequest<{ artifacts: StoryWorkflowArtifact[] }>(`/api/story-workflow/${encodeURIComponent(projectId)}/run-all`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function saveStoryWorkflowArtifact(projectId: string, nodeId: StoryWorkflowNodeId, input: { output?: Record<string, unknown>; rawText?: string }) {
  return backendRequest<{ artifact: StoryWorkflowArtifact }>(`/api/story-workflow/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(nodeId)}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
