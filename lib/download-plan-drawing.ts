import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { buildHousePlan2D, ROOM_TYPE_LABELS, type HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { mapPlanOpeningsToRoomRenderer } from "@/lib/design-page-plan-overlay-projections";
import { buildFloorPlanVectorDrawing, type PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import {
  placePlanFurniture,
  planFurniturePrimitives,
  type FurnitureScheduleEntry,
  type PlacedFurniture,
  type PlanFurnitureDrawingSource,
} from "@/lib/floor-plan-vector-furniture";
import { buildRoomsFloorDrawing, formatRoomArea, roomPlanBox, type RoomLabel } from "@/lib/download-plan-rooms-drawing";
import { clearLabelPoint, furnitureBox, type PlanBox } from "@/lib/download-plan-labels";
import { getPlanRoomFloorAreaSqm } from "@/lib/room-floor-area";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import { closedPathPolygons, planWallFaceLines } from "@/lib/plan-wall-faces";

/**
 * The Download PDF's furnished layout plan: one sheet per floor, drawn as vectors from the
 * design. An imported plan draws its own walls and openings (lib/floor-plan-vector-drawing);
 * any other design draws its rooms' wall bands, doors and windows. Either way every item is its
 * plan symbol with a numbered tag, and one schedule numbers the whole home, so a tag means the
 * same product on every floor and in the product list.
 */

export type DownloadPlanSheet = {
  title: string;
  primitives: PlanDrawingPrimitive[];
  /** A label's stand-in, by primitive id, for a name the PDF font cannot set (a room type for its name). */
  labelFallbacks: Record<string, string>;
};

export type DownloadPlanDrawing = {
  sheets: DownloadPlanSheet[];
  schedule: FurnitureScheduleEntry[];
  /** Each drawn item's tag, by instance id, for numbering the product list. */
  tagByInstanceId: Record<string, number>;
  unsupported: string[];
};

const SHEET_TITLE = "Furnished layout plan";
/** Cut walls: a light grey fill (0-255) under fine face lines, at their true thickness (J, 11 Nov). */
const WALL_FILL_TONE = 217;
const WALL_FACE_STROKE_MM = 0.35;
/** Drawn after furniture, so furniture's paper never covers them. */
const LABEL_ROLES = new Set(["room-label", "annotation", "annotation-text"]);

/** A label or annotation, drawn last, with the stand-in text for a name the PDF font cannot set. */
type LateEntry = { primitive: PlanDrawingPrimitive; fallback: string; room?: PlanBox };
type Floor = { id: string; name: string; roomIds: Set<string>; structure: PlanDrawingPrimitive[]; labels: LateEntry[] };

function sheetTitle(floor: Floor, floorCount: number) {
  return floorCount > 1 ? `${SHEET_TITLE} · ${floor.name}` : SHEET_TITLE;
}

/** Room-drawn floors, by floor level, each with its own walls and openings. */
function roomsFloors(rooms: readonly HousePlanRoom2D[], snapshot: DesignSnapshot): { floors: Floor[]; unsupported: string[] } {
  const openings = mapPlanOpeningsToRoomRenderer(snapshot.floorPlan?.openings ?? [], rooms);
  const levels = [...new Set(rooms.map((room) => room.floorLevel ?? 1))].sort((a, b) => a - b);
  const unsupported: string[] = [];
  const floors = levels.map((level) => {
    const onLevel = rooms.filter((room) => (room.floorLevel ?? 1) === level);
    const drawing = buildRoomsFloorDrawing(onLevel, openings);
    unsupported.push(...drawing.unsupported);
    const name = onLevel.find((room) => room.floorLabel?.trim())?.floorLabel?.trim() || `Level ${level}`;
    return { id: `level-${level}`, name, roomIds: new Set(onLevel.map(({ id }) => id)), structure: drawing.structure, labels: drawing.labels };
  });
  return { floors, unsupported };
}

/** A canonical room label gains its room's area, where the design's room is known, and the room type as fallback. */
function canonicalLabel(primitive: Extract<PlanDrawingPrimitive, { kind: "text" }>, roomsById: ReadonlyMap<string, HousePlanRoom2D>): RoomLabel {
  const room = primitive.role === "room-label" ? roomsById.get(primitive.id.replace(/:label$/, "")) : undefined;
  if (!room) return { primitive, fallback: "" };
  const area = formatRoomArea(getPlanRoomFloorAreaSqm(room));
  return { primitive: { ...primitive, text: `${primitive.text} · ${area}` }, fallback: `${ROOM_TYPE_LABELS[room.roomType]} · ${area}`, room: roomPlanBox(room) };
}

/** An imported plan's floors: its own walls, openings, structures and names, without dimension strings. */
function canonicalFloors(document: FloorPlanDocumentV2, rooms: readonly HousePlanRoom2D[]): { floors: Floor[]; unsupported: string[] } {
  const model = compileCanonicalFloorPlanRenderModel(document);
  const roomsById = new Map(rooms.map((room) => [room.id, room]));
  const unsupported: string[] = [];
  const floors = model.compiledScene.floors.map((compiled) => {
    const drawing = buildFloorPlanVectorDrawing(document, { floorId: compiled.id, dimensions: false, labels: true, fixtures: true }, undefined, model);
    unsupported.push(...drawing.unsupported);
    const labels = drawing.primitives.filter((primitive) => LABEL_ROLES.has(primitive.role));
    return {
      id: compiled.id, name: compiled.name.trim() || `Level ${compiled.levelIndex + 1}`,
      roomIds: new Set(compiled.rooms.map(({ id }) => id)),
      structure: drawing.primitives.filter((primitive) => !LABEL_ROLES.has(primitive.role)),
      labels: labels.map((primitive) => primitive.kind === "text" ? canonicalLabel(primitive, roomsById) : { primitive, fallback: "" }),
    };
  });
  return { floors, unsupported };
}

/** The walls' fills turned light grey, and their visible faces drawn as fine lines just above them. */
function lightWalls(structure: readonly PlanDrawingPrimitive[]): PlanDrawingPrimitive[] {
  const walls = structure.filter((primitive): primitive is Extract<PlanDrawingPrimitive, { kind: "path" }> => primitive.kind === "path" && primitive.role === "wall");
  if (!walls.length) return [...structure];
  const faces: PlanDrawingPrimitive[] = planWallFaceLines(walls.flatMap(closedPathPolygons)).map((points, index) => ({
    id: `wall-face:${index}`, kind: "path", fill: false, points, role: "wall-face", paperStrokeMm: WALL_FACE_STROKE_MM,
    path: points.map((point, order) => `${order ? "L" : "M"} ${Number(point.xMm.toFixed(3))} ${Number(point.zMm.toFixed(3))}`).join(" "),
  }));
  const lastWall = structure.lastIndexOf(walls[walls.length - 1]);
  return [
    ...structure.slice(0, lastWall + 1).map((primitive) => primitive.kind === "path" && primitive.role === "wall" ? { ...primitive, tone: WALL_FILL_TONE } : primitive),
    ...faces,
    ...structure.slice(lastWall + 1),
  ];
}

/** A room's name moved to the free spot nearest its middle, clear of the furniture. */
function placedLabel({ primitive, room }: LateEntry, obstacles: readonly PlanBox[]): PlanDrawingPrimitive {
  if (primitive.kind !== "text" || !room) return primitive;
  return { ...primitive, point: clearLabelPoint(primitive.text, primitive.point, room, obstacles) };
}

function sheetFor(floor: Floor, floorCount: number, placed: readonly PlacedFurniture[], tags: ReadonlyMap<string, number>): DownloadPlanSheet {
  const onFloor = placed.filter((item) => floor.roomIds.has(item.roomId));
  const obstacles = onFloor.map(furnitureBox);
  const labelFallbacks: Record<string, string> = {};
  for (const label of floor.labels) if (label.fallback) labelFallbacks[label.primitive.id] = label.fallback;
  return { title: sheetTitle(floor, floorCount), labelFallbacks, primitives: [
    ...lightWalls(floor.structure), ...planFurniturePrimitives(onFloor, tags), ...floor.labels.map((label) => placedLabel(label, obstacles)),
  ] };
}

/** Items stand where the plan puts their room, including a room still on its default place. */
function roomsAtPlanPositions(snapshot: DesignSnapshot, rooms: readonly HousePlanRoom2D[]): RoomSnapshot[] {
  const placedById = new Map(rooms.map((room) => [room.id, room]));
  return snapshot.rooms.map((room) => {
    const placed = placedById.get(room.id);
    return placed ? { ...room, planPosition: { x: placed.x, z: placed.z } } : room;
  });
}

export function buildDownloadPlanDrawing(snapshot: DesignSnapshot, furniture: Omit<PlanFurnitureDrawingSource, "rooms"> = {}): DownloadPlanDrawing {
  const first = snapshot.rooms[0];
  const housePlan = buildHousePlan2D(snapshot.rooms, first?.geometry.width ?? 4, first?.geometry.depth ?? 5);
  const document = snapshot.floorPlan?.canonicalDocument;
  const structure = document ? canonicalFloors(document, housePlan.rooms) : roomsFloors(housePlan.rooms, snapshot);
  const floors = structure.floors.filter((floor) => floor.roomIds.size > 0 || floor.structure.length > 0);
  const drawnRoomIds = new Set(floors.flatMap((floor) => [...floor.roomIds]));
  const drawnRooms = roomsAtPlanPositions(snapshot, housePlan.rooms).filter((room) => drawnRoomIds.has(room.id));
  const { placed, unsupported, schedule, tags } = placePlanFurniture(drawnRooms, { ...furniture, rooms: drawnRooms });
  const tagByInstanceId: Record<string, number> = {};
  for (const item of placed) tagByInstanceId[item.placement.id] = tags.get(item.key) ?? 0;
  return {
    sheets: floors.map((floor) => sheetFor(floor, floors.length, placed, tags)),
    schedule,
    tagByInstanceId,
    unsupported: [...structure.unsupported, ...unsupported],
  };
}
