# 分镜工作流字段运行路线图

本文记录当前 V1 字段事实：字段在哪里产生、被哪里读取、到哪里结束。

## 节点链路

```text
全集剧本
  -> 剧情结构图
  -> 角色状态图
  -> 视觉资产状态图
  -> 全剧信息流汇总
  -> 章节概要
  -> 集场一体 / 单集概要
  -> 场次概要
  -> 分块规划
  -> 视频提示词
  -> 视频生成页面
```

## 主线信息流

| 信息流 | 含义 | 主要终点 |
|---|---|---|
| 剧本文字真源 | 集、场、块的原文片段 | 视频提示词输入、人工核对 |
| 剧情节奏 | 对剧情推进、信息释放、节奏位置的归纳 | 分块规划、视频提示词参考 |
| 角色状态 | 身份、处境、关系、认知、可见状态 | 资产版本判断、场/块状态承接 |
| 资产引用 | 资产主体和剧情版本 ID | 参考资产区、后续视频装配 |
| 空间状态 | 场域、人物分布、活动路径 | 分块规划、视频提示词 |
| 视觉影调 | 时间、天气、光影、影调 | 分块规划、视频提示词 |
| 连续性 | 跨集/跨场视觉状态继承或有依据推论 | 下一级信息流、资产版本判断 |

## 全剧层

| 节点 | 输出字段 | 下游读取 |
|---|---|---|
| 剧情结构图 | `series_narrative` | 全剧信息流汇总 |
| 剧情结构图 | `chapter_map` | 后端选择章节、全剧信息流汇总、章节概要 |
| 角色状态图 | `character_flows` | 全剧信息流汇总、章节概要 |
| 视觉资产状态图 | `visual_continuities` | 全剧信息流汇总、章节概要 |
| 视觉资产状态图 | `space_flows` | 全剧信息流汇总、章节概要 |
| 视觉资产状态图 | `visual_tone_flows` | 全剧信息流汇总、章节概要 |
| 全剧信息流汇总 | `series_flow` | 章节概要 |
| 全剧信息流汇总 | `chapter_map` | 后端章节选择、章节概要 |

`series_summary` 由后端机械合并，不调用 LLM。

## 章节层

产生文件：`artifacts/story_workflow/chapter_summary/chapter_summary_XX.json`

| 字段 | 用途 | 下游 |
|---|---|---|
| `chapter_id` | 章节定位 | 后端读取、页面标签 |
| `chapter_source_scope` | 当前章节范围说明 | 页面审阅 |
| `episode_range` | 覆盖集数 | 后端选择章节、集场一体 |
| `chapter_flow.narrative` | 本章剧情节奏归纳 | 集场一体 / 单集概要 |
| `chapter_flow.character_state` | 本章角色状态变化 | 集场一体 / 单集概要 |
| `chapter_flow.asset_refs` | 本章重要资产和版本提醒 | 集场一体 / 单集概要 |
| `chapter_flow.space_state` | 本章空间状态 | 集场一体 / 单集概要 |
| `chapter_flow.visual_tone` | 本章视觉影调 | 集场一体 / 单集概要 |
| `chapter_flow.continuity` | 本章跨集视觉连续性 | 集场一体 / 单集概要、资产判断 |
| `episode_outline` | 每集在本章里的定位 | 集场一体 / 单集概要 |
| `review_notes` | 人工审阅 | 页面审阅 |

## 集场层

竖屏短剧默认使用集场一体。

### 集场一体输出

| 字段 | 用途 | 下游 |
|---|---|---|
| `episode_id` | 集定位 | 页面、写入路径 |
| `episode_position_note` | 本集在章节中的短位置说明 | 页面审阅 |
| `scene_summaries` | 本集所有场次概要 | 后端拆成当前场 `scene_summary` |
| `review_notes` | 人工审阅 | 页面审阅 |

### 场次概要输出

产生文件：`artifacts/story_workflow/scene_summary/EPXX_SCXX.json`

| 字段 | 用途 | 下游 |
|---|---|---|
| `episode_id` | 集定位 | 分块规划、页面 |
| `scene_id` | 场定位 | 分块规划、页面 |
| `scene_source_scope` | 当前场范围说明 | 页面审阅 |
| `scene_flow.narrative` | 场级剧情节奏 | 分块规划、视频提示词 |
| `scene_flow.character_state` | 场级角色状态 | 分块规划、视频提示词 |
| `scene_flow.asset_refs` | 场级资产引用 | 分块规划、视频提示词 |
| `scene_flow.space_state` | 场级空间状态 | 分块规划、视频提示词 |
| `scene_flow.visual_tone` | 场级视觉影调 | 分块规划、视频提示词 |
| `scene_flow.continuity` | 场内需继承的视觉状态 | 分块规划、视频提示词 |
| `review_notes` | 人工审阅 | 页面审阅 |

## 分块规划

产生文件：`artifacts/story_workflow/storyboard_design/EPXX_SCXX.json`

| 字段 | 用途 | 下游 |
|---|---|---|
| `episode_id` | 集定位 | 视频提示词、页面 |
| `scene_id` | 场定位 | 视频提示词、页面 |
| `block_max_seconds` | 当前块时长上限 | 页面、视频提示词参考 |
| `video_blocks[].block_id` | 块定位 | 视频提示词、视频生成页面 |
| `video_blocks[].source_text` | 块级剧本文字真源 | 视频提示词、人工核对 |
| `video_blocks[].estimated_seconds` | 块估时 | 视频生成页面、提示词正文参考 |
| `video_blocks[].end_state` | 块结束状态 | 下一个块、单块返修 |
| `video_blocks[].flow_overrides` | 相对场级信息流的块级补充 | 视频提示词 |

分块规则、切块理由、台词估时辅助不进入主产物字段。

## 视频提示词

产生文件：`artifacts/story_workflow/video_prompt/EPXX_SCXX.json`

| 字段 | 用途 | 下游 |
|---|---|---|
| `episode_id` | 集定位 | 视频生成页面 |
| `scene_id` | 场定位 | 视频生成页面 |
| `video_prompts[].block_id` | 绑定视频块 | 视频生成页面、返修保存 |
| `video_prompts[].prompt` | 中文动态视频提示词 | 视频生成页面、后续视频 API |
| `video_prompts[].asset_refs` | 当前提示词使用的资产引用 | 参考资产区、后续视频装配 |

视频提示词产物不保存 `source_text`、`status`、`reference_image_paths`、`video_path`。这些分别属于分块规划、任务记录、资产装配层和视频生成记录。
