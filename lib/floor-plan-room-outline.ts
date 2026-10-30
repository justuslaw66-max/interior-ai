import type { CompiledFloorPlanRoomLoopV2, CompiledFloorPlanWallV2 } from "@/lib/floor-plan-compiler-v2";

/**
 * An imported room's outline, as the import builds it (lib/floor-plan-legacy-adapters.ts) and as a design saved before its
 * edges were named is matched to its plan (lib/imported-room-edge-walls.ts): the wall centre lines of a room's loop, a
 * straight wall by its start and an arc by points along it.
 */

function sampleWall(
  wall: CompiledFloorPlanWallV2,
  direction: "forward" | "reverse"
): Array<{ xMm: number; zMm: number }> {
  const authoredStart = direction === "forward" ? wall.start : wall.end;
  if (wall.path.kind === "line" || !wall.center || wall.sweepRadians === undefined) {
    return [authoredStart];
  }
  const sweep = direction === "forward" ? wall.sweepRadians : -wall.sweepRadians;
  const startAngle = Math.atan2(
    authoredStart.zMm - wall.center.zMm,
    authoredStart.xMm - wall.center.xMm
  );
  const radius = Math.hypot(
    authoredStart.xMm - wall.center.xMm,
    authoredStart.zMm - wall.center.zMm
  );
  const segmentCount = Math.max(4, Math.ceil(Math.abs(sweep) / (Math.PI / 16)));
  return Array.from({ length: segmentCount }, (_, index) => {
    const angle = startAngle + sweep * (index / segmentCount);
    return {
      xMm: Math.round(wall.center!.xMm + Math.cos(angle) * radius),
      zMm: Math.round(wall.center!.zMm + Math.sin(angle) * radius),
    };
  });
}

/** The loop's outline points, each with the wall its edge to the next point lies on and its thickness (an arc gives several). */
export function roomPolygonEdges(loop: CompiledFloorPlanRoomLoopV2, wallById: Map<string, CompiledFloorPlanWallV2>) {
  return loop.walls.flatMap((reference) => {
    const wall = wallById.get(reference.wallId);
    return wall ? sampleWall(wall, reference.direction).map((point) => ({ point, wallId: wall.id, thicknessMm: wall.thicknessMm })) : [];
  });
}

/** The point the import centres a room's outline on: its bounding box's middle, to the millimetre. */
export function roomOutlineCenterMm(points: readonly { xMm: number; zMm: number }[]) {
  const xs = points.map((point) => point.xMm), zs = points.map((point) => point.zMm);
  return { xMm: Math.round((Math.min(...xs) + Math.max(...xs)) / 2), zMm: Math.round((Math.min(...zs) + Math.max(...zs)) / 2) };
}
