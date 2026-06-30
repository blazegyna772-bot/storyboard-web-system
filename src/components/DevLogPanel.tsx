import { useState } from "react";
import { Terminal } from "lucide-react";

export type DevLogLevel = "info" | "success" | "warning" | "error";

export interface DevLogEntry {
  id: string;
  time: string;
  source: string;
  level: DevLogLevel;
  message: string;
  detail?: string;
}

export function createDevLog(source: string, level: DevLogLevel, message: string, detail?: string): DevLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toLocaleTimeString("zh-CN", { hour12: false }),
    source,
    level,
    message,
    detail,
  };
}

export function DevLogPanel({
  logs,
  onToggle,
  onClear,
}: {
  logs: DevLogEntry[];
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
    <section className="dev-feedback" aria-label="执行反馈">
      <div className="feedback-bar">
        <div className="feedback-primary">
          <Terminal size={16} />
          <strong>{latest?.message ?? "暂无执行记录"}</strong>
          {latest?.detail && <span>{latest.detail}</span>}
        </div>
        <div className="feedback-actions">
          {issueCount > 0 && <span className="issue-pill">{issueCount} 条需看</span>}
          <button onClick={onToggle}>收起</button>
        </div>
      </div>
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
    </section>
  );
}
