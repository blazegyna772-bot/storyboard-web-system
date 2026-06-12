export const backendPromptStageCopy: Record<string, { title: string; description: string }> = {
  script_check: { title: "剧本轻度校检", description: "检查标点、场次、名称、断行等问题。" },
  script_split: { title: "合集分集规则", description: "识别全集剧本里的分集边界。" },
  asset_extract_characters: { title: "角色资产识别", description: "从剧本文本提取角色资产候选。" },
  asset_extract_scenes: { title: "场景资产识别", description: "从剧本文本提取空间、场景资产候选。" },
  asset_extract_props: { title: "道具资产识别", description: "从剧本文本提取关键道具资产候选。" },
  story_workflow_story_map: { title: "剧情结构图", description: "按生产分片切章节，并提取全剧结构。" },
  story_workflow_character_summary: { title: "角色状态图", description: "提取角色身份、处境、关系和认知状态变化。" },
  story_workflow_continuity: { title: "视觉资产状态图", description: "提取线索道具、重要空间和视觉影调的跨集状态。" },
  story_workflow_series_summary: { title: "全剧信息流汇总", description: "由后端机械合并全剧基础信息流，不做剧情判断。" },
  story_workflow_chapter_summary: { title: "章节概要", description: "生成章节级信息流、集级定位和跨集视觉连续性。" },
  story_workflow_episode_summary: { title: "单集概要", description: "集场分开模式下生成单集级信息流。" },
  story_workflow_episode_summary_integrated: { title: "集场一体", description: "竖屏短剧一次调用输出本集所有场次信息流。" },
  story_workflow_scene_summary: { title: "场次概要", description: "生成场级默认信息流快照。" },
  story_workflow_storyboard_design: { title: "分块规划", description: "按场拆成视频生成块，并输出块级补充信息。" },
  story_workflow_video_prompt: { title: "视频提示词", description: "把视频生成块转换为中文动态视频提示词。" },
};

export function getBackendPromptTitle(stage: string) {
  return backendPromptStageCopy[stage]?.title ?? stage;
}

export function getBackendPromptDescription(stage: string) {
  return backendPromptStageCopy[stage]?.description ?? "本地规则文件。";
}
