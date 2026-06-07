# 追踪矩阵

| 需求 | 当前设计 | 当前代码 | 状态 | 备注 |
|---|---|---|---|---|
| R-001 剧本源头确认 | 剧本校验页 + 分集确认 | `src/lib/scriptQuality.ts`, `ScriptWorkspace` | 部分完成 | 已有前端轻校检和分集确认；缺人工确认 diff |
| R-002 长文本处理 | 后端工作流长文本策略 | 未实现 | 未完成 | 需要任务队列、分块和节点级输入摘要 |
| R-003 资产真源 | 资产审阅页 | `server/assets/*`, `src/lib/assetApi.ts`, `AssetReviewView` | 部分完成 | 已有 records/true_sources、候选图和真源图；资产抽取后续再优化 |
| R-004 资产生图工作台 | 资产审阅页生图操作区 | `server/image_providers/*`, `server/assets/service.py`, `AssetCardList` | 部分完成 | 已接本地后端生图、导入、候选、列为真源；视频阶段衔接后续补 |
| R-005 分镜阶段中间产物 | 分镜工作流节点产物 | `server/story_workflow/*`, `src/lib/storyWorkflowApi.ts` | 部分完成 | 已建立语义化节点、Prompt 文件和 artifact 落点 |
| R-006 分镜生成 | 分镜统筹页 + 分块规划 | `StoryboardPlanningView`, `server/story_workflow/service.py`, `rulepacks/default/story_workflow_storyboard_design/prompt.md` | 部分完成 | 已有真实 LLM 调用骨架；待做输出 schema 和人工编辑保存 |
| R-007 风格与规则包 | Rulepack + 流程配置页 | `server/rulepacks/*`, `rulepacks/default/*`, `PipelineConfigView` | 部分完成 | 已能扫描后端 rulepack；待做项目类型工作流配置 |
| R-008 输出适配 | 视频生成结果导出 | 未实现 | 未完成 | 视频 API 和多平台交付适配留到后续 |
| R-009 可追踪可溯源 | 文档体系 | `docs/*` | 已启动 | 后续开发必须维护 |
| R-010 最终产物导向 | 分镜工作流节点与视频块产物 | `server/story_workflow/*`, `rulepacks/default/story_workflow_*` | 部分完成 | 已形成节点产物边界；待 schema 强制 |
| R-011 工作台 UI 布局 | UI 布局方案 | `docs/ui-layout.md`, `src/styles.css` | 原型完成 | 需继续细化资产/分镜页面 |
| R-012 人类审阅与操作齐备性 | 页面任务边界 | `AssetReviewView`, `StoryPlanningView`, `StoryboardPlanningView`, `VideoGenerationView`, `TaskRecordView` | 部分完成 | 一级页面已按连续操作重构；仍需节点产物编辑和任务队列 |
| R-013 中间产物最小有效原则 | 分镜工作流节点边界 | `docs/vertical-short-drama-workflow.md`, `rulepacks/default/story_workflow_*/prompt.md` | 部分完成 | 已在 Prompt 和架构中明确禁区；待 schema 强制 |
| R-014 基础工作台壳子 | 顶栏/左导航/右工具抽屉 | `TopBar`, `AppNav`, `ToolDrawer`, `src/styles.css` | 原型完成 | 左侧可收起；右侧覆盖式抽屉 |
| R-015 项目管理与保存 | 本地项目仓库 + 保存版本 | `src/lib/projectStore.ts`, `TopBar`, `ToolDrawer` | 部分完成 | 已支持本地多项目和版本摘要；缺后端、diff、回滚 |
| R-016 执行反馈与开发日志 | 底部日志台 + 任务记录页 | `DevLogPanel`, `TaskRecordView`, `server/logs/*` | 部分完成 | 已接后端 LLM/生图日志；缺异步队列日志 |
| R-017 Workflow 执行骨架 | 分镜工作流节点运行记录 | `server/story_workflow/service.py`, `server/api/story_workflow.py`, `src/lib/storyWorkflowApi.ts` | 部分完成 | 已接单节点/批量运行、后端 LLM 调用和节点产物保存；测试项目已实跑分镜工作流 |
| R-018 Artifact Store | 项目内节点产物存储 | `artifacts/story_workflow/{node}.json`, `artifacts/story_workflow/{node}.meta.json`, `server/story_workflow/models.py` | 部分完成 | 主 JSON 只保存业务 output；状态、rawText、error、输入摘要放 sidecar meta 或日志；待统一到更通用 Artifact Store |
| R-019 锁定/重跑模型 | 分镜工作流节点重跑边界 | `docs/architecture.md`, `docs/decisions.md` | 设计确认 | 不设置独立块级节点；后续如需小块重跑作为分块规划内部能力 |
| R-020 任务状态模型 | 后端运行日志 + 生图任务记录 | `server/logs/*`, `TaskRecordView` | 部分完成 | 已显示 LLM/生图任务记录；缺通用异步任务队列 |
| R-021 模型执行器可替换 | 后端 LLM 代理 + rulepack Prompt | `server/llm/service.py`, `server/settings/*`, `server/rulepacks/*` | 部分完成 | 已接 DeepSeek/OpenAI-compatible；待节点级模型参数配置 |
| R-022 资产生图 | 图片 providerpack、候选图、真源图 | `providerpacks/`, `server/image_providers/*`, `server/assets/service.py` | 部分完成 | 已接 Geeknow 聚合站配置和候选/真源目录 |
| R-023 竖屏短剧 LLM 分层工作流 | 分镜工作流分层需求设计与工程骨架 | `docs/vertical-short-drama-workflow.md`, `server/story_workflow/*`, `rulepacks/default/story_workflow_*/prompt.md` | 部分完成 | 全剧统筹拆为剧情地图、角色概要、信息连续性；章节概要负责标题/梗概；测试项目 `测试0011` 已跑完分镜工作流 |
| R-024 一级页面重构 | 剧本统筹/资产审阅/分镜统筹/视频生成页面边界 | `docs/product-design.md`, `docs/ui-layout.md`, `docs/decisions.md`, `src/main.tsx` | 部分完成 | 辅助信息一级页取消；剧本统筹/分镜统筹/视频生成已可查看节点状态、运行和保存产物 |

## 下一步追踪目标

补 分镜工作流 输出 schema、节点产物人工编辑保存、异步任务状态，以及后续 分块规划/视频提示词 与资产真源的正式衔接。
