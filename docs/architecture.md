# 技术架构方案

## 架构目标

系统必须是可扩展骨架，而不是写死的一条流程。

核心思想：

- 页面是壳
- Pipeline 是骨架
- Rule Pack 是规则
- Profile 是风格
- Adapter 是输出格式
- LLM/图像模型是某些 stage 的执行器

## Pipeline

默认流程：

```text
01 clean_script
02 segment_episode_scene_block
03 build_episode_support
04 plan_scene_context
05 extract_asset_prompts
06 plan_scene_storyboard
07 generate_block_shots
08 build_video_prompts
09 validate
10 export
```

## 最终产物原则

系统最终产物只有两类：

- 资产描述/资产生图提示词
- 分镜规划/视频提示词

其他产物都是中间产物。中间产物必须满足：

- 被后续阶段明确引用
- 有明确来源
- 有明确用途
- 不重复当前执行单元自己能判断的信息
- 不堆无效总结

## 03 / 06 / 07 边界

### 03 build_episode_support

03 只提供 06/07 当前执行边界看不到的大尺度辅助信息。

它输出：

- 本集信息揭露顺序
- 本集情绪弧线
- 跨段人物关系约束
- 跨场道具状态约束
- 本集视觉策略
- 禁止提前暴露的信息

它不输出：

- 当前镜头站位
- 当前镜头景别
- 当前块动作拆解
- 当前镜头提示词

### 06 plan_scene_storyboard

06 以一场戏为首次规划边界。

它负责：

- 场级分镜规划
- 本场人物进出
- 本场空间时序
- 本场道具流转
- 本场镜头连续性

它输出 `scene_spatial_timeline`，供 07 使用。

### 07 generate_block_shots / 08 build_video_prompts

07/08 是执行层。

块级生成必须引用并遵守：

- episode_support
- scene_context
- scene_spatial_timeline
- locked_assets
- neighboring_shots

## 重跑策略

- 首次生成：场级规划。
- 局部不满意：块级重跑。
- 影响空间、进出场、道具流转：场级重跑。
- 影响信息揭露顺序、人物关系、本集目标：集级重跑。

锁定项：

- `episode_support`
- `scene_context`
- `scene_spatial_timeline`
- `locked_assets`
- `neighboring_shots`

局部重跑不得改写锁定项。

## 核心抽象

### StoryboardProject

本地项目状态。后续可迁移到后端数据库。

字段：

- `projectId`
- `name`
- `updatedAt`
- `script`
- `options`
- `analysis`
- `latestRun`
- `versions`

### ProjectVersion

项目保存点。

字段：

- `versionId`
- `name`
- `createdAt`
- `summary`

当前版本只记录摘要和保存点，后续需要补完整 diff、真源快照和回滚。

### ArtifactRecord

统一产物记录。所有中间产物和最终产物都必须通过 Artifact Store 追踪。

字段：

- `artifactId`
- `kind`
- `stageId`
- `role`
- `title`
- `summary`
- `sourceRefs`
- `downstreamRefs`
- `updatedAt`
- `reliability`

### LockRecord

锁定状态。

字段：

- `lockId`
- `scope`
- `targetId`
- `label`
- `status`
- `reason`
- `updatedAt`

### TaskRecord

任务状态。

字段：

- `taskId`
- `stageId`
- `label`
- `status`
- `scope`
- `targetId`
- `updatedAt`
- `detail`

### PipelineRun

一次可追踪的管线运行。

字段：

- `runId`
- `projectId`
- `startedAt`
- `finishedAt`
- `status`
- `trigger`
- `stageResults`
- `logs`

### StageResult

一个阶段的执行结果。

字段：

- `stageId`
- `status`
- `inputRefs`
- `outputRefs`
- `startedAt`
- `finishedAt`
- `durationMs`
- `executor`
- `artifactSummary`
- `error`
- `logs`

### Dev / Execution Log

开发阶段必须能看到管线运行日志。

日志至少记录：

- 阶段 ID
- 执行器类型：rule / llm / image / export
- 输入引用
- 输出引用
- 耗时
- 错误
- 人工修改
- 重跑原因

当前前端已有底部开发日志台。现在只接前端规则和操作日志，后续接真实 `PipelineRun`。

### LlmExecutor

P1 起新增模型执行器抽象。

字段：

- `mode`: `openai-compatible`
- `model`
- `baseUrl`
- `hasApiKey`

当前通过本地 `/api/llm/chat` 代理调用 DeepSeek/OpenAI-compatible 接口。

前端不再提供 Mock 选项；调用失败必须进入执行日志。

已接入阶段：

- `01 clean_script`
- `03 build_episode_support`
- `04 plan_scene_context`

真实 API 接入时必须保持同一输出契约，不允许让后续页面直接依赖模型原始文本。

### P1 Schema

P1 中间产物必须经过 runtime schema 校验。

当前 schema：

- `ScriptCleanArtifact`
- `EpisodeSupportArtifact`
- `SceneContextArtifact`

要求：

- 每条事实必须有 `sourceRefs`
- 每条辅助信息必须有 `useAs`
- 每条辅助信息必须有 `usedBy`
- 空间时序必须标注可靠性
- 不可靠信息只能进入 `needs_review`，不能当锁定结论使用

### PipelineStage

一个可独立执行、可重跑、可缓存的阶段。

字段：

- `id`
- `name`
- `input`
- `output`
- `executor`
- `status`
- `dependencies`
- `granularity`
- `artifactRole`
- `purpose`
- `lockPolicy`
- `rerunScopes`

### RulePack

规则包，决定某一类任务如何处理。

示例：

- 剧本清洗规则包
- 短剧分镜规则包
- 生图提示词规则包
- 视频提示词规则包

### GenreProfile

题材配置。

示例：

- 都市情感
- 悬疑
- 甜宠
- 复仇

### DirectorProfile

导演/镜头风格配置。

示例：

- 强冲突快节奏
- 冷静写实
- 高压悬疑

### OutputAdapter

输出适配器。

示例：

- 标准 JSON/CSV
- 平台 A 格式
- 平台 B 格式
- 生图工具格式

## 长文本策略

50000 字剧本不能一次性处理。

必须支持：

- 分集
- 分场
- 分块
- 摘要
- 上下文滚动更新
- 中间产物保存
- 局部重跑
- 失败重试

## 当前实现状态

当前为前端原型：

- 已有基础剧本校验
- 已有规则版资产/分镜/提示词生成
- 已有规则版上下文包
- 已有项目 ZIP 导出

未实现：

- 后端
- 数据库
- 任务队列
- LLM 执行器
- 生图执行器
- 真实 Pipeline 状态机
