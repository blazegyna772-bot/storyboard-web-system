import { useEffect, useState } from "react";
import { Play, RefreshCcw, Save, Sparkles } from "lucide-react";
import { toBackendAssetImageUrl, type AssetReviewBundle } from "../lib/assetApi";
import { saveStoryWorkflowArtifact, type StoryWorkflowArtifact, type StoryWorkflowNodeId, type StoryWorkflowState } from "../lib/storyWorkflowApi";
import { asArray, asRecord, asTextArray, textValue } from "../lib/valueFormat";
import { buildVideoGroupsFromBlockPlan, mergeVideoBlockGroups, videoBlockId, videoGroupStatusText } from "../lib/videoGroups";
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
