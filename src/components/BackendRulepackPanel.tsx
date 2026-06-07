import { Eye, Package, RefreshCcw, Terminal, Trash2, X } from "lucide-react";
import { backendApiBaseUrl } from "../lib/backendApi";
import type { BackendLlmLog, BackendRulepack } from "../lib/backendStatusApi";
import { getBackendPromptDescription, getBackendPromptTitle } from "../lib/promptStageCopy";

export function BackendRulepackPanel({
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
            <strong>规则包诊断</strong>
            <span>只读扫描本地 rulepacks 目录</span>
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
            <strong>当前 Prompt 预览</strong>
            <span>{backendApiBaseUrl}</span>
          </div>
          <textarea value={promptContent || "点击左侧 Prompt 查看当前启用版本内容。编辑请到“提示词模板”。"} readOnly spellCheck={false} />
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
