export const backendPromptStageCopy: Record<string, { title: string; description: string }> = {
  script_check: { title: "剧本轻度校检", description: "检查标点、场次、名称、断行等问题。" },
  script_split: { title: "合集分集规则", description: "识别全集剧本里的分集边界。" },
  asset_extract_characters: { title: "角色资产识别", description: "从剧本文本提取角色资产候选。" },
  asset_extract_scenes: { title: "场景资产识别", description: "从剧本文本提取空间、场景资产候选。" },
  asset_extract_props: { title: "道具资产识别", description: "从剧本文本提取关键道具资产候选。" },
  story_workflow_story_map: { title: "剧情地图", description: "提取剧情大纲、章节地图和关键转折。" },
  story_workflow_character_summary: { title: "角色概要", description: "提取角色功能、身份视觉阶段、关系变化和认知状态。" },
  story_workflow_continuity: { title: "信息连续性", description: "提取伏笔、母题和跨集状态风险。" },
  story_workflow_series_summary: { title: "全集概要", description: "由后端机械合并剧情地图、角色概要、信息连续性，不做剧情判断。" },
  story_workflow_chapter_summary: { title: "章节概要", description: "生成章节任务和每集标题/一句话梗概。" },
  story_workflow_episode_summary: { title: "单集概要", description: "明确本集任务、情绪、钩子和镜头强调点。" },
  story_workflow_episode_summary_integrated: { title: "集场一体", description: "一次调用同时生成单集概要和场次概要。" },
  story_workflow_scene_summary: { title: "场次概要", description: "补足场内调度、潜台词和连续性边界。" },
  story_workflow_storyboard_design: { title: "分块规划", description: "按场拆成可生产的视频生成块。" },
  story_workflow_video_prompt: { title: "视频提示词", description: "把视频生成块转换为视频模型提示词草案。" },
};

export function getBackendPromptTitle(stage: string) {
  return backendPromptStageCopy[stage]?.title ?? stage;
}

export function getBackendPromptDescription(stage: string) {
  return backendPromptStageCopy[stage]?.description ?? "本地规则文件。";
}
