import { StrictMode, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
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
  Terminal,
  Upload,
  X,
} from "lucide-react";
import { buildContextPack } from "./lib/contextPack";
import type { ContextPack } from "./lib/contextPack";
import {
  addProjectVersion,
  createProject,
  loadProjectStore,
  restoreProjectVersion,
  saveProjectStore,
  updateProjectSnapshot,
} from "./lib/projectStore";
import type { ProjectStoreState, StoryboardProject } from "./lib/projectStore";
import { buildScriptQualityReport } from "./lib/scriptQuality";
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
  const [isToolDrawerOpen, setIsToolDrawerOpen] = useState(false);
  const fallbackOptions: AnalysisOptions = {
    genreProfile: "都市情感短剧",
    directorProfile: "强冲突快节奏",
    targetShotSeconds: 5,
  };
  const [projectStore, setProjectStore] = useState<ProjectStoreState>(() => loadProjectStore(sampleScript, fallbackOptions));
  const activeProject = projectStore.projects.find((project) => project.projectId === projectStore.activeProjectId) ?? projectStore.projects[0];
  const [script, setScript] = useState(() => activeProject.script);
  const [genreProfile, setGenreProfile] = useState(() => activeProject.options.genreProfile);
  const [directorProfile, setDirectorProfile] = useState(() => activeProject.options.directorProfile);
  const [targetShotSeconds, setTargetShotSeconds] = useState(() => activeProject.options.targetShotSeconds);
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
    }),
    [genreProfile, directorProfile, targetShotSeconds],
  );
  const selectedEpisode = analysis.episodes.find((episode) => episode.episodeId === selectedEpisodeId) ?? analysis.episodes[0];
  const isCollapsed = isNavCollapsed === "true";
  const [llmConfig, setLlmConfig] = useState<LlmExecutorConfig>(() => loadLlmExecutorConfig());
  const [promptLibrary, setPromptLibrary] = useState<PromptLibraryState>(() => loadPromptLibrary());
  const imageCandidates = activeProject.imageCandidates ?? [];

  useEffect(() => {
    saveProjectStore(projectStore);
  }, [projectStore]);

  function applyProject(project: StoryboardProject) {
    setScript(project.script);
    setGenreProfile(project.options.genreProfile);
    setDirectorProfile(project.options.directorProfile);
    setTargetShotSeconds(project.options.targetShotSeconds);
    setAnalysis(project.analysis);
    setLatestRun(project.latestRun);
    setSelectedEpisodeId(project.analysis.episodes[0]?.episodeId ?? "EP01");
    setHasDraftChanges(false);
    appendLog("project", "info", `已切换到 ${project.name}`, `${project.versions.length} 个版本。`);
  }

  function updateActiveProject(mutator: (project: StoryboardProject) => StoryboardProject) {
    setProjectStore((current) => ({
      ...current,
      projects: current.projects.map((project) => (project.projectId === current.activeProjectId ? mutator(project) : project)),
    }));
  }

  function handleSaveProject() {
    updateActiveProject((project) =>
      addProjectVersion(
        updateProjectSnapshot(project, {
          projectId: project.projectId,
          name: project.name,
          script,
          options,
          analysis,
          latestRun,
        }),
        `保存 ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`,
      ),
    );
    setHasDraftChanges(false);
    showToast("项目已保存");
    appendLog("project", "success", "项目已保存", `${activeProject.name} 已写入本地版本。`);
  }

  function handleCreateProject() {
    const name = `项目 ${projectStore.projects.length + 1}`;
    const project = createProject({
      name,
      script: sampleScript,
      options: fallbackOptions,
      analysis: analyzeScript(sampleScript, fallbackOptions),
      latestRun: null,
    });
    setProjectStore((current) => ({
      activeProjectId: project.projectId,
      projects: [project, ...current.projects],
    }));
    applyProject(project);
  }

  function handleSelectProject(projectId: string) {
    const project = projectStore.projects.find((item) => item.projectId === projectId);
    if (!project) return;
    setProjectStore((current) => ({ ...current, activeProjectId: projectId }));
    applyProject(project);
  }

  function handleRestoreVersion(versionId: string) {
    const restored = restoreProjectVersion(activeProject, versionId);
    updateActiveProject(() => restored);
    applyProject(restored);
    showToast("版本已恢复");
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
    setScript(text);
    setHasDraftChanges(true);
    appendLog("input", "info", "剧本文件已导入", `${file.name}，${text.length.toLocaleString()} 字。`);
  }

  function updateScript(value: string) {
    setScript(value);
    setHasDraftChanges(true);
  }

  function updateOption(update: () => void) {
    update();
    setHasDraftChanges(true);
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
    <main className="app-shell">
      <TopBar
        project={activeProject}
        analysis={analysis}
        hasDraftChanges={hasDraftChanges}
        lastGeneratedAt={lastGeneratedAt}
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
          {activePage === "script" && (
            <ScriptWorkspace
              script={script}
              genreProfile={genreProfile}
              directorProfile={directorProfile}
              targetShotSeconds={targetShotSeconds}
              report={scriptQuality}
              onScriptChange={updateScript}
              onGenreChange={(value) => updateOption(() => setGenreProfile(value))}
              onDirectorChange={(value) => updateOption(() => setDirectorProfile(value))}
              onTargetShotSecondsChange={(value) => updateOption(() => setTargetShotSeconds(value))}
              onFileUpload={handleFileUpload}
              onGenerate={handleGenerate}
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
          onCreateProject={handleCreateProject}
          onSelectProject={handleSelectProject}
          onSaveProject={handleSaveProject}
          onRestoreVersion={handleRestoreVersion}
          onGenerate={handleGenerate}
          onExportAll={handleExportAll}
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
  onSaveProject,
  onGenerate,
  onExportAll,
  onOpenTools,
}: {
  project: StoryboardProject;
  analysis: ScriptAnalysis;
  hasDraftChanges: boolean;
  lastGeneratedAt: string;
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
          <span>本地项目 · {project.versions.length} 版本</span>
        </div>
      </div>
      <div className="top-metrics">
        <span>{analysis.episodes.length} 集</span>
        <span>{assetCount} 资产</span>
        <span>{shotCount} 镜头</span>
      </div>
      <StatusBar hasDraftChanges={hasDraftChanges} lastGeneratedAt={lastGeneratedAt} />
      <div className="top-actions">
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
    { id: "projects", label: "项目", icon: <FolderKanban size={18} />, disabled: true },
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
        {!isCollapsed && <span>剧本生产</span>}
      </button>
      <div className="nav-list">
        {items.map((item) => (
          <button
            key={item.id}
            className={activePage === item.id ? "active" : ""}
            onClick={() => !item.disabled && setActivePage(item.id)}
            disabled={item.disabled}
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
  genreProfile,
  directorProfile,
  targetShotSeconds,
  report,
  onScriptChange,
  onGenreChange,
  onDirectorChange,
  onTargetShotSecondsChange,
  onFileUpload,
  onGenerate,
  onApplyCleanedScript,
}: {
  script: string;
  genreProfile: string;
  directorProfile: string;
  targetShotSeconds: number;
  report: ReturnType<typeof buildScriptQualityReport>;
  onScriptChange: (value: string) => void;
  onGenreChange: (value: string) => void;
  onDirectorChange: (value: string) => void;
  onTargetShotSecondsChange: (value: number) => void;
  onFileUpload: (file: File | undefined) => Promise<void>;
  onGenerate: () => void | Promise<void>;
  onApplyCleanedScript: () => void;
}) {
  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>剧本校验</h2>
          <p>先确认 LLM 的信息源头可靠，再进入资产和分镜生成。</p>
        </div>
        <div className="header-actions">
          <label className="file-button">
            <Upload size={16} />
            导入剧本
            <input type="file" accept=".txt,.md" onChange={(event) => void onFileUpload(event.target.files?.[0])} />
          </label>
          <button className="primary-button" onClick={() => void onGenerate()}>
            <Play size={16} />
            生成草稿
          </button>
        </div>
      </div>

      <div className="control-grid script-control-grid">
        <label>
          题材
          <input value={genreProfile} onChange={(event) => onGenreChange(event.target.value)} />
        </label>
        <label>
          导演风格
          <input value={directorProfile} onChange={(event) => onDirectorChange(event.target.value)} />
        </label>
        <label>
          单镜目标秒数
          <input
            type="number"
            min="3"
            max="12"
            value={targetShotSeconds}
            onChange={(event) => onTargetShotSecondsChange(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="script-work-grid">
        <div className="script-card">
          <div className="panel-title">
            <FileText size={18} />
            <span>原始剧本</span>
            <strong>{script.trim().length.toLocaleString()} 字</strong>
          </div>
          <textarea
            value={script}
            onChange={(event) => onScriptChange(event.target.value)}
            spellCheck={false}
            placeholder="粘贴全集剧本，可包含第1集、第2集等标记。"
          />
        </div>
        <ScriptQualityView
          report={report}
          onApplyCleanedScript={onApplyCleanedScript}
        />
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
  onRestoreVersion,
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
  onRestoreVersion: (versionId: string) => void;
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
              保存版本
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
                <span>{project.versions[0]?.summary ?? "未保存"}</span>
                <small>{new Date(project.updatedAt).toLocaleString("zh-CN", { hour12: false })}</small>
              </button>
            ))}
          </div>
          <div className="version-list">
            <strong>版本</strong>
            {projects.find((project) => project.projectId === activeProjectId)?.versions.map((version) => (
              <button key={version.versionId} onClick={() => onRestoreVersion(version.versionId)}>
                <span>{version.name}</span>
                <small>{version.summary}</small>
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

function ScriptQualityView({
  report,
  onApplyCleanedScript,
}: {
  report: ReturnType<typeof buildScriptQualityReport>;
  onApplyCleanedScript: () => void;
}) {
  return (
    <section className="page-stack">
      <div className="summary-strip">
        <Metric icon={<FileText size={18} />} label="有效行" value={report.stats.lines} />
        <Metric icon={<Layers3 size={18} />} label="集数" value={report.stats.episodes} />
        <Metric icon={<AlertTriangle size={18} />} label="疑点" value={report.issues.length} />
      </div>
      <div className="split-review">
        <div className="panel">
          <div className="panel-title">
            <CheckCircle2 size={18} />
            <span>格式清洗稿</span>
            <button onClick={onApplyCleanedScript}>写回剧本</button>
          </div>
          <pre className="clean-script-preview">{report.cleanedScript}</pre>
        </div>
        <div className="panel">
          <div className="panel-title">
            <AlertTriangle size={18} />
            <span>审校疑点</span>
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
      </div>
    </section>
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
