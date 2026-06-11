# Agent 与 Context Pack 改造分析

## 结论

当前系统适合引入 Agent，但不适合直接变成自由聊天式 Agent。

推荐路线是：

```text
现有 Pipeline 骨架
+ Context Pack
+ Block Runner
+ 受控 Agent 调度
```

Pipeline 继续负责阶段边界、文件落盘、锁定、重跑和追踪。Agent 负责判断、取上下文、调度节点、发现冲突和提出修复建议。

## 为什么 DeepSeek 适合

DeepSeek 当前能力对本系统比较匹配：

- 上下文硬盘缓存默认开启。后续请求只要与前序请求存在稳定前缀，就可能命中缓存。
- 返回 `usage.prompt_cache_hit_tokens` 和 `usage.prompt_cache_miss_tokens`，可记录缓存效果。
- 当前文档显示 deepseek-v4-flash / deepseek-v4-pro 支持 1M 上下文、JSON Output、Tool Calls、对话前缀续写。
- 缓存命中价格显著低于未命中输入，适合“固定上下文 + 多块重复调用”的生产流。

这正好对应我们的工作方式：

```text
固定前缀：
全集剧情信息流
资产连续性信息流
当前单集 Context Pack
当前规则包

变化输入：
处理第 N 场
处理第 N 个视频块
处理某段镜头
```

需要注意：DeepSeek 的缓存不是显式 `cache_id`，而是前缀匹配。工程上必须保证固定上下文顺序、内容、格式稳定。

## Agent 适合本系统的点

我们的流程不是单纯串行，而是多层继承、多分支重跑、多真源约束：

```text
全集
  ├─ 剧情信息流
  └─ 资产连续性信息流

章节 / 单集 / 场次 / 视频块
  ├─ 用剧情信息辅助镜头语言
  └─ 用资产连续性辅助视频生产
```

固定 Pipeline 擅长稳定执行，但不擅长判断：

- 当前块缺哪些上下文。
- 哪些资产必须引用真源。
- 失败后应该重跑场次、视频块，还是返回资产审阅。
- 当前输出是否破坏剧情意图或资产连续性。

Agent 适合承担这些判断，但必须受控：

- 不直接写最终真源。
- 不跳过 rulepack。
- 不改锁定资产。
- 所有建议和节点调用必须落日志。

## 对稳定性、一致性、可控性的好处

### 稳定性

Context Pack 把上游信息整理成稳定输入，减少每个节点临时拼接上下文导致的差异。

收益：

- 单集、场次、视频块使用同一份上下文批次。
- 失败后可用同一 `contextPackHash` 重跑。
- 不因提示词临时拼接差异导致输出风格飘移。

### 一致性

剧情信息流和资产连续性信息流分开管理，避免混成一锅上下文。

剧情流服务镜头语言：

- 当前情绪。
- 爽点位置。
- 伏笔和回收。
- 人物关系变化。
- 节奏和钩子目标。

资产流服务生产连续性：

- 角色版本。
- 场景空间。
- 道具状态。
- selected 真源图。
- 引用镜头和锁定状态。

这样可以减少：

- 人物换装、换脸、年龄漂移。
- 场景空间关系混乱。
- 道具状态前后不一致。
- 分镜只机械拆句、不服务剧情。

### 可控性

每次调用记录：

```text
contextPackId
contextPackHash
blockId
promptId
inputHash
outputPath
cacheHitTokens
cacheMissTokens
status
error
```

这样可以做到：

- 哪个块失败只重跑哪个块。
- 能追溯某条视频提示词用了哪批剧情和资产信息。
- 能判断缓存是否命中。
- 能把问题归因到上下文、prompt、模型或资产真源。

## 推荐信息结构

### Series Context Pack

```text
series_id
script_hash
story_map
character_summary
information_continuity
series_summary
global_rules
```

用途：全集级理解，不直接塞入所有下游调用，只提供压缩后的稳定底座。

### Episode Context Pack

```text
episode_id
series_context_pack_id
episode_script
chapter_summary
episode_summary
active_characters
active_scenes
active_props
continuity_constraints
locked_assets
```

用途：单集、场次、分块规划的主要上下文。

### Scene Context Pack

```text
scene_id
episode_context_pack_id
scene_script
scene_summary
character_enter_state
space_relationship
prop_state
dramatic_task
```

用途：场次概要、分块规划、分镜语言。

### Video Block Context Pack

```text
block_id
scene_context_pack_id
source_text
block_task
start_end_state
shot_asset_refs
selected_true_source_images
previous_block_brief
```

用途：视频提示词、视频生产 QA。

## 建议 Agent 分工

不要做一个全能 Agent。建议按职责拆小：

```text
OrchestratorAgent
  判断当前目标，选择节点，控制重跑范围。

StoryContextAgent
  维护剧情信息流，压缩全集/单集/场次上下文。

ContinuityAgent
  维护角色、场景、道具、真源图和锁定状态。

StoryboardDirectorAgent
  把剧情意图转成镜头语言和分块规划。

VideoPromptAgent
  把视频块、资产真源和连续性约束转成视频提示词。

QAAgent
  检查缺失、冲突、未锁定资产、剧情偏移和生产不可用项。
```

Agent 的输出默认是候选建议或节点产物草案。最终真源仍然由结构化文件和人工确认决定。

## 实施方案

### 第一步：新增 Context Pack 生成器

新增后端模块：

```text
server/context_packs/
  models.py
  service.py
  builders.py
```

新增项目目录：

```text
artifacts/context_packs/
  series/{series_id}.json
  episodes/{episode_id}.json
  scenes/{scene_id}.json
  video_blocks/{block_id}.json
```

每个 Context Pack 必须包含：

```text
id
type
source_paths
source_hashes
content
created_at
updated_at
```

### 第二步：改 LLM 调用封装

在 `server/llm/service.py` 增强日志字段：

```text
promptCacheHitTokens
promptCacheMissTokens
contextPackId
contextPackHash
blockId
```

调用消息结构保持稳定：

```text
system:
  固定规则

user:
  固定 Context Pack 内容

user:
  当前 block 任务
```

固定前缀必须稳定，变化任务只能放最后。

### 第三步：选一个节点试点

建议先选：

```text
视频提示词
```

原因：

- 它天然按视频块并行/批量多次调用。
- 它最依赖资产连续性。
- 它输出容易做 QA。

试点目标：

```text
同一个 Episode/Scene Context Pack
连续处理多个 video block
记录缓存命中
对比输出一致性
```

### 第四步：新增 Block Runner

新增后端能力：

```text
POST /api/projects/{project_id}/story-workflow/block-run
```

输入：

```json
{
  "nodeId": "video_prompt",
  "contextPackId": "SCENE-001",
  "blockIds": ["B001", "B002", "B003"],
  "mode": "sequential"
}
```

输出：

```text
每个 block 的状态、输出路径、错误、缓存命中情况。
```

先做顺序执行，再考虑并发。并发要受限，避免共享上下文下日志难追。

### 第五步：加 QA 检查

QA 不负责重写，只负责标记：

```text
缺少 selected 真源图
引用不存在资产
角色版本不一致
场景空间冲突
道具状态冲突
剧情任务偏移
视频提示词不可生产
```

QA 结果落盘到：

```text
artifacts/qa/{node_id}/{block_id}.json
```

### 第六步：前端最小接入

前端先不做复杂 Agent UI，只加：

- Context Pack 查看。
- 按场次/视频块运行。
- 缓存命中统计。
- 失败块重跑。
- QA 问题列表。

## 风险与约束

- DeepSeek 缓存是尽力而为，不保证每次命中。
- 缓存不等于模型记忆，真源仍必须落本地文件。
- Agent 不允许绕过锁定状态。
- 长上下文需要压缩，不能把全集原文无脑塞进每个请求。
- 并发要谨慎，先做顺序 Block Runner。
- Context Pack 变更后必须更新 hash，否则重跑不可追踪。

## 推荐优先级

```text
P0：Context Pack 数据结构和落盘
P1：LLM 日志记录缓存命中字段
P2：视频提示词节点试点 Block Runner
P3：QAAgent 检查资产连续性和剧情偏移
P4：扩展到场次概要、分块规划
P5：再做 OrchestratorAgent
```

## 判断

这套改造不是推倒重来，而是给现有工作流加“稳定上下文底座”和“按块执行能力”。

预期收益：

- 减少模型漂移。
- 减少无关上下文噪音。
- 增强剧情和资产连续性。
- 降低重复 token 成本。
- 提升失败重跑和问题定位能力。
- 为后续受控 Agent 化打基础。

参考：

- DeepSeek 上下文硬盘缓存：https://api-docs.deepseek.com/zh-cn/guides/kv_cache
- DeepSeek 模型与价格：https://api-docs.deepseek.com/zh-cn/quick_start/pricing
