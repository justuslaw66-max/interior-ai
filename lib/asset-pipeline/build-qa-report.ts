import type { AssetQaReport, AssetQaStatus } from "./types";

type BuildAssetQaReportInput = {
  score: number;
  warnings: string[];
  blockers: string[];
  metrics: {
    fileSizeBytes?: number;
    triangleCount?: number | null;
    textureCount?: number | null;
    maxTextureSize?: number | null;
  };
};

function resolveStatus(score: number, blockers: string[]): AssetQaStatus {
  if (blockers.length > 0) return "blocked";
  if (score < 70) return "needs_fix";
  return "approved";
}

export function buildAssetQaReport(input: BuildAssetQaReportInput): AssetQaReport {
  const metrics = {
    fileSizeBytes: input.metrics.fileSizeBytes ?? 0,
    triangleCount: input.metrics.triangleCount ?? 0,
    textureCount: input.metrics.textureCount ?? 0,
    maxTextureSize: input.metrics.maxTextureSize ?? 0,
  };

  return {
    score: input.score,
    status: resolveStatus(input.score, input.blockers),
    blockers: input.blockers,
    warnings: input.warnings,
    metrics,
  };
}
