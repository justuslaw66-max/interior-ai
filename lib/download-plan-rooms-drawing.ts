import type { FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { ROOM_TYPE_LABELS } from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlay-model";
import { swingCurve, type PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";
import { buildOpeningSymbolLines2D } from "@/lib/plan-opening-symbol-lines";
import { getRoomPlanOutlinePoints } from "@/lib/room-finished-outline";
import { getPlanRoomFloorAreaSqm } from "@/lib/room-floor-area";
import type { PlanBox } from "@/lib/download-plan-labels";
import {
  buildRoomWallSegments2D,
  buildWallBandCornerCaps2D,
  mergeSharedWallSegments2D,
  splitWallBandByOpenings2D,
  type WallBandCornerCap2D,
  type WallBandPart2D,
} from "@/lib/room-renderer-2d-walls";

/**
 * One floor of a room-drawn design (no imported plan) as vector primitives in world millimetres:
 * the same wall bands, door and window symbols the 2D editor draws, and each room's name and
 * floor area. Furniture is added by the caller, between these walls and the labels.
 */

/** A room's label, its stand-in name, and the room's box in plan millimetres (where the label may move). */
export type RoomLabel = { primitive: Extract<PlanDrawingPrimitive, { kind: "text" }>; fallback: string; room?: PlanBox };

/** The room's box in plan millimetres. */
export function roomPlanBox(room: Pick<HousePlanRoom2D, "x" | "z" | "w" | "d">): PlanBox {
  return { minX: mm(room.x - room.w / 2), maxX: mm(room.x + room.w / 2), minZ: mm(room.z - room.d / 2), maxZ: mm(room.z + room.d / 2) };
}

const mm = (metres: number) => Number((metres * 1000).toFixed(3));
const point = (x: number, z: number): Point => ({ xMm: mm(x), zMm: mm(z) });

function closedPath(id: string, points: Point[], role: string): PlanDrawingPrimitive {
  const path = points.map((entry, index) => `${index ? "L" : "M"} ${entry.xMm} ${entry.zMm}`).join(" ") + " Z";
  return { id, kind: "path", path, fill: true, points, role };
}

function openPath(id: string, points: Point[], role: string): PlanDrawingPrimitive {
  return { id, kind: "path", path: points.map((entry, index) => `${index ? "L" : "M"} ${entry.xMm} ${entry.zMm}`).join(" "), fill: false, points, role };
}

/** A wall band: its centreline widened by half its thickness to each side. */
function wallBandPrimitive(part: WallBandPart2D): PlanDrawingPrimitive | null {
  const length = Math.hypot(part.x2 - part.x1, part.z2 - part.z1);
  if (!(length > 0)) return null;
  const half = Math.max(0.025, part.thickness) / 2;
  const nx = (-(part.z2 - part.z1) / length) * half, nz = ((part.x2 - part.x1) / length) * half;
  return closedPath(`wall:${part.key}`, [
    point(part.x1 + nx, part.z1 + nz), point(part.x2 + nx, part.z2 + nz),
    point(part.x2 - nx, part.z2 - nz), point(part.x1 - nx, part.z1 - nz),
  ], "wall");
}

function cornerCapPrimitive(cap: WallBandCornerCap2D): PlanDrawingPrimitive {
  const half = cap.size / 2;
  return closedPath(`wall:${cap.key}`, [
    point(cap.x - half, cap.z - half), point(cap.x + half, cap.z - half),
    point(cap.x + half, cap.z + half), point(cap.x - half, cap.z + half),
  ], "wall");
}

/** Wall bands cut where doors and windows stand, with a square cap where walls turn. */
function wallPrimitives(rooms: readonly HousePlanRoom2D[], openings: readonly RoomRendererOpening[]) {
  const segments = mergeSharedWallSegments2D(buildRoomWallSegments2D([...rooms]));
  const parts = segments.flatMap((segment) => splitWallBandByOpenings2D(segment, [...openings]).parts);
  return [
    ...parts.map(wallBandPrimitive).filter((primitive): primitive is PlanDrawingPrimitive => primitive !== null),
    ...buildWallBandCornerCaps2D(segments).map(cornerCapPrimitive),
  ];
}

/**
 * A window as a layout plan draws it: three lines across the opening, the wall's two faces
 * (its sills) and the glass on the wall's centreline. The jambs are the cut wall's own faces.
 */
function windowPrimitives(opening: RoomRendererOpening, centre: { x: number; z: number }, tangent: { x: number; z: number }, thickness: number) {
  const half = opening.width / 2, normal = { x: -tangent.z, z: tangent.x };
  return [-thickness / 2, 0, thickness / 2].map((offset, index) => {
    const at = (along: number) => point(centre.x + tangent.x * along + normal.x * offset, centre.z + tangent.z * along + normal.z * offset);
    return openPath(`${opening.id}:${offset ? "window-sill" : "glazing"}:${index}`, [at(-half), at(half)], offset ? "window-sill" : "glazing");
  });
}

/** Each resolved opening's symbol; a door's swing is one true arc. */
function openingPrimitives(openings: readonly RoomRendererOpening[], thicknessByRoomId: ReadonlyMap<string, number>): PlanDrawingPrimitive[] {
  return openings.flatMap((opening) => {
    const centre = opening.hostWorldCenter, tangent = opening.hostTangent;
    if (!centre || !tangent) return [];
    const thickness = Math.max(0.025, thicknessByRoomId.get(opening.roomId ?? "") ?? 0.12);
    if (opening.kind === "window") return windowPrimitives(opening, centre, tangent, thickness);
    const half = opening.width / 2;
    const lines = buildOpeningSymbolLines2D({
      start: { x: centre.x - tangent.x * half, z: centre.z - tangent.z * half },
      end: { x: centre.x + tangent.x * half, z: centre.z + tangent.z * half },
      kind: opening.kind, doorStyle: opening.doorStyle, wall: opening.wall, inwardNormal: opening.hostInwardNormal,
    });
    return lines.map((line, index) => {
      const id = `${opening.id}:${line.role}:${index}`;
      const points = line.points.map(({ x, z }) => point(x, z));
      const hinge = lines[index - 1]?.points[0];
      return line.role === "swing_arc" && hinge ? swingCurve(id, point(hinge.x, hinge.z), points) : openPath(id, points, line.role);
    });
  });
}

/** "12.3 m²": one decimal under 100 m², whole square metres above. */
export function formatRoomArea(squareMetres: number) {
  return `${squareMetres < 100 ? squareMetres.toFixed(1) : Math.round(squareMetres)} m²`;
}

/** The room's name and area on one line at its outline's centroid; the room type is the fallback name. */
function roomLabel(room: HousePlanRoom2D): RoomLabel {
  const points = getRoomPlanOutlinePoints(room);
  const x = room.x + points.reduce((sum, entry) => sum + entry.x, 0) / points.length;
  const z = room.z + points.reduce((sum, entry) => sum + entry.z, 0) / points.length;
  const area = formatRoomArea(getPlanRoomFloorAreaSqm(room));
  const name = room.name.trim() || ROOM_TYPE_LABELS[room.roomType];
  return {
    primitive: { id: `${room.id}:label`, kind: "text", text: `${name} · ${area}`, point: point(x, z), role: "room-label" },
    fallback: `${ROOM_TYPE_LABELS[room.roomType]} · ${area}`,
    room: roomPlanBox(room),
  };
}

export function buildRoomsFloorDrawing(rooms: readonly HousePlanRoom2D[], openings: readonly RoomRendererOpening[]) {
  const roomIds = new Set(rooms.map(({ id }) => id));
  const onFloor = openings.filter((opening) => opening.roomId && roomIds.has(opening.roomId));
  const resolved = onFloor.filter((opening) => opening.hostResolution?.status === "resolved");
  const unsupported = onFloor
    .filter((opening) => opening.hostResolution?.status !== "resolved")
    .map((opening) => `Opening ${opening.id}: not on a wall; not drawn`);
  return {
    structure: [...wallPrimitives(rooms, resolved), ...openingPrimitives(resolved, new Map(rooms.map((room) => [room.id, room.wallThickness ?? 0.12])))],
    labels: rooms.map(roomLabel),
    unsupported,
  };
}
