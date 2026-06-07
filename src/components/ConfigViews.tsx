import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, Edit3, Eye, Image, Package, Play, Plus, RefreshCcw, Save, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react";
import { BackendRulepackPanel } from "./BackendRulepackPanel";
import { ImageApiHealthPanel, RunHealthPanel } from "./HealthPanels";
import { getBackendPromptDescription, getBackendPromptTitle } from "../lib/promptStageCopy";
import { getBackendImageApiKey, getBackendLlmApiKey, type BackendHealth, type BackendSettings, type BackendLlmLog, type BackendPromptLibrary, type BackendPromptTemplateGroup, type BackendPromptVersion, type BackendRulepack, type ImageProviderCatalog } from "../lib/backendStatusApi";
import { normalizeImageConfig } from "../lib/imageConfig";
import { normalizeLlmConfig } from "../lib/llmConfig";
import type { ImageGenerationConfig, LlmExecutorConfig } from "../lib/providerConfig";

export function ToolDrawer({
  imageConfig,
  imageProviders,
  backendHasApiKey,
  onClose,
  onRefresh,
  onImageConfigChange,
}: {
  imageConfig: ImageGenerationConfig;
  imageProviders: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onImageConfigChange: (config: ImageGenerationConfig) => void;
}) {
  return (
    <div className="tool-overlay" role="dialog" aria-modal="true" aria-label="全局工具">
      <aside className="tool-drawer">
        <div className="drawer-header">
          <strong>工具</strong>
          <button onClick={onClose} aria-label="关闭工具面板">
            <X size={17} />
          </button>
        </div>
        <ImageConfigPanel
          config={imageConfig}
          providers={imageProviders}
          backendHasApiKey={backendHasApiKey}
          onRefresh={onRefresh}
          onChange={onImageConfigChange}
        />
      </aside>
    </div>
  );
}

function ImageConfigPanel({
  config,
  providers,
  backendHasApiKey,
  onRefresh,
  onChange,
}: {
  config: ImageGenerationConfig;
  providers: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onRefresh: () => void;
  onChange: (config: ImageGenerationConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  useEffect(() => {
    setDraft(config);
  }, [config]);

  const activeProvider = providers.find((provider) => provider.id === draft.provider) ?? providers[0];
  const activeModel = activeProvider?.models.find((model) => model.id === draft.model) ?? activeProvider?.models[0];
  const canChooseRuntimeBaseUrl = (activeProvider?.baseUrls.length ?? 0) > 1;

  function withProviderDefaults(provider: ImageProviderCatalog, current: ImageGenerationConfig): ImageGenerationConfig {
    const model = provider.models.find((item) => item.id === current.model) ?? provider.models.find((item) => item.id === provider.defaultModel) ?? provider.models[0];
    return normalizeImageConfig({
      ...current,
      provider: provider.id,
      baseUrl: current.baseUrl && provider.baseUrls.some((item) => item.url === current.baseUrl) ? current.baseUrl : provider.baseUrls[0]?.url ?? current.baseUrl,
      runtimeBaseUrl: provider.baseUrls.length > 1 ? current.runtimeBaseUrl || provider.baseUrls[0]?.url || "" : "",
      model: model?.id ?? current.model,
      aspectRatio: model?.defaultAspectRatio ?? current.aspectRatio,
      imageSize: model?.defaultImageSize ?? "",
      size: model?.defaultSize ?? current.size,
    });
  }

  function withModelDefaults(modelId: string, current: ImageGenerationConfig): ImageGenerationConfig {
    const model = activeProvider?.models.find((item) => item.id === modelId);
    if (!model) return normalizeImageConfig({ ...current, model: modelId });
    return normalizeImageConfig({
      ...current,
      model: model.id,
      aspectRatio: model.defaultAspectRatio,
      imageSize: model.defaultImageSize,
      size: model.defaultSize,
    });
  }

  function update(next: Partial<ImageGenerationConfig>) {
    setDraft((current) => {
      if (next.provider) {
        const provider = providers.find((item) => item.id === next.provider);
        return provider ? withProviderDefaults(provider, { ...current, ...next }) : normalizeImageConfig({ ...current, ...next });
      }
      if (next.model) return withModelDefaults(next.model, { ...current, ...next });
      const merged = normalizeImageConfig({ ...current, ...next });
      const model = activeProvider?.models.find((item) => item.id === merged.model);
      if (next.aspectRatio && model?.sizeMap) {
        return normalizeImageConfig({ ...merged, size: model.sizeMap[next.aspectRatio] ?? merged.size });
      }
      return merged;
    });
  }

  if (!providers.length) {
    return (
      <section className="panel image-config-panel">
        <div className="panel-title">
          <Image size={18} />
          <span>生图配置</span>
          <strong>未加载</strong>
        </div>
        <div className="empty-state">未读取到后端 provider 配置。确认后端已启动后刷新。</div>
        <button className="primary-button" onClick={onRefresh}>
          <RefreshCcw size={16} />
          刷新配置
        </button>
      </section>
    );
  }

  return (
    <section className="panel image-config-panel">
      <div className="panel-title">
        <Image size={18} />
        <span>生图配置</span>
        <strong>{backendHasApiKey ? "Key 已配置" : "缺少 Key"}</strong>
      </div>
      <div className="image-provider-summary">
        <strong>{activeProvider?.name ?? draft.provider}</strong>
        <span>{activeProvider?.description ?? "provider 配置来自后端"}</span>
      </div>
      <div className="image-config-grid provider-config-grid">
        <label>
          商家
          <select value={draft.provider} onChange={(event) => update({ provider: event.target.value })}>
            {providers.map((provider) => (
              <option value={provider.id} key={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          模型
          <select value={draft.model} onChange={(event) => update({ model: event.target.value })}>
            {activeProvider?.models.map((model) => (
              <option value={model.id} key={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </label>
        {canChooseRuntimeBaseUrl && (
          <label>
            线路
            <select value={draft.runtimeBaseUrl || draft.baseUrl || activeProvider?.baseUrls[0]?.url || ""} onChange={(event) => update({ runtimeBaseUrl: event.target.value })}>
              {activeProvider?.baseUrls.map((item) => (
                <option value={item.url} key={item.url}>
                  {item.label} / {item.url}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          画幅
          <select value={draft.aspectRatio} onChange={(event) => update({ aspectRatio: event.target.value })}>
            {(activeModel?.aspectRatios ?? [draft.aspectRatio]).map((ratio) => (
              <option value={ratio} key={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>
        {(activeModel?.imageSizes.length ?? 0) > 0 && (
          <label>
            分辨率档位
            <select value={draft.imageSize} onChange={(event) => update({ imageSize: event.target.value })}>
              {activeModel?.imageSizes.map((size) => (
                <option value={size} key={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          请求超时
          <input type="number" min={30} max={900} value={draft.requestTimeout} onChange={(event) => update({ requestTimeout: Number(event.target.value) })} />
        </label>
        <label>
          下载超时
          <input type="number" min={30} max={900} value={draft.downloadTimeout} onChange={(event) => update({ downloadTimeout: Number(event.target.value) })} />
        </label>
      </div>
      <div className="provider-model-note">
        <span>协议：{activeModel?.protocol ?? "未知"}</span>
        <span>输出：{draft.size || activeModel?.defaultSize || "随模型默认"}</span>
        <span>{activeModel?.supportsReferenceImages ? "支持参考图" : "不支持参考图"}</span>
        <span>{activeModel?.supportsMultipleImages ? "可返回多图" : "单图模式"}</span>
      </div>
      <div className="actions-row">
        <button onClick={onRefresh}>
          <RefreshCcw size={16} />
          重新读取
        </button>
        <button className="primary-button" onClick={() => onChange(draft)}>
          <Save size={16} />
          保存配置
        </button>
      </div>
    </section>
  );
}

export function PipelineConfigView({
  llmConfig,
  backendHealth,
  backendRulepacks,
  backendPromptLibrary,
  backendLlmLogs,
  backendLlmLogDetail,
  backendPromptContent,
  backendLlmHasApiKey,
  generalConfig,
  imageConfig,
  imageProviders,
  backendImageHasApiKey,
  onRefreshBackendStatus,
  onInspectBackendPrompt,
  onClearBackendLogs,
  onInspectBackendLlmLog,
  onCloseBackendLlmLog,
  onGeneralConfigChange,
  onLlmConfigChange,
  onImageConfigChange,
  onCreatePromptVersion,
  onUpdatePromptVersion,
  onDeletePromptVersion,
  onActivatePromptVersion,
}: {
  llmConfig: LlmExecutorConfig;
  backendHealth: BackendHealth | null;
  backendRulepacks: BackendRulepack[];
  backendPromptLibrary: BackendPromptLibrary;
  backendLlmLogs: BackendLlmLog[];
  backendLlmLogDetail: BackendLlmLog | null;
  backendPromptContent: string;
  backendLlmHasApiKey: boolean;
  generalConfig: BackendSettings["general"];
  imageConfig: ImageGenerationConfig;
  imageProviders: ImageProviderCatalog[];
  backendImageHasApiKey: boolean;
  onRefreshBackendStatus: () => void;
  onInspectBackendPrompt: (promptId: string) => void;
  onClearBackendLogs: () => void;
  onInspectBackendLlmLog: (logId: string) => void;
  onCloseBackendLlmLog: () => void;
  onGeneralConfigChange: (config: BackendSettings["general"]) => void;
  onLlmConfigChange: (config: LlmExecutorConfig) => void;
  onImageConfigChange: (config: ImageGenerationConfig) => void;
  onCreatePromptVersion: (input: { promptId: string; sourceVersionId?: string; name?: string; description?: string; content?: string }) => void;
  onUpdatePromptVersion: (versionId: string, input: { name?: string; description?: string; content?: string }) => void;
  onDeletePromptVersion: (versionId: string) => void;
  onActivatePromptVersion: (promptId: string, versionId: string) => void;
}) {
  const [activeConfigTab, setActiveConfigTab] = useState<"basic" | "llm" | "image" | "rules" | "prompts">("basic");

  return (
    <section className="page-stack">
      <div className="page-header work-header">
        <div>
          <h2>模型与流程设置</h2>
          <p>这里只放运行前必须配置的内容。管线细节放到开发诊断里，不打扰日常操作。</p>
        </div>
      </div>

      <div className="config-tab-bar" role="tablist" aria-label="流程配置分类">
        <button className={activeConfigTab === "basic" ? "active" : ""} onClick={() => setActiveConfigTab("basic")} role="tab">
          <ClipboardList size={17} />
          基本配置
        </button>
        <button className={activeConfigTab === "llm" ? "active" : ""} onClick={() => setActiveConfigTab("llm")} role="tab">
          <Sparkles size={17} />
          文本 API
        </button>
        <button className={activeConfigTab === "image" ? "active" : ""} onClick={() => setActiveConfigTab("image")} role="tab">
          <Image size={17} />
          生图 API
        </button>
        <button className={activeConfigTab === "rules" ? "active" : ""} onClick={() => setActiveConfigTab("rules")} role="tab">
          <Package size={17} />
          后端规则
        </button>
        <button className={activeConfigTab === "prompts" ? "active" : ""} onClick={() => setActiveConfigTab("prompts")} role="tab">
          <Edit3 size={17} />
          提示词模板
        </button>
      </div>

      {activeConfigTab === "basic" && (
        <section className="settings-layout" role="tabpanel">
          <BasicConfigForm config={generalConfig} onChange={onGeneralConfigChange} />
        </section>
      )}

      {activeConfigTab === "llm" && (
        <section className="settings-layout" role="tabpanel">
          <LlmConfigForm config={llmConfig} backendHasApiKey={backendLlmHasApiKey} onChange={onLlmConfigChange} />
          <RunHealthPanel config={llmConfig} backendHealth={backendHealth} onRefresh={onRefreshBackendStatus} />
        </section>
      )}

      {activeConfigTab === "image" && (
        <section className="settings-layout" role="tabpanel">
          <ImageProviderCredentialForm
            config={imageConfig}
            providers={imageProviders}
            backendHasApiKey={backendImageHasApiKey}
            onChange={onImageConfigChange}
          />
          <ImageApiHealthPanel config={imageConfig} providers={imageProviders} backendHasApiKey={backendImageHasApiKey} onRefresh={onRefreshBackendStatus} />
        </section>
      )}

      {activeConfigTab === "rules" && (
        <BackendRulepackPanel
          rulepacks={backendRulepacks}
          promptContent={backendPromptContent}
          logs={backendLlmLogs}
          logDetail={backendLlmLogDetail}
          onInspectPrompt={onInspectBackendPrompt}
          onRefresh={onRefreshBackendStatus}
          onClearLogs={onClearBackendLogs}
          onInspectLog={onInspectBackendLlmLog}
          onCloseLogDetail={onCloseBackendLlmLog}
        />
      )}

      {activeConfigTab === "prompts" && (
        <BackendPromptTemplatePanel
          library={backendPromptLibrary}
          onCreateVersion={onCreatePromptVersion}
          onUpdateVersion={onUpdatePromptVersion}
          onDeleteVersion={onDeletePromptVersion}
          onActivateVersion={onActivatePromptVersion}
        />
      )}

    </section>
  );
}

function BackendPromptTemplatePanel({
  library,
  onCreateVersion,
  onUpdateVersion,
  onDeleteVersion,
  onActivateVersion,
}: {
  library: BackendPromptLibrary;
  onCreateVersion: (input: { promptId: string; sourceVersionId?: string; name?: string; description?: string; content?: string }) => void;
  onUpdateVersion: (versionId: string, input: { name?: string; description?: string; content?: string }) => void;
  onDeleteVersion: (versionId: string) => void;
  onActivateVersion: (promptId: string, versionId: string) => void;
}) {
  const categories = useMemo(() => buildPromptTemplateCategories(library.groups), [library.groups]);
  const [activeCategoryId, setActiveCategoryId] = useState("story");
  const activeCategory = categories.find((category) => category.id === activeCategoryId) ?? categories[0];
  const visibleGroups = activeCategory?.groups ?? [];
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const selectedGroup = visibleGroups.find((group) => group.prompt.id === selectedPromptId) ?? visibleGroups[0] ?? library.groups[0];
  const versions = selectedGroup ? [selectedGroup.official, ...selectedGroup.userVersions] : [];
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const selectedVersion = versions.find((version) => version.id === selectedVersionId)
    ?? versions.find((version) => version.id === selectedGroup?.activeVersionId)
    ?? versions[0];
  const [draft, setDraft] = useState<BackendPromptVersion | null>(selectedVersion ? { ...selectedVersion } : null);

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategoryId)) {
      setActiveCategoryId(categories[0]?.id ?? "story");
    }
  }, [categories, activeCategoryId]);

  useEffect(() => {
    if (!visibleGroups.length) {
      setSelectedPromptId("");
      return;
    }
    if (!visibleGroups.some((group) => group.prompt.id === selectedPromptId)) {
      setSelectedPromptId(visibleGroups[0].prompt.id);
    }
  }, [visibleGroups, selectedPromptId]);

  useEffect(() => {
    if (!selectedGroup) {
      setSelectedVersionId("");
      return;
    }
    if (!versions.some((version) => version.id === selectedVersionId)) {
      setSelectedVersionId(selectedGroup.activeVersionId || selectedGroup.official.id);
    }
  }, [selectedGroup?.prompt.id, selectedGroup?.activeVersionId, versions.length, selectedVersionId]);

  useEffect(() => {
    setDraft(selectedVersion ? { ...selectedVersion } : null);
  }, [selectedVersion?.id]);

  function createUserVersion() {
    if (!selectedGroup || !selectedVersion) return;
    onCreateVersion({
      promptId: selectedGroup.prompt.id,
      sourceVersionId: selectedVersion.id,
      name: `${selectedVersion.name.replace(/^官方 - /, "")} 用户版`,
      description: selectedVersion.description,
      content: selectedVersion.content,
    });
  }

  function saveDraft() {
    if (!draft || draft.readonly) return;
    onUpdateVersion(draft.id, {
      name: draft.name,
      description: draft.description,
      content: draft.content,
    });
  }

  function deleteDraft() {
    if (!draft || draft.readonly) return;
    if (!window.confirm(`删除提示词版本“${draft.name}”？`)) return;
    onDeleteVersion(draft.id);
  }

  const activeVersion = versions.find((version) => version.id === selectedGroup?.activeVersionId);

  return (
    <article className="panel prompt-template-panel">
      <div className="panel-title">
        <Edit3 size={18} />
        <span>提示词模板</span>
        <strong>{library.groups.length} 个模板 / {library.groups.reduce((count, group) => count + 1 + group.userVersions.length, 0)} 个版本</strong>
      </div>
      <div className="prompt-template-layout">
        <aside className="prompt-template-sidebar">
          <div className="compact-section-title">
            <strong>模板分类</strong>
            <span>按执行用途归类</span>
          </div>
          {categories.map((category) => (
            <button key={category.id} className={category.id === activeCategoryId ? "active" : ""} onClick={() => setActiveCategoryId(category.id)}>
              <strong>{category.title}</strong>
              <span>{category.groups.length} 个模板</span>
            </button>
          ))}
        </aside>

        <section className="prompt-template-list">
          <div className="compact-section-title">
            <strong>{activeCategory?.title ?? "模板"}</strong>
            <span>选择要配置的 Prompt</span>
          </div>
          {visibleGroups.map((group) => {
            const current = [group.official, ...group.userVersions].find((version) => version.id === group.activeVersionId) ?? group.official;
            return (
              <button
                key={group.prompt.id}
                className={group.prompt.id === selectedGroup?.prompt.id ? "active" : ""}
                onClick={() => setSelectedPromptId(group.prompt.id)}
              >
                <strong>{getBackendPromptTitle(group.prompt.stage)}</strong>
                <span>{getBackendPromptDescription(group.prompt.stage)}</span>
                <small>当前：{current.name}</small>
                <small>{group.prompt.stage} / {group.prompt.name}.md</small>
              </button>
            );
          })}
          {!visibleGroups.length && <div className="empty-state">当前分类暂无模板。</div>}
        </section>

        <section className="prompt-template-editor">
          {selectedGroup && draft ? (
            <>
              <div className="prompt-editor-top">
                <div>
                  <strong>{getBackendPromptTitle(selectedGroup.prompt.stage)}</strong>
                  <p>{getBackendPromptDescription(selectedGroup.prompt.stage)}</p>
                  <small>{selectedGroup.prompt.id}</small>
                </div>
                <label>
                  版本
                  <select value={selectedVersion?.id ?? ""} onChange={(event) => setSelectedVersionId(event.target.value)}>
                    {versions.map((version) => (
                      <option key={version.id} value={version.id}>
                        {formatPromptVersionLabel(version)}{version.id === selectedGroup.activeVersionId ? "（当前）" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="prompt-version-toolbar">
                <span className={`prompt-version-badge ${draft.readonly ? "official" : "user"}`}>{draft.readonly ? "官方只读" : "用户版本"}</span>
                <span>当前启用：{activeVersion?.name ?? "官方版本"}</span>
                <button onClick={createUserVersion}>
                  <Plus size={16} />
                  新建用户版本
                </button>
                <button onClick={() => onActivateVersion(selectedGroup.prompt.id, draft.id)} disabled={draft.id === selectedGroup.activeVersionId}>
                  <CheckCircle2 size={16} />
                  设为当前
                </button>
              </div>

              <div className="prompt-field-grid">
                <label>
                  版本名称
                  <input value={draft.name} readOnly={draft.readonly} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                </label>
                <label>
                  说明
                  <input value={draft.description} readOnly={draft.readonly} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
                </label>
              </div>

              <div className="prompt-variable-row">
                <span>变量</span>
                {(draft.variables.length ? draft.variables : selectedGroup.prompt.variables).map((variable) => (
                  <code key={variable}>{`{{${variable}}}`}</code>
                ))}
                {!draft.variables.length && !selectedGroup.prompt.variables.length && <small>无变量</small>}
              </div>

              <label className="prompt-content-editor">
                Prompt 内容
                <textarea
                  value={draft.content}
                  readOnly={draft.readonly}
                  onChange={(event) => setDraft({ ...draft, content: event.target.value })}
                  spellCheck={false}
                />
              </label>

              <div className="config-actions">
                <button className="primary-button" onClick={saveDraft} disabled={draft.readonly}>
                  <Save size={16} />
                  保存版本
                </button>
                <button onClick={deleteDraft} disabled={draft.readonly}>
                  <Trash2 size={16} />
                  删除版本
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">后端还没有可配置的提示词模板。</div>
          )}
        </section>
      </div>
    </article>
  );
}

function buildPromptTemplateCategories(groups: BackendPromptTemplateGroup[]) {
  const categoryDefs = [
    { id: "story", title: "分镜工作流", match: (stage: string) => stage.startsWith("story_workflow_") },
    { id: "asset", title: "资产提取", match: (stage: string) => stage.startsWith("asset_extract_") },
    { id: "script", title: "剧本校检", match: (stage: string) => stage === "script_check" || stage === "script_split" },
    { id: "other", title: "其他规则", match: (_stage: string) => true },
  ];
  const used = new Set<string>();
  return categoryDefs.map((category) => {
    const matched = groups.filter((group) => !used.has(group.prompt.id) && category.match(group.prompt.stage));
    matched.forEach((group) => used.add(group.prompt.id));
    return { id: category.id, title: category.title, groups: matched };
  }).filter((category) => category.groups.length > 0 || category.id !== "other");
}

function formatPromptVersionLabel(version: BackendPromptVersion) {
  const sourceLabel = version.source === "official" ? "官方" : "用户";
  const name = version.source === "official" ? version.name.replace(/^官方\s*[-－]\s*/, "") : version.name;
  return `${sourceLabel} - ${name}`;
}

function ImageProviderCredentialForm({
  config,
  providers,
  backendHasApiKey,
  onChange,
}: {
  config: ImageGenerationConfig;
  providers: ImageProviderCatalog[];
  backendHasApiKey: boolean;
  onChange: (config: ImageGenerationConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState("");
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(false);

  useEffect(() => {
    setDraft({ ...config, apiKey: backendHasApiKey ? "******" : "" });
    setIsKeyVisible(false);
  }, [config, backendHasApiKey]);

  const activeProvider = providers.find((provider) => provider.id === draft.provider) ?? providers[0];

  function update(next: Partial<ImageGenerationConfig>) {
    setDraft((current) => {
      const merged = normalizeImageConfig({ ...current, ...next, hasApiKey: backendHasApiKey });
      if (next.provider) {
        const provider = providers.find((item) => item.id === next.provider);
        if (!provider) return merged;
        return normalizeImageConfig({
          ...merged,
          provider: provider.id,
          baseUrl: provider.baseUrls[0]?.url ?? merged.baseUrl,
          runtimeBaseUrl: "",
          model: provider.defaultModel,
        });
      }
      return merged;
    });
    setMessage("");
  }

  function saveConfig() {
    const apiKey = draft.apiKey === "******" ? "" : draft.apiKey;
    onChange(normalizeImageConfig({ ...draft, apiKey, hasApiKey: backendHasApiKey || Boolean(apiKey?.trim()) }));
    setMessage("配置已保存");
    if (apiKey?.trim()) setIsKeyVisible(false);
  }

  async function toggleKeyVisible() {
    if (isKeyVisible) {
      setDraft((current) => ({ ...current, apiKey: backendHasApiKey ? "******" : "" }));
      setIsKeyVisible(false);
      return;
    }
    if (!backendHasApiKey) {
      setIsKeyVisible(true);
      return;
    }
    setIsLoadingKey(true);
    setMessage("");
    try {
      const result = await getBackendImageApiKey();
      setDraft((current) => ({ ...current, apiKey: result.apiKey }));
      setIsKeyVisible(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取 Key 失败");
    } finally {
      setIsLoadingKey(false);
    }
  }

  if (!providers.length) {
    return (
      <article className="panel config-editor-panel">
        <div className="panel-title">
          <Image size={18} />
          <span>生图 API 配置</span>
          <strong>未加载</strong>
        </div>
        <div className="empty-state">未读取到后端商家配置。</div>
      </article>
    );
  }

  return (
    <article className="panel config-editor-panel">
      <div className="panel-title">
        <Image size={18} />
        <span>生图 API 配置</span>
        <strong>{backendHasApiKey || draft.apiKey?.trim() ? "Key 已填" : "未填 Key"}</strong>
      </div>
      <div className="llm-config-form">
        <label>
          商家
          <select value={draft.provider} onChange={(event) => update({ provider: event.target.value })}>
            {providers.map((provider) => (
              <option value={provider.id} key={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          默认 Base URL
          <select value={draft.baseUrl ?? ""} onChange={(event) => update({ baseUrl: event.target.value })}>
            {activeProvider?.baseUrls.map((item) => (
              <option value={item.url} key={item.url}>
                {item.label} / {item.url}
              </option>
            ))}
          </select>
        </label>
        <label className="key-input-field">
          API Key
          <div>
            <input
              type={isKeyVisible ? "text" : "password"}
              value={draft.apiKey ?? ""}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder={backendHasApiKey ? "******（后端已保存）" : "填写商家 API Key"}
            />
            <button type="button" onClick={() => void toggleKeyVisible()} disabled={isLoadingKey}>
              <Eye size={15} />
            </button>
          </div>
          <small>API Key 只保存到本机后端配置，不写入 providerpack。</small>
        </label>
        <div className="actions-row">
          <button className="primary-button" onClick={saveConfig}>
            <Save size={16} />
            保存配置
          </button>
        </div>
        {message && <p className="form-message">{message}</p>}
      </div>
    </article>
  );
}

function BasicConfigForm({
  config,
  onChange,
}: {
  config: BackendSettings["general"];
  onChange: (config: BackendSettings["general"]) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setDraft(config);
  }, [config.imageConcurrency]);

  function updateImageConcurrency(value: number) {
    setDraft((current) => ({
      ...current,
      imageConcurrency: Math.max(1, Math.min(Number.isFinite(value) ? value : 1, 8)),
    }));
    setMessage("");
  }

  function saveConfig() {
    onChange(draft);
    setMessage("基本配置已保存");
  }

  return (
    <article className="panel config-editor-panel basic-config-panel">
      <div className="panel-title">
        <SlidersHorizontal size={18} />
        <span>基本配置</span>
        <strong>本机运行参数</strong>
      </div>
      <div className="llm-config-form">
        <label>
          生图并发数
          <input
            type="number"
            min={1}
            max={8}
            value={draft.imageConcurrency}
            onChange={(event) => updateImageConcurrency(Number(event.target.value))}
          />
          <small>控制后端同时执行的生图请求数量。超出的请求会等待，不丢任务。</small>
        </label>
        <div className="actions-row">
          <button className="primary-button" onClick={saveConfig}>
            <Save size={16} />
            保存配置
          </button>
        </div>
        {message && <p className="form-message">{message}</p>}
      </div>
    </article>
  );
}

function LlmConfigForm({
  config,
  backendHasApiKey,
  onChange,
}: {
  config: LlmExecutorConfig;
  backendHasApiKey: boolean;
  onChange: (config: LlmExecutorConfig) => void;
}) {
  const [draft, setDraft] = useState(config);
  const [message, setMessage] = useState("");
  const [isKeyVisible, setIsKeyVisible] = useState(false);
  const [isLoadingKey, setIsLoadingKey] = useState(false);
  useEffect(() => {
    setDraft({ ...config, apiKey: backendHasApiKey ? "******" : "" });
    setIsKeyVisible(false);
  }, [config, backendHasApiKey]);

  function update(next: Partial<LlmExecutorConfig>) {
    setDraft((current) => normalizeLlmConfig({ ...current, hasApiKey: backendHasApiKey, ...next }));
    setMessage("");
  }

  function saveConfig() {
    const apiKey = draft.apiKey === "******" ? "" : draft.apiKey;
    onChange(normalizeLlmConfig({ ...draft, apiKey, hasApiKey: backendHasApiKey || Boolean(apiKey?.trim()) }));
    setMessage("配置已保存");
    if (apiKey?.trim()) setIsKeyVisible(false);
  }

  function testConfig() {
    const apiKey = draft.apiKey === "******" ? "" : draft.apiKey;
    const normalized = normalizeLlmConfig({ ...draft, apiKey, hasApiKey: backendHasApiKey });
    if (!normalized.apiKey?.trim() && !normalized.hasApiKey) {
      setMessage("缺少 API Key，不能测试真实接口。");
      return;
    }
    setMessage("配置格式通过；保存后由后端代理执行真实调用。");
  }

  async function toggleKeyVisible() {
    if (isKeyVisible) {
      setDraft((current) => ({ ...current, apiKey: backendHasApiKey ? "******" : "" }));
      setIsKeyVisible(false);
      return;
    }
    if (!backendHasApiKey) {
      setIsKeyVisible(true);
      return;
    }
    setIsLoadingKey(true);
    setMessage("");
    try {
      const result = await getBackendLlmApiKey();
      setDraft((current) => ({ ...current, apiKey: result.apiKey }));
      setIsKeyVisible(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "读取 Key 失败");
    } finally {
      setIsLoadingKey(false);
    }
  }

  return (
    <article className="panel config-editor-panel">
      <div className="panel-title">
        <Sparkles size={18} />
        <span>DeepSeek 配置</span>
        <strong>{backendHasApiKey || draft.apiKey?.trim() ? "Key 已填" : "未填 Key"}</strong>
      </div>
      <div className="llm-config-form">
        <label>
          Model
          <input value={draft.model} onChange={(event) => update({ model: event.target.value })} placeholder="deepseek-chat" />
        </label>
        <label>
          Base URL
          <input value={draft.baseUrl ?? ""} onChange={(event) => update({ baseUrl: event.target.value })} placeholder="https://api.deepseek.com" />
        </label>
        <label>
          API Key
          <div className="key-input-row">
            <input
              type={isKeyVisible ? "text" : "password"}
              value={draft.apiKey ?? ""}
              onChange={(event) => update({ apiKey: event.target.value })}
              placeholder={backendHasApiKey ? "******" : "保存到本地后端设置"}
            />
            <button type="button" title={isKeyVisible ? "隐藏 Key" : "显示 Key"} onClick={() => void toggleKeyVisible()} disabled={isLoadingKey}>
              <Eye size={16} />
            </button>
          </div>
          <small className={backendHasApiKey ? "field-status success" : "field-status warning"}>
            {backendHasApiKey ? "后端已保存。默认用 ****** 代替；点击眼睛可显示，修改后保存会覆盖旧 Key。" : "尚未保存 Key。填写后点保存配置。"}
          </small>
        </label>
        <label>
          Temperature
          <input
            type="number"
            min="0"
            max="1"
            step="0.1"
            value={draft.temperature}
            onChange={(event) => update({ temperature: Number(event.target.value) })}
          />
        </label>
        <label className="checkbox-line">
          <input type="checkbox" checked={draft.jsonMode} onChange={(event) => update({ jsonMode: event.target.checked })} />
          JSON Output
        </label>
      </div>
      <div className="config-actions">
        <button className="primary-button" onClick={saveConfig}>
          <Save size={16} />
          保存配置
        </button>
        <button onClick={testConfig}>
          <Play size={16} />
          测试配置
        </button>
        {message && <span>{message}</span>}
      </div>
    </article>
  );
}

