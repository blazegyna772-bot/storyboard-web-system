import { toBackendAssetImageUrl, type AssetKind, type AssetReviewBundle } from "../lib/assetApi";
import { assetKindLabel } from "../lib/assetLabels";
import { asArray, asRecord, asTextArray, textValue } from "../lib/valueFormat";

export type VideoAssetThumb = {
  kind: AssetKind;
  id: string;
  name: string;
  imageUrl: string;
};

export function AssetLibrarySection({ title, assets }: { title: string; assets: VideoAssetThumb[] }) {
  return (
    <div className="video-asset-library-section">
      <strong>{title}</strong>
      <AssetThumbGrid assets={assets} emptyText="暂无资产。" />
    </div>
  );
}

export function AssetThumbGrid({ assets, emptyText }: { assets: VideoAssetThumb[]; emptyText: string }) {
  if (!assets.length) return <div className="video-asset-empty">{emptyText}</div>;
  return (
    <div className="video-asset-thumb-grid">
      {assets.map((asset, index) => (
        <div className="video-asset-thumb" key={`${asset.kind}-${asset.id || asset.name}-${index}`}>
          <div>
            {asset.imageUrl ? <img src={toBackendAssetImageUrl(asset.imageUrl)} alt={asset.name} /> : <span>{asset.name.slice(0, 2) || "资产"}</span>}
          </div>
          <small>{asset.name || asset.id || "未命名"}</small>
        </div>
      ))}
    </div>
  );
}

export function buildVideoAssetThumbs(bundle: AssetReviewBundle): VideoAssetThumb[] {
  const kinds: AssetKind[] = ["characters", "scenes", "props"];
  return kinds.flatMap((kind) =>
    (bundle.trueSources[kind] ?? []).map((row, index) => ({
      kind,
      id: row.id || row.asset_id || row.name || `${kind}-${index}`,
      name: row.name || row.base_name || row.id || `${assetKindLabel(kind)}${index + 1}`,
      imageUrl: row.selected_image || row.image_url || row.image_path || "",
    })),
  );
}

export function buildAnchoredAssetThumbs(group: Record<string, unknown> | undefined, assets: VideoAssetThumb[]): VideoAssetThumb[] {
  const refs = new Set<string>();
  for (const ref of asArray(group?.asset_refs).map(asRecord)) {
    for (const key of ["asset_id", "id", "name", "display_name"]) {
      const value = textValue(ref[key]);
      if (value) refs.add(value);
    }
  }
  for (const value of [...asTextArray(group?.asset_ids), ...asTextArray(group?.reference_asset_ids)]) {
    for (const part of value.split(/[,\s/：:]+/)) {
      if (part.trim()) refs.add(part.trim());
    }
  }
  if (!refs.size) return [];
  return assets.filter((asset) => refs.has(asset.id) || refs.has(asset.name));
}
