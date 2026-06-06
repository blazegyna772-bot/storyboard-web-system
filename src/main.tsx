import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
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
  SlidersHorizontal,
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
  loadBackendPrompt,
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
import { analyzeScript, exportEpisodeBundle, formatJson, parseEpisodeBundle } from "./lib/storyboard";
import type { AnalysisOptions, AssetDescription, EpisodeResult, ScriptAnalysis } from "./lib/storyboard";
import { defaultOutputAdapters, defaultPipelineConfig } from "./pipeline/defaults";
import { loadLlmExecutorConfig, normalizeLlmConfig, saveLlmExecutorConfig } from "./pipeline/llmConfig";
import { loadImageGenerationConfig, normalizeImageConfig, saveImageGenerationConfig } from "./pipeline/imageConfig";
import { generateAssetImage } from "./pipeline/imageGeneration";
import type { AssetImageCandidate } from "./pipeline/imageGeneration";
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
  const [assetReviewBundle, setAssetReviewBundle] = useState<AssetReviewBundle>(emptyAssetReviewBundle);
  const [isAssetReviewDirty, setIsAssetReviewDirty] = useState(false);
  const [runningAssetExtractKind, setRunningAssetExtractKind] = useState<AssetKind | "">("");
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
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null);
  const [generalConfig, setGeneralConfig] = useState<BackendSettings["general"]>({ imageConcurrency: 2 });
  const [backendRulepacks, setBackendRulepacks] = useState<BackendRulepack[]>([]);
  const [backendImageProviders, setBackendImageProviders] = useState<ImageProviderCatalog[]>([]);
  const [backendLlmLogs, setBackendLlmLogs] = useState<BackendLlmLog[]>([]);
  const [backendImageLogs, setBackendImageLogs] = useState<BackendImageLog[]>([]);
  const [backendImageTasks, setBackendImageTasks] = useState<BackendImageTask[]>([]);
  const [backendLlmLogDetail, setBackendLlmLogDetail] = useState<BackendLlmLog | null>(null);
  const [backendImageLogDetail, setBackendImageLogDetail] = useState<BackendImageLog | null>(null);
  const [selectedBackendPromptContent, setSelectedBackendPromptContent] = useState("");
  const [backendLlmHasApiKey, setBackendLlmHasApiKey] = useState(false);
  const [backendImageHasApiKey, setBackendImageHasApiKey] = useState(false);
  const imageCandidates = activeProject.imageCandidates ?? [];
  const runningTopTasks = useMemo(
    () => buildRunningTopTasks({
      isGenerating,
      runningAssetExtractKind,
      runningImageAssetId,
      imageTasks: backendImageTasks,
      llmLogs: backendLlmLogs,
    }),
    [isGenerating, runningAssetExtractKind, runningImageAssetId, backendImageTasks, backendLlmLogs],
  );

  useEffect(() => {
    void initializeBackendRoots();
    void refreshBackendStatus();
  }, []);

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
    setLatestRun(project.latestRun);
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
        setLatestRun(null);
        appendLog("project-root", "info", "根目录暂无项目", activeRoot.rootName);
        return;
      }
      setProjectStore({
        activeProjectId: projects[0].projectId,
        projects,
      });
      await loadAndApplyProject(projects[0]);
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
      void loadAssetReviewForProject(project.projectId);
      return;
    }
    const loadedProject = (await loadBackendProject(project.projectId)).project;
    setProjectStore((current) => ({
      ...current,
      projects: current.projects.map((item) => (item.projectId === loadedProject.projectId ? loadedProject : item)),
    }));
    applyProject(loadedProject);
    void loadAssetReviewForProject(loadedProject.projectId);
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
    if (!activeProject.projectId || runningAssetExtractKind) return;
    setRunningAssetExtractKind(kind);
    appendLog("asset-review", "info", `开始提取${assetKindLabel(kind)}记录`, `读取当前项目全集剧本，写入 records/${kind}_extract.json。`);
    try {
      const bundle = normalizeAssetReviewBundle(await extractProjectAssetRecords(activeProject.projectId, kind));
      const nextBundle = {
        ...bundle,
        trueSources: {
          ...bundle.trueSources,
          [kind]: bundle.records[kind].map((record, index) => buildTrueSourceFromRecord(kind, record, index)),
        },
      };
      setAssetReviewBundle(nextBundle);
      setIsAssetReviewDirty(true);
      void refreshBackendStatus();
      appendLog("asset-review", "success", `${assetKindLabel(kind)}记录提取完成`, `${bundle.records[kind].length} 条${assetKindLabel(kind)}记录。`);
      showToast(`${assetKindLabel(kind)}记录已提取，资产卡片已生成，确认后请保存`);
    } catch (error) {
      appendLog("asset-review", "error", `${assetKindLabel(kind)}记录提取失败`, error instanceof Error ? error.message : "未知错误");
      showToast(`${assetKindLabel(kind)}记录提取失败`);
    } finally {
      setRunningAssetExtractKind("");
    }
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
        latestRun,
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
        latestRun,
      });
      void saveBackendProject({ ...savedProject, rootName: projectRoot.rootName }).then(
        () => appendLog("project-files", "success", "分集剧本已写入后端项目文件夹", `${projectRoot.rootName}/${savedProject.folderName || toSafeFolderName(savedProject.name)}/input/episodes`),
        (error) => appendLog("project-files", "warning", "分集剧本写入后端失败", error instanceof Error ? error.message : "未知错误"),
      );
    }
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
    applyScriptToProject(nextScript, true, "合集分集已确认并保存");
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

  async function refreshBackendStatus() {
    try {
      const [health, settings, rulepacks, imageProviders, logs, imageLogs, imageTasks] = await Promise.all([
        getBackendHealth(),
        getBackendSettings(),
        listBackendRulepacks(),
        listBackendImageProviders(),
        listBackendLlmLogs(80),
        listBackendImageLogs(120),
        listBackendImageTasks(120),
      ]);
      setBackendHealth(health);
      setGeneralConfig(settings.general);
      setBackendRulepacks(rulepacks.rulepacks);
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
        analysis={analysis}
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
                applyScriptToProject(scriptQuality.cleanedScript, true, "校检稿已保存");
                showToast("校检稿已保存");
              }}
            />
          )}
          {activePage === "assets" && (
            <AssetReviewView
              projectId={activeProject.projectId}
              bundle={assetReviewBundle}
              isDirty={isAssetReviewDirty}
              runningExtractKind={runningAssetExtractKind}
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
          {activePage === "context" && <ContextPackView contextPack={contextPack} />}
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
              latestRun={latestRun}
              llmConfig={llmConfig}
              artifacts={activeProject.artifacts}
              locks={activeProject.locks}
              tasks={activeProject.tasks}
              promptLibrary={promptLibrary}
              backendHealth={backendHealth}
              backendRulepacks={backendRulepacks}
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
  analysis,
  hasDraftChanges,
  lastGeneratedAt,
  runningTasks,
  themeMode,
  onToggleTheme,
  onOpenTools,
}: {
  project: StoryboardProject;
  analysis: ScriptAnalysis;
  hasDraftChanges: boolean;
  lastGeneratedAt: string;
  runningTasks: RunningTopTask[];
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
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
  isGenerating,
  runningAssetExtractKind,
  runningImageAssetId,
  imageTasks,
  llmLogs,
}: {
  isGenerating: boolean;
  runningAssetExtractKind: AssetKind | "";
  runningImageAssetId: string;
  imageTasks: BackendImageTask[];
  llmLogs: BackendLlmLog[];
}): RunningTopTask[] {
  const tasks: RunningTopTask[] = [];
  if (isGenerating) {
    tasks.push({ id: "pipeline-generation", name: "LLM 管线生成中", category: "llm" });
  }
  if (runningAssetExtractKind) {
    tasks.push({
      id: `asset-extract-${runningAssetExtractKind}`,
      name: `LLM 提取${assetKindLabel(runningAssetExtractKind)}资产中`,
      category: "llm",
    });
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
  if (runningImageAssetId) {
    tasks.push({ id: `local-image-${runningImageAssetId}`, name: `生图 ${runningImageAssetId}`, category: "image" });
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
    { id: "assets", label: "资产审阅", icon: <Package size={18} /> },
    { id: "storyboard", label: "分镜工作台", icon: <Scissors size={18} /> },
    { id: "context", label: "辅助信息", icon: <Database size={18} /> },
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
  runningExtractKind,
  onChange,
  onSave,
  onExtractRecords,
  onImageEvent,
  onTaskRefresh,
}: {
  projectId: string;
  bundle: AssetReviewBundle;
  isDirty: boolean;
  runningExtractKind: AssetKind | "";
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

  function buildTrueSourcesFromRecords() {
    updateTrueSources(records.map((record, index) => buildTrueSourceFromRecord(activeKind, record, index)));
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
          <button onClick={() => onExtractRecords(activeKind)} disabled={Boolean(runningExtractKind)}>
            <Sparkles size={16} />
            {runningExtractKind === activeKind ? "提取中" : `提取${assetKindLabel(activeKind)}记录`}
          </button>
          <button onClick={() => setRecordPreview({ title: `${assetKindLabel(activeKind)}记录`, rows: records })}>
            <Eye size={16} />
            查看记录
          </button>
          <button onClick={buildTrueSourcesFromRecords} disabled={!records.length}>
            <Scissors size={16} />
            从记录生成资产
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
          ? `已有 ${records.length} 条${assetKindLabel(kind)}记录。点击顶部“从记录生成资产”生成卡片。`
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
  backendHealth,
  backendRulepacks,
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
  onPromptLibraryChange,
}: {
  latestRun: PipelineRun | null;
  llmConfig: LlmExecutorConfig;
  artifacts: ArtifactRecord[];
  locks: LockRecord[];
  tasks: TaskRecord[];
  promptLibrary: PromptLibraryState;
  backendHealth: BackendHealth | null;
  backendRulepacks: BackendRulepack[];
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
  onPromptLibraryChange: (state: PromptLibraryState, message?: string) => void;
}) {
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
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
          业务提示词
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
          <RunHealthPanel latestRun={latestRun} config={llmConfig} backendHealth={backendHealth} onRefresh={onRefreshBackendStatus} />
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

      {activeConfigTab === "prompts" && <PromptLibraryPanel state={promptLibrary} onChange={onPromptLibraryChange} />}

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
  const issueTasks = tasks.filter((task) => task.status === "blocked" || task.status === "needs_review");
  const latestTraces = latestRun?.stageResults.flatMap((stage) => stage.traces ?? []) ?? [];
  const blockedStages = latestRun?.stageResults.filter((stage) => stage.status === "blocked") ?? [];
  return (
    <div className="diagnostics-content">
      <section className="pipeline-layout compact-diagnostics">
        <article className="panel">
          <div className="panel-title">
            <Lock size={18} />
            <span>排查摘要</span>
            <strong>{latestRun?.status ?? "未运行"}</strong>
          </div>
          <div className="lock-task-grid">
            <ReviewStat label="Artifact" value={artifacts.length} tone="muted" />
            <ReviewStat label="已锁定" value={locks.filter((lockItem) => lockItem.status === "locked").length} tone="muted" />
            <ReviewStat label="阻塞阶段" value={blockedStages.length} tone="warning" />
            <ReviewStat label="阻塞任务" value={tasks.filter((task) => task.status === "blocked").length} tone="warning" />
            <ReviewStat label="需确认" value={tasks.filter((task) => task.status === "needs_review").length} tone="warning" />
            <ReviewStat label="LLM 调用" value={latestTraces.length} tone="muted" />
          </div>
        </article>
        <article className="panel">
          <div className="panel-title">
            <ClipboardList size={18} />
            <span>需要处理的任务</span>
            <strong>{issueTasks.length}</strong>
          </div>
          <div className="task-list">
            {issueTasks.map((task) => (
              <div key={task.taskId} className={`task-row ${task.status}`}>
                <strong>{task.label}</strong>
                <span>{task.status}</span>
                <small>{task.detail}</small>
              </div>
            ))}
            {!issueTasks.length && <div className="empty-state">暂无阻塞或待确认任务。</div>}
          </div>
        </article>
      </section>

      <section className="panel">
        <div className="panel-title">
          <Terminal size={18} />
          <span>LLM 调用追踪</span>
          <strong>{latestTraces.length}</strong>
        </div>
        <div className="llm-trace-list">
          {latestTraces.map((trace) => (
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
          {!latestTraces.length && <div className="empty-state">生成后显示每次 LLM 的输入、输出和校验结果。</div>}
        </div>
      </section>
    </div>
  );
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
    const key = log.taskId || inferLegacyImageTaskKey(log);
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

function inferLegacyImageTaskKey(log: BackendImageLog) {
  const date = new Date(log.time);
  const bucket = Number.isNaN(date.getTime()) ? log.time : Math.floor(date.getTime() / 120000).toString();
  return `legacy-${log.provider || "image"}-${log.model || "model"}-${bucket}`;
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
            <strong>规则文件</strong>
            <span>扫描本地 rulepacks 目录</span>
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
            <strong>Prompt 文件预览</strong>
            <span>{backendApiBaseUrl}</span>
          </div>
          <textarea value={promptContent || "点击左侧 Prompt 查看文件内容。"} readOnly spellCheck={false} />
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
  storyboard_plan: { title: "分镜规划", description: "按场生成分镜规划所需规则。" },
  prompt_generate: { title: "视频提示词生成", description: "把分镜、资产、空间时序转成视频提示词。" },
};

function getBackendPromptTitle(stage: string) {
  return backendPromptStageCopy[stage]?.title ?? stage;
}

function getBackendPromptDescription(stage: string) {
  return backendPromptStageCopy[stage]?.description ?? "本地规则文件。";
}

function RunHealthPanel({
  latestRun,
  config,
  backendHealth,
  onRefresh,
}: {
  latestRun: PipelineRun | null;
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
