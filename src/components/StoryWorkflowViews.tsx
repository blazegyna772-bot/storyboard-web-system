import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Layers3, Play, RefreshCcw, Sparkles } from "lucide-react";
import { loadStoryWorkflowArtifact, type StoryWorkflowArtifact, type StoryWorkflowNode, type StoryWorkflowNodeId, type StoryWorkflowState } from "../lib/storyWorkflowApi";
import type { EpisodeResult } from "../lib/storyboard";
import { formatJson } from "../lib/storyboard";
import { asArray, asRecord, textValue } from "../lib/valueFormat";
import { StoryArtifactReview } from "./StoryArtifactReview";

export type StoryboardExecutionMode = "integrated" | "separate";

export type StoryWorkflowRunOptions = {
  chapterId?: string;
  chapterIds?: string[];
  episodeId?: string;
  sceneId?: string;
  blockId?: string;
  blockStart?: string;
  blockEnd?: string;
  executionMode?: StoryboardExecutionMode;
};

type StoryWorkflowChapterTab = {
  chapterId: string;
  label: string;
  title: string;
  episodeRange: string;
};

type StoryPlanningStage = "series" | "chapter";
type StoryboardPlanningStage = "episode_summary" | "scene_summary" | "storyboard_design";

export function StoryPlanningView({
  projectId,
  state,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRunNodes,
  onRefresh,
}: {
  projectId: string;
  state: StoryWorkflowState | null;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRunNodes: (nodeIds: StoryWorkflowNodeId[], options?: StoryWorkflowRunOptions) => void;
  onRefresh: () => void;
}) {
  const nodes = filterStoryWorkflowNodes(state, "planning");
  const artifacts = state?.artifacts ?? {};
  const statusCounts = countWorkflowStatuses(nodes, artifacts, runningNodeId, runningBatchLabel);
  return (
    <section className="page-stack story-workflow-page story-planning-page">
      <div className="page-header work-header">
        <div>
          <h2>剧本统筹</h2>
          <div className="header-inline-metrics">
            <span>已完成 {statusCounts.done}</span>
            <span>待关注 {statusCounts.attention}</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="primary-button" onClick={() => onRunNodes(nodes.map((node) => node.id))} disabled={Boolean(runningNodeId || runningBatchLabel)}>
            <Play size={16} />
            {runningBatchLabel ? "执行中" : "运行剧本统筹"}
          </button>
          <button onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
      </div>
      <StoryPlanningBoard
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

export function StoryboardPlanningView({
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
  onRunEpisodeScenes,
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
  onRunEpisodeScenes: (nodeIds: StoryWorkflowNodeId[], sceneIds: string[], options?: StoryWorkflowRunOptions) => void;
  onRefresh: () => void;
}) {
  const workflowEpisodes = state?.episodes ?? [];
  const activeWorkflowEpisode = workflowEpisodes.find((episode) => episode.episodeId === selectedEpisodeId) ?? workflowEpisodes[0];
  const sceneOptions = activeWorkflowEpisode?.scenes ?? [];
  const nodes = filterStoryWorkflowNodes(state, "storyboard");
  const runNodeIds = executionMode === "integrated" ? nodes.map((node) => node.id).filter((nodeId) => nodeId !== "scene_summary") : nodes.map((node) => node.id);
  const handleEpisodeChange = (episodeId: string) => {
    onSelectEpisode(episodeId);
    const nextEpisode = workflowEpisodes.find((episode) => episode.episodeId === episodeId);
    const nextScenes = nextEpisode?.scenes ?? [];
    if (nextScenes.length && !nextScenes.some((scene) => scene.sceneId === selectedSceneId)) {
      onSelectScene(nextScenes[0].sceneId);
    }
  };

  useEffect(() => {
    if (!sceneOptions.length) return;
    if (!sceneOptions.some((scene) => scene.sceneId === selectedSceneId)) {
      onSelectScene(sceneOptions[0].sceneId);
    }
  }, [sceneOptions, selectedSceneId, onSelectScene]);

  return (
    <section className="page-stack story-workflow-page storyboard-planning-page">
      <div className="page-header work-header">
        <div>
          <h2>分镜统筹</h2>
        </div>
        <div className="header-actions">
          <div className="mode-switch compact locked" aria-label="分镜统筹执行模式">
            <button className="active" disabled title="生产模式由项目类型决定，生成集/场产物后不允许切换。">
              {executionMode === "integrated" ? "集场一体" : "集场分开"}
            </button>
          </div>
          <select value={selectedEpisodeId} onChange={(event) => handleEpisodeChange(event.target.value)}>
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
          <button onClick={() => onRunEpisodeScenes(runNodeIds, sceneOptions.map((scene) => scene.sceneId), { executionMode })} disabled={Boolean(runningNodeId || runningBatchLabel || !sceneOptions.length)}>
            <Sparkles size={16} />
            本集全部场次
          </button>
          <button onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </button>
        </div>
      </div>
      <StoryboardPlanningBoard
        nodes={nodes}
        projectId={projectId}
        artifacts={state?.artifacts ?? {}}
        selectedEpisodeId={selectedEpisodeId}
        selectedSceneId={selectedSceneId}
        sceneOptions={sceneOptions}
        executionMode={executionMode}
        runningNodeId={runningNodeId}
        runningBatchLabel={runningBatchLabel}
        onRunNode={(nodeId, options) => onRunNode(nodeId, { ...options, executionMode })}
        disabledNodeIds={executionMode === "integrated" ? ["scene_summary"] : []}
        disabledNodeReason="集场一体模式下，场次概要由单集概要同步生成。"
      />
    </section>
  );
}

function StoryboardPlanningBoard({
  nodes,
  projectId,
  artifacts,
  selectedEpisodeId,
  selectedSceneId,
  sceneOptions,
  executionMode,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  disabledNodeIds = [],
  disabledNodeReason = "",
}: {
  nodes: StoryWorkflowNode[];
  projectId: string;
  artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>;
  selectedEpisodeId: string;
  selectedSceneId: string;
  sceneOptions: { sceneId: string; title: string }[];
  executionMode: StoryboardExecutionMode;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  disabledNodeIds?: StoryWorkflowNodeId[];
  disabledNodeReason?: string;
}) {
  const [activeNodeId, setActiveNodeId] = useState<StoryboardPlanningStage>("storyboard_design");
  const [artifactView, setArtifactView] = useState<"review" | "json">("review");
  const [scopedArtifacts, setScopedArtifacts] = useState<Partial<Record<StoryboardPlanningStage, StoryWorkflowArtifact>>>({});
  const [isScopedArtifactLoading, setIsScopedArtifactLoading] = useState(false);
  const stageNodes = useMemo(() => buildStoryboardPlanningStages(nodes), [nodes]);
  const stageNodeIds = useMemo(() => stageNodes.map((node) => node.id as StoryboardPlanningStage), [stageNodes]);
  const stageNodeKey = stageNodeIds.join("|");
  const activeNode = stageNodes.find((node) => node.id === activeNodeId) ?? stageNodes[0];
  const mergedArtifacts = { ...artifacts, ...scopedArtifacts };
  const activeArtifact = activeNode ? mergedArtifacts[activeNode.id] : undefined;
  const activeArtifactStatus = runningNodeId === activeNode?.id ? "running" : activeArtifact?.status;
  const isActiveNodeDisabled = activeNode ? disabledNodeIds.includes(activeNode.id) : false;
  const sceneLabel = selectedSceneId || sceneOptions[0]?.sceneId || "SC01";

  useEffect(() => {
    if (!stageNodes.length) return;
    if (!stageNodes.some((node) => node.id === activeNodeId)) {
      setActiveNodeId((stageNodes[0]?.id as StoryboardPlanningStage) ?? "storyboard_design");
    }
  }, [activeNodeId, stageNodes]);

  useEffect(() => {
    if (!projectId || !selectedEpisodeId) {
      setScopedArtifacts({});
      return;
    }
    let cancelled = false;
    setIsScopedArtifactLoading(true);
    const scopedNodeIds = stageNodeIds;
    Promise.all(
      scopedNodeIds.map(async (nodeId) => {
        const result = await loadStoryWorkflowArtifact(projectId, nodeId, {
          episodeId: selectedEpisodeId,
          sceneId: selectedSceneId || sceneLabel,
        });
        return [nodeId, result.artifact] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) return;
        const next: Partial<Record<StoryboardPlanningStage, StoryWorkflowArtifact>> = {};
        for (const [nodeId, artifact] of entries) {
          if (artifact) next[nodeId as StoryboardPlanningStage] = artifact;
        }
        setScopedArtifacts(next);
      })
      .catch(() => {
        if (!cancelled) setScopedArtifacts({});
      })
      .finally(() => {
        if (!cancelled) setIsScopedArtifactLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedEpisodeId, selectedSceneId, sceneLabel, stageNodeKey, artifacts.episode_summary?.updatedAt, artifacts.scene_summary?.updatedAt, artifacts.storyboard_design?.updatedAt]);

  if (!stageNodes.length) {
    return <div className="empty-state">当前项目还没有读取到分镜统筹节点。请确认后端在线。</div>;
  }

  return (
    <>
      <div className="script-stepper story-planning-stepper storyboard-planning-stepper">
        {stageNodes.map((node, index) => {
          const status = runningNodeId === node.id ? "running" : mergedArtifacts[node.id]?.status ?? "idle";
          const isActive = activeNode?.id === node.id;
          const isDisabled = disabledNodeIds.includes(node.id);
          return (
            <button
              key={node.id}
              className={`script-step ${isActive ? "current" : status === "done" ? "completed" : ""} ${isDisabled ? "disabled" : ""}`}
              onClick={() => setActiveNodeId(node.id as StoryboardPlanningStage)}
              title={isDisabled ? disabledNodeReason : undefined}
            >
              <div className="script-step-inner">
                <strong>{status === "done" && !isActive ? <CheckCircle2 size={17} /> : index + 1}</strong>
                <div>
                  <span>{node.title}</span>
                  <small>{storyNodeStatusText(status)} · {node.scope}</small>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <section className="story-planning-panel storyboard-planning-panel panel">
        {activeNode ? (
          <>
            <StoryNodeActionBar
              title={activeNode.title}
              scope={`${selectedEpisodeId} / ${sceneLabel}`}
              status={activeArtifactStatus}
              isRunning={runningNodeId === activeNode.id}
              isBusy={Boolean(runningNodeId || runningBatchLabel || isActiveNodeDisabled)}
              onRun={() => {
                void onRunNode(activeNode.id, { executionMode }).then((artifact) => {
                  if (artifact) setScopedArtifacts((current) => ({ ...current, [activeNode.id]: artifact }));
                });
              }}
              runLabel={isActiveNodeDisabled ? "已由单集概要生成" : `执行${activeNode.title}`}
            />
            {isActiveNodeDisabled && disabledNodeReason && <div className="story-node-disabled-note inline">{disabledNodeReason}</div>}
            <StoryArtifactPanel
              title={`${activeNode.title}产物`}
              artifact={activeArtifact}
              status={activeArtifactStatus}
              isLoading={isScopedArtifactLoading}
              artifactView={artifactView}
              onArtifactViewChange={setArtifactView}
            />
          </>
        ) : (
          <div className="empty-state">当前没有分镜统筹阶段节点。</div>
        )}
      </section>
    </>
  );
}

function StoryWorkflowPageFrame({
  title,
  description,
  runAllLabel = "运行本页全部",
  variant = "workflow",
  nodes,
  projectId,
  artifacts,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRunNodes,
  onRefresh,
}: {
  title: string;
  description?: string;
  runAllLabel?: string;
  variant?: "planning" | "workflow";
  nodes: StoryWorkflowNode[];
  projectId: string;
  artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRunNodes: (nodeIds?: StoryWorkflowNodeId[], options?: StoryWorkflowRunOptions) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="page-stack story-workflow-page">
      <div className="page-header work-header">
        <div>
          <h2>{title}</h2>
        </div>
        <div className="header-actions">
          <button className="primary-button" onClick={() => onRunNodes()} disabled={Boolean(runningNodeId || runningBatchLabel)}>
            <Play size={16} />
            {runningBatchLabel ? "执行中" : runAllLabel}
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
        artifacts={artifacts}
        runningNodeId={runningNodeId}
        runningBatchLabel={runningBatchLabel}
        onRunNode={onRunNode}
        onRunNodes={onRunNodes}
        variant={variant}
      />
    </section>
  );
}

function StoryPlanningBoard({
  nodes,
  projectId,
  artifacts,
  runningNodeId,
  runningBatchLabel,
  onRunNode,
  onRunNodes,
}: {
  nodes: StoryWorkflowNode[];
  projectId: string;
  artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>;
  runningNodeId: StoryWorkflowNodeId | "";
  runningBatchLabel: string;
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: StoryWorkflowRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRunNodes: (nodeIds: StoryWorkflowNodeId[], options?: StoryWorkflowRunOptions) => void;
}) {
  const [stage, setStage] = useState<StoryPlanningStage>("series");
  const [activeSeriesNodeId, setActiveSeriesNodeId] = useState<StoryWorkflowNodeId>("series_summary");
  const [artifactView, setArtifactView] = useState<"review" | "json">("review");
  const [selectedChapterId, setSelectedChapterId] = useState("chapter_01");
  const [chapterArtifact, setChapterArtifact] = useState<StoryWorkflowArtifact | null>(null);
  const [isChapterArtifactLoading, setIsChapterArtifactLoading] = useState(false);
  const seriesTabs = buildStoryPlanningSeriesTabs(nodes);
  const activeSeriesNode = seriesTabs.find((node) => node.id === activeSeriesNodeId) ?? seriesTabs[0];
  const activeSeriesArtifact = activeSeriesNode ? artifacts[activeSeriesNode.id] : undefined;
  const activeSeriesStatus = runningNodeId === activeSeriesNode?.id ? "running" : activeSeriesArtifact?.status;
  const chapterNode = nodes.find((node) => node.id === "chapter_summary");
  const chapterTabs = useMemo(() => extractWorkflowChapterTabs(artifacts), [artifacts]);
  const selectedChapter = chapterTabs.find((chapter) => chapter.chapterId === selectedChapterId) ?? chapterTabs[0];
  const activeChapterStatus = runningNodeId === "chapter_summary" ? "running" : chapterArtifact?.status;

  useEffect(() => {
    if (!seriesTabs.length) return;
    if (!seriesTabs.some((node) => node.id === activeSeriesNodeId)) {
      setActiveSeriesNodeId(seriesTabs[0].id);
    }
  }, [activeSeriesNodeId, seriesTabs]);

  useEffect(() => {
    if (!chapterTabs.length) return;
    if (!chapterTabs.some((chapter) => chapter.chapterId === selectedChapterId)) {
      setSelectedChapterId(chapterTabs[0].chapterId);
    }
  }, [chapterTabs, selectedChapterId]);

  useEffect(() => {
    if (!projectId || stage !== "chapter" || !selectedChapter?.chapterId) {
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
  }, [projectId, selectedChapter?.chapterId, stage]);

  if (!nodes.length) {
    return <div className="empty-state">当前项目还没有读取到剧本统筹节点。请确认后端在线。</div>;
  }

  return (
    <>
      <div className="script-stepper story-planning-stepper">
        <button className={`script-step ${stage === "series" ? "current" : "completed"}`} onClick={() => setStage("series")}>
          <div className="script-step-inner">
            <strong>{stage === "series" ? "1" : <CheckCircle2 size={17} />}</strong>
            <div>
              <span>全集概要</span>
              <small>汇总全剧层信息和全集概要产物</small>
            </div>
          </div>
        </button>
        <button className={`script-step ${stage === "chapter" ? "current" : ""}`} onClick={() => setStage("chapter")}>
          <div className="script-step-inner">
            <strong>2</strong>
            <div>
              <span>章节概要</span>
              <small>按章节审阅章节概要产物</small>
            </div>
          </div>
        </button>
      </div>

      {stage === "series" ? (
        <section className="story-planning-panel panel">
          <div className="story-planning-tabs">
            {seriesTabs.map((node) => {
              const status = runningNodeId === node.id ? "running" : artifacts[node.id]?.status ?? "idle";
              return (
                <button key={node.id} className={activeSeriesNode?.id === node.id ? "active" : ""} onClick={() => setActiveSeriesNodeId(node.id)}>
                  <strong>{node.title}</strong>
                  <span>{storyNodeStatusText(status)}</span>
                </button>
              );
            })}
          </div>
          {activeSeriesNode ? (
            <>
              <StoryNodeActionBar
                title={activeSeriesNode.title}
                scope={activeSeriesNode.scope}
                status={activeSeriesStatus}
                isRunning={runningNodeId === activeSeriesNode.id}
                isBusy={Boolean(runningNodeId || runningBatchLabel)}
                onRun={() => onRunNode(activeSeriesNode.id)}
                runLabel={`执行${activeSeriesNode.title}`}
              />
              <StoryArtifactPanel
                title={`${activeSeriesNode.title}产物`}
                artifact={activeSeriesArtifact}
                status={activeSeriesStatus}
                isLoading={false}
                artifactView={artifactView}
                onArtifactViewChange={setArtifactView}
              />
            </>
          ) : (
            <div className="empty-state">当前没有全集概要阶段节点。</div>
          )}
        </section>
      ) : (
        <section className="story-planning-panel panel">
          <div className="chapter-tab-strip">
            {chapterTabs.map((chapter) => (
              <button key={chapter.chapterId} className={selectedChapter?.chapterId === chapter.chapterId ? "active" : ""} onClick={() => setSelectedChapterId(chapter.chapterId)}>
                <strong>{chapter.label}</strong>
                <span>{chapter.episodeRange || chapter.title}</span>
              </button>
            ))}
            {!chapterTabs.length && <div className="empty-state compact">还没有章节标签，请先生成剧情地图。</div>}
          </div>
          <StoryNodeActionBar
            title={chapterNode?.title ?? "章节概要"}
            scope={selectedChapter ? `${selectedChapter.label} / ${selectedChapter.episodeRange || selectedChapter.title}` : "章节"}
            status={activeChapterStatus}
            isRunning={runningNodeId === "chapter_summary"}
            isBusy={Boolean(runningNodeId || runningBatchLabel)}
            onRun={() => {
              if (!selectedChapter || !chapterNode) return;
              void onRunNode(chapterNode.id, { chapterId: selectedChapter.chapterId }).then((artifact) => {
                if (artifact) setChapterArtifact(artifact);
              });
            }}
            runLabel="执行当前章节"
            extraAction={
              <button onClick={() => chapterNode && onRunNodes([chapterNode.id], { chapterIds: chapterTabs.map((chapter) => chapter.chapterId) })} disabled={Boolean(runningNodeId || runningBatchLabel || !chapterTabs.length)}>
                <Sparkles size={16} />
                执行全部章节概要
              </button>
            }
          />
          <StoryArtifactPanel
            title="章节概要产物"
            artifact={chapterArtifact}
            status={activeChapterStatus}
            isLoading={isChapterArtifactLoading}
            artifactView={artifactView}
            onArtifactViewChange={setArtifactView}
            emptyText="当前章节还没有产物。"
          />
        </section>
      )}
    </>
  );
}

function StoryNodeActionBar({
  title,
  scope,
  status,
  isRunning,
  isBusy,
  onRun,
  runLabel,
  extraAction,
}: {
  title: string;
  scope: string;
  status: StoryWorkflowArtifact["status"] | "idle" | "running" | undefined;
  isRunning: boolean;
  isBusy: boolean;
  onRun: () => void;
  runLabel: string;
  extraAction?: ReactNode;
}) {
  return (
    <section className="story-node-brief">
      <div className="story-node-brief-main">
        <div className="story-node-brief-title">
          <Layers3 size={18} />
          <strong>{title}</strong>
          <span>{scope}</span>
          <em>{status ? storyNodeStatusText(status) : "未生成"}</em>
        </div>
      </div>
      <div className="story-node-run-actions">
        <button className="primary-button" onClick={onRun} disabled={isBusy}>
          <Play size={16} />
          {isRunning ? "执行中" : runLabel}
        </button>
        {extraAction}
      </div>
    </section>
  );
}

function StoryArtifactPanel({
  title,
  artifact,
  status,
  isLoading,
  artifactView,
  onArtifactViewChange,
  emptyText = "该节点还没有产物。",
}: {
  title: string;
  artifact: StoryWorkflowArtifact | null | undefined;
  status: StoryWorkflowArtifact["status"] | "idle" | "running" | undefined;
  isLoading: boolean;
  artifactView: "review" | "json";
  onArtifactViewChange: (view: "review" | "json") => void;
  emptyText?: string;
}) {
  return (
    <article className="panel story-artifact-panel">
      <div className="panel-title">
        <ClipboardList size={18} />
        <span>{title}</span>
        <strong>{isLoading ? "读取中" : status ? storyNodeStatusText(status) : "未生成"}</strong>
      </div>
      {artifact ? (
        <div className="story-artifact-content">
          {artifact.error && <div className="json-error">{artifact.error}</div>}
          <div className="story-artifact-toolbar">
            <div className="mode-switch compact" aria-label="节点产物查看模式">
              <button className={artifactView === "review" ? "active" : ""} onClick={() => onArtifactViewChange("review")}>
                审阅
              </button>
              <button className={artifactView === "json" ? "active" : ""} onClick={() => onArtifactViewChange("json")}>
                JSON
              </button>
            </div>
          </div>
          {artifactView === "review" ? (
            <StoryArtifactReview nodeId={artifact.nodeId} output={artifact.output ?? {}} />
          ) : (
            <pre className="story-artifact-json-view">{formatJson(artifact.output && Object.keys(artifact.output).length ? artifact.output : artifact.rawText || {})}</pre>
          )}
        </div>
      ) : (
        <div className="empty-state">{emptyText}</div>
      )}
    </article>
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
  variant = "workflow",
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
  variant?: "planning" | "workflow";
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
  const overviewCopy = buildWorkflowOverviewCopy(variant);

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
    return <div className="empty-state">当前项目还没有读取到{overviewCopy.emptyStateTarget}。请确认后端在线。</div>;
  }

  const nodeStatuses = nodes.map((node) => (runningNodeId === node.id ? "running" : artifacts[node.id]?.status ?? "idle"));
  const doneCount = nodeStatuses.filter((status) => status === "done").length;
  const runningCount = nodeStatuses.filter((status) => status === "running").length + (runningBatchLabel ? 1 : 0);
  const errorCount = nodeStatuses.filter((status) => status === "error").length;
  const baseLayerCount = variant === "planning" ? nodes.filter((node) => ["story_map", "character_summary", "continuity"].includes(node.id)).length : nodes.filter((node) => !node.dependsOn.length).length;
  const summaryLayerCount = variant === "planning" ? nodes.filter((node) => ["series_summary", "chapter_summary"].includes(node.id)).length : Math.max(0, nodes.length - baseLayerCount);

  return (
    <>
      <section className="story-workflow-overview panel">
        <div className="story-workflow-metrics">
          <WorkflowMetric icon={<ClipboardList size={24} />} value={nodes.length} label={overviewCopy.totalLabel} />
          <WorkflowMetric icon={<Layers3 size={24} />} value={baseLayerCount} label={overviewCopy.baseLabel} />
          <WorkflowMetric icon={<Sparkles size={24} />} value={summaryLayerCount} label={overviewCopy.summaryLabel} />
          <WorkflowMetric icon={<CheckCircle2 size={24} />} value={doneCount} label="已完成" />
          <WorkflowMetric icon={<AlertTriangle size={24} />} value={errorCount + runningCount} label="待关注" />
        </div>
        <div className="story-workflow-current">
          <span>{overviewCopy.currentLabel}</span>
          <strong>{activeNode?.title ?? "未选择节点"}</strong>
          <em>{activeArtifactStatus ? storyNodeStatusText(activeArtifactStatus) : "未生成"}</em>
        </div>
      </section>

      <div className="story-workflow-layout">
        <section className="story-node-list">
          <div className="story-node-group-title">{overviewCopy.firstGroupLabel}</div>
          {nodes.map((node, index) => {
            const artifact = artifacts[node.id];
            const status = runningNodeId === node.id ? "running" : artifact?.status ?? "idle";
            const showStatus = node.id !== "chapter_summary" || runningNodeId === node.id;
            const previousNode = nodes[index - 1];
            const shouldShowSummaryGroup = node.id === "series_summary" && previousNode?.id !== "series_summary";
            return (
              <Fragment key={node.id}>
                {shouldShowSummaryGroup && <div className="story-node-group-title">{overviewCopy.secondGroupLabel}</div>}
                <button className={activeNode?.id === node.id ? "active" : ""} onClick={() => setActiveNodeId(node.id)}>
                  <small>{String(index + 1).padStart(2, "0")}</small>
                  <strong>{node.title}</strong>
                  <span>{node.scope}</span>
                  {showStatus && <em className={`story-node-status ${status}`}>{storyNodeStatusText(status)}</em>}
                </button>
              </Fragment>
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
              <em>{activeArtifactStatus ? storyNodeStatusText(activeArtifactStatus) : "未生成"}</em>
              {isChapterSummary && selectedChapter && <small>{selectedChapter.label} / {selectedChapter.episodeRange || selectedChapter.title}</small>}
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

          <StoryArtifactPanel
            title={`${activeNode.title}产物`}
            artifact={activeArtifact}
            status={activeArtifactStatus}
            isLoading={isChapterArtifactLoading}
            artifactView={artifactView}
            onArtifactViewChange={setArtifactView}
            emptyText={isChapterSummary ? "当前章节还没有产物。" : "该节点还没有产物。"}
          />
          </section>
        )}
      </div>
    </>
  );
}

function buildStoryPlanningSeriesTabs(nodes: StoryWorkflowNode[]) {
  const order: StoryWorkflowNodeId[] = ["series_summary", "story_map", "character_summary", "continuity"];
  return order.map((nodeId) => nodes.find((node) => node.id === nodeId)).filter((node): node is StoryWorkflowNode => Boolean(node));
}

function buildStoryboardPlanningStages(nodes: StoryWorkflowNode[]) {
  const order: StoryboardPlanningStage[] = ["episode_summary", "scene_summary", "storyboard_design"];
  return order.map((nodeId) => nodes.find((node) => node.id === nodeId)).filter((node): node is StoryWorkflowNode => Boolean(node));
}

function countWorkflowStatuses(
  nodes: StoryWorkflowNode[],
  artifacts: Partial<Record<StoryWorkflowNodeId, StoryWorkflowArtifact>>,
  runningNodeId: StoryWorkflowNodeId | "",
  runningBatchLabel: string,
) {
  const statuses = nodes.map((node) => (runningNodeId === node.id ? "running" : artifacts[node.id]?.status ?? "idle"));
  const done = statuses.filter((status) => status === "done").length;
  const attention = statuses.filter((status) => status === "running" || status === "error").length + (runningBatchLabel ? 1 : 0);
  return { done, attention };
}

function WorkflowMetric({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="story-workflow-metric">
      {icon}
      <strong>{value.toLocaleString()}</strong>
      <span>{label}</span>
    </div>
  );
}

function buildWorkflowOverviewCopy(variant: "planning" | "workflow") {
  if (variant === "planning") {
    return {
      totalLabel: "统筹节点",
      baseLabel: "全剧信息流",
      summaryLabel: "汇总产物",
      currentLabel: "当前统筹产物",
      firstGroupLabel: "全剧基础信息",
      secondGroupLabel: "全集与章节",
      emptyStateTarget: "剧本统筹节点",
    };
  }
  return {
    totalLabel: "工作节点",
    baseLabel: "前置节点",
    summaryLabel: "汇总节点",
    currentLabel: "当前审阅",
    firstGroupLabel: "基础节点",
    secondGroupLabel: "汇总节点",
    emptyStateTarget: "工作流节点",
  };
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

function filterStoryWorkflowNodes(state: StoryWorkflowState | null, page: StoryWorkflowNode["page"]) {
  return state?.nodes.filter((node) => node.page === page) ?? [];
}

function storyNodeStatusText(status: StoryWorkflowArtifact["status"] | "idle" | "running") {
  if (status === "done") return "已完成";
  if (status === "running") return "执行中";
  if (status === "error") return "失败";
  return "未生成";
}
