import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
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
  Menu,
  Package,
  PanelRightOpen,
  Plus,
  Play,
  RefreshCcw,
  Save,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Moon,
  Sun,
  Terminal,
  Upload,
  X,
} from "lucide-react";
import {
  deleteProjectAssetCandidateImage,
  emptyAssetReviewBundle,
  extractProjectAssetRecords,
  generateProjectAssetImage,
  loadProjectAssetReview,
  normalizeAssetReviewBundle,
  saveProjectAssetReview,
  selectProjectAssetImage,
  toBackendAssetImageUrl,
  uploadProjectAssetImage,
  type AssetKind,
  type AssetReviewBundle,
  type AssetTrueSourceItem,
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
  type BackendRoot,
} from "./lib/projectApi";
import {
  backendApiBaseUrl,
} from "./lib/backendApi";
import {
  loadStoryWorkflowArtifact,
  loadStoryWorkflowState,
  runStoryWorkflowAll,
  runStoryWorkflowNode,
  saveStoryWorkflowArtifact,
  type StoryWorkflowArtifact,
  type StoryWorkflowNode,
  type StoryWorkflowNodeId,
  type StoryWorkflowState,
} from "./lib/storyWorkflowApi";
import {
  clearBackendLlmLogs,
  clearBackendImageLogs,
  getBackendLlmApiKey,
  getBackendImageApiKey,
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
  loadBackendPrompt,
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
  type BackendPromptTemplateGroup,
  type BackendPromptVersion,
} from "./lib/backendStatusApi";
import {
  createProject,
  createDefaultProjectName,
  normalizeProjectAnalysis,
  toSafeFolderName,
  updateProjectSnapshot,
} from "./lib/projectStore";
import type { ProjectStoreState, StoryboardProject } from "./lib/projectStore";
import { buildScriptQualityReport, defaultScriptQualityRules, loadScriptQualityRules, saveScriptQualityRules } from "./lib/scriptQuality";
import type { ScriptQualityRule } from "./lib/scriptQuality";
import { analyzeScript, formatJson } from "./lib/storyboard";
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
  const [isScriptRuleDialogOpen, setIsScriptRuleDialogOpen] = useState(false);
  const [episodeSplitDraft, setEpisodeSplitDraft] = useState<EpisodeSplitDraft | null>(null);
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
  const [runningAssetExtractKinds, setRunningAssetExtractKinds] = useState<AssetKind[]>([]);
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
  const scriptQuality = useMemo(() => buildScriptQualityReport(script), [script]);
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
  const [selectedBackendPromptContent, setSelectedBackendPromptContent] = useState("");
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
    const nextAnalysis = normalizeProjectAnalysis(project.script, project.analysis, project.options);
    setScript(project.script);
    setGenreProfile(project.options.genreProfile);
    setDirectorProfile(project.options.directorProfile);
    setTargetShotSeconds(project.options.targetShotSeconds);
    setAspectRatio(project.options.aspectRatio);
    setContentType(project.options.contentType);
    setAnalysis(nextAnalysis);
    setSelectedEpisodeId(nextAnalysis.episodes[0]?.episodeId ?? "EP01");
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
      if (!projects.length) {
        setProjectStore({ activeProjectId: "", projects: [] });
        setScript("");
        setAnalysis(analyzeScript("", fallbackOptions));
        appendLog("project-root", "info", "根目录暂无项目", activeRoot.rootName);
        return;
      }
      setProjectStore({
        activeProjectId: projects[0].projectId,
        projects,
      });
      await loadAndApplyProject(projects[0], activeRoot);
      appendLog("project-root", "success", "项目列表已刷新", `${activeRoot.rootName} / ${projects.length} 个项目。`);
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
    const project = (await createBackendProject(name, fallbackOptions)).project;
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
    const loadedProject = (await loadBackendProject(project.projectId)).project;
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

  async function handleRunStoryWorkflowNode(nodeId: StoryWorkflowNodeId, options: StoryWorkflowRunOptions = {}) {
    if (!activeProject.projectId || runningStoryNodeId || runningStoryBatchLabel) return null;
    const nodeTitle = storyWorkflow?.nodes.find((node) => node.id === nodeId)?.title ?? nodeId;
    setRunningStoryNodeId(nodeId);
    appendLog("story-workflow", "info", `开始执行 ${nodeTitle}`, options.chapterId ? `当前章节：${options.chapterId}` : "后端将读取项目剧本、规则包 Prompt 和已存在节点产物。");
    try {
      const result = await runStoryWorkflowNode(activeProject.projectId, {
        nodeId,
        episodeId: selectedEpisodeId,
        sceneId: selectedWorkflowSceneId,
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
      appendLog("story-workflow", "success", `${nodeTitle} 执行完成`, nodeId === "chapter_summary" ? `章节概要已写入 ${options.chapterId || "当前章节"} 对应的 chapter_summary_xx.json。` : `${result.artifact.title} 已写入 artifacts/story_workflow/${nodeId}.json。`);
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
        episodeId: selectedEpisodeId,
        sceneId: selectedWorkflowSceneId,
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
      appendLog("story-workflow", "success", `${label} 执行完成`, `${result.artifacts.length} 个节点已写入 artifacts/story_workflow。`);
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
    applyScriptToProject(merged, false, "分集剧本已导入");
    appendLog("input", "info", "分集剧本已导入", `${texts.length} 个文件，${merged.length.toLocaleString()} 字。`);
  }

  async function handleEpisodeFileUpload(file: File | undefined, mode: "append" | "replace", episodeNumber: number) {
    if (!file) return;
    const text = await file.text();
    const episodeNumberSafe = Math.max(1, Math.floor(episodeNumber || 1));
    const currentPreview = splitScriptIntoEpisodes(script, "");
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
    setScript(value);
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
    applyScriptToProject(nextScript, true, "合集分集已确认并保存");
    setEpisodeSplitDraft(null);
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

  async function inspectBackendPrompt(promptId: string) {
    try {
      const detail = await loadBackendPrompt(promptId);
      setSelectedBackendPromptContent(detail.content);
      appendLog("rulepack", "info", "已读取规则包 Prompt", detail.prompt.id);
    } catch (error) {
      appendLog("rulepack", "error", "读取规则包 Prompt 失败", error instanceof Error ? error.message : "未知错误");
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
              analysis={analysis}
              onScriptChange={updateScript}
              onFileUpload={handleFileUpload}
              onEpisodeFileUpload={handleEpisodeFileUpload}
              onBatchEpisodeUpload={handleFilesUpload}
              onRunScriptCheck={handleRunScriptCheck}
              rules={scriptQualityRules}
              onOpenRuleConfig={() => setIsScriptRuleDialogOpen(true)}
              onApplyCleanedScript={() => {
                saveCurrentScriptToProject(scriptQuality.cleanedScript, "校检稿已保存");
                showToast("校检稿已保存");
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
              onRunFullWorkflow={() => void handleRunStoryWorkflowNodes(["story_map", "character_summary", "continuity", "series_summary", "chapter_summary", "episode_summary", "scene_summary", "storyboard_design", "video_prompt"], "分镜全流程")}
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
              backendRulepacks={backendRulepacks}
              backendPromptLibrary={backendPromptLibrary}
              backendLlmLogs={backendLlmLogs}
              backendLlmLogDetail={backendLlmLogDetail}
              backendPromptContent={selectedBackendPromptContent}
              backendLlmHasApiKey={backendLlmHasApiKey}
              generalConfig={generalConfig}
              imageConfig={imageConfig}
              imageProviders={backendImageProviders}
              backendImageHasApiKey={backendImageHasApiKey}
              onRefreshBackendStatus={() => void refreshBackendStatus()}
              onInspectBackendPrompt={(promptId) => void inspectBackendPrompt(promptId)}
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
  metrics,
  hasDraftChanges,
  lastGeneratedAt,
  runningTasks,
  themeMode,
  onToggleTheme,
  onOpenTools,
}: {
  project: StoryboardProject;
  metrics: TopMetrics;
  hasDraftChanges: boolean;
  lastGeneratedAt: string;
  runningTasks: RunningTopTask[];
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  onOpenTools: () => void;
}) {
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
        <span>{metrics.chapterCount} 章节</span>
        <span>{metrics.episodeCount} 集</span>
        <span>{metrics.sceneCount} 场次</span>
        <span>{metrics.assetCount} 资产</span>
        <span>{metrics.videoBlockCount} 视频块</span>
      </div>
      <RunningTaskStrip tasks={runningTasks} />
      <StatusBar hasDraftChanges={hasDraftChanges} lastGeneratedAt={lastGeneratedAt} />
      <div className="top-actions">
        <button onClick={onToggleTheme} title={themeMode === "dark" ? "切换浅色模式" : "切换深色模式"}>
          {themeMode === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          {themeMode === "dark" ? "浅色" : "深色"}
        </button>
        <button onClick={onOpenTools}>
          <PanelRightOpen size={16} />
          工具
        </button>
      </div>
    </header>
  );
}

type RunningTopTask = {
  id: string;
  name: string;
  category: "llm" | "image" | "video";
};

type TopMetrics = {
  chapterCount: number;
  episodeCount: number;
  sceneCount: number;
  assetCount: number;
  videoBlockCount: number;
};

function buildTopMetrics(analysis: ScriptAnalysis, bundle: AssetReviewBundle, workflow: StoryWorkflowState | null): TopMetrics {
  const normalizedBundle = normalizeAssetReviewBundle(bundle);
  const storyboardOutput = workflow?.artifacts.storyboard_design?.output;
  const storyMapOutput = workflow?.artifacts.story_map?.output;
  const seriesSummaryOutput = workflow?.artifacts.series_summary?.output;
  const seriesBibleSummary = asRecord(seriesSummaryOutput?.series_bible_summary);
  const chapterCount = asArray(storyMapOutput?.chapter_map).length || asArray(seriesSummaryOutput?.chapter_map).length || asArray(seriesBibleSummary.chapter_map).length;
  return {
    chapterCount,
    episodeCount: analysis.episodes.length,
    sceneCount: (workflow?.episodes ?? []).reduce((sum, episode) => sum + episode.scenes.length, 0),
    assetCount:
      normalizedBundle.trueSources.characters.length +
      normalizedBundle.trueSources.scenes.length +
      normalizedBundle.trueSources.props.length,
    videoBlockCount: asArray(storyboardOutput?.video_blocks).length,
  };
}

function RunningTaskStrip({ tasks }: { tasks: RunningTopTask[] }) {
  if (!tasks.length) return <div className="running-task-strip" aria-label="当前没有运行任务" />;
  return (
    <div className="running-task-strip" aria-label="正在进行的任务">
      {tasks.slice(0, 3).map((task) => (
        <span key={task.id} className={`running-task-text ${task.category}`}>
          {task.name}
        </span>
      ))}
      {tasks.length > 3 && <span className="running-task-text more">+{tasks.length - 3}</span>}
    </div>
  );
}

function buildRunningTopTasks({
  runningAssetExtractKinds,
  runningStoryNodeId,
  runningStoryBatchLabel,
  imageTasks,
  llmLogs,
}: {
  runningAssetExtractKinds: AssetKind[];
  runningStoryNodeId: StoryWorkflowNodeId | "";
  runningStoryBatchLabel: string;
  imageTasks: BackendImageTask[];
  llmLogs: BackendLlmLog[];
}): RunningTopTask[] {
  const tasks: RunningTopTask[] = [];
  for (const kind of runningAssetExtractKinds) {
    tasks.push({
      id: `asset-extract-${kind}`,
      name: `LLM 提取${assetKindLabel(kind)}资产中`,
      category: "llm",
    });
  }
  if (runningStoryNodeId) {
    tasks.push({ id: `story-node-${runningStoryNodeId}`, name: `LLM ${runningStoryNodeId} 执行中`, category: "llm" });
  }
  if (runningStoryBatchLabel) {
    tasks.push({ id: `story-batch-${runningStoryBatchLabel}`, name: `LLM ${runningStoryBatchLabel} 执行中`, category: "llm" });
  }
  for (const log of llmLogs) {
    if (log.level === "info" && /开始|执行中|调用中|提取中|生成中/.test(`${log.message}${log.label ?? ""}`)) {
      tasks.push({
        id: `llm-${log.id}`,
        name: log.label || getBackendPromptTitle(log.stageId || "") || "LLM 任务进行中",
        category: "llm",
      });
    }
  }
  for (const task of imageTasks) {
    if (task.status !== "running") continue;
    tasks.push({
      id: task.taskId,
      name: [task.type || "生图任务", task.assetId || task.model || ""].filter(Boolean).join("："),
      category: "image",
    });
  }
  return dedupeRunningTopTasks(tasks);
}

function dedupeRunningTopTasks(tasks: RunningTopTask[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    const key = task.id || task.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
    { id: "planning", label: "剧本统筹", icon: <Layers3 size={18} /> },
    { id: "assets", label: "资产审阅", icon: <Package size={18} /> },
    { id: "storyboard", label: "分镜统筹", icon: <Scissors size={18} /> },
    { id: "video", label: "视频生成", icon: <Film size={18} /> },
    { id: "tasks", label: "任务记录", icon: <Terminal size={18} /> },
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
  onOpenManualRoot,
  onSelectRoot,
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
  onOpenManualRoot: () => void;
  onSelectRoot: (root: BackendRoot) => void;
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
          <button onClick={onOpenManualRoot}>
            <Edit3 size={16} />
            手动输入
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
            {projectRoots.map((root) => (
              <div key={root.rootName} className={root.rootName === projectRootName ? "project-root-item active" : "project-root-item"} onDoubleClick={() => onSelectRoot(root)} title="双击切换">
                <button onDoubleClick={() => onSelectRoot(root)}>{root.rootName}</button>
                {root.rootName !== "WORK" && (
                  <button className="icon-danger-button" onClick={() => onRequestRemoveRoot(root)} title="移除授权">
                    <X size={14} />
                  </button>
                )}
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
          <span>{shotCount} 自动解析镜头</span>
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
        <span>{episodeCount} 集 / {assetCount} 资产 / {shotCount} 自动解析镜头</span>
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
          <span>手动输入项目根目录</span>
        </div>
        <label>
          本地路径
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="/Users/你的名字/Projects/storyboard" autoFocus />
        </label>
        <p className="modal-copy">通常使用“选择根目录”即可；这里作为系统选择器不可用时的备用方式。</p>
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
  analysis,
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
  analysis: ScriptAnalysis;
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
  const [selectedScriptEpisodeId, setSelectedScriptEpisodeId] = useState(analysis.episodes[0]?.episodeId ?? "EP01");
  const selectedEpisode = analysis.episodes.find((episode) => episode.episodeId === selectedScriptEpisodeId) ?? analysis.episodes[0];
  const selectedReport = buildScriptQualityReport(selectedEpisode?.sourceText ?? "");

  useEffect(() => {
    if (!analysis.episodes.some((episode) => episode.episodeId === selectedScriptEpisodeId)) {
      setSelectedScriptEpisodeId(analysis.episodes[0]?.episodeId ?? "EP01");
    }
  }, [analysis.episodes, selectedScriptEpisodeId]);

  function updateSelectedEpisodeScript(value: string) {
    if (!selectedEpisode) return;
    onScriptChange(replaceEpisodeSourceText(analysis, selectedEpisode.episodeId, value));
  }

  return (
    <section className="page-stack">
      <div className="script-check-top panel">
        <div className="script-check-status">
          <div>
            <h2>剧本校检</h2>
            <p>边界：只提示基础格式和明显疑点，不重写剧情，不替代人工校对。</p>
          </div>
          <div className="script-check-metrics">
            <Metric icon={<FileText size={18} />} label="本集字数" value={selectedReport.stats.characters} />
            <Metric icon={<Layers3 size={18} />} label="总集数" value={analysis.episodes.length} />
            <Metric icon={<AlertTriangle size={18} />} label="本集疑点" value={selectedReport.issues.length} />
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
          <span>全本：{errorCount} 错误 / {warningCount} 警告</span>
          <span>当前：{selectedEpisode?.episodeId ?? "无"} / {selectedReport.issues.length} 疑点</span>
        </div>
      </div>

      <div className="script-review-grid">
        <EpisodeRail
          episodes={analysis.episodes}
          selectedEpisodeId={selectedEpisode?.episodeId ?? ""}
          onSelect={setSelectedScriptEpisodeId}
        />
        <section className="script-card panel">
          <div className="panel-title">
            <FileText size={18} />
            <span>原始剧本</span>
            <strong>{selectedEpisode?.episodeId ?? "无"} / {(selectedEpisode?.sourceText.length ?? 0).toLocaleString()} 字</strong>
          </div>
          <textarea
            value={selectedEpisode?.sourceText ?? ""}
            onChange={(event) => updateSelectedEpisodeScript(event.target.value)}
            spellCheck={false}
            placeholder="粘贴或导入剧本。"
          />
        </section>
        <ScriptQualityView report={selectedReport} episodeId={selectedEpisode?.episodeId ?? ""} />
      </div>
    </section>
  );
}

function EpisodeRail({
  episodes,
  selectedEpisodeId,
  onSelect,
}: {
  episodes: EpisodeResult[];
  selectedEpisodeId: string;
  onSelect: (episodeId: string) => void;
}) {
  return (
    <aside className="episode-rail panel" aria-label="分集导航">
      {episodes.map((episode) => (
        <button
          key={episode.episodeId}
          className={episode.episodeId === selectedEpisodeId ? "active" : ""}
          title={`${episode.title} / ${episode.characterCount.toLocaleString()} 字`}
          onClick={() => onSelect(episode.episodeId)}
        >
          {episode.episodeId}
        </button>
      ))}
      {!episodes.length && <div className="empty-state">暂无分集。</div>}
    </aside>
  );
}

function replaceEpisodeSourceText(analysis: ScriptAnalysis, episodeId: string, nextText: string) {
  return analysis.episodes
    .map((episode) => (episode.episodeId === episodeId ? nextText : episode.sourceText).trim())
    .filter(Boolean)
    .join("\n\n");
}

function serializeAnalysisScript(analysis: ScriptAnalysis) {
  return analysis.episodes
    .map((episode) => episode.sourceText.trim())
    .filter(Boolean)
    .join("\n\n");
}

function ToolDrawer({
  imageConfig,
  imageProviders,
  backendHasApiKey,
  onClose,
  onRefresh,
  onImageConfigChange,
}: {
  imageConfig: ImageGenerationConfig;
  imageProviders: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onImageConfigChange: (config: ImageGenerationConfig) => void;
}) {
  return (
    <div className="tool-overlay" role="dialog" aria-modal="true" aria-label="全局工具">
      <aside className="tool-drawer">
        <div className="drawer-header">
          <strong>工具</strong>
          <button onClick={onClose} aria-label="关闭工具面板">
            <X size={17} />
          </button>
        </div>
        <ImageConfigPanel
          config={imageConfig}
          providers={imageProviders}
          backendHasApiKey={backendHasApiKey}
          onRefresh={onRefresh}
          onChange={onImageConfigChange}
        />
      </aside>
    </div>
  );
}

function ScriptQualityView({ report, episodeId }: { report: ReturnType<typeof buildScriptQualityReport>; episodeId: string }) {
  const issueLines = new Set(report.issues.map((issue) => issue.line));
  const cleanedLines = report.cleanedScript.split("\n");

  return (
    <>
      <section className="script-card panel">
          <div className="panel-title">
            <CheckCircle2 size={18} />
            <span>校检剧本</span>
          <strong>{episodeId} / {report.cleanedScript.length.toLocaleString()} 字</strong>
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

function AssetReviewView({
  projectId,
  bundle,
  isDirty,
  runningExtractKinds,
  onChange,
  onSave,
  onExtractRecords,
  onImageEvent,
  onTaskRefresh,
}: {
  projectId: string;
  bundle: AssetReviewBundle;
  isDirty: boolean;
  runningExtractKinds: AssetKind[];
  onChange: (bundle: AssetReviewBundle) => void;
  onSave: (bundle: AssetReviewBundle) => void;
  onExtractRecords: (kind: AssetKind) => void;
  onImageEvent: (level: DevLogLevel, message: string, detail?: string) => void;
  onTaskRefresh: () => void;
}) {
  const [activeKind, setActiveKind] = useState<AssetKind>("characters");
  const [recordPreview, setRecordPreview] = useState<{ title: string; rows: Record<string, string>[] } | null>(null);
  const [isAssetImageZoomEnabled, setIsAssetImageZoomEnabled] = useLocalState("asset-image-zoom-enabled", "false");
  const normalizedBundle = normalizeAssetReviewBundle(bundle);
  const records = normalizedBundle.records[activeKind];
  const trueSources = normalizedBundle.trueSources[activeKind];
  const isCurrentKindExtracting = runningExtractKinds.includes(activeKind);
  const lockedCount = Object.values(normalizedBundle.trueSources).flat().filter((item) => item.status === "locked").length;
  const confirmedCount = Object.values(normalizedBundle.trueSources).flat().filter((item) => item.status === "confirmed").length;

  function updateTrueSources(rows: Record<string, string>[]) {
    onChange({
      ...normalizedBundle,
      trueSources: {
        ...normalizedBundle.trueSources,
        [activeKind]: rows,
      },
    });
  }

  function addAssetCard() {
    updateTrueSources([...trueSources, createBlankTrueSource(activeKind, trueSources.length)]);
  }

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>资产审阅</h2>
          <p>主工作区只处理最终资产卡片；records 作为来源记录按需查看。</p>
        </div>
        <div className="header-actions">
          <button onClick={() => onExtractRecords(activeKind)} disabled={isCurrentKindExtracting}>
            <Sparkles size={16} />
            {isCurrentKindExtracting ? "提取中" : `提取${assetKindLabel(activeKind)}记录`}
          </button>
          <button onClick={() => setRecordPreview({ title: `${assetKindLabel(activeKind)}记录`, rows: records })}>
            <Eye size={16} />
            查看记录
          </button>
          <button onClick={addAssetCard}>
            <Plus size={16} />
            新增资产
          </button>
          <button className="primary-button" onClick={() => onSave(normalizedBundle)} disabled={!isDirty}>
            <Save size={16} />
            保存资产文件
          </button>
        </div>
      </div>

      <div className="work-status-grid">
        <ReviewStat label="角色资产" value={normalizedBundle.trueSources.characters.length} tone="normal" />
        <ReviewStat label="角色记录" value={normalizedBundle.records.characters.length} tone="muted" />
        <ReviewStat label="场景资产" value={normalizedBundle.trueSources.scenes.length} tone="normal" />
        <ReviewStat label="道具资产" value={normalizedBundle.trueSources.props.length} tone="normal" />
        <ReviewStat label="已确认" value={confirmedCount + lockedCount} tone="muted" />
      </div>

      <section className="tool-strip">
        {assetKindOptions.map((kind) => (
          <button key={kind.id} className={activeKind === kind.id ? "active" : ""} onClick={() => setActiveKind(kind.id)}>
            {kind.label}
          </button>
        ))}
        <label className="asset-image-zoom-switch">
          <input type="checkbox" checked={isAssetImageZoomEnabled === "true"} onChange={(event) => setIsAssetImageZoomEnabled(event.target.checked ? "true" : "false")} />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>图片悬停放大</span>
        </label>
      </section>

      <AssetCardList
        projectId={projectId}
        kind={activeKind}
        rows={trueSources}
        records={records}
        imageZoomEnabled={isAssetImageZoomEnabled === "true"}
        onChange={updateTrueSources}
        onPersist={(rows) => {
          const nextBundle = {
            ...normalizedBundle,
            trueSources: {
              ...normalizedBundle.trueSources,
              [activeKind]: rows,
            },
          };
          onChange(nextBundle);
          onSave(nextBundle);
        }}
        onOpenRecord={(row) => setRecordPreview({ title: `${row.name || row.id || assetKindLabel(activeKind)} 的记录`, rows: findRelatedRecords(activeKind, row, records) })}
        onImageEvent={onImageEvent}
        onTaskRefresh={onTaskRefresh}
      />
      {recordPreview && <AssetRecordDialog title={recordPreview.title} rows={recordPreview.rows} onClose={() => setRecordPreview(null)} />}
    </section>
  );
}

type StoryWorkflowRunOptions = {
  chapterId?: string;
  chapterIds?: string[];
  blockId?: string;
  blockStart?: string;
  blockEnd?: string;
  executionMode?: StoryboardExecutionMode;
};

type StoryboardExecutionMode = "integrated" | "separate";

type StoryWorkflowChapterTab = {
  chapterId: string;
  label: string;
  title: string;
  episodeRange: string;
};

function StoryPlanningView({
  projectId,
  state,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRunNodes,
  onRunFullWorkflow,
  onRefresh,
}: {
  projectId: string;
  state: StoryWorkflowState | null;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRunNodes: (nodeIds: StoryWorkflowNodeId[], options?: StoryWorkflowRunOptions) => void;
  onRunFullWorkflow: () => void;
  onRefresh: () => void;
}) {
  const nodes = filterStoryWorkflowNodes(state, "planning");
  return (
    <StoryWorkflowPageFrame
      title="剧本统筹"
      description="执行剧情地图、角色概要、信息连续性、全集概要和章节概要。这里只做统筹信息，不做资产定稿，不写分镜。"
      nodes={nodes}
      projectId={projectId}
      artifacts={state?.artifacts ?? {}}
      runningNodeId={runningNodeId}
      runningBatchLabel={runningBatchLabel}
      onRunNode={onRunNode}
      onRunNodes={(nodeIds, options) => onRunNodes(nodeIds?.length ? nodeIds : nodes.map((node) => node.id), options)}
      onRunFullWorkflow={onRunFullWorkflow}
      onRefresh={onRefresh}
    />
  );
}

function StoryboardPlanningView({
  projectId,
  state,
  episodes,
  selectedEpisodeId,
  onSelectEpisode,
  selectedSceneId,
  onSelectScene,
  executionMode,
  onExecutionModeChange,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRunNodes,
  onRefresh,
}: {
  projectId: string;
  state: StoryWorkflowState | null;
  episodes: EpisodeResult[];
  selectedEpisodeId: string;
  onSelectEpisode: (episodeId: string) => void;
  selectedSceneId: string;
  onSelectScene: (sceneId: string) => void;
  executionMode: StoryboardExecutionMode;
  onExecutionModeChange: (mode: StoryboardExecutionMode) => void;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRunNodes: (nodeIds: StoryWorkflowNodeId[], options?: StoryWorkflowRunOptions) => void;
  onRefresh: () => void;
}) {
  const workflowEpisodes = state?.episodes ?? [];
  const activeWorkflowEpisode = workflowEpisodes.find((episode) => episode.episodeId === selectedEpisodeId) ?? workflowEpisodes[0];
  const sceneOptions = activeWorkflowEpisode?.scenes ?? [];
  const nodes = filterStoryWorkflowNodes(state, "storyboard");
  const runNodeIds = executionMode === "integrated" ? nodes.map((node) => node.id).filter((nodeId) => nodeId !== "scene_summary") : nodes.map((node) => node.id);
  return (
    <section className="page-stack story-workflow-page">
      <div className="page-header work-header">
        <div>
          <h2>分镜统筹</h2>
          <p>执行单集概要、场次概要和分块规划。</p>
        </div>
        <div className="header-actions">
          <div className="mode-switch compact" aria-label="分镜统筹执行模式">
            <button className={executionMode === "integrated" ? "active" : ""} onClick={() => onExecutionModeChange("integrated")}>
              集场一体
            </button>
            <button className={executionMode === "separate" ? "active" : ""} onClick={() => onExecutionModeChange("separate")}>
              集场分开
            </button>
          </div>
          <select value={selectedEpisodeId} onChange={(event) => onSelectEpisode(event.target.value)}>
            {(workflowEpisodes.length ? workflowEpisodes : episodes.map((episode) => ({ episodeId: episode.episodeId, title: episode.title, scenes: [] }))).map((episode) => (
              <option value={episode.episodeId} key={episode.episodeId}>
                {episode.episodeId}
              </option>
            ))}
          </select>
          <select value={selectedSceneId} onChange={(event) => onSelectScene(event.target.value)}>
            {(sceneOptions.length ? sceneOptions : [{ sceneId: "SC01", title: "SC01" }]).map((scene) => (
              <option value={scene.sceneId} key={scene.sceneId}>
                {scene.sceneId}
              </option>
            ))}
          </select>
          <button className="primary-button" onClick={() => onRunNodes(runNodeIds, { executionMode })} disabled={Boolean(runningNodeId || runningBatchLabel)}>
            <Play size={16} />
            {runningBatchLabel ? "执行中" : "运行分镜统筹"}
          </button>
          <button onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
      </div>
      <StoryWorkflowNodeGrid
        nodes={nodes}
        projectId={projectId}
        artifacts={state?.artifacts ?? {}}
        runningNodeId={runningNodeId}
        runningBatchLabel={runningBatchLabel}
        onRunNode={(nodeId, options) => onRunNode(nodeId, { ...options, executionMode })}
        disabledNodeIds={executionMode === "integrated" ? ["scene_summary"] : []}
        disabledNodeReason="集场一体模式下，场次概要由单集概要同步生成。"
      />
    </section>
  );
}

function VideoGenerationView({
  projectId,
  state,
  assetReviewBundle,
  selectedEpisodeId,
  onSelectEpisode,
  selectedSceneId,
  onSelectScene,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRefresh,
}: {
  projectId: string;
  state: StoryWorkflowState | null;
  assetReviewBundle: AssetReviewBundle;
  selectedEpisodeId: string;
  onSelectEpisode: (episodeId: string) => void;
  selectedSceneId: string;
  onSelectScene: (sceneId: string) => void;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRefresh: () => void;
}) {
  const artifact = state?.artifacts.video_prompt;
  const blockPlanArtifact = state?.artifacts.storyboard_design;
  const promptGroups = artifact?.status === "done" ? asArray(artifact?.output?.groups).map(asRecord) : [];
  const blockGroups = buildVideoGroupsFromBlockPlan(blockPlanArtifact?.output);
  const groups = mergeVideoBlockGroups(blockGroups, promptGroups);
  const groupIds = groups.map(videoBlockId).filter(Boolean);
  const groupIdsKey = groupIds.join("|");
  const firstGroupId = videoBlockId(groups[0]);
  const workflowEpisodes = state?.episodes ?? [];
  const activeWorkflowEpisode = workflowEpisodes.find((episode) => episode.episodeId === selectedEpisodeId) ?? workflowEpisodes[0];
  const sceneOptions = activeWorkflowEpisode?.scenes ?? [];
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const selectedGroup = groups.find((group) => videoBlockId(group) === selectedGroupId) ?? groups[0];
  const selectedPrompt = textValue(selectedGroup?.prompt);
  const promptArtifactError = artifact?.status === "error" ? textValue(artifact.error, "视频提示词生成失败。") : "";
  const allAssetThumbs = buildVideoAssetThumbs(assetReviewBundle);
  const anchoredAssetThumbs = buildAnchoredAssetThumbs(selectedGroup, allAssetThumbs);
  const videoPaths = asTextArray(selectedGroup?.video_paths).concat(textValue(selectedGroup?.video_path) ? [textValue(selectedGroup?.video_path)] : []).filter(Boolean);
  const selectedVideoPath = videoPaths[selectedVideoIndex] ?? "";

  useEffect(() => {
    if (!groups.length) {
      setSelectedGroupId("");
      setBlockStart("");
      setBlockEnd("");
      return;
    }
    if (!groupIds.includes(selectedGroupId)) setSelectedGroupId(firstGroupId);
    if (!groupIds.includes(blockStart)) setBlockStart(firstGroupId);
    if (!groupIds.includes(blockEnd)) setBlockEnd(firstGroupId);
  }, [groupIdsKey, selectedGroupId, blockStart, blockEnd, firstGroupId]);

  useEffect(() => {
    setPromptDraft(selectedPrompt);
  }, [selectedPrompt, selectedGroupId]);

  useEffect(() => {
    setSelectedVideoIndex(0);
  }, [selectedGroupId]);

  const saveSelectedPrompt = async () => {
    if (!selectedGroup || !artifact) return;
    const nextGroups = groups.map((group) => (
      videoBlockId(group) === videoBlockId(selectedGroup)
        ? { ...group, prompt: promptDraft, status: textValue(group.status, "draft") }
        : group
    ));
    setIsSavingPrompt(true);
    try {
      await saveStoryWorkflowArtifact(projectId, "video_prompt", { output: { ...artifact.output, groups: nextGroups } });
      onRefresh();
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const runCurrentBlockPrompt = async () => {
    const blockId = videoBlockId(selectedGroup);
    if (!blockId) return;
    await onRunNode("video_prompt", { blockId });
  };

  const runScenePrompt = async () => {
    await onRunNode("video_prompt");
  };

  const runBlockRangePrompt = async () => {
    if (!blockStart && !blockEnd) return;
    await onRunNode("video_prompt", { blockStart, blockEnd: blockEnd || blockStart });
  };

  return (
    <section className="page-stack video-workspace-page">
      <div className="video-selection-bar">
        <div className="video-select-controls">
          <strong>视频生成</strong>
          <label>
            集
            <select value={selectedEpisodeId} onChange={(event) => onSelectEpisode(event.target.value)}>
              {(workflowEpisodes.length ? workflowEpisodes : [{ episodeId: selectedEpisodeId || "EP01", title: "EP01", scenes: [] }]).map((episode) => (
                <option value={episode.episodeId} key={episode.episodeId}>
                  {episode.episodeId}
                </option>
              ))}
            </select>
          </label>
          <div className="video-scene-tabs">
            {(sceneOptions.length ? sceneOptions : [{ sceneId: selectedSceneId || "SC01", title: "SC01" }]).map((scene) => (
              <button key={scene.sceneId} className={scene.sceneId === selectedSceneId ? "active" : ""} onClick={() => onSelectScene(scene.sceneId)}>
                {scene.sceneId}
              </button>
            ))}
          </div>
        </div>
        <div className="video-select-actions">
          <button onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
      </div>

      <div className="video-production-layout">
        <aside className="video-group-list">
          <div className="video-group-list-title">
            <strong>视频块</strong>
            <span>{groups.length}</span>
          </div>
          {groups.length ? groups.map((group, index) => {
            const groupId = videoBlockId(group) || `VB${String(index + 1).padStart(3, "0")}`;
            const isActive = videoBlockId(selectedGroup) === groupId;
            return (
              <button key={`${groupId}-${index}`} className={isActive ? "active" : ""} onClick={() => setSelectedGroupId(groupId)}>
                <strong>{groupId}</strong>
                <span>{textValue(group.duration_seconds)}秒</span>
                <small>{textValue(group.source_text)}</small>
                <em className={`story-node-status ${textValue(group.status, "draft") === "done" ? "done" : "idle"}`}>{videoGroupStatusText(group.status)}</em>
              </button>
            );
          }) : (
            <div className="empty-state compact">暂无视频块。</div>
          )}
        </aside>

        <section className="video-group-detail">
          {selectedGroup ? (
            <>
              <div className="video-main-grid">
                <section className="video-stage-panel">
                  <div className="video-panel-title">
                    <strong>生成视频</strong>
                    <span>{videoPaths.length ? `${selectedVideoIndex + 1}/${videoPaths.length}` : "0/0"}</span>
                  </div>
                  <div className="video-preview-box">
                    {selectedVideoPath ? <video src={toBackendAssetImageUrl(selectedVideoPath)} controls /> : <span>暂无视频</span>}
                  </div>
                  <div className="video-version-tabs">
                    {videoPaths.length ? videoPaths.map((path, index) => (
                      <button key={`${path}-${index}`} className={index === selectedVideoIndex ? "active" : ""} onClick={() => setSelectedVideoIndex(index)}>
                        第{index + 1}版
                      </button>
                    )) : (
                      <button disabled>暂无版本</button>
                    )}
                  </div>
                </section>

                <section className="video-stage-panel">
                  <div className="video-panel-title">
                    <strong>参考资产</strong>
                    <span>{anchoredAssetThumbs.length}</span>
                  </div>
                  <AssetThumbGrid assets={anchoredAssetThumbs} emptyText="当前组暂无锚定资产。" />
                </section>
              </div>

              <div className="video-work-bottom">
                <section className="video-left-stack">
                  <div className="video-generate-controls">
                    <div className="video-panel-title">
                      <strong>生成</strong>
                      <span>{textValue(selectedGroup.block_id || selectedGroup.group_id)}</span>
                    </div>
                    <div className="video-control-row">
                      <label>
                        批量
                        <input type="number" min={1} max={12} value={batchSize} onChange={(event) => setBatchSize(Math.max(1, Number(event.target.value) || 1))} />
                      </label>
                      <label>
                        时长
                        <input type="number" min={1} max={15} step={0.5} value={durationSeconds} onChange={(event) => setDurationSeconds(Math.max(1, Math.min(15, Number(event.target.value) || 1)))} />
                      </label>
                    </div>
                    <div className="video-prompt-run-row">
                      <label>
                        起始块
                        <select value={blockStart} onChange={(event) => setBlockStart(event.target.value)}>
                          {groups.map((group, index) => {
                            const id = videoBlockId(group) || `VB${String(index + 1).padStart(3, "0")}`;
                            return <option value={id} key={id}>{id}</option>;
                          })}
                        </select>
                      </label>
                      <label>
                        结束块
                        <select value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)}>
                          {groups.map((group, index) => {
                            const id = videoBlockId(group) || `VB${String(index + 1).padStart(3, "0")}`;
                            return <option value={id} key={id}>{id}</option>;
                          })}
                        </select>
                      </label>
                    </div>
                    <div className="video-action-row">
                      <button onClick={() => void runScenePrompt()} disabled={Boolean(runningNodeId || runningBatchLabel || !groups.length)}>
                        <Sparkles size={15} />
                        整场提示词
                      </button>
                      <button onClick={() => void runCurrentBlockPrompt()} disabled={Boolean(runningNodeId || runningBatchLabel || !selectedGroup)}>
                        <Sparkles size={15} />
                        当前块提示词
                      </button>
                      <button onClick={() => void runBlockRangePrompt()} disabled={Boolean(runningNodeId || runningBatchLabel || !groups.length)}>
                        <Sparkles size={15} />
                        区间提示词
                      </button>
                      <button className="primary-button" disabled>
                        <Play size={15} />
                        生成视频
                      </button>
                    </div>
                  </div>

                  <div className="video-group-editor">
                    <div className="video-group-editor-title">
                      <strong>提示词</strong>
                      <div>
                        <button onClick={saveSelectedPrompt} disabled={isSavingPrompt || !artifact}>
                          <Save size={15} />
                          {isSavingPrompt ? "保存中" : "保存"}
                        </button>
                      </div>
                    </div>
                    {promptArtifactError && <div className="json-error">{promptArtifactError}</div>}
                    <textarea value={promptDraft} onChange={(event) => setPromptDraft(event.target.value)} spellCheck={false} />
                  </div>
                </section>

                <section className="video-asset-library">
                  <div className="video-panel-title">
                    <strong>全集资产</strong>
                    <span>{allAssetThumbs.length}</span>
                  </div>
                  <div>
                    <AssetLibrarySection title="角色" assets={allAssetThumbs.filter((asset) => asset.kind === "characters")} />
                    <AssetLibrarySection title="场景" assets={allAssetThumbs.filter((asset) => asset.kind === "scenes")} />
                    <AssetLibrarySection title="物品" assets={allAssetThumbs.filter((asset) => asset.kind === "props")} />
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className="empty-state">先生成视频组。</div>
          )}
        </section>
      </div>
    </section>
  );
}

function StoryWorkflowPageFrame({
  title,
  description,
  nodes,
  projectId,
  artifacts,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRunNodes,
  onRunFullWorkflow,
  onRefresh,
}: {
  title: string;
  description: string;
  nodes: StoryWorkflowNode[];
  projectId: string;
  artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRunNodes: (nodeIds?: StoryWorkflowNodeId[], options?: StoryWorkflowRunOptions) => void;
  onRunFullWorkflow?: () => void;
  onRefresh: () => void;
}) {
  return (
    <section className="page-stack story-workflow-page">
      <div className="page-header work-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="header-actions">
          <button className="primary-button" onClick={() => onRunNodes()} disabled={Boolean(runningNodeId || runningBatchLabel)}>
            <Play size={16} />
            {runningBatchLabel ? "执行中" : "运行本页全部"}
          </button>
          {onRunFullWorkflow && (
            <button onClick={onRunFullWorkflow} disabled={Boolean(runningNodeId || runningBatchLabel)}>
              <Sparkles size={16} />
              运行分镜全流程
            </button>
          )}
          <button onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
      </div>
      <StoryWorkflowNodeGrid
        nodes={nodes}
        projectId={projectId}
        artifacts={artifacts}
        runningNodeId={runningNodeId}
        runningBatchLabel={runningBatchLabel}
        onRunNode={onRunNode}
        onRunNodes={onRunNodes}
      />
    </section>
  );
}

function StoryWorkflowNodeGrid({
  nodes,
  projectId,
  artifacts,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRunNodes,
  disabledNodeIds = [],
  disabledNodeReason = "",
}: {
  nodes: StoryWorkflowNode[];
  projectId: string;
  artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRunNodes?: (nodeIds: StoryWorkflowNodeId[], options?: StoryWorkflowRunOptions) => void;
  disabledNodeIds?: StoryWorkflowNodeId[];
  disabledNodeReason?: string;
}) {
  const [activeNodeId, setActiveNodeId] = useState<StoryWorkflowNodeId | "">("");
  const [artifactView, setArtifactView] = useState<"review" | "json">("review");
  const [selectedChapterId, setSelectedChapterId] = useState("chapter_01");
  const [chapterArtifact, setChapterArtifact] = useState<StoryWorkflowArtifact | null>(null);
  const [isChapterArtifactLoading, setIsChapterArtifactLoading] = useState(false);
  const activeNode = nodes.find((node) => node.id === activeNodeId) ?? nodes[0];
  const isChapterSummary = activeNode?.id === "chapter_summary";
  const isActiveNodeDisabled = activeNode ? disabledNodeIds.includes(activeNode.id) : false;
  const activeArtifact = isChapterSummary ? chapterArtifact ?? undefined : activeNode ? artifacts[activeNode.id] : undefined;
  const chapterTabs = useMemo(() => extractWorkflowChapterTabs(artifacts), [artifacts]);
  const selectedChapter = chapterTabs.find((chapter) => chapter.chapterId === selectedChapterId) ?? chapterTabs[0];
  const activeReviewOutput = activeArtifact?.output;
  const activeArtifactStatus = runningNodeId === activeNode?.id ? "running" : activeArtifact?.status;

  useEffect(() => {
    if (!nodes.length) return;
    if (!activeNodeId || !nodes.some((node) => node.id === activeNodeId)) {
      setActiveNodeId(nodes[0].id);
    }
  }, [nodes, activeNodeId]);

  useEffect(() => {
    if (!chapterTabs.length) return;
    if (!chapterTabs.some((chapter) => chapter.chapterId === selectedChapterId)) {
      setSelectedChapterId(chapterTabs[0].chapterId);
    }
  }, [chapterTabs, selectedChapterId]);

  useEffect(() => {
    if (!projectId || !isChapterSummary || !selectedChapter?.chapterId) {
      setChapterArtifact(null);
      return;
    }
    let cancelled = false;
    setIsChapterArtifactLoading(true);
    loadStoryWorkflowArtifact(projectId, "chapter_summary", { chapterId: selectedChapter.chapterId })
      .then((result) => {
        if (!cancelled) setChapterArtifact(result.artifact);
      })
      .catch(() => {
        if (!cancelled) setChapterArtifact(null);
      })
      .finally(() => {
        if (!cancelled) setIsChapterArtifactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, isChapterSummary, selectedChapter?.chapterId]);

  if (!nodes.length) {
    return <div className="empty-state">当前项目还没有读取到 分镜工作流节点。请确认后端在线。</div>;
  }

  return (
    <div className="story-workflow-layout">
      <section className="story-node-list">
        {nodes.map((node) => {
          const artifact = artifacts[node.id];
          const status = runningNodeId === node.id ? "running" : artifact?.status ?? "idle";
          const showStatus = node.id !== "chapter_summary" || runningNodeId === node.id;
          return (
            <button key={node.id} className={activeNode?.id === node.id ? "active" : ""} onClick={() => setActiveNodeId(node.id)}>
              <strong>{node.title}</strong>
              <span>{node.scope}</span>
              <small>{node.outputSummary}</small>
              {showStatus && <em className={`story-node-status ${status}`}>{storyNodeStatusText(status)}</em>}
            </button>
          );
        })}
      </section>

      {activeNode && (
        <section className="story-node-detail">
          <section className="story-node-brief">
            <div className="story-node-brief-main">
              <div className="story-node-brief-title">
                <Layers3 size={18} />
                <strong>{activeNode.title}</strong>
                <span>{activeNode.scope}</span>
              </div>
              <div className="story-node-brief-fields">
                <span>输入：{activeNode.inputSummary}</span>
                <span>输出：{activeNode.outputSummary}</span>
                <span>依赖：{activeNode.dependsOn.length ? activeNode.dependsOn.join(" / ") : "无"}</span>
                <span>Prompt：{activeNode.promptPath}</span>
              </div>
            </div>
            <div className="story-node-run-actions">
              {isChapterSummary ? (
                <>
                  <button
                    className="primary-button"
                    onClick={() => {
                      void onRunNode(activeNode.id, { chapterId: selectedChapter?.chapterId }).then((artifact) => {
                        if (artifact) setChapterArtifact(artifact);
                      });
                    }}
                    disabled={Boolean(runningNodeId || runningBatchLabel || !selectedChapter)}
                  >
                    <Play size={16} />
                    {runningNodeId === activeNode.id ? "执行中" : "执行当前章节"}
                  </button>
                  <button onClick={() => onRunNodes?.([activeNode.id], { chapterIds: chapterTabs.map((chapter) => chapter.chapterId) })} disabled={Boolean(runningNodeId || runningBatchLabel || !chapterTabs.length)}>
                    <Sparkles size={16} />
                    执行全部章节概要
                  </button>
                </>
              ) : (
                <button className="primary-button" onClick={() => onRunNode(activeNode.id)} disabled={Boolean(runningNodeId || runningBatchLabel || isActiveNodeDisabled)} title={isActiveNodeDisabled ? disabledNodeReason : undefined}>
                  <Play size={16} />
                  {runningNodeId === activeNode.id ? "执行中" : isActiveNodeDisabled ? "已由单集概要生成" : `执行${activeNode.title}`}
                </button>
              )}
              {isActiveNodeDisabled && disabledNodeReason && <small className="story-node-disabled-note">{disabledNodeReason}</small>}
            </div>
          </section>

          {isChapterSummary && (
            <div className="chapter-tab-strip">
              {chapterTabs.map((chapter) => (
                <button key={chapter.chapterId} className={selectedChapter?.chapterId === chapter.chapterId ? "active" : ""} onClick={() => setSelectedChapterId(chapter.chapterId)}>
                  <strong>{chapter.label}</strong>
                  <span>{chapter.episodeRange || chapter.title}</span>
                </button>
              ))}
            </div>
          )}

          <article className="panel story-artifact-panel">
            <div className="panel-title">
              <ClipboardList size={18} />
              <span>节点产物</span>
              <strong>{isChapterArtifactLoading ? "读取中" : activeArtifactStatus ? storyNodeStatusText(activeArtifactStatus) : "未生成"}</strong>
            </div>
            {activeArtifact ? (
              <>
                <div className="story-artifact-meta">
                  <span>{isChapterSummary ? selectedChapter?.title || selectedChapter?.chapterId || activeArtifact.title : activeArtifact.updatedAt || "未记录时间"}</span>
                  <span>{activeArtifact.inputSummary || "无输入摘要"}</span>
                </div>
                {activeArtifact.error && <div className="json-error">{activeArtifact.error}</div>}
                <div className="story-artifact-toolbar">
                  <div className="mode-switch compact" aria-label="节点产物查看模式">
                    <button className={artifactView === "review" ? "active" : ""} onClick={() => setArtifactView("review")}>
                      审阅
                    </button>
                    <button className={artifactView === "json" ? "active" : ""} onClick={() => setArtifactView("json")}>
                      JSON
                    </button>
                  </div>
                </div>
                {artifactView === "review" ? (
                  <StoryArtifactReview nodeId={activeArtifact.nodeId} output={activeReviewOutput ?? {}} />
                ) : (
                  <pre className="story-artifact-json-view">{formatJson(activeArtifact.output && Object.keys(activeArtifact.output).length ? activeArtifact.output : activeArtifact.rawText || {})}</pre>
                )}
              </>
            ) : (
              <div className="empty-state">{isChapterSummary ? "当前章节还没有产物。执行当前章节后会写入对应 chapter_summary_xx.json。" : "该节点还没有产物。执行后会写入项目文件夹的 `artifacts/story_workflow/` 目录。"}</div>
            )}
          </article>
        </section>
      )}
    </div>
  );
}

function StoryArtifactReview({ nodeId, output }: { nodeId: StoryWorkflowNodeId; output: Record<string, unknown> }) {
  const data = asRecord(output);
  if (!Object.keys(data).length) {
    return <div className="empty-state">该节点没有可审阅的结构化内容。请到 JSON 标签查看原始输出。</div>;
  }

  if (nodeId === "story_map") return <ReviewStoryMap data={data} />;
  if (nodeId === "character_summary") return <ReviewCharacterSummary data={data} />;
  if (nodeId === "continuity") return <ReviewContinuity data={data} />;
  if (nodeId === "series_summary") return <ReviewSeriesSummary data={data} />;
  if (nodeId === "chapter_summary") return <ReviewChapterSummary data={data} />;
  if (nodeId === "episode_summary") return <ReviewEpisodeSummary data={data} />;
  if (nodeId === "scene_summary") return <ReviewSceneSummary data={data} />;
  if (nodeId === "storyboard_design") return <ReviewStoryboardDesign data={data} />;
  if (nodeId === "video_prompt") return <ReviewVideoPrompt data={data} />;
  return <GenericArtifactReview data={data} />;
}

function ReviewStoryMap({ data }: { data: Record<string, unknown> }) {
  const globalTurns = asArray(data.global_turning_points).map(asRecord);
  const emotionalCurve = globalTurns.length ? globalTurns : asArray(data.emotional_curve).map(asRecord);
  const chapterMap = asArray(data.chapter_map).map(asRecord);
  const keyTurns = globalTurns.length ? [] : asArray(data.key_turns).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewHero
        title={textValue(data.logline, "未生成一句话梗概")}
        subtitle={textValue(data.mainline)}
        tags={asTextArray(data.genre_tone_tags)}
      />
      <ReviewSection title={globalTurns.length ? "关键转折地图" : "全剧情绪曲线"}>
        <TimelineList rows={emotionalCurve} leftKey="episode_hint" titleKey="event" detailKey={globalTurns.length ? "narrative_function" : "emotion_shift"} />
      </ReviewSection>
      <ReviewSection title="章节节点">
        <ChapterCardGrid rows={chapterMap} />
      </ReviewSection>
      {keyTurns.length > 0 && (
        <ReviewSection title="关键转折">
          <SimpleTable
            columns={[
              ["episode_hint", "集数"],
              ["turn", "转折"],
              ["why_important", "作用"],
            ]}
            rows={keyTurns}
          />
        </ReviewSection>
      )}
    </div>
  );
}

function ReviewCharacterSummary({ data }: { data: Record<string, unknown> }) {
  const characters = asArray(data.main_characters).map(asRecord);
  const relationships = asArray(data.relationship_map).map(asRecord);
  const risks = asArray(data.character_risks_for_later).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewSection title="主要角色档案">
        <SimpleTable
          columns={[
            ["name", "角色"],
            ["role_function", "戏剧功能"],
            ["core_desire", "核心欲望"],
            ["performance_baseline", "表演底色"],
            ["identity_changes", "身份变化"],
          ]}
          rows={characters}
          className="character-review-table"
        />
      </ReviewSection>
      <ReviewSection title="身份视觉阶段">
        <GenericObjectList rows={characters.flatMap((character) => asArray(character.identity_visual_stages).map((stage) => ({ name: character.name, ...asRecord(stage) })))} />
      </ReviewSection>
      <ReviewSection title="关系 / 认知变化">
        <GenericObjectList
          rows={characters.flatMap((character) => [
            ...asArray(character.relationship_state_changes).map((item) => ({ name: character.name, type: "关系", ...asRecord(item) })),
            ...asArray(character.knowledge_state_changes).map((item) => ({ name: character.name, type: "认知", ...asRecord(item) })),
          ])}
        />
      </ReviewSection>
      <ReviewSection title="关系变化">
        {relationships.length ? <GenericObjectList rows={relationships} /> : <EmptyReviewText text="未输出关系变化。" />}
      </ReviewSection>
      <ReviewSection title="后续风险">
        <GenericObjectList rows={risks} fallback={asTextArray(data.character_risks_for_later)} />
      </ReviewSection>
    </div>
  );
}

function ReviewContinuity({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="story-artifact-review">
      <ReviewSection title="伏笔 / Callback">
        <SimpleTable
          columns={[
            ["setup_episode", "埋设"],
            ["setup_text", "内容"],
            ["payoff_episode", "回收"],
            ["payoff_text", "回收方式"],
            ["risk", "风险"],
          ]}
          rows={asArray(data.foreshadowing_callbacks).map(asRecord)}
        />
      </ReviewSection>
      <div className="review-two-col">
        <ReviewSection title="视觉母题">
          <GenericObjectList rows={asArray(data.visual_motifs).map(asRecord)} fallback={asTextArray(data.visual_motifs)} />
        </ReviewSection>
        <ReviewSection title="复现空间 / 道具">
          <ReviewMiniBlock title="道具" items={asArray(data.recurring_props)} />
          <ReviewMiniBlock title="空间" items={asArray(data.recurring_spaces)} />
        </ReviewSection>
      </div>
      <ReviewSection title="资产变化风险">
        <GenericObjectList rows={asArray(data.asset_change_risks).map(asRecord)} fallback={asTextArray(data.asset_change_risks)} />
      </ReviewSection>
      <ReviewSection title="复核优先级">
        <BulletList items={asTextArray(data.review_priority)} emptyText="未输出复核优先级。" />
      </ReviewSection>
    </div>
  );
}

function ReviewSeriesSummary({ data }: { data: Record<string, unknown> }) {
  const summary = asRecord(data.series_bible_summary);
  const characterSummary = asRecord(data.character_summary || data.character_arc_summary);
  const trackItems = asRecord(data.must_track_items);
  return (
    <div className="story-artifact-review">
      <ReviewHero
        title={textValue(summary.logline || data.logline, "全集概要")}
        subtitle={textValue(summary.mainline || data.mainline)}
        tags={asTextArray(summary.genre_tone_tags || data.genre_tone_tags)}
      />
      <ReviewSection title="章节图">
        <ChapterCardGrid rows={asArray(data.chapter_map || summary.chapter_map).map(asRecord)} />
      </ReviewSection>
      <ReviewSection title="角色摘要">
        <SimpleTable
          columns={[
            ["name", "角色"],
            ["role_function", "戏剧功能"],
            ["core_desire", "核心欲望"],
            ["performance_baseline", "表演底色"],
            ["identity_changes", "身份变化"],
          ]}
          rows={asArray(characterSummary.main_characters || data.character_summary || data.character_arc_summary).map(asRecord)}
          className="character-review-table"
        />
      </ReviewSection>
      <div className="review-two-col">
        <ReviewSection title="伏笔 / 母题">
          <ReviewMiniBlock title="伏笔" items={asArray(trackItems.foreshadowing_callbacks)} />
          <ReviewMiniBlock title="视觉母题" items={asArray(trackItems.visual_motifs)} />
        </ReviewSection>
        <ReviewSection title="道具 / 空间 / 变化风险">
          <ReviewMiniBlock title="道具" items={asArray(trackItems.recurring_props)} />
          <ReviewMiniBlock title="空间" items={asArray(trackItems.recurring_spaces)} />
          <ReviewMiniBlock title="变化风险" items={asArray(trackItems.asset_change_risks)} />
        </ReviewSection>
      </div>
    </div>
  );
}

function ReviewChapterSummary({ data }: { data: Record<string, unknown> }) {
  const chapters = asArray(data.chapter_cards).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewSection title="章节概要">
        <ChapterCardGrid rows={chapters} showEpisodes />
      </ReviewSection>
    </div>
  );
}

function ReviewEpisodeSummary({ data }: { data: Record<string, unknown> }) {
  const emotionShift = asRecord(data.emotion_shift);
  return (
    <div className="story-artifact-review">
      <ReviewHero title={`${textValue(data.episode_id, "EP")} · ${textValue(data.one_line_task, "单集任务未生成")}`} subtitle={`情绪：${textValue(emotionShift.opening, "-")} -> ${textValue(emotionShift.ending, "-")} / 钩子：${textValue(data.hook_type, "-")}`} />
      <div className="review-two-col">
        <ReviewSection title="必须放大的细节">
          <BulletList items={asTextArray(data.must_enlarge_details)} emptyText="未输出必须放大的细节。" />
        </ReviewSection>
        <ReviewSection title="节奏指令">
          <PlainReviewText>{textValue(data.rhythm_instruction)}</PlainReviewText>
        </ReviewSection>
      </div>
      <ReviewSection title="承上启下">
        <KeyValueReview
          rows={[
            ["承上", data.carry_over],
            ["启下", data.handoff],
          ]}
        />
      </ReviewSection>
      <ReviewSection title="资产连续性关注">
        <BulletList items={asTextArray(data.asset_continuity_concerns)} emptyText="未输出资产连续性关注。" />
      </ReviewSection>
    </div>
  );
}

function ReviewSceneSummary({ data }: { data: Record<string, unknown> }) {
  const sceneSummaries = asArray(data.scene_summaries).map(asRecord);
  if (sceneSummaries.length) {
    return (
      <div className="story-artifact-review">
        <ReviewSection title={`场次概要（${sceneSummaries.length} 场）`}>
          <div className="generic-review-list">
            {sceneSummaries.map((scene, index) => (
              <article key={`${textValue(scene.scene_id, String(index + 1))}-${index}`}>
                <div>
                  <span>场次</span>
                  <p>{textValue(scene.scene_id, `SC${String(index + 1).padStart(2, "0")}`)}</p>
                </div>
                <div>
                  <span>戏剧任务</span>
                  <p>{textValue(scene.scene_dramatic_task)}</p>
                </div>
                <div>
                  <span>资产锚定</span>
                  <AssetBindingSummary value={scene.asset_bindings} />
                </div>
                <div>
                  <span>空间关系</span>
                  <p>{textValue(scene.spatial_relation)}</p>
                </div>
              </article>
            ))}
          </div>
        </ReviewSection>
      </div>
    );
  }
  return (
    <div className="story-artifact-review">
      <ReviewHero title={`${textValue(data.episode_id)} / ${textValue(data.scene_id)} 导演简报`} subtitle={textValue(data.scene_dramatic_task)} />
      <ReviewSection title="角色入场状态">
        <SimpleTable
          columns={[
            ["name", "角色"],
            ["entry_state", "入场状态"],
            ["subtext", "潜台词"],
            ["arc_position", "弧线位置"],
          ]}
          rows={asArray(data.character_entry_states).map(asRecord)}
        />
      </ReviewSection>
      <div className="review-two-col">
        <ReviewSection title="必须强调的信息">
          <BulletList items={asTextArray(data.must_emphasize_information)} emptyText="未输出强调信息。" />
        </ReviewSection>
        <ReviewSection title="空间关系">
          <PlainReviewText>{textValue(data.spatial_relation)}</PlainReviewText>
        </ReviewSection>
      </div>
      <ReviewSection title="节奏氛围 / 承接">
        <KeyValueReview
          rows={[
            ["节奏氛围", data.rhythm_atmosphere],
            ["承接或钩子", data.carry_over_or_hook],
          ]}
        />
      </ReviewSection>
      <ReviewSection title="连续性风险">
        <BulletList items={asTextArray(data.continuity_risks)} emptyText="未输出连续性风险。" />
      </ReviewSection>
      <ReviewSection title="资产锚定">
        <AssetBindingSummary value={data.asset_bindings} />
      </ReviewSection>
    </div>
  );
}

function ReviewStoryboardDesign({ data }: { data: Record<string, unknown> }) {
  const blocks = asArray(data.video_blocks).map(asRecord);
  const sceneBase = asRecord(data.scene_base);
  return (
    <div className="story-artifact-review">
      <ReviewHero title={`${textValue(data.episode_id)} / ${textValue(data.scene_id)} 分块规划`} subtitle={textValue(sceneBase.scene_name || sceneBase.base_space_state)} />
      <ReviewSection title={`视频块（${blocks.length} 块）`}>
        <div className="storyboard-review-table-wrap">
          <table className="storyboard-review-table">
            <thead>
              <tr>
                <th>块号</th>
                <th>时长</th>
                <th>剧本原文</th>
                <th>任务</th>
                <th>开始状态</th>
                <th>结束状态</th>
                <th>资产</th>
                <th>临时资产</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block, index) => (
                <tr key={`${textValue(block.block_id, String(index + 1))}-${index}`}>
                  <td className="shot-no">{textValue(block.block_id, `VB${String(index + 1).padStart(3, "0")}`)}</td>
                  <td>{textValue(block.duration_seconds)}秒</td>
                  <td>{textValue(block.source_text)}</td>
                  <td>{textValue(block.block_task)}</td>
                  <td>{textValue(block.start_state)}</td>
                  <td>{textValue(block.end_state)}</td>
                  <td><small>{formatAssetRefs(block.asset_refs)}</small></td>
                  <td><small>{formatTempAssets(block.temp_assets)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReviewSection>
    </div>
  );
}

function ReviewVideoPrompt({ data }: { data: Record<string, unknown> }) {
  const groups = asArray(data.groups).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewSection title={`视频提示词（${groups.length} 块）`}>
        <div className="video-prompt-review-list">
          {groups.map((group, index) => (
            <article className="video-prompt-row" key={`${textValue(group.block_id, String(index + 1))}-${index}`}>
              <div className="video-prompt-index">
                <strong>{textValue(group.block_id, `VB${String(index + 1).padStart(3, "0")}`)}</strong>
                <span>{textValue(group.duration_seconds)}秒</span>
                <small>{videoGroupStatusText(group.status)}</small>
              </div>
              <div className="video-prompt-body">
                <p>{textValue(group.prompt)}</p>
                <div className="video-prompt-meta">
                  <span>参考图：{asTextArray(group.reference_image_paths).length ? asTextArray(group.reference_image_paths).join(" / ") : "无"}</span>
                  <span>视频：{textValue(group.video_path, "无")}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </ReviewSection>
    </div>
  );
}

function videoGroupStatusText(value: unknown) {
  const status = textValue(value, "draft");
  if (status === "done") return "已完成";
  if (status === "running") return "生成中";
  if (status === "error") return "失败";
  return "待生成";
}

function videoBlockId(group: Record<string, unknown> | undefined): string {
  if (!group) return "";
  return textValue(group.block_id || group.group_id);
}

function buildVideoGroupsFromBlockPlan(output: unknown): Record<string, unknown>[] {
  const data = asRecord(output);
  return asArray(data.video_blocks).map((blockValue, index) => {
    const block = asRecord(blockValue);
    const blockId = textValue(block.block_id, `VB${String(index + 1).padStart(3, "0")}`);
    return {
      group_id: blockId,
      block_id: blockId,
      duration_seconds: block.duration_seconds,
      source_text: block.source_text,
      prompt: "",
      asset_refs: block.asset_refs,
      reference_image_paths: [],
      status: "draft",
      video_path: "",
    };
  });
}

function mergeVideoBlockGroups(blockGroups: Record<string, unknown>[], promptGroups: Record<string, unknown>[]) {
  if (!blockGroups.length) return promptGroups;
  const promptByBlockId = new Map(promptGroups.map((group) => [videoBlockId(group), group]));
  return blockGroups.map((block) => {
    const prompt = promptByBlockId.get(videoBlockId(block));
    return prompt
      ? {
          ...prompt,
          ...block,
          prompt: prompt.prompt,
          reference_image_paths: prompt.reference_image_paths,
          status: prompt.status,
          video_path: prompt.video_path,
          video_paths: prompt.video_paths,
        }
      : block;
  });
}

type VideoAssetThumb = {
  kind: AssetKind;
  id: string;
  name: string;
  imageUrl: string;
};

function AssetLibrarySection({ title, assets }: { title: string; assets: VideoAssetThumb[] }) {
  return (
    <div className="video-asset-library-section">
      <strong>{title}</strong>
      <AssetThumbGrid assets={assets} emptyText="暂无资产。" />
    </div>
  );
}

function AssetThumbGrid({ assets, emptyText }: { assets: VideoAssetThumb[]; emptyText: string }) {
  if (!assets.length) return <div className="video-asset-empty">{emptyText}</div>;
  return (
    <div className="video-asset-thumb-grid">
      {assets.map((asset, index) => (
        <div className="video-asset-thumb" key={`${asset.kind}-${asset.id || asset.name}-${index}`}>
          <div>
            {asset.imageUrl ? <img src={toBackendAssetImageUrl(asset.imageUrl)} alt={asset.name} /> : <span>{asset.name.slice(0, 2) || "资产"}</span>}
          </div>
          <small>{asset.name || asset.id || "未命名"}</small>
        </div>
      ))}
    </div>
  );
}

function buildVideoAssetThumbs(bundle: AssetReviewBundle): VideoAssetThumb[] {
  const kinds: AssetKind[] = ["characters", "scenes", "props"];
  return kinds.flatMap((kind) =>
    (bundle.trueSources[kind] ?? []).map((row, index) => ({
      kind,
      id: row.id || row.asset_id || row.name || `${kind}-${index}`,
      name: row.name || row.base_name || row.id || `${assetKindLabel(kind)}${index + 1}`,
      imageUrl: row.selected_image || row.image_url || row.image_path || "",
    })),
  );
}

function buildAnchoredAssetThumbs(group: Record<string, unknown> | undefined, assets: VideoAssetThumb[]): VideoAssetThumb[] {
  const refs = new Set<string>();
  for (const ref of asArray(group?.asset_refs).map(asRecord)) {
    for (const key of ["asset_id", "id", "name", "display_name"]) {
      const value = textValue(ref[key]);
      if (value) refs.add(value);
    }
  }
  for (const value of [...asTextArray(group?.asset_ids), ...asTextArray(group?.reference_asset_ids)]) {
    for (const part of value.split(/[,\s/：:]+/)) {
      if (part.trim()) refs.add(part.trim());
    }
  }
  if (!refs.size) return [];
  return assets.filter((asset) => refs.has(asset.id) || refs.has(asset.name));
}

function AssetBindingSummary({ value }: { value: unknown }) {
  const bindings = asRecord(value);
  const groups: [string, unknown][] = [
    ["角色", bindings.characters],
    ["场景", bindings.scenes],
    ["道具", bindings.props],
  ];
  const visibleGroups = groups.map(([label, items]) => [label, asArray(items).map(asRecord)] as [string, Record<string, unknown>[]]).filter(([, items]) => items.length);
  if (!visibleGroups.length) return <EmptyReviewText text="未输出资产锚定。" />;
  return (
    <div className="asset-binding-summary">
      {visibleGroups.map(([label, items]) => (
        <div key={label}>
          <strong>{label}</strong>
          <span>{items.map(formatAssetBinding).join(" / ")}</span>
        </div>
      ))}
    </div>
  );
}

function formatAssetBinding(record: Record<string, unknown>): string {
  const displayName = textValue(record.display_name || record.name, "-");
  const assetId = textValue(record.asset_id || record.id);
  const versionLabel = textValue(record.version_label);
  const stateNote = textValue(record.state_note);
  return [displayName, assetId, versionLabel, stateNote].filter(Boolean).join(" · ");
}

function formatAssetRefs(value: unknown): string {
  const refs = asArray(value).map(asRecord).filter((record) => Object.keys(record).length);
  if (!refs.length) return asTextArray(value).join(" / ");
  return refs.map((ref) => {
    const displayName = textValue(ref.display_name || ref.name, "-");
    const assetId = textValue(ref.asset_id || ref.id);
    const usage = textValue(ref.usage);
    const overrideNote = textValue(ref.override_note);
    return [displayName, assetId, usage, overrideNote].filter(Boolean).join(" · ");
  }).join(" / ");
}

function formatTempAssets(value: unknown): string {
  const items = asArray(value).map(asRecord).filter((record) => Object.keys(record).length);
  if (!items.length) return asTextArray(value).join(" / ") || "-";
  return items.map((item) => {
    const name = textValue(item.temp_name || item.name, "-");
    const type = textValue(item.type);
    const reason = textValue(item.reason);
    return [name, type, reason].filter(Boolean).join(" · ");
  }).join(" / ");
}

function GenericArtifactReview({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="story-artifact-review">
      <ReviewSection title="结构化内容">
        <GenericObjectList rows={Object.entries(data).map(([key, value]) => ({ key, value }))} />
      </ReviewSection>
    </div>
  );
}

function ReviewHero({ title, subtitle, tags = [] }: { title: string; subtitle?: string; tags?: string[] }) {
  return (
    <section className="review-hero">
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {tags.length > 0 && (
        <div className="review-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="review-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function TimelineList({ rows, leftKey, titleKey, detailKey }: { rows: Record<string, unknown>[]; leftKey: string; titleKey: string; detailKey: string }) {
  if (!rows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <div className="review-timeline">
      {rows.map((row, index) => (
        <article key={`${textValue(row[leftKey], String(index + 1))}-${index}`}>
          <strong>{textValue(row[leftKey], "-")}</strong>
          <p>{textValue(row[titleKey])}</p>
          <small>{textValue(row[detailKey])}</small>
        </article>
      ))}
    </div>
  );
}

function ChapterCardGrid({ rows, showEpisodes = false }: { rows: Record<string, unknown>[]; showEpisodes?: boolean }) {
  if (!rows.length) return <EmptyReviewText text="未输出章节信息。" />;
  return (
    <div className="chapter-review-grid">
      {rows.map((row, index) => {
        const episodes = asArray(row.episode_titles).map(asRecord);
        return (
          <article className="chapter-review-card" key={`${textValue(row.chapter_id, String(index + 1))}-${index}`}>
            <div>
              <strong>{textValue(row.chapter_name || row.chapter_id, `章节 ${index + 1}`)}</strong>
              <span>{textValue(row.episode_range)}</span>
            </div>
            <p>{textValue(row.chapter_function)}</p>
            <KeyValueReview
              rows={[
                ["情绪", row.emotional_tone],
                ["母题/伏笔", row.required_motifs_or_foreshadowing],
                ["结束钩子", row.chapter_end_hook || row.end_hook],
              ]}
            />
            {showEpisodes && episodes.length > 0 && (
              <div className="episode-title-list">
                {episodes.map((episode, episodeIndex) => (
                  <div key={`${textValue(episode.episode_id, String(episodeIndex + 1))}-${episodeIndex}`}>
                    <strong>EP{textValue(episode.episode_id, String(episodeIndex + 1)).replace(/^EP/i, "")}</strong>
                    <span>{textValue(episode.title)}</span>
                    <small>{textValue(episode.one_line_synopsis)}</small>
                  </div>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function SimpleTable({ columns, rows, className = "" }: { columns: [string, string][]; rows: Record<string, unknown>[]; className?: string }) {
  if (!rows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <div className="simple-review-table-wrap">
      <table className={`simple-review-table ${className}`}>
        <thead>
          <tr>
            {columns.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map(([key]) => (
                <td key={key}>{formatReviewValue(row[key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueReview({ rows }: { rows: [string, unknown][] }) {
  const visibleRows = rows.filter(([, value]) => textValue(value));
  if (!visibleRows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <dl className="key-value-review">
      {visibleRows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{formatReviewValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function GenericObjectList({ rows, fallback = [] }: { rows: Record<string, unknown>[]; fallback?: string[] }) {
  if (!rows.length && fallback.length) return <BulletList items={fallback} />;
  if (!rows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <div className="generic-review-list">
      {rows.map((row, index) => (
        <article key={index}>
          {Object.entries(row).map(([key, value]) => (
            <div key={key}>
              <span>{humanizeArtifactKey(key)}</span>
              <p>{formatReviewValue(value)}</p>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function ReviewMiniBlock({ title, items }: { title: string; items: unknown[] }) {
  return (
    <div className="review-mini-block">
      <strong>{title}</strong>
      {items.length ? <GenericObjectList rows={items.map(asRecord)} fallback={items.map((item) => textValue(item)).filter(Boolean)} /> : <EmptyReviewText text="未输出。" />}
    </div>
  );
}

function BulletList({ items, emptyText = "未输出。" }: { items: string[]; emptyText?: string }) {
  if (!items.length) return <EmptyReviewText text={emptyText} />;
  return (
    <ul className="review-bullet-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function PlainReviewText({ children }: { children: ReactNode }) {
  return <p className="plain-review-text">{children || "未输出。"}</p>;
}

function EmptyReviewText({ text }: { text: string }) {
  return <p className="empty-review-text">{text}</p>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join(" / ") || fallback;
  return fallback;
}

function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return textValue(value) ? [textValue(value)] : [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    if (typeof item === "number" || typeof item === "boolean") return String(item);
    const record = asRecord(item);
    return Object.values(record).map((entry) => textValue(entry)).filter(Boolean).join("：");
  }).filter(Boolean);
}

function normalizeWorkflowChapterId(value: unknown): string {
  const raw = textValue(value).trim();
  const match = raw.match(/\d+/);
  if (!match) return raw || "chapter_01";
  return `chapter_${String(Number(match[0]) || 1).padStart(2, "0")}`;
}

function workflowChapterLabel(chapterId: string): string {
  const number = Number(chapterId.match(/\d+/)?.[0] || 1);
  return `第${number}章`;
}

function extractWorkflowChapterTabs(artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>): StoryWorkflowChapterTab[] {
  const storyMap = asRecord(artifacts.story_map?.output);
  const mapRows = asArray(storyMap.chapter_map).map(asRecord);
  const seen = new Set<string>();
  return mapRows.map((row, index) => {
    const chapterId = normalizeWorkflowChapterId(row.chapter_id || index + 1);
    return {
      chapterId,
      label: workflowChapterLabel(chapterId),
      title: textValue(row.chapter_name || row.chapter_title || row.chapter_function, workflowChapterLabel(chapterId)),
      episodeRange: textValue(row.episode_range),
    };
  }).filter((chapter) => {
    if (seen.has(chapter.chapterId)) return false;
    seen.add(chapter.chapterId);
    return true;
  });
}

function formatReviewValue(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    const items = asTextArray(value);
    return items.length ? items.join(" / ") : "";
  }
  if (value && typeof value === "object") {
    return Object.entries(asRecord(value))
      .map(([key, entry]) => `${humanizeArtifactKey(key)}：${textValue(entry)}`)
      .filter(Boolean)
      .join("；");
  }
  return textValue(value);
}

function humanizeArtifactKey(key: string) {
  const labels: Record<string, string> = {
    key: "字段",
    value: "内容",
    name: "名称",
    role_function: "功能",
    core_desire: "欲望",
    fatal_flaw: "缺陷",
    arc_start: "起点",
    arc_endpoint: "终点",
    relationship_changes: "关系变化",
    identity_changes: "身份变化",
    setup_episode: "埋设集",
    setup_text: "埋设内容",
    payoff_episode: "回收集",
    payoff_text: "回收内容",
    risk: "风险",
  };
  return labels[key] || key.replaceAll("_", " ");
}

function filterStoryWorkflowNodes(state: StoryWorkflowState | null, page: StoryWorkflowNode["page"]) {
  return state?.nodes.filter((node) => node.page === page) ?? [];
}

function storyNodeStatusText(status: StoryWorkflowArtifact["status"] | "idle" | "running") {
  if (status === "done") return "已完成";
  if (status === "running") return "执行中";
  if (status === "error") return "失败";
  return "未生成";
}

function AssetCardList({
  projectId,
  kind,
  rows,
  records,
  imageZoomEnabled,
  onChange,
  onPersist,
  onOpenRecord,
  onImageEvent,
  onTaskRefresh,
}: {
  projectId: string;
  kind: AssetKind;
  rows: Record<string, string>[];
  records: Record<string, string>[];
  imageZoomEnabled: boolean;
  onChange: (rows: Record<string, string>[]) => void;
  onPersist: (rows: Record<string, string>[]) => void;
  onOpenRecord: (row: Record<string, string>) => void;
  onImageEvent: (level: DevLogLevel, message: string, detail?: string) => void;
  onTaskRefresh: () => void;
}) {
  const [selectedRowIndex, setSelectedRowIndex] = useState(0);
  const [isImportingImage, setIsImportingImage] = useState(false);
  const [generatingAssetIds, setGeneratingAssetIds] = useState<string[]>([]);
  const [runningCandidateUrl, setRunningCandidateUrl] = useState("");
  const [candidateMenu, setCandidateMenu] = useState<{ x: number; y: number; candidate: AssetImageReviewCandidate } | null>(null);
  const [selectedCandidateUrl, setSelectedCandidateUrl] = useState("");
  const [imagePreview, setImagePreview] = useState<{ url: string; x: number; y: number; label: string } | null>(null);
  const imageFileInputRef = useRef<HTMLInputElement | null>(null);
  const selectedRow = rows[selectedRowIndex] ?? rows[0];

  useEffect(() => {
    if (!rows.length) return;
    if (selectedRowIndex > rows.length - 1) setSelectedRowIndex(rows.length - 1);
  }, [rows.length, selectedRowIndex]);

  useEffect(() => {
    setSelectedCandidateUrl("");
    setCandidateMenu(null);
  }, [selectedRowIndex, kind]);

  useEffect(() => {
    if (!candidateMenu) return;
    const close = () => setCandidateMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [candidateMenu]);

  function updateCell(rowIndex: number, column: string, value: string) {
    onChange(rows.map((row, index) => (index === rowIndex ? { ...row, [column]: value } : row)));
  }

  function removeRow(rowIndex: number) {
    const row = rows[rowIndex];
    if (!window.confirm(`删除资产「${row?.name || row?.id || "未命名资产"}」？此操作会从当前资产真源列表移除。`)) return;
    onChange(rows.filter((_, index) => index !== rowIndex));
    setSelectedRowIndex((current) => Math.max(0, Math.min(current, rows.length - 2)));
  }

  function updateSelectedCell(column: string, value: string) {
    if (!selectedRow) return;
    updateCell(selectedRowIndex, column, value);
  }

  function updateSelectedCells(values: Record<string, string>) {
    if (!selectedRow) return;
    onChange(rows.map((row, index) => (index === selectedRowIndex ? { ...row, ...values } : row)));
  }

  function persistSelectedCells(values: Record<string, string>) {
    if (!selectedRow) return;
    onPersist(rows.map((row, index) => (index === selectedRowIndex ? { ...row, ...values } : row)));
  }

  function showImagePreview(url: string, label: string, event: MouseEvent) {
    if (!imageZoomEnabled || !url) return;
    setImagePreview({ url, label, x: event.clientX, y: event.clientY });
  }

  function moveImagePreview(event: MouseEvent) {
    setImagePreview((current) => (current ? { ...current, x: event.clientX, y: event.clientY } : current));
  }

  async function selectImageCandidate(candidate: AssetImageReviewCandidate) {
    if (!candidate.url) return;
    if (!selectedRow || runningCandidateUrl) return;
    setCandidateMenu(null);
    setRunningCandidateUrl(candidate.url);
    try {
      const selected = await selectProjectAssetImage(projectId, kind, selectedRow.id || selectedRow.name || "asset", candidate.url);
      if (selected.bundle) {
        onPersist(normalizeAssetReviewBundle(selected.bundle).trueSources[kind]);
      } else {
        persistSelectedCells({
          selected_image: selected.url,
          image_url: selected.url,
          image_path: selected.path,
          image_updated_at: new Date().toISOString(),
          status: "confirmed",
        });
      }
      onImageEvent("success", "真源图片已更新", `${selectedRow.name || selectedRow.id || "当前资产"} -> ${selected.path}`);
    } catch (error) {
      onImageEvent("error", "真源图片更新失败", error instanceof Error ? error.message : "未知错误");
    } finally {
      setRunningCandidateUrl("");
    }
  }

  async function deleteImageCandidate(candidate: AssetImageReviewCandidate) {
    if (!candidate.url || !selectedRow || runningCandidateUrl) return;
    setCandidateMenu(null);
    if (!window.confirm(`删除候选图「${candidate.label}」？此操作只删除候选文件，不影响已确认真源图。`)) return;
    setRunningCandidateUrl(candidate.url);
    try {
      await deleteProjectAssetCandidateImage(projectId, candidate.url);
      const nextCandidates = getAssetImageCandidates(selectedRow)
        .filter((item) => item.url && item.url !== candidate.url)
        .filter((item) => item.kind === "candidate")
        .map(({ id, label, url }) => ({ id, label, url }));
      persistSelectedCells({ image_candidates: JSON.stringify(nextCandidates) });
      onImageEvent("success", "候选图片已删除", `${selectedRow.name || selectedRow.id || "当前资产"} / ${candidate.label}`);
    } catch (error) {
      onImageEvent("error", "候选图片删除失败", error instanceof Error ? error.message : "未知错误");
    } finally {
      setRunningCandidateUrl("");
    }
  }

  async function copyCandidatePath(candidate: AssetImageReviewCandidate) {
    setCandidateMenu(null);
    try {
      await navigator.clipboard.writeText(candidate.url);
      onImageEvent("success", "候选图片路径已复制", candidate.url);
    } catch {
      onImageEvent("error", "复制失败", candidate.url);
    }
  }

  async function importAssetImage(file: File | undefined) {
    if (!file || !selectedRow || isImportingImage) return;
    setIsImportingImage(true);
    try {
      const uploaded = await uploadProjectAssetImage(projectId, kind, selectedRow.id || selectedRow.name || "asset", file.name, await readFileAsDataUrl(file));
      const selected = await selectProjectAssetImage(projectId, kind, selectedRow.id || selectedRow.name || "asset", uploaded.url);
      const sourceRows = selected.bundle ? normalizeAssetReviewBundle(selected.bundle).trueSources[kind] : rows;
      const sourceRow = sourceRows[selectedRowIndex] ?? selectedRow;
      const candidates = getAssetImageCandidates(sourceRow).filter((candidate) => candidate.url && candidate.kind === "candidate");
      const nextCandidates = [{ id: uploaded.id, label: uploaded.label || file.name, url: uploaded.url }, ...candidates].slice(0, 12);
      const nextRows = sourceRows.map((row, index) => (index === selectedRowIndex ? {
        ...row,
        selected_image: selected.url,
        image_url: selected.url,
        image_path: selected.path,
        image_updated_at: new Date().toISOString(),
        image_candidates: JSON.stringify(nextCandidates),
        status: "confirmed",
      } : row));
      onPersist(nextRows);
      onImageEvent("success", "图片已导入并更新真源", `${selectedRow.name || selectedRow.id || "当前资产"} -> ${selected.path}`);
    } catch (error) {
      onImageEvent("error", "图片导入失败", error instanceof Error ? error.message : "未知错误");
    } finally {
      setIsImportingImage(false);
    }
  }

  async function generateSelectedAssetImage() {
    const assetId = selectedRow.id || selectedRow.name || "asset";
    if (!selectedRow || generatingAssetIds.includes(assetId)) return;
    const prompt = selectedRow.image_prompt || formatAssetDescription(kind, selectedRow);
    if (!prompt.trim()) {
      onImageEvent("error", "缺少生图提示词", selectedRow.name || assetId);
      return;
    }
    setGeneratingAssetIds((current) => [...current, assetId]);
    onTaskRefresh();
    window.setTimeout(onTaskRefresh, 1200);
    try {
      const result = await generateProjectAssetImage(projectId, kind, assetId, prompt);
      onPersist(normalizeAssetReviewBundle(result.bundle).trueSources[kind]);
      onImageEvent("success", "图片已生成并更新真源", `${selectedRow.name || assetId} -> ${result.selected.path}`);
    } catch (error) {
      onImageEvent("error", "图片生成失败", error instanceof Error ? error.message : "未知错误");
    } finally {
      setGeneratingAssetIds((current) => current.filter((id) => id !== assetId));
      onTaskRefresh();
    }
  }

  if (!rows.length) {
    return (
      <div className="empty-state">
        {records.length
          ? `已有 ${records.length} 条${assetKindLabel(kind)}记录，但当前没有资产卡片。可以重新提取记录，或手动新增资产。`
          : `暂无${assetKindLabel(kind)}资产。可以先提取记录，或手动新增资产。`}
      </div>
    );
  }

  const selectedRelatedRecords = selectedRow ? findRelatedRecords(kind, selectedRow, records) : [];
  const selectedCandidates = selectedRow ? getAssetImageCandidates(selectedRow) : [];
  const selectedCandidate = selectedCandidates.find((candidate) => candidate.url === selectedCandidateUrl) ?? null;
  const selectedVersionName = selectedRow
    ? kind === "characters"
      ? selectedRow.name || ""
      : selectedRow.name || ""
    : "";
  const selectedAssetId = selectedRow?.id || selectedRow?.name || "asset";
  const isSelectedGenerating = generatingAssetIds.includes(selectedAssetId);

  return (
    <section className="asset-review-split">
      <section className="asset-table-workbench asset-list-workbench">
        <div className="asset-table-head asset-list-head" role="row">
          <span>已选图片</span>
          <span>资产信息</span>
          <span>当前版本</span>
          <span>{kind === "characters" ? "角色摘要" : "资产摘要"}</span>
        </div>
        {rows.map((row, rowIndex) => {
          const baseName = kind === "characters" ? row.base_name || inferBaseName(row.name) : row.name || "";
          const groupIndex = getAssetGroupIndex(rows, row, kind);
          const isSubVersion = kind === "characters" && rows.findIndex((item) => (item.base_name || inferBaseName(item.name)) === baseName) !== rowIndex;
          const selectedImage = row.selected_image || row.image_url || row.image_path || "";
          const selectedImageUrl = withImageVersion(selectedImage, row.image_updated_at);
          return (
            <article
              className={`asset-table-row asset-list-row ${isSubVersion ? "sub-version" : ""} ${selectedRowIndex === rowIndex ? "selected" : ""}`}
              data-group={groupIndex % 6}
              key={`${row.id || row.name || rowIndex}-${rowIndex}`}
              onClick={() => setSelectedRowIndex(rowIndex)}
            >
              <div className="asset-cell asset-list-image-cell">
                <div
                  className={`asset-list-image-preview ${selectedImage ? "has-image" : ""}`}
                  onMouseEnter={(event) => showImagePreview(selectedImageUrl, row.name || row.id || "已选图片", event)}
                  onMouseMove={moveImagePreview}
                  onMouseLeave={() => setImagePreview(null)}
                >
                  {selectedImage ? (
                    <img src={selectedImageUrl} alt={row.name || row.id || "已选图片"} />
                  ) : (
                    <>
                      <Image size={18} />
                      <span>未选择</span>
                    </>
                  )}
                </div>
              </div>

              <div className="asset-cell asset-info-cell">
                <input
                  className="asset-base-input"
                  value={kind === "characters" ? row.base_name ?? "" : row.name ?? ""}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => updateCell(rowIndex, kind === "characters" ? "base_name" : "name", event.target.value)}
                  placeholder={kind === "characters" ? "基础角色" : `${assetKindLabel(kind)}名称`}
                />
                <div className="asset-info-badges">
                  <span className="asset-type-badge">{assetKindLabel(kind)}</span>
                  <span
                    className={`asset-status-pill ${row.status === "confirmed" || row.status === "locked" ? "confirmed" : "draft"}`}
                  >
                    {row.status === "confirmed" || row.status === "locked" ? "已确认" : "待审"}
                  </span>
                </div>
                <code>{row.id || "待生成"}</code>
              </div>

              <div className="asset-cell asset-version-cell">
                <input
                  className="asset-version-input"
                  value={row.name ?? ""}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => updateCell(rowIndex, "name", event.target.value)}
                  placeholder={`${assetKindLabel(kind)}名称`}
                />
              </div>

              <div className="asset-cell asset-description-cell">
                <textarea
                  className="asset-card-description"
                  value={formatAssetDescription(kind, row)}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => updateAssetDescription(kind, rowIndex, event.target.value, rows, onChange)}
                  spellCheck={false}
                />
              </div>
            </article>
          );
        })}
      </section>

      {selectedRow && (
        <aside className="asset-detail-panel">
          <div className="asset-detail-title">
            <div>
              <span>{assetKindLabel(kind)}生图工作区</span>
              <strong>{selectedRow.name || selectedRow.base_name || "未命名资产"}</strong>
              <small>{selectedRow.id || "待生成 ID"}</small>
            </div>
            <span
              className={`asset-status-pill ${selectedRow.status === "confirmed" || selectedRow.status === "locked" ? "confirmed" : "draft"}`}
            >
              {selectedRow.status === "confirmed" || selectedRow.status === "locked" ? "已确认" : "待审"}
            </span>
          </div>

          <label className="asset-detail-field">
            <span>当前版本</span>
            <input value={selectedVersionName} onChange={(event) => updateSelectedCell("name", event.target.value)} />
          </label>

          <label className="asset-detail-field asset-prompt-editor">
            <span>生图提示词</span>
            <textarea value={selectedRow.image_prompt ?? ""} onChange={(event) => updateSelectedCell("image_prompt", event.target.value)} spellCheck={false} />
          </label>

          <div className="asset-detail-actions">
            <button className="asset-action-button" onClick={() => onOpenRecord(selectedRow)}>
              <Eye size={15} />
              查看依据 {selectedRelatedRecords.length}
            </button>
            <button className="asset-action-button asset-generate-button" disabled={isSelectedGenerating} onClick={() => void generateSelectedAssetImage()}>
              <Sparkles size={15} />
              {isSelectedGenerating ? "生成中" : "生成图片"}
            </button>
            <button
              className="asset-action-button asset-import-button"
              disabled={isImportingImage}
              onClick={() => imageFileInputRef.current?.click()}
            >
              <Upload size={15} />
              {isImportingImage ? "导入中" : "导入图片"}
            </button>
            <input
              ref={imageFileInputRef}
              className="asset-image-file-input"
              type="file"
              accept="image/*"
              disabled={isImportingImage}
              onChange={(event) => {
                void importAssetImage(event.target.files?.[0]);
                event.currentTarget.value = "";
              }}
            />
            <button className="asset-action-button asset-delete-button" onClick={() => removeRow(selectedRowIndex)}>
              <Trash2 size={15} />
              删除资产
            </button>
          </div>

          <div className="asset-image-candidate-section">
            <div className="asset-candidate-header">
              <div>
                <strong>图片候选</strong>
                <span>{selectedCandidates.filter((candidate) => candidate.url).length} 张可选</span>
              </div>
              <div className="asset-candidate-toolbar">
                <button
                  className="asset-set-source-button"
                  disabled={!selectedCandidate || Boolean(runningCandidateUrl)}
                  onClick={() => selectedCandidate && void selectImageCandidate(selectedCandidate)}
                >
                  确认资产
                </button>
              </div>
            </div>
            <div className="asset-image-candidate-grid">
              {selectedCandidates.length ? (
                selectedCandidates.map((candidate) => (
                  <div
                    className={`asset-image-candidate ${candidate.url === selectedCandidateUrl ? "selected" : ""}`}
                    key={candidate.id}
                    onClick={() => setSelectedCandidateUrl(candidate.url)}
                    onMouseEnter={(event) => showImagePreview(toBackendAssetImageUrl(candidate.url), candidate.label, event)}
                    onMouseMove={moveImagePreview}
                    onMouseLeave={() => setImagePreview(null)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      setSelectedCandidateUrl(candidate.url);
                      setCandidateMenu({ x: event.clientX, y: event.clientY, candidate });
                    }}
                  >
                    <div className="asset-image-preview-button">
                      <img src={toBackendAssetImageUrl(candidate.url)} alt={candidate.label} />
                      <span>{candidate.label}</span>
                    </div>
                    {candidate.kind === "candidate" && (
                      <button
                        className="asset-candidate-delete-button"
                        title="删除候选图"
                        onClick={() => void deleteImageCandidate(candidate)}
                        disabled={Boolean(runningCandidateUrl)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="asset-candidate-empty">
                  <Image size={22} />
                  <span>暂无候选图。先导入已有图片，或等生图接口接入后生成。</span>
                </div>
              )}
            </div>
            {candidateMenu && (
              <div
                className="asset-candidate-menu"
                style={{ left: candidateMenu.x, top: candidateMenu.y }}
                onClick={(event) => event.stopPropagation()}
              >
                <button onClick={() => void selectImageCandidate(candidateMenu.candidate)}>列为真源</button>
                <button onClick={() => void copyCandidatePath(candidateMenu.candidate)}>复制路径</button>
                <button className="danger" onClick={() => void deleteImageCandidate(candidateMenu.candidate)}>删除候选</button>
              </div>
            )}
          </div>
        </aside>
      )}
      {imagePreview && (
        <div className="asset-image-hover-preview" style={imagePreviewStyle(imagePreview.x, imagePreview.y)}>
          <img src={imagePreview.url} alt={imagePreview.label} />
          <span>{imagePreview.label}</span>
        </div>
      )}
    </section>
  );
}

function AssetRecordDialog({ title, rows, onClose }: { title: string; rows: Record<string, string>[]; onClose: () => void }) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="资产记录">
      <article className="modal-panel asset-record-modal">
        <div className="drawer-header">
          <div className="panel-title">
            <Database size={18} />
            <span>{title}</span>
            <strong>{rows.length} 条</strong>
          </div>
          <button onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        {rows.length ? (
          <div className="asset-record-list">
            {rows.map((row, index) => (
              <article className="asset-record-item" key={index}>
                {Object.entries(row).map(([key, value]) => (
                  <div key={key}>
                    <strong>{assetColumnLabel(key)}</strong>
                    <p>{value || "空"}</p>
                  </div>
                ))}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">暂无相关记录。</div>
        )}
      </article>
    </div>
  );
}

function ImageConfigPanel({
  config,
  providers,
  backendHasApiKey,
  onRefresh,
  onChange,
}: {
  config: ImageGenerationConfig;
  providers: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onRefresh: () => void;
  onChange: (config: ImageGenerationConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  useEffect(() => {
    setDraft(config);
  }, [config]);

  const activeProvider = providers.find((provider) => provider.id === draft.provider) ?? providers[0];
  const activeModel = activeProvider?.models.find((model) => model.id === draft.model) ?? activeProvider?.models[0];
  const canChooseRuntimeBaseUrl = (activeProvider?.baseUrls.length ?? 0) > 1;

  function withProviderDefaults(provider: ImageProviderCatalog, current: ImageGenerationConfig): ImageGenerationConfig {
    const model = provider.models.find((item) => item.id === current.model) ?? provider.models.find((item) => item.id === provider.defaultModel) ?? provider.models[0];
    return normalizeImageConfig({
      ...current,
      provider: provider.id,
      baseUrl: current.baseUrl && provider.baseUrls.some((item) => item.url === current.baseUrl) ? current.baseUrl : provider.baseUrls[0]?.url ?? current.baseUrl,
      runtimeBaseUrl: provider.baseUrls.length > 1 ? current.runtimeBaseUrl || provider.baseUrls[0]?.url || "" : "",
      model: model?.id ?? current.model,
      aspectRatio: model?.defaultAspectRatio ?? current.aspectRatio,
      imageSize: model?.defaultImageSize ?? "",
      size: model?.defaultSize ?? current.size,
    });
  }

  function withModelDefaults(modelId: string, current: ImageGenerationConfig): ImageGenerationConfig {
    const model = activeProvider?.models.find((item) => item.id === modelId);
    if (!model) return normalizeImageConfig({ ...current, model: modelId });
    return normalizeImageConfig({
      ...current,
      model: model.id,
      aspectRatio: model.defaultAspectRatio,
      imageSize: model.defaultImageSize,
      size: model.defaultSize,
    });
  }

  function update(next: Partial<ImageGenerationConfig>) {
    setDraft((current) => {
      if (next.provider) {
        const provider = providers.find((item) => item.id === next.provider);
        return provider ? withProviderDefaults(provider, { ...current, ...next }) : normalizeImageConfig({ ...current, ...next });
      }
      if (next.model) return withModelDefaults(next.model, { ...current, ...next });
      const merged = normalizeImageConfig({ ...current, ...next });
      const model = activeProvider?.models.find((item) => item.id === merged.model);
      if (next.aspectRatio && model?.sizeMap) {
        return normalizeImageConfig({ ...merged, size: model.sizeMap[next.aspectRatio] ?? merged.size });
      }
      return merged;
    });
  }

  if (!providers.length) {
    return (
      <section className="panel image-config-panel">
        <div className="panel-title">
          <Image size={18} />
          <span>生图配置</span>
          <strong>未加载</strong>
        </div>
        <div className="empty-state">未读取到后端 provider 配置。确认后端已启动后刷新。</div>
        <button className="primary-button" onClick={onRefresh}>
          <RefreshCcw size={16} />
          刷新配置
        </button>
      </section>
    );
  }

  return (
    <section className="panel image-config-panel">
      <div className="panel-title">
        <Image size={18} />
        <span>生图配置</span>
        <strong>{backendHasApiKey ? "Key 已配置" : "缺少 Key"}</strong>
      </div>
      <div className="image-provider-summary">
        <strong>{activeProvider?.name ?? draft.provider}</strong>
        <span>{activeProvider?.description ?? "provider 配置来自后端"}</span>
      </div>
      <div className="image-config-grid provider-config-grid">
        <label>
          商家
          <select value={draft.provider} onChange={(event) => update({ provider: event.target.value })}>
            {providers.map((provider) => (
              <option value={provider.id} key={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          模型
          <select value={draft.model} onChange={(event) => update({ model: event.target.value })}>
            {activeProvider?.models.map((model) => (
              <option value={model.id} key={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        {canChooseRuntimeBaseUrl && (
          <label>
            线路
            <select value={draft.runtimeBaseUrl || draft.baseUrl || activeProvider?.baseUrls[0]?.url || ""} onChange={(event) => update({ runtimeBaseUrl: event.target.value })}>
              {activeProvider?.baseUrls.map((item) => (
                <option value={item.url} key={item.url}>
                  {item.label} / {item.url}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          画幅
          <select value={draft.aspectRatio} onChange={(event) => update({ aspectRatio: event.target.value })}>
            {(activeModel?.aspectRatios ?? [draft.aspectRatio]).map((ratio) => (
              <option value={ratio} key={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>
        {(activeModel?.imageSizes.length ?? 0) > 0 && (
          <label>
            分辨率档位
            <select value={draft.imageSize} onChange={(event) => update({ imageSize: event.target.value })}>
              {activeModel?.imageSizes.map((size) => (
                <option value={size} key={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          请求超时
          <input type="number" min={30} max={900} value={draft.requestTimeout} onChange={(event) => update({ requestTimeout: Number(event.target.value) })} />
        </label>
        <label>
          下载超时
          <input type="number" min={30} max={900} value={draft.downloadTimeout} onChange={(event) => update({ downloadTimeout: Number(event.target.value) })} />
        </label>
      </div>
      <div className="provider-model-note">
        <span>协议：{activeModel?.protocol ?? "未知"}</span>
        <span>输出：{draft.size || activeModel?.defaultSize || "随模型默认"}</span>
        <span>{activeModel?.supportsReferenceImages ? "支持参考图" : "不支持参考图"}</span>
        <span>{activeModel?.supportsMultipleImages ? "可返回多图" : "单图模式"}</span>
      </div>
      <div className="actions-row">
        <button onClick={onRefresh}>
          <RefreshCcw size={16} />
          重新读取
        </button>
        <button className="primary-button" onClick={() => onChange(draft)}>
          <Save size={16} />
          保存配置
        </button>
      </div>
    </section>
  );
}

const assetKindOptions: Array<{ id: AssetKind; label: string }> = [
  { id: "characters", label: "角色" },
  { id: "scenes", label: "场景" },
  { id: "props", label: "道具" },
];

const assetColumnLabels: Record<string, string> = {
  id: "ID",
  name: "名称",
  version_of: "归属角色",
  base_name: "基础名",
  appearance: "外观",
  outfit: "服装",
  first_seen: "首次出现",
  trigger: "触发原因",
  appearance_source: "外观依据",
  plot_source: "剧情依据",
  visual_description: "视觉描述",
  fixed_elements: "固定元素",
  visual_source: "视觉依据",
  holder_or_location: "持有人/位置",
  state_changes: "状态变化",
  description: "描述",
  image_prompt: "生图提示词",
  continuity: "连续性",
  status: "状态",
};

function assetKindLabel(kind: AssetKind) {
  return assetKindOptions.find((item) => item.id === kind)?.label ?? kind;
}

function assetColumnLabel(column: string) {
  return assetColumnLabels[column] ?? column;
}

function countAssetBundleRows(bundle: AssetReviewBundle) {
  const normalized = normalizeAssetReviewBundle(bundle);
  return Object.values(normalized.records).flat().length + Object.values(normalized.trueSources).flat().length;
}

function buildTrueSourceFromRecord(kind: AssetKind, record: Record<string, string>, index: number): AssetTrueSourceItem {
  if (kind === "characters") {
    const baseName = record.version_of || inferBaseName(record.name) || record.name || "";
    return {
      id: record.id || buildAssetId("CHAR", baseName, record.name, index),
      name: record.name || "",
      base_name: baseName,
      appearance: record.appearance || "",
      outfit: record.outfit || "",
      image_prompt: [record.appearance, record.outfit].filter(Boolean).join("，"),
      continuity: "保持同一版本的年龄感、发型、脸型、服装结构和关键配饰一致。",
      status: "draft",
    };
  }
  if (kind === "scenes") {
    return {
      id: record.id || buildAssetId("SCENE", record.name, record.name, index),
      name: record.name || "",
      description: record.visual_description || "",
      fixed_elements: record.fixed_elements || "",
      aliases: record.aliases || "",
      first_seen: record.first_seen || "",
      state_trigger: record.state_trigger || "",
      image_prompt: [record.name, record.visual_description, record.fixed_elements].filter(Boolean).join("，"),
      continuity: "保持空间结构、固定陈设、光源方向和可复用角度一致。",
      status: "draft",
    };
  }
  return {
    id: record.id || buildAssetId("PROP", record.name, record.name, index),
    name: record.name || "",
    description: [record.appearance, record.state_changes].filter(Boolean).join("，"),
    appearance: record.appearance || "",
    aliases: record.aliases || "",
    holder_or_location: record.holder_or_location || "",
    state_changes: record.state_changes || "",
    first_seen: record.first_seen || "",
    plot_role: record.plot_role || "",
    image_prompt: [record.name, record.appearance].filter(Boolean).join("，"),
    continuity: "保持外观、材质、尺寸、持有人和状态变化一致。",
    status: "draft",
  };
}

function createBlankTrueSource(kind: AssetKind, index: number): AssetTrueSourceItem {
  if (kind === "characters") {
    return {
      id: `CHAR_MANUAL_${String(index + 1).padStart(4, "0")}`,
      name: "",
      base_name: "",
      appearance: "",
      outfit: "",
      image_prompt: "",
      continuity: "保持同一版本的年龄感、发型、脸型、服装结构和关键配饰一致。",
      status: "draft",
    };
  }
  if (kind === "scenes") {
    return {
      id: `SCENE_MANUAL_${String(index + 1).padStart(4, "0")}`,
      name: "",
      description: "",
      fixed_elements: "",
      image_prompt: "",
      continuity: "保持空间结构、固定陈设、光源方向和可复用角度一致。",
      status: "draft",
    };
  }
  return {
    id: `PROP_MANUAL_${String(index + 1).padStart(4, "0")}`,
    name: "",
    description: "",
    image_prompt: "",
    continuity: "保持外观、材质、尺寸、持有人和状态变化一致。",
    status: "draft",
  };
}

function buildAssetId(prefix: string, baseName = "", assetName = "", index: number) {
  const slugSource = baseName || inferBaseName(assetName) || assetName || "ASSET";
  const slug = toAssetSlug(slugSource);
  return `${prefix}_${slug}_${String(index + 1).padStart(3, "0")}`;
}

function toAssetSlug(value: string) {
  const ascii = value.trim().replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!ascii) return "ASSET";
  return Array.from(ascii).slice(0, 12).join("").toUpperCase();
}

function inferBaseName(name = "") {
  return name.split(/[-－—_]/)[0]?.trim() || "";
}

function formatAssetDescription(kind: AssetKind, row: Record<string, string>) {
  if (kind === "characters") return [row.appearance, row.outfit].filter(Boolean).join("\n");
  return row.description ?? "";
}

function parseJsonObjectDraft(rawText: string): Record<string, unknown> {
  const trimmed = rawText.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("节点产物必须是 JSON 对象。");
  }
  return parsed as Record<string, unknown>;
}

function updateAssetDescription(
  kind: AssetKind,
  rowIndex: number,
  value: string,
  rows: Record<string, string>[],
  onChange: (rows: Record<string, string>[]) => void,
) {
  if (kind === "characters") {
    const [appearance = "", ...outfitParts] = value.split(/\n/);
    onChange(rows.map((row, index) => (index === rowIndex ? { ...row, appearance, outfit: outfitParts.join("\n") } : row)));
    return;
  }
  onChange(rows.map((row, index) => (index === rowIndex ? { ...row, description: value } : row)));
}

function findRelatedRecords(kind: AssetKind, row: Record<string, string>, records: Record<string, string>[]) {
  const aliases = splitAliases(row.aliases);
  const names = new Set([row.name, row.base_name, inferBaseName(row.name), ...aliases].filter(Boolean));
  const matched = records.filter((record) => {
    if (kind === "characters") return names.has(record.name) || names.has(record.version_of) || names.has(inferBaseName(record.name));
    return names.has(record.name) || splitAliases(record.aliases).some((alias) => names.has(alias));
  });
  return matched.length ? matched : records;
}

function splitAliases(value = "") {
  return value.split(/[,，、/]/).map((item) => item.trim()).filter(Boolean);
}

function getAssetGroupIndex(rows: Record<string, string>[], row: Record<string, string>, kind: AssetKind) {
  const key = kind === "characters" ? row.base_name || inferBaseName(row.name) || row.name : row.name;
  const groups = Array.from(new Set(rows.map((item) => (kind === "characters" ? item.base_name || inferBaseName(item.name) || item.name : item.name))));
  return Math.max(0, groups.indexOf(key));
}

type AssetImageReviewCandidate = {
  id: string;
  label: string;
  url: string;
  kind: "candidate";
};

function getAssetImageCandidates(row: Record<string, string>): AssetImageReviewCandidate[] {
  const parsed = parseImageCandidateList(row.image_candidates);
  const merged = parsed.filter((candidate, index, list) => candidate.url && list.findIndex((item) => item.url === candidate.url) === index);
  return merged.slice(0, 12);
}

function parseImageCandidateList(value?: string): AssetImageReviewCandidate[] {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item, index) => {
        if (typeof item === "string") return { id: `candidate-${index}`, label: `候选 ${index + 1}`, url: item, kind: "candidate" as const };
        if (item && typeof item === "object") {
          const data = item as Record<string, unknown>;
          return {
            id: String(data.id ?? data.candidateId ?? `candidate-${index}`),
            label: String(data.label ?? data.name ?? `候选 ${index + 1}`),
            url: String(data.url ?? data.path ?? data.imageUrl ?? ""),
            kind: "candidate" as const,
          };
        }
        return { id: `candidate-${index}`, label: `候选 ${index + 1}`, url: "", kind: "candidate" as const };
      })
      .filter((item) => item.url);
  } catch {
    return value
      .split(/\n|,/)
      .map((url, index) => ({ id: `candidate-${index}`, label: `候选 ${index + 1}`, url: url.trim(), kind: "candidate" as const }))
      .filter((item) => item.url);
  }
}

function withImageVersion(url: string, version?: string) {
  const resolved = toBackendAssetImageUrl(url);
  if (!resolved || !version) return resolved;
  return `${resolved}${resolved.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`;
}

function imagePreviewStyle(x: number, y: number): CSSProperties {
  const width = 520;
  const height = 380;
  const gap = 18;
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const left = x + gap + width > viewportWidth ? Math.max(12, x - width - gap) : x + gap;
  const top = y + gap + height > viewportHeight ? Math.max(12, viewportHeight - height - 12) : y + gap;
  return { left, top };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function ReviewStat({ label, value, tone }: { label: string; value: number; tone: "normal" | "warning" | "muted" }) {
  return (
    <div className={`review-stat ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PipelineConfigView({
  llmConfig,
  backendHealth,
  backendRulepacks,
  backendPromptLibrary,
  backendLlmLogs,
  backendLlmLogDetail,
  backendPromptContent,
  backendLlmHasApiKey,
  generalConfig,
  imageConfig,
  imageProviders,
  backendImageHasApiKey,
  onRefreshBackendStatus,
  onInspectBackendPrompt,
  onClearBackendLogs,
  onInspectBackendLlmLog,
  onCloseBackendLlmLog,
  onGeneralConfigChange,
  onLlmConfigChange,
  onImageConfigChange,
  onCreatePromptVersion,
  onUpdatePromptVersion,
  onDeletePromptVersion,
  onActivatePromptVersion,
}: {
  llmConfig: LlmExecutorConfig;
  backendHealth: BackendHealth | null;
  backendRulepacks: BackendRulepack[];
  backendPromptLibrary: BackendPromptLibrary;
  backendLlmLogs: BackendLlmLog[];
  backendLlmLogDetail: BackendLlmLog | null;
  backendPromptContent: string;
  backendLlmHasApiKey: boolean;
  generalConfig: BackendSettings["general"];
  imageConfig: ImageGenerationConfig;
  imageProviders: ImageProviderCatalog[];
  backendImageHasApiKey: boolean;
  onRefreshBackendStatus: () => void;
  onInspectBackendPrompt: (promptId: string) => void;
  onClearBackendLogs: () => void;
  onInspectBackendLlmLog: (logId: string) => void;
  onCloseBackendLlmLog: () => void;
  onGeneralConfigChange: (config: BackendSettings["general"]) => void;
  onLlmConfigChange: (config: LlmExecutorConfig) => void;
  onImageConfigChange: (config: ImageGenerationConfig) => void;
  onCreatePromptVersion: (input: { promptId: string; sourceVersionId?: string; name?: string; description?: string; content?: string }) => void;
  onUpdatePromptVersion: (versionId: string, input: { name?: string; description?: string; content?: string }) => void;
  onDeletePromptVersion: (versionId: string) => void;
  onActivatePromptVersion: (promptId: string, versionId: string) => void;
}) {
  const [activeConfigTab, setActiveConfigTab] = useState<"basic" | "llm" | "image" | "rules" | "prompts">("basic");

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>模型与流程设置</h2>
          <p>这里只放运行前必须配置的内容。管线细节放到开发诊断里，不打扰日常操作。</p>
        </div>
      </div>

      <div className="config-tab-bar" role="tablist" aria-label="流程配置分类">
        <button className={activeConfigTab === "basic" ? "active" : ""} onClick={() => setActiveConfigTab("basic")} role="tab">
          <ClipboardList size={17} />
          基本配置
        </button>
        <button className={activeConfigTab === "llm" ? "active" : ""} onClick={() => setActiveConfigTab("llm")} role="tab">
          <Sparkles size={17} />
          文本 API
        </button>
        <button className={activeConfigTab === "image" ? "active" : ""} onClick={() => setActiveConfigTab("image")} role="tab">
          <Image size={17} />
          生图 API
        </button>
        <button className={activeConfigTab === "rules" ? "active" : ""} onClick={() => setActiveConfigTab("rules")} role="tab">
          <Package size={17} />
          后端规则
        </button>
        <button className={activeConfigTab === "prompts" ? "active" : ""} onClick={() => setActiveConfigTab("prompts")} role="tab">
          <Edit3 size={17} />
          提示词模板
        </button>
      </div>

      {activeConfigTab === "basic" && (
        <section className="settings-layout" role="tabpanel">
          <BasicConfigForm config={generalConfig} onChange={onGeneralConfigChange} />
        </section>
      )}

      {activeConfigTab === "llm" && (
        <section className="settings-layout" role="tabpanel">
          <LlmConfigForm config={llmConfig} backendHasApiKey={backendLlmHasApiKey} onChange={onLlmConfigChange} />
          <RunHealthPanel config={llmConfig} backendHealth={backendHealth} onRefresh={onRefreshBackendStatus} />
        </section>
      )}

      {activeConfigTab === "image" && (
        <section className="settings-layout" role="tabpanel">
          <ImageProviderCredentialForm
            config={imageConfig}
            providers={imageProviders}
            backendHasApiKey={backendImageHasApiKey}
            onChange={onImageConfigChange}
          />
          <ImageApiHealthPanel config={imageConfig} providers={imageProviders} backendHasApiKey={backendImageHasApiKey} onRefresh={onRefreshBackendStatus} />
        </section>
      )}

      {activeConfigTab === "rules" && (
        <BackendRulepackPanel
          rulepacks={backendRulepacks}
          promptContent={backendPromptContent}
          logs={backendLlmLogs}
          logDetail={backendLlmLogDetail}
          onInspectPrompt={onInspectBackendPrompt}
          onRefresh={onRefreshBackendStatus}
          onClearLogs={onClearBackendLogs}
          onInspectLog={onInspectBackendLlmLog}
          onCloseLogDetail={onCloseBackendLlmLog}
        />
      )}

      {activeConfigTab === "prompts" && (
        <BackendPromptTemplatePanel
          library={backendPromptLibrary}
          onCreateVersion={onCreatePromptVersion}
          onUpdateVersion={onUpdatePromptVersion}
          onDeleteVersion={onDeletePromptVersion}
          onActivateVersion={onActivatePromptVersion}
        />
      )}

    </section>
  );
}

function BackendPromptTemplatePanel({
  library,
  onCreateVersion,
  onUpdateVersion,
  onDeleteVersion,
  onActivateVersion,
}: {
  library: BackendPromptLibrary;
  onCreateVersion: (input: { promptId: string; sourceVersionId?: string; name?: string; description?: string; content?: string }) => void;
  onUpdateVersion: (versionId: string, input: { name?: string; description?: string; content?: string }) => void;
  onDeleteVersion: (versionId: string) => void;
  onActivateVersion: (promptId: string, versionId: string) => void;
}) {
  const categories = useMemo(() => buildPromptTemplateCategories(library.groups), [library.groups]);
  const [activeCategoryId, setActiveCategoryId] = useState("story");
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0];
  const visibleGroups = activeCategory?.groups ?? [];
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const selectedGroup = visibleGroups.find((group) => group.prompt.id === selectedPromptId) ?? visibleGroups[0] ?? library.groups[0];
  const versions = selectedGroup ? [selectedGroup.official, ...selectedGroup.userVersions] : [];
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const selectedVersion = versions.find((version) => version.id === selectedVersionId)
    ?? versions.find((version) => version.id === selectedGroup?.activeVersionId)
    ?? versions[0];
  const [draft, setDraft] = useState<BackendPromptVersion | null>(selectedVersion ? { ...selectedVersion } : null);

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0]?.id ?? "story");
    }
  }, [categories, activeCategoryId]);

  useEffect(() => {
    if (!visibleGroups.length) {
      setSelectedPromptId("");
      return;
    }
    if (!visibleGroups.some((group) => group.prompt.id === selectedPromptId)) {
      setSelectedPromptId(visibleGroups[0].prompt.id);
    }
  }, [visibleGroups, selectedPromptId]);

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedVersionId("");
      return;
    }
    if (!versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(selectedGroup.activeVersionId || selectedGroup.official.id);
    }
  }, [selectedGroup?.prompt.id, selectedGroup?.activeVersionId, versions.length, selectedVersionId]);

  useEffect(() => {
    setDraft(selectedVersion ? { ...selectedVersion } : null);
  }, [selectedVersion?.id]);

  function createUserVersion() {
    if (!selectedGroup || !selectedVersion) return;
    onCreateVersion({
      promptId: selectedGroup.prompt.id,
      sourceVersionId: selectedVersion.id,
      name: `${selectedVersion.name.replace(/^官方 - /, "")} 用户版`,
      description: selectedVersion.description,
      content: selectedVersion.content,
    });
  }

  function saveDraft() {
    if (!draft || draft.readonly) return;
    onUpdateVersion(draft.id, {
      name: draft.name,
      description: draft.description,
      content: draft.content,
    });
  }

  function deleteDraft() {
    if (!draft || draft.readonly) return;
    if (!window.confirm(`删除提示词版本“${draft.name}”？`)) return;
    onDeleteVersion(draft.id);
  }

  const activeVersion = versions.find((version) => version.id === selectedGroup?.activeVersionId);

  return (
    <article className="panel prompt-template-panel">
      <div className="panel-title">
        <Edit3 size={18} />
        <span>提示词模板</span>
        <strong>{library.groups.length} 个模板 / {library.groups.reduce((count, group) => count + 1 + group.userVersions.length, 0)} 个版本</strong>
      </div>
      <div className="prompt-template-layout">
        <aside className="prompt-template-sidebar">
          <div className="compact-section-title">
            <strong>模板分类</strong>
            <span>按执行用途归类</span>
          </div>
          {categories.map((category) => (
            <button key={category.id} className={category.id === activeCategoryId ? "active" : ""} onClick={() => setActiveCategoryId(category.id)}>
              <strong>{category.title}</strong>
              <span>{category.groups.length} 个模板</span>
            </button>
          ))}
        </aside>

        <section className="prompt-template-list">
          <div className="compact-section-title">
            <strong>{activeCategory?.title ?? "模板"}</strong>
            <span>选择要配置的 Prompt</span>
          </div>
          {visibleGroups.map((group) => {
            const current = [group.official, ...group.userVersions].find((version) => version.id === group.activeVersionId) ?? group.official;
            return (
              <button
                key={group.prompt.id}
                className={group.prompt.id === selectedGroup?.prompt.id ? "active" : ""}
                onClick={() => setSelectedPromptId(group.prompt.id)}
              >
                <strong>{getBackendPromptTitle(group.prompt.stage)}</strong>
                <span>{getBackendPromptDescription(group.prompt.stage)}</span>
                <small>当前：{current.name}</small>
                <small>{group.prompt.stage} / {group.prompt.name}.md</small>
              </button>
            );
          })}
          {!visibleGroups.length && <div className="empty-state">当前分类暂无模板。</div>}
        </section>

        <section className="prompt-template-editor">
          {selectedGroup && draft ? (
            <>
              <div className="prompt-editor-top">
                <div>
                  <strong>{getBackendPromptTitle(selectedGroup.prompt.stage)}</strong>
                  <p>{getBackendPromptDescription(selectedGroup.prompt.stage)}</p>
                  <small>{selectedGroup.prompt.id}</small>
                </div>
                <label>
                  版本
                  <select value={selectedVersion?.id ?? ""} onChange={(event) => setSelectedVersionId(event.target.value)}>
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {formatPromptVersionLabel(version)}{version.id === selectedGroup.activeVersionId ? "（当前）" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="prompt-version-toolbar">
                <span className={`prompt-version-badge ${draft.readonly ? "official" : "user"}`}>{draft.readonly ? "官方只读" : "用户版本"}</span>
                <span>当前启用：{activeVersion?.name ?? "官方版本"}</span>
                <button onClick={createUserVersion}>
                  <Plus size={16} />
                  新建用户版本
                </button>
                <button onClick={() => onActivateVersion(selectedGroup.prompt.id, draft.id)} disabled={draft.id === selectedGroup.activeVersionId}>
                  <CheckCircle2 size={16} />
                  设为当前
                </button>
              </div>

              <div className="prompt-field-grid">
                <label>
                  版本名称
                  <input value={draft.name} readOnly={draft.readonly} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label>
                  说明
                  <input value={draft.description} readOnly={draft.readonly} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                </label>
              </div>

              <div className="prompt-variable-row">
                <span>变量</span>
                {(draft.variables.length ? draft.variables : selectedGroup.prompt.variables).map((variable) => (
                  <code key={variable}>{`{{${variable}}}`}</code>
                ))}
                {!draft.variables.length && !selectedGroup.prompt.variables.length && <small>无变量</small>}
              </div>

              <label className="prompt-content-editor">
                Prompt 内容
                <textarea
                  value={draft.content}
                  readOnly={draft.readonly}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  spellCheck={false}
                />
              </label>

              <div className="config-actions">
                <button className="primary-button" onClick={saveDraft} disabled={draft.readonly}>
                  <Save size={16} />
                  保存版本
                </button>
                <button onClick={deleteDraft} disabled={draft.readonly}>
                  <Trash2 size={16} />
                  删除版本
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">后端还没有可配置的提示词模板。</div>
          )}
        </section>
      </div>
    </article>
  );
}

function buildPromptTemplateCategories(groups: BackendPromptTemplateGroup[]) {
  const categoryDefs = [
    { id: "story", title: "分镜工作流", match: (stage: string) => stage.startsWith("story_workflow_") },
    { id: "asset", title: "资产提取", match: (stage: string) => stage.startsWith("asset_extract_") },
    { id: "script", title: "剧本校检", match: (stage: string) => stage === "script_check" || stage === "script_split" },
    { id: "other", title: "其他规则", match: (_stage: string) => true },
  ];
  const used = new Set<string>();
  return categoryDefs.map((category) => {
    const matched = groups.filter((group) => !used.has(group.prompt.id) && category.match(group.prompt.stage));
    matched.forEach((group) => used.add(group.prompt.id));
    return { id: category.id, title: category.title, groups: matched };
  }).filter((category) => category.groups.length > 0 || category.id !== "other");
}

function formatPromptVersionLabel(version: BackendPromptVersion) {
  const sourceLabel = version.source === "official" ? "官方" : "用户";
  const name = version.source === "official" ? version.name.replace(/^官方\s*[-－]\s*/, "") : version.name;
  return `${sourceLabel} - ${name}`;
}

type TaskRecordItem = {
  id: string;
  logIds?: string[];
  category: "llm" | "image";
  type: string;
  model: string;
  platform: string;
  startedAt: string;
  endedAt: string;
  status: "running" | "success" | "error" | "warning" | "info";
  summary: string;
  raw: BackendLlmLog | BackendImageLog | BackendImageTask;
};

function TaskRecordView({
  llmLogs,
  imageLogs,
  imageTasks,
  llmDetail,
  imageDetail,
  onRefresh,
  onInspectLlmLog,
  onInspectImageLog,
  onClearAll,
}: {
  llmLogs: BackendLlmLog[];
  imageLogs: BackendImageLog[];
  imageTasks: BackendImageTask[];
  llmDetail: BackendLlmLog | null;
  imageDetail: BackendImageLog | null;
  onRefresh: () => void;
  onInspectLlmLog: (logId: string) => void;
  onInspectImageLog: (logId: string) => void;
  onClearAll: () => void;
}) {
  const records = useMemo(() => buildTaskRecords(llmLogs, imageLogs, imageTasks), [llmLogs, imageLogs, imageTasks]);
  const [activeCategory, setActiveCategory] = useState<"llm" | "image">("llm");
  const [selectedId, setSelectedId] = useState("");
  const filtered = records.filter((record) => record.category === activeCategory);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0] ?? records[0];

  useEffect(() => {
    if (selected) setSelectedId(selected.id);
  }, [activeCategory, records.length]);

  useEffect(() => {
    if (!selected) return;
    if (selected.category === "llm") onInspectLlmLog(selected.id);
    if (selected.category === "image") {
      const logId = selected.logIds?.[selected.logIds.length - 1];
      if (logId) onInspectImageLog(logId);
    }
  }, [selected?.id]);

  const detail = selected?.category === "llm" ? llmDetail : selected?.category === "image" ? imageDetail ?? selected.raw : null;
  const selectedExecutionLogs = selected?.category === "image" ? imageLogs.filter((log) => selected.logIds?.includes(log.id)) : [];

  return (
    <section className="page-stack task-record-page">
      <div className="page-header work-header">
        <div>
          <h2>任务记录</h2>
          <p>按用户触发的一次操作记录耗时任务，用来检查输入、输出、产物和失败原因。</p>
        </div>
        <div className="actions-row">
          <button onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </button>
          <button onClick={onClearAll}>
            <Trash2 size={16} />
            清空
          </button>
        </div>
      </div>
      <section className="task-record-layout">
        <article className="panel task-record-list-panel">
          <div className="panel-title">
            <Terminal size={18} />
            <span>任务记录列表</span>
            <strong>共 {records.length} 条任务记录（LLM: {records.filter((item) => item.category === "llm").length}，图片: {records.filter((item) => item.category === "image").length}）</strong>
          </div>
          <div className="task-record-tabs">
            <button className={activeCategory === "llm" ? "active" : ""} onClick={() => setActiveCategory("llm")}>
              语言模型
            </button>
            <button className={activeCategory === "image" ? "active" : ""} onClick={() => setActiveCategory("image")}>
              图片生成
            </button>
          </div>
          <div className="task-record-table">
            <div className="task-record-head">
              <span>任务类型</span>
              <span>模型/引擎</span>
              <span>平台</span>
              <span>开始时间</span>
              <span>结束时间</span>
              <span>状态</span>
            </div>
            {filtered.map((record) => (
              <button key={record.id} className={`task-record-row ${selected?.id === record.id ? "active" : ""}`} onClick={() => setSelectedId(record.id)}>
                <span>{record.type}</span>
                <span>{record.model || "-"}</span>
                <span>{record.platform || "-"}</span>
                <span>{formatTaskTime(record.startedAt)}</span>
                <span>{formatTaskTime(record.endedAt)}</span>
                <span className={`task-status ${record.status}`}>{taskStatusLabel(record.status)}</span>
              </button>
            ))}
            {!filtered.length && <div className="empty-state">暂无此类任务记录。</div>}
          </div>
        </article>
        <article className="panel task-record-detail-panel">
          <div className="panel-title">
            <ClipboardList size={18} />
            <span>任务详情</span>
            <strong>{selected?.id ?? "未选择"}</strong>
          </div>
          {selected ? <TaskRecordDetail record={selected} detail={detail} executionLogs={selectedExecutionLogs} /> : <div className="empty-state">选择左侧任务查看详情。</div>}
        </article>
      </section>
    </section>
  );
}

function TaskRecordDetail({ record, detail, executionLogs }: { record: TaskRecordItem; detail: BackendLlmLog | BackendImageLog | BackendImageTask | null; executionLogs: BackendImageLog[] }) {
  const inputText = record.category === "llm"
    ? formatLlmInput(detail as BackendLlmLog | null)
    : formatImageInput(record.raw, detail);
  const outputText = record.category === "llm"
    ? formatLlmOutput(detail as BackendLlmLog | null)
    : formatImageOutput(record.raw, detail);
  const executionText = formatExecutionLog(record, detail, executionLogs);
  return (
    <div className="task-detail-body">
      <div className="task-detail-meta">
        <span>任务类型：{record.type}</span>
        <span>模型：{record.model || "-"}</span>
        <span>平台：{record.platform || "-"}</span>
        <span>状态：{taskStatusLabel(record.status)}</span>
      </div>
      <TaskDetailBlock title={record.category === "image" ? "正向提示词" : "输入内容"} tone="blue" text={inputText} />
      <TaskDetailBlock title="输出结果" tone="green" text={outputText} />
      <TaskDetailBlock title="执行日志" tone="yellow" text={executionText} />
    </div>
  );
}

function TaskDetailBlock({ title, tone, text }: { title: string; tone: "blue" | "green" | "yellow"; text: string }) {
  return (
    <section className={`task-detail-block ${tone}`}>
      <h3>{title}</h3>
      <pre>{text || "暂无记录。"}</pre>
    </section>
  );
}

function buildTaskRecords(llmLogs: BackendLlmLog[], imageLogs: BackendImageLog[], imageTasks: BackendImageTask[]): TaskRecordItem[] {
  const llmRecords = llmLogs.map((log) => ({
    id: log.id,
    category: "llm" as const,
    type: log.label || getBackendPromptTitle(log.stageId || "") || "LLM 任务",
    model: log.model || "",
    platform: log.baseUrl || "custom",
    startedAt: log.time,
    endedAt: log.time,
    status: log.level,
    summary: log.message,
    raw: log,
  }));
  const imageRecords = buildImageTaskRecords(imageLogs, imageTasks);
  return [...llmRecords, ...imageRecords].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function buildImageTaskRecords(imageLogs: BackendImageLog[], imageTasks: BackendImageTask[]): TaskRecordItem[] {
  const groups = new Map<string, BackendImageLog[]>();
  for (const log of imageLogs) {
    const key = log.taskId || inferImageTaskKey(log);
    groups.set(key, [log, ...(groups.get(key) ?? [])]);
  }
  if (imageTasks.length) {
    return imageTasks.map((task) => {
      const logs = groups.get(task.taskId) ?? [];
      return {
        id: task.taskId,
        logIds: logs.map((log) => log.id),
        category: "image" as const,
        type: task.type || "生图任务",
        model: task.model || "",
        platform: task.provider || task.baseUrl || "",
        startedAt: task.startedAt,
        endedAt: task.endedAt || task.updatedAt || "",
        status: task.status,
        summary: task.message || task.status,
      raw: task,
      };
    });
  }
  return Array.from(groups.entries()).map(([key, logs]) => {
    const ordered = logs.slice().sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const finalLog = ordered.find((log) => log.level === "success" || log.level === "error") ?? ordered[ordered.length - 1];
    const firstLog = ordered[0] ?? finalLog;
    return {
      id: key,
      logIds: ordered.map((log) => log.id),
      category: "image" as const,
      type: "生图任务",
      model: finalLog.model || firstLog.model || "",
      platform: finalLog.provider || firstLog.provider || finalLog.baseUrl || firstLog.baseUrl || "",
      startedAt: firstLog.time,
      endedAt: finalLog.time,
      status: finalLog.level,
      summary: finalLog.message,
      raw: finalLog,
    };
  });
}

function inferImageTaskKey(log: BackendImageLog) {
  const date = new Date(log.time);
  const bucket = Number.isNaN(date.getTime()) ? log.time : Math.floor(date.getTime() / 120000).toString();
  return `image-${log.provider || "provider"}-${log.model || "model"}-${bucket}`;
}

function formatTaskTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function taskStatusLabel(status: TaskRecordItem["status"]) {
  if (status === "running") return "运行中";
  if (status === "success") return "成功";
  if (status === "error") return "失败";
  if (status === "warning") return "警告";
  return "记录";
}

function formatLlmInput(log: BackendLlmLog | null) {
  if (!log) return "";
  if (log.messages?.length) return log.messages.map((message) => `${message.role}:\n${message.content}`).join("\n\n");
  if (log.messagesPreview?.length) return log.messagesPreview.map((message) => `${message.role}（${message.chars} 字）:\n${message.preview}`).join("\n\n");
  return [log.label, log.detail].filter(Boolean).join("\n");
}

function formatLlmOutput(log: BackendLlmLog | null) {
  if (!log) return "";
  return log.responseText || log.responsePreview || log.message || "";
}

function formatImageInput(raw: BackendLlmLog | BackendImageLog | BackendImageTask | null, detail: BackendLlmLog | BackendImageLog | BackendImageTask | null) {
  const source = (raw || detail) as Partial<BackendImageLog & BackendImageTask> | null;
  if (!source) return "";
  return source.promptPreview || (source.payload ? JSON.stringify(source.payload, null, 2) : source.detail || "");
}

function formatImageOutput(raw: BackendLlmLog | BackendImageLog | BackendImageTask | null, detail: BackendLlmLog | BackendImageLog | BackendImageTask | null) {
  const source = (raw || detail) as Partial<BackendImageLog & BackendImageTask> | null;
  if (!source) return "";
  const selected = source.selected;
  const candidates = source.candidates ?? [];
  return [
    source.imageCount !== undefined ? `图片数量：${source.imageCount}` : "",
    selected?.path ? `真源文件：${selected.path}` : "",
    selected?.url ? `真源地址：${selected.url}` : "",
    candidates.length ? `候选图片：\n${candidates.map((item, index) => `${index + 1}. ${item.path || item.url || item.label || item.id}`).join("\n")}` : "",
    source.url ? `请求地址：${source.url}` : "",
    source.statusCode ? `HTTP ${source.statusCode}` : "",
    source.detail || "",
  ].filter(Boolean).join("\n");
}

function formatExecutionLog(record: TaskRecordItem, detail: BackendLlmLog | BackendImageLog | BackendImageTask | null, executionLogs: BackendImageLog[] = []) {
  if (executionLogs.length) {
    return executionLogs
      .slice()
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map((log) => `[${formatTaskTime(log.time)}] ${taskStatusLabel(log.level)} ${log.message}${log.detail ? `\n${log.detail}` : ""}`)
      .join("\n");
  }
  const lines = [
    `[${formatTaskTime(record.startedAt)}] ${record.summary}`,
    detail?.baseUrl ? `Base URL: ${detail.baseUrl}` : "",
    detail?.model ? `Model: ${detail.model}` : "",
    "provider" in (detail || {}) && (detail as BackendImageLog).provider ? `Provider: ${(detail as BackendImageLog).provider}` : "",
    "protocol" in (detail || {}) && (detail as BackendImageLog).protocol ? `Protocol: ${(detail as BackendImageLog).protocol}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function BackendRulepackPanel({
  rulepacks,
  promptContent,
  logs,
  logDetail,
  onInspectPrompt,
  onRefresh,
  onClearLogs,
  onInspectLog,
  onCloseLogDetail,
}: {
  rulepacks: BackendRulepack[];
  promptContent: string;
  logs: BackendLlmLog[];
  logDetail: BackendLlmLog | null;
  onInspectPrompt: (promptId: string) => void;
  onRefresh: () => void;
  onClearLogs: () => void;
  onInspectLog: (logId: string) => void;
  onCloseLogDetail: () => void;
}) {
  const prompts = rulepacks.flatMap((pack) => pack.prompts.map((prompt) => ({ ...prompt, packName: pack.name })));
  return (
    <article className="panel backend-rulepack-panel">
      <div className="panel-title">
        <Package size={18} />
        <span>后端规则包与调用日志</span>
        <strong>{rulepacks.length} 个规则包 / {prompts.length} 个 Prompt</strong>
        <button onClick={onRefresh}>
          <RefreshCcw size={15} />
          刷新规则包
        </button>
      </div>
      <div className="backend-rulepack-layout">
        <section className="backend-prompt-list">
          <div className="compact-section-title">
            <strong>规则包诊断</strong>
            <span>只读扫描本地 rulepacks 目录</span>
          </div>
          {prompts.map((prompt) => (
            <button key={prompt.id} onClick={() => onInspectPrompt(prompt.id)}>
              <strong>{getBackendPromptTitle(prompt.stage)}</strong>
              <span>{getBackendPromptDescription(prompt.stage)}</span>
              <small>{prompt.stage} / {prompt.packName}/{prompt.name}.md</small>
              <small>{prompt.variables.length ? prompt.variables.map((item) => `{{${item}}}`).join("、") : "无变量"}</small>
            </button>
          ))}
          {!prompts.length && <div className="empty-state">后端还没有扫描到规则包。</div>}
        </section>
        <section className="backend-prompt-preview">
          <div className="compact-section-title">
            <strong>当前 Prompt 预览</strong>
            <span>{backendApiBaseUrl}</span>
          </div>
          <textarea value={promptContent || "点击左侧 Prompt 查看当前启用版本内容。编辑请到“提示词模板”。"} readOnly spellCheck={false} />
        </section>
        <section className="backend-log-preview">
          <div className="compact-section-title">
            <strong>后端 LLM 日志</strong>
            <button onClick={onClearLogs}>
              <Trash2 size={15} />
              清空
            </button>
          </div>
          <div className="backend-log-list">
            {logs.map((log) => (
              <article key={log.id} className={`backend-log-item ${log.level}`}>
                <div>
                  <strong>{log.label ?? log.stageId ?? "LLM"}</strong>
                  <span>{log.statusCode ? `HTTP ${log.statusCode}` : log.level}</span>
                  {log.durationMs !== undefined && <span>{log.durationMs}ms</span>}
                </div>
                <p>{log.message}</p>
                <small>{log.model} / {log.baseUrl}</small>
                {log.request && <small>输入：system {log.request.systemChars ?? 0} 字，user {log.request.userChars ?? 0} 字</small>}
                {log.responseChars !== undefined && <small>输出：{log.responseChars} 字</small>}
                <button onClick={() => onInspectLog(log.id)}>
                  <Eye size={15} />
                  详情
                </button>
              </article>
            ))}
            {!logs.length && <div className="empty-state">暂无后端 LLM 调用。</div>}
          </div>
        </section>
      </div>
      {logDetail && <BackendLlmLogDialog log={logDetail} onClose={onCloseLogDetail} />}
    </article>
  );
}

function BackendLlmLogDialog({ log, onClose }: { log: BackendLlmLog; onClose: () => void }) {
  const responseText = log.responseText || log.responsePreview || "";
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="LLM 调用详情">
      <article className="modal-panel llm-log-modal">
        <div className="drawer-header">
          <div className="panel-title">
            <Terminal size={18} />
            <span>{log.label ?? log.stageId ?? "LLM 调用详情"}</span>
            <strong>{log.durationMs ?? 0}ms</strong>
          </div>
          <button onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="llm-log-meta">
          <span>{log.model}</span>
          <span>{log.promptId}</span>
          <span>{log.statusCode ? `HTTP ${log.statusCode}` : log.level}</span>
          <span>{log.time}</span>
        </div>
        <div className="llm-log-detail-grid">
          <label>
            输入 messages
            <textarea
              value={(log.messages ?? []).map((message) => `### ${message.role}\n${message.content}`).join("\n\n") || "无完整输入。"}
              readOnly
              spellCheck={false}
            />
          </label>
          <label>
            输出 response
            <textarea value={responseText || "无完整输出。"} readOnly spellCheck={false} />
          </label>
        </div>
      </article>
    </div>
  );
}

const backendPromptStageCopy: Record<string, { title: string; description: string }> = {
  script_check: { title: "剧本轻度校检", description: "检查标点、场次、名称、断行等疑点。" },
  script_split: { title: "合集分集规则", description: "识别全集剧本里的分集边界。" },
  asset_extract_characters: { title: "角色资产识别", description: "从剧本文本提取角色资产候选。" },
  asset_extract_scenes: { title: "场景资产识别", description: "从剧本文本提取空间、场景资产候选。" },
  asset_extract_props: { title: "道具资产识别", description: "从剧本文本提取关键道具资产候选。" },
  story_workflow_story_map: { title: "剧情地图", description: "提取剧情大纲、章节地图和关键转折。" },
  story_workflow_character_summary: { title: "角色概要", description: "提取角色功能、身份视觉阶段、关系变化和认知状态。" },
  story_workflow_continuity: { title: "信息连续性", description: "提取伏笔、母题和跨集状态风险。" },
  story_workflow_series_summary: { title: "全集概要", description: "由后端机械合并剧情地图、角色概要、信息连续性，不做剧情判断。" },
  story_workflow_chapter_summary: { title: "章节概要", description: "生成章节任务和每集标题/一句话梗概。" },
  story_workflow_episode_summary: { title: "单集概要", description: "明确本集任务、情绪、钩子和镜头强调点。" },
  "story_workflow_episode_summary_integrated": { title: "集场一体", description: "一次调用同时生成单集概要和场次概要。" },
  story_workflow_scene_summary: { title: "场次概要", description: "补足场内调度、潜台词和连续性边界。" },
  story_workflow_storyboard_design: { title: "分块规划", description: "按场拆成可生产的视频生成块。" },
  story_workflow_video_prompt: { title: "视频提示词", description: "把视频生成块转换为视频模型提示词草案。" },
};

function getBackendPromptTitle(stage: string) {
  return backendPromptStageCopy[stage]?.title ?? stage;
}

function getBackendPromptDescription(stage: string) {
  return backendPromptStageCopy[stage]?.description ?? "本地规则文件。";
}

function RunHealthPanel({
  config,
  backendHealth,
  onRefresh,
}: {
  config: LlmExecutorConfig;
  backendHealth: BackendHealth | null;
  onRefresh: () => void;
}) {
  return (
    <article className="panel run-health-panel">
      <div className="panel-title">
        <Terminal size={18} />
        <span>运行状态</span>
        <button onClick={onRefresh}>
          <RefreshCcw size={15} />
          刷新
        </button>
      </div>
      <div className="run-health-list">
        <div className={backendHealth?.status === "ok" ? "health-item done" : "health-item warning"}>
          {backendHealth?.status === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{backendHealth?.status === "ok" ? "后端服务在线" : "后端状态未知"}</strong>
            <span>{backendApiBaseUrl}</span>
          </div>
        </div>
        <div className={config.hasApiKey ? "health-item done" : "health-item warning"}>
          {config.hasApiKey ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{config.hasApiKey ? "真实接口已配置" : "缺少 API Key"}</strong>
            <span>{config.baseUrl} / {config.model}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ImageApiHealthPanel({
  config,
  providers,
  backendHasApiKey,
  onRefresh,
}: {
  config: ImageGenerationConfig;
  providers: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onRefresh: () => void;
}) {
  const provider = providers.find((item) => item.id === config.provider);
  return (
    <article className="panel run-health-panel">
      <div className="panel-title">
        <Terminal size={18} />
        <span>生图接口状态</span>
        <button onClick={onRefresh}>
          <RefreshCcw size={15} />
          刷新
        </button>
      </div>
      <div className="run-health-list">
        <div className={provider ? "health-item done" : "health-item warning"}>
          {provider ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{provider ? provider.name : "未读取到商家配置"}</strong>
            <span>{provider?.description ?? "检查 providerpacks/image 配置。"}</span>
          </div>
        </div>
        <div className={backendHasApiKey ? "health-item done" : "health-item warning"}>
          {backendHasApiKey ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{backendHasApiKey ? "API Key 已配置" : "缺少 API Key"}</strong>
            <span>{config.baseUrl || "未配置默认 Base URL"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function ImageProviderCredentialForm({
  config,
  providers,
  backendHasApiKey,
  onChange,
}: {
  config: ImageGenerationConfig;
  providers: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onChange: (config: ImageGenerationConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState("");
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(false);

  useEffect(() => {
    setDraft({ ...config, apiKey: backendHasApiKey ? "******" : "" });
    setIsKeyVisible(false);
  }, [config, backendHasApiKey]);

  const activeProvider = providers.find((provider) => provider.id === draft.provider) ?? providers[0];

  function update(next: Partial<ImageGenerationConfig>) {
    setDraft((current) => {
      const merged = normalizeImageConfig({ ...current, ...next, hasApiKey: backendHasApiKey });
      if (next.provider) {
        const provider = providers.find((item) => item.id === next.provider);
        if (!provider) return merged;
        return normalizeImageConfig({
          ...merged,
          provider: provider.id,
          baseUrl: provider.baseUrls[0]?.url ?? merged.baseUrl,
          runtimeBaseUrl: "",
          model: provider.defaultModel,
        });
      }
      return merged;
    });
    setMessage("");
  }

  function saveConfig() {
    const apiKey = draft.apiKey === "******" ? "" : draft.apiKey;
    onChange(normalizeImageConfig({ ...draft, apiKey, hasApiKey: backendHasApiKey || Boolean(apiKey?.trim()) }));
    setMessage("配置已保存");
    if (apiKey?.trim()) setIsKeyVisible(false);
  }

  async function toggleKeyVisible() {
    if (isKeyVisible) {
      setDraft((current) => ({ ...current, apiKey: backendHasApiKey ? "******" : "" }));
      setIsKeyVisible(false);
      return;
    }
    if (!backendHasApiKey) {
      setIsKeyVisible(true);
      return;
    }
    setIsLoadingKey(true);
    setMessage("");
    try {
      const result = await getBackendImageApiKey();
      setDraft((current) => ({ ...current, apiKey: result.apiKey }));
      setIsKeyVisible(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取 Key 失败");
    } finally {
      setIsLoadingKey(false);
    }
  }

  if (!providers.length) {
    return (
      <article className="panel config-editor-panel">
        <div className="panel-title">
          <Image size={18} />
          <span>生图 API 配置</span>
          <strong>未加载</strong>
        </div>
        <div className="empty-state">未读取到后端商家配置。</div>
      </article>
    );
  }

  return (
    <article className="panel config-editor-panel">
      <div className="panel-title">
        <Image size={18} />
        <span>生图 API 配置</span>
        <strong>{backendHasApiKey || draft.apiKey?.trim() ? "Key 已填" : "未填 Key"}</strong>
      </div>
      <div className="llm-config-form">
        <label>
          商家
          <select value={draft.provider} onChange={(event) => update({ provider: event.target.value })}>
            {providers.map((provider) => (
              <option value={provider.id} key={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          默认 Base URL
          <select value={draft.baseUrl ?? ""} onChange={(event) => update({ baseUrl: event.target.value })}>
            {activeProvider?.baseUrls.map((item) => (
              <option value={item.url} key={item.url}>
                {item.label} / {item.url}
              </option>
            ))}
          </select>
        </label>
        <label className="key-input-field">
          API Key
          <div>
            <input
              type={isKeyVisible ? "text" : "password"}
              value={draft.apiKey ?? ""}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder={backendHasApiKey ? "******（后端已保存）" : "填写商家 API Key"}
            />
            <button type="button" onClick={() => void toggleKeyVisible()} disabled={isLoadingKey}>
              <Eye size={15} />
            </button>
          </div>
          <small>API Key 只保存到本机后端配置，不写入 providerpack。</small>
        </label>
        <div className="actions-row">
          <button className="primary-button" onClick={saveConfig}>
            <Save size={16} />
            保存配置
          </button>
        </div>
        {message && <p className="form-message">{message}</p>}
      </div>
    </article>
  );
}

function BasicConfigForm({
  config,
  onChange,
}: {
  config: BackendSettings["general"];
  onChange: (config: BackendSettings["general"]) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(config);
  }, [config.imageConcurrency]);

  function updateImageConcurrency(value: number) {
    setDraft((current) => ({
      ...current,
      imageConcurrency: Math.max(1, Math.min(Number.isFinite(value) ? value : 1, 8)),
    }));
    setMessage("");
  }

  function saveConfig() {
    onChange(draft);
    setMessage("基本配置已保存");
  }

  return (
    <article className="panel config-editor-panel basic-config-panel">
      <div className="panel-title">
        <SlidersHorizontal size={18} />
        <span>基本配置</span>
        <strong>本机运行参数</strong>
      </div>
      <div className="llm-config-form">
        <label>
          生图并发数
          <input
            type="number"
            min={1}
            max={8}
            value={draft.imageConcurrency}
            onChange={(event) => updateImageConcurrency(Number(event.target.value))}
          />
          <small>控制后端同时执行的生图请求数量。超出的请求会等待，不丢任务。</small>
        </label>
        <div className="actions-row">
          <button className="primary-button" onClick={saveConfig}>
            <Save size={16} />
            保存配置
          </button>
        </div>
        {message && <p className="form-message">{message}</p>}
      </div>
    </article>
  );
}

function LlmConfigForm({
  config,
  backendHasApiKey,
  onChange,
}: {
  config: LlmExecutorConfig;
  backendHasApiKey: boolean;
  onChange: (config: LlmExecutorConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState("");
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  useEffect(() => {
    setDraft({ ...config, apiKey: backendHasApiKey ? "******" : "" });
    setIsKeyVisible(false);
  }, [config, backendHasApiKey]);

  function update(next: Partial<LlmExecutorConfig>) {
    setDraft((current) => normalizeLlmConfig({ ...current, hasApiKey: backendHasApiKey, ...next }));
    setMessage("");
  }

  function saveConfig() {
    const apiKey = draft.apiKey === "******" ? "" : draft.apiKey;
    onChange(normalizeLlmConfig({ ...draft, apiKey, hasApiKey: backendHasApiKey || Boolean(apiKey?.trim()) }));
    setMessage("配置已保存");
    if (apiKey?.trim()) setIsKeyVisible(false);
  }

  function testConfig() {
    const apiKey = draft.apiKey === "******" ? "" : draft.apiKey;
    const normalized = normalizeLlmConfig({ ...draft, apiKey, hasApiKey: backendHasApiKey });
    if (!normalized.apiKey?.trim() && !normalized.hasApiKey) {
      setMessage("缺少 API Key，不能测试真实接口。");
      return;
    }
    setMessage("配置格式通过；保存后由后端代理执行真实调用。");
  }

  async function toggleKeyVisible() {
    if (isKeyVisible) {
      setDraft((current) => ({ ...current, apiKey: backendHasApiKey ? "******" : "" }));
      setIsKeyVisible(false);
      return;
    }
    if (!backendHasApiKey) {
      setIsKeyVisible(true);
      return;
    }
    setIsLoadingKey(true);
    setMessage("");
    try {
      const result = await getBackendLlmApiKey();
      setDraft((current) => ({ ...current, apiKey: result.apiKey }));
      setIsKeyVisible(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取 Key 失败");
    } finally {
      setIsLoadingKey(false);
    }
  }

  return (
    <article className="panel config-editor-panel">
      <div className="panel-title">
        <Sparkles size={18} />
        <span>DeepSeek 配置</span>
        <strong>{backendHasApiKey || draft.apiKey?.trim() ? "Key 已填" : "未填 Key"}</strong>
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
          <div className="key-input-row">
            <input
              type={isKeyVisible ? "text" : "password"}
              value={draft.apiKey ?? ""}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder={backendHasApiKey ? "******" : "保存到本地后端设置"}
            />
            <button type="button" title={isKeyVisible ? "隐藏 Key" : "显示 Key"} onClick={() => void toggleKeyVisible()} disabled={isLoadingKey}>
              <Eye size={16} />
            </button>
          </div>
          <small className={backendHasApiKey ? "field-status success" : "field-status warning"}>
            {backendHasApiKey ? "后端已保存。默认用 ****** 代替；点击眼睛可显示，修改后保存会覆盖旧 Key。" : "尚未保存 Key。填写后点保存配置。"}
          </small>
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
  if (preview.episodes.length === 1 && preview.episodes[0]?.title !== "未识别分集标记") return normalizeEpisodeForStorage(preview.episodes[0]);
  return `第${episodeNumber}集\n${trimmed}`;
}

function formatEpisodeSplitPreview(preview: EpisodeSplitPreviewData) {
  return preview.episodes.map(normalizeEpisodeForStorage).filter(Boolean).join("\n\n");
}

function normalizeEpisodeForStorage(episode: EpisodeSplitItem) {
  const text = episode.text.trim();
  if (!text) return "";
  const lines = text.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  if (/^第\s*[一二三四五六七八九十百\d]+\s*集/.test(firstLine)) return text;
  const canonicalTitle = `第${episode.episodeNumber}集`;
  const titleSuffix = firstLine && firstLine !== "未识别分集标记" ? ` ${firstLine}` : "";
  return [canonicalTitle + titleSuffix, ...lines.slice(1)].join("\n").trim();
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
