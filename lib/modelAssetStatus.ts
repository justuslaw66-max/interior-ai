export type ModelAssetLike = {
  approved?: boolean;
  notes?: string | null;
};

export type ModelAssetStatus = "draft" | "needs_fix" | "approved";

export function getModelAssetStatus(asset: ModelAssetLike): ModelAssetStatus {
  if (asset.approved) return "approved";
  if (/\[STATUS:needs_fix\]/.test(asset.notes ?? "") || (asset.notes?.includes("[QA]") ?? false)) {
    return "needs_fix";
  }
  return "draft";
}
