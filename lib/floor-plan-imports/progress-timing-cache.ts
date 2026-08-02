import type { FloorPlanStageDurationSample } from "./progress-estimate";

type CachedTimingSamples = {
  expiresAt: number;
  samples: FloorPlanStageDurationSample[];
};

const profileCache = new Map<string, CachedTimingSamples>();

export function floorPlanTimingProfileCacheKey(
  adapterId: string | null,
  extractionVersion: string | null
) {
  return `${adapterId ?? "unknown"}:${extractionVersion ?? "unknown"}`;
}

export function readFloorPlanTimingProfileCache(key: string, now = Date.now()) {
  const cached = profileCache.get(key);
  if (!cached || cached.expiresAt <= now) {
    profileCache.delete(key);
    return null;
  }
  return cached.samples;
}

export function writeFloorPlanTimingProfileCache(
  key: string,
  samples: FloorPlanStageDurationSample[],
  now = Date.now()
) {
  profileCache.set(key, {
    expiresAt: now + 5 * 60_000,
    samples,
  });
}

export function invalidateFloorPlanTimingProfile(
  adapterId: string | null,
  extractionVersion: string | null
) {
  profileCache.delete(
    floorPlanTimingProfileCacheKey(adapterId, extractionVersion)
  );
}
