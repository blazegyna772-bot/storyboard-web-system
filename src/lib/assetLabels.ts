import type { AssetKind } from "./assetApi";

export const assetKindOptions: Array<{ id: AssetKind; label: string }> = [
  { id: "characters", label: "角色" },
  { id: "scenes", label: "场景" },
  { id: "props", label: "道具" },
];

export function assetKindLabel(kind: AssetKind) {
  return assetKindOptions.find((item) => item.id === kind)?.label ?? kind;
}
