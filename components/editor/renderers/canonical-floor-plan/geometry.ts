import { Matrix4, Path, Shape, Vector3 } from "three";

import type {
  CompiledFloorPlanOpeningV2,
  CompiledFloorPlanStructureV2,
} from "@/lib/floor-plan-compiler-v2";
import { buildCanonicalOpeningSymbolLinesV2 } from "@/lib/floor-plan-opening-primitives";
import type { PlanarUnionPolygonMm } from "@/lib/floor-plan-planar-union";
import { buildWallFinishShellGeometry } from "../house-plan-3d/geometry";
import { mapWallFinishShellUvs } from "../house-plan-3d/wallFinishShellUvs";
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

/** How far a face's finish stops short of the face's start and end corners, in millimetres (an inside corner's panel). */
export type FaceTrimsMm = { startMm: number; endMm: number; hidden?: boolean };
export const NO_FACE_TRIMS: FaceTrimsMm = Object.freeze({ startMm: 0, endMm: 0 });

/** A face line cut back at its ends, keeping at least a millimetre of it. */
export function trimFaceEdge(edge: ReturnType<typeof wallSurfaceEdge>, trims: FaceTrimsMm): ReturnType<typeof wallSurfaceEdge> {
  if (trims.startMm <= 0 && trims.endMm <= 0) return edge;
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z);
  const start = Math.min(trims.startMm / 1000, Math.max(0, length - 0.001));
  const end = Math.min(trims.endMm / 1000, Math.max(0, length - 0.001 - start));
  const along = { x: (edge.end.x - edge.start.x) / (length || 1), z: (edge.end.z - edge.start.z) / (length || 1) };
  return {
    start: { x: edge.start.x + along.x * start, z: edge.start.z + along.z * start },
    end: { x: edge.end.x - along.x * end, z: edge.end.z - along.z * end },
  };
}

/**
 * A wall slice's finish, in floor space, as the box a drawn room's panel is (house-plan-3d's buildWallFinishShellGeometry):
 * from the face to `depthMm` in front of it (a laminate on its board, 10 to 44 mm; any other finish its 1.5 mm skin), the
 * slice's height, and along the face from corner to corner, less `trims` where it stops at another panel. It has no side
 * against the wall. Its front shows the picture from the face's start to its end, and its ends, top and bottom the picture's
 * edge there (mapWallFinishShellUvs).
 */
export function wallFinishShellGeometry(
  solid: CanonicalFloorPlanWallSolid, side: 1 | -1, depthMm: number, trims: FaceTrimsMm = NO_FACE_TRIMS
) {
  const face = wallSurfaceEdge(solid, side, 0);
  const faceLength = Math.max(0.001, Math.hypot(face.end.x - face.start.x, face.end.z - face.start.z));
  const edge = trimFaceEdge(face, trims);
  const length = Math.max(0.001, Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z));
  const along = { x: (edge.end.x - edge.start.x) / length, z: (edge.end.z - edge.start.z) / length };
  const depth = Math.max(0.0005, depthMm / 1000);
  const bottom = solid.bottomMm / 1000;
  const top = Math.max(bottom + 0.001, solid.topMm / 1000);
  const geometry = buildWallFinishShellGeometry({ widthMeters: length, heightMeters: top - bottom, thicknessMeters: depth });
  // The picture keeps its place on the face: a box cut back at a corner shows that much less of it.
  const startU = Math.min(1, Math.hypot(edge.start.x - face.start.x, edge.start.z - face.start.z) / faceLength);
  mapWallFinishShellUvs(geometry, startU, Math.min(1, startU + length / faceLength));
  // The box's +X runs along the face and its kept broad side (+Z) faces away from the wall: X × Y.
  const outward = new Vector3(-along.z, 0, along.x);
  geometry.applyMatrix4(new Matrix4().makeBasis(new Vector3(along.x, 0, along.z), new Vector3(0, 1, 0), outward).setPosition(
    (edge.start.x + edge.end.x) / 2 + (outward.x * depth) / 2,
    (bottom + top) / 2,
    (edge.start.z + edge.end.z) / 2 + (outward.z * depth) / 2
  ));
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
