export type ImportQaLimits = {
  maxFileSizeBytes: number;
  maxTriangles: number;
  maxTextureCount: number;
  maxTextureResolution: number;
  minAabbAxisMeters: number;
  maxAabbAxisMeters: number;
  /** Mesh-vs-catalog proportion drift that is still accepted silently (0.05 = 5 %). */
  dimensionWarnRatio: number;
  /** Mesh-vs-catalog proportion drift that blocks the import. */
  dimensionErrorRatio: number;
};

export const DEFAULT_IMPORT_QA_LIMITS: ImportQaLimits = {
  maxFileSizeBytes: 20 * 1024 * 1024, // 20MB
  maxTriangles: 120_000,
  maxTextureCount: 8,
  maxTextureResolution: 2048,
  minAabbAxisMeters: 0.05,
  maxAabbAxisMeters: 8,
  dimensionWarnRatio: 0.05,
  dimensionErrorRatio: 0.15,
};

function envNumber(name: string, fallback: number, env: NodeJS.ProcessEnv): number {
  const raw = env[name];
  if (!raw) return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return value;
}

export function resolveImportQaLimits(env: NodeJS.ProcessEnv = process.env): ImportQaLimits {
  return {
    maxFileSizeBytes:
      envNumber(
        "IMPORT_QA_MAX_FILE_SIZE_MB",
        DEFAULT_IMPORT_QA_LIMITS.maxFileSizeBytes / (1024 * 1024),
        env
      ) *
      1024 *
      1024,
    maxTriangles: Math.round(
      envNumber("IMPORT_QA_MAX_TRIANGLES", DEFAULT_IMPORT_QA_LIMITS.maxTriangles, env)
    ),
    maxTextureCount: Math.round(
      envNumber("IMPORT_QA_MAX_TEXTURE_COUNT", DEFAULT_IMPORT_QA_LIMITS.maxTextureCount, env)
    ),
    maxTextureResolution: Math.round(
      envNumber(
        "IMPORT_QA_MAX_TEXTURE_RESOLUTION",
        DEFAULT_IMPORT_QA_LIMITS.maxTextureResolution,
        env
      )
    ),
    minAabbAxisMeters: envNumber(
      "IMPORT_QA_MIN_AABB_AXIS_M",
      DEFAULT_IMPORT_QA_LIMITS.minAabbAxisMeters,
      env
    ),
    maxAabbAxisMeters: envNumber(
      "IMPORT_QA_MAX_AABB_AXIS_M",
      DEFAULT_IMPORT_QA_LIMITS.maxAabbAxisMeters,
      env
    ),
    dimensionWarnRatio:
      envNumber("IMPORT_QA_DIMENSION_WARN_PCT", DEFAULT_IMPORT_QA_LIMITS.dimensionWarnRatio * 100, env) / 100,
    dimensionErrorRatio:
      envNumber("IMPORT_QA_DIMENSION_ERROR_PCT", DEFAULT_IMPORT_QA_LIMITS.dimensionErrorRatio * 100, env) / 100,
  };
}

export function bytesToMiB(bytes: number): number {
  return bytes / (1024 * 1024);
}
