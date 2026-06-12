import type { ReactNode } from "react";
import type { StoryWorkflowNodeId } from "../lib/storyWorkflowApi";
import { asArray, asRecord, asTextArray, textValue } from "../lib/valueFormat";
import { videoPromptItems } from "../lib/videoGroups";

export function StoryArtifactReview({ nodeId, output }: { nodeId: StoryWorkflowNodeId; output: Record<string, unknown> }) {
  const data = asRecord(output);
  if (!Object.keys(data).length) {
    return <div className="empty-state">该节点没有可审阅的结构化内容。请到 JSON 标签查看原始输出。</div>;
  }

  if (nodeId === "story_map") return <ReviewStoryMap data={data} />;
  if (nodeId === "character_summary") return <ReviewCharacterSummary data={data} />;
  if (nodeId === "continuity") return <ReviewContinuity data={data} />;
  if (nodeId === "series_summary") return <ReviewSeriesSummary data={data} />;
  if (nodeId === "chapter_summary") return <ReviewChapterSummary data={data} />;
  if (nodeId === "episode_summary") return <ReviewEpisodeSummary data={data} />;
  if (nodeId === "scene_summary") return <ReviewSceneSummary data={data} />;
  if (nodeId === "storyboard_design") return <ReviewStoryboardDesign data={data} />;
  if (nodeId === "video_prompt") return <ReviewVideoPrompt data={data} />;
  return <GenericArtifactReview data={data} />;
}

function ReviewStoryMap({ data }: { data: Record<string, unknown> }) {
  if (data.series_narrative || data.chapter_map) {
    return (
      <div className="story-artifact-review">
        <ReviewHero title="剧情结构图" subtitle={textValue(data.series_narrative)} />
        <ReviewSection title="生产章节">
          <ChapterCardGrid rows={asArray(data.chapter_map).map(asRecord)} />
        </ReviewSection>
        <ReviewSection title="审阅提醒">
          <BulletList items={asTextArray(data.review_notes)} emptyText="无审阅提醒。" />
        </ReviewSection>
      </div>
    );
  }
  const globalTurns = asArray(data.global_turning_points).map(asRecord);
  const emotionalCurve = globalTurns.length ? globalTurns : asArray(data.emotional_curve).map(asRecord);
  const chapterMap = asArray(data.chapter_map).map(asRecord);
  const keyTurns = globalTurns.length ? [] : asArray(data.key_turns).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewHero
        title={textValue(data.logline, "未生成一句话梗概")}
        subtitle={textValue(data.mainline)}
        tags={asTextArray(data.genre_tone_tags)}
      />
      <ReviewSection title={globalTurns.length ? "关键转折地图" : "全剧情绪曲线"}>
        <TimelineList rows={emotionalCurve} leftKey="episode_hint" titleKey="event" detailKey={globalTurns.length ? "narrative_function" : "emotion_shift"} />
      </ReviewSection>
      <ReviewSection title="章节节点">
        <ChapterCardGrid rows={chapterMap} />
      </ReviewSection>
      {keyTurns.length > 0 && (
        <ReviewSection title="关键转折">
          <SimpleTable
            columns={[
              ["episode_hint", "集数"],
              ["turn", "转折"],
              ["why_important", "作用"],
            ]}
            rows={keyTurns}
          />
        </ReviewSection>
      )}
    </div>
  );
}

function ReviewCharacterSummary({ data }: { data: Record<string, unknown> }) {
  if (data.character_flows) {
    return (
      <div className="story-artifact-review">
        <ReviewSection title="角色状态图">
          <GenericObjectList rows={asArray(data.character_flows).map(asRecord)} />
        </ReviewSection>
        <ReviewSection title="审阅提醒">
          <BulletList items={asTextArray(data.review_notes)} emptyText="无审阅提醒。" />
        </ReviewSection>
      </div>
    );
  }
  const characters = asArray(data.main_characters).map(asRecord);
  const relationships = asArray(data.relationship_map).map(asRecord);
  const risks = asArray(data.character_risks_for_later).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewSection title="主要角色档案">
        <SimpleTable
          columns={[
            ["name", "角色"],
            ["role_function", "戏剧功能"],
            ["core_desire", "核心欲望"],
            ["performance_baseline", "表演底色"],
            ["identity_changes", "身份变化"],
          ]}
          rows={characters}
          className="character-review-table"
        />
      </ReviewSection>
      <ReviewSection title="身份视觉阶段">
        <GenericObjectList rows={characters.flatMap((character) => asArray(character.identity_visual_stages).map((stage) => ({ name: character.name, ...asRecord(stage) })))} />
      </ReviewSection>
      <ReviewSection title="关系 / 认知变化">
        <GenericObjectList
          rows={characters.flatMap((character) => [
            ...asArray(character.relationship_state_changes).map((item) => ({ name: character.name, type: "关系", ...asRecord(item) })),
            ...asArray(character.knowledge_state_changes).map((item) => ({ name: character.name, type: "认知", ...asRecord(item) })),
          ])}
        />
      </ReviewSection>
      <ReviewSection title="关系变化">
        {relationships.length ? <GenericObjectList rows={relationships} /> : <EmptyReviewText text="未输出关系变化。" />}
      </ReviewSection>
      <ReviewSection title="后续风险">
        <GenericObjectList rows={risks} fallback={asTextArray(data.character_risks_for_later)} />
      </ReviewSection>
    </div>
  );
}

function ReviewContinuity({ data }: { data: Record<string, unknown> }) {
  if (data.visual_continuities || data.space_flows || data.visual_tone_flows) {
    return (
      <div className="story-artifact-review">
        <ReviewSection title="视觉资产状态">
          <GenericObjectList rows={asArray(data.visual_continuities).map(asRecord)} fallback={asTextArray(data.visual_continuities)} />
        </ReviewSection>
        <div className="review-two-col">
          <ReviewSection title="空间状态">
            <GenericObjectList rows={asArray(data.space_flows).map(asRecord)} fallback={asTextArray(data.space_flows)} />
          </ReviewSection>
          <ReviewSection title="视觉影调">
            <GenericObjectList rows={asArray(data.visual_tone_flows).map(asRecord)} fallback={asTextArray(data.visual_tone_flows)} />
          </ReviewSection>
        </div>
        <ReviewSection title="审阅提醒">
          <BulletList items={asTextArray(data.review_notes)} emptyText="无审阅提醒。" />
        </ReviewSection>
      </div>
    );
  }
  return (
    <div className="story-artifact-review">
      <ReviewSection title="伏笔 / Callback">
        <SimpleTable
          columns={[
            ["setup_episode", "埋设"],
            ["setup_text", "内容"],
            ["payoff_episode", "回收"],
            ["payoff_text", "回收方式"],
            ["risk", "风险"],
          ]}
          rows={asArray(data.foreshadowing_callbacks).map(asRecord)}
        />
      </ReviewSection>
      <div className="review-two-col">
        <ReviewSection title="视觉母题">
          <GenericObjectList rows={asArray(data.visual_motifs).map(asRecord)} fallback={asTextArray(data.visual_motifs)} />
        </ReviewSection>
        <ReviewSection title="复现空间 / 道具">
          <ReviewMiniBlock title="道具" items={asArray(data.recurring_props)} />
          <ReviewMiniBlock title="空间" items={asArray(data.recurring_spaces)} />
        </ReviewSection>
      </div>
      <ReviewSection title="资产变化风险">
        <GenericObjectList rows={asArray(data.asset_change_risks).map(asRecord)} fallback={asTextArray(data.asset_change_risks)} />
      </ReviewSection>
      <ReviewSection title="复核优先级">
        <BulletList items={asTextArray(data.review_priority)} emptyText="未输出复核优先级。" />
      </ReviewSection>
    </div>
  );
}

function ReviewSeriesSummary({ data }: { data: Record<string, unknown> }) {
  if (data.series_flow) {
    const flow = asRecord(data.series_flow);
    return (
      <div className="story-artifact-review">
        <ReviewHero title="全剧信息流汇总" subtitle={textValue(flow.narrative)} />
        <ReviewSection title="章节图">
          <ChapterCardGrid rows={asArray(data.chapter_map).map(asRecord)} />
        </ReviewSection>
        <ReviewSection title="全剧信息流">
          <FlowReview flow={flow} />
        </ReviewSection>
        <ReviewSection title="审阅提醒">
          <BulletList items={asTextArray(data.review_notes)} emptyText="无审阅提醒。" />
        </ReviewSection>
      </div>
    );
  }
  const summary = asRecord(data.series_bible_summary);
  const characterSummary = asRecord(data.character_summary || data.character_arc_summary);
  const trackItems = asRecord(data.must_track_items);
  return (
    <div className="story-artifact-review">
      <ReviewHero
        title={textValue(summary.logline || data.logline, "全集概要")}
        subtitle={textValue(summary.mainline || data.mainline)}
        tags={asTextArray(summary.genre_tone_tags || data.genre_tone_tags)}
      />
      <ReviewSection title="章节图">
        <ChapterCardGrid rows={asArray(data.chapter_map || summary.chapter_map).map(asRecord)} />
      </ReviewSection>
      <ReviewSection title="角色摘要">
        <SimpleTable
          columns={[
            ["name", "角色"],
            ["role_function", "戏剧功能"],
            ["core_desire", "核心欲望"],
            ["performance_baseline", "表演底色"],
            ["identity_changes", "身份变化"],
          ]}
          rows={asArray(characterSummary.main_characters || data.character_summary || data.character_arc_summary).map(asRecord)}
          className="character-review-table"
        />
      </ReviewSection>
      <div className="review-two-col">
        <ReviewSection title="伏笔 / 母题">
          <ReviewMiniBlock title="伏笔" items={asArray(trackItems.foreshadowing_callbacks)} />
          <ReviewMiniBlock title="视觉母题" items={asArray(trackItems.visual_motifs)} />
        </ReviewSection>
        <ReviewSection title="道具 / 空间 / 变化风险">
          <ReviewMiniBlock title="道具" items={asArray(trackItems.recurring_props)} />
          <ReviewMiniBlock title="空间" items={asArray(trackItems.recurring_spaces)} />
          <ReviewMiniBlock title="变化风险" items={asArray(trackItems.asset_change_risks)} />
        </ReviewSection>
      </div>
    </div>
  );
}

function ReviewChapterSummary({ data }: { data: Record<string, unknown> }) {
  if (data.chapter_flow) {
    return (
      <div className="story-artifact-review">
        <ReviewHero title={`${textValue(data.chapter_id)} · ${textValue(data.episode_range)}`} subtitle={textValue(data.chapter_source_scope)} />
        <ReviewSection title="章节信息流">
          <FlowReview flow={asRecord(data.chapter_flow)} />
        </ReviewSection>
        <ReviewSection title="每集定位">
          <GenericObjectList rows={asArray(data.episode_outline).map(asRecord)} />
        </ReviewSection>
        <ReviewSection title="审阅提醒">
          <BulletList items={asTextArray(data.review_notes)} emptyText="无审阅提醒。" />
        </ReviewSection>
      </div>
    );
  }
  const chapters = asArray(data.chapter_cards).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewSection title="章节概要">
        <ChapterCardGrid rows={chapters} showEpisodes />
      </ReviewSection>
    </div>
  );
}

function ReviewEpisodeSummary({ data }: { data: Record<string, unknown> }) {
  if (data.scene_summaries) {
    return <ReviewSceneSummary data={data} />;
  }
  if (data.episode_flow) {
    return (
      <div className="story-artifact-review">
        <ReviewHero title={`${textValue(data.episode_id, "EP")} · 单集信息流`} subtitle={textValue(data.episode_source_scope)} />
        <ReviewSection title="单集信息流">
          <FlowReview flow={asRecord(data.episode_flow)} />
        </ReviewSection>
        <ReviewSection title="场次定位">
          <GenericObjectList rows={asArray(data.scene_outline).map(asRecord)} />
        </ReviewSection>
        <ReviewSection title="审阅提醒">
          <BulletList items={asTextArray(data.review_notes)} emptyText="无审阅提醒。" />
        </ReviewSection>
      </div>
    );
  }
  const emotionShift = asRecord(data.emotion_shift);
  return (
    <div className="story-artifact-review">
      <ReviewHero title={`${textValue(data.episode_id, "EP")} · ${textValue(data.one_line_task, "单集任务未生成")}`} subtitle={`情绪：${textValue(emotionShift.opening, "-")} -> ${textValue(emotionShift.ending, "-")} / 钩子：${textValue(data.hook_type, "-")}`} />
      <div className="review-two-col">
        <ReviewSection title="必须放大的细节">
          <BulletList items={asTextArray(data.must_enlarge_details)} emptyText="未输出必须放大的细节。" />
        </ReviewSection>
        <ReviewSection title="节奏指令">
          <PlainReviewText>{textValue(data.rhythm_instruction)}</PlainReviewText>
        </ReviewSection>
      </div>
      <ReviewSection title="承上启下">
        <KeyValueReview
          rows={[
            ["承上", data.carry_over],
            ["启下", data.handoff],
          ]}
        />
      </ReviewSection>
      <ReviewSection title="资产连续性关注">
        <BulletList items={asTextArray(data.asset_continuity_concerns)} emptyText="未输出资产连续性关注。" />
      </ReviewSection>
    </div>
  );
}

function ReviewSceneSummary({ data }: { data: Record<string, unknown> }) {
  const sceneSummaries = asArray(data.scene_summaries).map(asRecord);
  if (sceneSummaries.length) {
    return (
      <div className="story-artifact-review">
        <ReviewSection title={`场次概要（${sceneSummaries.length} 场）`}>
          <div className="generic-review-list">
            {sceneSummaries.map((scene, index) => (
              <article key={`${textValue(scene.scene_id, String(index + 1))}-${index}`}>
                <div>
                  <span>场次</span>
                  <p>{textValue(scene.scene_id, `SC${String(index + 1).padStart(2, "0")}`)}</p>
                </div>
                <div>
                  <span>场级信息</span>
                  <p>{textValue(asRecord(scene.scene_flow).narrative || scene.scene_dramatic_task)}</p>
                </div>
                <div>
                  <span>资产引用</span>
                  <p>{formatAssetRefs(asRecord(scene.scene_flow).asset_refs || scene.asset_bindings)}</p>
                </div>
                <div>
                  <span>空间状态</span>
                  <p>{textValue(asRecord(scene.scene_flow).space_state || scene.spatial_relation)}</p>
                </div>
              </article>
            ))}
          </div>
        </ReviewSection>
      </div>
    );
  }
  if (data.scene_flow) {
    return (
      <div className="story-artifact-review">
        <ReviewHero title={`${textValue(data.episode_id)} / ${textValue(data.scene_id)} 场级信息流`} subtitle={textValue(data.scene_source_scope)} />
        <ReviewSection title="场级信息流">
          <FlowReview flow={asRecord(data.scene_flow)} />
        </ReviewSection>
        <ReviewSection title="审阅提醒">
          <BulletList items={asTextArray(data.review_notes)} emptyText="无审阅提醒。" />
        </ReviewSection>
      </div>
    );
  }
  return (
    <div className="story-artifact-review">
      <ReviewHero title={`${textValue(data.episode_id)} / ${textValue(data.scene_id)} 导演简报`} subtitle={textValue(data.scene_dramatic_task)} />
      <ReviewSection title="角色入场状态">
        <SimpleTable
          columns={[
            ["name", "角色"],
            ["entry_state", "入场状态"],
            ["subtext", "潜台词"],
            ["arc_position", "弧线位置"],
          ]}
          rows={asArray(data.character_entry_states).map(asRecord)}
        />
      </ReviewSection>
      <div className="review-two-col">
        <ReviewSection title="必须强调的信息">
          <BulletList items={asTextArray(data.must_emphasize_information)} emptyText="未输出强调信息。" />
        </ReviewSection>
        <ReviewSection title="空间关系">
          <PlainReviewText>{textValue(data.spatial_relation)}</PlainReviewText>
        </ReviewSection>
      </div>
      <ReviewSection title="节奏氛围 / 承接">
        <KeyValueReview
          rows={[
            ["节奏氛围", data.rhythm_atmosphere],
            ["承接或钩子", data.carry_over_or_hook],
          ]}
        />
      </ReviewSection>
      <ReviewSection title="连续性风险">
        <BulletList items={asTextArray(data.continuity_risks)} emptyText="未输出连续性风险。" />
      </ReviewSection>
      <ReviewSection title="资产锚定">
        <AssetBindingSummary value={data.asset_bindings} />
      </ReviewSection>
    </div>
  );
}

function ReviewStoryboardDesign({ data }: { data: Record<string, unknown> }) {
  const blocks = asArray(data.video_blocks).map(asRecord);
  return (
    <div className="story-artifact-review">
      <ReviewHero title={`${textValue(data.episode_id)} / ${textValue(data.scene_id)} 分块规划`} subtitle={`上限 ${textValue(data.block_max_seconds, "15")} 秒`} />
      <ReviewSection title={`视频块（${blocks.length} 块）`}>
        <div className="storyboard-review-table-wrap">
          <table className="storyboard-review-table">
            <thead>
              <tr>
                <th>块号</th>
                <th>时长</th>
                <th>剧本原文</th>
                <th>结束状态</th>
                <th>块级补充</th>
                <th>资产</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block, index) => (
                <tr key={`${textValue(block.block_id, String(index + 1))}-${index}`}>
                  <td className="shot-no">{textValue(block.block_id, `VB${String(index + 1).padStart(3, "0")}`)}</td>
                  <td>{textValue(block.estimated_seconds || block.duration_seconds)}秒</td>
                  <td>{textValue(block.source_text)}</td>
                  <td>{textValue(block.end_state)}</td>
                  <td><small>{formatFlowOverrides(block.flow_overrides)}</small></td>
                  <td><small>{formatAssetRefs(asRecord(block.flow_overrides).asset_refs || block.asset_refs)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ReviewSection>
    </div>
  );
}

function ReviewVideoPrompt({ data }: { data: Record<string, unknown> }) {
  const groups = videoPromptItems(data);
  return (
    <div className="story-artifact-review">
      <ReviewSection title={`视频提示词（${groups.length} 块）`}>
        <div className="video-prompt-review-list">
          {groups.map((group, index) => (
            <article className="video-prompt-row" key={`${textValue(group.block_id, String(index + 1))}-${index}`}>
              <div className="video-prompt-index">
                <strong>{textValue(group.block_id, `VB${String(index + 1).padStart(3, "0")}`)}</strong>
                <span>提示词</span>
              </div>
              <div className="video-prompt-body">
                <p>{textValue(group.prompt)}</p>
                <div className="video-prompt-meta">
                  <span>资产：{formatAssetRefs(group.asset_refs) || "无"}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </ReviewSection>
    </div>
  );
}

function AssetBindingSummary({ value }: { value: unknown }) {
  const bindings = asRecord(value);
  const groups: [string, unknown][] = [
    ["角色", bindings.characters],
    ["场景", bindings.scenes],
    ["道具", bindings.props],
  ];
  const visibleGroups = groups.map(([label, items]) => [label, asArray(items).map(asRecord)] as [string, Record<string, unknown>[]]).filter(([, items]) => items.length);
  if (!visibleGroups.length) return <EmptyReviewText text="未输出资产锚定。" />;
  return (
    <div className="asset-binding-summary">
      {visibleGroups.map(([label, items]) => (
        <div key={label}>
          <strong>{label}</strong>
          <span>{items.map(formatAssetBinding).join(" / ")}</span>
        </div>
      ))}
    </div>
  );
}

function formatAssetBinding(record: Record<string, unknown>): string {
  const displayName = textValue(record.display_name || record.name, "-");
  const assetId = textValue(record.asset_id || record.id);
  const versionLabel = textValue(record.version_label);
  const stateNote = textValue(record.state_note);
  return [displayName, assetId, versionLabel, stateNote].filter(Boolean).join(" · ");
}

function formatAssetRefs(value: unknown): string {
  const refs = asArray(value).map(asRecord).filter((record) => Object.keys(record).length);
  if (!refs.length) return asTextArray(value).join(" / ");
  return refs.map((ref) => {
    const displayName = textValue(ref.display_name || ref.name, "-");
    const assetId = textValue(ref.asset_id || ref.id);
    const versionId = textValue(ref.version_id || ref.version_label);
    const usage = textValue(ref.usage);
    const overrideNote = textValue(ref.override_note);
    return [displayName, assetId, versionId, usage, overrideNote].filter(Boolean).join(" · ");
  }).join(" / ");
}

function formatFlowOverrides(value: unknown): string {
  const flow = asRecord(value);
  return [
    textValue(flow.narrative) && `剧情：${textValue(flow.narrative)}`,
    textValue(flow.character_state) && `角色：${textValue(flow.character_state)}`,
    textValue(flow.space_state) && `空间：${textValue(flow.space_state)}`,
    textValue(flow.visual_tone) && `影调：${textValue(flow.visual_tone)}`,
  ].filter(Boolean).join(" / ") || "-";
}

function formatContinuity(value: unknown): string {
  const rows = asArray(value).map(asRecord).filter((record) => Object.keys(record).length);
  if (!rows.length) return asTextArray(value).join(" / ");
  return rows.map((row) => {
    const target = textValue(row.target || row.name);
    const note = textValue(row.note || row.risk || row.reason);
    return [target, note].filter(Boolean).join("：");
  }).join(" / ");
}

function FlowReview({ flow }: { flow: Record<string, unknown> }) {
  return (
    <KeyValueReview
      rows={[
        ["剧情节奏", flow.narrative],
        ["角色状态", flow.character_state],
        ["资产引用", formatAssetRefs(flow.asset_refs)],
        ["空间状态", flow.space_state],
        ["视觉影调", flow.visual_tone],
        ["连续性", formatContinuity(flow.continuity)],
      ]}
    />
  );
}

function GenericArtifactReview({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="story-artifact-review">
      <ReviewSection title="结构化内容">
        <GenericObjectList rows={Object.entries(data).map(([key, value]) => ({ key, value }))} />
      </ReviewSection>
    </div>
  );
}

function ReviewHero({ title, subtitle, tags = [] }: { title: string; subtitle?: string; tags?: string[] }) {
  return (
    <section className="review-hero">
      <h3>{title}</h3>
      {subtitle && <p>{subtitle}</p>}
      {tags.length > 0 && (
        <div className="review-tags">
          {tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="review-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function TimelineList({ rows, leftKey, titleKey, detailKey }: { rows: Record<string, unknown>[]; leftKey: string; titleKey: string; detailKey: string }) {
  if (!rows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <div className="review-timeline">
      {rows.map((row, index) => (
        <article key={`${textValue(row[leftKey], String(index + 1))}-${index}`}>
          <strong>{textValue(row[leftKey], "-")}</strong>
          <p>{textValue(row[titleKey])}</p>
          <small>{textValue(row[detailKey])}</small>
        </article>
      ))}
    </div>
  );
}

function ChapterCardGrid({ rows, showEpisodes = false }: { rows: Record<string, unknown>[]; showEpisodes?: boolean }) {
  if (!rows.length) return <EmptyReviewText text="未输出章节信息。" />;
  return (
    <div className="chapter-review-grid">
      {rows.map((row, index) => {
        const episodes = asArray(row.episode_titles).map(asRecord);
        return (
          <article className="chapter-review-card" key={`${textValue(row.chapter_id, String(index + 1))}-${index}`}>
            <div>
              <strong>{textValue(row.chapter_name || row.chapter_id, `章节 ${index + 1}`)}</strong>
              <span>{textValue(row.episode_range)}</span>
            </div>
            <p>{textValue(row.chapter_note || row.chapter_function)}</p>
            <KeyValueReview
              rows={[
                ["位置", row.chapter_position],
                ["情绪", row.emotional_tone],
                ["母题/伏笔", row.required_motifs_or_foreshadowing],
                ["结束钩子", row.chapter_end_hook || row.end_hook],
              ]}
            />
            {showEpisodes && episodes.length > 0 && (
              <div className="episode-title-list">
                {episodes.map((episode, episodeIndex) => (
                  <div key={`${textValue(episode.episode_id, String(episodeIndex + 1))}-${episodeIndex}`}>
                    <strong>EP{textValue(episode.episode_id, String(episodeIndex + 1)).replace(/^EP/i, "")}</strong>
                    <span>{textValue(episode.title)}</span>
                    <small>{textValue(episode.one_line_synopsis)}</small>
                  </div>
                ))}
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function SimpleTable({ columns, rows, className = "" }: { columns: [string, string][]; rows: Record<string, unknown>[]; className?: string }) {
  if (!rows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <div className="simple-review-table-wrap">
      <table className={`simple-review-table ${className}`}>
        <thead>
          <tr>
            {columns.map(([, label]) => (
              <th key={label}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map(([key]) => (
                <td key={key}>{formatReviewValue(row[key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KeyValueReview({ rows }: { rows: [string, unknown][] }) {
  const visibleRows = rows.filter(([, value]) => textValue(value));
  if (!visibleRows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <dl className="key-value-review">
      {visibleRows.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{formatReviewValue(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function GenericObjectList({ rows, fallback = [] }: { rows: Record<string, unknown>[]; fallback?: string[] }) {
  if (!rows.length && fallback.length) return <BulletList items={fallback} />;
  if (!rows.length) return <EmptyReviewText text="未输出。" />;
  return (
    <div className="generic-review-list">
      {rows.map((row, index) => (
        <article key={index}>
          {Object.entries(row).map(([key, value]) => (
            <div key={key}>
              <span>{humanizeArtifactKey(key)}</span>
              <p>{formatReviewValue(value)}</p>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function ReviewMiniBlock({ title, items }: { title: string; items: unknown[] }) {
  return (
    <div className="review-mini-block">
      <strong>{title}</strong>
      {items.length ? <GenericObjectList rows={items.map(asRecord)} fallback={items.map((item) => textValue(item)).filter(Boolean)} /> : <EmptyReviewText text="未输出。" />}
    </div>
  );
}

function BulletList({ items, emptyText = "未输出。" }: { items: string[]; emptyText?: string }) {
  if (!items.length) return <EmptyReviewText text={emptyText} />;
  return (
    <ul className="review-bullet-list">
      {items.map((item, index) => (
        <li key={`${item}-${index}`}>{item}</li>
      ))}
    </ul>
  );
}

function PlainReviewText({ children }: { children: ReactNode }) {
  return <p className="plain-review-text">{children || "未输出。"}</p>;
}

function EmptyReviewText({ text }: { text: string }) {
  return <p className="empty-review-text">{text}</p>;
}

function formatReviewValue(value: unknown): ReactNode {
  if (Array.isArray(value)) {
    const items = asTextArray(value);
    return items.length ? items.join(" / ") : "";
  }
  if (value && typeof value === "object") {
    return Object.entries(asRecord(value))
      .map(([key, entry]) => `${humanizeArtifactKey(key)}：${textValue(entry)}`)
      .filter(Boolean)
      .join("；");
  }
  return textValue(value);
}

function humanizeArtifactKey(key: string) {
  const labels: Record<string, string> = {
    key: "字段",
    value: "内容",
    name: "名称",
    role_function: "功能",
    core_desire: "欲望",
    fatal_flaw: "缺陷",
    arc_start: "起点",
    arc_endpoint: "终点",
    relationship_changes: "关系变化",
    identity_changes: "身份变化",
    setup_episode: "埋设集",
    setup_text: "埋设内容",
    payoff_episode: "回收集",
    payoff_text: "回收内容",
    risk: "风险",
  };
  return labels[key] || key.replaceAll("_", " ");
}
