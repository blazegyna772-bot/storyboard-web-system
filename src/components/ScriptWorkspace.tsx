import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileText,
  Filter,
  ListChecks,
  LocateFixed,
  Plus,
  RefreshCcw,
  Save,
  Settings2,
  Upload,
  X,
} from "lucide-react";
import {
  defaultEpisodeSplitRules,
  formatEpisodeSplitPreview,
  normalizeEpisodeSplitRules,
  replaceEpisodeSourceText,
  splitScriptIntoEpisodes,
  type EpisodeSplitPreviewData,
  type EpisodeSplitRule,
} from "../lib/episodeSplit";
import { buildScriptQualityReport, defaultScriptQualityRules, type ScriptIssue, type ScriptQualityRule } from "../lib/scriptQuality";
import type { EpisodeResult, ScriptAnalysis } from "../lib/storyboard";

type ScriptStage = "split" | "quality";
type IssueFilter = "all" | ScriptIssue["level"] | "open" | "resolved" | "ignored";
type IssueStatus = "open" | "resolved" | "ignored";
type IssueStatusMap = Record<string, IssueStatus>;

const splitStageKeyPrefix = "script-check-stage-v1:";
const issueStatusKeyPrefix = "script-check-issue-status-v1:";

export function ScriptRuleConfigDialog({
  rules,
  episodeSplitRules,
  onChange,
  onEpisodeSplitRulesChange,
  onClose,
}: {
  rules: ScriptQualityRule[];
  episodeSplitRules: EpisodeSplitRule[];
  onChange: (rules: ScriptQualityRule[]) => void;
  onEpisodeSplitRulesChange: (rules: EpisodeSplitRule[]) => void;
  onClose: () => void;
}) {
  const [activeRuleTab, setActiveRuleTab] = useState<"episode" | "quality">("episode");
  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [dragStart, setDragStart] = useState<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);

  function updateQualityRule(ruleId: string, patch: Partial<ScriptQualityRule>) {
    onChange(rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  }

  function updateEpisodeRule(ruleId: string, patch: Partial<EpisodeSplitRule>) {
    onEpisodeSplitRulesChange(episodeSplitRules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)));
  }

  function addEpisodeRule() {
    onEpisodeSplitRulesChange([
      ...episodeSplitRules,
      {
        id: `episode-custom-${Date.now()}`,
        name: "自定义分集规则",
        pattern: "^\\s*第\\s*([0-9]+)\\s*集(?:\\s+.*)?$",
        description: "只填写能稳定识别集号的正则，第一组必须是集号。",
        enabled: true,
      },
    ]);
  }

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button,input,select,textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart({ pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: dialogPosition.x, originY: dialogPosition.y });
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    setDialogPosition({
      x: dragStart.originX + event.clientX - dragStart.x,
      y: dragStart.originY + event.clientY - dragStart.y,
    });
  }

  function endDrag() {
    setDragStart(null);
  }

  return (
    <div className="modal-overlay script-rule-overlay" role="dialog" aria-modal="true" aria-label="校检规则配置">
      <article className="modal-panel script-rule-modal" style={{ transform: `translate(${dialogPosition.x}px, ${dialogPosition.y}px)` }}>
        <div className="drawer-header draggable-modal-header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
          <div className="panel-title">
            <Edit3 size={18} />
            <span>{activeRuleTab === "episode" ? "分集规则配置" : "正则校验配置"}</span>
          </div>
          <button onClick={onClose} title="关闭">
            <X size={18} />
          </button>
        </div>
        <div className="rule-tabs mode-switch">
          <button className={activeRuleTab === "episode" ? "active" : ""} onClick={() => setActiveRuleTab("episode")}>
            分集规则
          </button>
          <button className={activeRuleTab === "quality" ? "active" : ""} onClick={() => setActiveRuleTab("quality")}>
            正则校验
          </button>
        </div>
        <div className="script-rule-scroll-area">
          {activeRuleTab === "episode" ? (
            <RulePanel title="分集规则" summary={`${episodeSplitRules.filter((rule) => rule.enabled).length} / ${episodeSplitRules.length} 启用`}>
              <div className="script-rule-list">
                {episodeSplitRules.map((rule, index) => (
                  <article key={rule.id} className="script-rule-item episode-rule-config-card">
                    <RuleIndex index={index + 1} enabled={rule.enabled} />
                    <label className="rule-enabled">
                      <input type="checkbox" checked={rule.enabled} onChange={(event) => updateEpisodeRule(rule.id, { enabled: event.target.checked })} />
                      启用
                    </label>
                    <label>
                      规则名
                      <input value={rule.name} onChange={(event) => updateEpisodeRule(rule.id, { name: event.target.value })} />
                    </label>
                    <label className="rule-description">
                      正则表达式
                      <textarea value={rule.pattern} onChange={(event) => updateEpisodeRule(rule.id, { pattern: event.target.value })} spellCheck={false} />
                    </label>
                    <label className="rule-description">
                      说明
                      <textarea value={rule.description} onChange={(event) => updateEpisodeRule(rule.id, { description: event.target.value })} />
                    </label>
                  </article>
                ))}
              </div>
            </RulePanel>
          ) : (
            <RulePanel title="正则校验规则" summary={`${rules.filter((rule) => rule.enabled).length} / ${rules.length} 启用`}>
              <p className="rule-boundary-note">这里只保留稳定的程序检查；剧情理解、人物关系、逻辑一致性留给人工或 LLM 复核。</p>
              <div className="script-rule-list">
                {rules.map((rule, index) => (
                  <article key={rule.id} className="script-rule-item">
                    <RuleIndex index={index + 1} enabled={rule.enabled} />
                    <label className="rule-enabled">
                      <input type="checkbox" checked={rule.enabled} onChange={(event) => updateQualityRule(rule.id, { enabled: event.target.checked })} />
                      启用
                    </label>
                    <label>
                      规则名
                      <input value={rule.name} onChange={(event) => updateQualityRule(rule.id, { name: event.target.value })} />
                    </label>
                    <label>
                      等级
                      <select value={rule.level} onChange={(event) => updateQualityRule(rule.id, { level: event.target.value as ScriptQualityRule["level"] })}>
                        <option value="错误">错误</option>
                        <option value="警告">警告</option>
                        <option value="提示">提示</option>
                      </select>
                    </label>
                    <label className="rule-description">
                      规则说明
                      <textarea value={rule.description} onChange={(event) => updateQualityRule(rule.id, { description: event.target.value })} />
                    </label>
                  </article>
                ))}
              </div>
            </RulePanel>
          )}
        </div>
        <div className="modal-actions">
          {activeRuleTab === "episode" ? (
            <>
              <button onClick={addEpisodeRule}>
                <Plus size={16} />
                添加规则
              </button>
              <button onClick={() => onEpisodeSplitRulesChange(defaultEpisodeSplitRules)}>
                <RefreshCcw size={16} />
                读取默认
              </button>
            </>
          ) : (
            <button onClick={() => onChange(defaultScriptQualityRules)}>
              <RefreshCcw size={16} />
              读取默认
            </button>
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

export function ScriptWorkspace({
  projectId,
  script,
  report,
  analysis,
  rules,
  episodeSplitRules,
  onScriptChange,
  onEpisodeFileUpload,
  onBatchEpisodeUpload,
  onRunScriptCheck,
  onOpenRuleConfig,
  onEpisodeSplitRulesChange,
  onConfirmSplitScript,
  onSaveManualScript,
  onApplyCleanedScript,
}: {
  projectId: string;
  script: string;
  report: ReturnType<typeof buildScriptQualityReport>;
  analysis: ScriptAnalysis;
  rules: ScriptQualityRule[];
  episodeSplitRules: EpisodeSplitRule[];
  onScriptChange: (value: string) => void;
  onEpisodeFileUpload: (file: File | undefined, mode: "append" | "replace", episodeNumber: number) => Promise<void>;
  onBatchEpisodeUpload: (files: FileList | null) => Promise<void>;
  onRunScriptCheck: () => void;
  onOpenRuleConfig: () => void;
  onEpisodeSplitRulesChange: (rules: EpisodeSplitRule[]) => void;
  onConfirmSplitScript: (nextScript: string) => void;
  onSaveManualScript: () => void;
  onApplyCleanedScript: () => void;
}) {
  const storageSuffix = projectId || "local";
  const [stage, setStage] = useState<ScriptStage>(() => loadStage(storageSuffix));
  const [episodeImportMode, setEpisodeImportMode] = useState<"append" | "replace" | "batch">("append");
  const [episodeNumberDraft, setEpisodeNumberDraft] = useState(1);
  const [selectedScriptEpisodeId, setSelectedScriptEpisodeId] = useState(analysis.episodes[0]?.episodeId ?? "EP01");
  const [activeIssueLine, setActiveIssueLine] = useState<number | null>(null);
  const [issueFilter, setIssueFilter] = useState<IssueFilter>("all");
  const [issueStatuses, setIssueStatuses] = useState<IssueStatusMap>(() => loadIssueStatuses(storageSuffix));
  const [splitSource, setSplitSource] = useState(script);
  const [splitFileName, setSplitFileName] = useState(script ? "当前项目剧本" : "");
  const [selectedSplitIndex, setSelectedSplitIndex] = useState(0);
  const selectedEpisode = analysis.episodes.find((episode) => episode.episodeId === selectedScriptEpisodeId) ?? analysis.episodes[0];
  const selectedReport = useMemo(() => buildScriptQualityReport(selectedEpisode?.sourceText ?? "", rules), [selectedEpisode?.sourceText, rules]);
  const selectedIssueCounts = countIssueLevels(selectedReport.issues);
  const selectedIssueScope = selectedEpisode?.episodeId ?? "";
  const resolvedCount = selectedReport.issues.filter((issue) => getIssueStatus(issueStatuses, issue, selectedIssueScope) === "resolved").length;
  const ignoredCount = selectedReport.issues.filter((issue) => getIssueStatus(issueStatuses, issue, selectedIssueScope) === "ignored").length;
  const openCount = selectedReport.issues.length - resolvedCount - ignoredCount;
  const checkedEpisodeCount = analysis.episodes.filter((episode) => buildScriptQualityReport(episode.sourceText, rules).issues.length === 0).length;
  const selectedEpisodeIndex = Math.max(0, analysis.episodes.findIndex((episode) => episode.episodeId === selectedEpisode?.episodeId));
  const splitPreview = useMemo(() => splitScriptIntoEpisodes(splitSource, episodeSplitRules), [splitSource, episodeSplitRules]);
  const activeSplitEpisode = splitPreview.episodes[selectedSplitIndex] ?? splitPreview.episodes[0];

  useEffect(() => {
    setStage(loadStage(storageSuffix));
    setIssueStatuses(loadIssueStatuses(storageSuffix));
    setSplitSource(script);
    setSplitFileName(script ? "当前项目剧本" : "");
  }, [storageSuffix]);

  useEffect(() => {
    window.localStorage.setItem(splitStageKeyPrefix + storageSuffix, stage);
  }, [stage, storageSuffix]);

  useEffect(() => {
    window.localStorage.setItem(issueStatusKeyPrefix + storageSuffix, JSON.stringify(issueStatuses));
  }, [issueStatuses, storageSuffix]);

  useEffect(() => {
    if (!analysis.episodes.some((episode) => episode.episodeId === selectedScriptEpisodeId)) {
      setSelectedScriptEpisodeId(analysis.episodes[0]?.episodeId ?? "EP01");
    }
  }, [analysis.episodes, selectedScriptEpisodeId]);

  useEffect(() => {
    if (selectedSplitIndex >= splitPreview.episodes.length) {
      setSelectedSplitIndex(Math.max(0, splitPreview.episodes.length - 1));
    }
  }, [selectedSplitIndex, splitPreview.episodes.length]);

  function updateSelectedEpisodeScript(value: string) {
    if (!selectedEpisode) return;
    onScriptChange(replaceEpisodeSourceText(analysis, selectedEpisode.episodeId, value));
    setActiveIssueLine(null);
  }

  async function importWholeScript(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setSplitFileName(file.name);
    setSplitSource(text);
    setSelectedSplitIndex(0);
    setStage("split");
  }

  function confirmCurrentSplit() {
    if (!splitPreview.episodes.length) return;
    onConfirmSplitScript(formatEpisodeSplitPreview(splitPreview));
    setSplitFileName("当前项目剧本");
    setStage("quality");
  }

  function updateSplitEpisodeText(index: number, value: string) {
    const nextEpisodes = splitPreview.episodes.map((episode, episodeIndex) => episodeIndex === index ? { ...episode, text: value } : episode);
    setSplitSource(formatEpisodeSplitPreview({ episodes: nextEpisodes, warnings: [] }));
  }

  function runScriptCheck() {
    onRunScriptCheck();
    setStage("quality");
  }

  function updateIssueStatus(issue: ScriptIssue, status: IssueStatus) {
    setIssueStatuses((current) => ({ ...current, [issueKey(issue, selectedIssueScope)]: status }));
  }

  function resetIssueStatuses() {
    setIssueStatuses({});
  }

  function exportIssues() {
    const rows = selectedReport.issues.map((issue) => ({
      episodeId: selectedEpisode?.episodeId ?? "",
      line: issue.line,
      level: issue.level,
      category: issue.category,
      ruleId: issue.ruleId,
      status: getIssueStatus(issueStatuses, issue, selectedIssueScope),
      message: issue.message,
      excerpt: issue.excerpt,
    }));
    downloadText(`script_issues_${selectedEpisode?.episodeId ?? "EP"}.json`, JSON.stringify(rows, null, 2));
  }

  function openSplitStageFromProjectScript() {
    setSplitSource(script);
    setSplitFileName(script ? "当前项目剧本" : "");
    setSelectedSplitIndex(0);
    setStage("split");
  }

  return (
    <section className="page-stack script-check-page">
      <div className="script-check-header panel">
        <div className="script-check-title">
          <h2>剧本校检</h2>
          <span>全本 · {analysis.episodes.length} 集 · {stage === "split" ? "分集确认" : "正式校检"}</span>
        </div>
        <div className="script-check-actions">
          <button className="script-icon-action" onClick={onOpenRuleConfig} title="规则配置">
            <Settings2 size={16} />
          </button>
          <label className="file-button">
            <Upload size={16} />
            导入全集
            <input type="file" accept=".txt,.md" onChange={(event) => void importWholeScript(event.target.files?.[0])} />
          </label>
          <button onClick={openSplitStageFromProjectScript}>
            <Eye size={16} />
            分集确认
          </button>
          <button className="primary-button" onClick={runScriptCheck}>
            <CheckCircle2 size={16} />
            执行校检
          </button>
          <button onClick={onSaveManualScript}>
            <Save size={16} />
            保存人工编辑稿
          </button>
          <button onClick={onApplyCleanedScript}>
            <Check size={16} />
            应用规则清洗稿
          </button>
        </div>
      </div>

      <StageStepper stage={stage} onStageChange={setStage} />

      {stage === "split" ? (
        <SplitStageView
          fileName={splitFileName}
          sourceText={splitSource}
          preview={splitPreview}
          selectedIndex={selectedSplitIndex}
          episodeSplitRules={episodeSplitRules}
          episodeImportMode={episodeImportMode}
          episodeNumberDraft={episodeNumberDraft}
          onSelectIndex={setSelectedSplitIndex}
          onSourceTextChange={setSplitSource}
          onEpisodeTextChange={(value) => updateSplitEpisodeText(selectedSplitIndex, value)}
          onRulesChange={onEpisodeSplitRulesChange}
          onImportWhole={importWholeScript}
          onModeChange={setEpisodeImportMode}
          onEpisodeNumberChange={setEpisodeNumberDraft}
          onEpisodeFileUpload={onEpisodeFileUpload}
          onBatchEpisodeUpload={onBatchEpisodeUpload}
          onConfirm={confirmCurrentSplit}
          activeEpisode={activeSplitEpisode}
        />
      ) : (
        <>
          <section className="script-check-summary panel">
            <div className="script-file-summary">
              <FileText size={32} />
              <div>
                <strong>当前剧本</strong>
                <span>{analysis.episodes.length} 集 / {report.stats.characters.toLocaleString()} 字</span>
              </div>
            </div>
            <Metric icon={<ListChecks size={18} />} label="总集数" value={analysis.episodes.length} />
            <Metric icon={<CheckCircle2 size={18} />} label="无问题集" value={checkedEpisodeCount} />
            <Metric icon={<AlertTriangle size={18} />} label="错误" value={selectedIssueCounts.errors} />
            <Metric icon={<AlertTriangle size={18} />} label="警告" value={selectedIssueCounts.warnings} />
            <Metric icon={<Settings2 size={18} />} label="启用规则" value={rules.filter((rule) => rule.enabled).length} />
          </section>

          <div className="script-workbench-grid">
            <EpisodeListPanel
              episodes={analysis.episodes}
              selectedEpisodeId={selectedEpisode?.episodeId ?? ""}
              rules={rules}
              issueStatuses={issueStatuses}
              onSelect={setSelectedScriptEpisodeId}
            />
            <section className="script-current-panel panel">
              <div className="script-current-title">
                <div>
                  <span>当前剧本</span>
                  <strong>第{selectedEpisodeIndex + 1}集</strong>
                </div>
                <div className="script-current-tags">
                  <span>{selectedEpisode?.episodeId ?? "无"}</span>
                  <span>{(selectedEpisode?.sourceText.length ?? 0).toLocaleString()} 字</span>
                  <span>{openCount} 个问题</span>
                </div>
              </div>
              <ScriptSourceEditor
                value={selectedEpisode?.sourceText ?? ""}
                onChange={updateSelectedEpisodeScript}
                activeLine={activeIssueLine}
                issueLines={selectedReport.issues.map((issue) => issue.line)}
              />
            </section>
            <ScriptQualityView
              report={selectedReport}
              episodeId={selectedEpisode?.episodeId ?? ""}
              activeIssueLine={activeIssueLine}
              issueFilter={issueFilter}
              issueStatuses={issueStatuses}
              issueStatusScope={selectedIssueScope}
              issueCounts={{ ...selectedIssueCounts, open: openCount, resolved: resolvedCount, ignored: ignoredCount }}
              onFilterChange={setIssueFilter}
              onSelectIssueLine={setActiveIssueLine}
              onIssueStatusChange={updateIssueStatus}
              onResetStatuses={resetIssueStatuses}
              onExportIssues={exportIssues}
            />
          </div>
        </>
      )}
    </section>
  );
}

function StageStepper({ stage, onStageChange }: { stage: ScriptStage; onStageChange: (stage: ScriptStage) => void }) {
  return (
    <div className="script-stepper">
      <button className={`script-step ${stage === "split" ? "current" : "completed"}`} onClick={() => onStageChange("split")}>
        <div className="script-step-inner">
          <strong>{stage === "split" ? "1" : <Check size={17} />}</strong>
          <div>
            <span>导入与分集确认</span>
            <small>{stage === "split" ? "识别全集并确认分集边界" : "已完成分集识别与确认"}</small>
          </div>
        </div>
      </button>
      <button className={`script-step ${stage === "quality" ? "current" : ""}`} onClick={() => onStageChange("quality")}>
        <div className="script-step-inner">
          <strong>2</strong>
          <div>
            <span>正式校检</span>
            <small>按稳定规则检查格式问题</small>
          </div>
        </div>
      </button>
    </div>
  );
}

function SplitStageView({
  fileName,
  sourceText,
  preview,
  selectedIndex,
  activeEpisode,
  episodeSplitRules,
  episodeImportMode,
  episodeNumberDraft,
  onSelectIndex,
  onSourceTextChange,
  onEpisodeTextChange,
  onRulesChange,
  onImportWhole,
  onModeChange,
  onEpisodeNumberChange,
  onEpisodeFileUpload,
  onBatchEpisodeUpload,
  onConfirm,
}: {
  fileName: string;
  sourceText: string;
  preview: EpisodeSplitPreviewData;
  selectedIndex: number;
  activeEpisode: EpisodeSplitPreviewData["episodes"][number] | undefined;
  episodeSplitRules: EpisodeSplitRule[];
  episodeImportMode: "append" | "replace" | "batch";
  episodeNumberDraft: number;
  onSelectIndex: (index: number) => void;
  onSourceTextChange: (value: string) => void;
  onEpisodeTextChange: (value: string) => void;
  onRulesChange: (rules: EpisodeSplitRule[]) => void;
  onImportWhole: (file: File | undefined) => Promise<void>;
  onModeChange: (mode: "append" | "replace" | "batch") => void;
  onEpisodeNumberChange: (value: number) => void;
  onEpisodeFileUpload: (file: File | undefined, mode: "append" | "replace", episodeNumber: number) => Promise<void>;
  onBatchEpisodeUpload: (files: FileList | null) => Promise<void>;
  onConfirm: () => void;
}) {
  const enabledRuleCount = episodeSplitRules.filter((rule) => rule.enabled).length;
  return (
    <>
      <section className="split-file-strip panel">
        <div className="script-file-summary">
          <FileText size={34} />
          <div>
            <strong>{fileName || "未导入全集剧本"}</strong>
            <span>{sourceText ? `${sourceText.length.toLocaleString()} 字` : "可导入 .txt / .md，或直接粘贴文本"}</span>
          </div>
        </div>
        <Metric icon={<ListChecks size={18} />} label="已识别" value={preview.episodes.length} />
        <Metric icon={<AlertTriangle size={18} />} label="异常" value={preview.warnings.length} />
        <Metric icon={<Settings2 size={18} />} label="启用规则" value={enabledRuleCount} />
        <label className="file-button">
          <Upload size={16} />
          重新导入
          <input type="file" accept=".txt,.md" onChange={(event) => void onImportWhole(event.target.files?.[0])} />
        </label>
        <button className="primary-button" onClick={onConfirm} disabled={!preview.episodes.length}>
          <CheckCircle2 size={16} />
          确认分集
        </button>
      </section>
      <div className="split-workbench-grid">
        <section className="panel split-list-panel">
          <div className="panel-title">
            <ListChecks size={18} />
            <span>分集列表</span>
            <strong>共 {preview.episodes.length} 集</strong>
          </div>
          <div className="split-episode-list">
            {preview.episodes.map((episode, index) => (
              <button key={`${episode.episodeNumber}-${index}`} className={index === selectedIndex ? "active" : ""} onClick={() => onSelectIndex(index)}>
                <strong>第{episode.episodeNumber}集</strong>
                <span>{episode.title}</span>
                <em>{episode.text.length.toLocaleString()} 字</em>
              </button>
            ))}
            {!preview.episodes.length && <div className="empty-state">暂无分集结果。</div>}
          </div>
        </section>
        <section className="panel split-preview-panel">
          <div className="script-current-title">
            <div>
              <span>当前集预览</span>
              <strong>{activeEpisode?.title ?? "未选择"}</strong>
            </div>
            <div className="script-current-tags">
              <span>{activeEpisode ? `第${activeEpisode.episodeNumber}集` : "无"}</span>
              <span>{(activeEpisode?.text.length ?? 0).toLocaleString()} 字</span>
            </div>
          </div>
          <SplitTextPreview value={activeEpisode?.text || sourceText} onChange={activeEpisode ? onEpisodeTextChange : onSourceTextChange} />
        </section>
        <section className="panel split-inspection-panel">
          <div className="panel-title">
            <AlertTriangle size={18} />
            <span>分集检查与处理</span>
            <strong>{preview.warnings.length}</strong>
          </div>
          <div className="split-warning-card">
            {preview.warnings.length ? (
              preview.warnings.map((warning) => <p key={warning}>{warning}</p>)
            ) : (
              <p className="success-copy">当前分集未发现稳定规则异常。</p>
            )}
          </div>
          <RuleQuickList rules={episodeSplitRules} onChange={onRulesChange} />
          <div className="single-episode-import">
            <select value={episodeImportMode} onChange={(event) => onModeChange(event.target.value as "append" | "replace" | "batch")}>
              <option value="append">追加一集</option>
              <option value="replace">替换某集</option>
              <option value="batch">批量导入</option>
            </select>
            {episodeImportMode === "replace" && (
              <input type="number" min="1" value={episodeNumberDraft} onChange={(event) => onEpisodeNumberChange(Number(event.target.value) || 1)} />
            )}
            <label className="file-button">
              <Upload size={16} />
              选择文件
              <input
                type="file"
                accept=".txt,.md"
                multiple={episodeImportMode === "batch"}
                onChange={(event) => {
                  episodeImportMode === "batch"
                    ? void onBatchEpisodeUpload(event.target.files)
                    : void onEpisodeFileUpload(event.target.files?.[0], episodeImportMode, episodeNumberDraft);
                }}
              />
            </label>
          </div>
        </section>
      </div>
    </>
  );
}

function ScriptSourceEditor({
  value,
  onChange,
  activeLine,
  issueLines,
}: {
  value: string;
  onChange: (value: string) => void;
  activeLine: number | null;
  issueLines: number[];
}) {
  return <ScriptLineEditor value={value} onChange={onChange} activeLine={activeLine} issueLines={issueLines} />;
}

function SplitTextPreview({ value, onChange }: { value: string; onChange?: (value: string) => void }) {
  return <ScriptLineEditor value={value} onChange={onChange} />;
}

function ScriptLineEditor({
  value,
  onChange,
  activeLine,
  issueLines = [],
}: {
  value: string;
  onChange?: (value: string) => void;
  activeLine?: number | null;
  issueLines?: number[];
}) {
  const lines = useMemo(() => value.split("\n"), [value]);
  const issueLineSet = useMemo(() => new Set(issueLines), [issueLines]);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const inputRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    if (!activeLine) return;
    rowRefs.current[activeLine]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLine]);

  function commitLines(nextLines: string[]) {
    onChange?.(nextLines.join("\n"));
  }

  function focusLine(lineNumber: number, cursorPosition?: number) {
    window.setTimeout(() => {
      const input = inputRefs.current[lineNumber];
      if (!input) return;
      input.focus();
      const position = cursorPosition ?? input.value.length;
      input.setSelectionRange(position, position);
    });
  }

  function updateLine(index: number, nextValue: string) {
    const nextParts = nextValue.split("\n");
    const nextLines = [...lines];
    nextLines.splice(index, 1, ...nextParts);
    commitLines(nextLines);
  }

  function splitLine(index: number, cursorPosition: number) {
    const currentLine = lines[index] ?? "";
    const nextLines = [...lines];
    nextLines.splice(index, 1, currentLine.slice(0, cursorPosition), currentLine.slice(cursorPosition));
    commitLines(nextLines);
    focusLine(index + 2, 0);
  }

  function mergeWithPrevious(index: number) {
    if (index <= 0) return;
    const previousLine = lines[index - 1] ?? "";
    const currentLine = lines[index] ?? "";
    const nextLines = [...lines];
    nextLines.splice(index - 1, 2, `${previousLine}${currentLine}`);
    commitLines(nextLines);
    focusLine(index, previousLine.length);
  }

  function pasteIntoLine(index: number, pastedText: string, selectionStart: number, selectionEnd: number) {
    const currentLine = lines[index] ?? "";
    const parts = pastedText.replace(/\r\n?/g, "\n").split("\n");
    if (parts.length === 1) {
      updateLine(index, `${currentLine.slice(0, selectionStart)}${pastedText}${currentLine.slice(selectionEnd)}`);
      focusLine(index + 1, selectionStart + pastedText.length);
      return;
    }

    const replacement = [...parts];
    replacement[0] = `${currentLine.slice(0, selectionStart)}${replacement[0]}`;
    replacement[replacement.length - 1] = `${replacement[replacement.length - 1]}${currentLine.slice(selectionEnd)}`;
    const nextLines = [...lines];
    nextLines.splice(index, 1, ...replacement);
    commitLines(nextLines);
    focusLine(index + replacement.length, parts[parts.length - 1].length);
  }

  return (
    <div className="script-line-editor" role="region" aria-label="剧本编辑区">
      {lines.map((line, index) => {
        const lineNumber = index + 1;
        return (
          <div
            key={`${lineNumber}-${lines.length}`}
            ref={(node) => {
              rowRefs.current[lineNumber] = node;
            }}
            className={[
              "script-line-row",
              issueLineSet.has(lineNumber) ? "has-issue" : "",
              activeLine === lineNumber ? "active" : "",
              onChange ? "" : "readonly",
            ].filter(Boolean).join(" ")}
          >
            <span className="script-line-number">{lineNumber}</span>
            <ScriptLineInput
              value={line}
              readOnly={!onChange}
              inputRef={(node) => {
                inputRefs.current[lineNumber] = node;
              }}
              onChange={(nextValue) => updateLine(index, nextValue)}
              onEnter={(cursorPosition) => splitLine(index, cursorPosition)}
              onMergePrevious={() => mergeWithPrevious(index)}
              onPaste={(text, selectionStart, selectionEnd) => pasteIntoLine(index, text, selectionStart, selectionEnd)}
            />
          </div>
        );
      })}
    </div>
  );
}

function ScriptLineInput({
  value,
  readOnly,
  inputRef,
  onChange,
  onEnter,
  onMergePrevious,
  onPaste,
}: {
  value: string;
  readOnly: boolean;
  inputRef: (node: HTMLTextAreaElement | null) => void;
  onChange: (value: string) => void;
  onEnter: (cursorPosition: number) => void;
  onMergePrevious: () => void;
  onPaste: (text: string, selectionStart: number, selectionEnd: number) => void;
}) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const input = localRef.current;
    if (!input) return;
    input.style.height = "0px";
    input.style.height = `${input.scrollHeight}px`;
  }, [value]);

  function setRefs(node: HTMLTextAreaElement | null) {
    localRef.current = node;
    inputRef(node);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      onEnter(event.currentTarget.selectionStart);
      return;
    }
    if (event.key === "Backspace" && event.currentTarget.selectionStart === 0 && event.currentTarget.selectionEnd === 0) {
      event.preventDefault();
      onMergePrevious();
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    const pastedText = event.clipboardData.getData("text/plain");
    if (!pastedText.includes("\n") && !pastedText.includes("\r")) return;
    event.preventDefault();
    onPaste(pastedText, event.currentTarget.selectionStart, event.currentTarget.selectionEnd);
  }

  return (
    <textarea
      ref={setRefs}
      value={value}
      readOnly={readOnly}
      rows={1}
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
    />
  );
}

function EpisodeListPanel({
  episodes,
  selectedEpisodeId,
  rules,
  issueStatuses,
  onSelect,
}: {
  episodes: EpisodeResult[];
  selectedEpisodeId: string;
  rules: ScriptQualityRule[];
  issueStatuses: IssueStatusMap;
  onSelect: (episodeId: string) => void;
}) {
  return (
    <section className="panel script-episode-panel">
      <div className="panel-title">
        <ListChecks size={18} />
        <span>分集列表</span>
        <strong>共 {episodes.length} 集</strong>
      </div>
      <aside className="episode-rail panel" aria-label="分集导航">
        {episodes.map((episode) => {
          const issues = buildScriptQualityReport(episode.sourceText, rules).issues;
          const openIssues = issues.filter((issue) => getIssueStatus(issueStatuses, issue, episode.episodeId) === "open");
          return (
            <button key={episode.episodeId} className={episode.episodeId === selectedEpisodeId ? "active" : ""} title={`${episode.title} / ${episode.characterCount.toLocaleString()} 字`} onClick={() => onSelect(episode.episodeId)}>
              <strong>{episode.episodeId.replace(/^EP0?/, "第")}集</strong>
              <span>{episode.characterCount.toLocaleString()} 字</span>
              <em>{openIssues.length ? `${openIssues.length} 问题` : "正常"}</em>
            </button>
          );
        })}
        {!episodes.length && <div className="empty-state">暂无分集。</div>}
      </aside>
    </section>
  );
}

function ScriptQualityView({
  report,
  episodeId,
  activeIssueLine,
  issueFilter,
  issueStatuses,
  issueStatusScope,
  issueCounts,
  onFilterChange,
  onSelectIssueLine,
  onIssueStatusChange,
  onResetStatuses,
  onExportIssues,
}: {
  report: ReturnType<typeof buildScriptQualityReport>;
  episodeId: string;
  activeIssueLine: number | null;
  issueFilter: IssueFilter;
  issueStatuses: IssueStatusMap;
  issueStatusScope: string;
  issueCounts: { errors: number; warnings: number; hints: number; open: number; resolved: number; ignored: number };
  onFilterChange: (filter: IssueFilter) => void;
  onSelectIssueLine: (line: number) => void;
  onIssueStatusChange: (issue: ScriptIssue, status: IssueStatus) => void;
  onResetStatuses: () => void;
  onExportIssues: () => void;
}) {
  const filteredIssues = report.issues.filter((issue) => {
    const status = getIssueStatus(issueStatuses, issue, issueStatusScope);
    if (issueFilter === "all") return true;
    if (issueFilter === "open" || issueFilter === "resolved" || issueFilter === "ignored") return status === issueFilter;
    return issue.level === issueFilter;
  });

  return (
    <section className="panel script-issue-panel">
      <div className="panel-title">
        <AlertTriangle size={18} />
        <span>问题列表</span>
        <strong>{filteredIssues.length}</strong>
      </div>
      <div className="script-issue-tabs">
        <FilterButton label="全部" count={report.issues.length} active={issueFilter === "all"} onClick={() => onFilterChange("all")} />
        <FilterButton label="错误" count={issueCounts.errors} active={issueFilter === "错误"} onClick={() => onFilterChange("错误")} />
        <FilterButton label="警告" count={issueCounts.warnings} active={issueFilter === "警告"} onClick={() => onFilterChange("警告")} />
        <FilterButton label="提示" count={issueCounts.hints} active={issueFilter === "提示"} onClick={() => onFilterChange("提示")} />
        <FilterButton label="未处理" count={issueCounts.open} active={issueFilter === "open"} onClick={() => onFilterChange("open")} />
      </div>
      <div className="issue-list">
        {filteredIssues.length === 0 ? (
          <div className="empty-state">当前筛选下没有问题。</div>
        ) : (
          filteredIssues.map((issue) => {
            const status = getIssueStatus(issueStatuses, issue, issueStatusScope);
            return (
              <article key={issue.id} className={activeIssueLine === issue.line ? `issue-item active ${status}` : `issue-item ${status}`}>
                <header>
                  <strong>{issue.category}</strong>
                  <span>{issue.level}</span>
                </header>
                <p>{issue.message}</p>
                <small>
                  {episodeId} / 第 {issue.line} 行：{issue.excerpt}
                </small>
                <footer>
                  <button onClick={() => onSelectIssueLine(issue.line)}>
                    <LocateFixed size={14} />
                    定位
                  </button>
                  <button onClick={() => onIssueStatusChange(issue, status === "ignored" ? "open" : "ignored")}>
                    {status === "ignored" ? "取消忽略" : "忽略"}
                  </button>
                  <button onClick={() => onIssueStatusChange(issue, status === "resolved" ? "open" : "resolved")}>
                    {status === "resolved" ? "重开" : "已处理"}
                  </button>
                </footer>
              </article>
            );
          })
        )}
      </div>
      <div className="script-issue-actions">
        <button onClick={onExportIssues}>
          <Download size={15} />
          导出问题
        </button>
        <button onClick={onResetStatuses}>重置状态</button>
      </div>
    </section>
  );
}

function RuleQuickList({ rules, onChange }: { rules: EpisodeSplitRule[]; onChange: (rules: EpisodeSplitRule[]) => void }) {
  return (
    <div className="split-rule-quick-list">
      {rules.map((rule, index) => (
        <label key={rule.id}>
          <input
            type="checkbox"
            checked={rule.enabled}
            onChange={(event) => onChange(rules.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item))}
          />
          <strong>{index + 1}</strong>
          <span>{rule.name}</span>
        </label>
      ))}
    </div>
  );
}

function RulePanel({ title, summary, children }: { title: string; summary: string; children: ReactNode }) {
  return (
    <section className="rule-config-panel">
      <div className="panel-title">
        <Settings2 size={18} />
        <span>{title}</span>
        <strong>{summary}</strong>
      </div>
      {children}
    </section>
  );
}

function RuleIndex({ index, enabled }: { index: number; enabled: boolean }) {
  return <span className={enabled ? "rule-index enabled" : "rule-index"}>{index}</span>;
}

function FilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {label} {count}
    </button>
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

function countIssueLevels(issues: ScriptIssue[]) {
  return {
    errors: issues.filter((issue) => issue.level === "错误").length,
    warnings: issues.filter((issue) => issue.level === "警告").length,
    hints: issues.filter((issue) => issue.level === "提示").length,
  };
}

function issueKey(issue: ScriptIssue, scope = "") {
  return `${scope}:${issue.ruleId}:${issue.line}:${issue.excerpt}`;
}

function getIssueStatus(statuses: IssueStatusMap, issue: ScriptIssue, scope = ""): IssueStatus {
  return statuses[issueKey(issue, scope)] ?? "open";
}

function loadStage(projectId: string): ScriptStage {
  return window.localStorage.getItem(splitStageKeyPrefix + projectId) === "split" ? "split" : "quality";
}

function loadIssueStatuses(projectId: string): IssueStatusMap {
  const raw = window.localStorage.getItem(issueStatusKeyPrefix + projectId);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
