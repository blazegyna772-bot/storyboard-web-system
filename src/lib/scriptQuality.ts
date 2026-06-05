export interface ScriptIssue {
  id: string;
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

const qualityRulesKey = "script-quality-rules-v1";

export const defaultScriptQualityRules: ScriptQualityRule[] = [
  {
    id: "punctuation-pairing",
    name: "标点配对与重复",
    category: "标点",
    level: "提示",
    description: "检查重复句末标点、引号等基础标点清洗疑点；只提示，不直接改剧情内容。",
    enabled: true,
  },
  {
    id: "scene-marker-order",
    name: "场次标记排序",
    category: "场景",
    level: "警告",
    description: "检查疑似场景行缺失地点/时间、场次标记不规范等会影响拆场的信息。",
    enabled: true,
  },
  {
    id: "name-consistency",
    name: "剧内名称一致性",
    category: "角色名",
    level: "警告",
    description: "检查明显相近的角色名混用疑点，作为人工复核提示。",
    enabled: true,
  },
  {
    id: "dialogue-linebreak",
    name: "对白断行与空内容",
    category: "对白",
    level: "错误",
    description: "检查对白冒号后无内容、角色名与冒号间异常空格等基础断行疑点。",
    enabled: true,
  },
  {
    id: "episode-marker",
    name: "分集标记位置",
    category: "集数",
    level: "警告",
    description: "检查集标记没有放在行首等可能影响分集导入和后续处理的问题。",
    enabled: true,
  },
];

export function loadScriptQualityRules(): ScriptQualityRule[] {
  const raw = localStorage.getItem(qualityRulesKey);
  if (!raw) return defaultScriptQualityRules;
  try {
    const parsed = JSON.parse(raw) as ScriptQualityRule[];
    if (!Array.isArray(parsed) || !parsed.length) return defaultScriptQualityRules;
    return parsed.map((rule) => ({
      id: rule.id || `rule-${Math.random().toString(36).slice(2, 8)}`,
      name: rule.name || "未命名规则",
      category: rule.category || "自定义",
      level: rule.level || "提示",
      description: rule.description || "",
      enabled: rule.enabled !== false,
    }));
  } catch {
    localStorage.removeItem(qualityRulesKey);
    return defaultScriptQualityRules;
  }
}

export function saveScriptQualityRules(rules: ScriptQualityRule[]) {
  localStorage.setItem(qualityRulesKey, JSON.stringify(rules));
}

export function buildScriptQualityReport(script: string): ScriptQualityReport {
  const normalized = script.replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trim();
  const lines = normalized.split("\n");
  const cleanedLines = lines.map(cleanLine);
  const cleanedScript = cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n");
  const issues = detectIssues(lines);

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

function detectIssues(lines: string[]) {
  const issues: ScriptIssue[] = [];
  const speakerNames = new Map<string, number[]>();

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;
    if (!line) return;

    const speaker = line.match(/^([\u4e00-\u9fa5]{2,4})\s*[:：]/)?.[1];
    if (speaker) speakerNames.set(speaker, [...(speakerNames.get(speaker) ?? []), lineNumber]);

    if (/[:：]\s*$/.test(line)) {
      issues.push(createIssue("错误", "对白", "对白冒号后缺少内容。", lineNumber, line));
    }
    if (/^[\u4e00-\u9fa5]{2,4}\s+[:：]/.test(line)) {
      issues.push(createIssue("警告", "格式", "角色名和冒号之间有多余空格。", lineNumber, line));
    }
    if (/[。！？]{2,}/.test(line)) {
      issues.push(createIssue("提示", "标点", "存在重复句末标点，建议清洗。", lineNumber, line));
    }
    if (/场景[一二三四五六七八九十\d]+$/.test(line)) {
      issues.push(createIssue("警告", "场景", "场景行缺少地点或时间信息。", lineNumber, line));
    }
    if (/第\s*[一二三四五六七八九十百\d]+\s*集/.test(line) && !/^第\s*[一二三四五六七八九十百\d]+\s*集/.test(line)) {
      issues.push(createIssue("警告", "集数", "集标记不在行首，可能影响自动拆集。", lineNumber, line));
    }
  });

  for (const [name, lineNumbers] of speakerNames.entries()) {
    const similar = [...speakerNames.keys()].find((other) => other !== name && isSimilarName(name, other));
    if (similar && lineNumbers[0]) {
      issues.push(createIssue("警告", "角色名", `角色名“${name}”疑似与“${similar}”混用。`, lineNumbers[0], name));
    }
  }

  return issues.map((issue, index) => ({ ...issue, id: `ISSUE-${String(index + 1).padStart(3, "0")}` }));
}

function createIssue(level: ScriptIssue["level"], category: string, message: string, line: number, excerpt: string): ScriptIssue {
  return {
    id: "",
    level,
    category,
    message,
    line,
    excerpt,
  };
}

function isSimilarName(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  return a[0] === b[0] || a.at(-1) === b.at(-1);
}
