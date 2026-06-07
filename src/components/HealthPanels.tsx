import { AlertTriangle, CheckCircle2, RefreshCcw, Terminal } from "lucide-react";
import { backendApiBaseUrl } from "../lib/backendApi";
import type { BackendHealth, ImageProviderCatalog } from "../lib/backendStatusApi";
import type { ImageGenerationConfig, LlmExecutorConfig } from "../lib/providerConfig";

export function RunHealthPanel({
  config,
  backendHealth,
  onRefresh,
}: {
  config: LlmExecutorConfig;
  backendHealth: BackendHealth | null;
  onRefresh: () => void;
}) {
  return (
    <article className="panel run-health-panel">
      <div className="panel-title">
        <Terminal size={18} />
        <span>运行状态</span>
        <button onClick={onRefresh}>
          <RefreshCcw size={15} />
          刷新
        </button>
      </div>
      <div className="run-health-list">
        <div className={backendHealth?.status === "ok" ? "health-item done" : "health-item warning"}>
          {backendHealth?.status === "ok" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{backendHealth?.status === "ok" ? "后端服务在线" : "后端状态未知"}</strong>
            <span>{backendApiBaseUrl}</span>
          </div>
        </div>
        <div className={config.hasApiKey ? "health-item done" : "health-item warning"}>
          {config.hasApiKey ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{config.hasApiKey ? "真实接口已配置" : "缺少 API Key"}</strong>
            <span>{config.baseUrl} / {config.model}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ImageApiHealthPanel({
  config,
  providers,
  backendHasApiKey,
  onRefresh,
}: {
  config: ImageGenerationConfig;
  providers: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onRefresh: () => void;
}) {
  const provider = providers.find((item) => item.id === config.provider);
  return (
    <article className="panel run-health-panel">
      <div className="panel-title">
        <Terminal size={18} />
        <span>生图接口状态</span>
        <button onClick={onRefresh}>
          <RefreshCcw size={15} />
          刷新
        </button>
      </div>
      <div className="run-health-list">
        <div className={provider ? "health-item done" : "health-item warning"}>
          {provider ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{provider ? provider.name : "未读取到商家配置"}</strong>
            <span>{provider?.description ?? "检查 providerpacks/image 配置。"}</span>
          </div>
        </div>
        <div className={backendHasApiKey ? "health-item done" : "health-item warning"}>
          {backendHasApiKey ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <div>
            <strong>{backendHasApiKey ? "API Key 已配置" : "缺少 API Key"}</strong>
            <span>{config.baseUrl || "未配置默认 Base URL"}</span>
          </div>
        </div>
      </div>
    </article>
  );
}
