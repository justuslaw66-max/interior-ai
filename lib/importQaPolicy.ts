export type ImportQaLimits = {
  maxFileSizeBytes: number;
  maxTriangles: number;
  maxTextureCount: number;
  maxTextureResolution: number;
  minAabbAxisMeters: number;
  maxAabbAxisMeters: number;
};

export const DEFAULT_IMPORT_QA_LIMITS: ImportQaLimits = {
  maxFileSizeBytes: 20 * 1024 * 1024, // 20MB
  maxTriangles: 120_000,
  maxTextureCount: 8,
  maxTextureResolution: 2048,
  minAabbAxisMeters: 0.05,
  maxAabbAxisMeters: 8,
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
  };
}

export function bytesToMiB(bytes: number): number {
  return bytes / (1024 * 1024);
}
