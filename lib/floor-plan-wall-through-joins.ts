import type { FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";
import type { AuthoredWallEndpoint } from "@/lib/floor-plan-wall-footprints";
import type { SquareCornerTools } from "@/lib/floor-plan-wall-square-corners";

const STRAIGHT_ON_COSINE = Math.cos((1 * Math.PI) / 180);
const SAFE_REACH_MM = 250;

type Line = { point: FloorPlanPointMmV2; direction: FloorPlanPointMmV2 };

function intersectLines(first: Line, second: Line): FloorPlanPointMmV2 | null {
  const determinant = first.direction.xMm * second.direction.zMm - first.direction.zMm * second.direction.xMm;
  if (Math.abs(determinant) <= 0.000001) return null;
  const deltaX = second.point.xMm - first.point.xMm;
  const deltaZ = second.point.zMm - first.point.zMm;
  const along = (deltaX * second.direction.zMm - deltaZ * second.direction.xMm) / determinant;
  return { xMm: first.point.xMm + first.direction.xMm * along, zMm: first.point.zMm + first.direction.zMm * along };
}

/** Pairs of walls that carry straight on through the vertex (within a degree), each wall in one pair at most. */
function throughPairs(references: AuthoredWallEndpoint[]) {
  const pairs: [AuthoredWallEndpoint, AuthoredWallEndpoint][] = [];
  const paired = new Set<AuthoredWallEndpoint>();
  for (const reference of references) {
    if (paired.has(reference)) continue;
    const partner = references.find(
      (other) =>
        other !== reference && !paired.has(other) && Math.cos(other.angle - reference.angle) <= -STRAIGHT_ON_COSINE
    );
    if (!partner) continue;
    pairs.push([reference, partner]);
    paired.add(reference).add(partner);
  }
  return { pairs, stems: references.filter((reference) => !paired.has(reference)) };
}

/** The through wall a stem ends in: the pair it meets most nearly square. */
function throughWallFor(stem: AuthoredWallEndpoint, pairs: [AuthoredWallEndpoint, AuthoredWallEndpoint][]) {
  return pairs.reduce((best, pair) =>
    Math.abs(Math.sin(pair[0].angle - stem.angle)) > Math.abs(Math.sin(best[0].angle - stem.angle)) ? pair : best
  );
}

/** The point exists and lies near the vertex, as lib/floor-plan-wall-footprints.ts keeps its mitre points. */
function isNearJoint(
  joint: FloorPlanPointMmV2,
  point: FloorPlanPointMmV2 | null,
  reachMm: number
): point is FloorPlanPointMmV2 {
  return !!point && Math.hypot(point.xMm - joint.xMm, point.zMm - joint.zMm) <= reachMm;
}

function reachOf(references: AuthoredWallEndpoint[]) {
  return Math.max(SAFE_REACH_MM, 4 * Math.max(...references.map((reference) => reference.wall.thicknessMm)));
}

/** The through wall's two halves meet face to face: mitred where they bend a little, plain ends where they don't. */
function joinThroughHalves(through: [AuthoredWallEndpoint, AuthoredWallEndpoint], tools: SquareCornerTools) {
  const reachMm = reachOf(through);
  for (const [first, second] of [through, [through[1], through[0]]] as const) {
    const firstFace = tools.offsetLine(first, 1);
    const secondFace = tools.offsetLine(second, -1);
    const point = firstFace && secondFace ? intersectLines(firstFace, secondFace) : null;
    if (!isNearJoint(first.joint, point, reachMm)) continue;
    tools.setPoint(first, 1, tools.roundPoint(point));
    tools.setPoint(second, -1, tools.roundPoint(point));
  }
}

/** A stem's end carried to the through wall's centre-line, both faces, where they meet it near the vertex. */
function endStemInThroughWall(
  stem: AuthoredWallEndpoint,
  through: [AuthoredWallEndpoint, AuthoredWallEndpoint],
  tools: SquareCornerTools
) {
  const direction = { xMm: Math.cos(through[0].angle), zMm: Math.sin(through[0].angle) };
  const centreLine = { point: stem.joint, direction };
  const reachMm = reachOf([stem, ...through]);
  const ends = ([1, -1] as const).map((outwardSide) => {
    const face = tools.offsetLine(stem, outwardSide);
    return { outwardSide, point: face ? intersectLines(face, centreLine) : null };
  });
  if (!ends.every(({ point }) => isNearJoint(stem.joint, point, reachMm))) return;
  for (const { outwardSide, point } of ends) if (point) tools.setPoint(stem, outwardSide, tools.roundPoint(point));
}

/**
 * A wall carried straight on through the vertex, with other walls meeting it at any angle - a T or an X that does
 * not run along one frame. Mitring each pair of neighbours there cuts the through wall's faces back to where the
 * stem's faces meet them and leaves a wedge open inside it. Instead the through wall's two halves meet face to face
 * (plain ends, or a mitre where they bend a little), so the through wall stays whole across the vertex, and each
 * stem ends on the through wall's centre-line, inside it, never past its far face. Returns false where the vertex is
 * left to the mitre (no wall carried straight on, or nothing but one wall carried straight on).
 */
export function joinThroughWallNode(references: AuthoredWallEndpoint[], tools: SquareCornerTools) {
  const { pairs, stems } = throughPairs(references);
  if (!pairs.length || (pairs.length === 1 && !stems.length)) return false;
  for (const pair of pairs) joinThroughHalves(pair, tools);
  for (const stem of stems) endStemInThroughWall(stem, throughWallFor(stem, pairs), tools);
  return true;
}
