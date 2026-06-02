import type { AssetDescription, EpisodeResult, ScriptAnalysis, ShotDescription } from "./storyboard";

export interface ContextPack {
  storyBible: StoryBible;
  episodes: EpisodeContext[];
  characters: CharacterState[];
  scenes: SceneState[];
  props: PropState[];
  sceneBeats: SceneBeatContext[];
  continuity: ContinuityState[];
}

export interface StoryBible {
  genre: string;
  visualStyle: string;
  coreConflict: string;
  globalRules: string[];
}

export interface EpisodeContext {
  episodeId: string;
  objective: string;
  emotionalCurve: string[];
  keyReveals: string[];
  requiredContinuity: string[];
}

export interface CharacterState {
  assetId: string;
  name: string;
  episodeId: string;
  baseline: string;
  currentEmotion: string;
  costume: string;
  heldItems: string[];
  continuity: string;
}

export interface SceneState {
  sceneId: string;
  episodeId: string;
  name: string;
  time: string;
  lighting: string;
  background: string;
  reusableAngles: string[];
}

export interface PropState {
  assetId: string;
  name: string;
  episodeId: string;
  owner: string;
  state: string;
  visibility: string;
}

export interface SceneBeatContext {
  beatId: string;
  episodeId: string;
  scene: string;
  purpose: string;
  emotionProgression: string;
  involvedAssets: string[];
}

export interface ContinuityState {
  shotId: string;
  episodeId: string;
  previous: string;
  current: string;
  next: string;
  guardrails: string[];
}

export function buildContextPack(analysis: ScriptAnalysis): ContextPack {
  const allAssets = analysis.episodes.flatMap((episode) => episode.assets.map((asset) => ({ asset, episode })));
  const allShots = analysis.episodes.flatMap((episode) => episode.shots.map((shot, index) => ({ shot, episode, index })));

  return {
    storyBible: {
      genre: analysis.options.genreProfile,
      visualStyle: analysis.options.directorProfile,
      coreConflict: inferCoreConflict(analysis.episodes),
      globalRules: [
        "角色外貌、服装、手持物跨镜头保持一致。",
        "道具开合、破损、持有人变化必须显式记录。",
        "分镜先服务情绪和信息揭露，再决定景别与机位。",
        "同一场景保持空间方向、光源方向和背景人物密度一致。",
      ],
    },
    episodes: analysis.episodes.map(buildEpisodeContext),
    characters: allAssets
      .filter(({ asset }) => asset.type === "角色")
      .map(({ asset, episode }) => buildCharacterState(asset, episode)),
    scenes: allAssets
      .filter(({ asset }) => asset.type === "场景")
      .map(({ asset, episode }) => buildSceneState(asset, episode)),
    props: allAssets.filter(({ asset }) => asset.type === "道具").map(({ asset, episode }) => buildPropState(asset, episode)),
    sceneBeats: analysis.episodes.flatMap(buildSceneBeats),
    continuity: allShots.map(({ shot, episode, index }) => buildContinuityState(shot, episode.shots, index)),
  };
}

function inferCoreConflict(episodes: EpisodeResult[]) {
  const text = episodes.map((episode) => episode.logline).join(" ");
  if (/真相|档案|合照|秘密/.test(text)) return "人物关系中的隐秘真相逐步暴露。";
  if (/借钱|医院|诊断/.test(text)) return "现实压力和人物关系冲突交织。";
  return "主角目标、关系阻力和信息差推动剧情。";
}

function buildEpisodeContext(episode: EpisodeResult): EpisodeContext {
  return {
    episodeId: episode.episodeId,
    objective: episode.logline || "本集目标待确认。",
    emotionalCurve: extractUnique(episode.shots.map((shot) => shot.emotionalBeat)).slice(0, 5),
    keyReveals: episode.shots.filter((shot) => /信息|真相|发现|认出/.test(shot.emotionalBeat + shot.action)).map((shot) => shot.action),
    requiredContinuity: [
      "本集角色服装和情绪压力应连续。",
      "跨场景道具状态变化需在场次上下文中记录。",
      "前后镜头的动作落点和视线方向需要承接。",
    ],
  };
}

function buildCharacterState(asset: AssetDescription, episode: EpisodeResult): CharacterState {
  const relatedShots = findRelatedShots(asset, episode);
  return {
    assetId: asset.assetId,
    name: asset.name,
    episodeId: episode.episodeId,
    baseline: asset.description,
    currentEmotion: relatedShots.at(-1)?.emotionalBeat ?? "待确认",
    costume: "待模型从全剧/单集上下文提取，人工确认后锁定。",
    heldItems: inferHeldItems(asset.name, relatedShots),
    continuity: asset.continuity,
  };
}

function buildSceneState(asset: AssetDescription, episode: EpisodeResult): SceneState {
  return {
    sceneId: asset.assetId,
    episodeId: episode.episodeId,
    name: asset.name,
    time: /夜/.test(asset.name) ? "夜" : /日|白天/.test(asset.name) ? "日" : "待确认",
    lighting: /夜/.test(asset.name) ? "低照度、走廊冷光或室内局部光源" : "自然光或室内主光",
    background: "背景人物数量、动线和噪声水平待确认。",
    reusableAngles: ["建立空间关系的中景", "承载表情的近景", "揭示道具/信息的特写"],
  };
}

function buildPropState(asset: AssetDescription, episode: EpisodeResult): PropState {
  const relatedShots = findRelatedShots(asset, episode);
  return {
    assetId: asset.assetId,
    name: asset.name,
    episodeId: episode.episodeId,
    owner: inferOwner(relatedShots),
    state: inferPropState(asset.name, relatedShots),
    visibility: relatedShots.length ? `首次出现于 ${relatedShots[0].shotId}` : "待确认",
  };
}

function buildSceneBeats(episode: EpisodeResult): SceneBeatContext[] {
  const scenes = extractUnique(episode.shots.map((shot) => shot.scene));
  return scenes.map((scene, index) => {
    const shots = episode.shots.filter((shot) => shot.scene === scene);
    return {
      beatId: `${episode.episodeId}-B${String(index + 1).padStart(2, "0")}`,
      episodeId: episode.episodeId,
      scene,
      purpose: shots.map((shot) => shot.action).join(" ").slice(0, 100) || "待确认",
      emotionProgression: extractUnique(shots.map((shot) => shot.emotionalBeat)).join(" -> ") || "待确认",
      involvedAssets: extractUnique(shots.flatMap((shot) => shot.assets)),
    };
  });
}

function buildContinuityState(shot: ShotDescription, shots: ShotDescription[], index: number): ContinuityState {
  return {
    shotId: shot.shotId,
    episodeId: shot.episodeId,
    previous: index > 0 ? shots[index - 1].action : "本集/本场开场状态待确认。",
    current: shot.action,
    next: shots[index + 1]?.action ?? "本场结束承接点待确认。",
    guardrails: [
      `保持场景：${shot.scene}`,
      `保持情绪：${shot.emotionalBeat}`,
      shot.dialogue ? "对白镜需确认口型与时长。" : "非对白镜需确认动作落点。",
    ],
  };
}

function findRelatedShots(asset: AssetDescription, episode: EpisodeResult) {
  return episode.shots.filter(
    (shot) => shot.action.includes(asset.name) || shot.dialogue.includes(asset.name) || shot.scene.includes(asset.name),
  );
}

function inferHeldItems(name: string, shots: ShotDescription[]) {
  const held = new Set<string>();
  for (const shot of shots) {
    if (/诊断单/.test(shot.action) && /攥|拿|递|看/.test(shot.action)) held.add("诊断单");
    if (/档案/.test(shot.action) && /推|合上|拿|翻/.test(shot.action)) held.add("档案");
    if (/合照|照片/.test(shot.action)) held.add("合照/照片");
  }
  if (!held.size && name) return [];
  return [...held];
}

function inferOwner(shots: ShotDescription[]) {
  const text = shots.map((shot) => shot.action).join(" ");
  const owner = text.match(/([\u4e00-\u9fa5]{2,3})(?:攥|拿|推|合上|递|看)/)?.[1];
  if (owner && /档案|合照|照片|诊断|文件/.test(owner)) return "待确认";
  return owner ?? "待确认";
}

function inferPropState(name: string, shots: ShotDescription[]) {
  const text = shots.map((shot) => shot.action).join(" ");
  if (/合上/.test(text)) return `${name}处于合上/隐藏信息状态。`;
  if (/攥/.test(text)) return `${name}被攥紧，可能有皱折。`;
  if (/推到|递/.test(text)) return `${name}被交给对方或推到对方面前。`;
  return `${name}状态待确认。`;
}

function extractUnique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
