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

export interface EpisodeSplitRule {
  id: string;
  name: string;
  pattern: string;
  description: string;
  enabled: boolean;
}

const episodeSplitRulesKey = "episode-split-rules-v1";

export const defaultEpisodeSplitRules: EpisodeSplitRule[] = [
  {
    id: "zh-number-episode",
    name: "第 N 集",
    pattern: "^\\s*第\\s*([0-9０-９]+)\\s*集(?:\\s+.*)?$",
    description: "匹配“第12集”“第 12 集 标题”。",
    enabled: true,
  },
  {
    id: "zh-cn-episode",
    name: "第 中文数 集",
    pattern: "^\\s*第\\s*([一二三四五六七八九十百零〇两]+)\\s*集(?:\\s+.*)?$",
    description: "匹配“第十二集”。",
    enabled: true,
  },
  {
    id: "zh-number-chapter",
    name: "第 N 话",
    pattern: "^\\s*第\\s*([0-9０-９]+)\\s*话(?:\\s+.*)?$",
    description: "匹配“第12话”。",
    enabled: false,
  },
  {
    id: "ep-number",
    name: "EP N",
    pattern: "^\\s*EP\\s*([0-9０-９]+)(?:\\s+.*)?$",
    description: "匹配“EP12”。",
    enabled: false,
  },
  {
    id: "e-number",
    name: "E N",
    pattern: "^\\s*E\\s*([0-9０-９]+)(?:\\s+.*)?$",
    description: "匹配“E12”。",
    enabled: false,
  },
];

export function loadEpisodeSplitRules(): EpisodeSplitRule[] {
  const raw = localStorage.getItem(episodeSplitRulesKey);
  if (!raw) return defaultEpisodeSplitRules;
  try {
    return mergeEpisodeSplitRules(normalizeEpisodeSplitRules(JSON.parse(raw)));
  } catch {
    localStorage.removeItem(episodeSplitRulesKey);
    return defaultEpisodeSplitRules;
  }
}

export function saveEpisodeSplitRules(rules: EpisodeSplitRule[]) {
  localStorage.setItem(episodeSplitRulesKey, JSON.stringify(mergeEpisodeSplitRules(normalizeEpisodeSplitRules(rules))));
}

export function normalizeEpisodeSplitRules(value: unknown): EpisodeSplitRule[] {
  if (!Array.isArray(value)) return defaultEpisodeSplitRules;
  const normalized = value
    .map((rule, index) => {
      if (!rule || typeof rule !== "object") return null;
      const item = rule as Partial<EpisodeSplitRule>;
      return {
        id: item.id || `episode-rule-${index + 1}`,
        name: item.name || `规则 ${index + 1}`,
        pattern: item.pattern || "",
        description: item.description || "",
        enabled: item.enabled !== false,
      };
    })
    .filter((rule): rule is EpisodeSplitRule => Boolean(rule?.pattern));
  return normalized.length ? normalized : defaultEpisodeSplitRules;
}

export function splitScriptIntoEpisodes(script: string, rulesInput: EpisodeSplitRule[] | string): EpisodeSplitPreviewData {
  const normalized = script.replace(/\r\n?/g, "\n").trim();
  if (!normalized) return { episodes: [], warnings: ["当前没有剧本文本。"] };

  const ruleTexts = normalizeSplitRuleInput(rulesInput)
    .filter((rule) => rule.enabled && rule.pattern.trim())
    .map((rule) => rule.pattern.trim());
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
  const preview = splitScriptIntoEpisodes(trimmed, defaultEpisodeSplitRules);
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
  const seen = new Set<number>();
  const episodeNumbers = episodes.map((episode) => episode.episodeNumber).filter((number) => number > 0);
  const minEpisodeNumber = episodeNumbers.length ? Math.min(...episodeNumbers) : 0;
  const maxEpisodeNumber = episodeNumbers.length ? Math.max(...episodeNumbers) : 0;
  const averageLength = episodes.length ? episodes.reduce((sum, episode) => sum + episode.text.length, 0) / episodes.length : 0;

  if (minEpisodeNumber === 1 && maxEpisodeNumber > 0) {
    const missing = [];
    for (let number = 1; number <= maxEpisodeNumber; number += 1) {
      if (!episodeNumbers.includes(number)) missing.push(number);
    }
    if (missing.length) warnings.push(`缺少第 ${missing.join("、")} 集。`);
  }

  episodes.forEach((episode, index) => {
    const expected = index + 1;
    if (seen.has(episode.episodeNumber)) {
      warnings.push(`${episode.title} 与前文集号重复。`);
    }
    seen.add(episode.episodeNumber);
    if (episode.episodeNumber !== expected) {
      warnings.push(`第 ${expected} 段识别为第 ${episode.episodeNumber} 集，集号顺序异常。`);
    }
    const charCount = episode.text.length;
    if (charCount < 80) {
      warnings.push(`${episode.title} 文本过短，仅 ${charCount} 字，建议复核是否切分错误。`);
    }
    if (charCount > 8000) {
      warnings.push(`${episode.title} 文本过长，${charCount.toLocaleString()} 字，建议复核是否合并了多集。`);
    }
    if (averageLength >= 300 && charCount < averageLength * 0.35) {
      warnings.push(`${episode.title} 字数明显低于平均值，建议复核边界。`);
    }
    if (averageLength >= 300 && charCount > averageLength * 2.4) {
      warnings.push(`${episode.title} 字数明显高于平均值，建议复核边界。`);
    }
  });
  return warnings;
}

function normalizeSplitRuleInput(input: EpisodeSplitRule[] | string) {
  if (Array.isArray(input)) return mergeEpisodeSplitRules(normalizeEpisodeSplitRules(input));
  const customRule = input.trim();
  return customRule ? [...defaultEpisodeSplitRules, { id: "custom", name: "自定义规则", pattern: customRule, description: "", enabled: true }] : defaultEpisodeSplitRules;
}

function mergeEpisodeSplitRules(savedRules: EpisodeSplitRule[]) {
  const savedById = new Map(savedRules.map((rule) => [rule.id, rule]));
  const mergedDefaults = defaultEpisodeSplitRules.map((rule) => ({ ...rule, ...savedById.get(rule.id), id: rule.id }));
  const customRules = savedRules.filter((rule) => !defaultEpisodeSplitRules.some((defaultRule) => defaultRule.id === rule.id));
  return [...mergedDefaults, ...customRules];
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
