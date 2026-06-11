export interface ScriptIssue {
  id: string;
  ruleId: string;
  level: "错误" | "警告" | "提示";
  category: string;
  message: string;
  line: number;
  excerpt: string;
}

export interface ScriptQualityReport {
  cleanedScript: string;
  issues: ScriptIssue[];
  stats: {
    lines: number;
    characters: number;
    episodes: number;
    dialogueLines: number;
    sceneLines: number;
  };
}

export interface ScriptQualityRule {
  id: string;
  name: string;
  category: string;
  level: ScriptIssue["level"];
  description: string;
  enabled: boolean;
}

const qualityRulesKey = "script-quality-rules-v2";

export const defaultScriptQualityRules: ScriptQualityRule[] = [
  {
    id: "empty-dialogue",
    name: "对白空内容",
    category: "对白",
    level: "错误",
    description: "稳定检查：角色名冒号后没有任何正文内容。",
    enabled: true,
  },
  {
    id: "speaker-colon-spacing",
    name: "角色名冒号空格",
    category: "格式",
    level: "警告",
    description: "稳定检查：角色名和冒号之间存在多余空格。",
    enabled: true,
  },
  {
    id: "duplicate-ending-punctuation",
    name: "标点配对与重复",
    category: "标点",
    level: "提示",
    description: "提示检查：连续重复的句末标点，如“！！”“？？”“。。”；强情绪台词可能合理，默认关闭。",
    enabled: false,
  },
  {
    id: "scene-heading-incomplete",
    name: "场次标题信息不足",
    category: "场景",
    level: "警告",
    description: "稳定检查：场景行只有“场景一”这类标记，缺少地点或时间信息。",
    enabled: true,
  },
  {
    id: "scene-heading-format",
    name: "场次标题格式",
    category: "场次",
    level: "警告",
    description: "稳定检查：形如“1-1 地点 日 外”的场次标题是否包含地点、时间和内外景信息。",
    enabled: true,
  },
  {
    id: "scene-number-sequence",
    name: "场次号连续性",
    category: "场次",
    level: "警告",
    description: "稳定检查：当前集内“1-1、1-2”这类场次号是否重复或跳号。",
    enabled: true,
  },
  {
    id: "scene-episode-ownership",
    name: "场次归属集号",
    category: "场次",
    level: "错误",
    description: "稳定检查：当前集内“集号-场号”的集号是否与本集标题一致。",
    enabled: true,
  },
  {
    id: "empty-scene",
    name: "空场次",
    category: "场次",
    level: "警告",
    description: "稳定检查：场次标题后到下一场之间是否没有正文内容。",
    enabled: true,
  },
  {
    id: "consecutive-duplicate-line",
    name: "连续重复行",
    category: "文本",
    level: "提示",
    description: "稳定检查：相邻两行完全相同且长度足够，可能是复制残留。",
    enabled: true,
  },
  {
    id: "unclosed-brackets-quotes",
    name: "括号/引号未闭合",
    category: "标点",
    level: "警告",
    description: "稳定检查：单行内常见括号、书名号、引号数量不配对。",
    enabled: true,
  },
  {
    id: "illegal-character",
    name: "非法字符",
    category: "格式",
    level: "警告",
    description: "稳定检查：不可见控制字符、替换字符等明显异常字符。",
    enabled: true,
  },
  {
    id: "format-residue",
    name: "格式残留符号",
    category: "格式",
    level: "提示",
    description: "稳定检查：Markdown 代码围栏、分隔线、HTML/XML 标签等明显非剧本文本残留。",
    enabled: true,
  },
  {
    id: "episode-marker-not-at-line-start",
    name: "分集标记位置",
    category: "集数",
    level: "警告",
    description: "稳定检查：集标记没有出现在行首，可能影响自动拆集。",
    enabled: true,
  },
  {
    id: "placeholder-token",
    name: "占位符残留",
    category: "占位符",
    level: "提示",
    description: "稳定检查：TODO、XXX、待补等明显占位文本残留。",
    enabled: true,
  },
];

export function loadScriptQualityRules(): ScriptQualityRule[] {
  const raw = localStorage.getItem(qualityRulesKey);
  if (!raw) return defaultScriptQualityRules;
  try {
    const parsed = JSON.parse(raw) as ScriptQualityRule[];
    if (!Array.isArray(parsed) || !parsed.length) return defaultScriptQualityRules;
    return mergeScriptQualityRules(parsed.map((rule) => ({
      id: rule.id || `rule-${Math.random().toString(36).slice(2, 8)}`,
      name: rule.name || "未命名规则",
      category: rule.category || "自定义",
      level: rule.level || "提示",
      description: rule.description || "",
      enabled: rule.enabled !== false,
    })));
  } catch {
    localStorage.removeItem(qualityRulesKey);
    return defaultScriptQualityRules;
  }
}

export function saveScriptQualityRules(rules: ScriptQualityRule[]) {
  localStorage.setItem(qualityRulesKey, JSON.stringify(mergeScriptQualityRules(rules)));
}

function mergeScriptQualityRules(savedRules: ScriptQualityRule[]) {
  const savedById = new Map(savedRules.map((rule) => [rule.id, rule]));
  const mergedDefaults = defaultScriptQualityRules.map((rule) => ({ ...rule, ...savedById.get(rule.id), id: rule.id }));
  const customRules = savedRules.filter((rule) => !defaultScriptQualityRules.some((defaultRule) => defaultRule.id === rule.id));
  return [...mergedDefaults, ...customRules];
}

export function buildScriptQualityReport(script: string, rules: ScriptQualityRule[] = defaultScriptQualityRules): ScriptQualityReport {
  const normalized = script.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
  const lines = normalized.split("\n");
  const cleanedLines = lines.map(cleanLine);
  const cleanedScript = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n");
  const issues = detectIssues(lines, rules);

  return {
    cleanedScript,
    issues,
    stats: {
      lines: lines.filter(Boolean).length,
      characters: normalized.length,
      episodes: (normalized.match(/^第\s*[一二三四五六七八九十百\d]+\s*集/gm) ?? []).length,
      dialogueLines: lines.filter((line) => /^[\u4e00-\u9fa5]{2,4}\s*[：:]/.test(line.trim())).length,
      sceneLines: lines.filter((line) => /^场景[一二三四五六七八九十\d]+[：:、\s]/.test(line.trim())).length,
    },
  };
}

function cleanLine(line: string) {
  return line
    .trim()
    .replace(/^\s*第\s*(\d+)\s*集\s*$/g, "第$1集")
    .replace(/^([\u4e00-\u9fa5]{2,4})\s*[:：]\s*/g, "$1：")
    .replace(/([。！？]){2,}/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
}

function detectIssues(lines: string[], rules: ScriptQualityRule[]) {
  const issues: ScriptIssue[] = [];
  const enabledRules = new Map(rules.filter((rule) => rule.enabled).map((rule) => [rule.id, rule]));
  const sceneStarts: SceneStart[] = [];
  let currentEpisodeNumber = 0;

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    const episodeNumber = parseEpisodeHeadingNumber(line);
    if (episodeNumber) currentEpisodeNumber = episodeNumber;

    if (!line) return;
    const numericScene = parseNumericSceneHeading(line);
    const chineseScene = parseChineseSceneHeading(line);
    const sceneCandidate = numericScene || chineseScene;

    if (sceneCandidate) {
      sceneStarts.push({
        line: lineNumber,
        currentEpisodeNumber,
        sceneEpisodeNumber: numericScene?.episodeNumber ?? 0,
        sceneNumber: numericScene?.sceneNumber ?? parseChineseOrdinal(chineseScene?.sceneNumberText ?? ""),
        raw: line,
      });
    }

    if (enabledRules.has("empty-dialogue") && /^[\u4e00-\u9fa5A-Za-z0-9_（）()·]{1,12}\s*[:：]\s*$/.test(line)) {
      issues.push(createIssue(enabledRules.get("empty-dialogue")!, "对白冒号后缺少内容。", lineNumber, line));
    }
    if (enabledRules.has("speaker-colon-spacing") && /^[\u4e00-\u9fa5A-Za-z0-9_（）()·]{1,12}\s+[:：]/.test(line)) {
      issues.push(createIssue(enabledRules.get("speaker-colon-spacing")!, "角色名和冒号之间有多余空格。", lineNumber, line));
    }
    if (enabledRules.has("duplicate-ending-punctuation") && /([。！？!?])\1+/.test(line)) {
      issues.push(createIssue(enabledRules.get("duplicate-ending-punctuation")!, "存在重复句末标点。", lineNumber, line));
    }
    if (enabledRules.has("scene-heading-incomplete") && /^(?:场景|第?\s*\d+\s*场|[一二三四五六七八九十]+场)[一二三四五六七八九十\d]*\s*$/.test(line)) {
      issues.push(createIssue(enabledRules.get("scene-heading-incomplete")!, "场景行缺少地点或时间信息。", lineNumber, line));
    }
    if (enabledRules.has("scene-heading-format") && sceneCandidate && !isCompleteSceneHeading(line, sceneCandidate.type)) {
      issues.push(createIssue(enabledRules.get("scene-heading-format")!, "场次标题缺少地点、时间或内外景信息。", lineNumber, line));
    }
    if (enabledRules.has("scene-episode-ownership") && numericScene && currentEpisodeNumber && numericScene.episodeNumber !== currentEpisodeNumber) {
      issues.push(createIssue(enabledRules.get("scene-episode-ownership")!, `场次归属为第 ${numericScene.episodeNumber} 集，但当前文本是第 ${currentEpisodeNumber} 集。`, lineNumber, line));
    }
    if (enabledRules.has("episode-marker-not-at-line-start") && /第\s*[一二三四五六七八九十百零〇两\d０-９]+\s*[集话]/.test(line) && !/^第\s*[一二三四五六七八九十百零〇两\d０-９]+\s*[集话]/.test(line)) {
      issues.push(createIssue(enabledRules.get("episode-marker-not-at-line-start")!, "集标记不在行首，可能影响自动拆集。", lineNumber, line));
    }
    if (enabledRules.has("placeholder-token") && /(TODO|TBD|XXX|待补|待定|占位)/i.test(line)) {
      issues.push(createIssue(enabledRules.get("placeholder-token")!, "存在明显占位符残留。", lineNumber, line));
    }
    if (enabledRules.has("consecutive-duplicate-line") && isMeaningfulDuplicateLine(line, lines[index - 1]?.trim())) {
      issues.push(createIssue(enabledRules.get("consecutive-duplicate-line")!, "与上一行完全重复，可能是复制残留。", lineNumber, line));
    }
    if (enabledRules.has("unclosed-brackets-quotes") && hasUnclosedPairs(line)) {
      issues.push(createIssue(enabledRules.get("unclosed-brackets-quotes")!, "括号或引号未闭合。", lineNumber, line));
    }
    if (enabledRules.has("illegal-character") && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\ufffd]/.test(rawLine)) {
      issues.push(createIssue(enabledRules.get("illegal-character")!, "存在不可见控制字符或异常替换字符。", lineNumber, line));
    }
    if (enabledRules.has("format-residue") && hasFormatResidue(line)) {
      issues.push(createIssue(enabledRules.get("format-residue")!, "存在明显格式残留符号。", lineNumber, line));
    }
  });

  if (enabledRules.has("scene-number-sequence")) {
    issues.push(...detectSceneSequenceIssues(sceneStarts, enabledRules.get("scene-number-sequence")!));
  }
  if (enabledRules.has("empty-scene")) {
    issues.push(...detectEmptySceneIssues(lines, sceneStarts, enabledRules.get("empty-scene")!));
  }

  return issues.map((issue, index) => ({ ...issue, id: `ISSUE-${String(index + 1).padStart(3, "0")}` }));
}

interface SceneStart {
  line: number;
  currentEpisodeNumber: number;
  sceneEpisodeNumber: number;
  sceneNumber: number;
  raw: string;
}

function parseEpisodeHeadingNumber(line: string) {
  const match = line.match(/^第\s*([一二三四五六七八九十百零〇两\d０-９]+)\s*集(?:\s|$)/);
  return parseNumberText(match?.[1]);
}

function parseNumericSceneHeading(line: string) {
  const match = line.match(/^([0-9０-９]+)\s*[-－—]\s*([0-9０-９]+)(?:\s+|$)(.*)$/);
  if (!match) return null;
  return {
    type: "numeric" as const,
    episodeNumber: parseNumberText(match[1]),
    sceneNumber: parseNumberText(match[2]),
    rest: match[3]?.trim() ?? "",
  };
}

function parseChineseSceneHeading(line: string) {
  const match = line.match(/^(?:场景\s*([一二三四五六七八九十百零〇两\d０-９]+)|第\s*([一二三四五六七八九十百零〇两\d０-９]+)\s*场|([一二三四五六七八九十百零〇两]+)场)(?:[：:、\s]+|$)(.*)$/);
  if (!match) return null;
  return {
    type: "chinese" as const,
    sceneNumberText: match[1] || match[2] || match[3] || "",
    rest: match[4]?.trim() ?? "",
  };
}

function isCompleteSceneHeading(line: string, type: "numeric" | "chinese") {
  const detail = type === "numeric" ? parseNumericSceneHeading(line)?.rest ?? "" : parseChineseSceneHeading(line)?.rest ?? "";
  if (detail.length < 3) return false;
  const hasTime = /(?:日|夜|清晨|傍晚|黄昏|凌晨|上午|下午|白天|夜晚)(?:\s|$)/.test(detail);
  const hasSpace = /(?:内|外|内外|外内)(?:\s|$)/.test(detail);
  const contentWithoutTags = detail
    .replace(/(?:日|夜|清晨|傍晚|黄昏|凌晨|上午|下午|白天|夜晚)/g, "")
    .replace(/(?:内外|外内|内|外)/g, "")
    .trim();
  return hasTime && hasSpace && contentWithoutTags.length >= 2;
}

function detectSceneSequenceIssues(sceneStarts: SceneStart[], rule: ScriptQualityRule) {
  const issues: ScriptIssue[] = [];
  const groups = new Map<number, SceneStart[]>();
  for (const scene of sceneStarts) {
    if (!scene.sceneEpisodeNumber || !scene.sceneNumber) continue;
    const groupKey = scene.currentEpisodeNumber || scene.sceneEpisodeNumber;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), scene]);
  }
  for (const scenes of groups.values()) {
    const seen = new Set<number>();
    const sorted = [...scenes].sort((a, b) => a.line - b.line);
    sorted.forEach((scene, index) => {
      const expected = index + 1;
      if (seen.has(scene.sceneNumber)) {
        issues.push(createIssue(rule, `场次号 ${scene.sceneNumber} 重复。`, scene.line, scene.raw));
      } else if (scene.sceneNumber !== expected) {
        issues.push(createIssue(rule, `场次号应为 ${expected}，当前为 ${scene.sceneNumber}。`, scene.line, scene.raw));
      }
      seen.add(scene.sceneNumber);
    });
  }
  return issues;
}

function detectEmptySceneIssues(lines: string[], sceneStarts: SceneStart[], rule: ScriptQualityRule) {
  return sceneStarts.flatMap((scene, index) => {
    const startIndex = scene.line;
    const endIndex = (sceneStarts[index + 1]?.line ?? lines.length + 1) - 1;
    const bodyLines = lines.slice(startIndex, endIndex).map((line) => line.trim()).filter(Boolean);
    return bodyLines.length ? [] : [createIssue(rule, "场次标题后没有正文内容。", scene.line, scene.raw)];
  });
}

function isMeaningfulDuplicateLine(line: string, previousLine: string | undefined) {
  if (!previousLine || line !== previousLine) return false;
  if (line.length < 6) return false;
  if (/^第\s*[一二三四五六七八九十百\d]+\s*集/.test(line)) return false;
  if (parseNumericSceneHeading(line) || parseChineseSceneHeading(line)) return false;
  return true;
}

function hasUnclosedPairs(line: string) {
  const pairs: Array<[string, string]> = [["（", "）"], ["(", ")"], ["《", "》"], ["【", "】"], ["[", "]"], ["「", "」"], ["『", "』"]];
  if (pairs.some(([open, close]) => countChar(line, open) !== countChar(line, close))) return true;
  return countChar(line, "“") !== countChar(line, "”") || countChar(line, '"') % 2 !== 0 || countChar(line, "'") % 2 !== 0;
}

function hasFormatResidue(line: string) {
  return /^(```|~~~|={3,}|-{3,}|#{1,6}\s|>{3}|<{3})/.test(line) || /<\/?[A-Za-z][^>]*>/.test(line) || /\{\{[^}]+\}\}/.test(line);
}

function countChar(value: string, char: string) {
  return [...value].filter((item) => item === char).length;
}

function parseNumberText(value: string | undefined) {
  if (!value) return 0;
  const normalized = value.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return parseChineseOrdinal(normalized);
}

function parseChineseOrdinal(value: string): number {
  const digits: Record<string, number> = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (!value) return 0;
  if (value === "十") return 10;
  const hundredIndex = value.indexOf("百");
  if (hundredIndex >= 0) {
    const hundreds = digits[value[hundredIndex - 1]] || 1;
    return hundreds * 100 + parseChineseOrdinal(value.slice(hundredIndex + 1));
  }
  const tenIndex = value.indexOf("十");
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digits[value[tenIndex - 1]] || 1;
    const ones = digits[value[tenIndex + 1]] || 0;
    return tens * 10 + ones;
  }
  return digits[value] ?? 0;
}

function createIssue(rule: ScriptQualityRule, message: string, line: number, excerpt: string): ScriptIssue {
  return {
    id: "",
    ruleId: rule.id,
    level: rule.level,
    category: rule.category,
    message,
    line,
    excerpt,
  };
}
