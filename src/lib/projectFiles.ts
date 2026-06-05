import { analyzeScript } from "./storyboard";
import type { StoryboardProject } from "./projectStore";

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
  }
}

interface FileSystemDirectoryHandle {
  name: string;
  values?(): AsyncIterable<FileSystemDirectoryHandle | FileSystemFileHandle>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FileSystemDirectoryHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandle>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
}

interface FileSystemFileHandle {
  kind?: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface ProjectRootSelection {
  rootName: string;
  handle: FileSystemDirectoryHandle;
}

export function canPickProjectRoot() {
  return typeof window.showDirectoryPicker === "function";
}

export async function pickProjectRoot(): Promise<ProjectRootSelection> {
  if (!window.showDirectoryPicker) throw new Error("当前浏览器不支持选择本地项目根目录。");
  const handle = await window.showDirectoryPicker();
  return {
    rootName: handle.name,
    handle,
  };
}

export async function writeProjectScaffold(root: ProjectRootSelection, project: StoryboardProject) {
  const folderName = project.folderName || project.name;
  const projectDir = await root.handle.getDirectoryHandle(folderName, { create: true });
  const inputDir = await projectDir.getDirectoryHandle("input", { create: true });
  const episodeDir = await inputDir.getDirectoryHandle("episodes", { create: true });
  await projectDir.getDirectoryHandle("config", { create: true });
  await projectDir.getDirectoryHandle("artifacts", { create: true });
  await projectDir.getDirectoryHandle("exports", { create: true });
  await writeEpisodeFiles(episodeDir, project.script);
  await writeTextFile(projectDir, "project.json", JSON.stringify(buildProjectManifest(root.rootName, project), null, 2));
}

export async function readProjectsFromRoot(root: ProjectRootSelection, fallbackOptions: StoryboardProject["options"]): Promise<StoryboardProject[]> {
  if (!root.handle.values) throw new Error("当前浏览器不支持扫描根目录。");
  const projects: StoryboardProject[] = [];

  for await (const entry of root.handle.values()) {
    if (!isDirectoryHandle(entry)) continue;
    const project = await readProjectDirectory(root, entry, fallbackOptions);
    if (project) projects.push(project);
  }

  return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export async function readProjectContent(root: ProjectRootSelection, project: StoryboardProject, fallbackOptions: StoryboardProject["options"]): Promise<StoryboardProject> {
  const folderName = project.folderName || project.name;
  const projectDir = await root.handle.getDirectoryHandle(folderName);
  const script = await readProjectScript(projectDir);
  const options = project.options || fallbackOptions;
  return {
    ...project,
    script,
    options,
    analysis: project.analysis?.episodes?.length ? project.analysis : analyzeScript(script, options),
  };
}

export async function removeProjectFolder(root: ProjectRootSelection, project: StoryboardProject) {
  const folderName = project.folderName || project.name;
  if (!root.handle.removeEntry) throw new Error("当前浏览器不支持删除项目文件夹。");
  await root.handle.removeEntry(folderName, { recursive: true });
}

function buildProjectManifest(rootName: string, project: StoryboardProject) {
  return {
    projectId: project.projectId,
    name: project.name,
    folderName: project.folderName,
    rootName,
    updatedAt: project.updatedAt,
    options: project.options,
    analysis: project.analysis,
    latestRun: project.latestRun,
    artifacts: project.artifacts,
    locks: project.locks,
    tasks: project.tasks,
    imageCandidates: project.imageCandidates,
    storage: {
      script: "input/episodes/*.txt",
    },
    folders: ["input", "input/episodes", "config", "artifacts", "exports"],
  };
}

async function readProjectDirectory(root: ProjectRootSelection, projectDir: FileSystemDirectoryHandle, fallbackOptions: StoryboardProject["options"]) {
  try {
    const manifestFile = await projectDir.getFileHandle("project.json");
    const manifest = JSON.parse(await (await manifestFile.getFile()).text()) as Partial<StoryboardProject>;
    const options = manifest.options || fallbackOptions;
    return {
      projectId: manifest.projectId || `PRJ-${projectDir.name}`,
      name: manifest.name || projectDir.name,
      folderName: manifest.folderName || projectDir.name,
      rootName: root.rootName,
      updatedAt: manifest.updatedAt || new Date().toISOString(),
      script: "",
      options,
      analysis: manifest.analysis || analyzeScript("", options),
      latestRun: manifest.latestRun || null,
      artifacts: manifest.artifacts || [],
      locks: manifest.locks || [],
      tasks: manifest.tasks || [],
      imageCandidates: manifest.imageCandidates || [],
    } satisfies StoryboardProject;
  } catch {
    return null;
  }
}

async function readProjectScript(projectDir: FileSystemDirectoryHandle) {
  const inputDir = await projectDir.getDirectoryHandle("input");
  try {
    const episodeDir = await inputDir.getDirectoryHandle("episodes");
    if (episodeDir.values) {
      const files: Array<{ name: string; text: string }> = [];
      for await (const entry of episodeDir.values()) {
        if (isDirectoryHandle(entry) || !entry.name.endsWith(".txt")) continue;
        files.push({ name: entry.name, text: await (await entry.getFile()).text() });
      }
      if (files.length) {
        return files.sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true })).map((file) => file.text.trim()).join("\n\n");
      }
    }
  } catch {
    // Backward compatibility for older local projects.
  }
  const scriptFile = await inputDir.getFileHandle("script.txt");
  return (await scriptFile.getFile()).text();
}

async function writeEpisodeFiles(directory: FileSystemDirectoryHandle, script: string) {
  const episodes = analyzeScript(script, {
    genreProfile: "",
    directorProfile: "",
    targetShotSeconds: 5,
    aspectRatio: "9:16",
    contentType: "短剧",
  }).episodes;
  if (!script.trim()) {
    await writeTextFile(directory, "EP01.txt", "");
    return;
  }
  for (const episode of episodes) {
    await writeTextFile(directory, `${episode.episodeId}.txt`, episode.sourceText || episode.title);
  }
}

function isDirectoryHandle(entry: FileSystemDirectoryHandle | FileSystemFileHandle): entry is FileSystemDirectoryHandle {
  return "getDirectoryHandle" in entry;
}

async function writeTextFile(directory: FileSystemDirectoryHandle, filename: string, content: string) {
  const file = await directory.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}
