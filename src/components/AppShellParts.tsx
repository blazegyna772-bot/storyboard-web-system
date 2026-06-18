import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileText,
  Film,
  FolderKanban,
  Layers3,
  Menu,
  Moon,
  Package,
  PanelRightOpen,
  Scissors,
  Sun,
  Terminal,
} from "lucide-react";
import { assetKindLabel } from "../lib/assetLabels";
import type { AssetKind, AssetReviewBundle } from "../lib/assetApi";
import { normalizeAssetReviewBundle } from "../lib/assetApi";
import type { BackendImageTask, BackendLlmLog } from "../lib/backendStatusApi";
import { getBackendPromptTitle } from "../lib/promptStageCopy";
import type { ScriptAnalysis } from "../lib/storyboard";
import type { StoryWorkflowNodeId, StoryWorkflowState } from "../lib/storyWorkflowApi";
import { asArray, asRecord } from "../lib/valueFormat";
import type { StoryboardProject } from "../lib/projectStore";

export type RunningTopTask = {
  id: string;
  name: string;
  category: "llm" | "image" | "video";
};

export type TopMetrics = {
  chapterCount: number;
  episodeCount: number;
  sceneCount: number;
  assetCount: number;
  videoBlockCount: number;
};

export function TopBar({
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

export function buildTopMetrics(analysis: ScriptAnalysis, bundle: AssetReviewBundle, workflow: StoryWorkflowState | null): TopMetrics {
  const normalizedBundle = normalizeAssetReviewBundle(bundle);
  const storyboardOutput = workflow?.artifacts.storyboard_design?.output;
  const storyMapOutput = workflow?.artifacts.story_map?.output;
  const seriesSummaryOutput = workflow?.artifacts.series_summary?.output;
  const seriesBibleSummary = asRecord(seriesSummaryOutput?.series_bible_summary);
  const chapterCount =
    asArray(storyMapOutput?.chapter_map).length || asArray(seriesSummaryOutput?.chapter_map).length || asArray(seriesBibleSummary.chapter_map).length;
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

export function buildRunningTopTasks({
  runningAssetExtractKinds,
  runningStoryNodeId,
  runningStoryBatchLabel,
  imageTasks,
  llmLogs,
}: {
  runningAssetExtractKinds: Array<AssetKind | "chapters">;
  runningStoryNodeId: StoryWorkflowNodeId | "";
  runningStoryBatchLabel: string;
  imageTasks: BackendImageTask[];
  llmLogs: BackendLlmLog[];
}): RunningTopTask[] {
  const tasks: RunningTopTask[] = [];
  for (const kind of runningAssetExtractKinds) {
    tasks.push({
      id: `asset-extract-${kind}`,
      name: kind === "chapters" ? "LLM 按章节提取资产中" : `LLM 提取${assetKindLabel(kind)}资产中`,
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

export function AppNav({
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
