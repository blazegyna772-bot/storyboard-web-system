import type { AnalysisOptions } from "./storyboard";
import type { StoryboardProject } from "./projectStore";
import { backendRequest } from "./backendApi";

export interface BackendRoot {
  rootName: string;
  rootPath: string;
  isActive: boolean;
}

export interface BackendRootState {
  roots: BackendRoot[];
  activeRootPath: string;
}

export function getBackendRoots() {
  return backendRequest<BackendRootState>("/api/projects/roots");
}

export function addBackendRoot(rootPath: string) {
  return backendRequest<BackendRootState>("/api/projects/roots", {
    method: "POST",
    body: JSON.stringify({ rootPath }),
  });
}

export function activateBackendRoot(rootPath: string) {
  return backendRequest<BackendRootState>("/api/projects/roots/active", {
    method: "POST",
    body: JSON.stringify({ rootPath }),
  });
}

export function pickBackendDirectory() {
  return backendRequest<{ rootPath: string }>("/api/system/pick-directory", {
    method: "POST",
  });
}

export function removeBackendRoot(rootPath: string) {
  return backendRequest<BackendRootState>("/api/projects/roots/remove", {
    method: "POST",
    body: JSON.stringify({ rootPath }),
  });
}

export function listBackendProjects() {
  return backendRequest<{ projects: StoryboardProject[] }>("/api/projects");
}

export function loadBackendProject(projectId: string) {
  return backendRequest<{ project: StoryboardProject }>(`/api/projects/${encodeURIComponent(projectId)}`);
}

export function createBackendProject(name: string, options: AnalysisOptions) {
  return backendRequest<{ project: StoryboardProject }>("/api/projects", {
    method: "POST",
    body: JSON.stringify({ name, options }),
  });
}

export function saveBackendProject(project: StoryboardProject) {
  return backendRequest<{ project: StoryboardProject }>(`/api/projects/${encodeURIComponent(project.projectId)}`, {
    method: "PUT",
    body: JSON.stringify({ project }),
  });
}

export function uploadBackendProjectCover(projectId: string, filename: string, dataUrl: string) {
  return backendRequest<{ project: StoryboardProject }>(`/api/projects/${encodeURIComponent(projectId)}/cover`, {
    method: "POST",
    body: JSON.stringify({ filename, dataUrl }),
  });
}

export function deleteBackendProject(projectId: string) {
  return backendRequest<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
}
