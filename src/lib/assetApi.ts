import { backendApiBaseUrl, backendRequest } from "./backendApi";

export type AssetKind = "characters" | "scenes" | "props";

export type AssetRecordItem = Record<string, string>;
export type AssetTrueSourceItem = Record<string, string>;

export interface AssetReviewBundle {
  records: Record<AssetKind, AssetRecordItem[]>;
  trueSources: Record<AssetKind, AssetTrueSourceItem[]>;
}

export const emptyAssetReviewBundle: AssetReviewBundle = {
  records: {
    characters: [],
    scenes: [],
    props: [],
  },
  trueSources: {
    characters: [],
    scenes: [],
    props: [],
  },
};

export function normalizeAssetReviewBundle(bundle: Partial<AssetReviewBundle> | undefined): AssetReviewBundle {
  return {
    records: {
      characters: normalizeRows(bundle?.records?.characters),
      scenes: normalizeRows(bundle?.records?.scenes),
      props: normalizeRows(bundle?.records?.props),
    },
    trueSources: {
      characters: normalizeRows(bundle?.trueSources?.characters),
      scenes: normalizeRows(bundle?.trueSources?.scenes),
      props: normalizeRows(bundle?.trueSources?.props),
    },
  };
}

export function loadProjectAssetReview(projectId: string) {
  return backendRequest<AssetReviewBundle>(`/api/projects/${encodeURIComponent(projectId)}/assets`);
}

export function saveProjectAssetReview(projectId: string, bundle: AssetReviewBundle) {
  return backendRequest<AssetReviewBundle>(`/api/projects/${encodeURIComponent(projectId)}/assets`, {
    method: "PUT",
    body: JSON.stringify(normalizeAssetReviewBundle(bundle)),
  });
}

export function extractProjectCharacterRecords(projectId: string) {
  return extractProjectAssetRecords(projectId, "characters");
}

export function extractProjectSceneRecords(projectId: string) {
  return extractProjectAssetRecords(projectId, "scenes");
}

export function extractProjectPropRecords(projectId: string) {
  return extractProjectAssetRecords(projectId, "props");
}

export function extractProjectAssetRecords(projectId: string, kind: AssetKind) {
  return backendRequest<AssetReviewBundle>(`/api/projects/${encodeURIComponent(projectId)}/assets/extract/${kind}`, {
    method: "POST",
  });
}

export interface UploadedAssetImage {
  id: string;
  label: string;
  url: string;
  path: string;
  bundle?: AssetReviewBundle;
}

export function uploadProjectAssetImage(projectId: string, kind: AssetKind, assetId: string, filename: string, dataUrl: string) {
  return backendRequest<UploadedAssetImage>(`/api/projects/${encodeURIComponent(projectId)}/assets/images`, {
    method: "POST",
    body: JSON.stringify({ kind, assetId, filename, dataUrl }),
  });
}

export function selectProjectAssetImage(projectId: string, kind: AssetKind, assetId: string, sourcePath: string) {
  return backendRequest<UploadedAssetImage>(`/api/projects/${encodeURIComponent(projectId)}/assets/images/select`, {
    method: "POST",
    body: JSON.stringify({ kind, assetId, sourcePath }),
  });
}

export function deleteProjectAssetCandidateImage(projectId: string, sourcePath: string) {
  return backendRequest<{ ok: true }>(`/api/projects/${encodeURIComponent(projectId)}/assets/images/delete-candidate`, {
    method: "POST",
    body: JSON.stringify({ sourcePath }),
  });
}

export function generateProjectAssetImage(projectId: string, kind: AssetKind, assetId: string, prompt: string) {
  return backendRequest<{ selected: UploadedAssetImage; candidates: Array<{ id: string; label: string; url: string }>; bundle: AssetReviewBundle }>(
    `/api/projects/${encodeURIComponent(projectId)}/assets/images/generate`,
    {
      method: "POST",
      body: JSON.stringify({ kind, assetId, prompt }),
    },
  );
}

export function toBackendAssetImageUrl(url: string) {
  if (!url || url.startsWith("http") || url.startsWith("data:")) return url;
  return `${backendApiBaseUrl}${url}`;
}

function normalizeRows(rows: unknown): Record<string, string>[] {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row))
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, typeof value === "string" ? value : value == null ? "" : JSON.stringify(value)]),
      ),
    );
}
