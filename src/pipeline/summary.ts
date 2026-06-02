import type { OutputAdapter, PipelineConfig, PipelineRunSummary } from "./types";

export function summarizePipeline(config: PipelineConfig, adapter: OutputAdapter | undefined): PipelineRunSummary {
  return {
    totalStages: config.stages.length,
    doneStages: config.stages.filter((stage) => stage.status === "done").length,
    blockedStages: config.stages.filter((stage) => stage.status === "blocked").length,
    llmStages: config.stages.filter((stage) => stage.executor === "llm").length,
    ruleStages: config.stages.filter((stage) => stage.executor === "rule").length,
    finalStages: config.stages.filter((stage) => stage.artifactRole === "final").length,
    supportStages: config.stages.filter((stage) => stage.artifactRole === "support").length,
    outputFiles: adapter?.files ?? [],
  };
}
