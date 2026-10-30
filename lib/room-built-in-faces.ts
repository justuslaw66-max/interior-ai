import { isPointInsideRoomPolygon } from "@/lib/design-page-geometry";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileCanonicalFloorPlanRenderModel, type CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { getBuiltInWallInset, getRoomPlanOutlinePoints, insetPolygonEdges } from "@/lib/room-finished-outline";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";

/**
 * Where a built-in cabinet may stand in a room: inside its walls' finished faces (J, 29 Oct 2026: "Face, back flush"). Each
 * edge of the room's outline (the wall centre line) moves in by half its own wall and its laminate panel. A drawn room's walls
 * are all as thick as the room says; an imported plan's each have their own thickness, read from the plan's walls (its rooms
 * carry only their walls' average), and no panels yet. A built-in may touch a face, but not cross it.
 */

type Point = RoomPlanPolygonPoint;

export type BuiltInRoomFaces = {
  /** The outline, room-local, in face order (getRoomWallFaceIds). */
  outline: Point[];
  faceIds: string[];
  /** How far each edge's face stands in from it: half its wall, and its panel. */
  insets: number[];
  /** The outline with each edge moved in to its face. */
  faces: Point[];
  holes: Point[][];
};

/** How far a built-in may reach into a face and still count as against it, in metres. */
export const BUILT_IN_CONTACT_TOLERANCE = 0.0005;

const modelByDocument = new WeakMap<FloorPlanDocumentV2, CanonicalFloorPlanRenderModel>();

/** An imported plan's render model, compiled once per plan document. */
export function getCanonicalPlanModel(document: FloorPlanDocumentV2 | null | undefined): CanonicalFloorPlanRenderModel | undefined {
  if (!document) return undefined;
  let model = modelByDocument.get(document);
  if (!model) {
    model = compileCanonicalFloorPlanRenderModel(document);
    modelByDocument.set(document, model);
  }
  return model;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x, dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq)) : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

/** Half of each outline edge's own wall in an imported plan: the plan wall beside the room nearest the edge's middle. */
function getImportedHalfWalls(room: RoomSnapshot, outline: readonly Point[], model?: CanonicalFloorPlanRenderModel): number[] | null {
  const floor = model?.floors.find((entry) => entry.rooms.some(({ id }) => id === room.id));
  const walls = floor?.walls.filter((wall) => wall.adjacentRoomIds.includes(room.id)) ?? [];
  if (!walls.length) return null;
  const origin = { x: room.planPosition?.x ?? 0, z: room.planPosition?.z ?? 0 };
  const toMetres = (point: { xMm: number; zMm: number }) => ({ x: point.xMm / 1000 - origin.x, z: point.zMm / 1000 - origin.z });
  return outline.map((start, index) => {
    const end = outline[(index + 1) % outline.length];
    const middle = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
    let nearest = Infinity, thicknessMm = (room.geometry.wallThickness ?? 0.12) * 1000;
    walls.forEach((wall) => wall.centerlineSegments.forEach((segment) => {
      const distance = distanceToSegment(middle, toMetres(segment.start), toMetres(segment.end));
      if (distance < nearest) [nearest, thicknessMm] = [distance, wall.thicknessMm];
    }));
    return thicknessMm / 2000;
  });
}

// One set of faces per room snapshot and plan: containment runs on every frame of a drag.
const facesByRoom = new WeakMap<RoomSnapshot, { model?: CanonicalFloorPlanRenderModel; w: number; d: number; faces: BuiltInRoomFaces }>();

/** The room's finished faces for built-ins; `size` is the rectangle's or L-shape's drawn size when it isn't the room's own. */
export function getRoomBuiltInFaces(
  room: RoomSnapshot,
  model?: CanonicalFloorPlanRenderModel,
  size: { w: number; d: number } = { w: room.geometry.width, d: room.geometry.depth }
): BuiltInRoomFaces {
  const known = facesByRoom.get(room);
  if (known && known.model === model && known.w === size.w && known.d === size.d) return known.faces;
  const faces = buildRoomBuiltInFaces(room, model, size);
  facesByRoom.set(room, { model, w: size.w, d: size.d, faces });
  return faces;
}

function buildRoomBuiltInFaces(room: RoomSnapshot, model: CanonicalFloorPlanRenderModel | undefined, size: { w: number; d: number }): BuiltInRoomFaces {
  const shape = room.planShape ?? "rectangle";
  const outline = getRoomPlanOutlinePoints({ shape, polygon: room.planPolygon, w: size.w, d: size.d });
  const faceIds = getRoomWallFaceIds({ shape, polygon: room.planPolygon });
  const depths = getRoomWallFinishDepths(room);
  const halfWall = getBuiltInWallInset(room.geometry.wallThickness);
  const imported = getImportedHalfWalls(room, outline, model);
  const insets = faceIds.map((faceId, index) => (imported?.[index] ?? halfWall) + (depths[faceId] ?? 0));
  return { outline, faceIds, insets, faces: insetPolygonEdges(outline, insets), holes: room.planHoles ?? [] };
}

/** True when the segments cross at a point inside both (touching ends don't count). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** True when the polygon and the rectangle (its corners, in order) overlap: a vertex inside the other, or edges crossing. */
function overlapsRectangle(polygon: readonly Point[], corners: Point[], isInsideRectangle: (point: Point) => boolean): boolean {
  if (polygon.some(isInsideRectangle) || corners.some((corner) => isPointInsideRoomPolygon(corner, [...polygon]))) return true;
  return polygon.some((start, index) => corners.some((corner, cornerIndex) =>
    segmentsCross(start, polygon[(index + 1) % polygon.length], corner, corners[(cornerIndex + 1) % corners.length])));
}

/**
 * True when a built-in `width` × `depth` metres, centred at (x, z) and turned `rotationY`, stands inside the faces: its real
 * (turned) footprint, so an angled wall doesn't count against a run beside it. It may touch a face.
 */
export function builtInFootprintFits(faces: BuiltInRoomFaces, x: number, z: number, width: number, depth: number, rotationY: number): boolean {
  const halfWidth = Math.max(0, width / 2 - BUILT_IN_CONTACT_TOLERANCE);
  const halfDepth = Math.max(0, depth / 2 - BUILT_IN_CONTACT_TOLERANCE);
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
  const corners = [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]]
    .map(([along, across]) => ({ x: x + along * cos + across * sin, z: z - along * sin + across * cos }));
  const isInsideRectangle = (point: Point) => {
    const dx = point.x - x, dz = point.z - z;
    return Math.abs(dx * cos - dz * sin) < halfWidth && Math.abs(dx * sin + dz * cos) < halfDepth;
  };
  if (!corners.every((corner) => isPointInsideRoomPolygon(corner, faces.faces))) return false;
  if (faces.faces.some(isInsideRectangle)) return false;
  const crossesFace = faces.faces.some((start, index) => corners.some((corner, cornerIndex) =>
    segmentsCross(start, faces.faces[(index + 1) % faces.faces.length], corner, corners[(cornerIndex + 1) % corners.length])));
  return !crossesFace && !faces.holes.some((hole) => hole.length >= 3 && overlapsRectangle(hole, corners, isInsideRectangle));
}

/**
 * True when the face of edge `index` is part of the room: just in front of its middle there is no other wall. A wall shorter
 * than the walls around it are thick (a nib narrower than its walls) has its face inside another wall, so it has none.
 */
export function isBuiltInFaceInRoom(faces: BuiltInRoomFaces, index: number): boolean {
  const { outline, insets } = faces;
  const start = faces.faces[index], end = faces.faces[(index + 1) % faces.faces.length];
  const edgeStart = outline[index], edgeEnd = outline[(index + 1) % outline.length];
  const length = Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.z - edgeStart.z) || 1;
  const dx = (edgeEnd.x - edgeStart.x) / length, dz = (edgeEnd.z - edgeStart.z) / length;
  if ((end.x - start.x) * dx + (end.z - start.z) * dz <= 0) return false; // Its face runs backwards.
  // The face's middle, 1 mm into the room (towards the face from the centre line).
  const middle = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
  const edgeMiddle = { x: (edgeStart.x + edgeEnd.x) / 2, z: (edgeStart.z + edgeEnd.z) / 2 };
  const normal = { x: -dz, z: dx };
  const inward = (middle.x - edgeMiddle.x) * normal.x + (middle.z - edgeMiddle.z) * normal.z >= 0 ? 1 : -1;
  const probe = { x: middle.x + normal.x * inward * 0.001, z: middle.z + normal.z * inward * 0.001 };
  return outline.every((point, other) =>
    distanceToSegment(probe, point, outline[(other + 1) % outline.length]) >= insets[other] - BUILT_IN_CONTACT_TOLERANCE);
}
