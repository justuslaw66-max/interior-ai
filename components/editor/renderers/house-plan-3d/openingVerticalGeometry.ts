import { resolvePlanOpeningVerticalMetrics } from "@/lib/design-page-plan-overlays";

type OpeningVerticalInput = {
  kind: "door" | "window";
  height?: number;
  bottom?: number;
};

export function openingMatchesHostSegment(
  opening: { roomId?: string; hostSegmentKey?: string; wall: string },
  roomId: string,
  segment: { key: string; wall?: string }
): boolean {
  return opening.roomId === roomId && (opening.hostSegmentKey
    ? opening.hostSegmentKey === segment.key
    : opening.wall === segment.wall);
}

function scaleToDisplay(
  valueMeters: number,
  wallHeight: number,
  physicalWallHeight: number
) {
  return (valueMeters / Math.max(0.2, physicalWallHeight)) * wallHeight;
}

export function getOpeningDisplayHeight(
  opening: OpeningVerticalInput,
  wallHeight: number,
  physicalWallHeight: number
): number {
  const { heightMeters } = resolvePlanOpeningVerticalMetrics(
    {
      kind: opening.kind,
      heightMeters: opening.height,
      bottomMeters: opening.bottom,
    },
    physicalWallHeight
  );
  return Math.min(
    Math.max(0.001, scaleToDisplay(heightMeters, wallHeight, physicalWallHeight)),
    wallHeight
  );
}

export function getOpeningDisplayBottom(
  opening: OpeningVerticalInput,
  wallHeight: number,
  physicalWallHeight: number
) {
  const { bottomMeters } = resolvePlanOpeningVerticalMetrics(
    {
      kind: opening.kind,
      heightMeters: opening.height,
      bottomMeters: opening.bottom,
    },
    physicalWallHeight
  );
  return Math.min(
    Math.max(0, scaleToDisplay(bottomMeters, wallHeight, physicalWallHeight)),
    Math.max(0, wallHeight - 0.001)
  );
}
