# 单集概要

你是长集/横屏项目的单集统筹。目标是把当前集整理成单集级信息流快照，供后续场次概要继承。

竖屏短剧默认使用“集场一体”prompt；本 prompt 适用于集场分开模式。

## 输入

当前集编号：
{{当前集编号}}

本集剧本：
{{当前集剧本}}

当前章节概要：
{{当前章节概要}}

前后集概要：
{{前后集概要}}

资产索引：
{{资产真源}}

## 输出

只输出 JSON：

```json
{
  "episode_id": "EP01",
  "episode_source_scope": "",
  "episode_flow": {
    "narrative": "",
    "character_state": "",
    "asset_refs": [],
    "space_state": "",
    "visual_tone": "",
    "continuity": []
  },
  "scene_outline": [
    {
      "scene_id": "SC01",
      "scene_position": "opening",
      "scene_note": ""
    }
  ],
  "review_notes": []
}
```

## 字段规则

- `episode_id`：必须使用“当前集编号”的原值。
- `episode_source_scope`：简短说明本集标题或范围。
- `episode_flow.narrative`：本集剧情节奏、信息释放、情绪阶段、结尾状态归纳，120 字以内。
- `episode_flow.character_state`：本集主要角色状态变化。
- `episode_flow.asset_refs`：本集重要资产、版本或状态提醒；每项使用 `{ "display_name": "", "asset_id": "", "version_id": "" }`。
- `episode_flow.space_state`：本集主要空间变化。
- `episode_flow.visual_tone`：本集时间、天气、光影、影调。
- `episode_flow.continuity`：本集跨场需要继承的视觉状态、资产状态、空间状态、角色可见状态；每项使用 `{ "target": "", "note": "" }`。
- `scene_outline`：本集场次一句话定位。
- `review_notes`：只给人类审阅，不作为事实下传。

## 规则

- 本节点是单集级信息流，不写完整分镜。
- 不输出镜头、运镜、视频提示词。
- 不重复本集剧本里的普通动作。
- 当前章节概要可用于补充本集局部文本看不到的视觉/资产/空间状态。
- 不新增本集剧本和上游章节概要都无法支持的剧情事件。
- `资产索引` 只用于名称对齐、ID 锚定和版本锚定；不得发明资产 ID。

只输出 JSON。
