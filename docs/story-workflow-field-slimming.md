# 分镜工作流字段瘦身设计

本文记录当前 V1 字段边界。目标是减少无效字段，避免 LLM 注意力被噪音分散。

## 核心原则

- 字段只为下游真实使用服务。
- 不为完整性增加字段。
- 程序不解析的内容，不拆成细字段。
- 给 LLM 读的内容，优先用少字段和明确说明。
- 人工审阅信息不混进主线真源。
- 能从上游继承的信息，下游不重复输出。
- 能由程序查出来的信息，不要求 LLM 输出。

## 逐级塌陷

工作流不是全链路实时回滚系统。每一级确认后成为下一级快照。

```text
全集/章节完成 -> 进入集场制作
集场完成 -> 进入分块制作
分块完成 -> 进入视频提示词制作
视频提示词完成 -> 进入视频生成和返修
```

下游局部返修默认只修改当前层和下游，不自动重算上游。

## 全剧层

全剧层收敛为四类产物：

```text
剧情结构图
角色状态图
视觉资产状态图
全剧信息流汇总
```

### 剧情结构图

作用：把全集剧本切成生产章节，并给每章一个简短定位。

分章依据：

- 每章约 10000-20000 字。
- 明显剧情阶段变化。
- 主场域变化。
- 主要人物群体变化。
- 如果没有明显变化，按字数和集数自然切。

### 角色状态图

作用：记录角色因剧情产生的身份、处境、关系、认知、权力位置等阶段变化。

它主要服务资产提取和角色版本判断，不做文学赏析。

### 视觉资产状态图

作用：记录主要线索道具、戏用道具、重要空间、视觉影调状态的跨集变化或继承。

它服务章节概要和资产提取，防止前期短暂出现的资产被当成临时资产漏掉。

## 章节概要

章节概要是章节级信息流快照，给集场一体或单集概要补充当前集局部文本看不到的上层信息。

```json
{
  "chapter_id": "chapter_01",
  "chapter_source_scope": "",
  "episode_range": "EP01-EP04",
  "chapter_flow": {
    "narrative": "",
    "character_state": "",
    "asset_refs": [],
    "space_state": "",
    "visual_tone": "",
    "continuity": []
  },
  "episode_outline": [
    {
      "episode_id": "EP01",
      "episode_position": "opening",
      "episode_note": ""
    }
  ],
  "review_notes": []
}
```

`continuity` 只记录跨集视觉状态、资产状态、空间状态、角色可见状态的变化和继承。可以做有依据的推论，但必须在说明中写“推论”和依据。

示例：

```json
{
  "target": "鱼缸",
  "note": "推论：第1集搬去学校时鱼缸应为盖红布状态；第2集沿用盖红布状态；依据是第3集“揭开鱼缸上的红布”。"
}
```

## 集场一体

竖屏短剧使用独立集场一体 prompt。它不是单集概要 prompt 的精简版。

核心任务：输入当前集剧本，一次性输出本集所有场次的场级信息流。

```json
{
  "episode_id": "EP01",
  "episode_position_note": "",
  "scene_summaries": [
    {
      "episode_id": "EP01",
      "scene_id": "SC01",
      "scene_position": "opening",
      "scene_source_scope": "",
      "scene_flow": {
        "narrative": "",
        "character_state": "",
        "asset_refs": [],
        "space_state": "",
        "visual_tone": "",
        "continuity": []
      },
      "review_notes": []
    }
  ],
  "review_notes": []
}
```

集场一体模式下，核心产物是 `scene_summaries`。

## 场次概要

场次概要是场级默认信息流快照。后续分块和视频提示词默认继承场级信息。

```json
{
  "episode_id": "EP01",
  "scene_id": "SC01",
  "scene_source_scope": "",
  "scene_flow": {
    "narrative": "",
    "character_state": "",
    "asset_refs": [],
    "space_state": "",
    "visual_tone": "",
    "continuity": []
  },
  "review_notes": []
}
```

## 分块规划

分块规划只做两件事：

- 把当前场剧本真源准确切成视频生产块。
- 给每块补充相对场级信息流的特殊变化。

分块规则属于 prompt 和程序辅助，不作为输出字段。

```json
{
  "episode_id": "EP01",
  "scene_id": "SC01",
  "block_max_seconds": 15,
  "video_blocks": [
    {
      "block_id": "VB001",
      "source_text": "",
      "estimated_seconds": 12,
      "end_state": "",
      "flow_overrides": {
        "narrative": "",
        "character_state": "",
        "asset_refs": [],
        "space_state": "",
        "visual_tone": ""
      }
    }
  ]
}
```

不输出 `start_state`、`block_summary`、`scene_base`、`boundary_reason`、`production_beat`、`dialogue_duration_seconds`、`review_risks`。

## 视频提示词

视频提示词分两种模式。

### A 全场模式

用途：首次生成或整场重做。

输入：当前场全部块、本场资产注册表、短上下文、场级信息流、规则包。

输出：当前场全部视频提示词。

### B 单块返修模式

用途：只返修某一个块。

输入：当前块剧本真源、当前场级信息流、本场资产注册表、前后块状态和提示词参考、规则包。

输出：当前块一个视频提示词。

### 保存结构

```json
{
  "episode_id": "EP01",
  "scene_id": "SC01",
  "video_prompts": [
    {
      "block_id": "VB001",
      "prompt": "",
      "asset_refs": [
        {
          "display_name": "团团",
          "asset_id": "char_tuantuan",
          "version_id": "char_tuantuan_yinuzhuang"
        }
      ]
    }
  ]
}
```

不保存 `groups`、`status`、`source_text`、`reference_image_paths`、`video_paths`、`version_label`、`image_variant_id`、`image_path`。

## 资产引用

视频提示词和分块中只引用资产，不保存图片路径。

```json
{
  "display_name": "团团",
  "asset_id": "char_tuantuan",
  "version_id": "char_tuantuan_yinuzhuang"
}
```

图片变体和路径由后续视频装配层根据模型规则选择。
