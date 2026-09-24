import type { FloorPlanFloorV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";

/** Length is derived from the canonical integer-mm endpoints, never stored separately. */
export function proposedWallLengthEndpoint(floor: FloorPlanFloorV2, wall: FloorPlanWallV2, requestedLengthMm: number) {
  if (wall.path.kind !== "line" || !Number.isSafeInteger(requestedLengthMm) || requestedLengthMm <= 0) return null;
  const start = floor.vertices.find(({ id }) => id === wall.path.startVertexId);
  const end = floor.vertices.find(({ id }) => id === wall.path.endVertexId);
  if (!start || !end) return null;
  const dx = end.xMm - start.xMm, dz = end.zMm - start.zMm;
  const length = Math.hypot(dx, dz);
  if (!length) return null;
  const to = { xMm: Math.round(start.xMm + dx * requestedLengthMm / length), zMm: Math.round(start.zMm + dz * requestedLengthMm / length) };
  if (!Number.isSafeInteger(to.xMm) || !Number.isSafeInteger(to.zMm)) return null;
  const actualLengthMm = Math.hypot(to.xMm - start.xMm, to.zMm - start.zMm);
  if (!actualLengthMm) return null;
  return { vertexId: end.id, to, actualLengthMm, changed: to.xMm !== end.xMm || to.zMm !== end.zMm };
}
