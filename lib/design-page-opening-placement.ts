import type { HousePlan2D } from "@/lib/design-page-house-plan";
import {
  resolveDesignPageOpeningHost,
  type DesignPagePhysicalWallHost,
} from "@/lib/design-page-opening-host";
import {
  legacyOpeningOffsetAtWorldPoint,
  worldPointAtOpeningHostAlong,
} from "@/lib/design-page-opening-interaction";
import { metersToMm, type RoomOpening2D } from "@/lib/editorScene";

export type DesignPageOpeningPlacementContext = {
  rooms: HousePlan2D["rooms"];
  /** Retained for camera/plan-bound callers; never interpreted as wall geometry. */
  planWidthMeters: number;
  /** Retained for camera/plan-bound callers; never interpreted as wall geometry. */
  planDepthMeters: number;
};

export type DesignPageOpeningPlacementValidation =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "opening_too_wide"
        | "too_close_to_corner"
        | "too_close_to_opening"
        | "blocked_by_wall"
        | "unresolved_wall_host"
        | "ambiguous_wall_host";
      label: string;
    };

const OPENING_CORNER_CLEARANCE_METERS = 0.18;
const OPENING_SPACING_METERS = 0.18;

type PlacementOpening = Pick<
  RoomOpening2D,
  | "id"
  | "roomId"
  | "wall"
  | "offsetMm"
  | "widthMm"
  | "kind"
  | "canonicalWallId"
>;

function hostRange(host: DesignPagePhysicalWallHost) {
  return { low: 0, high: host.spanMeters };
}

function placementOpening(
  opening: Omit<PlacementOpening, "id"> & { id?: string },
  fallbackId: string
): PlacementOpening {
  return { ...opening, id: opening.id ?? fallbackId };
}

function hostFailure(
  status: "unresolved" | "ambiguous" | "unsupported" | "invalid"
): DesignPageOpeningPlacementValidation {
  if (status === "ambiguous") {
    return {
      valid: false,
      reason: "ambiguous_wall_host",
      label: "Opening wall is ambiguous",
    };
  }
  return {
    valid: false,
    reason: "unresolved_wall_host",
    label: "Opening has no physical wall",
  };
}

function hasOpeningCollision(
  existingOpenings: Array<Omit<PlacementOpening, "kind">>,
  ignoreOpeningId: string | undefined,
  host: DesignPagePhysicalWallHost,
  halfWidth: number,
  rooms: HousePlan2D["rooms"]
): boolean {
  return existingOpenings.some((existing) => {
    if (ignoreOpeningId && existing.id === ignoreOpeningId) return false;
    const resolution = resolveDesignPageOpeningHost(
      placementOpening({ ...existing, kind: "window" }, existing.id), rooms
    );
    if (resolution.status !== "resolved") return false;
    if (resolution.host.physicalWallId !== host.physicalWallId) return false;
    const requiredDistance =
      existing.widthMm / 2000 + halfWidth + OPENING_SPACING_METERS;
    return Math.abs(resolution.host.alongSegmentMeters - host.alongSegmentMeters) <
      requiredDistance;
  });
}

export function validateDesignPageOpeningPlacement(
  opening: Omit<PlacementOpening, "id"> & { id?: string }, existingOpenings: Array<Omit<PlacementOpening, "kind">>,
  ignoreOpeningId: string | undefined, context: DesignPageOpeningPlacementContext
): DesignPageOpeningPlacementValidation {
  const candidate = placementOpening(opening, ignoreOpeningId ?? "__candidate__");
  const resolution = resolveDesignPageOpeningHost(candidate, context.rooms);
  if (resolution.status !== "resolved") return hostFailure(resolution.status);

  const widthMeters = candidate.widthMm / 1000; const range = hostRange(resolution.host);
  const maxUsableWidth =
    resolution.host.spanMeters - OPENING_CORNER_CLEARANCE_METERS * 2;
  if (widthMeters > maxUsableWidth) {
    return {
      valid: false,
      reason: "opening_too_wide",
      label: "Opening is too wide for this wall",
    };
  }
  const halfWidth = widthMeters / 2;
  const cornerDistance = Math.min(
    resolution.host.alongSegmentMeters - halfWidth - range.low,
    range.high - resolution.host.alongSegmentMeters - halfWidth
  );
  if (cornerDistance < OPENING_CORNER_CLEARANCE_METERS) {
    return {
      valid: false,
      reason: "too_close_to_corner",
      label: "Too close to corner",
    };
  }

  const collision = hasOpeningCollision(
    existingOpenings, ignoreOpeningId, resolution.host, halfWidth, context.rooms
  );
  return collision
    ? {
        valid: false,
        reason: "too_close_to_opening",
        label: "Too close to another opening",
      }
    : { valid: true };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function collectCandidateCenters(
  opening: RoomOpening2D,
  openingList: RoomOpening2D[],
  host: DesignPagePhysicalWallHost,
  rooms: HousePlan2D["rooms"],
  halfWidth: number,
  requestedCenter: number,
  low: number,
  high: number
): Set<number> {
  const centers = new Set<number>([requestedCenter, low, high]);
  for (const blocker of openingList) {
    if (blocker.id === opening.id) continue;
    const resolution = resolveDesignPageOpeningHost(blocker, rooms);
    if (resolution.status !== "resolved" ||
        resolution.host.physicalWallId !== host.physicalWallId) continue;
    const distance = blocker.widthMm / 2000 + halfWidth + OPENING_SPACING_METERS;
    centers.add(clamp(resolution.host.alongSegmentMeters - distance, low, high));
    centers.add(clamp(resolution.host.alongSegmentMeters + distance, low, high));
  }
  return centers;
}

export function clampDesignPageOpeningToNearestClearInterval(
  opening: RoomOpening2D, existingOpenings: RoomOpening2D[] | RoomOpening2D,
  context: DesignPageOpeningPlacementContext
): RoomOpening2D {
  const resolution = resolveDesignPageOpeningHost(opening, context.rooms);
  if (resolution.status !== "resolved") return opening;
  const host = resolution.host;
  const range = hostRange(host);
  const halfWidth = opening.widthMm / 2000;
  const low = range.low + halfWidth + OPENING_CORNER_CLEARANCE_METERS;
  const high = range.high - halfWidth - OPENING_CORNER_CLEARANCE_METERS;
  if (high < low) return opening;

  const requestedCenter = clamp(host.alongSegmentMeters, low, high);
  const openingList = Array.isArray(existingOpenings) ? existingOpenings : [existingOpenings];
  const candidates = collectCandidateCenters(
    opening, openingList, host, context.rooms, halfWidth,
    requestedCenter, low, high
  );

  const best = [...candidates]
    .map((alongSegmentMeters) => {
      const worldCenter = worldPointAtOpeningHostAlong(host, alongSegmentMeters);
      const offsetMeters = legacyOpeningOffsetAtWorldPoint(host, worldCenter);
      const candidate = {
        ...opening,
        offsetMm: offsetMeters === null
          ? opening.offsetMm
          : metersToMm(offsetMeters),
      };
      const candidateResolution = resolveDesignPageOpeningHost(
        candidate,
        context.rooms
      );
      const validation = validateDesignPageOpeningPlacement(
        candidate,
        openingList,
        opening.id,
        context
      );
      return {
        candidate,
        valid:
          validation.valid &&
          candidateResolution.status === "resolved" &&
          candidateResolution.host.physicalWallId === host.physicalWallId,
        distance: Math.abs(alongSegmentMeters - requestedCenter),
      };
    })
    .filter(({ valid }) => valid)
    .sort((first, second) => first.distance - second.distance)[0];
  const requestedWorldCenter = worldPointAtOpeningHostAlong(host, requestedCenter);
  const requestedOffsetMeters = legacyOpeningOffsetAtWorldPoint(
    host,
    requestedWorldCenter
  );
  return best?.candidate ?? (requestedOffsetMeters === null
    ? opening
    : { ...opening, offsetMm: metersToMm(requestedOffsetMeters) });
}
