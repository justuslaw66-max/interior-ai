import type { ImportJobReport } from "@/lib/import-jobs/types";

export type ImportCheckLike = {
  severity: "error" | "warning";
  code: string;
  message: string;
};

export type ImportMetricsLike = {
  fileSizeBytes?: number;
  triangleCount?: number | null;
  textureCount?: number | null;
  maxTextureSize?: number | null;
};

export function buildImportJobReport(
  checks: ImportCheckLike[],
  metrics: ImportMetricsLike = {}
): ImportJobReport {
  return {
    warnings: checks
      .filter((check) => check.severity === "warning")
      .map((check) => `[${check.code}] ${check.message}`),
    blockers: checks
      .filter((check) => check.severity === "error")
      .map((check) => `[${check.code}] ${check.message}`),
    metrics: {
      fileSizeBytes: metrics.fileSizeBytes,
      triangleCount: metrics.triangleCount ?? undefined,
      textureCount: metrics.textureCount ?? undefined,
      maxTextureSize: metrics.maxTextureSize ?? undefined,
    },
  };
}
