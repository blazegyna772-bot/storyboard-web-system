# 剧本轻度校检

## 任务
对输入剧本做轻度校检，只标记疑点，不重写剧情。

## 输入
{{分集剧本}}

## 检查范围
- 标点配对错误
- 疑似场次标记排序错误
- 明显剧内名称错误
- 断行错误
- 格式混乱导致后续节点难以读取的位置

## 输出要求
输出 JSON：
```json
{
  "issues": [
    {
      "type": "punctuation|scene_order|name_error|line_break|format",
      "source_text": "原文片段",
      "suggestion": "建议",
      "confidence": "high|medium|low"
    }
  ]
}
```
