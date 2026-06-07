import { useEffect, useMemo, useState } from "react";
import { ClipboardList, RefreshCcw, Terminal, Trash2 } from "lucide-react";
import type { BackendImageLog, BackendImageTask, BackendLlmLog } from "../lib/backendStatusApi";
import { getBackendPromptTitle } from "../lib/promptStageCopy";

type TaskRecordItem = {
  id: string;
  logIds?: string[];
  category: "llm" | "image";
  type: string;
  model: string;
  platform: string;
  startedAt: string;
  endedAt: string;
  status: "running" | "success" | "error" | "warning" | "info";
  summary: string;
  raw: BackendLlmLog | BackendImageLog | BackendImageTask;
};

export function TaskRecordView({
  llmLogs,
  imageLogs,
  imageTasks,
  llmDetail,
  imageDetail,
  onRefresh,
  onInspectLlmLog,
  onInspectImageLog,
  onClearAll,
}: {
  llmLogs: BackendLlmLog[];
  imageLogs: BackendImageLog[];
  imageTasks: BackendImageTask[];
  llmDetail: BackendLlmLog | null;
  imageDetail: BackendImageLog | null;
  onRefresh: () => void;
  onInspectLlmLog: (logId: string) => void;
  onInspectImageLog: (logId: string) => void;
  onClearAll: () => void;
}) {
  const records = useMemo(() => buildTaskRecords(llmLogs, imageLogs, imageTasks), [llmLogs, imageLogs, imageTasks]);
  const [activeCategory, setActiveCategory] = useState<"llm" | "image">("llm");
  const [selectedId, setSelectedId] = useState("");
  const filtered = records.filter((record) => record.category === activeCategory);
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0] ?? records[0];

  useEffect(() => {
    if (selected) setSelectedId(selected.id);
  }, [activeCategory, records.length]);

  useEffect(() => {
    if (!selected) return;
    if (selected.category === "llm") onInspectLlmLog(selected.id);
    if (selected.category === "image") {
      const logId = selected.logIds?.[selected.logIds.length - 1];
      if (logId) onInspectImageLog(logId);
    }
  }, [selected?.id]);

  const detail = selected?.category === "llm" ? llmDetail : selected?.category === "image" ? imageDetail ?? selected.raw : null;
  const selectedExecutionLogs = selected?.category === "image" ? imageLogs.filter((log) => selected.logIds?.includes(log.id)) : [];

  return (
    <section className="page-stack task-record-page">
      <div className="page-header work-header">
        <div>
          <h2>任务记录</h2>
          <p>按用户触发的一次操作记录耗时任务，用来检查输入、输出、产物和失败原因。</p>
        </div>
        <div className="actions-row">
          <button onClick={onRefresh}>
            <RefreshCcw size={16} />
            刷新
          </button>
          <button onClick={onClearAll}>
            <Trash2 size={16} />
            清空
          </button>
        </div>
      </div>
      <section className="task-record-layout">
        <article className="panel task-record-list-panel">
          <div className="panel-title">
            <Terminal size={18} />
            <span>任务记录列表</span>
            <strong>共 {records.length} 条任务记录（LLM: {records.filter((item) => item.category === "llm").length}，图片: {records.filter((item) => item.category === "image").length}）</strong>
          </div>
          <div className="task-record-tabs">
            <button className={activeCategory === "llm" ? "active" : ""} onClick={() => setActiveCategory("llm")}>
              语言模型
            </button>
            <button className={activeCategory === "image" ? "active" : ""} onClick={() => setActiveCategory("image")}>
              图片生成
            </button>
          </div>
          <div className="task-record-table">
            <div className="task-record-head">
              <span>任务类型</span>
              <span>模型/引擎</span>
              <span>平台</span>
              <span>开始时间</span>
              <span>结束时间</span>
              <span>状态</span>
            </div>
            {filtered.map((record) => (
              <button key={record.id} className={`task-record-row ${selected?.id === record.id ? "active" : ""}`} onClick={() => setSelectedId(record.id)}>
                <span>{record.type}</span>
                <span>{record.model || "-"}</span>
                <span>{record.platform || "-"}</span>
                <span>{formatTaskTime(record.startedAt)}</span>
                <span>{formatTaskTime(record.endedAt)}</span>
                <span className={`task-status ${record.status}`}>{taskStatusLabel(record.status)}</span>
              </button>
            ))}
            {!filtered.length && <div className="empty-state">暂无此类任务记录。</div>}
          </div>
        </article>
        <article className="panel task-record-detail-panel">
          <div className="panel-title">
            <ClipboardList size={18} />
            <span>任务详情</span>
            <strong>{selected?.id ?? "未选择"}</strong>
          </div>
          {selected ? <TaskRecordDetail record={selected} detail={detail} executionLogs={selectedExecutionLogs} /> : <div className="empty-state">选择左侧任务查看详情。</div>}
        </article>
      </section>
    </section>
  );
}

function TaskRecordDetail({ record, detail, executionLogs }: { record: TaskRecordItem; detail: BackendLlmLog | BackendImageLog | BackendImageTask | null; executionLogs: BackendImageLog[] }) {
  const inputText = record.category === "llm"
    ? formatLlmInput(detail as BackendLlmLog | null)
    : formatImageInput(record.raw, detail);
  const outputText = record.category === "llm"
    ? formatLlmOutput(detail as BackendLlmLog | null)
    : formatImageOutput(record.raw, detail);
  const executionText = formatExecutionLog(record, detail, executionLogs);
  return (
    <div className="task-detail-body">
      <div className="task-detail-meta">
        <span>任务类型：{record.type}</span>
        <span>模型：{record.model || "-"}</span>
        <span>平台：{record.platform || "-"}</span>
        <span>状态：{taskStatusLabel(record.status)}</span>
      </div>
      <TaskDetailBlock title={record.category === "image" ? "正向提示词" : "输入内容"} tone="blue" text={inputText} />
      <TaskDetailBlock title="输出结果" tone="green" text={outputText} />
      <TaskDetailBlock title="执行日志" tone="yellow" text={executionText} />
    </div>
  );
}

function TaskDetailBlock({ title, tone, text }: { title: string; tone: "blue" | "green" | "yellow"; text: string }) {
  return (
    <section className={`task-detail-block ${tone}`}>
      <h3>{title}</h3>
      <pre>{text || "暂无记录。"}</pre>
    </section>
  );
}

function buildTaskRecords(llmLogs: BackendLlmLog[], imageLogs: BackendImageLog[], imageTasks: BackendImageTask[]): TaskRecordItem[] {
  const llmRecords = llmLogs.map((log) => ({
    id: log.id,
    category: "llm" as const,
    type: log.label || getBackendPromptTitle(log.stageId || "") || "LLM 任务",
    model: log.model || "",
    platform: log.baseUrl || "custom",
    startedAt: log.time,
    endedAt: log.time,
    status: log.level,
    summary: log.message,
    raw: log,
  }));
  const imageRecords = buildImageTaskRecords(imageLogs, imageTasks);
  return [...llmRecords, ...imageRecords].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
}

function buildImageTaskRecords(imageLogs: BackendImageLog[], imageTasks: BackendImageTask[]): TaskRecordItem[] {
  const groups = new Map<string, BackendImageLog[]>();
  for (const log of imageLogs) {
    const key = log.taskId || inferImageTaskKey(log);
    groups.set(key, [log, ...(groups.get(key) ?? [])]);
  }
  if (imageTasks.length) {
    return imageTasks.map((task) => {
      const logs = groups.get(task.taskId) ?? [];
      return {
        id: task.taskId,
        logIds: logs.map((log) => log.id),
        category: "image" as const,
        type: task.type || "生图任务",
        model: task.model || "",
        platform: task.provider || task.baseUrl || "",
        startedAt: task.startedAt,
        endedAt: task.endedAt || task.updatedAt || "",
        status: task.status,
        summary: task.message || task.status,
        raw: task,
      };
    });
  }
  return Array.from(groups.entries()).map(([key, logs]) => {
    const ordered = logs.slice().sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    const finalLog = ordered.find((log) => log.level === "success" || log.level === "error") ?? ordered[ordered.length - 1];
    const firstLog = ordered[0] ?? finalLog;
    return {
      id: key,
      logIds: ordered.map((log) => log.id),
      category: "image" as const,
      type: "生图任务",
      model: finalLog.model || firstLog.model || "",
      platform: finalLog.provider || firstLog.provider || finalLog.baseUrl || firstLog.baseUrl || "",
      startedAt: firstLog.time,
      endedAt: finalLog.time,
      status: finalLog.level,
      summary: finalLog.message,
      raw: finalLog,
    };
  });
}

function inferImageTaskKey(log: BackendImageLog) {
  const date = new Date(log.time);
  const bucket = Number.isNaN(date.getTime()) ? log.time : Math.floor(date.getTime() / 120000).toString();
  return `image-${log.provider || "provider"}-${log.model || "model"}-${bucket}`;
}

function formatTaskTime(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function taskStatusLabel(status: TaskRecordItem["status"]) {
  if (status === "running") return "运行中";
  if (status === "success") return "成功";
  if (status === "error") return "失败";
  if (status === "warning") return "警告";
  return "记录";
}

function formatLlmInput(log: BackendLlmLog | null) {
  if (!log) return "";
  if (log.messages?.length) return log.messages.map((message) => `${message.role}:\n${message.content}`).join("\n\n");
  if (log.messagesPreview?.length) return log.messagesPreview.map((message) => `${message.role}（${message.chars} 字）:\n${message.preview}`).join("\n\n");
  return [log.label, log.detail].filter(Boolean).join("\n");
}

function formatLlmOutput(log: BackendLlmLog | null) {
  if (!log) return "";
  return log.responseText || log.responsePreview || log.message || "";
}

function formatImageInput(raw: BackendLlmLog | BackendImageLog | BackendImageTask | null, detail: BackendLlmLog | BackendImageLog | BackendImageTask | null) {
  const source = (raw || detail) as Partial<BackendImageLog & BackendImageTask> | null;
  if (!source) return "";
  return source.promptPreview || (source.payload ? JSON.stringify(source.payload, null, 2) : source.detail || "");
}

function formatImageOutput(raw: BackendLlmLog | BackendImageLog | BackendImageTask | null, detail: BackendLlmLog | BackendImageLog | BackendImageTask | null) {
  const source = (raw || detail) as Partial<BackendImageLog & BackendImageTask> | null;
  if (!source) return "";
  const selected = source.selected;
  const candidates = source.candidates ?? [];
  return [
    source.imageCount !== undefined ? `图片数量：${source.imageCount}` : "",
    selected?.path ? `真源文件：${selected.path}` : "",
    selected?.url ? `真源地址：${selected.url}` : "",
    candidates.length ? `候选图片：\n${candidates.map((item, index) => `${index + 1}. ${item.path || item.url || item.label || item.id}`).join("\n")}` : "",
    source.url ? `请求地址：${source.url}` : "",
    source.statusCode ? `HTTP ${source.statusCode}` : "",
    source.detail || "",
  ].filter(Boolean).join("\n");
}

function formatExecutionLog(record: TaskRecordItem, detail: BackendLlmLog | BackendImageLog | BackendImageTask | null, executionLogs: BackendImageLog[] = []) {
  if (executionLogs.length) {
    return executionLogs
      .slice()
      .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
      .map((log) => `[${formatTaskTime(log.time)}] ${taskStatusLabel(log.level)} ${log.message}${log.detail ? `\n${log.detail}` : ""}`)
      .join("\n");
  }
  const lines = [
    `[${formatTaskTime(record.startedAt)}] ${record.summary}`,
    detail?.baseUrl ? `Base URL: ${detail.baseUrl}` : "",
    detail?.model ? `Model: ${detail.model}` : "",
    "provider" in (detail || {}) && (detail as BackendImageLog).provider ? `Provider: ${(detail as BackendImageLog).provider}` : "",
    "protocol" in (detail || {}) && (detail as BackendImageLog).protocol ? `Protocol: ${(detail as BackendImageLog).protocol}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}
