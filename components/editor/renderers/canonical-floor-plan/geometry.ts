import { BufferGeometry, Float32BufferAttribute, Path, Shape, Vector3 } from "three";

import type {
  CompiledFloorPlanOpeningV2,
  CompiledFloorPlanStructureV2,
} from "@/lib/floor-plan-compiler-v2";
import { buildCanonicalOpeningSymbolLinesV2 } from "@/lib/floor-plan-opening-primitives";
import type { PlanarUnionPolygonMm } from "@/lib/floor-plan-planar-union";
import { isFloorPlanVoidRoom } from "@/lib/floor-plan-void-rooms";
import type {
  CanonicalFloorPlanLineSegment,
  CanonicalFloorPlanWallSolid,
} from "@/lib/floor-plan-render-model";

export function segmentTransform(segment: CanonicalFloorPlanLineSegment) {
  const startX = segment.start.xMm / 1000;
  const startZ = segment.start.zMm / 1000;
  const endX = segment.end.xMm / 1000;
  const endZ = segment.end.zMm / 1000;
  const dx = endX - startX;
  const dz = endZ - startZ;
  return {
    centerX: (startX + endX) / 2,
    centerZ: (startZ + endZ) / 2,
    length: Math.max(0.001, Math.hypot(dx, dz)),
    rotationY: -Math.atan2(dz, dx),
    points: [
      [startX, 0, startZ],
      [endX, 0, endZ],
    ] as [[number, number, number], [number, number, number]],
  };
}

export function wallSolidShape(solid: CanonicalFloorPlanWallSolid) {
  const shape = new Shape();
  const points = [
    solid.footprint.startLeft,
    solid.footprint.endLeft,
    solid.footprint.endRight,
    solid.footprint.startRight,
  ];
  points.forEach((point, index) => {
    const x = point.xMm / 1000;
    const y = -point.zMm / 1000;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  shape.closePath();
  return shape;
}

export function appendPlanarRing(
  path: Shape | Path,
  points: PlanarUnionPolygonMm["outer"]
) {
  points.forEach((point, index) => {
    const x = point.xMm / 1000;
    const y = -point.zMm / 1000;
    if (index === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  });
  path.closePath();
}

export function planarUnionShapes(polygons: PlanarUnionPolygonMm[]) {
  return polygons.map((polygon) => {
    const shape = new Shape();
    appendPlanarRing(shape, polygon.outer);
    for (const holePoints of polygon.holes) {
      const hole = new Path();
      appendPlanarRing(hole, holePoints);
      shape.holes.push(hole);
    }
    return shape;
  });
}

/** A wall slice's face on the room's side, as a line from corner to corner, `offsetMm` in front of the face. */
export function wallSurfaceEdge(solid: CanonicalFloorPlanWallSolid, side: 1 | -1, offsetMm = 1.5) {
  const dx = solid.end.xMm - solid.start.xMm;
  const dz = solid.end.zMm - solid.start.zMm;
  const segmentLengthMm = Math.max(1, Math.hypot(dx, dz));
  const normalX = -dz / segmentLengthMm;
  const normalZ = dx / segmentLengthMm;
  const renderOffsetMm = side * offsetMm;
  const authoredStart =
    side === 1 ? solid.footprint.startLeft : solid.footprint.endRight;
  const authoredEnd =
    side === 1 ? solid.footprint.endLeft : solid.footprint.startRight;
  return {
    start: {
      x: (authoredStart.xMm + normalX * renderOffsetMm) / 1000,
      z: (authoredStart.zMm + normalZ * renderOffsetMm) / 1000,
    },
    end: {
      x: (authoredEnd.xMm + normalX * renderOffsetMm) / 1000,
      z: (authoredEnd.zMm + normalZ * renderOffsetMm) / 1000,
    },
  };
}

/** A point's distance along the wall from its start, in metres, measured on a slice's own line. */
function distanceAlongWall(solid: CanonicalFloorPlanWallSolid, point: { x: number; z: number }) {
  const dx = solid.end.xMm - solid.start.xMm;
  const dz = solid.end.zMm - solid.start.zMm;
  const segmentLengthMm = Math.max(1, Math.hypot(dx, dz));
  return (
    (solid.startOffsetMm + ((point.x * 1000 - solid.start.xMm) * dx + (point.z * 1000 - solid.start.zMm) * dz) / segmentLengthMm) /
    1000
  );
}

/**
 * How a wall slice's finish is laid: its face's length and height, how high its bottom edge is above the floor, and how far
 * along the wall's face its picture starts, measured the way the picture runs: from the face's corner at the wall's start on
 * side 1, and from its corner at the wall's end on side -1, whose picture runs back along the wall. `wallSolids` are the
 * wall's slices, which give that corner. Wall panels lay their sheets from the floor and from the corner, so a full sheet
 * meets the corner and the slices beside, below and above the wall's openings share their joints (surfaceTileRows.ts).
 */
export function wallSurfaceLayout(
  solid: CanonicalFloorPlanWallSolid,
  side: 1 | -1,
  wallSolids: readonly CanonicalFloorPlanWallSolid[] = [solid]
) {
  const edge = wallSurfaceEdge(solid, side);
  const cornerSlice = wallSolids.reduce((corner, candidate) =>
    side === 1
      ? candidate.startOffsetMm < corner.startOffsetMm ? candidate : corner
      : candidate.endOffsetMm > corner.endOffsetMm ? candidate : corner
  , solid);
  const corner = distanceAlongWall(cornerSlice, wallSurfaceEdge(cornerSlice, side).start);
  const here = distanceAlongWall(solid, edge.start);
  return {
    edge,
    lengthMeters: Math.max(0.001, Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z)),
    heightMeters: Math.max(0.001, (solid.topMm - solid.bottomMm) / 1000),
    bottomAboveFloorMeters: solid.bottomMm / 1000,
    startAlongFaceMeters: side === 1 ? here - corner : corner - here,
  };
}

/**
 * How far a face's finish stops short of the slice's start and end corners along its face, in millimetres: on the bare face,
 * and on the line `front.offsetMm` in front of it, between which a corner's cut runs straight, so it slants where the finish
 * meets a mitre or another panel's face. Negative where the finish runs on past the slice's corner into a mitre. `hidden`
 * when nothing of the slice is left (roomFaceLimits.ts).
 */
export type FaceTrimsMm = {
  startMm: number;
  endMm: number;
  front?: { offsetMm: number; startMm: number; endMm: number };
  hidden?: boolean;
};
export const NO_FACE_TRIMS: FaceTrimsMm = Object.freeze({ startMm: 0, endMm: 0 });
/** A finish that isn't a laminate on its board is a skin this deep (paint, tiles, wallpaper). */
export const WALL_FINISH_SKIN_MM = 1.5;

/** The trims on the line `offsetMm` in front of the face: along the straight cut between the bare face's and the front's. */
export function faceTrimsAt(trims: FaceTrimsMm, offsetMm: number): { startMm: number; endMm: number } {
  const { front } = trims;
  if (!front || front.offsetMm <= 0) return trims;
  const share = offsetMm / front.offsetMm;
  return {
    startMm: trims.startMm + (front.startMm - trims.startMm) * share,
    endMm: trims.endMm + (front.endMm - trims.endMm) * share,
  };
}

/** A face line cut back at its ends, or run on past them where a trim is negative; never shorter than nothing. */
export function trimFaceEdge(
  edge: ReturnType<typeof wallSurfaceEdge>, trims: { startMm: number; endMm: number }
): ReturnType<typeof wallSurfaceEdge> {
  if (!trims.startMm && !trims.endMm) return edge;
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z);
  const along = { x: (edge.end.x - edge.start.x) / (length || 1), z: (edge.end.z - edge.start.z) / (length || 1) };
  let from = trims.startMm / 1000, to = length - trims.endMm / 1000;
  if (to < from) from = to = (from + to) / 2;
  return {
    start: { x: edge.start.x + along.x * from, z: edge.start.z + along.z * from },
    end: { x: edge.start.x + along.x * to, z: edge.start.z + along.z * to },
  };
}

/** A slice's face line `offsetMm` in front of the wall, cut there as `trims` cut it. */
export function trimmedFaceEdge(solid: CanonicalFloorPlanWallSolid, side: 1 | -1, offsetMm: number, trims: FaceTrimsMm) {
  return trimFaceEdge(wallSurfaceEdge(solid, side, offsetMm), faceTrimsAt(trims, offsetMm));
}

type PlanPoint = { x: number; z: number };
type ShellFace = { points: Array<[PlanPoint, number]>; uvs: Array<[number, number]>; normal: Vector3 };

/** A shell face's triangles, wound to face along its normal, skipping any with no area (a corner cut to a point). */
function appendShellFace(face: ShellFace, positions: number[], normals: number[], uvs: number[]) {
  const corners = face.points.map(([point, y]) => new Vector3(point.x, y, point.z));
  for (let index = 1; index + 1 < corners.length; index += 1) {
    let order = [0, index, index + 1];
    const facing = new Vector3().subVectors(corners[index], corners[0]).cross(new Vector3().subVectors(corners[index + 1], corners[0]));
    if (facing.lengthSq() < 1e-14) continue;
    if (facing.dot(face.normal) < 0) order = [0, index + 1, index];
    for (const corner of order) {
      positions.push(corners[corner].x, corners[corner].y, corners[corner].z);
      normals.push(face.normal.x, face.normal.y, face.normal.z);
      uvs.push(...face.uvs[corner]);
    }
  }
}

/**
 * A wall slice's finish, in floor space: from the face out to `depthMm` in front of it (a laminate on its board, 10 to 44 mm;
 * any other finish its 1.5 mm skin), the slice's height, and along the face between its ends as `trims` cut them, square or
 * slanting. It has no side against the wall. Its front shows the picture where it lies on the face (from the face's start
 * corner to its end), its ends the picture's column there, and its top and bottom the picture's top and bottom row, as a
 * drawn room's box does (mapWallFinishShellUvs, house-plan-3d).
 */
export function wallFinishShellGeometry(
  solid: CanonicalFloorPlanWallSolid, side: 1 | -1, depthMm: number, trims: FaceTrimsMm = NO_FACE_TRIMS
) {
  const face = wallSurfaceEdge(solid, side, 0);
  const faceLength = Math.max(0.001, Math.hypot(face.end.x - face.start.x, face.end.z - face.start.z));
  const along = { x: (face.end.x - face.start.x) / faceLength, z: (face.end.z - face.start.z) / faceLength };
  const u = (point: PlanPoint) => ((point.x - face.start.x) * along.x + (point.z - face.start.z) * along.z) / faceLength;
  const bare = trimmedFaceEdge(solid, side, 0, trims);
  const front = trimmedFaceEdge(solid, side, Math.max(0.5, depthMm), trims);
  const bottom = solid.bottomMm / 1000;
  const top = Math.max(bottom + 0.001, solid.topMm / 1000);
  const plan = [bare.start, bare.end, front.end, front.start];
  const centre = { x: plan.reduce((sum, point) => sum + point.x, 0) / 4, z: plan.reduce((sum, point) => sum + point.z, 0) / 4 };
  // A side's normal, level and away from the shell's middle (the front's is away from the wall).
  const away = (from: PlanPoint, to: PlanPoint) => {
    const normal = new Vector3(to.z - from.z, 0, from.x - to.x).normalize();
    return normal.dot(new Vector3((from.x + to.x) / 2 - centre.x, 0, (from.z + to.z) / 2 - centre.z)) < 0 ? normal.negate() : normal;
  };
  const upright = (from: PlanPoint, to: PlanPoint, columns: [number, number]): ShellFace => ({
    points: [[from, bottom], [to, bottom], [to, top], [from, top]],
    uvs: [[columns[0], 0], [columns[1], 0], [columns[1], 1], [columns[0], 1]],
    normal: away(from, to),
  });
  const faces: ShellFace[] = [
    upright(front.start, front.end, [u(front.start), u(front.end)]),
    upright(bare.start, front.start, [u(front.start), u(front.start)]),
    upright(bare.end, front.end, [u(front.end), u(front.end)]),
    { points: plan.map((point) => [point, top]), uvs: plan.map((point) => [u(point), 1]), normal: new Vector3(0, 1, 0) },
    { points: plan.map((point) => [point, bottom]), uvs: plan.map((point) => [u(point), 0]), normal: new Vector3(0, -1, 0) },
  ];
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [];
  faces.forEach((entry) => appendShellFace(entry, positions, normals, uvs));
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** The room a wall click selects. Given the floor's rooms, never a void (duct, shaft): the editor does not offer one. */
export function preferredRoomId(
  roomIds: string[],
  activeRoomId: string | null,
  rooms?: readonly { id: string; roomType: string }[]
) {
  const selectable = rooms ? roomIds.filter((id) => !rooms.some((room) => room.id === id && isFloorPlanVoidRoom(room))) : roomIds;
  return (activeRoomId && selectable.includes(activeRoomId) ? activeRoomId : selectable[0]) ?? null;
}

export function structureShape(points: CompiledFloorPlanStructureV2["points"]) {
  const shape = new Shape();
  points.forEach((point, index) => {
    const x = point.xMm / 1000;
    // Shape geometry is authored in XY, then rotated onto the XZ plan plane.
    const y = -point.zMm / 1000;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  });
  if (points.length > 2) {
    shape.lineTo(points[0].xMm / 1000, -points[0].zMm / 1000);
  }
  return shape;
}

export function structureOutlinePoints(
  points: CompiledFloorPlanStructureV2["points"],
  elevation: number
) {
  if (!points.length) return [];
  return [...points, points[0]].map(
    (point) => [point.xMm / 1000, elevation, point.zMm / 1000] as [number, number, number]
  );
}

export function structureColor(kind: CompiledFloorPlanStructureV2["kind"]) {
  if (kind === "ledge") return "#bfdbfe";
  if (kind === "service_strip") return "#fde68a";
  if (kind === "void") return "#f8fafc";
  if (kind === "shaft") return "#cbd5e1";
  if (kind === "column" || kind === "structural_core") return "#94a3b8";
  return "#d1d5db";
}

/**
 * An opening's 2D symbol lines, each with its plan points ready for drei's
 * `Line`. The host span follows the exact wall path the opening sits on.
 * Build these once per opening: a new `points` array makes `Line` rebuild its
 * geometry.
 */
export function canonicalOpening2DSymbolLines(
  opening: CompiledFloorPlanOpeningV2,
  hostSegments: CanonicalFloorPlanLineSegment[]
) {
  const hostPoints = hostSegments.length
    ? [hostSegments[0].start, ...hostSegments.map((segment) => segment.end)]
    : [opening.start, opening.end];
  return buildCanonicalOpeningSymbolLinesV2(opening).map((symbol) => ({
    ...symbol,
    linePoints: (symbol.role === "host_span" ? hostPoints : symbol.points).map(
      (point): [number, number, number] => [point.xMm / 1000, 0.014, point.zMm / 1000]
    ),
  }));
}
