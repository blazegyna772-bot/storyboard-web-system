# 全集分集检测

## 任务
识别全集剧本中的分集边界，输出候选分集结果，供人工确认。

## 输入
{{全集剧本}}

## 常见分集标记
- 第一集 / 第1集 / 第01集
- EP01 / EP 01 / Episode 01
- 第1话 / 第一话

## 输出要求
只输出 JSON：
```json
{
  "episodes": [
    {
      "episode_id": "EP01",
      "title": "可为空",
      "start_marker": "匹配到的原文标记",
      "start_index": 0,
      "end_index": 1000,
      "confidence": 0.95,
      "warnings": []
    }
  ]
}
```
