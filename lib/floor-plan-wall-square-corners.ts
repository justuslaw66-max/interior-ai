import type { FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";
import type { AuthoredWallEndpoint } from "@/lib/floor-plan-wall-footprints";
import { joinThroughWallNode } from "@/lib/floor-plan-wall-through-joins";

const WALL_JOIN_EPSILON_MM = 0.01;
// Walls within half a degree of a direction run along it.
const HALF_DEGREE_SINE = Math.sin((0.5 * Math.PI) / 180);

type WallJoinSide = 1 | -1;

/** The footprint helpers of lib/floor-plan-wall-footprints.ts the square corner works with. */
export type SquareCornerTools = {
  offsetLine: (
    reference: AuthoredWallEndpoint,
    outwardSide: WallJoinSide
  ) => { point: FloorPlanPointMmV2; direction: FloorPlanPointMmV2 } | null;
  setPoint: (reference: AuthoredWallEndpoint, outwardSide: WallJoinSide, point: FloorPlanPointMmV2) => void;
  roundPoint: (point: FloorPlanPointMmV2) => FloorPlanPointMmV2;
};

/** The angle's turn from the frame's nearest axis, folded into a quarter turn either side of it. */
function turnFromFrame(angle: number, frame: number) {
  const quarter = Math.PI / 2;
  const turn = (angle - frame) % quarter;
  return turn > quarter / 2 ? turn - quarter : turn < -quarter / 2 ? turn + quarter : turn;
}

/** Every wall at the vertex runs along one of the four directions of a common frame, whatever its rotation. */
function wallsShareOneFrame(references: AuthoredWallEndpoint[]) {
  const turns = references.map((reference) => turnFromFrame(reference.angle, references[0].angle));
  return Math.sin(Math.max(...turns) - Math.min(...turns)) <= 2 * HALF_DEGREE_SINE;
}

/** The other walls at the vertex that cross this one (at a right angle). */
function crossingWalls(references: AuthoredWallEndpoint[], reference: AuthoredWallEndpoint) {
  return references.filter(
    (other) =>
      other !== reference &&
      Math.abs(Math.cos(other.angle - reference.angle)) <= HALF_DEGREE_SINE * 2
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
 * Where every wall meeting at a vertex runs along one frame - level and plumb, or the same right angles turned with
 * the plan - and a mitre cannot close the corner cleanly - a T or X junction, or an L with a wall shorter than the
 * other is thick (an ownership step or a jog of an imported plan) - the walls meet in a square corner: each wall's
 * end runs on past the vertex by half the thickness of the thickest wall crossing it there, and the walls'
 * footprints, united, close the corner whatever their thicknesses. There a mitre leaves a spike or a notch. A plain
 * L of two long walls keeps the mitre. Returns false where the vertex is left to the next rule.
 */
function squareOrthogonalWallNode(references: AuthoredWallEndpoint[], tools: SquareCornerTools) {
  if (references.length < 2) return false;
  if (!wallsShareOneFrame(references)) return false;
  if (!references.some((reference) => crossingWalls(references, reference).length > 0)) return false;
  if (isPlainLongL(references)) return false;
  for (const reference of references) runWallEndOn(references, reference, tools);
  return true;
}

/**
 * Joins the walls at one vertex where a mitre cannot close the junction: square corners where every wall runs along
 * one frame, whatever its rotation; else a wall carried straight through with the others ending inside it (a T or
 * X at any angle; lib/floor-plan-wall-through-joins.ts). Returns false where the vertex is left to the mitre.
 */
export function joinWallNodeWithoutMitre(references: AuthoredWallEndpoint[], tools: SquareCornerTools) {
  return squareOrthogonalWallNode(references, tools) || joinThroughWallNode(references, tools);
}
