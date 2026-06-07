import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Layers3, Play, RefreshCcw, Sparkles } from "lucide-react";
import { loadStoryWorkflowArtifact, type StoryWorkflowArtifact, type StoryWorkflowNode, type StoryWorkflowNodeId, type StoryWorkflowState } from "../lib/storyWorkflowApi";
import type { EpisodeResult } from "../lib/storyboard";
import { formatJson } from "../lib/storyboard";
import { asArray, asRecord, textValue } from "../lib/valueFormat";
import { StoryArtifactReview } from "./StoryArtifactReview";

export type StoryboardExecutionMode = "integrated" | "separate";

export type StoryWorkflowRunOptions = {
  chapterId?: string;
  chapterIds?: string[];
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

export function StoryPlanningView({
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
  description?: string;
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
          {description && <p>{description}</p>}
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
              <div className="empty-state">{isChapterSummary ? "当前章节还没有产物。" : "该节点还没有产物。"}</div>
            )}
          </article>
        </section>
      )}
    </div>
  );
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
