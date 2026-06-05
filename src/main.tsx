import { StrictMode, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  Trash2,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  Film,
  FolderKanban,
  Image,
  Layers3,
  Lock,
  Menu,
  Package,
  PanelRightOpen,
  Plus,
  Play,
  RefreshCcw,
  Save,
  Scissors,
  Sparkles,
  Moon,
  Sun,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { buildContextPack } from "./lib/contextPack";
import type { ContextPack } from "./lib/contextPack";
import {
  addBackendRoot,
  createBackendProject,
  deleteBackendProject,
  getBackendRoots,
  listBackendProjects,
  loadBackendProject,
  removeBackendRoot,
  saveBackendProject,
  type BackendRoot,
} from "./lib/projectApi";
import {
  createProject,
  createDefaultProjectName,
  loadProjectStore,
  saveProjectStore,
  toSafeFolderName,
  updateProjectSnapshot,
} from "./lib/projectStore";
import type { ProjectStoreState, StoryboardProject } from "./lib/projectStore";
import { buildScriptQualityReport, defaultScriptQualityRules, loadScriptQualityRules, saveScriptQualityRules } from "./lib/scriptQuality";
import type { ScriptQualityRule } from "./lib/scriptQuality";
import { analyzeScript, exportEpisodeBundle, formatJson, parseEpisodeBundle } from "./lib/storyboard";
import type { AnalysisOptions, AssetDescription, EpisodeResult, ScriptAnalysis } from "./lib/storyboard";
import { defaultOutputAdapters, defaultPipelineConfig } from "./pipeline/defaults";
import { loadLlmExecutorConfig, normalizeLlmConfig, saveLlmExecutorConfig } from "./pipeline/llmConfig";
import { loadImageGenerationConfig, normalizeImageConfig, saveImageGenerationConfig } from "./pipeline/imageConfig";
import { generateAssetImage } from "./pipeline/imageGeneration";
import type { AssetImageCandidate } from "./pipeline/imageGeneration";
import { describeStagePromptUse } from "./pipeline/prompts";
import {
  createPromptId,
  duplicatePrompt,
  loadPromptLibrary,
  promptStages,
  savePromptLibrary,
  selectPrompt,
  upsertPrompt,
  type PromptLibraryState,
  type PromptStageId,
  type PromptVersion,
} from "./pipeline/promptLibrary";
import { runLocalPipeline } from "./pipeline/run";
import { writeEpisodeToZip, writeProjectToZip } from "./pipeline/exportAdapter";
import { summarizePipeline } from "./pipeline/summary";
import type { ImageGenerationConfig, LlmExecutorConfig, PipelineRun } from "./pipeline/types";
import type { ArtifactRecord, LockRecord, TaskRecord } from "./pipeline/artifacts";
import "./styles.css";

const sampleScript = `第1集
场景一：医院走廊 夜
林夏攥着诊断单冲出电梯，电话那头的母亲不断追问。她强忍眼泪，只说自己在加班。
顾沉站在走廊尽头，听见她压低声音借钱，表情从冷漠变得复杂。
林夏：我不是来求你的，我只是想拿回属于我爸的东西。
顾沉：你以为真相只有一层？

第2集
场景一：顾家书房 日
顾沉把旧档案推到林夏面前，里面夹着一张十年前的合照。林夏认出父亲身边的人正是顾沉的叔叔。
门外传来脚步声，顾沉立刻合上档案，示意林夏躲进暗门。`;

type DevLogLevel = "info" | "success" | "warning" | "error";

interface DevLogEntry {
  id: string;
  time: string;
  source: string;
  level: DevLogLevel;
  message: string;
  detail?: string;
}

function App() {
  const [activePage, setActivePage] = useLocalState("active-page", "script");
  const [isNavCollapsed, setIsNavCollapsed] = useLocalState("nav-collapsed", "false");
  const [themeMode, setThemeMode] = useLocalState("theme-mode", "light");
  const [isToolDrawerOpen, setIsToolDrawerOpen] = useState(false);
  const fallbackOptions: AnalysisOptions = {
    genreProfile: "都市情感短剧",
    directorProfile: "强冲突快节奏",
    targetShotSeconds: 5,
    aspectRatio: "9:16",
    contentType: "短剧",
  };
  const [projectStore, setProjectStore] = useState<ProjectStoreState>(() => loadProjectStore(sampleScript, fallbackOptions));
  const [projectRoot, setProjectRoot] = useState<BackendRoot | null>(null);
  const [projectRoots, setProjectRoots] = useState<BackendRoot[]>([]);
  const [isRootDialogOpen, setIsRootDialogOpen] = useState(false);
  const [rootPathDraft, setRootPathDraft] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<StoryboardProject | null>(null);
  const [rootPendingRemove, setRootPendingRemove] = useState<BackendRoot | null>(null);
  const [scriptQualityRules, setScriptQualityRules] = useState<ScriptQualityRule[]>(() => loadScriptQualityRules());
  const [isScriptRuleDialogOpen, setIsScriptRuleDialogOpen] = useState(false);
  const [episodeSplitDraft, setEpisodeSplitDraft] = useState<EpisodeSplitDraft | null>(null);
  const emptyProject = useMemo(
    () =>
      createProject({
        name: "未选择项目",
        script: "",
        options: fallbackOptions,
        analysis: analyzeScript("", fallbackOptions),
        latestRun: null,
      }),
    [],
  );
  const activeProject = projectStore.projects.find((project) => project.projectId === projectStore.activeProjectId) ?? projectStore.projects[0] ?? emptyProject;
  const [script, setScript] = useState(() => activeProject.script);
  const [genreProfile, setGenreProfile] = useState(() => activeProject.options.genreProfile);
  const [directorProfile, setDirectorProfile] = useState(() => activeProject.options.directorProfile);
  const [targetShotSeconds, setTargetShotSeconds] = useState(() => activeProject.options.targetShotSeconds);
  const [aspectRatio, setAspectRatio] = useState(() => activeProject.options.aspectRatio);
  const [contentType, setContentType] = useState(() => activeProject.options.contentType);
  const [selectedEpisodeId, setSelectedEpisodeId] = useLocalState("selected-episode", "EP01");
  const [analysis, setAnalysis] = useState<ScriptAnalysis>(() => activeProject.analysis);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState(() => new Date().toLocaleTimeString("zh-CN", { hour12: false }));
  const [toast, setToast] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "json">("cards");
  const [isLogCollapsed, setIsLogCollapsed] = useLocalState("feedback-collapsed", "true");
  const [latestRun, setLatestRun] = useState<PipelineRun | null>(() => activeProject.latestRun);
  const [isGenerating, setIsGenerating] = useState(false);
  const [imageConfig, setImageConfig] = useState<ImageGenerationConfig>(() => loadImageGenerationConfig());
  const [runningImageAssetId, setRunningImageAssetId] = useState("");
  const [devLogs, setDevLogs] = useState<DevLogEntry[]>(() => [
    createDevLog("pipeline", "info", "开发日志台已启动", "当前记录前端规则阶段和操作；接入 LLM 后记录 stage、prompt、耗时、错误和产物引用。"),
    createDevLog("stage:01", "success", "剧本校验规则可用", "scriptQualityReport 已在前端实时计算。"),
    createDevLog("stage:02", "success", "规则版分集/资产/镜头生成可用", "当前尚不是真实 LLM PipelineRun。"),
  ]);
  const scriptQuality = useMemo(() => buildScriptQualityReport(script), [script]);
  const contextPack = useMemo(() => buildContextPack(analysis), [analysis]);
  const pipelineSummary = useMemo(
    () => summarizePipeline(defaultPipelineConfig, defaultOutputAdapters.find((adapter) => adapter.id === defaultPipelineConfig.outputAdapterId)),
    [],
  );

  const options: AnalysisOptions = useMemo(
    () => ({
      genreProfile,
      directorProfile,
      targetShotSeconds,
      aspectRatio,
      contentType,
    }),
    [genreProfile, directorProfile, targetShotSeconds, aspectRatio, contentType],
  );
  const selectedEpisode = analysis.episodes.find((episode) => episode.episodeId === selectedEpisodeId) ?? analysis.episodes[0];
  const isCollapsed = isNavCollapsed === "true";
  const [llmConfig, setLlmConfig] = useState<LlmExecutorConfig>(() => loadLlmExecutorConfig());
  const [promptLibrary, setPromptLibrary] = useState<PromptLibraryState>(() => loadPromptLibrary());
  const imageCandidates = activeProject.imageCandidates ?? [];

  useEffect(() => {
    saveProjectStore(projectStore);
  }, [projectStore]);

  useEffect(() => {
    void initializeBackendRoots();
  }, []);

  function applyProject(project: StoryboardProject) {
    setScript(project.script);
    setGenreProfile(project.options.genreProfile);
    setDirectorProfile(project.options.directorProfile);
    setTargetShotSeconds(project.options.targetShotSeconds);
    setAspectRatio(project.options.aspectRatio);
    setContentType(project.options.contentType);
    setAnalysis(project.analysis);
    setLatestRun(project.latestRun);
    setSelectedEpisodeId(project.analysis.episodes[0]?.episodeId ?? "EP01");
    setHasDraftChanges(false);
    appendLog("project", "info", `已切换到 ${project.name}`, project.folderName ?? toSafeFolderName(project.name));
  }

  function updateActiveProject(mutator: (project: StoryboardProject) => StoryboardProject) {
    setProjectStore((current) => ({
      ...current,
      projects: current.projects.map((project) => (project.projectId === current.activeProjectId ? mutator(project) : project)),
    }));
  }

  function handleSaveProject() {
    const savedProject = updateProjectSnapshot(activeProject, {
      projectId: activeProject.projectId,
      name: activeProject.name,
      script,
      options,
      analysis,
      latestRun,
    });
    updateActiveProject((project) =>
      project.projectId === activeProject.projectId ? savedProject : project,
    );
    setHasDraftChanges(false);
    showToast("项目已保存");
    appendLog("project", "success", "项目已保存", `${activeProject.name} 已更新。`);
    if (projectRoot && activeProject.projectId) {
      void saveBackendProject({ ...savedProject, rootName: projectRoot.rootName }).then(
        () => appendLog("project-files", "success", "项目文件已写入根目录", `${projectRoot.rootName}/${savedProject.folderName || toSafeFolderName(savedProject.name)}`),
        (error) => appendLog("project-files", "warning", "项目文件写入失败", error instanceof Error ? error.message : "未知错误"),
      );
    }
  }

  async function initializeBackendRoots() {
    try {
      const state = await getBackendRoots();
      setProjectRoots(state.roots);
      const activeRoot = state.roots.find((root) => root.isActive) ?? null;
      setProjectRoot(activeRoot);
      if (activeRoot) await refreshProjectsFromRoot(activeRoot);
    } catch (error) {
      appendLog("project-root", "warning", "后端根目录配置读取失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function handleAddProjectRoot() {
    try {
      const state = await addBackendRoot(rootPathDraft);
      setProjectRoots(state.roots);
      const activeRoot = state.roots.find((root) => root.isActive) ?? null;
      setProjectRoot(activeRoot);
      setIsRootDialogOpen(false);
      setRootPathDraft("");
      if (activeRoot) await refreshProjectsFromRoot(activeRoot);
      showToast(`当前根目录：${activeRoot?.rootName ?? ""}`);
      appendLog("project-root", "success", "项目根目录已保存并刷新", activeRoot?.rootPath ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存根目录失败。";
      appendLog("project-root", "error", "保存根目录失败", message);
    }
  }

  async function refreshProjectsFromRoot(root = projectRoot) {
    if (!root) return;
    try {
      const { projects } = await listBackendProjects();
      if (!projects.length) {
        setProjectStore({ activeProjectId: "", projects: [] });
        setScript("");
        setAnalysis(analyzeScript("", fallbackOptions));
        setLatestRun(null);
        appendLog("project-root", "info", "根目录暂无项目", root.rootName);
        return;
      }
      setProjectStore({
        activeProjectId: projects[0].projectId,
        projects,
      });
      await loadAndApplyProject(projects[0]);
      appendLog("project-root", "success", "项目列表已刷新", `${root.rootName} / ${projects.length} 个项目。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取项目根目录失败。";
      appendLog("project-root", "error", "读取项目根目录失败", message);
    }
  }

  async function removeProjectRootAuthorization(root: BackendRoot) {
    try {
      const state = await removeBackendRoot(root.rootPath);
      setProjectRoots(state.roots);
      const activeRoot = state.roots.find((item) => item.isActive) ?? null;
      setProjectRoot(activeRoot);
      setRootPendingRemove(null);
      if (activeRoot) {
        await refreshProjectsFromRoot(activeRoot);
      } else {
        switchToDefaultProjectStore();
      }
      appendLog("project-root", "info", "根目录已从后端配置移除", `${root.rootPath} 的项目文件夹未删除。`);
    } catch (error) {
      appendLog("project-root", "error", "移除根目录失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  function switchToDefaultProjectStore() {
    const localStore = loadProjectStore(sampleScript, fallbackOptions);
    setProjectRoot(null);
    setProjectStore(localStore);
    const nextProject = localStore.projects.find((project) => project.projectId === localStore.activeProjectId) ?? localStore.projects[0];
    if (nextProject) applyProject(nextProject);
    appendLog("project-root", "info", "已切回默认本地缓存", "项目列表来自浏览器本地存储。");
  }

  async function handleCreateProject() {
    const name = newProjectName.trim() || createDefaultProjectName(projectStore.projects.length);
    const project = projectRoot ? (await createBackendProject(name, fallbackOptions)).project : createProject({
        name,
        script: "",
        options: fallbackOptions,
        analysis: analyzeScript("", fallbackOptions),
        latestRun: null,
      });
    setProjectStore((current) => ({
      activeProjectId: project.projectId,
      projects: [project, ...current.projects],
    }));
    applyProject(project);
    setNewProjectName("");
    setIsCreateProjectDialogOpen(false);
    if (projectRoot) await refreshProjectsFromRoot(projectRoot);
  }

  async function handleDeleteProject(project: StoryboardProject) {
    const remaining = projectStore.projects.filter((item) => item.projectId !== project.projectId);
    const nextActive = project.projectId === projectStore.activeProjectId ? remaining[0] : activeProject;
    setProjectStore({
      activeProjectId: nextActive?.projectId ?? "",
      projects: remaining,
    });
    if (nextActive) {
      applyProject(nextActive);
    } else {
      setScript("");
      setAnalysis(analyzeScript("", fallbackOptions));
      setLatestRun(null);
      setHasDraftChanges(false);
    }
    setProjectPendingDelete(null);
    appendLog("project", "warning", `已删除项目 ${project.name}`, "已从本地项目列表移除。");
    if (projectRoot) {
      try {
        await deleteBackendProject(project.projectId);
        appendLog("project-files", "success", "项目文件夹已删除", `${projectRoot.rootName}/${project.folderName || toSafeFolderName(project.name)}`);
        await refreshProjectsFromRoot(projectRoot);
      } catch (error) {
        const message = error instanceof Error ? error.message : "删除项目文件夹失败。";
        appendLog("project-files", "warning", "项目文件夹未删除", message);
      }
    }
  }

  async function loadAndApplyProject(project: StoryboardProject, root = projectRoot) {
    if (!root || project.script) {
      applyProject(project);
      return;
    }
    const loadedProject = (await loadBackendProject(project.projectId)).project;
    setProjectStore((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.projectId === loadedProject.projectId ? loadedProject : item)),
    }));
    applyProject(loadedProject);
  }

  function handleSelectProject(projectId: string) {
    const project = projectStore.projects.find((item) => item.projectId === projectId);
    if (!project) return;
    setProjectStore((current) => ({ ...current, activeProjectId: projectId }));
    void loadAndApplyProject(project);
  }

  function updateLock(targetId: string, status: "locked" | "unlocked" | "needs_review", reason: string) {
    updateActiveProject((project) => ({
      ...project,
      locks: project.locks.map((lockItem) =>
        lockItem.targetId === targetId
          ? {
              ...lockItem,
              status,
              reason,
              updatedAt: new Date().toISOString(),
            }
          : lockItem,
      ),
    }));
    appendLog("lock", status === "locked" ? "success" : "info", `${targetId} ${status}`, reason);
  }

  function updateImageConfig(config: ImageGenerationConfig) {
    const normalized = normalizeImageConfig(config);
    setImageConfig(normalized);
    saveImageGenerationConfig(normalized);
    appendLog("image-config", "info", "生图配置已保存", `${normalized.model} / ${normalized.baseUrl || "未配置 baseUrl"}`);
  }

  function updatePromptLibrary(next: PromptLibraryState, message = "Prompt 配置已更新") {
    setPromptLibrary(next);
    savePromptLibrary(next);
    appendLog("prompt-library", "success", message, "后续 LLM 调用会使用当前选中的 Prompt 版本。");
  }

  async function handleGenerateAssetImage(asset: AssetDescription) {
    if (runningImageAssetId) return;
    setRunningImageAssetId(asset.assetId);
    appendLog("image", "info", `开始生成 ${asset.name}`, asset.imagePrompt || asset.description);
    const result = await generateAssetImage(asset, imageConfig);
    updateActiveProject((project) => ({
      ...project,
      imageCandidates: [result.candidate, ...(project.imageCandidates ?? [])],
    }));
    setDevLogs((current) => [...result.logs, ...current].slice(0, 120));
    appendLog(result.candidate.status === "done" ? "image" : "image", result.candidate.status === "done" ? "success" : "error", `${asset.name} 生图${result.candidate.status === "done" ? "完成" : "失败"}`, result.candidate.error);
    setRunningImageAssetId("");
  }

  function handleLockImageCandidate(assetId: string, candidateId: string) {
    updateActiveProject((project) => ({
      ...project,
      imageCandidates: (project.imageCandidates ?? []).map((candidate) =>
        candidate.assetId === assetId
          ? {
              ...candidate,
              status: candidate.candidateId === candidateId ? "locked" : candidate.status === "locked" ? "done" : candidate.status,
            }
          : candidate,
      ),
    }));
    updateLock(assetId, "locked", `人工锁定候选图 ${candidateId}。`);
  }

  function handleRerun(scope: string, targetId: string) {
    appendLog("rerun", "warning", `请求重跑 ${scope}`, `${targetId} 当前由本地 PipelineRun 记录请求，真实局部 executor 待接入。`);
    void handleGenerate();
  }

  async function handleGenerate() {
    if (isGenerating) return;
    setIsGenerating(true);
    const startedAt = performance.now();
    appendLog("pipeline-run", "info", "开始生成", `${llmConfig.model} / 真实 LLM 执行。`);
    try {
      const output = await runLocalPipeline(script, options, llmConfig);
      setAnalysis(output.analysis);
      setLatestRun(output.run);
      updateActiveProject((project) =>
        updateProjectSnapshot(project, {
          projectId: project.projectId,
          name: project.name,
          script,
          options,
          analysis: output.analysis,
          latestRun: output.run,
          artifacts: output.artifactBundle.artifacts,
          locks: output.artifactBundle.locks,
          tasks: output.artifactBundle.tasks,
        }),
      );
      setSelectedEpisodeId(output.analysis.episodes[0]?.episodeId ?? "EP01");
      setHasDraftChanges(false);
      setLastGeneratedAt(new Date().toLocaleTimeString("zh-CN", { hour12: false }));
      appendLog(
        "pipeline-run",
        output.run.status === "blocked" ? "warning" : "success",
        `${output.run.runId} 已生成`,
        `${output.analysis.episodes.length} 集 / ${output.analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0)} 资产 / ${output.analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0)} 镜头，用时 ${Math.round(performance.now() - startedAt)}ms；${output.run.stageResults.filter((stage) => stage.status === "blocked").length} 阶段待接执行器。`,
      );
      setDevLogs((current) => [...output.run.logs, ...current].slice(0, 120));
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      appendLog("pipeline-run", "error", "生成失败", message);
      showToast("生成失败，查看底部日志");
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleExportBundle(episode: EpisodeResult) {
    const zip = new JSZip();
    writeEpisodeToZip(zip, episode);
    await downloadZip(`${episode.episodeId}_storyboard_bundle.zip`, zip);
    showToast(`${episode.episodeId} 已导出 ZIP`);
    appendLog("export", "success", `${episode.episodeId} 已导出`, "包含 script.md、assets.json、shots.json、prompts.json、grouped csv。");
  }

  async function handleExportAll() {
    const zip = new JSZip();
    writeProjectToZip(zip, analysis);
    await downloadZip("storyboard_project_bundle.zip", zip);
    showToast("项目 ZIP 已导出");
    appendLog("export", "success", "项目 ZIP 已导出", `${analysis.episodes.length} 集已写入导出包。`);
  }

  async function handleFileUpload(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const customRule = localStorage.getItem("custom-episode-split-rule") ?? "";
    setEpisodeSplitDraft({
      fileName: file.name,
      sourceText: text,
      customRule,
      preview: splitScriptIntoEpisodes(text, customRule),
    });
    appendLog("input", "info", "合集剧本已读取", `${file.name}，等待确认分集后写入。`);
  }

  async function handleFilesUpload(files: FileList | null) {
    if (!files?.length) return;
    const texts = await Promise.all(Array.from(files).map(async (file) => ({ name: file.name, text: await file.text() })));
    const merged = texts.map((item, index) => ensureEpisodeHeading(item.text, index + 1)).filter(Boolean).join("\n\n");
    setScript(merged);
    setHasDraftChanges(true);
    appendLog("input", "info", "分集剧本已导入", `${texts.length} 个文件，${merged.length.toLocaleString()} 字。`);
  }

  async function handleEpisodeFileUpload(file: File | undefined, mode: "append" | "replace", episodeNumber: number) {
    if (!file) return;
    const text = await file.text();
    const episodeNumberSafe = Math.max(1, Math.floor(episodeNumber || 1));
    const currentPreview = splitScriptIntoEpisodes(script, "");
    const nextEpisodeText = ensureEpisodeHeading(text, mode === "append" ? currentPreview.episodes.length + 1 : episodeNumberSafe);
    if (mode === "append") {
      updateScript([script.trim(), nextEpisodeText].filter(Boolean).join("\n\n"));
      appendLog("input", "info", "单集已追加", `${file.name} -> 第 ${currentPreview.episodes.length + 1} 集。`);
      return;
    }
    const nextEpisodes = currentPreview.episodes.length ? [...currentPreview.episodes] : [];
    const replaceIndex = episodeNumberSafe - 1;
    while (nextEpisodes.length <= replaceIndex) {
      const number = nextEpisodes.length + 1;
      nextEpisodes.push({ episodeNumber: number, title: `第${number}集`, text: `第${number}集` });
    }
    nextEpisodes[replaceIndex] = {
      episodeNumber: episodeNumberSafe,
      title: `第${episodeNumberSafe}集`,
      text: nextEpisodeText,
    };
    updateScript(nextEpisodes.map((episode) => episode.text.trim()).filter(Boolean).join("\n\n"));
    appendLog("input", "info", "单集已替换", `${file.name} -> 第 ${episodeNumberSafe} 集。`);
  }

  function updateScript(value: string) {
    setScript(value);
    setHasDraftChanges(true);
  }

  function updateOption(update: () => void) {
    update();
    setHasDraftChanges(true);
  }

  function updateProjectOptions(
    nextOptions: AnalysisOptions,
    setters: {
      setGenreProfile: (value: string) => void;
      setDirectorProfile: (value: string) => void;
      setTargetShotSeconds: (value: number) => void;
      setAspectRatio: (value: string) => void;
      setContentType: (value: string) => void;
    },
  ) {
    setters.setGenreProfile(nextOptions.genreProfile);
    setters.setDirectorProfile(nextOptions.directorProfile);
    setters.setTargetShotSeconds(nextOptions.targetShotSeconds);
    setters.setAspectRatio(nextOptions.aspectRatio);
    setters.setContentType(nextOptions.contentType);
    updateActiveProject((project) =>
      updateProjectSnapshot(project, {
        projectId: project.projectId,
        name: project.name,
        script,
        options: nextOptions,
        analysis,
        latestRun,
      }),
    );
    setHasDraftChanges(true);
    appendLog("project-options", "info", "项目基本参数已更新", `${nextOptions.contentType} / ${nextOptions.aspectRatio}`);
  }

  function updateScriptQualityRules(rules: ScriptQualityRule[]) {
    setScriptQualityRules(rules);
    saveScriptQualityRules(rules);
    appendLog("script-check", "info", "校检规则已更新", `${rules.filter((rule) => rule.enabled).length} 条启用。`);
  }

  function handleRunScriptCheck() {
    appendLog(
      "script-check",
      scriptQuality.issues.some((issue) => issue.level === "错误") ? "error" : scriptQuality.issues.length ? "warning" : "success",
      "剧本校检已执行",
      `${scriptQuality.stats.lines} 行 / ${scriptQuality.stats.characters.toLocaleString()} 字 / ${scriptQuality.issues.length} 个疑点。`,
    );
    showToast(`校检完成：${scriptQuality.issues.length} 个疑点`);
  }

  function updateEpisodeSplitDraftRule(value: string) {
    if (!episodeSplitDraft) return;
    localStorage.setItem("custom-episode-split-rule", value);
    setEpisodeSplitDraft({
      ...episodeSplitDraft,
      customRule: value,
      preview: splitScriptIntoEpisodes(episodeSplitDraft.sourceText, value),
    });
  }

  function confirmEpisodeSplitDraft() {
    if (!episodeSplitDraft) return;
    const nextScript = formatEpisodeSplitPreview(episodeSplitDraft.preview);
    updateScript(nextScript);
    appendLog("input", "success", "合集分集已确认", `${episodeSplitDraft.preview.episodes.length} 集已写入当前剧本。`);
    setEpisodeSplitDraft(null);
  }

  function updateSelectedEpisode(nextEpisode: EpisodeResult) {
    setAnalysis((current) => ({
      ...current,
      episodes: current.episodes.map((episode) => (episode.episodeId === nextEpisode.episodeId ? nextEpisode : episode)),
    }));
    updateActiveProject((project) =>
      updateProjectSnapshot(project, {
        projectId: project.projectId,
        name: project.name,
        script,
        options,
        analysis: {
          ...analysis,
          episodes: analysis.episodes.map((episode) => (episode.episodeId === nextEpisode.episodeId ? nextEpisode : episode)),
        },
        latestRun,
      }),
    );
    showToast(`${nextEpisode.episodeId} 真源已更新`);
    appendLog("true-source", "warning", `${nextEpisode.episodeId} 真源被人工修改`, "后续应记录 diff、版本号和锁定状态。");
  }

  function appendLog(source: string, level: DevLogLevel, message: string, detail?: string) {
    setDevLogs((current) => [createDevLog(source, level, message, detail), ...current].slice(0, 80));
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <main className="app-shell" data-theme={themeMode === "dark" ? "dark" : "light"}>
      <TopBar
        project={activeProject}
        analysis={analysis}
        hasDraftChanges={hasDraftChanges}
        lastGeneratedAt={lastGeneratedAt}
        themeMode={themeMode === "dark" ? "dark" : "light"}
        onToggleTheme={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
        onSaveProject={handleSaveProject}
        onGenerate={handleGenerate}
        onExportAll={handleExportAll}
        onOpenTools={() => setIsToolDrawerOpen(true)}
      />
      <section className={`workspace ${isCollapsed ? "nav-collapsed" : ""}`}>
        <aside className="left-pane">
          <AppNav
            activePage={activePage}
            isCollapsed={isCollapsed}
            setActivePage={setActivePage}
            onToggleCollapse={() => setIsNavCollapsed(isCollapsed ? "false" : "true")}
          />
        </aside>

        <section className="right-pane">
          {toast && <div className="toast">{toast}</div>}
          {activePage === "projects" && (
            <ProjectManagementView
              activeProjectId={projectStore.activeProjectId}
              projects={projectStore.projects}
              projectRootName={projectRoot?.rootName ?? ""}
              projectRoots={projectRoots}
              options={options}
              onPickRoot={() => setIsRootDialogOpen(true)}
              onSelectRoot={(root) => {
                setProjectRoot(root);
                void refreshProjectsFromRoot(root);
              }}
              onSelectDefaultRoot={switchToDefaultProjectStore}
              onRequestRemoveRoot={setRootPendingRemove}
              onRefreshRoot={() => void refreshProjectsFromRoot()}
              onOpenCreateProject={() => {
                setNewProjectName("");
                setIsCreateProjectDialogOpen(true);
              }}
              onSelectProject={handleSelectProject}
              onRequestDeleteProject={setProjectPendingDelete}
              onOptionsChange={(nextOptions) =>
                updateProjectOptions(nextOptions, {
                  setGenreProfile,
                  setDirectorProfile,
                  setTargetShotSeconds,
                  setAspectRatio,
                  setContentType,
                })
              }
            />
          )}
          {activePage === "script" && (
            <ScriptWorkspace
              script={script}
              report={scriptQuality}
              onScriptChange={updateScript}
              onFileUpload={handleFileUpload}
              onEpisodeFileUpload={handleEpisodeFileUpload}
              onBatchEpisodeUpload={handleFilesUpload}
              onRunScriptCheck={handleRunScriptCheck}
              rules={scriptQualityRules}
              onOpenRuleConfig={() => setIsScriptRuleDialogOpen(true)}
              onApplyCleanedScript={() => {
                updateScript(scriptQuality.cleanedScript);
                showToast("清洗稿已写回剧本");
              }}
            />
          )}
          {activePage === "assets" && (
            <AssetImageView
              assets={analysis.episodes.flatMap((episode) => episode.assets)}
              locks={activeProject.locks}
              imageCandidates={imageCandidates}
              imageConfig={imageConfig}
              runningAssetId={runningImageAssetId}
              onImageConfigChange={updateImageConfig}
              onGenerateImage={(asset) => void handleGenerateAssetImage(asset)}
              onLockCandidate={handleLockImageCandidate}
              onLock={updateLock}
            />
          )}
          {activePage === "context" && <ContextPackView contextPack={contextPack} />}
          {activePage === "pipeline" && (
            <PipelineConfigView
              latestRun={latestRun}
              llmConfig={llmConfig}
              artifacts={activeProject.artifacts}
              locks={activeProject.locks}
              tasks={activeProject.tasks}
              promptLibrary={promptLibrary}
              onLlmConfigChange={(config) => {
                const normalized = normalizeLlmConfig(config);
                setLlmConfig(normalized);
                saveLlmExecutorConfig(normalized);
                appendLog("llm-config", "info", "LLM 配置已更新", `${normalized.provider} / ${normalized.model} / ${normalized.mode}`);
              }}
              onPromptLibraryChange={updatePromptLibrary}
            />
          )}
          {activePage === "storyboard" && (
            <StoryboardWorkbench
              analysis={analysis}
              contextPack={contextPack}
              selectedEpisode={selectedEpisode}
              selectedEpisodeId={selectedEpisodeId}
              setSelectedEpisodeId={setSelectedEpisodeId}
              viewMode={viewMode}
              setViewMode={setViewMode}
              hasDraftChanges={hasDraftChanges}
              onExportEpisode={() => void handleExportBundle(selectedEpisode)}
              onEpisodeChange={updateSelectedEpisode}
              locks={activeProject.locks}
              onLock={updateLock}
              onRerun={handleRerun}
            />
          )}
        </section>
      </section>
      {isToolDrawerOpen && (
        <ToolDrawer
          analysis={analysis}
          contextPack={contextPack}
          pipelineSummary={pipelineSummary}
          selectedEpisodeId={selectedEpisodeId}
          setSelectedEpisodeId={setSelectedEpisodeId}
          hasDraftChanges={hasDraftChanges}
          activeProjectId={projectStore.activeProjectId}
          projects={projectStore.projects}
          onClose={() => setIsToolDrawerOpen(false)}
          onCreateProject={() => {
            setNewProjectName("");
            setIsCreateProjectDialogOpen(true);
          }}
          onSelectProject={handleSelectProject}
          onSaveProject={handleSaveProject}
          onGenerate={handleGenerate}
          onExportAll={handleExportAll}
        />
      )}
      {isCreateProjectDialogOpen && (
        <ProjectNameDialog
          value={newProjectName}
          defaultName={createDefaultProjectName(projectStore.projects.length)}
          onChange={setNewProjectName}
          onCancel={() => setIsCreateProjectDialogOpen(false)}
          onConfirm={() => void handleCreateProject()}
        />
      )}
      {isRootDialogOpen && (
        <ProjectRootDialog
          value={rootPathDraft}
          onChange={setRootPathDraft}
          onCancel={() => setIsRootDialogOpen(false)}
          onConfirm={() => void handleAddProjectRoot()}
        />
      )}
      {isScriptRuleDialogOpen && (
        <ScriptRuleConfigDialog
          rules={scriptQualityRules}
          onChange={updateScriptQualityRules}
          onClose={() => setIsScriptRuleDialogOpen(false)}
        />
      )}
      {episodeSplitDraft && (
        <EpisodeSplitPreviewDialog
          draft={episodeSplitDraft}
          onRuleChange={updateEpisodeSplitDraftRule}
          onConfirm={confirmEpisodeSplitDraft}
          onClose={() => setEpisodeSplitDraft(null)}
        />
      )}
      {projectPendingDelete && (
        <DeleteProjectDialog
          project={projectPendingDelete}
          onCancel={() => setProjectPendingDelete(null)}
          onConfirm={() => void handleDeleteProject(projectPendingDelete)}
        />
      )}
      {rootPendingRemove && (
        <RemoveRootDialog
          root={rootPendingRemove}
          onCancel={() => setRootPendingRemove(null)}
          onConfirm={() => removeProjectRootAuthorization(rootPendingRemove)}
        />
      )}
      <DevLogPanel
        logs={devLogs}
        isCollapsed={isLogCollapsed === "true"}
        onToggle={() => setIsLogCollapsed(isLogCollapsed === "true" ? "false" : "true")}
        onClear={() => setDevLogs([createDevLog("pipeline", "info", "日志已清空")])}
      />
    </main>
  );
}

function createDevLog(source: string, level: DevLogLevel, message: string, detail?: string): DevLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    source,
    level,
    message,
    detail,
  };
}

function TopBar({
  project,
  analysis,
  hasDraftChanges,
  lastGeneratedAt,
  themeMode,
  onToggleTheme,
  onSaveProject,
  onGenerate,
  onExportAll,
  onOpenTools,
}: {
  project: StoryboardProject;
  analysis: ScriptAnalysis;
  hasDraftChanges: boolean;
  lastGeneratedAt: string;
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  onSaveProject: () => void;
  onGenerate: () => void | Promise<void>;
  onExportAll: () => Promise<void>;
  onOpenTools: () => void;
}) {
  const assetCount = analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0);
  const shotCount = analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0);

  return (
    <header className="top-bar">
      <div className="project-chip">
        <FolderKanban size={17} />
        <div>
          <strong>{project.name}</strong>
          <span>本地项目</span>
        </div>
      </div>
      <div className="top-metrics">
        <span>{analysis.episodes.length} 集</span>
        <span>{assetCount} 资产</span>
        <span>{shotCount} 镜头</span>
      </div>
      <StatusBar hasDraftChanges={hasDraftChanges} lastGeneratedAt={lastGeneratedAt} />
      <div className="top-actions">
        <button onClick={onToggleTheme} title={themeMode === "dark" ? "切换浅色模式" : "切换深色模式"}>
          {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {themeMode === "dark" ? "浅色" : "深色"}
        </button>
        <button onClick={onSaveProject}>
          <Save size={16} />
          保存
        </button>
        <button onClick={() => void onGenerate()}>
          <Play size={16} />
          生成
        </button>
        <button onClick={() => void onExportAll()} disabled={hasDraftChanges}>
          <Package size={16} />
          导出
        </button>
        <button onClick={onOpenTools}>
          <PanelRightOpen size={16} />
          工具
        </button>
      </div>
    </header>
  );
}

function AppNav({
  activePage,
  isCollapsed,
  setActivePage,
  onToggleCollapse,
}: {
  activePage: string;
  isCollapsed: boolean;
  setActivePage: (page: string) => void;
  onToggleCollapse: () => void;
}) {
  const items = [
    { id: "projects", label: "项目管理", icon: <FolderKanban size={18} /> },
    { id: "script", label: "剧本校验", icon: <FileText size={18} /> },
    { id: "assets", label: "资产生图", icon: <Image size={18} /> },
    { id: "storyboard", label: "分镜工作台", icon: <Scissors size={18} /> },
    { id: "context", label: "辅助信息", icon: <Database size={18} /> },
    { id: "pipeline", label: "流程配置", icon: <ClipboardList size={18} /> },
  ];

  return (
    <nav className="app-nav" aria-label="主导航">
      <button className="nav-toggle" onClick={onToggleCollapse} title={isCollapsed ? "展开导航" : "收起导航"}>
        <Menu size={18} />
        {!isCollapsed && <span>收起</span>}
      </button>
      <div className="nav-list">
        {items.map((item) => (
          <button
            key={item.id}
            className={activePage === item.id ? "active" : ""}
            onClick={() => setActivePage(item.id)}
            title={item.label}
          >
            {item.icon}
            {!isCollapsed && <span>{item.label}</span>}
          </button>
        ))}
      </div>
      {!isCollapsed && (
        <div className="nav-footnote">
          <strong>本地项目</strong>
          <span>已支持本地保存和多项目；后续接后端、diff 和回滚。</span>
        </div>
      )}
    </nav>
  );
}

function StatusBar({
  hasDraftChanges,
  lastGeneratedAt,
}: {
  hasDraftChanges: boolean;
  lastGeneratedAt: string;
}) {
  return (
    <div className={hasDraftChanges ? "status-bar dirty" : "status-bar"}>
      {hasDraftChanges ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
      <span>{hasDraftChanges ? "有未生成改动" : `已生成 ${lastGeneratedAt}`}</span>
    </div>
  );
}

function ProjectManagementView({
  activeProjectId,
  projects,
  projectRootName,
  projectRoots,
  options,
  onPickRoot,
  onSelectRoot,
  onSelectDefaultRoot,
  onRequestRemoveRoot,
  onRefreshRoot,
  onOpenCreateProject,
  onSelectProject,
  onRequestDeleteProject,
  onOptionsChange,
}: {
  activeProjectId: string;
  projects: StoryboardProject[];
  projectRootName: string;
  projectRoots: BackendRoot[];
  options: AnalysisOptions;
  onPickRoot: () => void;
  onSelectRoot: (root: BackendRoot) => void;
  onSelectDefaultRoot: () => void;
  onRequestRemoveRoot: (root: BackendRoot) => void;
  onRefreshRoot: () => void;
  onOpenCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onRequestDeleteProject: (project: StoryboardProject) => void;
  onOptionsChange: (options: AnalysisOptions) => void;
}) {
  const activeProject = projects.find((project) => project.projectId === activeProjectId) ?? projects[0];
  const [displayMode, setDisplayMode] = useLocalState("project-display-mode", "cards");
  const isCardMode = displayMode !== "list";

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>项目管理</h2>
          <p>一个项目对应一个独立文件夹；项目配置、输入、产物和导出都应跟随项目文件夹。</p>
        </div>
        <div className="header-actions">
          <button onClick={onPickRoot}>
            <FolderKanban size={16} />
            选择根目录
          </button>
          <button onClick={onRefreshRoot} disabled={!projectRootName}>
            <RefreshCcw size={16} />
            刷新项目列表
          </button>
        </div>
      </div>

      <section className="project-management-grid">
        <article className="panel project-create-panel">
          <div className="panel-title">
            <FolderKanban size={18} />
            <span>项目根目录授权</span>
            <strong>{projectRootName || "未选择"}</strong>
          </div>
          <div className="project-root-list">
            <div className={!projectRootName ? "project-root-item active" : "project-root-item"} onDoubleClick={onSelectDefaultRoot} title="双击切换">
              <button onDoubleClick={onSelectDefaultRoot}>默认本地缓存</button>
            </div>
            {projectRoots.map((root) => (
              <div key={root.rootName} className={root.rootName === projectRootName ? "project-root-item active" : "project-root-item"} onDoubleClick={() => onSelectRoot(root)} title="双击切换">
                <button onDoubleClick={() => onSelectRoot(root)}>{root.rootName}</button>
                <button className="icon-danger-button" onClick={() => onRequestRemoveRoot(root)} title="移除授权">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
          <button className="primary-button" onClick={onOpenCreateProject}>
            <Plus size={16} />
            新建项目
          </button>
        </article>

        <article className="panel project-current-panel">
          <div className="panel-title">
            <Database size={18} />
            <span>当前项目</span>
          </div>
          <div className="project-current-card">
            <strong>{activeProject?.name ?? "无项目"}</strong>
            <span>文件夹：{activeProject?.folderName ?? toSafeFolderName(activeProject?.name ?? "未命名项目")}</span>
            <span>更新：{activeProject ? new Date(activeProject.updatedAt).toLocaleString("zh-CN", { hour12: false }) : "-"}</span>
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Edit3 size={18} />
          <span>项目基本参数</span>
        </div>
        <div className="project-options-grid">
          <label>
            题材
            <input value={options.genreProfile} onChange={(event) => onOptionsChange({ ...options, genreProfile: event.target.value })} />
          </label>
          <label>
            导演风格
            <input value={options.directorProfile} onChange={(event) => onOptionsChange({ ...options, directorProfile: event.target.value })} />
          </label>
          <label>
            种类
            <select value={options.contentType} onChange={(event) => onOptionsChange({ ...options, contentType: event.target.value })}>
              <option value="电影">电影</option>
              <option value="短剧">短剧</option>
              <option value="中剧">中剧</option>
              <option value="短片">短片</option>
              <option value="广告">广告</option>
            </select>
          </label>
          <label>
            画幅
            <select value={options.aspectRatio} onChange={(event) => onOptionsChange({ ...options, aspectRatio: event.target.value })}>
              <option value="9:16">9:16 竖屏</option>
              <option value="16:9">16:9 横屏</option>
              <option value="1:1">1:1 方形</option>
              <option value="4:3">4:3</option>
              <option value="2.39:1">2.39:1 宽银幕</option>
            </select>
          </label>
          <label>
            单镜目标秒数
            <input
              type="number"
              min="3"
              max="12"
              value={options.targetShotSeconds}
              onChange={(event) => onOptionsChange({ ...options, targetShotSeconds: Number(event.target.value) })}
            />
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title project-list-title">
          <div>
            <ClipboardList size={18} />
            <span>项目列表</span>
            <strong>{projects.length}</strong>
          </div>
          <div className="mode-switch compact" aria-label="项目显示模式">
            <button className={isCardMode ? "active" : ""} onClick={() => setDisplayMode("cards")}>
              卡片
            </button>
            <button className={!isCardMode ? "active" : ""} onClick={() => setDisplayMode("list")}>
              列表
            </button>
          </div>
        </div>
        <div className={isCardMode ? "project-table project-card-grid" : "project-table"}>
          {projects.length === 0 ? (
            <div className="empty-state">当前根目录下没有项目。点击“新建项目”创建第一个项目文件夹。</div>
          ) : (
            projects.map((project) => (
              <ProjectListItem
                key={project.projectId}
                project={project}
                isActive={project.projectId === activeProjectId}
                displayMode={isCardMode ? "cards" : "list"}
                onSelectProject={onSelectProject}
                onRequestDeleteProject={onRequestDeleteProject}
              />
            ))
          )}
        </div>
      </section>
    </section>
  );
}

function ProjectListItem({
  project,
  isActive,
  displayMode,
  onSelectProject,
  onRequestDeleteProject,
}: {
  project: StoryboardProject;
  isActive: boolean;
  displayMode: "cards" | "list";
  onSelectProject: (projectId: string) => void;
  onRequestDeleteProject: (project: StoryboardProject) => void;
}) {
  const episodeCount = project.analysis.episodes.length;
  const assetCount = project.analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0);
  const shotCount = project.analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0);
  const folderName = project.folderName ?? toSafeFolderName(project.name);
  const updatedAt = new Date(project.updatedAt).toLocaleString("zh-CN", { hour12: false });

  if (displayMode === "cards") {
    return (
      <article className={isActive ? "project-card active" : "project-card"}>
        <button className="project-card-main" onClick={() => onSelectProject(project.projectId)}>
          <span>{isActive ? "当前项目" : "项目"}</span>
          <strong>{project.name}</strong>
          <small>{folderName}</small>
        </button>
        <div className="project-card-metrics">
          <span>{episodeCount} 集</span>
          <span>{assetCount} 资产</span>
          <span>{shotCount} 镜头</span>
        </div>
        <div className="project-card-foot">
          <small>{updatedAt}</small>
          <button className="icon-danger-button" onClick={() => onRequestDeleteProject(project)} title="删除项目">
            <Trash2 size={16} />
          </button>
        </div>
      </article>
    );
  }

  return (
    <div className={isActive ? "project-table-row active" : "project-table-row"}>
      <button onClick={() => onSelectProject(project.projectId)}>
        <strong>{project.name}</strong>
        <span>{folderName}</span>
        <span>{episodeCount} 集 / {assetCount} 资产 / {shotCount} 镜头</span>
        <small>{updatedAt}</small>
      </button>
      <button className="icon-danger-button" onClick={() => onRequestDeleteProject(project)} title="删除项目">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function ProjectNameDialog({
  value,
  defaultName,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  defaultName: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="新建项目">
      <article className="modal-panel">
        <div className="panel-title">
          <FolderKanban size={18} />
          <span>新建项目</span>
        </div>
        <label>
          项目名称
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={`默认：${defaultName}`} autoFocus />
        </label>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={onConfirm}>
            <CheckCircle2 size={16} />
            确认
          </button>
        </div>
      </article>
    </div>
  );
}

function ProjectRootDialog({
  value,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  onChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="配置项目根目录">
      <article className="modal-panel">
        <div className="panel-title">
          <FolderKanban size={18} />
          <span>配置项目根目录</span>
        </div>
        <label>
          本地路径
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="/Users/你的名字/Projects/storyboard" autoFocus />
        </label>
        <p className="modal-copy">这是本地后端读取的路径。保存后刷新不会再丢授权。</p>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="primary-button" onClick={onConfirm}>
            <CheckCircle2 size={16} />
            确认
          </button>
        </div>
      </article>
    </div>
  );
}

function DeleteProjectDialog({
  project,
  onCancel,
  onConfirm,
}: {
  project: StoryboardProject;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="删除项目">
      <article className="modal-panel">
        <div className="panel-title danger-title">
          <Trash2 size={18} />
          <span>删除项目</span>
        </div>
        <p className="modal-copy">确认删除“{project.name}”？项目会从当前列表移除；如果已授权根目录，系统会尝试删除对应项目文件夹。</p>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="danger-button" onClick={onConfirm}>
            <Trash2 size={16} />
            删除
          </button>
        </div>
      </article>
    </div>
  );
}

function RemoveRootDialog({
  root,
  onCancel,
  onConfirm,
}: {
  root: BackendRoot;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="移除根目录授权">
      <article className="modal-panel">
        <div className="panel-title danger-title">
          <X size={18} />
          <span>移除根目录授权</span>
        </div>
        <p className="modal-copy">确认移除“{root.rootName}”的授权？只会从当前系统授权列表移除，不会删除该目录下的项目文件夹。</p>
        <div className="modal-actions">
          <button onClick={onCancel}>取消</button>
          <button className="danger-button" onClick={onConfirm}>
            <X size={16} />
            移除授权
          </button>
        </div>
      </article>
    </div>
  );
}

function ScriptRuleConfigDialog({
  rules,
  onChange,
  onClose,
}: {
  rules: ScriptQualityRule[];
  onChange: (rules: ScriptQualityRule[]) => void;
  onClose: () => void;
}) {
  const [activeRuleTab, setActiveRuleTab] = useState<"quality" | "episode">("quality");

  function updateRule(ruleId: string, patch: Partial<ScriptQualityRule>) {
    onChange(rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  }

  function addRule() {
    onChange([
      ...rules,
      {
        id: `custom-${Date.now()}`,
        name: "自定义规则",
        category: "自定义",
        level: "提示",
        description: "描述要提示给校检任务的疑点边界。",
        enabled: true,
      },
    ]);
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="校检规则配置">
      <article className="modal-panel script-rule-modal">
        <div className="drawer-header">
          <div className="panel-title">
            <Edit3 size={18} />
            <span>校检规则配置</span>
          </div>
          <button onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="rule-tabs mode-switch">
          <button className={activeRuleTab === "quality" ? "active" : ""} onClick={() => setActiveRuleTab("quality")}>
            校检规则
          </button>
          <button className={activeRuleTab === "episode" ? "active" : ""} onClick={() => setActiveRuleTab("episode")}>
            分集规则
          </button>
        </div>
        {activeRuleTab === "quality" ? (
          <>
            <p className="modal-copy">规则用于提示校检边界：基础标点、场次标记、名称一致性、断行等明显疑点；不做剧情改写。</p>
            <div className="script-rule-list">
              {rules.map((rule) => (
                <article key={rule.id} className="script-rule-item">
                  <label className="rule-enabled">
                    <input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(rule.id, { enabled: event.target.checked })} />
                    启用
                  </label>
                  <label>
                    规则名
                    <input value={rule.name} onChange={(event) => updateRule(rule.id, { name: event.target.value })} />
                  </label>
                  <label>
                    类别
                    <input value={rule.category} onChange={(event) => updateRule(rule.id, { category: event.target.value })} />
                  </label>
                  <label>
                    等级
                    <select value={rule.level} onChange={(event) => updateRule(rule.id, { level: event.target.value as ScriptQualityRule["level"] })}>
                      <option value="错误">错误</option>
                      <option value="警告">警告</option>
                      <option value="提示">提示</option>
                    </select>
                  </label>
                  <label className="rule-description">
                    规则说明
                    <textarea value={rule.description} onChange={(event) => updateRule(rule.id, { description: event.target.value })} />
                  </label>
                </article>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="modal-copy">分集规则用于识别合集剧本中每一集的开始位置。整体导入后的预览窗口可填写临时自定义规则并重新分集。</p>
            <div className="episode-rule-list">
              {defaultEpisodeSplitRules.map((rule, index) => (
                <article key={rule}>
                  <strong>规则 {index + 1}</strong>
                  <code>{rule}</code>
                </article>
              ))}
            </div>
          </>
        )}
        <div className="modal-actions">
          {activeRuleTab === "quality" && (
            <>
              <button onClick={addRule}>
                <Plus size={16} />
                添加规则
              </button>
              <button onClick={() => onChange(defaultScriptQualityRules)}>
                <RefreshCcw size={16} />
                读取默认
              </button>
            </>
          )}
          <button className="primary-button" onClick={onClose}>
            <CheckCircle2 size={16} />
            完成
          </button>
        </div>
      </article>
    </div>
  );
}

function DevLogPanel({
  logs,
  isCollapsed,
  onToggle,
  onClear,
}: {
  logs: DevLogEntry[];
  isCollapsed: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const latest = logs[0];
  const issueCount = logs.filter((log) => log.level === "warning" || log.level === "error").length;
  const [query, setQuery] = useState("");
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const filteredLogs = logs.filter((log) => {
    const matchesIssue = !showIssuesOnly || log.level === "warning" || log.level === "error";
    const text = `${log.time} ${log.source} ${log.message} ${log.detail ?? ""}`.toLowerCase();
    return matchesIssue && text.includes(query.trim().toLowerCase());
  });

  return (
    <section className={isCollapsed ? "dev-feedback collapsed" : "dev-feedback"} aria-label="执行反馈">
      <div className="feedback-bar">
        <div className="feedback-primary">
          <Terminal size={16} />
          <strong>{latest?.message ?? "暂无执行记录"}</strong>
          {latest?.detail && <span>{latest.detail}</span>}
        </div>
        <div className="feedback-actions">
          {issueCount > 0 && <span className="issue-pill">{issueCount} 条需看</span>}
          <button onClick={onToggle}>{isCollapsed ? "详情" : "收起"}</button>
        </div>
      </div>
      {!isCollapsed && (
        <div className="feedback-details">
          <div className="feedback-summary">
            <div>
              <strong>排查日志</strong>
              <span>用于开发阶段定位规则、管线、LLM 调用和人工修改问题。</span>
            </div>
            <label>
              搜索
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="stage、错误、产物、耗时..." />
            </label>
            <div className="feedback-filter-row">
              <button className={!showIssuesOnly ? "active" : ""} onClick={() => setShowIssuesOnly(false)}>
                全部 {logs.length}
              </button>
              <button className={showIssuesOnly ? "active" : ""} onClick={() => setShowIssuesOnly(true)}>
                问题 {issueCount}
              </button>
            </div>
            <button onClick={onClear}>清空</button>
          </div>
          <div className="feedback-log-list">
            {filteredLogs.map((log) => (
              <article key={log.id} className={`feedback-log-item ${log.level}`}>
                <span>{log.time}</span>
                <strong>{log.source}</strong>
                <p>{log.message}</p>
                {log.detail && <small>{log.detail}</small>}
              </article>
            ))}
            {!filteredLogs.length && <div className="empty-state">没有匹配的日志。</div>}
          </div>
        </div>
      )}
    </section>
  );
}

function ScriptWorkspace({
  script,
  report,
  rules,
  onScriptChange,
  onFileUpload,
  onEpisodeFileUpload,
  onBatchEpisodeUpload,
  onRunScriptCheck,
  onOpenRuleConfig,
  onApplyCleanedScript,
}: {
  script: string;
  report: ReturnType<typeof buildScriptQualityReport>;
  rules: ScriptQualityRule[];
  onScriptChange: (value: string) => void;
  onFileUpload: (file: File | undefined) => Promise<void>;
  onEpisodeFileUpload: (file: File | undefined, mode: "append" | "replace", episodeNumber: number) => Promise<void>;
  onBatchEpisodeUpload: (files: FileList | null) => Promise<void>;
  onRunScriptCheck: () => void;
  onOpenRuleConfig: () => void;
  onApplyCleanedScript: () => void;
}) {
  const errorCount = report.issues.filter((issue) => issue.level === "错误").length;
  const warningCount = report.issues.filter((issue) => issue.level === "警告").length;
  const enabledRuleCount = rules.filter((rule) => rule.enabled).length;
  const [episodeImportMode, setEpisodeImportMode] = useState<"append" | "replace" | "batch">("append");
  const [episodeNumberDraft, setEpisodeNumberDraft] = useState(1);

  return (
    <section className="page-stack">
      <div className="script-check-top panel">
        <div className="script-check-status">
          <div>
            <h2>剧本校检</h2>
            <p>边界：只提示基础格式和明显疑点，不重写剧情，不替代人工校对。</p>
          </div>
          <div className="script-check-metrics">
            <Metric icon={<FileText size={18} />} label="字数" value={report.stats.characters} />
            <Metric icon={<Layers3 size={18} />} label="集数" value={report.stats.episodes} />
            <Metric icon={<AlertTriangle size={18} />} label="疑点" value={report.issues.length} />
            <Metric icon={<CheckCircle2 size={18} />} label="启用规则" value={enabledRuleCount} />
          </div>
        </div>
        <div className="script-check-actions">
          <label className="file-button">
            <Upload size={16} />
            整体导入
            <input type="file" accept=".txt,.md" onChange={(event) => void onFileUpload(event.target.files?.[0])} />
          </label>
          <div className="single-episode-import">
            <select value={episodeImportMode} onChange={(event) => setEpisodeImportMode(event.target.value as "append" | "replace" | "batch")}>
              <option value="append">增加一集</option>
              <option value="replace">导入某集</option>
              <option value="batch">批量导入</option>
            </select>
            {episodeImportMode === "replace" && (
              <input
                type="number"
                min="1"
                value={episodeNumberDraft}
                onChange={(event) => setEpisodeNumberDraft(Number(event.target.value) || 1)}
                aria-label="集数"
              />
            )}
            <label className="file-button">
              <Upload size={16} />
              单集导入
              <input
                type="file"
                accept=".txt,.md"
                multiple={episodeImportMode === "batch"}
                onChange={(event) =>
                  episodeImportMode === "batch"
                    ? void onBatchEpisodeUpload(event.target.files)
                    : void onEpisodeFileUpload(event.target.files?.[0], episodeImportMode, episodeNumberDraft)
                }
              />
            </label>
          </div>
          <button onClick={onRunScriptCheck}>
            <CheckCircle2 size={16} />
            执行校检
          </button>
          <button onClick={onApplyCleanedScript}>
            <Save size={16} />
            校检保存
          </button>
          <button onClick={onOpenRuleConfig}>
            <Edit3 size={16} />
            规则配置
          </button>
        </div>
        <div className="script-check-options">
          <span>{errorCount} 错误 / {warningCount} 警告</span>
        </div>
      </div>

      <div className="script-review-grid">
        <section className="script-card panel">
          <div className="panel-title">
            <FileText size={18} />
            <span>原始剧本</span>
            <strong>{script.trim().length.toLocaleString()} 字</strong>
          </div>
          <textarea
            value={script}
            onChange={(event) => onScriptChange(event.target.value)}
            spellCheck={false}
            placeholder="粘贴或导入剧本。"
          />
        </section>
        <ScriptQualityView report={report} />
      </div>
    </section>
  );
}

function ToolDrawer({
  analysis,
  contextPack,
  pipelineSummary,
  selectedEpisodeId,
  setSelectedEpisodeId,
  hasDraftChanges,
  activeProjectId,
  projects,
  onClose,
  onCreateProject,
  onSelectProject,
  onSaveProject,
  onGenerate,
  onExportAll,
}: {
  analysis: ScriptAnalysis;
  contextPack: ContextPack;
  pipelineSummary: ReturnType<typeof summarizePipeline>;
  selectedEpisodeId: string;
  setSelectedEpisodeId: (id: string) => void;
  hasDraftChanges: boolean;
  activeProjectId: string;
  projects: StoryboardProject[];
  onClose: () => void;
  onCreateProject: () => void;
  onSelectProject: (projectId: string) => void;
  onSaveProject: () => void;
  onGenerate: () => void | Promise<void>;
  onExportAll: () => Promise<void>;
}) {
  const assetCount = analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0);
  const shotCount = analysis.episodes.reduce((sum, episode) => sum + episode.shots.length, 0);

  return (
    <div className="tool-overlay" role="dialog" aria-modal="true" aria-label="全局工具">
      <aside className="tool-drawer">
        <div className="drawer-header">
          <strong>全局工具</strong>
          <button onClick={onClose} aria-label="关闭工具面板">
            <X size={17} />
          </button>
        </div>
        <section className="side-section">
          <div className="side-title">
            <strong>默认项目</strong>
            <span>项目总览</span>
          </div>
          <div className="side-metrics">
            <div>
              <strong>{analysis.episodes.length}</strong>
              <span>集</span>
            </div>
            <div>
              <strong>{assetCount}</strong>
              <span>资产</span>
            </div>
            <div>
              <strong>{shotCount}</strong>
              <span>镜头</span>
            </div>
          </div>
        </section>
        <section className="side-section">
          <div className="side-title">
            <strong>项目管理</strong>
            <span>{projects.length} 个</span>
          </div>
          <div className="flow-list compact">
            <button onClick={onCreateProject}>
              <Plus size={16} />
              新建项目
            </button>
            <button onClick={onSaveProject}>
              <Save size={16} />
              保存项目
            </button>
          </div>
          <div className="project-list">
            {projects.map((project) => (
              <button
                key={project.projectId}
                className={project.projectId === activeProjectId ? "active" : ""}
                onClick={() => onSelectProject(project.projectId)}
              >
                <strong>{project.name}</strong>
                <span>{project.analysis.episodes.length} 集 / {project.analysis.episodes.reduce((sum, episode) => sum + episode.assets.length, 0)} 资产</span>
                <small>{new Date(project.updatedAt).toLocaleString("zh-CN", { hour12: false })}</small>
              </button>
            ))}
          </div>
        </section>
        <section className="side-section side-fill">
          <div className="side-title">
            <strong>剧集</strong>
            <span>{selectedEpisodeId}</span>
          </div>
          <div className="side-episode-list">
            {analysis.episodes.map((episode) => (
              <button
                key={episode.episodeId}
                className={episode.episodeId === selectedEpisodeId ? "active" : ""}
                onClick={() => setSelectedEpisodeId(episode.episodeId)}
              >
                <strong>{episode.episodeId}</strong>
                <span>
                  {episode.assets.length} 资产 / {episode.shots.length} 镜头
                </span>
              </button>
            ))}
          </div>
        </section>
        <section className="side-section">
          <div className="side-title">
            <strong>流程状态</strong>
            <span>{pipelineSummary.totalStages} 阶段</span>
          </div>
          <p className="side-note">
            {pipelineSummary.llmStages} 个 LLM 阶段，{pipelineSummary.blockedStages} 个阶段等待接入执行器。上下文连续性：
            {contextPack.continuity.length}
          </p>
        </section>
        <div className="actions-row">
          <button className="primary-button" onClick={() => void onGenerate()}>
            <Play size={18} />
            重新生成
          </button>
          <button onClick={() => void onExportAll()} disabled={hasDraftChanges}>
            <Package size={18} />
            导出 ZIP
          </button>
        </div>
      </aside>
    </div>
  );
}

function ScriptQualityView({ report }: { report: ReturnType<typeof buildScriptQualityReport> }) {
  const issueLines = new Set(report.issues.map((issue) => issue.line));
  const cleanedLines = report.cleanedScript.split("\n");

  return (
    <>
      <section className="script-card panel">
        <div className="panel-title">
          <CheckCircle2 size={18} />
          <span>校检剧本</span>
          <strong>{report.cleanedScript.length.toLocaleString()} 字</strong>
        </div>
        <div className="clean-script-preview">
          {cleanedLines.map((line, index) => (
            <div key={`${index}-${line}`} className={issueLines.has(index + 1) ? "clean-line issue-highlight" : "clean-line"}>
              <span>{index + 1}</span>
              <p>{line || " "}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="panel script-issue-panel">
        <div className="panel-title">
          <AlertTriangle size={18} />
          <span>审校疑点</span>
          <strong>{report.issues.length}</strong>
        </div>
        <div className="issue-list">
          {report.issues.length === 0 ? (
            <div className="empty-state">暂未发现明显格式疑点。</div>
          ) : (
            report.issues.map((issue) => (
              <article key={issue.id} className="issue-item">
                <header>
                  <strong>{issue.category}</strong>
                  <span>{issue.level}</span>
                </header>
                <p>{issue.message}</p>
                <small>
                  第 {issue.line} 行：{issue.excerpt}
                </small>
              </article>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function EpisodeSplitPreviewDialog({
  draft,
  onRuleChange,
  onConfirm,
  onClose,
}: {
  draft: EpisodeSplitDraft;
  onRuleChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [ruleDraft, setRuleDraft] = useState(draft.customRule);
  const previewText = draft.preview.episodes
    .map((episode) => episode.text)
    .join("\n\n==========\n==========\n\n");

  useEffect(() => {
    setRuleDraft(draft.customRule);
  }, [draft.customRule]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="分集预览">
      <article className="modal-panel episode-preview-modal">
        <div className="episode-preview-header">
          <div>
            <h2>分集预览</h2>
            <p>{draft.fileName} / {draft.preview.episodes.length} 集 / {draft.sourceText.length.toLocaleString()} 字</p>
          </div>
          <div className="episode-preview-actions">
            <button onClick={() => onRuleChange(ruleDraft)}>
              <RefreshCcw size={16} />
              重新分集
            </button>
            <button className="primary-button" onClick={onConfirm}>
              <CheckCircle2 size={16} />
              确认分集
            </button>
            <button onClick={onClose} title="关闭">
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="episode-preview-rule-row">
          <label>
            自定义分集规则
            <input value={ruleDraft} onChange={(event) => setRuleDraft(event.target.value)} placeholder="例如：^第\\d+话" />
          </label>
          {draft.preview.warnings.length > 0 && (
            <div className="episode-split-warnings">
              {draft.preview.warnings.slice(0, 3).map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          )}
        </div>
        <textarea className="episode-preview-text" value={previewText} readOnly spellCheck={false} />
      </article>
    </div>
  );
}

function AssetImageView({
  assets,
  locks,
  imageCandidates,
  imageConfig,
  runningAssetId,
  onImageConfigChange,
  onGenerateImage,
  onLockCandidate,
  onLock,
}: {
  assets: AssetDescription[];
  locks: LockRecord[];
  imageCandidates: AssetImageCandidate[];
  imageConfig: ImageGenerationConfig;
  runningAssetId: string;
  onImageConfigChange: (config: ImageGenerationConfig) => void;
  onGenerateImage: (asset: AssetDescription) => void;
  onLockCandidate: (assetId: string, candidateId: string) => void;
  onLock: (targetId: string, status: "locked" | "unlocked" | "needs_review", reason: string) => void;
}) {
  const imageReadyAssets = assets.filter((asset) => asset.type === "角色" || asset.type === "场景");
  const needsReviewAssets = assets.filter((asset) => asset.reliability === "needs_review" || /待确认|补充/.test(asset.description));
  const lockedAssetCount = assets.filter((asset) => locks.find((lockItem) => lockItem.targetId === asset.assetId)?.status === "locked").length;
  const generatedCount = imageCandidates.filter((candidate) => candidate.status === "done" || candidate.status === "locked").length;

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>资产生图工作台</h2>
          <p>确认资产描述是否能稳定生图，再生成候选图并锁定版本。</p>
        </div>
        <div className="header-actions">
          <button>
            <Filter size={16} />
            筛选待做
          </button>
          <button className="primary-button" disabled={!imageConfig.hasApiKey || !imageConfig.baseUrl}>
            <Play size={16} />
            批量生图
          </button>
        </div>
      </div>

      <ImageConfigPanel config={imageConfig} onChange={onImageConfigChange} />

      <div className="work-status-grid">
        <ReviewStat label="待补全描述" value={needsReviewAssets.length} tone="warning" />
        <ReviewStat label="待生成图片" value={Math.max(0, imageReadyAssets.length - generatedCount)} tone="normal" />
        <ReviewStat label="已锁定图片" value={lockedAssetCount} tone="muted" />
        <ReviewStat label="可进入分镜" value={lockedAssetCount} tone="muted" />
      </div>

      <section className="tool-strip">
        <button className="active">全部</button>
        <button>角色</button>
        <button>场景</button>
        <button>道具</button>
        <button>未锁定</button>
        <button>描述需补全</button>
      </section>

      <div className="asset-production-list">
        {assets.map((asset) => (
          <AssetProductionRow
            key={asset.assetId}
            asset={asset}
            lockRecord={locks.find((lockItem) => lockItem.targetId === asset.assetId)}
            candidates={imageCandidates.filter((candidate) => candidate.assetId === asset.assetId)}
            isRunning={runningAssetId === asset.assetId}
            canGenerate={Boolean(imageConfig.hasApiKey && imageConfig.baseUrl)}
            onGenerateImage={onGenerateImage}
            onLockCandidate={onLockCandidate}
            onLock={onLock}
          />
        ))}
      </div>
    </section>
  );
}

function AssetProductionRow({
  asset,
  lockRecord,
  candidates,
  isRunning,
  canGenerate,
  onGenerateImage,
  onLockCandidate,
  onLock,
}: {
  asset: AssetDescription;
  lockRecord: LockRecord | undefined;
  candidates: AssetImageCandidate[];
  isRunning: boolean;
  canGenerate: boolean;
  onGenerateImage: (asset: AssetDescription) => void;
  onLockCandidate: (assetId: string, candidateId: string) => void;
  onLock: (targetId: string, status: "locked" | "unlocked" | "needs_review", reason: string) => void;
}) {
  const isLocked = lockRecord?.status === "locked";
  const latestCandidate = candidates[0];
  return (
    <article className="asset-production-row">
            <div className="asset-queue-meta">
              <strong>{asset.name}</strong>
              <span>{asset.type}</span>
              <small>{asset.assetId}</small>
            </div>

            <div className="asset-review-fields">
              <label>
                资产描述
                <textarea value={asset.description} spellCheck={false} readOnly />
              </label>
              <label>
                生图提示词
                <textarea value={asset.imagePrompt || `${asset.name}，${asset.description}，${asset.continuity}`} spellCheck={false} readOnly />
              </label>
              <div className="source-line">
                <Eye size={15} />
                <span>首次来源：{asset.firstSeenShotId}</span>
                <span>连续性：{asset.continuity}</span>
                <span>可靠性：{asset.reliability ?? "rule"}</span>
              </div>
            </div>

            <div className="asset-candidate-panel">
              {latestCandidate?.imageUrl ? (
                <img className="candidate-image" src={latestCandidate.imageUrl} alt={`${asset.name} 候选图`} />
              ) : (
                <div className={`image-placeholder ${latestCandidate?.status === "failed" ? "failed" : ""}`}>
                  <Image size={24} />
                  <span>{latestCandidate?.status === "failed" ? "生成失败" : "候选图"}</span>
                  {latestCandidate?.error && <small>{latestCandidate.error}</small>}
                </div>
              )}
              <div className="lock-state">
                {isLocked ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                <span>{isLocked ? "已锁定，可进入分镜和提示词" : "未锁定，分镜提示词只能引用文字资产"}</span>
              </div>
              <div className="actions-row">
                <button disabled={!canGenerate || isRunning} onClick={() => onGenerateImage(asset)}>
                  {isRunning ? "生成中" : "生成"}
                </button>
                {latestCandidate?.status === "done" && <button onClick={() => onLockCandidate(asset.assetId, latestCandidate.candidateId)}>锁定图片</button>}
                <button onClick={() => onLock(asset.assetId, isLocked ? "unlocked" : "locked", isLocked ? "人工取消资产锁定。" : "人工确认资产描述可用，临时锁定文字资产。")}>
                  <Lock size={15} />
                  {isLocked ? "解锁资产" : "锁定资产"}
                </button>
              </div>
            </div>
          </article>
  );
}

function ImageConfigPanel({ config, onChange }: { config: ImageGenerationConfig; onChange: (config: ImageGenerationConfig) => void }) {
  const [draft, setDraft] = useState(config);
  useEffect(() => {
    setDraft(config);
  }, [config]);

  function update(next: Partial<ImageGenerationConfig>) {
    setDraft((current) => normalizeImageConfig({ ...current, ...next }));
  }

  return (
    <section className="panel image-config-panel">
      <div className="panel-title">
        <Image size={18} />
        <span>图片生成配置</span>
        <strong>{draft.hasApiKey ? "Key 已填" : "未配置"}</strong>
      </div>
      <div className="image-config-grid">
        <label>
          Base URL
          <input value={draft.baseUrl ?? ""} onChange={(event) => update({ baseUrl: event.target.value })} placeholder="图片模型 OpenAI-compatible base url" />
        </label>
        <label>
          Model
          <input value={draft.model} onChange={(event) => update({ model: event.target.value })} placeholder="gpt-image-2" />
        </label>
        <label>
          API Key
          <input type="password" value={draft.apiKey ?? ""} onChange={(event) => update({ apiKey: event.target.value })} placeholder="只保存在本地浏览器" />
        </label>
        <label>
          尺寸
          <input value={draft.size} onChange={(event) => update({ size: event.target.value })} placeholder="1024x1024" />
        </label>
        <button className="primary-button" onClick={() => onChange(draft)}>
          <Save size={16} />
          保存生图配置
        </button>
      </div>
    </section>
  );
}

function ReviewStat({ label, value, tone }: { label: string; value: number; tone: "normal" | "warning" | "muted" }) {
  return (
    <div className={`review-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ContextPackView({ contextPack }: { contextPack: ContextPack }) {
  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>辅助信息审阅</h2>
          <p>只保留后续分镜和提示词看不到、但必须遵守的信息；每条都要能说明来源和用途。</p>
        </div>
        <div className="header-actions">
          <button disabled>
            <RefreshCcw size={16} />
            重算本集
          </button>
          <button disabled>
            <Lock size={16} />
            锁定确认
          </button>
        </div>
      </div>

      <section className="support-review-grid">
        <article className="panel">
          <div className="panel-title">
            <Database size={18} />
            <span>集级辅助 03</span>
          </div>
          <div className="support-list">
            {contextPack.episodes.map((episode) => (
              <div key={episode.episodeId} className="support-item">
                <header>
                  <strong>{episode.episodeId}</strong>
                  <span>供 06/07 使用</span>
                </header>
                <p>{episode.objective}</p>
                <small>用途：控制揭露顺序、情绪弧线、跨场关系，不写具体镜头站位。</small>
                <small>来源：本集全量剧本 + 题材/风格规则；可靠性：需人工确认。</small>
                <div className="tag-row">
                  {episode.emotionalCurve.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel">
          <div className="panel-title">
            <Scissors size={18} />
            <span>场级连续性 04</span>
          </div>
          <div className="support-list">
            {contextPack.sceneBeats.map((beat) => (
              <div key={beat.beatId} className="support-item">
                <header>
                  <strong>{beat.scene}</strong>
                  <span>{beat.episodeId}</span>
                </header>
                <p>{beat.purpose}</p>
                <small>用途：给 06 场级分镜规划和 07 块级重跑提供场内边界。</small>
                <small>来源：本场剧本文字；可靠性：高于 03，但仍需确认人物进出和道具流转。</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="support-review-grid three">
        <ContextStatePanel title="角色锁定项" items={contextPack.characters} renderItem={(item) => (
          <>
            <header>
              <strong>{item.name}</strong>
              <span>{item.episodeId}</span>
            </header>
            <p>{item.baseline}</p>
            <small>需要锁定：外观、服装、手持物、情绪底色。</small>
            <small>当前：{item.currentEmotion}；手持物：{item.heldItems.join("、") || "无/待确认"}</small>
          </>
        )} />
        <ContextStatePanel title="场景锁定项" items={contextPack.scenes} renderItem={(item) => (
          <>
            <header>
              <strong>{item.name}</strong>
              <span>{item.time}</span>
            </header>
            <p>{item.lighting}</p>
            <small>需要锁定：门窗、光源、桌椅、可复用角度、背景人物密度。</small>
            <small>{item.background}</small>
          </>
        )} />
        <ContextStatePanel title="道具锁定项" items={contextPack.props} renderItem={(item) => (
          <>
            <header>
              <strong>{item.name}</strong>
              <span>{item.episodeId}</span>
            </header>
            <p>{item.state}</p>
            <small>需要锁定：开合、破损、持有人、是否可被镜头看见。</small>
            <small>持有人：{item.owner}；{item.visibility}</small>
          </>
        )} />
      </section>

      <section className="panel">
        <div className="panel-title">
          <ClipboardList size={18} />
          <span>镜头级连续性监看</span>
        </div>
        <div className="continuity-table">
          {contextPack.continuity.slice(0, 12).map((state) => (
            <article key={state.shotId} className="continuity-row">
              <strong>{state.shotId}</strong>
              <p>{state.current}</p>
              <small>前：{state.previous}</small>
              <small>后：{state.next}</small>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function ContextStatePanel<T>({
  title,
  items,
  renderItem,
}: {
  title: string;
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  return (
    <article className="panel">
      <div className="panel-title">
        <ClipboardList size={18} />
        <span>{title}</span>
      </div>
      <div className="context-card-list">
        {items.length ? items.map((item, index) => <div className="context-card" key={index}>{renderItem(item)}</div>) : <div className="empty-state">待生成。</div>}
      </div>
    </article>
  );
}

function PipelineConfigView({
  latestRun,
  llmConfig,
  artifacts,
  locks,
  tasks,
  promptLibrary,
  onLlmConfigChange,
  onPromptLibraryChange,
}: {
  latestRun: PipelineRun | null;
  llmConfig: LlmExecutorConfig;
  artifacts: ArtifactRecord[];
  locks: LockRecord[];
  tasks: TaskRecord[];
  promptLibrary: PromptLibraryState;
  onLlmConfigChange: (config: LlmExecutorConfig) => void;
  onPromptLibraryChange: (state: PromptLibraryState, message?: string) => void;
}) {
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>模型与流程设置</h2>
          <p>这里只放运行前必须配置的内容。管线细节放到开发诊断里，不打扰日常操作。</p>
        </div>
      </div>

      <section className="settings-layout">
        <LlmConfigForm config={llmConfig} onChange={onLlmConfigChange} />
        <RunHealthPanel latestRun={latestRun} config={llmConfig} />
      </section>

      <PromptLibraryPanel state={promptLibrary} onChange={onPromptLibraryChange} />

      <details className="diagnostics-panel" open={isDiagnosticsOpen} onToggle={(event) => setIsDiagnosticsOpen(event.currentTarget.open)}>
        <summary>
          <span>开发诊断</span>
          <small>{isDiagnosticsOpen ? "收起管线细节" : "查看管线、Artifact、任务状态"}</small>
        </summary>
        <PipelineDiagnostics latestRun={latestRun} artifacts={artifacts} locks={locks} tasks={tasks} />
      </details>
    </section>
  );
}

function PromptLibraryPanel({
  state,
  onChange,
}: {
  state: PromptLibraryState;
  onChange: (state: PromptLibraryState, message?: string) => void;
}) {
  const [selectedStageId, setSelectedStageId] = useState<PromptStageId>("clean_script");
  const selectedPromptId = state.selectedPromptIds[selectedStageId];
  const selectedPrompt = state.prompts.find((prompt) => prompt.promptId === selectedPromptId) ?? state.prompts.find((prompt) => prompt.stageId === selectedStageId);
  const [draft, setDraft] = useState<PromptVersion | null>(selectedPrompt ?? null);

  useEffect(() => {
    setDraft(selectedPrompt ? { ...selectedPrompt } : null);
  }, [selectedPrompt?.promptId]);

  const stageMeta = promptStages.find((stage) => stage.stageId === selectedStageId);
  const stagePrompts = state.prompts.filter((prompt) => prompt.stageId === selectedStageId);

  function saveDraft() {
    if (!draft) return;
    onChange(upsertPrompt(state, draft), `${stageMeta?.name ?? selectedStageId} Prompt 已保存`);
  }

  function createNewVersion() {
    const source = draft ?? selectedPrompt;
    if (!source) return;
    const next: PromptVersion = {
      ...source,
      promptId: createPromptId(selectedStageId),
      name: `${source.name} 新版`,
      updatedAt: new Date().toISOString(),
    };
    onChange(upsertPrompt(state, next), `${stageMeta?.name ?? selectedStageId} 新 Prompt 已创建`);
  }

  function duplicateCurrent() {
    if (!selectedPrompt) return;
    onChange(duplicatePrompt(state, selectedPrompt.promptId), `${stageMeta?.name ?? selectedStageId} Prompt 已复制`);
  }

  return (
    <article className="panel prompt-library-panel">
      <div className="panel-title">
        <Edit3 size={18} />
        <span>Prompt 配置库</span>
        <strong>{promptStages.length} 个阶段</strong>
      </div>
      <div className="prompt-library-layout">
        <div className="prompt-stage-list">
          {promptStages.map((stage) => {
            const current = state.prompts.find((prompt) => prompt.promptId === state.selectedPromptIds[stage.stageId]);
            return (
              <button
                key={stage.stageId}
                className={selectedStageId === stage.stageId ? "active" : ""}
                onClick={() => setSelectedStageId(stage.stageId)}
              >
                <strong>{stage.name}</strong>
                <span>{current?.name ?? "未配置"}</span>
              </button>
            );
          })}
        </div>
        <div className="prompt-editor">
          <div className="prompt-editor-top">
            <div>
              <strong>{stageMeta?.name}</strong>
              <p>{stageMeta?.purpose}</p>
            </div>
            <label>
              当前版本
              <select
                value={selectedPrompt?.promptId ?? ""}
                onChange={(event) => onChange(selectPrompt(state, selectedStageId, event.target.value), "已切换 Prompt 版本")}
              >
                {stagePrompts.map((prompt) => (
                  <option key={prompt.promptId} value={prompt.promptId}>
                    {prompt.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {draft ? (
            <>
              <div className="prompt-field-grid">
                <label>
                  名称
                  <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label>
                  说明
                  <input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                </label>
              </div>
              <div className="prompt-variable-row">
                <span>变量</span>
                {draft.variables.map((variable) => (
                  <code key={variable.key}>{`{{${variable.key}}}`}</code>
                ))}
              </div>
              <label>
                System Prompt
                <textarea value={draft.systemTemplate} onChange={(event) => setDraft({ ...draft, systemTemplate: event.target.value })} spellCheck={false} />
              </label>
              <label>
                User Prompt
                <textarea value={draft.userTemplate} onChange={(event) => setDraft({ ...draft, userTemplate: event.target.value })} spellCheck={false} />
              </label>
              <label>
                输出格式要求
                <textarea value={draft.outputContract} onChange={(event) => setDraft({ ...draft, outputContract: event.target.value })} spellCheck={false} />
              </label>
              <label>
                输出范例
                <textarea value={draft.exampleOutput} onChange={(event) => setDraft({ ...draft, exampleOutput: event.target.value })} spellCheck={false} />
              </label>
              <div className="config-actions">
                <button className="primary-button" onClick={saveDraft}>
                  <Save size={16} />
                  保存版本
                </button>
                <button onClick={createNewVersion}>
                  <Plus size={16} />
                  新建版本
                </button>
                <button onClick={duplicateCurrent}>
                  <RefreshCcw size={16} />
                  复制当前
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">当前阶段没有 Prompt。</div>
          )}
        </div>
      </div>
    </article>
  );
}

function PipelineStageCard({
  index,
  stage,
  stageResult,
}: {
  index: number;
  stage: (typeof defaultPipelineConfig.stages)[number];
  stageResult: PipelineRun["stageResults"][number] | undefined;
}) {
  const status = stageResult?.status ?? stage.status;

  return (
    <article className={`pipeline-stage ${status}`}>
              <div className="stage-index">{String(index + 1).padStart(2, "0")}</div>
              <div>
                <header>
                  <strong>{stage.name}</strong>
                  <span>{stage.granularity}</span>
                  <span>{stage.artifactRole}</span>
                  <span>{stage.executor}</span>
                  <span>{status}</span>
                </header>
                <p>{stage.description}</p>
                <small>作用：{stage.purpose}</small>
                {stage.executor === "llm" && <small>Prompt：{describeStagePromptUse(stage)}</small>}
                <small>
                  输入：{stage.inputRefs.join("、")}；输出：{stage.outputRefs.join("、")}
                </small>
                {stageResult && <small>最近产物：{stageResult.artifactSummary}</small>}
                {stageResult?.blockReason && <small>阻塞：{stageResult.blockReason}</small>}
                {stage.lockPolicy && <small>锁定：{stage.lockPolicy}</small>}
                {stage.rerunScopes?.length ? <small>重跑粒度：{stage.rerunScopes.join("、")}</small> : null}
              </div>
            </article>
  );
}

function PipelineDiagnostics({
  latestRun,
  artifacts,
  locks,
  tasks,
}: {
  latestRun: PipelineRun | null;
  artifacts: ArtifactRecord[];
  locks: LockRecord[];
  tasks: TaskRecord[];
}) {
  return (
    <div className="diagnostics-content">
      <section className="pipeline-layout">
        <article className="panel">
          <div className="panel-title">
            <Database size={18} />
            <span>Artifact Store</span>
            <strong>{artifacts.length}</strong>
          </div>
          <div className="artifact-table">
            {artifacts.map((artifact) => (
              <div key={artifact.artifactId} className="artifact-row">
                <strong>{artifact.title}</strong>
                <span>{artifact.role}</span>
                <p>{artifact.summary}</p>
                <small>来源：{artifact.sourceRefs.join("、") || "无"}；下游：{artifact.downstreamRefs.join("、") || "无"}</small>
                {artifact.contentPreview && <small>预览：{artifact.contentPreview}</small>}
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <Lock size={18} />
            <span>锁定与任务状态</span>
          </div>
          <div className="lock-task-grid">
            <ReviewStat label="已锁定" value={locks.filter((lockItem) => lockItem.status === "locked").length} tone="muted" />
            <ReviewStat label="需确认锁定" value={locks.filter((lockItem) => lockItem.status === "needs_review").length} tone="warning" />
            <ReviewStat label="阻塞任务" value={tasks.filter((task) => task.status === "blocked").length} tone="warning" />
            <ReviewStat label="待人工确认" value={tasks.filter((task) => task.status === "needs_review").length} tone="warning" />
          </div>
          <div className="task-list">
            {tasks.map((task) => (
              <div key={task.taskId} className={`task-row ${task.status}`}>
                <strong>{task.label}</strong>
                <span>{task.status}</span>
                <small>{task.detail}</small>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title">
          <ClipboardList size={18} />
          <span>Pipeline 阶段</span>
        </div>
        <div className="pipeline-stage-list">
          {defaultPipelineConfig.stages.map((stage, index) => (
            <PipelineStageCard
              key={stage.id}
              index={index}
              stage={stage}
              stageResult={latestRun?.stageResults.find((result) => result.stageId === stage.id)}
            />
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Terminal size={18} />
          <span>LLM 调用追踪</span>
          <strong>{latestRun?.stageResults.reduce((sum, stage) => sum + (stage.traces?.length ?? 0), 0) ?? 0}</strong>
        </div>
        <div className="llm-trace-list">
          {latestRun?.stageResults.flatMap((stage) => stage.traces ?? []).map((trace) => (
            <details key={trace.traceId} className="llm-trace-item">
              <summary>
                <strong>{trace.label}</strong>
                <span>{trace.promptName}</span>
                <span>{trace.durationMs}ms</span>
                {trace.validationErrors.length ? <span className="trace-error">Schema 失败</span> : <span>Schema 通过</span>}
              </summary>
              <div className="trace-grid">
                <label>
                  System Prompt
                  <textarea value={trace.systemPrompt} readOnly spellCheck={false} />
                </label>
                <label>
                  User Prompt
                  <textarea value={trace.userPrompt} readOnly spellCheck={false} />
                </label>
                <label>
                  输出契约
                  <textarea value={trace.outputContract} readOnly spellCheck={false} />
                </label>
                <label>
                  模型返回
                  <textarea value={trace.rawResponse} readOnly spellCheck={false} />
                </label>
              </div>
              {trace.validationErrors.length > 0 && <p>错误：{trace.validationErrors.join("；")}</p>}
            </details>
          ))}
          {!latestRun?.stageResults.some((stage) => stage.traces?.length) && <div className="empty-state">生成后显示每次 LLM 的输入、输出和校验结果。</div>}
        </div>
      </section>
    </div>
  );
}

function RunHealthPanel({ latestRun, config }: { latestRun: PipelineRun | null; config: LlmExecutorConfig }) {
  return (
    <article className="panel run-health-panel">
      <div className="panel-title">
        <Terminal size={18} />
        <span>运行状态</span>
      </div>
      <div className="run-health-list">
        <div className={config.hasApiKey ? "health-item done" : "health-item warning"}>
          {config.hasApiKey ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{config.hasApiKey ? "真实接口已配置" : "缺少 API Key"}</strong>
            <span>{config.baseUrl} / {config.model}</span>
          </div>
        </div>
        <div className={latestRun ? "health-item done" : "health-item warning"}>
          {latestRun ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{latestRun ? `最近运行：${latestRun.status}` : "还没有运行记录"}</strong>
            <span>
              {latestRun
                ? `${latestRun.stageResults.filter((stage) => stage.status === "done").length} 完成 / ${latestRun.stageResults.filter((stage) => stage.status === "blocked").length} 待接`
                : "保存配置后可点顶部生成。"}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

function LlmConfigForm({ config, onChange }: { config: LlmExecutorConfig; onChange: (config: LlmExecutorConfig) => void }) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setDraft(config);
  }, [config]);

  function update(next: Partial<LlmExecutorConfig>) {
    setDraft((current) => normalizeLlmConfig({ ...current, ...next }));
    setMessage("");
  }

  function saveConfig() {
    onChange(draft);
    setMessage("配置已保存");
  }

  function testConfig() {
    const normalized = normalizeLlmConfig(draft);
    if (!normalized.apiKey?.trim()) {
      setMessage("缺少 API Key，不能测试真实接口。");
      return;
    }
    setMessage("配置格式通过；真实连通测试将在后端/代理接入后执行。");
  }

  return (
    <article className="panel config-editor-panel">
      <div className="panel-title">
        <Sparkles size={18} />
        <span>DeepSeek 配置</span>
        <strong>{draft.hasApiKey ? "Key 已填" : "未填 Key"}</strong>
      </div>
      <div className="llm-config-form">
        <label>
          Model
          <input value={draft.model} onChange={(event) => update({ model: event.target.value })} placeholder="deepseek-chat" />
        </label>
        <label>
          Base URL
          <input value={draft.baseUrl ?? ""} onChange={(event) => update({ baseUrl: event.target.value })} placeholder="https://api.deepseek.com" />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={draft.apiKey ?? ""}
            onChange={(event) => update({ apiKey: event.target.value })}
            placeholder="只保存在本地浏览器 localStorage"
          />
        </label>
        <label>
          Temperature
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={draft.temperature}
            onChange={(event) => update({ temperature: Number(event.target.value) })}
          />
        </label>
        <label className="checkbox-line">
          <input type="checkbox" checked={draft.jsonMode} onChange={(event) => update({ jsonMode: event.target.checked })} />
          JSON Output
        </label>
      </div>
      <div className="config-actions">
        <button className="primary-button" onClick={saveConfig}>
          <Save size={16} />
          保存配置
        </button>
        <button onClick={testConfig}>
          <Play size={16} />
          测试配置
        </button>
        {message && <span>{message}</span>}
      </div>
    </article>
  );
}

function StoryboardWorkbench({
  analysis,
  contextPack,
  selectedEpisode,
  selectedEpisodeId,
  setSelectedEpisodeId,
  viewMode,
  setViewMode,
  hasDraftChanges,
  onExportEpisode,
  onEpisodeChange,
  locks,
  onLock,
  onRerun,
}: {
  analysis: ScriptAnalysis;
  contextPack: ContextPack;
  selectedEpisode: EpisodeResult;
  selectedEpisodeId: string;
  setSelectedEpisodeId: (id: string) => void;
  viewMode: "cards" | "json";
  setViewMode: (mode: "cards" | "json") => void;
  hasDraftChanges: boolean;
  onExportEpisode: () => void;
  onEpisodeChange: (episode: EpisodeResult) => void;
  locks: LockRecord[];
  onLock: (targetId: string, status: "locked" | "unlocked" | "needs_review", reason: string) => void;
  onRerun: (scope: string, targetId: string) => void;
}) {
  const selectedContinuity = contextPack.episodes.find((episode) => episode.episodeId === selectedEpisodeId);
  const selectedSceneBeats = contextPack.sceneBeats.filter((beat) => beat.episodeId === selectedEpisodeId);
  const reviewCount = selectedEpisode.shots.filter((shot) => shot.reviewNotes.length > 0).length;

  return (
    <>
      <div className="page-header work-header">
        <div>
          <h2>分镜工作台</h2>
          <p>先看场级规划和连续性，再审镜头与视频提示词；局部不满意时按块重跑。</p>
        </div>
        <div className="mode-switch" aria-label="视图模式">
          <button className={viewMode === "cards" ? "active" : ""} onClick={() => setViewMode("cards")}>
            <ClipboardList size={16} />
            审阅
          </button>
          <button className={viewMode === "json" ? "active" : ""} onClick={() => setViewMode("json")}>
            <Edit3 size={16} />
            JSON
          </button>
        </div>
      </div>

      {analysis.warnings.length > 0 && (
        <div className="warning-strip">
          <AlertTriangle size={17} />
          <div>
            {analysis.warnings.map((warning) => (
              <span key={warning}>{warning}</span>
            ))}
          </div>
        </div>
      )}

      <div className="work-status-grid">
        <ReviewStat label="本集资产" value={selectedEpisode.assets.length} tone="normal" />
        <ReviewStat label="本集镜头" value={selectedEpisode.shots.length} tone="normal" />
        <ReviewStat label="需复核镜头" value={reviewCount} tone={reviewCount ? "warning" : "muted"} />
        <ReviewStat label="已锁定块" value={0} tone="muted" />
      </div>

      <section className="storyboard-control-grid">
        <article className="panel">
          <div className="panel-title">
            <Database size={18} />
            <span>本集必须遵守</span>
          </div>
          <div className="operator-note-list">
            <p>{selectedContinuity?.objective ?? "待生成本集辅助信息。"}</p>
            <p>情绪弧线：{selectedContinuity?.emotionalCurve.join(" -> ") || "待确认"}</p>
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <Scissors size={18} />
            <span>场级规划</span>
          </div>
          <div className="scene-plan-list">
            {selectedSceneBeats.map((beat) => (
              <div key={beat.beatId} className="scene-plan-item">
                <strong>{beat.scene}</strong>
                <p>{beat.purpose}</p>
                <small>{beat.emotionProgression}</small>
              </div>
            ))}
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <RefreshCcw size={18} />
            <span>重跑控制</span>
          </div>
          <div className="rerun-actions">
            <button onClick={() => onRerun("scene", selectedEpisodeId)}>重跑本场</button>
            <button onClick={() => onRerun("block", selectedEpisodeId)}>重跑选中块</button>
            <button onClick={() => onRerun("prompt", selectedEpisodeId)}>只重写提示词</button>
          </div>
          <p className="side-note">空间、进出场、道具流转变更要场级重跑；只是不满意某块表达时才块级重跑。</p>
        </article>
      </section>

      <EpisodeView
        episode={selectedEpisode}
        onExport={onExportEpisode}
        isExportDisabled={hasDraftChanges}
        viewMode={viewMode}
        onEpisodeChange={onEpisodeChange}
        locks={locks}
        onLock={onLock}
        onRerun={onRerun}
      />
    </>
  );
}

function EpisodeView({
  episode,
  onExport,
  isExportDisabled,
  viewMode,
  onEpisodeChange,
  locks,
  onLock,
  onRerun,
}: {
  episode: EpisodeResult;
  onExport: () => void;
  isExportDisabled: boolean;
  viewMode: "cards" | "json";
  onEpisodeChange: (episode: EpisodeResult) => void;
  locks: LockRecord[];
  onLock: (targetId: string, status: "locked" | "unlocked" | "needs_review", reason: string) => void;
  onRerun: (scope: string, targetId: string) => void;
}) {
  const [jsonDraft, setJsonDraft] = useState(() => formatJson(exportEpisodeBundle(episode)));
  const [jsonError, setJsonError] = useState("");

  useEffect(() => {
    setJsonDraft(formatJson(exportEpisodeBundle(episode)));
    setJsonError("");
  }, [episode]);

  function applyJsonDraft() {
    const parsed = parseEpisodeBundle(jsonDraft, episode);
    if (!parsed.ok) {
      setJsonError(parsed.error);
      return;
    }
    setJsonError("");
    onEpisodeChange(parsed.episode);
  }

  return (
    <div className="episode-view">
      <div className="episode-header">
        <div>
          <h2>{episode.title}</h2>
          <p>{episode.logline}</p>
        </div>
        <button onClick={onExport} disabled={isExportDisabled}>
          <Download size={18} />
          导出本集
        </button>
      </div>

      {viewMode === "json" ? (
        <section className="panel json-editor-panel">
          <div className="panel-title">
            <Edit3 size={18} />
            <span>真源 JSON 编辑</span>
            <button onClick={applyJsonDraft}>应用修改</button>
          </div>
          <textarea className="json-editor" value={jsonDraft} onChange={(event) => setJsonDraft(event.target.value)} spellCheck={false} />
          {jsonError && <div className="json-error">{jsonError}</div>}
        </section>
      ) : (
        <>
          <section className="storyboard-main-grid">
            <div className="panel">
              <div className="panel-title">
                <Sparkles size={18} />
                <span>本集资产约束</span>
              </div>
              <div className="asset-list">
                {episode.assets.map((asset) => (
                  <article key={asset.assetId} className="asset-item">
                    <div>
                      <strong>{asset.name}</strong>
                      <span>{asset.type}</span>
                    </div>
                    <p>{asset.description}</p>
                    <small>{asset.continuity}</small>
                  </article>
                ))}
              </div>
            </div>

            <div className="panel">
              <div className="panel-title">
                <Scissors size={18} />
                <span>镜头审阅</span>
              </div>
              <div className="shot-list">
                {episode.shots.map((shot) => {
                  const isLocked = locks.find((lockItem) => lockItem.targetId === shot.shotId)?.status === "locked";
                  return (
                    <article key={shot.shotId} className="shot-item">
                      <header>
                        <strong>{shot.shotId}</strong>
                        <span>{shot.durationSeconds}s</span>
                      </header>
                      <h3>{shot.scene}</h3>
                      <div className="shot-meta">
                        <span>{shot.shotType}</span>
                        <span>{shot.framing}</span>
                        <span>{shot.camera}</span>
                        <span>{shot.assets.length ? `${shot.assets.length} 资产` : "资产待关联"}</span>
                        <span>{isLocked ? "已锁定" : "未锁定"}</span>
                      </div>
                      <p>{shot.action}</p>
                      {shot.dialogue && <blockquote>{shot.dialogue}</blockquote>}
                      {shot.reviewNotes.length > 0 && (
                        <ul className="review-notes">
                          {shot.reviewNotes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      )}
                      <div className="shot-actions">
                        <button onClick={() => onLock(shot.shotId, isLocked ? "unlocked" : "locked", isLocked ? "人工取消镜头锁定。" : "人工确认镜头可作为下游输入。")}>
                          <Lock size={15} />
                          {isLocked ? "解锁镜头" : "锁定镜头"}
                        </button>
                        <button onClick={() => onRerun("block", shot.shotId)}>
                          <RefreshCcw size={15} />
                          重跑本块
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <div className="panel prompts-panel">
            <div className="panel-title">
              <Film size={18} />
              <span>视频提示词预览</span>
            </div>
            <div className="prompt-list">
              {episode.prompts.map((prompt) => (
                <article key={prompt.promptId}>
                  <strong>{prompt.promptId}</strong>
                  <p>{prompt.videoPrompt}</p>
                </article>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}

interface EpisodeSplitItem {
  episodeNumber: number;
  title: string;
  text: string;
}

interface EpisodeSplitPreviewData {
  episodes: EpisodeSplitItem[];
  warnings: string[];
}

interface EpisodeSplitDraft {
  fileName: string;
  sourceText: string;
  customRule: string;
  preview: EpisodeSplitPreviewData;
}

const defaultEpisodeSplitRules = [
  "^\\s*第\\s*([0-9０-９]+)\\s*集(?:\\s+.*)?$",
  "^\\s*第\\s*([一二三四五六七八九十百零〇两]+)\\s*集(?:\\s+.*)?$",
  "^\\s*第\\s*([0-9０-９]+)\\s*话(?:\\s+.*)?$",
  "^\\s*第\\s*([一二三四五六七八九十百零〇两]+)\\s*话(?:\\s+.*)?$",
  "^\\s*EP\\s*([0-9０-９]+)(?:\\s+.*)?$",
  "^\\s*E\\s*([0-9０-９]+)(?:\\s+.*)?$",
  "^\\s*Episode\\s*([0-9０-９]+)(?:\\s+.*)?$",
  "^\\s*([0-9０-９]+)\\s*[\\.、-]?\\s*集(?:\\s+.*)?$",
];

function splitScriptIntoEpisodes(script: string, customRule: string): EpisodeSplitPreviewData {
  const normalized = script.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { episodes: [], warnings: ["当前没有剧本文本。"] };

  const ruleTexts = [...defaultEpisodeSplitRules, customRule.trim()].filter(Boolean);
  const rules = ruleTexts.flatMap((ruleText) => {
    try {
      return [new RegExp(ruleText, "i")];
    } catch {
      return [];
    }
  });
  const lines = normalized.split("\n");
  const starts: Array<{ lineIndex: number; title: string; episodeNumber: number }> = [];

  lines.forEach((line, lineIndex) => {
    for (const rule of rules) {
      const match = line.match(rule);
      if (!match) continue;
      const episodeNumber = parseEpisodeMarkerNumber(match[1]) || starts.length + 1;
      starts.push({ lineIndex, title: line.trim(), episodeNumber });
      return;
    }
  });

  if (!starts.length) {
    return {
      episodes: [{ episodeNumber: 1, title: "未识别分集标记", text: normalized }],
      warnings: ["未识别到分集开始标记，请添加自定义分集规则后重新预览。"],
    };
  }

  const episodes = starts.map((start, index) => {
    const endLineIndex = starts[index + 1]?.lineIndex ?? lines.length;
    return {
      episodeNumber: start.episodeNumber,
      title: start.title,
      text: lines.slice(start.lineIndex, endLineIndex).join("\n").trim(),
    };
  });
  const warnings = buildEpisodeSplitWarnings(episodes);
  return { episodes, warnings };
}

function buildEpisodeSplitWarnings(episodes: EpisodeSplitItem[]) {
  const warnings: string[] = [];
  episodes.forEach((episode, index) => {
    const expected = index + 1;
    if (episode.episodeNumber !== expected) {
      warnings.push(`第 ${expected} 段识别为 EP${String(episode.episodeNumber).padStart(2, "0")}，可能存在缺集或标记异常。`);
    }
    if (episode.text.length < 80) {
      warnings.push(`${episode.title} 文本较短，建议复核是否切分错误。`);
    }
  });
  return warnings;
}

function parseEpisodeMarkerNumber(value: string | undefined) {
  if (!value) return 0;
  const normalized = value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return chineseNumberToInt(normalized);
}

function chineseNumberToInt(value: string): number {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  const hundredIndex = value.indexOf("百");
  if (hundredIndex >= 0) {
    const hundreds = digits[value[hundredIndex - 1]] || 1;
    return hundreds * 100 + chineseNumberToInt(value.slice(hundredIndex + 1));
  }
  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digits[value[tenIndex - 1]] || 1;
    const ones = digits[value[tenIndex + 1]] || 0;
    return tens * 10 + ones;
  }
  return digits[value] ?? 0;
}

function ensureEpisodeHeading(text: string, episodeNumber: number) {
  const trimmed = text.trim();
  const preview = splitScriptIntoEpisodes(trimmed, "");
  if (preview.episodes.length === 1 && preview.episodes[0]?.title !== "未识别分集标记") return trimmed;
  return `第${episodeNumber}集\n${trimmed}`;
}

function formatEpisodeSplitPreview(preview: EpisodeSplitPreviewData) {
  return preview.episodes.map((episode) => episode.text.trim()).filter(Boolean).join("\n\n");
}

async function downloadZip(filename: string, zip: JSZip) {
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function useLocalState(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? defaultValue);

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}

function useLocalNumber(key: string, defaultValue: number) {
  const [value, setValue] = useState(() => Number(localStorage.getItem(key) ?? defaultValue));

  useEffect(() => {
    localStorage.setItem(key, String(value));
  }, [key, value]);

  return [value, setValue] as const;
}

export default App;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
