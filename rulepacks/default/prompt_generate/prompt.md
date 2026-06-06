# 视频提示词生成

## 任务
基于已确认分镜、资产和空间时序生成视频提示词。

## 输入
分镜：
{{分镜}}

资产：
{{资产}}

空间时序：
{{空间时序}}

## 输出
```json
{
  "prompts": [
    {
      "shot_id": "S001",
      "image_prompt": "可选",
      "video_prompt": "视频生成提示词",
      "asset_refs": [],
      "continuity_constraints": []
    }
  ]
}
```
