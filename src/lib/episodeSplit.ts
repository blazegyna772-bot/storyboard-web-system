import type { ScriptAnalysis } from "./storyboard";

export interface EpisodeSplitItem {
  episodeNumber: number;
  title: string;
  text: string;
}

export interface EpisodeSplitPreviewData {
  episodes: EpisodeSplitItem[];
  warnings: string[];
}

export interface EpisodeSplitDraft {
  fileName: string;
  sourceText: string;
  customRule: string;
  preview: EpisodeSplitPreviewData;
}

export const defaultEpisodeSplitRules = [
  "^\\s*第\\s*([0-9０-９]+)\\s*集(?:\\s+.*)?$",
  "^\\s*第\\s*([一二三四五六七八九十百零〇两]+)\\s*集(?:\\s+.*)?$",
  "^\\s*第\\s*([0-9０-９]+)\\s*话(?:\\s+.*)?$",
  "^\\s*第\\s*([一二三四五六七八九十百零〇两]+)\\s*话(?:\\s+.*)?$",
  "^\\s*EP\\s*([0-9０-９]+)(?:\\s+.*)?$",
  "^\\s*E\\s*([0-9０-９]+)(?:\\s+.*)?$",
  "^\\s*Episode\\s*([0-9０-９]+)(?:\\s+.*)?$",
  "^\\s*([0-9０-９]+)\\s*[\\.、-]?\\s*集(?:\\s+.*)?$",
];

export function splitScriptIntoEpisodes(script: string, customRule: string): EpisodeSplitPreviewData {
  const normalized = script.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { episodes: [], warnings: ["当前没有剧本文本。"] };

  const ruleTexts = [...defaultEpisodeSplitRules, customRule.trim()].filter(Boolean);
  const rules = ruleTexts.flatMap((ruleText) => {
    try {
      return [new RegExp(ruleText, "i")];
    } catch {
      return [];
    }
  });
  const lines = normalized.split("\n");
  const starts: Array<{ lineIndex: number; title: string; episodeNumber: number }> = [];

  lines.forEach((line, lineIndex) => {
    for (const rule of rules) {
      const match = line.match(rule);
      if (!match) continue;
      const episodeNumber = parseEpisodeMarkerNumber(match[1]) || starts.length + 1;
      starts.push({ lineIndex, title: line.trim(), episodeNumber });
      return;
    }
  });

  if (!starts.length) {
    return {
      episodes: [{ episodeNumber: 1, title: "未识别分集标记", text: normalized }],
      warnings: ["未识别到分集开始标记，请添加自定义分集规则后重新预览。"],
    };
  }

  const episodes = starts.map((start, index) => {
    const endLineIndex = starts[index + 1]?.lineIndex ?? lines.length;
    return {
      episodeNumber: start.episodeNumber,
      title: start.title,
      text: lines.slice(start.lineIndex, endLineIndex).join("\n").trim(),
    };
  });
  const warnings = buildEpisodeSplitWarnings(episodes);
  return { episodes, warnings };
}

export function ensureEpisodeHeading(text: string, episodeNumber: number) {
  const trimmed = text.trim();
  const preview = splitScriptIntoEpisodes(trimmed, "");
  if (preview.episodes.length === 1 && preview.episodes[0]?.title !== "未识别分集标记") return normalizeEpisodeForStorage(preview.episodes[0]);
  return `第${episodeNumber}集\n${trimmed}`;
}

export function formatEpisodeSplitPreview(preview: EpisodeSplitPreviewData) {
  return preview.episodes.map(normalizeEpisodeForStorage).filter(Boolean).join("\n\n");
}

export function serializeAnalysisScript(analysis: ScriptAnalysis) {
  return analysis.episodes
    .map((episode) => episode.sourceText.trim())
    .filter(Boolean)
    .join("\n\n");
}

export function replaceEpisodeSourceText(analysis: ScriptAnalysis, episodeId: string, nextText: string) {
  return analysis.episodes
    .map((episode) => (episode.episodeId === episodeId ? nextText : episode.sourceText).trim())
    .filter(Boolean)
    .join("\n\n");
}

function buildEpisodeSplitWarnings(episodes: EpisodeSplitItem[]) {
  const warnings: string[] = [];
  episodes.forEach((episode, index) => {
    const expected = index + 1;
    if (episode.episodeNumber !== expected) {
      warnings.push(`第 ${expected} 段识别为 EP${String(episode.episodeNumber).padStart(2, "0")}，可能存在缺集或标记异常。`);
    }
    if (episode.text.length < 80) {
      warnings.push(`${episode.title} 文本较短，建议复核是否切分错误。`);
    }
  });
  return warnings;
}

function parseEpisodeMarkerNumber(value: string | undefined) {
  if (!value) return 0;
  const normalized = value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return chineseNumberToInt(normalized);
}

function chineseNumberToInt(value: string): number {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value === "十") return 10;
  const hundredIndex = value.indexOf("百");
  if (hundredIndex >= 0) {
    const hundreds = digits[value[hundredIndex - 1]] || 1;
    return hundreds * 100 + chineseNumberToInt(value.slice(hundredIndex + 1));
  }
  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digits[value[tenIndex - 1]] || 1;
    const ones = digits[value[tenIndex + 1]] || 0;
    return tens * 10 + ones;
  }
  return digits[value] ?? 0;
}

function normalizeEpisodeForStorage(episode: EpisodeSplitItem) {
  const text = episode.text.trim();
  if (!text) return "";
  const lines = text.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  if (/^第\s*[一二三四五六七八九十百\d]+\s*集/.test(firstLine)) return text;
  const canonicalTitle = `第${episode.episodeNumber}集`;
  const titleSuffix = firstLine && firstLine !== "未识别分集标记" ? ` ${firstLine}` : "";
  return [canonicalTitle + titleSuffix, ...lines.slice(1)].join("\n").trim();
}
