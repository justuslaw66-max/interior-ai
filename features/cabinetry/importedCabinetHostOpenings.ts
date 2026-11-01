import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";
import { readPlanEdgeWallIds } from "@/lib/room-wall-finish-depths";

import type { CabinetHostOpening } from "./types";

/**
 * An imported plan's doors and windows as Fit to Space's hosts see them (features/cabinetry/roomCabinetHosts.ts): from the
 * plan's canonical model, where its 3D view draws them as gaps between a wall's slices. Each one on the plan wall an outline
 * edge lies on (`planEdgeWallIds`) is measured along that edge, from its middle, by where its ends stand along the wall's path;
 * the host on the edge's exposed face then takes the doors of every piece of the outline its face runs over. The plan's own
 * openings (the 2D plan's cardinal ones) aren't read.
 */

type Point = RoomPlanPolygonPoint;
type OutlineOpening = CabinetHostOpening & { wallId: string };

/** The doors and windows on each of the room's outline edges (`wall-N`), from the room's floor in `canonical`. */
export function getImportedOutlineOpenings(room: RoomSnapshot, outline: readonly Point[], canonical: CanonicalFloorPlanRenderModel | undefined): OutlineOpening[] {
  const floor = canonical?.floors.find((entry) => entry.rooms.some(({ id }) => id === room.id));
  const edges = readPlanEdgeWallIds(room);
  if (!floor || !edges) return [];
  const origin = room.planPosition ?? { x: 0, z: 0 };
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
  return outline.flatMap((start, index) => {
    const end = outline[(index + 1) % outline.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    const wall = wallById.get(edges[index]);
    if (!wall || !(length > 1e-9)) return [];
    const along = ({ xMm, zMm }: { xMm: number; zMm: number }) =>
      ((xMm / 1000 - origin.x - start.x) * (end.x - start.x) + (zMm / 1000 - origin.z - start.z) * (end.z - start.z)) / length;
    return wall.openings.flatMap((opening): OutlineOpening[] => {
      // Its stretch along the edge (an arc's chord takes the part over it).
      const [from, to] = [along(opening.start), along(opening.end)].sort((a, b) => a - b);
      const [low, high] = [Math.max(0, from), Math.min(length, to)];
      if (!(high > low)) return [];
      const door = opening.kind !== "window" && opening.kind !== "vent" && opening.kind !== "louvre";
      return [{
        id: opening.id, wallId: `wall-${index}`, kind: door ? "door" : "window", label: door ? "Door" : "Window",
        offsetMm: Number((((low + high) / 2 - length / 2) * 1000).toFixed(3)), widthMm: Number(((high - low) * 1000).toFixed(3)),
        bottomMm: opening.bottomMm, heightMm: opening.topMm - opening.bottomMm,
      }];
    });
  });
}
