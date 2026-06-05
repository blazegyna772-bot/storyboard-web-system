import type { AnalysisOptions } from "./storyboard";
import type { StoryboardProject } from "./projectStore";

export interface BackendRoot {
  rootName: string;
  rootPath: string;
  isActive: boolean;
}

export interface BackendRootState {
  roots: BackendRoot[];
  activeRootPath: string;
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Request failed: ${response.status}`);
  return payload as T;
}

export function getBackendRoots() {
  return apiRequest<BackendRootState>("/api/projects/roots");
}

export function addBackendRoot(rootPath: string) {
  return apiRequest<BackendRootState>("/api/projects/roots", {
    method: "POST",
    body: JSON.stringify({ rootPath }),
  });
}

export function removeBackendRoot(rootPath: string) {
  return apiRequest<BackendRootState>("/api/projects/roots/remove", {
    method: "POST",
    body: JSON.stringify({ rootPath }),
  });
}

export function listBackendProjects() {
  return apiRequest<{ projects: StoryboardProject[] }>("/api/projects");
}

export function loadBackendProject(projectId: string) {
  return apiRequest<{ project: StoryboardProject }>(`/api/projects/${encodeURIComponent(projectId)}`);
}

export function createBackendProject(name: string, options: AnalysisOptions) {
  return apiRequest<{ project: StoryboardProject }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, options }),
  });
}

export function saveBackendProject(project: StoryboardProject) {
  return apiRequest<{ project: StoryboardProject }>(`/api/projects/${encodeURIComponent(project.projectId)}`, {
    method: "PUT",
    body: JSON.stringify({ project }),
  });
}

export function deleteBackendProject(projectId: string) {
  return apiRequest<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
}
