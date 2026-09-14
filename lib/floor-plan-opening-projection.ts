import type { CompiledFloorPlanFloorV2, CompiledFloorPlanWallV2 } from "@/lib/floor-plan-compiler-v2";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { RoomSnapshot } from "@/lib/room-types";
import { getCanonicalPlanLine } from "@/lib/wall-segment-geometry";

/** Cardinal side is compatibility metadata only. canonicalHost owns the exact frame. */
function compatibilitySide(wall: CompiledFloorPlanWallV2, room?: RoomSnapshot): RoomOpening2D["wall"] {
  const horizontal = Math.abs(wall.end.xMm - wall.start.xMm) >= Math.abs(wall.end.zMm - wall.start.zMm);
  const centerX = (wall.start.xMm + wall.end.xMm) / 2;
  const centerZ = (wall.start.zMm + wall.end.zMm) / 2;
  const origin = room?.planPosition;
  return horizontal
    ? centerZ <= (origin?.z ?? centerZ / 1000) * 1000 ? "north" : "south"
    : centerX <= (origin?.x ?? centerX / 1000) * 1000 ? "west" : "east";
}

export function projectCanonicalFloorOpenings(
  floor: CompiledFloorPlanFloorV2, rooms: readonly RoomSnapshot[]
): RoomOpening2D[] {
  const walls = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const roomMap = new Map(rooms.map((room) => [room.id, room]));
  return floor.openings.map((opening) => {
    const wall = walls.get(opening.wallId);
    if (!wall) throw new Error(`Compiled opening ${opening.id} has no host wall.`);
    const roomId = wall.adjacentRoomIds[0];
    const center = { x: (opening.start.xMm + opening.end.xMm) / 2, z: (opening.start.zMm + opening.end.zMm) / 2 };
    const line = getCanonicalPlanLine({ x1: wall.start.xMm, z1: wall.start.zMm, x2: wall.end.xMm, z2: wall.end.zMm });
    const centeredOffsetMm = line ? center.x * line.tangent.x + center.z * line.tangent.z - (line.low + line.high) / 2 : 0;
    const room = roomMap.get(roomId);
    const side = compatibilitySide(wall, room);
    const offsetMm = room ? Math.round(side === "north" || side === "south"
      ? center.x - (room.planPosition?.x ?? 0) * 1000 : center.z - (room.planPosition?.z ?? 0) * 1000) : centeredOffsetMm;
    return {
      id: opening.id, ...(roomId ? { roomId } : {}), wall: side,
      offsetMm, widthMm: opening.widthMm, heightMm: opening.heightMm, bottomMm: opening.bottomMm,
      kind: ["window", "vent", "louvre"].includes(opening.kind) ? "window" : "door",
      doorStyle: opening.operation === "fixed" ? "swing" : opening.operation,
      canonicalWallId: wall.id,
      canonicalHost: {
        floorId: floor.id, floorLevel: floor.levelIndex + 1, pathKind: wall.path.kind,
        startMm: { x: wall.start.xMm, z: wall.start.zMm }, endMm: { x: wall.end.xMm, z: wall.end.zMm },
        thicknessMm: wall.thicknessMm, offsetOriginMm: centeredOffsetMm - offsetMm,
      },
      requestedWorldCenterMm: center, operation: opening.operation,
      evidence: { width: opening.widthEvidence, height: opening.heightEvidence, sillHeight: opening.sillHeightEvidence },
    };
  });
}
