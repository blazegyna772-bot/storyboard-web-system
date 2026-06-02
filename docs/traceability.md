# 追踪矩阵

| 需求 | 当前设计 | 当前代码 | 状态 | 备注 |
|---|---|---|---|---|
| R-001 剧本源头确认 | 剧本校验页 + P1 清洗执行器 | `src/lib/scriptQuality.ts`, `src/pipeline/llmExecutor.ts`, `ScriptQualityView` | 部分完成 | 已接 DeepSeek/OpenAI-compatible 调用与 schema；缺人工确认 diff |
| R-002 长文本处理 | Pipeline 长文本策略 | 未实现 | 未完成 | 需要后端、任务队列、分块 |
| R-003 资产真源 | 资产结构 | `src/lib/storyboard.ts` | 部分完成 | 缺版本、锁定图 |
| R-004 资产生图工作台 | 资产生图页 | `AssetImageView` | 原型完成 | 按钮占位，未接生图 |
| R-005 上下文包 | 辅助信息审阅 + P1 03/04 执行器 | `src/lib/contextPack.ts`, `src/pipeline/llmExecutor.ts`, `ContextPackView` | 部分完成 | 已接 DeepSeek/OpenAI-compatible 调用与 schema；缺人工锁定 |
| R-006 分镜生成 | 分镜工作台 | `buildShots`, `EpisodeView` | 部分完成 | 目前规则拆分，不是真分镜规划 |
| R-007 风格与规则包 | Pipeline 抽象 + 流程配置页 | `src/pipeline/*`, `PipelineConfigView` | 原型完成 | 需接真实 executor |
| R-008 输出适配 | ZIP 导出 + Output Adapter | `src/pipeline/exportAdapter.ts`, `src/pipeline/defaults.ts` | 原型完成 | 仍需多平台 adapter |
| R-009 可追踪可溯源 | 文档体系 | `docs/*` | 已启动 | 后续开发必须维护 |
| R-010 最终产物导向 | Pipeline 分层与产物角色 | `src/pipeline/*` | 原型完成 | 需在 executor 层强制执行 |
| R-011 工作台 UI 布局 | UI 布局方案 | `docs/ui-layout.md`, `src/styles.css` | 原型完成 | 需继续细化资产/分镜页面 |
| R-012 人类审阅与操作齐备性 | 页面任务边界 | `AssetImageView`, `ContextPackView`, `StoryboardWorkbench` | 部分完成 | 已补队列、来源/用途、重跑入口；仍需真实任务状态 |
| R-013 辅助信息最小有效原则 | 03/04 页面表达 | `ContextPackView`, `docs/product-design.md` | 部分完成 | 已从“上下文包”改为“辅助信息审阅” |
| R-014 基础工作台壳子 | 顶栏/左导航/右工具抽屉 | `TopBar`, `AppNav`, `ToolDrawer`, `src/styles.css` | 原型完成 | 左侧可收起；右侧覆盖式抽屉 |
| R-015 项目管理与保存 | 本地项目仓库 + 保存版本 | `src/lib/projectStore.ts`, `TopBar`, `ToolDrawer` | 部分完成 | 已支持本地多项目和版本摘要；缺后端、diff、回滚 |
| R-016 执行反馈与开发日志 | 底部日志台 | `DevLogPanel`, `src/pipeline/llmExecutor.ts`, `docs/architecture.md` | 部分完成 | 已接 PipelineRun 和真实调用日志；缺完整 request/response 安全脱敏追踪 |
| R-017 PipelineRun 执行骨架 | 本地管线运行记录 | `src/pipeline/run.ts`, `PipelineConfigView` | 部分完成 | 01/03/04/05 已接异步真实调用；未接任务队列 |
| R-018 Artifact Store | 统一产物存储 | `src/pipeline/artifacts.ts`, `PipelineConfigView` | 部分完成 | 已有产物记录、来源/下游引用和预览；缺完整内容快照 |
| R-019 锁定/重跑模型 | 锁定项和重跑范围 | `src/pipeline/artifacts.ts`, `AssetImageView`, `EpisodeView` | 部分完成 | 已有锁定/解锁和重跑请求；局部 executor 待接入 |
| R-020 任务状态模型 | 待运行/运行中/完成/失败/阻塞/需确认 | `src/pipeline/artifacts.ts`, `PipelineConfigView` | 部分完成 | 已有 TaskRecord；缺异步任务队列 |
| R-021 P1 模型执行器可替换 | Executor / Prompt / Schema 解耦 | `src/pipeline/llmExecutor.ts`, `src/pipeline/prompts.ts`, `src/pipeline/schemas.ts`, `vite.config.js` | 部分完成 | 已接 DeepSeek/OpenAI-compatible 本地代理；缺生产后端 |
| R-022 P2 资产生图 | 图片生成配置、候选图、锁定 | `src/pipeline/imageConfig.ts`, `src/pipeline/imageGeneration.ts`, `AssetImageView`, `vite.config.js` | 部分完成 | 已接 openai-compatible 图片代理；缺真实生产存储 |

## 下一步追踪目标

接 06/07/08 真实 LLM、保存完整 artifact 内容，并补异步任务状态。
