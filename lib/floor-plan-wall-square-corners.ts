import type { FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";
import type { AuthoredWallEndpoint } from "@/lib/floor-plan-wall-footprints";

const WALL_JOIN_EPSILON_MM = 0.01;
const AXIS_ALIGNED_SINE = Math.sin((0.5 * Math.PI) / 180);

type WallJoinSide = 1 | -1;

/** The footprint helpers of lib/floor-plan-wall-footprints.ts the square corner works with. */
export type SquareCornerTools = {
  offsetLine: (
    reference: AuthoredWallEndpoint,
    outwardSide: WallJoinSide
  ) => { point: FloorPlanPointMmV2 } | null;
  setPoint: (reference: AuthoredWallEndpoint, outwardSide: WallJoinSide, point: FloorPlanPointMmV2) => void;
  roundPoint: (point: FloorPlanPointMmV2) => FloorPlanPointMmV2;
};

function isAxisAlignedDirection(angle: number) {
  return (
    Math.abs(Math.sin(angle)) <= AXIS_ALIGNED_SINE ||
    Math.abs(Math.cos(angle)) <= AXIS_ALIGNED_SINE
  );
}

/** The other walls at the vertex that cross this one (at a right angle). */
function crossingWalls(references: AuthoredWallEndpoint[], reference: AuthoredWallEndpoint) {
  return references.filter(
    (other) =>
      other !== reference &&
      Math.abs(Math.cos(other.angle - reference.angle)) <= AXIS_ALIGNED_SINE * 2
  );
}

/**
 * A plain L of two walls each at least as long as either is thick: the mitre
 * meets on the diagonal and the two footprints share both corners, so the
 * corner is already square. A shorter wall (an ownership step, a jog) falls
 * back to its plain rectangle (wallFootprintIsStable) and leaves the
 * neighbour's mitre pointing at nothing - a notch.
 */
function isPlainLongL(references: AuthoredWallEndpoint[]) {
  if (references.length !== 2) return false;
  const thickestMm = Math.max(...references.map((reference) => reference.wall.thicknessMm));
  return references.every(
    (reference) =>
      (reference.wall.centerlineSegments.at(-1)?.endOffsetMm ?? 0) >=
      thickestMm - WALL_JOIN_EPSILON_MM
  );
}

/** One wall's end carried on past the vertex by half the thickness of the thickest wall crossing it. */
function runWallEndOn(
  references: AuthoredWallEndpoint[],
  reference: AuthoredWallEndpoint,
  tools: SquareCornerTools
) {
  const runOnMm =
    Math.max(0, ...crossingWalls(references, reference).map((other) => other.wall.thicknessMm)) / 2;
  const end = {
    xMm: reference.joint.xMm - Math.cos(reference.angle) * runOnMm,
    zMm: reference.joint.zMm - Math.sin(reference.angle) * runOnMm,
  };
  for (const outwardSide of [1, -1] as const) {
    const line = tools.offsetLine(reference, outwardSide);
    if (!line) continue;
    // The offset line's point lies beside the segment's start; carry it to beside the end.
    const offsetX = line.point.xMm - reference.segment.start.xMm;
    const offsetZ = line.point.zMm - reference.segment.start.zMm;
    tools.setPoint(
      reference,
      outwardSide,
      tools.roundPoint({ xMm: end.xMm + offsetX, zMm: end.zMm + offsetZ })
    );
  }
}

/**
 * Where every wall meeting at a vertex is level or plumb and a mitre cannot
 * close the corner cleanly - a T or X junction, or an L with a wall shorter than
 * the other is thick (an ownership step or a jog of an imported plan) - the
 * walls meet in a square corner: each wall's end runs on past the vertex by
 * half the thickness of the thickest wall crossing it there, and the walls'
 * footprints, united, close the corner whatever their thicknesses. There a
 * mitre leaves a spike or a notch. A plain L of two long walls, and every
 * vertex with a slanted wall, keep the mitre. Returns false where the vertex is
 * left to the mitre.
 */
export function squareAxisAlignedWallNode(
  references: AuthoredWallEndpoint[],
  tools: SquareCornerTools
) {
  if (references.length < 2) return false;
  if (!references.every((reference) => isAxisAlignedDirection(reference.angle))) return false;
  if (!references.some((reference) => crossingWalls(references, reference).length > 0)) return false;
  if (isPlainLongL(references)) return false;
  for (const reference of references) runWallEndOn(references, reference, tools);
  return true;
}
