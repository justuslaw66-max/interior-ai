export type FloorPlanSavedUnderlayScrubResult = {
  snapshot: unknown;
  scrubbed: boolean;
};

export type FloorPlanSavedUnderlaySourceLink = {
  sourceJobId: string | null;
  sourceAssetSha256: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function savedFloorPlanUnderlaySourceLink(
  snapshot: unknown
): FloorPlanSavedUnderlaySourceLink | null {
  if (!isRecord(snapshot) || !isRecord(snapshot.floorPlan)) return null;
  const floorPlan = snapshot.floorPlan;
  if (!isRecord(floorPlan.underlay)) return null;
  const underlay = floorPlan.underlay;
  const sourceJobId =
    typeof underlay.sourceJobId === "string"
      ? underlay.sourceJobId.trim()
      : typeof floorPlan.sourceJobId === "string"
        ? floorPlan.sourceJobId.trim()
        : "";
  const sourceAssetSha256 =
    typeof underlay.sourceAssetSha256 === "string"
      ? underlay.sourceAssetSha256.trim().toLowerCase()
      : typeof floorPlan.sourceAssetSha256 === "string"
        ? floorPlan.sourceAssetSha256.trim().toLowerCase()
        : "";
  return {
    sourceJobId:
      sourceJobId && sourceJobId.length <= 191 ? sourceJobId : null,
    sourceAssetSha256: /^[a-f0-9]{64}$/.test(sourceAssetSha256)
      ? sourceAssetSha256
      : null,
  };
}

/**
 * Removes only the persisted private underlay linked to an import. Rooms,
 * furniture, openings, canonical geometry and verification metadata remain
 * byte-for-byte equivalent after JSON serialization.
 */
export function scrubPrivateFloorPlanUnderlayFromSnapshot(input: {
  snapshot: unknown;
  affectedJobIds: readonly string[];
  sourceAssetSha256: string;
}): FloorPlanSavedUnderlayScrubResult {
  if (!isRecord(input.snapshot) || !isRecord(input.snapshot.floorPlan)) {
    return { snapshot: input.snapshot, scrubbed: false };
  }
  const floorPlan = input.snapshot.floorPlan;
  if (!isRecord(floorPlan.underlay)) {
    return { snapshot: input.snapshot, scrubbed: false };
  }
  const underlay = floorPlan.underlay;
  const affectedJobIds = new Set(input.affectedJobIds);
  const linkedJobId =
    typeof underlay.sourceJobId === "string"
      ? underlay.sourceJobId
      : typeof floorPlan.sourceJobId === "string"
        ? floorPlan.sourceJobId
        : null;
  const linkedSourceSha256 =
    typeof underlay.sourceAssetSha256 === "string"
      ? underlay.sourceAssetSha256
      : typeof floorPlan.sourceAssetSha256 === "string"
        ? floorPlan.sourceAssetSha256
        : null;
  const matchesJob = Boolean(linkedJobId && affectedJobIds.has(linkedJobId));
  const matchesSource =
    linkedSourceSha256?.toLowerCase() === input.sourceAssetSha256.toLowerCase();
  if (!matchesJob && !matchesSource) {
    return { snapshot: input.snapshot, scrubbed: false };
  }

  return {
    snapshot: {
      ...input.snapshot,
      floorPlan: {
        ...floorPlan,
        underlay: null,
      },
    },
    scrubbed: true,
  };
}
