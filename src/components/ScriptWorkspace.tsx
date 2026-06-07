import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Edit3, FileText, Layers3, Plus, RefreshCcw, Save, Upload, X } from "lucide-react";
import { defaultEpisodeSplitRules, replaceEpisodeSourceText, type EpisodeSplitDraft } from "../lib/episodeSplit";
import { buildScriptQualityReport, defaultScriptQualityRules, type ScriptQualityRule } from "../lib/scriptQuality";
import type { EpisodeResult, ScriptAnalysis } from "../lib/storyboard";

export function ScriptRuleConfigDialog({
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

export function ScriptWorkspace({
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

export function EpisodeSplitPreviewDialog({
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

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value.toLocaleString()}</strong>
    </div>
  );
}
