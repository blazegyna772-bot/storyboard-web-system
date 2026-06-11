import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { Database, Eye, Image, Plus, Save, Sparkles, Trash2, Upload, X } from "lucide-react";
import { assetKindLabel, assetKindOptions } from "../lib/assetLabels";
import {
  deleteProjectAssetCandidateImage,
  generateProjectAssetImage,
  normalizeAssetReviewBundle,
  selectProjectAssetImage,
  toBackendAssetImageUrl,
  uploadProjectAssetImage,
  type AssetKind,
  type AssetReviewBundle,
  type AssetTrueSourceItem,
} from "../lib/assetApi";
import type { DevLogLevel } from "./DevLogPanel";

export function AssetReviewView({
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

function assetColumnLabel(column: string) {
  return assetColumnLabels[column] ?? column;
}

export function countAssetBundleRows(bundle: AssetReviewBundle) {
  const normalized = normalizeAssetReviewBundle(bundle);
  return Object.values(normalized.records).flat().length + Object.values(normalized.trueSources).flat().length;
}

export function buildTrueSourceFromRecord(kind: AssetKind, record: Record<string, string>, index: number): AssetTrueSourceItem {
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

function useLocalState(key: string, defaultValue: string) {
  const [value, setValue] = useState(() => localStorage.getItem(key) ?? defaultValue);

  useEffect(() => {
    localStorage.setItem(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
