import JSZip from "jszip";
import { csvFromPrompts, exportEpisodeBundle, formatJson } from "../lib/storyboard";
import type { EpisodeResult, ScriptAnalysis } from "../lib/storyboard";

export function writeEpisodeToZip(zip: JSZip, episode: EpisodeResult) {
  const bundle = exportEpisodeBundle(episode);
  const root = zip.folder(episode.episodeId);
  root?.folder("input")?.file("script.md", episode.sourceText);
  root?.folder("true_sources")?.file("assets.json", formatJson(bundle.assets));
  root?.folder("true_sources")?.file("shots.json", formatJson(bundle.shots));
  root?.folder("true_sources")?.file("prompts.json", formatJson(bundle.prompts));
  root?.folder("delivery")?.file(`${episode.episodeId}_grouped_prompts.csv`, csvFromPrompts(episode.prompts));
}

export function writeProjectToZip(zip: JSZip, analysis: ScriptAnalysis) {
  zip.file("project_analysis.json", formatJson(analysis));
  for (const episode of analysis.episodes) writeEpisodeToZip(zip, episode);
}
