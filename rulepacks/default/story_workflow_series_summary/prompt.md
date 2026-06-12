# 全剧信息流汇总

当前节点由后端程序机械合并 剧情结构图/角色状态图/视觉资产状态图 生成，不默认调用 LLM。

## 程序合并原则

- 不理解剧情。
- 不判断冲突。
- 不重写内容。
- 不排序筛选。
- 只把上游固定字段搬运到统一入口，供章节概要读取。

## 输出字段

```json
{
  "series_flow": {
    "narrative": "",
    "character_state": "",
    "asset_refs": [],
    "space_state": "",
    "visual_tone": "",
    "continuity": []
  },
  "chapter_map": [],
  "review_notes": []
}
```

## 字段来源

- `series_flow.narrative`：来自剧情结构图 `series_narrative`。
- `series_flow.character_state`：来自角色状态图 `character_flows`。
- `series_flow.asset_refs`：当前默认空数组，资产真源由资产流程维护。
- `series_flow.space_state`：来自视觉资产状态图 `space_flows`。
- `series_flow.visual_tone`：来自视觉资产状态图 `visual_tone_flows`。
- `series_flow.continuity`：来自视觉资产状态图 `visual_continuities`。
- `chapter_map`：来自剧情结构图。
- `review_notes`：合并上游审阅提醒。

只输出 JSON。
