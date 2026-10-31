/**
 * "Click inside a room": from one click on the page to a room ready to add (corners, size, printed name, type and the
 * drawn wall thickness). The saved walls are drawn into the ink first, so the room found stops at them; a click inside
 * a saved room finds nothing new. Adding it is floor-plan-review-room-conform.ts.
 */
import type { FloorPlanDocumentV2, FloorPlanFloorV2, FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";
import { buildFloorPlanSourceProjection } from "@/lib/floor-plan-imports/source-overlay-residuals";
import type { ReviewSourcePoint } from "@/lib/floor-plan-import-review-geometry";
import { findRoomRegion, type RoomFillFailure } from "@/lib/floor-plan-review-room-fill";
import { roomCornersFromRegion } from "@/lib/floor-plan-review-room-outline";
import { withSegments, type InkMask } from "@/lib/floor-plan-review-room-mask";

export type FoundRoom = {
  corners: ReviewSourcePoint[];
  areaM2: number;
  name: string;
  roomType: string;
  wallThicknessMm: number | null;
};
export type RoomClickResult = { ok: true; room: FoundRoom } | { ok: false; message: string };

const MESSAGES: Record<RoomFillFailure | "saved" | "outline" | "scale", string> = {
  no_room_here: "There is no open floor right there. Click in the middle of a room, away from its walls.",
  open_to_edge: "That area runs out to the edge of the page, so it is not a closed room. Outline it corner by corner instead.",
  too_small: "That area is too small for a room. Click in the middle of a room.",
  too_large: "That area is bigger than one room: it probably runs on through a wide opening. Outline it corner by corner instead.",
  saved: "This room is already outlined.",
  outline: "The room's outline could not be worked out here. Outline it corner by corner instead.",
  scale: "Set scale before adding rooms.",
};

type Projection = NonNullable<ReturnType<typeof buildFloorPlanSourceProjection>>;

function pagePoint(projection: Projection, point: FloorPlanPointMmV2): ReviewSourcePoint {
  const page = projection.project(point);
  return { x: page.xPx, y: page.yPx };
}

/** The saved walls on the page, as segments in page px. */
function savedWalls(floor: FloorPlanFloorV2, projection: Projection): Array<[ReviewSourcePoint, ReviewSourcePoint]> {
  const vertex = new Map(floor.vertices.map((entry) => [entry.id, entry]));
  return floor.walls.flatMap((wall) => {
    const start = vertex.get(wall.path.startVertexId), end = vertex.get(wall.path.endVertexId);
    return start && end ? [[pagePoint(projection, start), pagePoint(projection, end)] as [ReviewSourcePoint, ReviewSourcePoint]] : [];
  });
}

/** The saved rooms' outlines in page px (each wall's first corner, in loop order). */
function savedRooms(floor: FloorPlanFloorV2, projection: Projection): ReviewSourcePoint[][] {
  const vertex = new Map(floor.vertices.map((entry) => [entry.id, entry]));
  const wall = new Map(floor.walls.map((entry) => [entry.id, entry]));
  return floor.rooms.map((room) => (room.wallLoops.find((loop) => loop.kind === "outer")?.walls ?? []).flatMap((reference) => {
    const path = wall.get(reference.wallId)?.path;
    const corner = path && vertex.get(reference.direction === "forward" ? path.startVertexId : path.endVertexId);
    return corner ? [pagePoint(projection, corner)] : [];
  }));
}

export function insidePolygon(point: ReviewSourcePoint, polygon: ReviewSourcePoint[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A room type from its printed name, as the room panel offers them. */
export function roomTypeFromName(name: string) {
  const text = name.toLowerCase();
  const rules: Array<[RegExp, string]> = [[/bath|w\.?\s?c\b|toilet/, "toilet"], [/bed|master|main room/, "bedroom"], [/kitchen/, "kitchen"],
    [/service yard|utility/, "service_yard"], [/shelter|store/, "shelter"], [/study/, "study"], [/living/, "living"], [/dining/, "dining"]];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? "other";
}

/** Page text that reads as a room's name: at least two letters, and not only a unit ("mm", "12 sqm"). */
function nameLike(text: string) {
  const letters = text.replace(/[^a-z]/gi, "");
  return letters.length >= 2 && !/^(mm|cm|sqm|sqft|ft)$/i.test(letters);
}

/** The page's printed words inside an outline, top to bottom, that read as a name (not a number or a unit). */
function printedName(floor: FloorPlanFloorV2, sourceId: string, pageNumber: number, outline: ReviewSourcePoint[]) {
  const words = floor.annotations.flatMap((annotation) => {
    const geometry = annotation.geometry;
    if (geometry.kind !== "source_drawing" || geometry.command !== "text" || geometry.sourceId !== sourceId) return [];
    const at = geometry.points[0];
    const text = (annotation.text ?? "").trim();
    return geometry.pageNumber === pageNumber && at && nameLike(text) && insidePolygon(at, outline) ? [{ at, text }] : [];
  });
  words.sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
  return words.map((word) => word.text).join(" ").replace(/\s+/g, " ").slice(0, 120);
}

/** The room around a click (page px), read from the page's ink mask. */
export function findRoomAtClick(input: {
  document: FloorPlanDocumentV2; floorId: string; sourceId: string; pageNumber: number; mask: InkMask; point: ReviewSourcePoint;
}): RoomClickResult {
  const floor = input.document.floors.find((entry) => entry.id === input.floorId);
  const calibration = floor?.calibrations.find((entry) => entry.sourceId === input.sourceId && entry.pageNumber === input.pageNumber);
  const projection = calibration && buildFloorPlanSourceProjection(calibration);
  if (!floor || !projection) return { ok: false, message: MESSAGES.scale };
  if (savedRooms(floor, projection).some((room) => room.length >= 3 && insidePolygon(input.point, room))) return { ok: false, message: MESSAGES.saved };
  const { scale } = input.mask;
  const origin = projection.project({ xMm: 0, zMm: 0 }), metre = projection.project({ xMm: 1000, zMm: 0 });
  const mmPerMaskPx = 1000 / (Math.hypot(metre.xPx - origin.xPx, metre.yPx - origin.yPx) * scale || 1);
  const toMask = (point: ReviewSourcePoint) => ({ x: point.x * scale, y: point.y * scale });
  const mask = withSegments(input.mask, savedWalls(floor, projection).map(([a, b]) => [toMask(a), toMask(b)]), 2);
  const found = findRoomRegion(mask, toMask(input.point), mmPerMaskPx);
  if (!found.ok) return { ok: false, message: MESSAGES[found.failure] };
  const outline = roomCornersFromRegion(found.region, mask.ink, mask.widthPx, mask.heightPx, mmPerMaskPx);
  if (!outline) return { ok: false, message: MESSAGES.outline };
  const corners = outline.corners.map((corner) => ({ x: Math.round((corner.x / scale) * 10) / 10, y: Math.round((corner.y / scale) * 10) / 10 }));
  const name = printedName(floor, input.sourceId, input.pageNumber, corners);
  return { ok: true, room: { corners, areaM2: Math.round(found.areaM2 * 10) / 10, name, roomType: roomTypeFromName(name), wallThicknessMm: outline.wallThicknessMm } };
}
