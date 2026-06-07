# 技术架构方案

## 架构目标

系统必须是可扩展车架，而不是写死的一条流程。

核心思想：

- 页面是操作台。
- Workflow/Pipeline 是可配置骨架。
- Rulepack 是规则、Prompt、Schema 和输出契约。
- Adapter 是 LLM、图像、视频、导出等外部能力接入方式。
- Artifact 是每个节点的可追踪产物。

## 当前技术形态

当前项目采用：

- 前端：React + TypeScript + Vite。
- 后端：FastAPI。
- 本地持久化：项目文件夹 + JSON + Markdown rulepack。
- API 代理：后端统一代理 LLM、生图和本地文件读写。

当前目标不是最终打包形态，而是先把本地生产车架跑顺。后续可在业务稳定后再考虑 Electron 包装。

## 后端目录边界

```text
server/
  api/              # HTTP API 路由
  projects/         # 项目根目录、项目扫描、创建、删除、保存
  settings/         # 全局配置和 API Key
  rulepacks/        # Markdown Prompt / 规则包扫描
  story_workflow/   # 竖屏短剧分镜工作流
  assets/           # 资产 records / true_sources / 图片
  image_providers/  # 生图商家和模型适配
  llm/              # OpenAI-compatible LLM 调用
  logs/             # LLM、生图、任务日志
  storage/          # JSON 文件读写
  core/             # 路径和基础配置
```

设计原则：

- 前端不直接读写本机项目文件。
- 前端不写死 Prompt 内容。
- 后端从 rulepack/providerpack/settings 中读取配置。
- 每个新能力优先判断是否应作为节点、规则包或适配器接入。

## 竖屏短剧默认工作流

当前确认的分镜阶段默认工作流使用语义化节点名，执行顺序由工作流配置决定。

```text
剧情地图
角色概要
信息连续性
全集概要
章节概要
单集概要
场次概要
分镜设计
视频提示词
```

页面归属：

- 剧本统筹：剧情地图/角色概要/信息连续性/全集概要/章节概要。
- 分镜统筹：单集概要/场次概要/分镜设计。
- 视频生成：视频提示词。

当前工程实现：

- 后端节点定义：`server/story_workflow/service.py`
- 后端接口：`server/api/story_workflow.py`
- 前端接口：`src/lib/storyWorkflowApi.ts`
- 前端页面：`StoryPlanningView`、`StoryboardPlanningView`、`VideoGenerationView`
- Prompt 文件：`rulepacks/default/story_workflow_*/prompt.md`
- 产物目录：项目文件夹内 `artifacts/story_workflow/{node}.json`
- 运行元信息目录：项目文件夹内 `artifacts/story_workflow/{node}.meta.json`

## 节点边界

### 剧情地图

输入：全集剧本。

输出：一句话梗概、类型/基调、主线、情绪曲线、章节节点、关键转折。

不输出：资产、分镜、每集标题。

### 角色概要

输入：全集剧本 + 剧情地图。

输出：主要角色功能、欲望、缺陷、弧线终点、关系变化、身份变化。

不输出：角色外观资产真源、生图提示词。

### 信息连续性

输入：全集剧本 + 剧情地图。

输出：伏笔 callback、视觉母题、关键道具风险、反复空间风险、资产变化疑点。

不输出：最终资产命名。

### 全集概要

输入：剧情地图/角色概要/信息连续性。

输出：供章节概要引用的全集概要。

规则：只整合，不新增。

### 章节概要

输入：当前章节剧本 + 全集概要。

输出：章节名称、集数范围、章节功能、情绪主调、必须出现的母题/伏笔、章节结束钩子、每集标题、每集一句话梗概。

不输出：分镜和视频提示词。

### 单集概要

输入：当前集剧本 + 当前章节概要 + 前后集概要 + 必要信息连续性风险。

输出：本集任务、情绪变化、钩子类型、必须放大的细节、节奏指令、承上启下、资产/连续性关注点。

不输出：完整分镜。

### 场次概要

输入：当前场剧本 + 当前单集概要 + 前后场概要 + 必要资产信息。

输出：本场戏剧任务、角色进入状态、潜台词、强调信息、空间关系、节奏氛围、承接悬念。

使用策略：简单场可跳过；多人站位、桌边对话、关键道具状态、复杂空间移动时优先独立执行。

### 分镜设计

输入：当前场剧本 + 当前单集概要 + 可选当前场次概要 + 资产真源或资产占位。

输出：场内分镜设计、镜号、景别、机位运动、画面动作、对白/旁白、音效、转场、资产引用、连续性要求、钩子镜头、必要 `scene_spatial_timeline`。

这是当前分镜层的真正执行节点。

### 视频提示词

输入：已确认分镜 + 资产真源。

输出：视频组提示词、参考图路径、时长、草稿状态、视频路径。

不改剧情、不重排分镜、不更改资产。

## 重跑策略

当前默认重跑粒度：

- 剧情地图/角色概要/信息连续性：全剧理解明显错误时重跑。
- 章节概要：章节划分、章节功能、每集标题/梗概错误时重跑。
- 单集概要：单集任务、情绪、钩子、承上启下错误时重跑。
- 场次概要：人物进入状态、潜台词、空间关系、道具状态错误时重跑。
- 分镜设计：镜头语言、动作组织、空间时序、转场、资产引用错误时重跑。
- 视频提示词：视频模型语言、参考图、模型参数错误时重跑。

不设置独立块级分镜节点。以后如需要镜头小块重跑，应作为分镜设计内部能力实现。

## 资产衔接原则

最终生产状态：

- 分镜设计/视频提示词 必须引用资产真源 ID、版本和真源图片。
- LLM 不允许临时发明资产名称。
- 如发现资产真源问题，标记返回资产审阅修正。

当前工程阶段：

- 先让分镜工作流独立跑通。
- 暂不强制接资产审阅，以免资产阶段未完成的设计影响分镜阶段验证。
- Prompt 中必须明确当前是资产占位，禁止发明最终资产 ID。

## Artifact 设计

所有节点产物必须保持可被后续节点直接消费，运行追踪信息必须分离。

当前分镜阶段节点产物保存为：

```text
项目文件夹/
  artifacts/
    story_workflow/
      story_map.json       # 纯业务 JSON，只保存该节点 output
      story_map.meta.json  # UI/运行状态，不作为下游变量输入
      character_summary.json
      character_summary.meta.json
      ...
```

`{node}.json` 只允许保存 LLM 输出或人工修正后的业务结构，例如：

- 剧情地图
- 角色概要
- 信息连续性
- 章节概要
- 单集概要
- 场次概要
- 分镜设计
- 视频提示词

`{node}.json` 禁止混入：

- `nodeId`
- `title`
- `status`
- `updatedAt`
- `promptId`
- `inputSummary`
- `rawText`
- `error`

这些字段只允许出现在 `{node}.meta.json` 或后端 LLM 日志中。后续节点渲染变量时，只读取 `{node}.json` 的业务内容；如果没有业务内容，则传空，不用 `rawText` 兜底。

辅助字段也必须保持克制。当前开发阶段允许保留必要的状态、错误和排查信息；后续迭代要定期收紧 `{node}.meta.json` 和日志字段，凡是不服务于 UI 状态、错误排查、调用回放或明确调试需求的字段，都应删除，避免项目文件膨胀和无效读取。

## 日志

LLM 调用必须记录：

- 阶段 ID
- Prompt ID
- 模型
- Base URL
- 输入 messages
- 输入字数
- 输出原文
- 输出字数
- 耗时
- 错误信息

当前由 `server/logs/service.py` 写入本机日志，并在任务记录/流程配置中查看。

## Rulepack

Prompt 文件放在 `rulepacks/default/`。

分镜阶段当前文件：

- `story_workflow_story_map/prompt.md`
- `story_workflow_character_summary/prompt.md`
- `story_workflow_continuity/prompt.md`
- `story_workflow_series_summary/prompt.md`
- `story_workflow_chapter_summary/prompt.md`
- `story_workflow_episode_summary/prompt.md`
- `story_workflow_scene_summary/prompt.md`
- `story_workflow_storyboard_design/prompt.md`
- `story_workflow_video_prompt/prompt.md`

后续不同项目类型应加载不同 rulepack，而不是改页面代码。

## 长文本策略

50000 字剧本可能无法稳定一次完成全部分析。

必须支持：

- 全剧统筹可拆成剧情地图、角色概要、信息连续性多次调用。
- 超大剧本可分段提炼后汇总。
- 章节概要可按章节或批次调用。
- 节点产物必须缓存，支持局部重跑。
- 失败节点不影响已完成节点产物。

## 当前实现状态

已实现：

- FastAPI 本地后端。
- 项目根目录、项目读写、剧本分集保存。
- LLM 配置和调用日志。
- 生图 provider 配置与资产候选/真源图片流程。
- 分镜工作流接口骨架和 Prompt 文件。
- 剧本统筹、分镜统筹、视频生成三个一级页面。

仍需实现：

- 全剧统筹和章节概要的分批策略和汇总策略。
- 场次概要是否独立执行的配置开关。
- 分镜设计/视频提示词 与资产真源的正式衔接。
- 异步任务队列。
- 节点输出 schema 校验和人工编辑保存。
- 视频生成候选与人工 QA。
