import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  Trash2,
  Edit3,
  Eye,
  FileText,
  Filter,
  Film,
  FolderKanban,
  Image,
  Layers3,
  Package,
  Plus,
  Play,
  RefreshCcw,
  Save,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AppNav, TopBar, buildRunningTopTasks, buildTopMetrics } from "./components/AppShellParts";
import { AssetReviewView, buildTrueSourceFromRecord, countAssetBundleRows } from "./components/AssetReviewView";
import { PipelineConfigView, ToolDrawer } from "./components/ConfigViews";
import { DevLogPanel, createDevLog, type DevLogEntry, type DevLogLevel } from "./components/DevLogPanel";
import { DeleteProjectDialog, ProjectManagementView, ProjectNameDialog, ProjectRootDialog, RemoveRootDialog } from "./components/ProjectManagementView";
import { ScriptRuleConfigDialog, ScriptWorkspace } from "./components/ScriptWorkspace";
import { StoryPlanningView, StoryboardPlanningView, type StoryboardExecutionMode, type StoryWorkflowRunOptions } from "./components/StoryWorkflowViews";
import { TaskRecordView } from "./components/TaskRecordView";
import { VideoGenerationView } from "./components/VideoGenerationView";
import { assetKindLabel } from "./lib/assetLabels";
import {
  ensureEpisodeHeading,
  loadEpisodeSplitRules,
  saveEpisodeSplitRules,
  serializeAnalysisScript,
  splitScriptIntoEpisodes,
  type EpisodeSplitRule,
} from "./lib/episodeSplit";
import {
  emptyAssetReviewBundle,
  extractProjectChapterAssets,
  extractProjectAssetRecords,
  loadProjectAssetReview,
  normalizeAssetReviewBundle,
  saveProjectAssetReview,
  type AssetKind,
  type AssetReviewBundle,
} from "./lib/assetApi";
import {
  addBackendRoot,
  activateBackendRoot,
  createBackendProject,
  deleteBackendProject,
  getBackendRoots,
  listBackendProjects,
  loadBackendProject,
  pickBackendDirectory,
  removeBackendRoot,
  saveBackendProject,
  uploadBackendProjectCover,
  type BackendRoot,
} from "./lib/projectApi";
import {
  backendApiBaseUrl,
} from "./lib/backendApi";
import {
  loadStoryWorkflowState,
  runStoryWorkflowAll,
  runStoryWorkflowNode,
  type StoryWorkflowArtifact,
  type StoryWorkflowNodeId,
  type StoryWorkflowState,
} from "./lib/storyWorkflowApi";
import {
  clearBackendLlmLogs,
  clearBackendImageLogs,
  getBackendImageLog,
  getBackendLlmLog,
  getBackendHealth,
  getBackendSettings,
  listBackendImageProviders,
  listBackendImageLogs,
  listBackendImageTasks,
  listBackendLlmLogs,
  listBackendRulepacks,
  loadBackendPromptLibrary,
  createBackendPromptVersion,
  updateBackendPromptVersion,
  deleteBackendPromptVersion,
  activateBackendPromptVersion,
  saveBackendImageSettings,
  saveBackendGeneralSettings,
  saveBackendLlmSettings,
  type BackendHealth,
  type BackendSettings,
  type BackendImageLog,
  type BackendImageTask,
  type ImageProviderCatalog,
  type BackendLlmLog,
  type BackendRulepack,
  type BackendPromptLibrary,
} from "./lib/backendStatusApi";
import {
  createProject,
  createDefaultProjectName,
  normalizeProject,
  normalizeProjectAnalysis,
  toSafeFolderName,
  updateProjectSnapshot,
} from "./lib/projectStore";
import type { ProjectStoreState, StoryboardProject } from "./lib/projectStore";
import { buildScriptQualityReport, defaultScriptQualityRules, loadScriptQualityRules, saveScriptQualityRules } from "./lib/scriptQuality";
import type { ScriptQualityRule } from "./lib/scriptQuality";
import { analyzeScript } from "./lib/storyboard";
import type { AnalysisOptions, EpisodeResult, ScriptAnalysis } from "./lib/storyboard";
import { loadLlmExecutorConfig, normalizeLlmConfig, saveLlmExecutorConfig } from "./lib/llmConfig";
import { loadImageGenerationConfig, normalizeImageConfig, saveImageGenerationConfig } from "./lib/imageConfig";
import type { ImageGenerationConfig, LlmExecutorConfig } from "./lib/providerConfig";
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
  const [projectStore, setProjectStore] = useState<ProjectStoreState>({ activeProjectId: "", projects: [] });
  const [projectRoot, setProjectRoot] = useState<BackendRoot | null>(null);
  const [projectRoots, setProjectRoots] = useState<BackendRoot[]>([]);
  const [isRootDialogOpen, setIsRootDialogOpen] = useState(false);
  const [rootPathDraft, setRootPathDraft] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] = useState(false);
  const [projectPendingDelete, setProjectPendingDelete] = useState<StoryboardProject | null>(null);
  const [rootPendingRemove, setRootPendingRemove] = useState<BackendRoot | null>(null);
  const [scriptQualityRules, setScriptQualityRules] = useState<ScriptQualityRule[]>(() => loadScriptQualityRules());
  const [episodeSplitRules, setEpisodeSplitRules] = useState<EpisodeSplitRule[]>(() => loadEpisodeSplitRules());
  const [isScriptRuleDialogOpen, setIsScriptRuleDialogOpen] = useState(false);
  const emptyProject = useMemo(
    () =>
      createProject({
        name: "未选择项目",
        script: "",
        options: fallbackOptions,
        analysis: analyzeScript("", fallbackOptions),
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
  const [storyboardExecutionModeRaw, setStoryboardExecutionMode] = useLocalState("storyboard-execution-mode", "integrated");
  const [analysis, setAnalysis] = useState<ScriptAnalysis>(() => activeProject.analysis);
  const [hasDraftChanges, setHasDraftChanges] = useState(false);
  const [lastGeneratedAt, setLastGeneratedAt] = useState(() => new Date().toLocaleTimeString("zh-CN", { hour12: false }));
  const [toast, setToast] = useState("");
  const [isLogCollapsed, setIsLogCollapsed] = useLocalState("feedback-collapsed", "true");
  const [assetReviewBundle, setAssetReviewBundle] = useState<AssetReviewBundle>(emptyAssetReviewBundle);
  const [isAssetReviewDirty, setIsAssetReviewDirty] = useState(false);
  const [runningAssetExtractKinds, setRunningAssetExtractKinds] = useState<Array<AssetKind | "chapters">>([]);
  const [storyWorkflow, setStoryWorkflow] = useState<StoryWorkflowState | null>(null);
  const [runningStoryNodeId, setRunningStoryNodeId] = useState<StoryWorkflowNodeId | "">("");
  const [runningStoryBatchLabel, setRunningStoryBatchLabel] = useState("");
  const [selectedWorkflowSceneId, setSelectedWorkflowSceneId] = useLocalState("selected-workflow-scene", "SC01");
  const [imageConfig, setImageConfig] = useState<ImageGenerationConfig>(() => loadImageGenerationConfig());
  const [devLogs, setDevLogs] = useState<DevLogEntry[]>(() => [
    createDevLog("pipeline", "info", "开发日志台已启动", "当前记录后端 LLM、资产生成和工作流节点运行状态。"),
    createDevLog("stage:01", "success", "剧本校验规则可用", "scriptQualityReport 已在前端实时计算。"),
    createDevLog("stage:02", "info", "生产流程可用", "当前流程：剧本统筹、资产审阅、分镜统筹、视频生成。"),
  ]);
  const devLogIssueCount = devLogs.filter((log) => log.level === "warning" || log.level === "error").length;
  const scriptQuality = useMemo(() => buildScriptQualityReport(script, scriptQualityRules), [script, scriptQualityRules]);
  const currentScriptText = useMemo(() => serializeAnalysisScript(analysis), [analysis]);

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
  const storyboardExecutionMode: StoryboardExecutionMode = storyboardExecutionModeRaw === "separate" ? "separate" : "integrated";
  const isCollapsed = isNavCollapsed === "true";
  const [llmConfig, setLlmConfig] = useState<LlmExecutorConfig>(() => loadLlmExecutorConfig());
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [generalConfig, setGeneralConfig] = useState<BackendSettings["general"]>({ imageConcurrency: 2 });
  const [backendRulepacks, setBackendRulepacks] = useState<BackendRulepack[]>([]);
  const [backendPromptLibrary, setBackendPromptLibrary] = useState<BackendPromptLibrary>({ groups: [] });
  const [backendImageProviders, setBackendImageProviders] = useState<ImageProviderCatalog[]>([]);
  const [backendLlmLogs, setBackendLlmLogs] = useState<BackendLlmLog[]>([]);
  const [backendImageLogs, setBackendImageLogs] = useState<BackendImageLog[]>([]);
  const [backendImageTasks, setBackendImageTasks] = useState<BackendImageTask[]>([]);
  const [backendLlmLogDetail, setBackendLlmLogDetail] = useState<BackendLlmLog | null>(null);
  const [backendImageLogDetail, setBackendImageLogDetail] = useState<BackendImageLog | null>(null);
  const [backendLlmHasApiKey, setBackendLlmHasApiKey] = useState(false);
  const [backendImageHasApiKey, setBackendImageHasApiKey] = useState(false);
  const runningTopTasks = useMemo(
    () => buildRunningTopTasks({
      runningAssetExtractKinds,
      runningStoryNodeId,
      runningStoryBatchLabel,
      imageTasks: backendImageTasks,
      llmLogs: backendLlmLogs,
    }),
    [runningAssetExtractKinds, runningStoryNodeId, runningStoryBatchLabel, backendImageTasks, backendLlmLogs],
  );
  const topMetrics = useMemo(() => buildTopMetrics(analysis, assetReviewBundle, storyWorkflow), [analysis, assetReviewBundle, storyWorkflow]);

  useEffect(() => {
    void initializeBackendRoots();
    void refreshBackendStatus();
  }, []);

  useEffect(() => {
    if (activePage === "context") setActivePage("planning");
  }, [activePage, setActivePage]);

  useEffect(() => {
    if (!backendImageTasks.some((task) => task.status === "running")) return;
    const timer = window.setInterval(() => {
      void refreshBackendStatus();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [backendImageTasks]);

  function applyProject(project: StoryboardProject) {
    const normalizedProject = normalizeProject(project, fallbackOptions);
    const nextAnalysis = normalizedProject.analysis;
    setScript(normalizedProject.script);
    setGenreProfile(normalizedProject.options.genreProfile);
    setDirectorProfile(normalizedProject.options.directorProfile);
    setTargetShotSeconds(normalizedProject.options.targetShotSeconds);
    setAspectRatio(normalizedProject.options.aspectRatio);
    setContentType(normalizedProject.options.contentType);
    setAnalysis(nextAnalysis);
    setSelectedEpisodeId(nextAnalysis.episodes[0]?.episodeId ?? "EP01");
    setHasDraftChanges(false);
    appendLog("project", "info", `已切换到 ${normalizedProject.name}`, normalizedProject.folderName ?? toSafeFolderName(normalizedProject.name));
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
      const path = rootPathDraft.trim();
      if (!path) return;
      const state = await addBackendRoot(path);
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

  async function handlePickProjectRoot() {
    try {
      const picked = await pickBackendDirectory();
      if (!picked.rootPath) {
        appendLog("project-root", "info", "已取消选择根目录");
        return;
      }
      const state = await addBackendRoot(picked.rootPath);
      setProjectRoots(state.roots);
      const activeRoot = state.roots.find((root) => root.isActive) ?? null;
      setProjectRoot(activeRoot);
      if (activeRoot) await refreshProjectsFromRoot(activeRoot);
      showToast(`当前根目录：${activeRoot?.rootName ?? ""}`);
      appendLog("project-root", "success", "已选择项目根目录", activeRoot?.rootPath ?? "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "选择根目录失败。";
      appendLog("project-root", "error", "选择根目录失败", message);
    }
  }

  async function refreshProjectsFromRoot(root?: BackendRoot | null) {
    try {
      const rootState = await getBackendRoots();
      setProjectRoots(rootState.roots);
      const activeRoot = rootState.roots.find((item) => item.isActive) ?? root ?? null;
      setProjectRoot(activeRoot);
      if (!activeRoot) return;
      const { projects } = await listBackendProjects();
      const normalizedProjects = projects.map((project) => normalizeProject(project, fallbackOptions));
      if (!normalizedProjects.length) {
        setProjectStore({ activeProjectId: "", projects: [] });
        setScript("");
        setAnalysis(analyzeScript("", fallbackOptions));
        appendLog("project-root", "info", "根目录暂无项目", activeRoot.rootName);
        return;
      }
      setProjectStore({
        activeProjectId: normalizedProjects[0].projectId,
        projects: normalizedProjects,
      });
      await loadAndApplyProject(normalizedProjects[0], activeRoot);
      appendLog("project-root", "success", "项目列表已刷新", `${activeRoot.rootName} / ${normalizedProjects.length} 个项目。`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取项目根目录失败。";
      appendLog("project-root", "error", "读取项目根目录失败", message);
    }
  }

  async function handleSelectProjectRoot(root: BackendRoot) {
    try {
      const state = await activateBackendRoot(root.rootPath);
      setProjectRoots(state.roots);
      const activeRoot = state.roots.find((item) => item.isActive) ?? root;
      setProjectRoot(activeRoot);
      await refreshProjectsFromRoot(activeRoot);
      appendLog("project-root", "success", "已切换项目根目录", activeRoot.rootPath);
    } catch (error) {
      appendLog("project-root", "error", "切换根目录失败", error instanceof Error ? error.message : "未知错误");
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
        await initializeBackendRoots();
      }
      appendLog("project-root", "info", "根目录已从后端配置移除", `${root.rootPath} 的项目文件夹未删除。`);
    } catch (error) {
      appendLog("project-root", "error", "移除根目录失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function handleCreateProject() {
    const name = newProjectName.trim() || createDefaultProjectName(projectStore.projects.length);
    const project = normalizeProject((await createBackendProject(name, fallbackOptions)).project, fallbackOptions);
    setProjectStore((current) => ({
      activeProjectId: project.projectId,
      projects: [project, ...current.projects],
    }));
    applyProject(project);
    setNewProjectName("");
    setIsCreateProjectDialogOpen(false);
    await refreshProjectsFromRoot();
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
      void loadAssetReviewForProject(project.projectId);
      void loadStoryWorkflowForProject(project.projectId);
      return;
    }
    const loadedProject = normalizeProject((await loadBackendProject(project.projectId)).project, fallbackOptions);
    setProjectStore((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.projectId === loadedProject.projectId ? loadedProject : item)),
    }));
    applyProject(loadedProject);
    void loadAssetReviewForProject(loadedProject.projectId);
    void loadStoryWorkflowForProject(loadedProject.projectId);
  }

  async function loadStoryWorkflowForProject(projectId: string) {
    if (!projectId) {
      setStoryWorkflow(null);
      return;
    }
    try {
      const state = await loadStoryWorkflowState(projectId);
      setStoryWorkflow(state);
      appendLog("story-workflow", "info", "分镜阶段状态已读取", `${state.nodes.length} 个节点。`);
    } catch (error) {
      setStoryWorkflow(null);
      appendLog("story-workflow", "warning", "分镜阶段状态读取失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function loadAssetReviewForProject(projectId: string) {
    if (!projectId) {
      setAssetReviewBundle(emptyAssetReviewBundle);
      setIsAssetReviewDirty(false);
      return;
    }
    try {
      const bundle = normalizeAssetReviewBundle(await loadProjectAssetReview(projectId));
      setAssetReviewBundle(bundle);
      setIsAssetReviewDirty(false);
      appendLog("asset-review", "info", "资产审阅文件已读取", `${countAssetBundleRows(bundle)} 条记录/真源。`);
    } catch (error) {
      setAssetReviewBundle(emptyAssetReviewBundle);
      setIsAssetReviewDirty(false);
      appendLog("asset-review", "warning", "资产审阅文件未读取", error instanceof Error ? error.message : "未知错误");
    }
  }

  function handleSelectProject(projectId: string) {
    const project = projectStore.projects.find((item) => item.projectId === projectId);
    if (!project) return;
    setProjectStore((current) => ({ ...current, activeProjectId: projectId }));
    void loadAndApplyProject(project);
  }

  async function handleUpdateProjectCover(projectId: string, file: File) {
    const baseProject = projectStore.projects.find((project) => project.projectId === projectId);
    if (!baseProject) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const result = projectRoot
        ? await uploadBackendProjectCover(projectId, file.name, dataUrl)
        : { project: { ...baseProject, coverImage: dataUrl, updatedAt: new Date().toISOString() } };
      const nextProject: StoryboardProject = {
        ...baseProject,
        ...result.project,
        script: result.project.script || baseProject.script,
        analysis: result.project.analysis || baseProject.analysis,
        options: result.project.options || baseProject.options,
      };
      setProjectStore((current) => {
        const projects = current.projects.map((project) => (project.projectId === projectId ? nextProject : project));
        return { ...current, projects };
      });
      if (projectId === activeProject.projectId) {
        updateActiveProject((project) => (project.projectId === projectId ? nextProject : project));
      }
      appendLog("project-files", "success", "项目封面已保存", projectRoot ? `${nextProject.folderName || toSafeFolderName(nextProject.name)}/assets/project` : "当前未连接后端根目录，封面仅保存在本地状态。");
      showToast("项目封面已保存");
    } catch (error) {
      appendLog("project-files", "warning", "项目封面保存失败", error instanceof Error ? error.message : "未知错误");
      showToast("项目封面保存失败");
    }
  }

  function updateImageConfig(config: ImageGenerationConfig) {
    const normalized = normalizeImageConfig(config);
    void saveBackendImageSettings(normalized)
      .then((settings) => {
        const stored = normalizeImageConfig({ ...settings.image, apiKey: "" });
        setBackendImageHasApiKey(settings.image.hasApiKey);
        setImageConfig(stored);
        saveImageGenerationConfig(stored);
        appendLog("image-config", "success", "生图配置已保存到后端", `${settings.image.provider} / ${settings.image.model}`);
        void refreshBackendStatus();
      })
      .catch((error) => appendLog("image-config", "error", "生图配置保存失败", error instanceof Error ? error.message : "未知错误"));
  }

  function updateAssetReviewBundle(nextBundle: AssetReviewBundle) {
    setAssetReviewBundle(normalizeAssetReviewBundle(nextBundle));
    setIsAssetReviewDirty(true);
  }

  async function handleSaveAssetReview(nextBundle = assetReviewBundle) {
    if (!activeProject.projectId) return;
    try {
      const saved = normalizeAssetReviewBundle(await saveProjectAssetReview(activeProject.projectId, nextBundle));
      setAssetReviewBundle(saved);
      setIsAssetReviewDirty(false);
      appendLog("asset-review", "success", "资产审阅文件已保存", `${countAssetBundleRows(saved)} 条记录/真源。`);
      showToast("资产审阅已保存");
    } catch (error) {
      appendLog("asset-review", "error", "资产审阅保存失败", error instanceof Error ? error.message : "未知错误");
      showToast("资产审阅保存失败");
    }
  }

  async function handleExtractAssetRecords(kind: AssetKind) {
    if (!activeProject.projectId || runningAssetExtractKinds.includes(kind)) return;
    setRunningAssetExtractKinds((current) => current.includes(kind) ? current : [...current, kind]);
    appendLog("asset-review", "info", `开始提取${assetKindLabel(kind)}记录`, `读取当前项目全集剧本，写入 records/${kind}_extract.json。`);
    try {
      const bundle = normalizeAssetReviewBundle(await extractProjectAssetRecords(activeProject.projectId, kind));
      setAssetReviewBundle((current) => {
        const normalizedCurrent = normalizeAssetReviewBundle(current);
        return normalizeAssetReviewBundle({
          records: {
            ...normalizedCurrent.records,
            [kind]: bundle.records[kind],
          },
          trueSources: {
            ...normalizedCurrent.trueSources,
            [kind]: bundle.trueSources[kind],
          },
        });
      });
      void refreshBackendStatus();
      appendLog("asset-review", "success", `${assetKindLabel(kind)}记录提取完成`, `${bundle.records[kind].length} 条${assetKindLabel(kind)}记录。`);
      showToast(`${assetKindLabel(kind)}记录和初始资产已保存`);
    } catch (error) {
      appendLog("asset-review", "error", `${assetKindLabel(kind)}记录提取失败`, error instanceof Error ? error.message : "未知错误");
      showToast(`${assetKindLabel(kind)}记录提取失败`);
    } finally {
      setRunningAssetExtractKinds((current) => current.filter((item) => item !== kind));
    }
  }

  async function handleExtractChapterAssets() {
    if (!activeProject.projectId || runningAssetExtractKinds.includes("chapters")) return;
    const projectId = activeProject.projectId;
    setRunningAssetExtractKinds((current) => current.includes("chapters") ? current : [...current, "chapters"]);
    appendLog("asset-review", "info", "开始按章节提取资产", "按剧情结构图章节顺序执行，写入 records 与 true_sources。");
    try {
      await extractProjectChapterAssets(projectId);
      const bundle = normalizeAssetReviewBundle(await loadProjectAssetReview(projectId));
      if (projectId !== activeProject.projectId) return;
      setAssetReviewBundle(bundle);
      setIsAssetReviewDirty(false);
      void refreshBackendStatus();
      appendLog("asset-review", "success", "按章节提取资产完成", `${countAssetBundleRows(bundle)} 条记录/真源。`);
      showToast("按章节资产提取完成");
    } catch (error) {
      appendLog("asset-review", "error", "按章节提取资产失败", error instanceof Error ? error.message : "未知错误");
      showToast("按章节资产提取失败");
    } finally {
      setRunningAssetExtractKinds((current) => current.filter((item) => item !== "chapters"));
    }
  }

  async function handleRunStoryWorkflowNode(nodeId: StoryWorkflowNodeId, options: StoryWorkflowRunOptions = {}) {
    if (!activeProject.projectId || runningStoryNodeId || runningStoryBatchLabel) return null;
    const nodeTitle = storyWorkflow?.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;
    setRunningStoryNodeId(nodeId);
    appendLog("story-workflow", "info", `开始执行 ${nodeTitle}`, options.chapterId ? `当前章节：${options.chapterId}` : "后端将读取项目剧本、规则包 Prompt 和已存在节点产物。");
    try {
      const result = await runStoryWorkflowNode(activeProject.projectId, {
        nodeId,
        episodeId: options.episodeId || selectedEpisodeId,
        sceneId: options.sceneId || selectedWorkflowSceneId,
        chapterId: options.chapterId,
        blockId: options.blockId,
        blockStart: options.blockStart,
        blockEnd: options.blockEnd,
        executionMode: options.executionMode,
      });
      setStoryWorkflow((current) => {
        if (!current) return current;
        if (nodeId === "chapter_summary") return current;
        return {
          ...current,
          artifacts: {
            ...current.artifacts,
            [nodeId]: result.artifact,
          },
        };
      });
      void refreshBackendStatus();
      void loadStoryWorkflowForProject(activeProject.projectId);
      if (result.artifact.status === "error") {
        appendLog("story-workflow", "error", `${nodeTitle} 执行失败`, result.artifact.error || "节点返回错误状态。");
        showToast(`${nodeTitle} 执行失败`);
        return result.artifact;
      }
      appendLog("story-workflow", "success", `${nodeTitle} 执行完成`, workflowArtifactWriteMessage(nodeId, options.episodeId || selectedEpisodeId, options.sceneId || selectedWorkflowSceneId, options.chapterId));
      showToast(`${nodeTitle} 执行完成`);
      return result.artifact;
    } catch (error) {
      appendLog("story-workflow", "error", `${nodeTitle} 执行失败`, error instanceof Error ? error.message : "未知错误");
      showToast(`${nodeTitle} 执行失败`);
      void loadStoryWorkflowForProject(activeProject.projectId);
      void refreshBackendStatus();
      return null;
    } finally {
      setRunningStoryNodeId("");
    }
  }

  async function handleRunStoryWorkflowNodes(nodeIds: StoryWorkflowNodeId[], label: string, options: StoryWorkflowRunOptions = {}) {
    if (!activeProject.projectId || runningStoryNodeId || runningStoryBatchLabel) return;
    setRunningStoryBatchLabel(label);
    const nodeTitles = nodeIds.map((nodeId) => storyWorkflow?.nodes.find((node) => node.id === nodeId)?.title ?? nodeId);
    appendLog("story-workflow", "info", `开始执行 ${label}`, nodeTitles.join(" -> "));
    try {
      const result = await runStoryWorkflowAll(activeProject.projectId, {
        nodeId: nodeIds[0],
        nodeIds,
        episodeId: options.episodeId || selectedEpisodeId,
        sceneId: options.sceneId || selectedWorkflowSceneId,
        chapterId: options.chapterId,
        chapterIds: options.chapterIds,
        blockId: options.blockId,
        blockStart: options.blockStart,
        blockEnd: options.blockEnd,
        executionMode: options.executionMode,
      });
      setStoryWorkflow((current) => {
        if (!current) return current;
        const nextArtifacts = { ...current.artifacts };
        for (const artifact of result.artifacts) {
          if (artifact.nodeId !== "chapter_summary") nextArtifacts[artifact.nodeId] = artifact;
        }
        return { ...current, artifacts: nextArtifacts };
      });
      void refreshBackendStatus();
      void loadStoryWorkflowForProject(activeProject.projectId);
      appendLog("story-workflow", "success", `${label} 执行完成`, `${result.artifacts.length} 个节点已写入 artifacts/story_workflow；分镜/视频节点按当前集场隔离保存。`);
      showToast(`${label} 执行完成`);
    } catch (error) {
      appendLog("story-workflow", "error", `${label} 执行失败`, error instanceof Error ? error.message : "未知错误");
      showToast(`${label} 执行失败`);
      void loadStoryWorkflowForProject(activeProject.projectId);
      void refreshBackendStatus();
    } finally {
      setRunningStoryBatchLabel("");
    }
  }

  async function handleRunStoryWorkflowEpisodeScenes(nodeIds: StoryWorkflowNodeId[], sceneIds: string[], options: StoryWorkflowRunOptions = {}) {
    const uniqueSceneIds = sceneIds.filter((sceneId, index) => sceneId && sceneIds.indexOf(sceneId) === index);
    if (!activeProject.projectId || runningStoryNodeId || runningStoryBatchLabel || !uniqueSceneIds.length) return;
    const episodeId = options.episodeId || selectedEpisodeId;
    setRunningStoryBatchLabel("本集全部场次");
    appendLog("story-workflow", "info", "开始执行本集全部场次", `${episodeId}：${uniqueSceneIds.join(" -> ")}`);
    try {
      let artifactCount = 0;
      for (const sceneId of uniqueSceneIds) {
        const result = await runStoryWorkflowAll(activeProject.projectId, {
          nodeId: nodeIds[0],
          nodeIds,
          episodeId,
          sceneId,
          executionMode: options.executionMode,
        });
        artifactCount += result.artifacts.length;
        setStoryWorkflow((current) => {
          if (!current) return current;
          const nextArtifacts = { ...current.artifacts };
          for (const artifact of result.artifacts) {
            if (artifact.nodeId !== "chapter_summary") nextArtifacts[artifact.nodeId] = artifact;
          }
          return { ...current, artifacts: nextArtifacts };
        });
      }
      void refreshBackendStatus();
      void loadStoryWorkflowForProject(activeProject.projectId);
      appendLog("story-workflow", "success", "本集全部场次执行完成", `${uniqueSceneIds.length} 个场次，${artifactCount} 个节点产物已按集场保存。`);
      showToast("本集全部场次执行完成");
    } catch (error) {
      appendLog("story-workflow", "error", "本集全部场次执行失败", error instanceof Error ? error.message : "未知错误");
      showToast("本集全部场次执行失败");
      void loadStoryWorkflowForProject(activeProject.projectId);
      void refreshBackendStatus();
    } finally {
      setRunningStoryBatchLabel("");
    }
  }

  async function handleFilesUpload(files: FileList | null) {
    if (!files?.length) return;
    const texts = await Promise.all(Array.from(files).map(async (file) => ({ name: file.name, text: await file.text() })));
    const merged = texts.map((item, index) => ensureEpisodeHeading(item.text, index + 1)).filter(Boolean).join("\n\n");
    applyScriptToProject(merged, false, "分集剧本已导入");
    appendLog("input", "info", "分集剧本已导入", `${texts.length} 个文件，${merged.length.toLocaleString()} 字。`);
  }

  async function handleEpisodeFileUpload(file: File | undefined, mode: "append" | "replace", episodeNumber: number) {
    if (!file) return;
    const text = await file.text();
    const episodeNumberSafe = Math.max(1, Math.floor(episodeNumber || 1));
    const currentPreview = splitScriptIntoEpisodes(script, episodeSplitRules);
    const nextEpisodeText = ensureEpisodeHeading(text, mode === "append" ? currentPreview.episodes.length + 1 : episodeNumberSafe);
    if (mode === "append") {
      applyScriptToProject([script.trim(), nextEpisodeText].filter(Boolean).join("\n\n"), false, "单集已追加");
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
    applyScriptToProject(nextEpisodes.map((episode) => episode.text.trim()).filter(Boolean).join("\n\n"), false, "单集已替换");
    appendLog("input", "info", "单集已替换", `${file.name} -> 第 ${episodeNumberSafe} 集。`);
  }

  function updateScript(value: string) {
    const nextAnalysis = analyzeScript(value, options);
    setScript(value);
    setAnalysis(nextAnalysis);
    setHasDraftChanges(true);
  }

  function applyScriptToProject(nextScript: string, shouldPersist: boolean, message: string) {
    const nextAnalysis = analyzeScript(nextScript, options);
    setScript(nextScript);
    setAnalysis(nextAnalysis);
    setSelectedEpisodeId(nextAnalysis.episodes[0]?.episodeId ?? "EP01");
    updateActiveProject((project) =>
      updateProjectSnapshot(project, {
        projectId: project.projectId,
        name: project.name,
        script: nextScript,
        options,
        analysis: nextAnalysis,
      }),
    );
    setHasDraftChanges(!shouldPersist);
    appendLog("input", shouldPersist ? "success" : "info", message, `${nextAnalysis.episodes.length} 集 / ${nextScript.length.toLocaleString()} 字。`);
    if (shouldPersist && projectRoot) {
      const savedProject = updateProjectSnapshot(activeProject, {
        projectId: activeProject.projectId,
        name: activeProject.name,
        script: nextScript,
        options,
        analysis: nextAnalysis,
      });
      void saveBackendProject({ ...savedProject, rootName: projectRoot.rootName }).then(
        () => appendLog("project-files", "success", "分集剧本已写入后端项目文件夹", `${projectRoot.rootName}/${savedProject.folderName || toSafeFolderName(savedProject.name)}/input/episodes`),
        (error) => appendLog("project-files", "warning", "分集剧本写入后端失败", error instanceof Error ? error.message : "未知错误"),
      );
    }
  }

  function saveCurrentScriptToProject(nextScript: string, message: string) {
    const sourceScript = nextScript.trim() || currentScriptText;
    if (!sourceScript.trim()) {
      appendLog("input", "error", "剧本为空，未保存", "当前项目没有可写入的分集正文。");
      showToast("剧本为空，未保存");
      return;
    }
    applyScriptToProject(sourceScript, true, message);
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

  function updateEpisodeSplitRules(rules: EpisodeSplitRule[]) {
    setEpisodeSplitRules(rules);
    saveEpisodeSplitRules(rules);
    appendLog("script-check", "info", "分集规则已更新", `${rules.filter((rule) => rule.enabled).length} 条启用。`);
  }

  function handleRunScriptCheck() {
    appendLog(
      "script-check",
      scriptQuality.issues.some((issue) => issue.level === "错误") ? "error" : scriptQuality.issues.length ? "warning" : "success",
      "剧本校检已执行",
      `${scriptQuality.stats.lines} 行 / ${scriptQuality.stats.characters.toLocaleString()} 字 / ${scriptQuality.issues.length} 个问题。`,
    );
    showToast(`校检完成：${scriptQuality.issues.length} 个问题`);
  }

  function appendLog(source: string, level: DevLogLevel, message: string, detail?: string) {
    setDevLogs((current) => [createDevLog(source, level, message, detail), ...current].slice(0, 80));
  }

  async function refreshBackendStatus() {
    try {
      const [health, settings, rulepacks, promptLibraryResult, imageProviders, logs, imageLogs, imageTasks] = await Promise.all([
        getBackendHealth(),
        getBackendSettings(),
        listBackendRulepacks(),
        loadBackendPromptLibrary(),
        listBackendImageProviders(),
        listBackendLlmLogs(80),
        listBackendImageLogs(120),
        listBackendImageTasks(120),
      ]);
      setBackendHealth(health);
      setGeneralConfig(settings.general);
      setBackendRulepacks(rulepacks.rulepacks);
      setBackendPromptLibrary(promptLibraryResult);
      setBackendImageProviders(imageProviders.providers);
      setBackendLlmLogs(logs.logs);
      setBackendImageLogs(imageLogs.logs);
      setBackendImageTasks(imageTasks.tasks);
      setBackendLlmHasApiKey(settings.llm.hasApiKey);
      setBackendImageHasApiKey(settings.image.hasApiKey);
      setLlmConfig((current) =>
        normalizeLlmConfig({
          ...current,
          provider: settings.llm.provider === "deepseek" ? "deepseek" : "openai-compatible",
          model: settings.llm.model,
          baseUrl: settings.llm.baseUrl,
          hasApiKey: settings.llm.hasApiKey,
          temperature: settings.llm.temperature,
          jsonMode: settings.llm.jsonMode,
          apiKey: current.apiKey,
        }),
      );
      const storedImageConfig = normalizeImageConfig({ ...settings.image, apiKey: "" });
      setImageConfig(storedImageConfig);
      saveImageGenerationConfig(storedImageConfig);
    } catch (error) {
      appendLog("backend", "error", "后端状态读取失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  function updateLlmConfig(config: LlmExecutorConfig) {
    const normalized = normalizeLlmConfig(config);
    void saveBackendLlmSettings(normalized)
      .then((settings) => {
        const stored = normalizeLlmConfig({ ...settings.llm, mode: "openai-compatible", apiKey: "" });
        setBackendLlmHasApiKey(settings.llm.hasApiKey);
        setLlmConfig(stored);
        saveLlmExecutorConfig(stored);
        appendLog("llm-config", "success", "LLM 配置已保存到后端", `${settings.llm.provider} / ${settings.llm.model}`);
        void refreshBackendStatus();
      })
      .catch((error) => appendLog("llm-config", "error", "LLM 配置保存到后端失败", error instanceof Error ? error.message : "未知错误"));
  }

  function updateGeneralConfig(config: BackendSettings["general"]) {
    void saveBackendGeneralSettings(config)
      .then((settings) => {
        setGeneralConfig(settings.general);
        appendLog("general-config", "success", "基本配置已保存", `生图并发数：${settings.general.imageConcurrency}`);
        void refreshBackendStatus();
      })
      .catch((error) => appendLog("general-config", "error", "基本配置保存失败", error instanceof Error ? error.message : "未知错误"));
  }

  async function handleCreateBackendPromptVersion(input: { promptId: string; sourceVersionId?: string; name?: string; description?: string; content?: string }) {
    try {
      const result = await createBackendPromptVersion(input);
      setBackendPromptLibrary(result.library);
      appendLog("prompt-library", "success", "提示词版本已新建", result.version.name);
      void refreshBackendStatus();
    } catch (error) {
      appendLog("prompt-library", "error", "新建提示词版本失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function handleUpdateBackendPromptVersion(versionId: string, input: { name?: string; description?: string; content?: string }) {
    try {
      const result = await updateBackendPromptVersion(versionId, input);
      setBackendPromptLibrary(result.library);
      appendLog("prompt-library", "success", "提示词版本已保存", result.version.name);
      void refreshBackendStatus();
    } catch (error) {
      appendLog("prompt-library", "error", "保存提示词版本失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function handleDeleteBackendPromptVersion(versionId: string) {
    try {
      const result = await deleteBackendPromptVersion(versionId);
      setBackendPromptLibrary(result.library);
      appendLog("prompt-library", "warning", "提示词版本已删除", versionId);
      void refreshBackendStatus();
    } catch (error) {
      appendLog("prompt-library", "error", "删除提示词版本失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function handleActivateBackendPromptVersion(promptId: string, versionId: string) {
    try {
      const result = await activateBackendPromptVersion(promptId, versionId);
      setBackendPromptLibrary(result.library);
      appendLog("prompt-library", "success", "当前提示词版本已启用", result.version.name);
      void refreshBackendStatus();
    } catch (error) {
      appendLog("prompt-library", "error", "启用提示词版本失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function clearBackendLogs() {
    try {
      await clearBackendLlmLogs();
      setBackendLlmLogs([]);
      appendLog("backend-log", "info", "后端 LLM 日志已清空");
    } catch (error) {
      appendLog("backend-log", "error", "清空后端 LLM 日志失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function clearBackendTaskLogs() {
    try {
      await Promise.all([clearBackendLlmLogs(), clearBackendImageLogs()]);
      setBackendLlmLogs([]);
      setBackendImageLogs([]);
      setBackendImageTasks([]);
      setBackendLlmLogDetail(null);
      setBackendImageLogDetail(null);
      appendLog("backend-log", "info", "任务记录已清空");
    } catch (error) {
      appendLog("backend-log", "error", "清空任务记录失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function inspectBackendLlmLog(logId: string) {
    try {
      const detail = await getBackendLlmLog(logId);
      setBackendLlmLogDetail(detail.log);
    } catch (error) {
      appendLog("backend-log", "error", "读取 LLM 日志详情失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  async function inspectBackendImageLog(logId: string) {
    try {
      const detail = await getBackendImageLog(logId);
      setBackendImageLogDetail(detail.log);
      setBackendLlmLogDetail(null);
    } catch (error) {
      appendLog("backend-log", "error", "读取图片任务详情失败", error instanceof Error ? error.message : "未知错误");
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }

  return (
    <main className="app-shell" data-theme={themeMode === "dark" ? "dark" : "light"}>
      <TopBar
        project={activeProject}
        metrics={topMetrics}
        hasDraftChanges={hasDraftChanges}
        lastGeneratedAt={lastGeneratedAt}
        runningTasks={runningTopTasks}
        themeMode={themeMode === "dark" ? "dark" : "light"}
        onToggleTheme={() => setThemeMode(themeMode === "dark" ? "light" : "dark")}
        onOpenTools={() => setIsToolDrawerOpen(true)}
      />
      <section className={`workspace ${isCollapsed ? "nav-collapsed" : ""}`}>
        <aside className="left-pane">
          <AppNav
            activePage={activePage}
            isCollapsed={isCollapsed}
            setActivePage={setActivePage}
            onToggleCollapse={() => setIsNavCollapsed(isCollapsed ? "false" : "true")}
            onToggleLogs={() => setIsLogCollapsed(isLogCollapsed === "true" ? "false" : "true")}
            logIssueCount={devLogIssueCount}
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
              assetReviewBundle={assetReviewBundle}
              options={options}
              onPickRoot={() => void handlePickProjectRoot()}
              onOpenManualRoot={() => setIsRootDialogOpen(true)}
              onSelectRoot={(root) => void handleSelectProjectRoot(root)}
              onRequestRemoveRoot={setRootPendingRemove}
              onRefreshRoot={() => void refreshProjectsFromRoot()}
              onOpenCreateProject={() => {
                setNewProjectName("");
                setIsCreateProjectDialogOpen(true);
              }}
              onSelectProject={handleSelectProject}
              onRequestDeleteProject={setProjectPendingDelete}
              onUpdateProjectCover={handleUpdateProjectCover}
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
              projectId={activeProject.projectId}
              script={script}
              report={scriptQuality}
              analysis={analysis}
              onScriptChange={updateScript}
              onEpisodeFileUpload={handleEpisodeFileUpload}
              onBatchEpisodeUpload={handleFilesUpload}
              onRunScriptCheck={handleRunScriptCheck}
              rules={scriptQualityRules}
              episodeSplitRules={episodeSplitRules}
              onOpenRuleConfig={() => setIsScriptRuleDialogOpen(true)}
              onEpisodeSplitRulesChange={updateEpisodeSplitRules}
              onConfirmSplitScript={(nextScript) => {
                applyScriptToProject(nextScript, true, "合集分集已确认并保存");
                showToast("分集已确认并保存");
              }}
              onSaveManualScript={() => {
                saveCurrentScriptToProject(script, "人工编辑稿已保存");
                showToast("人工编辑稿已保存");
              }}
              onApplyCleanedScript={() => {
                saveCurrentScriptToProject(scriptQuality.cleanedScript, "规则清洗稿已应用并保存");
                showToast("规则清洗稿已应用并保存");
              }}
            />
          )}
          {activePage === "assets" && (
            <AssetReviewView
              projectId={activeProject.projectId}
              bundle={assetReviewBundle}
              isDirty={isAssetReviewDirty}
              runningExtractKinds={runningAssetExtractKinds}
              onChange={updateAssetReviewBundle}
              onSave={(bundle) => void handleSaveAssetReview(bundle)}
              onExtractRecords={(kind) => void handleExtractAssetRecords(kind)}
              onExtractChapterAssets={() => void handleExtractChapterAssets()}
              onImageEvent={(level, message, detail) => {
                appendLog("asset-image", level, message, detail);
                showToast(message);
                void refreshBackendStatus();
              }}
              onTaskRefresh={() => void refreshBackendStatus()}
            />
          )}
          {activePage === "planning" && (
            <StoryPlanningView
              projectId={activeProject.projectId}
              state={storyWorkflow}
              runningNodeId={runningStoryNodeId}
              runningBatchLabel={runningStoryBatchLabel}
              onRunNode={handleRunStoryWorkflowNode}
              onRunNodes={(nodeIds, options) => void handleRunStoryWorkflowNodes(nodeIds, "剧本统筹", options)}
              onRefresh={() => void loadStoryWorkflowForProject(activeProject.projectId)}
            />
          )}
          {activePage === "storyboard" && (
            <StoryboardPlanningView
              projectId={activeProject.projectId}
              state={storyWorkflow}
              episodes={analysis.episodes}
              selectedEpisodeId={selectedEpisodeId}
              onSelectEpisode={setSelectedEpisodeId}
              selectedSceneId={selectedWorkflowSceneId}
              onSelectScene={setSelectedWorkflowSceneId}
              executionMode={storyboardExecutionMode}
              onExecutionModeChange={setStoryboardExecutionMode}
              runningNodeId={runningStoryNodeId}
              runningBatchLabel={runningStoryBatchLabel}
              onRunNode={handleRunStoryWorkflowNode}
              onRunNodes={(nodeIds, options) => void handleRunStoryWorkflowNodes(nodeIds, "分镜统筹", options)}
              onRunEpisodeScenes={(nodeIds, sceneIds, options) => void handleRunStoryWorkflowEpisodeScenes(nodeIds, sceneIds, options)}
              onRefresh={() => void loadStoryWorkflowForProject(activeProject.projectId)}
            />
          )}
          {activePage === "video" && (
            <VideoGenerationView
              projectId={activeProject.projectId}
              state={storyWorkflow}
              assetReviewBundle={assetReviewBundle}
              selectedEpisodeId={selectedEpisodeId}
              onSelectEpisode={setSelectedEpisodeId}
              selectedSceneId={selectedWorkflowSceneId}
              onSelectScene={setSelectedWorkflowSceneId}
              runningNodeId={runningStoryNodeId}
              runningBatchLabel={runningStoryBatchLabel}
              onRunNode={handleRunStoryWorkflowNode}
              onRefresh={() => void loadStoryWorkflowForProject(activeProject.projectId)}
            />
          )}
          {activePage === "tasks" && (
            <TaskRecordView
              llmLogs={backendLlmLogs}
              imageLogs={backendImageLogs}
              imageTasks={backendImageTasks}
              llmDetail={backendLlmLogDetail}
              imageDetail={backendImageLogDetail}
              onRefresh={() => void refreshBackendStatus()}
              onInspectLlmLog={(logId) => void inspectBackendLlmLog(logId)}
              onInspectImageLog={(logId) => void inspectBackendImageLog(logId)}
              onClearAll={() => void clearBackendTaskLogs()}
            />
          )}
          {activePage === "pipeline" && (
            <PipelineConfigView
              llmConfig={llmConfig}
              backendHealth={backendHealth}
              backendPromptLibrary={backendPromptLibrary}
              backendLlmLogs={backendLlmLogs}
              backendLlmLogDetail={backendLlmLogDetail}
              backendLlmHasApiKey={backendLlmHasApiKey}
              generalConfig={generalConfig}
              imageConfig={imageConfig}
              imageProviders={backendImageProviders}
              backendImageHasApiKey={backendImageHasApiKey}
              onRefreshBackendStatus={() => void refreshBackendStatus()}
              onClearBackendLogs={() => void clearBackendLogs()}
              onInspectBackendLlmLog={(logId) => void inspectBackendLlmLog(logId)}
              onCloseBackendLlmLog={() => setBackendLlmLogDetail(null)}
              onGeneralConfigChange={updateGeneralConfig}
              onLlmConfigChange={updateLlmConfig}
              onImageConfigChange={updateImageConfig}
              onCreatePromptVersion={(input) => void handleCreateBackendPromptVersion(input)}
              onUpdatePromptVersion={(versionId, input) => void handleUpdateBackendPromptVersion(versionId, input)}
              onDeletePromptVersion={(versionId) => void handleDeleteBackendPromptVersion(versionId)}
              onActivatePromptVersion={(promptId, versionId) => void handleActivateBackendPromptVersion(promptId, versionId)}
            />
          )}
        </section>
      </section>
      {isToolDrawerOpen && (
        <ToolDrawer
          imageConfig={imageConfig}
          imageProviders={backendImageProviders}
          backendHasApiKey={backendImageHasApiKey}
          onClose={() => setIsToolDrawerOpen(false)}
          onRefresh={() => void refreshBackendStatus()}
          onImageConfigChange={updateImageConfig}
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
          episodeSplitRules={episodeSplitRules}
          onChange={updateScriptQualityRules}
          onEpisodeSplitRulesChange={updateEpisodeSplitRules}
          onClose={() => setIsScriptRuleDialogOpen(false)}
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
      {isLogCollapsed !== "true" && (
        <DevLogPanel
          logs={devLogs}
          onToggle={() => setIsLogCollapsed("true")}
          onClear={() => setDevLogs([createDevLog("pipeline", "info", "日志已清空")])}
        />
      )}
    </main>
  );
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

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("文件读取失败"));
    reader.readAsDataURL(file);
  });
}

function workflowArtifactWriteMessage(nodeId: StoryWorkflowNodeId, episodeId: string, sceneId: string, chapterId?: string) {
  if (nodeId === "chapter_summary") return `章节概要已写入 ${chapterId || "当前章节"} 对应的 chapter_summary_xx.json。`;
  if (nodeId === "episode_summary") return `单集概要已写入 artifacts/story_workflow/episode_summary/${episodeId || "EP01"}.json。`;
  if (nodeId === "scene_summary" || nodeId === "storyboard_design" || nodeId === "video_prompt") {
    return `${nodeId} 已写入 artifacts/story_workflow/${nodeId}/${episodeId || "EP01"}_${sceneId || "SC01"}.json。`;
  }
  return `${nodeId} 已写入 artifacts/story_workflow/${nodeId}.json。`;
}

export default App;

const rootElement = document.getElementById("root")!;
const globalRootKey = "__scriptStoryboardRoot";
const root = ((window as unknown as Record<string, Root | undefined>)[globalRootKey] ??= createRoot(rootElement));

root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
