export interface AnalysisOptions {
  genreProfile: string;
  directorProfile: string;
  targetShotSeconds: number;
}

export interface ScriptAnalysis {
  totalCharacters: number;
  options: AnalysisOptions;
  episodes: EpisodeResult[];
  warnings: string[];
}

export interface EpisodeResult {
  episodeId: string;
  title: string;
  logline: string;
  sourceText: string;
  characterCount: number;
  assets: AssetDescription[];
  shots: ShotDescription[];
  prompts: PromptDescription[];
}

export interface AssetDescription {
  assetId: string;
  type: "角色" | "场景" | "道具";
  name: string;
  description: string;
  continuity: string;
  firstSeenShotId: string;
  imagePrompt?: string;
  reliability?: "explicit" | "inferred" | "needs_review";
  sourceRefs?: Array<{
    refId: string;
    text: string;
    confidence: "explicit" | "inferred" | "needs_review";
  }>;
}

export interface ShotDescription {
  shotId: string;
  episodeId: string;
  scene: string;
  durationSeconds: number;
  shotType: string;
  framing: string;
  camera: string;
  action: string;
  dialogue: string;
  emotionalBeat: string;
  reviewNotes: string[];
  assets: string[];
}

export interface PromptDescription {
  promptId: string;
  shotId: string;
  videoPrompt: string;
  negativePrompt: string;
}

interface EpisodeChunk {
  episodeId: string;
  title: string;
  text: string;
}

const defaultSceneName = "未标注场景";
const speakerPattern = /^([\u4e00-\u9fa5]{2,4})[：:]/gm;
const actionNamePattern = /([\u4e00-\u9fa5]{2,3})(?=说|问|喊|冷笑|转身|站|坐|看|攥|推|拿|冲|躲|听|认出|示意|合上|走|来)/g;
const scenePattern = /(场景[一二三四五六七八九十\d]+[：:、\s]*[^\n]{0,24}|(?:内景|外景)[^\n]{0,30}|[^\n]{2,16}(?:日|夜|清晨|傍晚|黄昏))/g;
const propPattern = /(?:诊断单|档案|合照|手机|钥匙|合同|录音笔|项链|戒指|照片|病历|文件|银行卡|U盘|优盘|玉佩|千年雪莲|雪莲|竹篓|背篓|拐杖)/g;
const blockedNames = new Set(["场景一", "场景二", "场景三", "电话", "母亲", "父亲", "叔叔", "门外"]);
const commonSurnamePattern =
  /^[赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵汪祁毛禹狄米贝明臧计伏成戴谈宋庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣邓郁单杭洪包诸左石崔吉龚程邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲台从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀郏浦尚农温庄晏柴瞿阎连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公][\u4e00-\u9fa5]{1,2}$/;

export function analyzeScript(script: string, options: AnalysisOptions): ScriptAnalysis {
  const normalizedScript = script.trim();
  const episodes = splitEpisodes(normalizedScript).map((episode) => buildEpisodeResult(episode, options));

  return {
    totalCharacters: normalizedScript.length,
    options,
    episodes: episodes.length ? episodes : [buildEpisodeResult({ episodeId: "EP01", title: "EP01", text: "" }, options)],
    warnings: buildWarnings(normalizedScript, episodes),
  };
}

function splitEpisodes(script: string): EpisodeChunk[] {
  if (!script) return [{ episodeId: "EP01", title: "EP01", text: "" }];

  const matches = [...script.matchAll(/^第\s*([一二三四五六七八九十百\d]+)\s*集[^\n]*$/gm)];
  if (!matches.length) {
    return chunkLongScript(script).map((text, index) => ({
      episodeId: toEpisodeId(index + 1),
      title: `EP${String(index + 1).padStart(2, "0")}`,
      text,
    }));
  }

  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = matches[index + 1]?.index ?? script.length;
    const number = parseEpisodeNumber(match[1]) || index + 1;
    return {
      episodeId: toEpisodeId(number),
      title: match[0].trim(),
      text: script.slice(start, end).trim(),
    };
  });
}

function chunkLongScript(script: string) {
  const maxChars = 6000;
  const paragraphs = script.split(/\n{2,}/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if ((current + paragraph).length > maxChars && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += `${paragraph}\n\n`;
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks.length ? chunks : [script];
}

function buildEpisodeResult(episode: EpisodeChunk, options: AnalysisOptions): EpisodeResult {
  const shots = buildShots(episode, options);
  const assets = buildAssets(episode, shots);
  const prompts = shots.map((shot) => buildPrompt(shot, episode, options));
  const logline = inferLogline(episode.text);

  return {
    episodeId: episode.episodeId,
    title: episode.title,
    logline,
    sourceText: episode.text,
    characterCount: episode.text.length,
    assets,
    shots: shots.map((shot) => ({
      ...shot,
      assets: assets
        .filter((asset) => shot.action.includes(asset.name) || shot.dialogue.includes(asset.name) || shot.scene.includes(asset.name))
        .map((asset) => asset.assetId),
    })),
    prompts,
  };
}

function buildShots(episode: EpisodeChunk, options: AnalysisOptions): ShotDescription[] {
  const paragraphs = episode.text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line && !/^第\s*[一二三四五六七八九十百\d]+\s*集/.test(line));

  const sceneLines = extractUnique(episode.text.match(scenePattern) ?? []);
  let scene = sceneLines[0] ?? defaultSceneName;

  const shots: ShotDescription[] = [];

  for (const paragraph of paragraphs) {
    if (scenePattern.test(paragraph)) {
      scenePattern.lastIndex = 0;
      scene = paragraph.replace(/^场景[一二三四五六七八九十\d]+[：:、\s]*/, "").trim() || paragraph;
      continue;
    }
    scenePattern.lastIndex = 0;

    const beats = splitBeats(paragraph);
    for (const beat of beats) {
      const dialogue = extractDialogue(beat);
      shots.push({
        shotId: `${episode.episodeId}-S${String(shots.length + 1).padStart(3, "0")}`,
        episodeId: episode.episodeId,
        scene,
        durationSeconds: estimateDuration(beat, dialogue, options.targetShotSeconds),
        shotType: inferShotType(beat, dialogue),
        framing: inferFraming(beat, dialogue),
        camera: inferCamera(beat),
        action: cleanAction(beat),
        dialogue,
        emotionalBeat: inferEmotion(beat),
        reviewNotes: buildShotReviewNotes(beat, dialogue),
        assets: [],
      });
    }
  }

  return shots;
}

function splitBeats(paragraph: string) {
  const clauses = paragraph
    .split(/(?<=[。！？!?])\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraph.length < 90 || clauses.length <= 1) return [paragraph];

  const beats: string[] = [];
  let current = "";
  for (const clause of clauses) {
    if ((current + clause).length > 80 && current) {
      beats.push(current);
      current = "";
    }
    current += clause;
  }
  if (current) beats.push(current);
  return beats;
}

function buildAssets(episode: EpisodeChunk, shots: ShotDescription[]): AssetDescription[] {
  const speakers = [...episode.text.matchAll(speakerPattern)].map((match) => match[1]);
  const listedCharacters = [...episode.text.matchAll(/^人物[：:]\s*([^\n]+)/gm)].flatMap((match) => match[1].split(/[、，,\/\s]+/));
  const actionNames = [...episode.text.matchAll(actionNamePattern)].map((match) => match[1]);
  const names = extractUnique([...listedCharacters, ...speakers, ...actionNames]).filter(isLikelyCharacterName).slice(0, 24);
  const scenes = extractUnique(shots.map((shot) => shot.scene).filter((scene) => scene !== defaultSceneName)).slice(0, 18);
  const props = extractUnique(episode.text.match(propPattern) ?? []).slice(0, 18);

  return [
    ...names.map((name, index) => createAsset(episode.episodeId, "角色", name, index + 1, shots)),
    ...scenes.map((name, index) => createAsset(episode.episodeId, "场景", name, index + 1, shots)),
    ...props.map((name, index) => createAsset(episode.episodeId, "道具", name, index + 1, shots)),
  ];
}

function createAsset(
  episodeId: string,
  type: AssetDescription["type"],
  name: string,
  index: number,
  shots: ShotDescription[],
): AssetDescription {
  const firstSeen = shots.find((shot) => shot.action.includes(name) || shot.dialogue.includes(name) || shot.scene.includes(name));
  const descriptors = {
    角色: `${name}，本集关键人物。资产审核时需补充年龄段、体型、发型、服装主色、关系标签和情绪底色。`,
    场景: `${name}，本集主要叙事空间。资产审核时需补充空间方位、光线时间、固定陈设和可复用角度。`,
    道具: `${name}，推动剧情或揭示信息的关键道具。资产审核时需补充材质、尺寸、识别特征和特写规则。`,
  };
  const continuity = {
    角色: "同一角色跨镜头保持脸型、发型、服装、年龄感和伤痕/妆容一致。",
    场景: "同一场景跨镜头保持门窗位置、光源方向、主色调和空间动线一致。",
    道具: "同一道具跨镜头保持外观、摆放关系、持有人和损坏状态一致。",
  };

  return {
    assetId: `${episodeId}-${typeCode(type)}${String(index).padStart(3, "0")}`,
    type,
    name,
    description: descriptors[type],
    continuity: continuity[type],
    firstSeenShotId: firstSeen?.shotId ?? `${episodeId}-S001`,
  };
}

function buildPrompt(shot: ShotDescription, episode: EpisodeChunk, options: AnalysisOptions): PromptDescription {
  const dialoguePart = shot.dialogue ? `对白：${trimPunctuation(shot.dialogue)}。` : "";
  return {
    promptId: `${shot.shotId}-P`,
    shotId: shot.shotId,
    videoPrompt: joinChineseParts([
      options.genreProfile,
      options.directorProfile,
      episode.title,
      shot.scene,
      shot.shotType,
      shot.framing,
      shot.camera,
      trimPunctuation(shot.action),
      `情绪：${shot.emotionalBeat}`,
      dialoguePart,
      `镜头时长约${shot.durationSeconds}秒`,
      "画面连续，人物关系清晰，资产外观保持一致",
    ]),
    negativePrompt: "不要字幕水印，不要跳切，不要人物五官漂移，不要服装突变，不要低清模糊。",
  };
}

function inferLogline(text: string) {
  const firstAction = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find((line) => line && !/^第\s*[一二三四五六七八九十百\d]+\s*集/.test(line) && !scenePattern.test(line));
  scenePattern.lastIndex = 0;
  return firstAction ? firstAction.slice(0, 80) : "等待输入本集剧本后生成戏眼。";
}

function extractDialogue(text: string) {
  const colonIndex = text.search(/[：:]/);
  if (colonIndex < 0) return "";
  return text.slice(Math.max(0, colonIndex - 6)).trim();
}

function cleanAction(text: string) {
  return text.replace(/^[\u4e00-\u9fa5]{1,6}[：:]/, "").trim();
}

function estimateDuration(text: string, dialogue: string, targetShotSeconds: number) {
  const speechSeconds = dialogue ? Math.ceil(dialogue.length / 5.5) : 0;
  const actionSeconds = Math.ceil(text.length / 28);
  return clamp(Math.max(targetShotSeconds, speechSeconds, actionSeconds), 3, 12);
}

function inferShotType(text: string, dialogue: string) {
  if (dialogue) return "对白承载镜";
  if (/认出|发现|真相|档案|合照|诊断单|照片|文件/.test(text)) return "信息揭露镜";
  if (/冲|推|摔|躲|跑|追|合上|攥/.test(text)) return "动作推进镜";
  if (/哭|泪|沉默|复杂|表情|愣住/.test(text)) return "反应镜";
  return "叙事推进镜";
}

function inferFraming(text: string, dialogue: string) {
  if (/诊断单|档案|合照|照片|手机|钥匙|合同|录音笔|项链|戒指/.test(text)) return "特写";
  if (dialogue || /表情|眼泪|冷笑|沉默/.test(text)) return "近景";
  if (/走廊|书房|房间|门外|电梯/.test(text)) return "中景";
  return "中近景";
}

function inferCamera(text: string) {
  if (/冲|跑|追|推/.test(text)) return "轻微跟拍";
  if (/认出|发现|真相|合照|档案/.test(text)) return "缓慢推进";
  if (/脚步|躲|藏|暗门/.test(text)) return "压低机位";
  return "稳定机位";
}

function buildShotReviewNotes(text: string, dialogue: string) {
  const notes: string[] = [];
  if (dialogue.length > 42) notes.push("对白较长，需人工确认口型承载和拆镜。");
  if (/哭|怒|喊|吼|冲|躲|认出|发现/.test(text)) notes.push("情绪或动作较强，需确认是否补反应镜。");
  if (!dialogue && text.length > 90) notes.push("动作描述较长，建议拆成动作镜和结果镜。");
  return notes;
}

function inferEmotion(text: string) {
  if (/哭|泪|崩溃|哽咽|绝望/.test(text)) return "情绪崩裂";
  if (/怒|喊|吼|质问|冲/.test(text)) return "正面冲突";
  if (/躲|藏|暗门|脚步|秘密/.test(text)) return "悬疑压迫";
  if (/认出|真相|档案|合照|发现/.test(text)) return "信息揭露";
  return "关系推进";
}

function buildWarnings(script: string, episodes: EpisodeResult[]) {
  const warnings: string[] = [];
  if (!script.trim()) warnings.push("尚未输入剧本。");
  if (script.length > 50000) warnings.push("输入超过 50000 字，建议接入后端任务队列和分段模型生成。");
  if (!/^第\s*[一二三四五六七八九十百\d]+\s*集/m.test(script) && script.length > 6000) {
    warnings.push("未检测到明确集标记，系统按长度临时拆分，建议人工确认集边界。");
  }
  const riskyShots = episodes.flatMap((episode) => episode.shots.filter((shot) => shot.reviewNotes.length));
  if (riskyShots.length) warnings.push(`${riskyShots.length} 个镜头需要人工复核。`);
  return warnings;
}

function parseEpisodeNumber(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (digits[value.at(1) ?? ""] ?? 0);
  if (value.endsWith("十")) return (digits[value.at(0) ?? ""] ?? 1) * 10;
  if (value.includes("十")) {
    const [tens, ones] = value.split("十");
    return (digits[tens] ?? 1) * 10 + (digits[ones] ?? 0);
  }
  return digits[value] ?? 0;
}

function toEpisodeId(number: number) {
  return `EP${String(number).padStart(2, "0")}`;
}

function typeCode(type: AssetDescription["type"]) {
  return { 角色: "C", 场景: "L", 道具: "P" }[type];
}

function extractUnique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function isLikelyCharacterName(value: string) {
  if (blockedNames.has(value)) return false;
  if (/^(这个|那个|自己|真相|属于|只是|不是|里面|身边|电话|表情|声音|脚步)$/.test(value)) return false;
  return commonSurnamePattern.test(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function exportEpisodeBundle(episode: EpisodeResult) {
  return {
    assets: {
      episode_id: episode.episodeId,
      assets: episode.assets,
    },
    shots: {
      episode_id: episode.episodeId,
      shots: episode.shots,
    },
    prompts: {
      episode_id: episode.episodeId,
      prompts: episode.prompts,
    },
  };
}

export function parseEpisodeBundle(
  value: string,
  fallback: EpisodeResult,
): { ok: true; episode: EpisodeResult } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(value) as {
      assets?: { assets?: AssetDescription[] };
      shots?: { shots?: ShotDescription[] };
      prompts?: { prompts?: PromptDescription[] };
    };
    const assets = parsed.assets?.assets;
    const shots = parsed.shots?.shots;
    const prompts = parsed.prompts?.prompts;

    if (!Array.isArray(assets)) return { ok: false, error: "assets.assets 必须是数组。" };
    if (!Array.isArray(shots)) return { ok: false, error: "shots.shots 必须是数组。" };
    if (!Array.isArray(prompts)) return { ok: false, error: "prompts.prompts 必须是数组。" };

    return {
      ok: true,
      episode: {
        ...fallback,
        assets,
        shots,
        prompts,
      },
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "JSON 格式错误。" };
  }
}

export function csvFromPrompts(prompts: PromptDescription[]) {
  const rows = [["prompt_id", "shot_id", "video_prompt", "negative_prompt"]];
  for (const prompt of prompts) {
    rows.push([prompt.promptId, prompt.shotId, prompt.videoPrompt, prompt.negativePrompt]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

function trimPunctuation(value: string) {
  return value.trim().replace(/[。！？!?,，、；;：:]+$/g, "");
}

function joinChineseParts(parts: string[]) {
  return parts
    .map((part) => trimPunctuation(part))
    .filter(Boolean)
    .join("，")
    .replace(/，情绪：/g, "。情绪：")
    .replace(/，对白/g, "。对白")
    .replace(/，镜头时长/g, "。镜头时长")
    .concat("。");
}

export function formatJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
