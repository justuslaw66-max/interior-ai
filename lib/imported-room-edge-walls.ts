import { compileFloorPlanDocumentV2, type CompiledFloorPlanSceneV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { roomOutlineCenterMm, roomPolygonEdges } from "@/lib/floor-plan-room-outline";
import type { PersistedFloorPlanState, RoomSnapshot } from "@/lib/room-types";
import { sanitizePlanEdgeWallIds } from "@/lib/room-wall-finish-depths";

/**
 * The edges of imported rooms saved before the import named them (`planEdgeWallIds`, 30 Oct 2026), named from the plan the
 * design carries when it is loaded, so the rooms are measured to their panels' faces with no migration
 * (lib/room-wall-finish-depths.ts). A room's edges are named only when its outline is the one its plan gives it, point for
 * point; one that doesn't match keeps the bare wall, and its plan draws its finishes flat, until the plan is rebuilt.
 * Saved ids that aren't a list of strings are dropped first.
 */

const POINT_TOLERANCE_M = 0.002;
// One compiled plan per document, and by its geometry: a design is loaded again from new objects with the same plan.
const scenesByDocument = new WeakMap<FloorPlanDocumentV2, CompiledFloorPlanSceneV2 | null>();
const scenesByGeometry = new Map<string, CompiledFloorPlanSceneV2 | null>();

function needsEdgeWallIds(room: RoomSnapshot): boolean {
  return typeof room.floorElevationMm === "number" && room.planShape === "custom_polygon" &&
    (room.planPolygon?.length ?? 0) >= 3 && !sanitizePlanEdgeWallIds(room.planEdgeWallIds);
}

function compiledPlan(floorPlan: PersistedFloorPlanState): CompiledFloorPlanSceneV2 | null {
  const document = floorPlan.canonicalDocument;
  if (!document) return null;
  const geometryKey = floorPlan.canonicalGeometryHash ? `${document.id}:${floorPlan.canonicalGeometryHash}` : null;
  const known = scenesByDocument.get(document) ?? (geometryKey ? scenesByGeometry.get(geometryKey) : undefined);
  if (known !== undefined) return known;
  let scene: CompiledFloorPlanSceneV2 | null;
  try {
    scene = compileFloorPlanDocumentV2(document);
  } catch {
    scene = null;
  }
  scenesByDocument.set(document, scene);
  if (geometryKey) {
    if (scenesByGeometry.size >= 4) scenesByGeometry.delete(scenesByGeometry.keys().next().value!);
    scenesByGeometry.set(geometryKey, scene);
  }
  return scene;
}

/** The plan's walls under each edge of the room's outline, when the plan still gives the room that outline. */
export function matchImportedRoomEdgeWallIds(room: RoomSnapshot, scene: CompiledFloorPlanSceneV2): string[] | undefined {
  for (const floor of scene.floors) {
    const compiledRoom = floor.rooms.find(({ id }) => id === room.id);
    const outer = compiledRoom?.wallLoops.find(({ kind }) => kind === "outer");
    if (!outer) continue;
    const edges = roomPolygonEdges(outer, new Map(floor.walls.map((wall) => [wall.id, wall])));
    const polygon = room.planPolygon ?? [];
    if (edges.length !== polygon.length) return undefined;
    const center = roomOutlineCenterMm(edges.map(({ point }) => point));
    const same = edges.every(({ point }, index) =>
      Math.abs((point.xMm - center.xMm) / 1000 - polygon[index].x) < POINT_TOLERANCE_M &&
      Math.abs((point.zMm - center.zMm) / 1000 - polygon[index].z) < POINT_TOLERANCE_M);
    return same ? edges.map(({ wallId }) => wallId) : undefined;
  }
  return undefined;
}

/** Whether a room's saved ids must be dropped (not a list of strings) or its edges named. */
function isPending(room: RoomSnapshot): boolean {
  return (room.planEdgeWallIds !== undefined && !sanitizePlanEdgeWallIds(room.planEdgeWallIds)) || needsEdgeWallIds(room);
}

/** The rooms with their edges named where they can be; the same list when no room needs it. */
export function withImportedRoomEdgeWallIds(
  rooms: RoomSnapshot[], floorPlan: PersistedFloorPlanState | undefined
): RoomSnapshot[] {
  if (!rooms.some(isPending)) return rooms;
  let scene: CompiledFloorPlanSceneV2 | null | undefined;
  return rooms.map((room) => {
    if (!isPending(room)) return room;
    const unnamed: RoomSnapshot = { ...room };
    delete unnamed.planEdgeWallIds;
    if (!needsEdgeWallIds(unnamed) || !floorPlan) return unnamed;
    scene ??= compiledPlan(floorPlan);
    const planEdgeWallIds = scene ? matchImportedRoomEdgeWallIds(unnamed, scene) : undefined;
    return planEdgeWallIds ? { ...unnamed, planEdgeWallIds } : unnamed;
  });
}
