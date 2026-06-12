import { asArray, asRecord, textValue } from "./valueFormat";

export function videoBlockId(group: Record<string, unknown> | undefined): string {
  if (!group) return "";
  return textValue(group.block_id);
}

export function videoPromptItems(output: unknown): Record<string, unknown>[] {
  const data = asRecord(output);
  return asArray(data.video_prompts).map(asRecord);
}

export function buildVideoBlocksFromPlan(output: unknown): Record<string, unknown>[] {
  const data = asRecord(output);
  return asArray(data.video_blocks).map((blockValue, index) => {
    const block = asRecord(blockValue);
    const blockId = textValue(block.block_id, `VB${String(index + 1).padStart(3, "0")}`);
    const flowOverrides = asRecord(block.flow_overrides);
    return {
      block_id: blockId,
      duration_seconds: block.estimated_seconds || block.duration_seconds,
      source_text: block.source_text,
      end_state: block.end_state,
      prompt: "",
      asset_refs: flowOverrides.asset_refs || block.asset_refs,
    };
  });
}

export function mergeVideoBlocksWithPrompts(blockGroups: Record<string, unknown>[], promptGroups: Record<string, unknown>[]) {
  if (!blockGroups.length) return promptGroups;
  const promptByBlockId = new Map(promptGroups.map((group) => [videoBlockId(group), group]));
  return blockGroups.map((block) => {
    const prompt = promptByBlockId.get(videoBlockId(block));
    return prompt
      ? {
          ...prompt,
          ...block,
          prompt: prompt.prompt,
        }
      : block;
  });
}
