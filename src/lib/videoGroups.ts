import { asArray, asRecord, textValue } from "./valueFormat";

export function videoGroupStatusText(value: unknown) {
  const status = textValue(value, "draft");
  if (status === "done") return "已完成";
  if (status === "running") return "生成中";
  if (status === "error") return "失败";
  return "待生成";
}

export function videoBlockId(group: Record<string, unknown> | undefined): string {
  if (!group) return "";
  return textValue(group.block_id || group.group_id);
}

export function buildVideoGroupsFromBlockPlan(output: unknown): Record<string, unknown>[] {
  const data = asRecord(output);
  return asArray(data.video_blocks).map((blockValue, index) => {
    const block = asRecord(blockValue);
    const blockId = textValue(block.block_id, `VB${String(index + 1).padStart(3, "0")}`);
    return {
      group_id: blockId,
      block_id: blockId,
      duration_seconds: block.duration_seconds,
      source_text: block.source_text,
      prompt: "",
      asset_refs: block.asset_refs,
      reference_image_paths: [],
      status: "draft",
      video_path: "",
    };
  });
}

export function mergeVideoBlockGroups(blockGroups: Record<string, unknown>[], promptGroups: Record<string, unknown>[]) {
  if (!blockGroups.length) return promptGroups;
  const promptByBlockId = new Map(promptGroups.map((group) => [videoBlockId(group), group]));
  return blockGroups.map((block) => {
    const prompt = promptByBlockId.get(videoBlockId(block));
    return prompt
      ? {
          ...prompt,
          ...block,
          prompt: prompt.prompt,
          reference_image_paths: prompt.reference_image_paths,
          status: prompt.status,
          video_path: prompt.video_path,
          video_paths: prompt.video_paths,
        }
      : block;
  });
}
