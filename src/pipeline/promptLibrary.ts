export type PromptStageId =
  | "clean_script"
  | "build_episode_support"
  | "plan_scene_context"
  | "extract_asset_prompts";

export interface PromptVariable {
  key: string;
  label: string;
  description: string;
}

export interface PromptVersion {
  promptId: string;
  stageId: PromptStageId;
  name: string;
  description: string;
  variables: PromptVariable[];
  systemTemplate: string;
  userTemplate: string;
  outputContract: string;
  exampleOutput: string;
  updatedAt: string;
}

export interface PromptLibraryState {
  prompts: PromptVersion[];
  selectedPromptIds: Record<PromptStageId, string>;
}

export interface RenderedPromptVersion {
  prompt: PromptVersion;
  system: string;
  user: string;
  outputContract: string;
}

const promptLibraryKey = "storyboard-prompt-library-v1";

export const promptStages: Array<{ stageId: PromptStageId; name: string; purpose: string }> = [
  {
    stageId: "clean_script",
    name: "剧本清洗",
    purpose: "确认后续 LLM 的信息源头正确，只清洗格式、错字、命名和明显矛盾。",
  },
  {
    stageId: "build_episode_support",
    name: "集级辅助",
    purpose: "提取 06/07 当前块看不到、但必须遵守的大尺度信息。",
  },
  {
    stageId: "plan_scene_context",
    name: "场级上下文",
    purpose: "从整场明确文本推导人物进出、道具流转和空间时序。",
  },
  {
    stageId: "extract_asset_prompts",
    name: "资产识别与生图提示词",
    purpose: "由 LLM 从剧本识别角色、场景、道具，并生成最终资产描述和图片提示词。",
  },
];

export function loadPromptLibrary(): PromptLibraryState {
  const raw = localStorage.getItem(promptLibraryKey);
  if (raw) {
    try {
      return normalizePromptLibrary(JSON.parse(raw) as Partial<PromptLibraryState>);
    } catch {
      localStorage.removeItem(promptLibraryKey);
    }
  }
  const initial = createDefaultPromptLibrary();
  savePromptLibrary(initial);
  return initial;
}

export function savePromptLibrary(state: PromptLibraryState) {
  localStorage.setItem(promptLibraryKey, JSON.stringify(normalizePromptLibrary(state)));
}

export function normalizePromptLibrary(state: Partial<PromptLibraryState>): PromptLibraryState {
  const defaults = createDefaultPromptLibrary();
  const promptById = new Map<string, PromptVersion>();
  for (const prompt of [...defaults.prompts, ...(state.prompts ?? [])]) {
    promptById.set(prompt.promptId, {
      ...prompt,
      updatedAt: prompt.updatedAt || new Date().toISOString(),
    });
  }
  const prompts = [...promptById.values()];
  const selectedPromptIds = { ...defaults.selectedPromptIds, ...(state.selectedPromptIds ?? {}) };
  for (const stage of promptStages) {
    const selected = prompts.find((prompt) => prompt.promptId === selectedPromptIds[stage.stageId] && prompt.stageId === stage.stageId);
    if (!selected) {
      selectedPromptIds[stage.stageId] = prompts.find((prompt) => prompt.stageId === stage.stageId)?.promptId ?? defaults.selectedPromptIds[stage.stageId];
    }
  }
  return { prompts, selectedPromptIds };
}

export function selectPrompt(state: PromptLibraryState, stageId: PromptStageId, promptId: string): PromptLibraryState {
  return normalizePromptLibrary({
    ...state,
    selectedPromptIds: {
      ...state.selectedPromptIds,
      [stageId]: promptId,
    },
  });
}

export function upsertPrompt(state: PromptLibraryState, prompt: PromptVersion): PromptLibraryState {
  const nextPrompt = {
    ...prompt,
    updatedAt: new Date().toISOString(),
  };
  return normalizePromptLibrary({
    ...state,
    prompts: [...state.prompts.filter((item) => item.promptId !== nextPrompt.promptId), nextPrompt],
    selectedPromptIds: {
      ...state.selectedPromptIds,
      [nextPrompt.stageId]: nextPrompt.promptId,
    },
  });
}

export function duplicatePrompt(state: PromptLibraryState, promptId: string): PromptLibraryState {
  const source = state.prompts.find((prompt) => prompt.promptId === promptId);
  if (!source) return state;
  const copy: PromptVersion = {
    ...source,
    promptId: createPromptId(source.stageId),
    name: `${source.name} 副本`,
    updatedAt: new Date().toISOString(),
  };
  return upsertPrompt(state, copy);
}

export function renderSelectedPrompt(
  state: PromptLibraryState,
  stageId: PromptStageId,
  variables: Record<string, string | number | undefined>,
): RenderedPromptVersion {
  const normalized = normalizePromptLibrary(state);
  const prompt =
    normalized.prompts.find((item) => item.promptId === normalized.selectedPromptIds[stageId] && item.stageId === stageId) ??
    normalized.prompts.find((item) => item.stageId === stageId);
  if (!prompt) throw new Error(`缺少 Prompt 配置：${stageId}`);
  return {
    prompt,
    system: renderTemplate(prompt.systemTemplate, variables),
    user: renderTemplate(prompt.userTemplate, variables),
    outputContract: renderTemplate(prompt.outputContract, variables),
  };
}

export function renderTemplate(template: string, variables: Record<string, string | number | undefined>) {
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const value = variables[key.trim()];
    return value === undefined ? "" : String(value);
  });
}

export function createPromptId(stageId: PromptStageId) {
  return `${stageId}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
}

function createDefaultPromptLibrary(): PromptLibraryState {
  const updatedAt = "2026-06-02T00:00:00.000Z";
  const prompts: PromptVersion[] = [
    {
      promptId: "clean_script-default-v1",
      stageId: "clean_script",
      name: "默认清洗审校 v1",
      description: "只清洗信息源，不改写剧情。",
      variables: [
        { key: "分集剧本", label: "分集剧本", description: "当前集完整剧本文本。" },
      ],
      systemTemplate:
        "你是影视剧本清洗和审校执行器。目标是让后续 LLM 使用正确的信息源。只修复格式混乱、明显错字、角色/资产命名混乱、明确的信息矛盾；不得重写剧情、不得补写未出现情节。所有改动和疑点必须能追溯到原文。",
      userTemplate: "请处理以下分集剧本。\n\n{{分集剧本}}",
      outputContract:
        '只输出 JSON，不要 Markdown。结构：{"cleanedScript":"清洗后的完整剧本","issues":[{"id":"ISSUE-001","severity":"info|warning|error","category":"format|naming|continuity|typo|missing_info","message":"问题或修复说明","sourceRefs":[{"refId":"line:1","text":"原文片段","confidence":"explicit|inferred|needs_review"}]}],"sourceReliability":"explicit|inferred|needs_review"}。issues 可以为空数组，但每条 issue 必须带 sourceRefs。',
      exampleOutput:
        '{"cleanedScript":"第一集\\n1-1 后山树林 日 外\\n人物：团团、灵儿","issues":[{"id":"ISSUE-001","severity":"warning","category":"naming","message":"同一人物称呼疑似不统一，需人工确认。","sourceRefs":[{"refId":"line:12","text":"原文片段","confidence":"needs_review"}]}],"sourceReliability":"explicit"}',
      updatedAt,
    },
    {
      promptId: "build_episode_support-default-v1",
      stageId: "build_episode_support",
      name: "默认集级辅助 v1",
      description: "只保留大尺度约束，不重复局部可见信息。",
      variables: [
        { key: "集编号", label: "集编号", description: "如 EP01。" },
        { key: "分集剧本", label: "分集剧本", description: "当前集完整剧本文本。" },
      ],
      systemTemplate:
        "你只提取集级辅助信息。它辅助后续分镜规划和视频提示词，但不能替代具体执行。只保留当前块/单镜头看不到、而整集尺度能看见的信息；不要写镜头、不要写具体站位、不要生成提示词、不要重复局部剧本已经明示的信息。每条信息必须说明怎么用、给谁用、来源可靠性。",
      userTemplate: "集编号：{{集编号}}\n\n请从以下分集剧本提取集级辅助信息。\n\n{{分集剧本}}",
      outputContract:
        '只输出 JSON，不要 Markdown。episodeId 必须是 "{{集编号}}"。结构：{"episodeId":"{{集编号}}","revealOrder":[],"emotionArc":[],"relationshipConstraints":[],"propContinuity":[],"visualStrategy":[],"forbiddenEarlyReveals":[]}。数组元素结构统一为：{"id":"...","fact":"...","useAs":"constraint|parameter|warning","usedBy":["plan_scene_context|plan_scene_storyboard|generate_block_shots|build_video_prompts"],"sourceRefs":[{"refId":"line:1","text":"原文片段","confidence":"explicit|inferred|needs_review"}],"reliability":"explicit|inferred|needs_review"}。没有可靠信息时输出空数组。',
      exampleOutput:
        '{"episodeId":"EP01","revealOrder":[{"id":"SUP-001","fact":"玉佩身份信息不能在前半段提前揭示。","useAs":"constraint","usedBy":["plan_scene_storyboard","build_video_prompts"],"sourceRefs":[{"refId":"line:42","text":"玉佩相关原文","confidence":"explicit"}],"reliability":"explicit"}],"emotionArc":[],"relationshipConstraints":[],"propContinuity":[],"visualStrategy":[],"forbiddenEarlyReveals":[]}',
      updatedAt,
    },
    {
      promptId: "plan_scene_context-default-v1",
      stageId: "plan_scene_context",
      name: "默认场级上下文 v1",
      description: "整场推导场内连续性和空间时序。",
      variables: [
        { key: "集编号", label: "集编号", description: "如 EP01。" },
        { key: "题材", label: "题材", description: "题材配置。" },
        { key: "导演风格", label: "导演风格", description: "风格配置。" },
        { key: "场景列表", label: "场景列表", description: "本集已拆出的场景名。" },
        { key: "分集剧本", label: "分集剧本", description: "当前集完整剧本文本。" },
      ],
      systemTemplate:
        "你是场级上下文规划执行器。只从整场明确文本和集级辅助推导人物进出、道具流转、空间锚点和场内空间时序。空间站位只能来自明确进出场、位移、空间关系或可审查的轻推导；不写镜头语言，不写视频提示词，不发明精确位置。",
      userTemplate:
        "集编号：{{集编号}}\n题材：{{题材}}\n导演风格：{{导演风格}}\n场景列表：{{场景列表}}\n\n请基于以下分集剧本输出场级上下文。\n\n{{分集剧本}}",
      outputContract:
        '只输出 JSON，不要 Markdown。结构：{"sceneId":"{{集编号}}-SC01","episodeId":"{{集编号}}","scenePurpose":"...","entrancesExits":[],"propFlow":[],"spatialAnchors":[],"sceneSpatialTimeline":[{"beatId":"BEAT-001","order":1,"state":"...","sourceRefs":[{"refId":"line:1","text":"原文片段","confidence":"explicit|inferred|needs_review"}],"reliability":"explicit|inferred|needs_review"}],"continuityNotes":[]}。entrancesExits、propFlow、spatialAnchors、continuityNotes 的数组元素必须是：{"id":"...","fact":"...","useAs":"constraint|parameter|warning","usedBy":["plan_scene_context|plan_scene_storyboard|generate_block_shots|build_video_prompts"],"sourceRefs":[{"refId":"line:1","text":"原文片段","confidence":"explicit|inferred|needs_review"}],"reliability":"explicit|inferred|needs_review"}。',
      exampleOutput:
        '{"sceneId":"EP01-SC01","episodeId":"EP01","scenePurpose":"建立人物遭遇和关键道具状态。","entrancesExits":[{"id":"CTX-001","fact":"团团先在树林，灵儿随后进入同一空间。","useAs":"constraint","usedBy":["plan_scene_storyboard","generate_block_shots"],"sourceRefs":[{"refId":"line:3","text":"原文片段","confidence":"explicit"}],"reliability":"explicit"}],"propFlow":[],"spatialAnchors":[],"sceneSpatialTimeline":[{"beatId":"BEAT-001","order":1,"state":"人物处于后山树林同一行动空间。","sourceRefs":[{"refId":"line:2","text":"1-1 后山树林 日 外","confidence":"explicit"}],"reliability":"explicit"}],"continuityNotes":[]}',
      updatedAt,
    },
    {
      promptId: "extract_asset_prompts-default-v1",
      stageId: "extract_asset_prompts",
      name: "默认资产识别 v1",
      description: "LLM 从剧本识别资产，不依赖规则候选资产。",
      variables: [
        { key: "集编号", label: "集编号", description: "如 EP01。" },
        { key: "题材", label: "题材", description: "题材配置。" },
        { key: "导演风格", label: "导演风格", description: "风格配置。" },
        { key: "分集剧本", label: "分集剧本", description: "当前集完整剧本文本。" },
      ],
      systemTemplate:
        "你是影视资产识别、资产描述和生图提示词执行器。必须直接从剧本识别需要稳定复用或需要生图的资产，包括角色、场景、关键道具。不要依赖外部候选列表，不要发明剧本没有依据的关键外观。输出要可靠、简洁、可人工审阅、可直接进入资产生图页。",
      userTemplate:
        "集编号：{{集编号}}\n题材：{{题材}}\n导演风格：{{导演风格}}\n\n请从以下分集剧本直接识别资产，并输出资产描述与图片生成提示词。\n\n{{分集剧本}}",
      outputContract:
        '只输出 JSON，不要 Markdown。episodeId 必须是 "{{集编号}}"。结构：{"episodeId":"{{集编号}}","assets":[{"assetId":"{{集编号}}-C001","type":"角色|场景|道具","name":"资产名","description":"简洁资产描述，只写有依据和需锁定的信息","imagePrompt":"可直接用于生图的中文提示词，包含主体、外观/空间/材质、风格，不写无依据剧情","continuity":"后续分镜和视频提示词必须保持的连续性","sourceRefs":[{"refId":"line:1","text":"原文片段","confidence":"explicit|inferred|needs_review"}],"reliability":"explicit|inferred|needs_review"}]}。编号规则：角色 C，场景 L，道具 P，从 001 递增。必须识别剧本中承担叙事、视觉连续性或生图需求的角色/场景/关键道具；不输出普通动作词或抽象概念。',
      exampleOutput:
        '{"episodeId":"EP01","assets":[{"assetId":"EP01-C001","type":"角色","name":"团团","description":"本集主要角色，具体年龄和服装若剧本未明示需标记待审。","imagePrompt":"短剧角色设定图，团团，保留剧本明示特征，写实影视风格，干净背景","continuity":"跨镜保持脸型、发型、服装和年龄感一致；未明示外观不得随意变化。","sourceRefs":[{"refId":"line:2","text":"人物：团团、灵儿","confidence":"explicit"}],"reliability":"needs_review"},{"assetId":"EP01-P001","type":"道具","name":"玉佩","description":"身份线索相关关键道具。","imagePrompt":"玉佩道具设定图，清晰材质和纹理，影视道具特写，写实风格","continuity":"保持形状、材质、纹理、持有人和开合/损坏状态一致。","sourceRefs":[{"refId":"line:40","text":"玉佩相关原文","confidence":"explicit"}],"reliability":"explicit"}]}',
      updatedAt,
    },
  ];

  return {
    prompts,
    selectedPromptIds: {
      clean_script: "clean_script-default-v1",
      build_episode_support: "build_episode_support-default-v1",
      plan_scene_context: "plan_scene_context-default-v1",
      extract_asset_prompts: "extract_asset_prompts-default-v1",
    },
  };
}
