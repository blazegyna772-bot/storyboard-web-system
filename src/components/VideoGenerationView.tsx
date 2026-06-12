import { useEffect, useState } from "react";
import { Play, RefreshCcw, Save, Sparkles, X } from "lucide-react";
import { toBackendAssetImageUrl, type AssetReviewBundle } from "../lib/assetApi";
import { loadStoryWorkflowArtifact, saveStoryWorkflowArtifact, type StoryWorkflowArtifact, type StoryWorkflowNodeId, type StoryWorkflowState } from "../lib/storyWorkflowApi";
import { asArray, asRecord, textValue } from "../lib/valueFormat";
import { buildVideoBlocksFromPlan, mergeVideoBlocksWithPrompts, videoBlockId, videoPromptItems } from "../lib/videoGroups";
import { AssetLibrarySection, AssetThumbGrid, buildAnchoredAssetThumbs, buildVideoAssetThumbs } from "./VideoAssetLibrary";

type VideoGenerationRunOptions = {
  chapterId?: string;
  chapterIds?: string[];
  blockId?: string;
  blockStart?: string;
  blockEnd?: string;
  executionMode?: "integrated" | "separate";
};

export function VideoGenerationView({
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
  onRunNode: (nodeId: StoryWorkflowNodeId, options?: VideoGenerationRunOptions) => Promise<StoryWorkflowArtifact | null>;
  onRefresh: () => void;
}) {
  const [artifact, setArtifact] = useState<StoryWorkflowArtifact | null>(null);
  const [blockPlanArtifact, setBlockPlanArtifact] = useState<StoryWorkflowArtifact | null>(null);
  const [isLoadingScopedArtifacts, setIsLoadingScopedArtifacts] = useState(false);
  const promptItems = artifact?.status === "done" ? videoPromptItems(artifact.output) : [];
  const blockItems = buildVideoBlocksFromPlan(blockPlanArtifact?.output);
  const videoBlocks = mergeVideoBlocksWithPrompts(blockItems, promptItems);
  const videoBlockIds = videoBlocks.map(videoBlockId).filter(Boolean);
  const videoBlockIdsKey = videoBlockIds.join("|");
  const firstVideoBlockId = videoBlockId(videoBlocks[0]);
  const workflowEpisodes = state?.episodes ?? [];
  const activeWorkflowEpisode = workflowEpisodes.find((episode) => episode.episodeId === selectedEpisodeId) ?? workflowEpisodes[0];
  const sceneOptions = activeWorkflowEpisode?.scenes ?? [];
  const handleEpisodeChange = (episodeId: string) => {
    onSelectEpisode(episodeId);
    const nextEpisode = workflowEpisodes.find((episode) => episode.episodeId === episodeId);
    const nextScenes = nextEpisode?.scenes ?? [];
    if (nextScenes.length && !nextScenes.some((scene) => scene.sceneId === selectedSceneId)) {
      onSelectScene(nextScenes[0].sceneId);
    }
  };
  const [selectedVideoBlockId, setSelectedVideoBlockId] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [isRangeDialogOpen, setIsRangeDialogOpen] = useState(false);
  const selectedVideoBlock = videoBlocks.find((group) => videoBlockId(group) === selectedVideoBlockId) ?? videoBlocks[0];
  const selectedVideoPrompt = textValue(selectedVideoBlock?.prompt);
  const promptArtifactError = artifact?.status === "error" ? textValue(artifact.error, "视频提示词生成失败。") : "";
  const allAssetThumbs = buildVideoAssetThumbs(assetReviewBundle);
  const anchoredAssetThumbs = buildAnchoredAssetThumbs(selectedVideoBlock, allAssetThumbs);
  const videoPaths: string[] = [];
  const selectedVideoPath = videoPaths[selectedVideoIndex] ?? "";

  useEffect(() => {
    if (!projectId || !selectedEpisodeId || !selectedSceneId) {
      setArtifact(null);
      setBlockPlanArtifact(null);
      return;
    }
    let cancelled = false;
    setIsLoadingScopedArtifacts(true);
    Promise.all([
      loadStoryWorkflowArtifact(projectId, "storyboard_design", { episodeId: selectedEpisodeId, sceneId: selectedSceneId }),
      loadStoryWorkflowArtifact(projectId, "video_prompt", { episodeId: selectedEpisodeId, sceneId: selectedSceneId }),
    ])
      .then(([blockPlanResult, promptResult]) => {
        if (cancelled) return;
        setBlockPlanArtifact(blockPlanResult.artifact);
        setArtifact(promptResult.artifact);
      })
      .catch(() => {
        if (!cancelled) {
          setBlockPlanArtifact(null);
          setArtifact(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingScopedArtifacts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, selectedEpisodeId, selectedSceneId, state?.artifacts.storyboard_design?.updatedAt, state?.artifacts.video_prompt?.updatedAt]);

  useEffect(() => {
    if (!videoBlocks.length) {
      setSelectedVideoBlockId("");
      setBlockStart("");
      setBlockEnd("");
      return;
    }
    if (!videoBlockIds.includes(selectedVideoBlockId)) setSelectedVideoBlockId(firstVideoBlockId);
    if (!videoBlockIds.includes(blockStart)) setBlockStart(firstVideoBlockId);
    if (!videoBlockIds.includes(blockEnd)) setBlockEnd(firstVideoBlockId);
  }, [videoBlockIdsKey, selectedVideoBlockId, blockStart, blockEnd, firstVideoBlockId]);

  useEffect(() => {
    if (!sceneOptions.length) return;
    if (!sceneOptions.some((scene) => scene.sceneId === selectedSceneId)) {
      onSelectScene(sceneOptions[0].sceneId);
    }
  }, [sceneOptions, selectedSceneId, onSelectScene]);

  useEffect(() => {
    setPromptDraft(selectedVideoPrompt);
  }, [selectedVideoPrompt, selectedVideoBlockId]);

  useEffect(() => {
    setSelectedVideoIndex(0);
  }, [selectedVideoBlockId]);

  const saveSelectedPrompt = async () => {
    if (!selectedVideoBlock || !artifact) return;
    const nextPrompts = videoBlocks
      .filter((group) => textValue(group.prompt) || videoBlockId(group) === videoBlockId(selectedVideoBlock))
      .map((group) => ({
        block_id: videoBlockId(group),
        prompt: videoBlockId(group) === videoBlockId(selectedVideoBlock) ? promptDraft : textValue(group.prompt),
        asset_refs: asArray(group.asset_refs),
      }));
    setIsSavingPrompt(true);
    try {
      const result = await saveStoryWorkflowArtifact(projectId, "video_prompt", {
        output: {
          episode_id: selectedEpisodeId,
          scene_id: selectedSceneId,
          video_prompts: nextPrompts,
        },
        episodeId: selectedEpisodeId,
        sceneId: selectedSceneId,
      });
      setArtifact(result.artifact);
      onRefresh();
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const runCurrentBlockPrompt = async () => {
    const blockId = videoBlockId(selectedVideoBlock);
    if (!blockId) return;
    const result = await onRunNode("video_prompt", { blockId });
    if (result) setArtifact(result);
  };

  const runScenePrompt = async () => {
    const result = await onRunNode("video_prompt");
    if (result) setArtifact(result);
  };

  const runBlockRangePrompt = async () => {
    if (!blockStart && !blockEnd) return;
    const result = await onRunNode("video_prompt", { blockStart, blockEnd: blockEnd || blockStart });
    if (result) setArtifact(result);
    setIsRangeDialogOpen(false);
  };

  return (
    <section className="page-stack video-workspace-page">
      <div className="video-selection-bar">
        <div className="video-select-controls">
          <strong>视频生成</strong>
          <label className="video-episode-select">
            集
            <select value={selectedEpisodeId} onChange={(event) => handleEpisodeChange(event.target.value)}>
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
          <button onClick={() => void runScenePrompt()} disabled={Boolean(runningNodeId || runningBatchLabel || !videoBlocks.length)}>
            <Sparkles size={15} />
            整场提示词
          </button>
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
            <span>{videoBlocks.length}</span>
          </div>
          {videoBlocks.length ? videoBlocks.map((group, index) => {
            const groupId = videoBlockId(group) || `VB${String(index + 1).padStart(3, "0")}`;
            const isActive = videoBlockId(selectedVideoBlock) === groupId;
            return (
              <button key={`${groupId}-${index}`} className={isActive ? "active" : ""} onClick={() => setSelectedVideoBlockId(groupId)}>
                <strong>{groupId}</strong>
                <span>{textValue(group.duration_seconds)}秒</span>
                <small>{textValue(group.source_text)}</small>
                <em className={`story-node-status ${textValue(group.prompt) ? "done" : "idle"}`}>{textValue(group.prompt) ? "已生成" : "待生成"}</em>
              </button>
            );
          }) : (
            <div className="empty-state compact">{isLoadingScopedArtifacts ? "读取视频块..." : "暂无视频块。"}</div>
          )}
        </aside>

        <section className="video-group-detail">
          {selectedVideoBlock ? (
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
                      <span>{textValue(selectedVideoBlock.block_id)}</span>
                    </div>
                    <div className="video-generate-toolbar">
                      <div className="video-toolbar-left">
                        <button onClick={() => void runCurrentBlockPrompt()} disabled={Boolean(runningNodeId || runningBatchLabel || !selectedVideoBlock)}>
                          <Sparkles size={15} />
                          当前块提示词
                        </button>
                        <button onClick={() => setIsRangeDialogOpen(true)} disabled={Boolean(runningNodeId || runningBatchLabel || !videoBlocks.length)}>
                          <Sparkles size={15} />
                          区间提示词
                        </button>
                      </div>
                      <div className="video-toolbar-right">
                        <label>
                          数量
                          <select value={batchSize} onChange={(event) => setBatchSize(Number(event.target.value) || 1)}>
                            {Array.from({ length: 12 }, (_, index) => index + 1).map((count) => <option value={count} key={count}>{count}</option>)}
                          </select>
                        </label>
                        <label>
                          时长
                          <select value={durationSeconds} onChange={(event) => setDurationSeconds(Number(event.target.value) || 4)}>
                            {Array.from({ length: 12 }, (_, index) => index + 4).map((seconds) => <option value={seconds} key={seconds}>{seconds}</option>)}
                          </select>
                        </label>
                        <button className="primary-button" disabled>
                          <Play size={15} />
                          生成视频
                        </button>
                      </div>
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

      {isRangeDialogOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="区间提示词">
          <article className="modal-panel video-range-dialog">
            <div className="modal-title-row">
              <strong>区间提示词</strong>
              <button onClick={() => setIsRangeDialogOpen(false)} aria-label="关闭">
                <X size={16} />
              </button>
            </div>
            <div className="video-range-grid">
              <label>
                起始块
                <select value={blockStart} onChange={(event) => setBlockStart(event.target.value)}>
                  {videoBlocks.map((group, index) => {
                    const id = videoBlockId(group) || `VB${String(index + 1).padStart(3, "0")}`;
                    return <option value={id} key={id}>{id}</option>;
                  })}
                </select>
              </label>
              <label>
                结束块
                <select value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)}>
                  {videoBlocks.map((group, index) => {
                    const id = videoBlockId(group) || `VB${String(index + 1).padStart(3, "0")}`;
                    return <option value={id} key={id}>{id}</option>;
                  })}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setIsRangeDialogOpen(false)}>取消</button>
              <button className="primary-button" onClick={() => void runBlockRangePrompt()} disabled={Boolean(runningNodeId || runningBatchLabel || !videoBlocks.length)}>
                <Sparkles size={15} />
                生成区间提示词
              </button>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}
