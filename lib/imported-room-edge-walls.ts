import { compileFloorPlanDocumentV2, type CompiledFloorPlanSceneV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { roomOutlineCenterMm, roomPolygonEdges } from "@/lib/floor-plan-room-outline";
import type { PersistedFloorPlanState, RoomSnapshot } from "@/lib/room-types";
import { sanitizePlanEdgeWallIds, sanitizePlanEdgeWallThicknesses } from "@/lib/room-wall-finish-depths";

/**
 * The edges of imported rooms saved before the import named them (`planEdgeWallIds`, 30 Oct 2026), named from the plan the
 * design carries when it is loaded, so the rooms are measured to their panels' faces with no migration
 * (lib/room-wall-finish-depths.ts). A room's edges are named only when its outline is the one its plan gives it, point for
 * point; one that doesn't match keeps the bare wall, and its plan draws its finishes flat, until the plan is rebuilt.
 * Their walls' thicknesses (`planEdgeWallThicknessesMm`) are named with them. Saved values that aren't a list of strings (or of
 * positive millimetres, one per edge) are dropped first.
 */

const POINT_TOLERANCE_M = 0.002;
// One compiled plan per document, and by its id, revision and geometry: a design is loaded again from new objects with the same
// plan. The keyed cache keeps the last four plans, so a server loading many designs holds no more.
const scenesByDocument = new WeakMap<FloorPlanDocumentV2, CompiledFloorPlanSceneV2 | null>();
const scenesByGeometry = new Map<string, CompiledFloorPlanSceneV2 | null>();

/** A point of a saved outline, when it is one: a damaged design's may be anything. */
function isPlanPoint(point: unknown): point is { x: number; z: number } {
  return typeof point === "object" && point !== null &&
    Number.isFinite((point as { x?: unknown }).x) && Number.isFinite((point as { z?: unknown }).z);
}

function needsEdgeWallIds(room: RoomSnapshot): boolean {
  return typeof room.floorElevationMm === "number" && room.planShape === "custom_polygon" &&
    Array.isArray(room.planPolygon) && room.planPolygon.length >= 3 && room.planPolygon.every(isPlanPoint) &&
    !hasEdgeWalls(room);
}

/**
 * A key for a document a design is loaded with again from new objects: its id, its revision (a plan edit makes a new one) and
 * its saved geometry hash. None for a document without an id or revision.
 */
function documentKey(document: FloorPlanDocumentV2, geometryHash: unknown): string | null {
  if (typeof document.id !== "string" || typeof document.revisionId !== "string") return null;
  return `${document.id}:${document.revisionId}:${typeof geometryHash === "string" ? geometryHash : ""}`;
}

/** A plan compiled before, if any: by its object, or by its key while it still has the saved geometry. */
function knownPlan(plan: FloorPlanDocumentV2, key: string | null, hash: string | null): CompiledFloorPlanSceneV2 | null | undefined {
  // A failed compile (null) is kept too, so a broken plan isn't compiled again on every load.
  if (scenesByDocument.has(plan)) return scenesByDocument.get(plan) ?? null;
  if (!key || !scenesByGeometry.has(key)) return undefined;
  const known = scenesByGeometry.get(key) ?? null;
  // A stale hash never names another plan's walls.
  return !known || !hash || known.geometryHash === hash ? known : undefined;
}

function compiledPlan(floorPlan: PersistedFloorPlanState): CompiledFloorPlanSceneV2 | null {
  const document: unknown = floorPlan.canonicalDocument;
  if (typeof document !== "object" || document === null) return null;
  const plan = document as FloorPlanDocumentV2;
  const hash = typeof floorPlan.canonicalGeometryHash === "string" ? floorPlan.canonicalGeometryHash : null;
  const key = documentKey(plan, hash);
  const known = knownPlan(plan, key, hash);
  if (known !== undefined) return known;
  let scene: CompiledFloorPlanSceneV2 | null;
  try {
    scene = compileFloorPlanDocumentV2(plan);
  } catch {
    scene = null;
  }
  scenesByDocument.set(plan, scene);
  // Kept by its key only when the saved hash is the plan's own; a failure is kept too.
  if (key && (!scene || !hash || scene.geometryHash === hash)) {
    if (scenesByGeometry.size >= 4) scenesByGeometry.delete(scenesByGeometry.keys().next().value!);
    scenesByGeometry.set(key, scene);
  }
  return scene;
}

/** Whether the room's edges are named and their walls' thicknesses saved with them, each a valid list. */
function hasEdgeWalls(room: RoomSnapshot): boolean {
  const ids = sanitizePlanEdgeWallIds(room.planEdgeWallIds);
  return Boolean(ids && sanitizePlanEdgeWallThicknesses(room.planEdgeWallThicknessesMm, ids.length));
}

type EdgeWalls = Pick<RoomSnapshot, "planEdgeWallIds" | "planEdgeWallThicknessesMm">;

/** The plan's walls under each edge of the room's outline, and their thicknesses, when the plan still gives it that outline. */
export function matchImportedRoomEdgeWalls(room: RoomSnapshot, scene: CompiledFloorPlanSceneV2): EdgeWalls | undefined {
  for (const floor of scene.floors) {
    const compiledRoom = floor.rooms.find(({ id }) => id === room.id);
    const outer = compiledRoom?.wallLoops.find(({ kind }) => kind === "outer");
    if (!outer) continue;
    const edges = roomPolygonEdges(outer, new Map(floor.walls.map((wall) => [wall.id, wall])));
    const polygon = room.planPolygon ?? [];
    if (edges.length !== polygon.length || !polygon.every(isPlanPoint)) return undefined;
    const center = roomOutlineCenterMm(edges.map(({ point }) => point));
    const same = edges.every(({ point }, index) =>
      Math.abs((point.xMm - center.xMm) / 1000 - polygon[index].x) < POINT_TOLERANCE_M &&
      Math.abs((point.zMm - center.zMm) / 1000 - polygon[index].z) < POINT_TOLERANCE_M);
    return same ? { planEdgeWallIds: edges.map(({ wallId }) => wallId), planEdgeWallThicknessesMm: edges.map(({ thicknessMm }) => thicknessMm) } : undefined;
  }
  return undefined;
}

/** Whether a room's saved edge walls must be dropped (not valid lists) or named. */
function isPending(room: RoomSnapshot): boolean {
  const saved = room.planEdgeWallIds !== undefined || room.planEdgeWallThicknessesMm !== undefined;
  return (saved && !hasEdgeWalls(room)) || needsEdgeWallIds(room);
}

/** The room without its saved edge walls. */
function withoutEdgeWalls(room: RoomSnapshot): RoomSnapshot {
  const unnamed: RoomSnapshot = { ...room };
  delete unnamed.planEdgeWallIds;
  delete unnamed.planEdgeWallThicknessesMm;
  return unnamed;
}

/**
 * The rooms with their edges named where they can be; the same list when no room needs it. Naming never stops a design
 * loading: if anything in a damaged design makes it fail, the rooms are returned as they were saved, less ids that aren't a
 * list of strings.
 */
export function withImportedRoomEdgeWallIds(
  rooms: RoomSnapshot[], floorPlan: PersistedFloorPlanState | undefined
): RoomSnapshot[] {
  try {
    return nameImportedRoomEdges(rooms, floorPlan);
  } catch {
    return rooms.map((room) => {
      try {
        return room && (room.planEdgeWallIds !== undefined || room.planEdgeWallThicknessesMm !== undefined) && !hasEdgeWalls(room)
          ? withoutEdgeWalls(room) : room;
      } catch {
        return room;
      }
    });
  }
}

function nameImportedRoomEdges(rooms: RoomSnapshot[], floorPlan: PersistedFloorPlanState | undefined): RoomSnapshot[] {
  if (!rooms.some(isPending)) return rooms;
  let scene: CompiledFloorPlanSceneV2 | null | undefined;
  return rooms.map((room) => {
    if (!isPending(room)) return room;
    const unnamed = withoutEdgeWalls(room);
    if (!needsEdgeWallIds(unnamed) || !floorPlan) return unnamed;
    scene ??= compiledPlan(floorPlan);
    const edgeWalls = scene ? matchImportedRoomEdgeWalls(unnamed, scene) : undefined;
    return edgeWalls ? { ...unnamed, ...edgeWalls } : unnamed;
  });
}
