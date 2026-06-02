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
