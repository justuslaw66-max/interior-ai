import { getCanonicalFaceTrimsMm, getCanonicalRoomWallFinish } from "@/components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
import { trimmedFaceEdge } from "@/components/editor/renderers/canonical-floor-plan/geometry";
import type {
  CanonicalFloorPlanFloorRenderModel,
  CanonicalFloorPlanRenderModel,
  CanonicalFloorPlanWallSolid,
} from "@/lib/floor-plan-render-model";
import { buildBuiltInRegionFromSolids, type BuiltInRegion } from "@/lib/room-built-in-region";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";
import { getRoomWallFaceIds, readPlanEdgeWallIds } from "@/lib/room-wall-finish-depths";

/**
 * An imported plan's room's finished region (J, 1 Nov 2026: built-ins in imported plans on the same rule as drawn rooms), from
 * the plan's own 3D walls and panels as the canonical 3D view draws them (canonical-floor-plan/CanonicalWallSurfaceMesh.tsx):
 * - every slice of every wall on the room's floor whose plan reaches the room's (beside, below and above its openings, so in
 *   plan the wall with its lintels: a built-in isn't let into a doorway's reveal, as in drawn rooms), each its footprint;
 * - the room's laminate panels as drawn (wallFinishShellGeometry's plan outline): on each slice of each wall the room has a
 *   side of, from the bare face to the finish's depth (getCanonicalRoomWallFinish: deep only on the walls the room is measured
 *   to), cut at the room's corners (getCanonicalFaceTrimsMm). A paint or tile's skin isn't measured (#256).
 * Each edge N of the room's outline (the walls' centre lines) lies on its plan wall (`planEdgeWallIds`), so its face stands that
 * wall's own half-thickness and panel in from it, or where a slice's far side stands in front of that (a wall not centred on
 * its edge). Null for a room its plan doesn't hold, or whose edges aren't named: it keeps furniture's rule.
 *
 * A straight wall's slices and panels stand on its own lines, and meet where its openings' ends are: the plan puts an
 * opening's ends at whole millimetres (pointAlongWall in lib/floor-plan-render-model.ts), so along a turned wall the slices
 * beside, below and above a door or window stand up to 0.71 mm off its line, either way, and a few hundredths of a mm apart or
 * over each other where they meet; taken as drawn, that would break its face into pieces a run can't use.
 */

type Point = RoomPlanPolygonPoint;

export type ImportedBuiltInRegion = { region: BuiltInRegion; faceIds: string[]; panels: number[]; thicknesses: number[] };

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

function crossing(a: Point, b: Point, c: Point, d: Point): Point | null {
  const denominator = (b.x - a.x) * (d.z - c.z) - (b.z - a.z) * (d.x - c.x);
  if (Math.abs(denominator) < 1e-18) return null;
  const t = ((c.x - a.x) * (d.z - c.z) - (c.z - a.z) * (d.x - c.x)) / denominator;
  const u = ((c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x)) / denominator;
  return t > 0 && t < 1 && u > 0 && u < 1 ? { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t } : null;
}

/**
 * A quad as convex pieces, as the region's overlap tests need: itself when convex; split at its reflex corner when not; its two
 * lobes when it crosses itself (a slice mitred past its own length).
 */
export function convexPieces(quad: readonly Point[]): Point[][] {
  const turns = quad.map((point, index) => cross(point, quad[(index + 1) % 4], quad[(index + 2) % 4]));
  if (turns.every((turn) => turn >= 0) || turns.every((turn) => turn <= 0)) return [[...quad]];
  const [a, b, c, d] = quad;
  const first = crossing(a, b, c, d), second = crossing(b, c, d, a);
  if (first) return [[a, first, d], [first, b, c]];
  if (second) return [[b, second, a], [second, c, d]];
  const sign = Math.sign(turns.reduce((sum, turn) => sum + turn, 0));
  // The reflex corner is the one after the turn against the rest.
  const reflex = (turns.findIndex((turn) => Math.sign(turn) === -sign) + 1) % 4;
  const at = (offset: number) => quad[(reflex + offset) % 4];
  return [[at(0), at(1), at(2)], [at(0), at(2), at(3)]];
}

function boundsOf(points: readonly Point[]) {
  const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

type Wall = CanonicalFloorPlanFloorRenderModel["walls"][number];

/**
 * A straight wall's lines, plan metres: a point moved across the wall onto the line `across` metres to its left (side 1) of its
 * centre line (its start to its end, whole millimetres), and, at a slice's end `atMm` along the wall short of the wall's own
 * ends (an opening's), onto it, unless it is cut short of it (a corner's cut). An arc's points are kept.
 */
function onWallLines(wall: Wall): (point: Point, across: number, atMm: number) => Point {
  const centre = wall.centerlineSegments;
  if (wall.path.kind !== "line" || centre.length !== 1) return (point) => point;
  const [start, end] = [centre[0].start, centre[0].end], lengthMm = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  if (!(lengthMm > 0)) return (point) => point;
  const [dx, dz] = [(end.xMm - start.xMm) / lengthMm, (end.zMm - start.zMm) / lengthMm], [x0, z0] = [start.xMm / 1000, start.zMm / 1000];
  return (point, across, atMm) => {
    const alongMm = ((point.x - x0) * dx + (point.z - z0) * dz) * 1000;
    const opening = atMm > 0.001 && atMm < lengthMm - 0.001 && Math.abs(alongMm - atMm) < 2;
    const along = (opening ? atMm : alongMm) / 1000;
    return { x: x0 + dx * along - dz * across, z: z0 + dz * along + dx * across };
  };
}

/** The floor's wall slices whose plan reaches the room's bounds, room-local, each on its wall's lines (above). */
function sliceFootprints(floor: CanonicalFloorPlanFloorRenderModel, toLocal: (point: Point) => Point, outline: readonly Point[]) {
  const room = boundsOf(outline);
  const metres = ({ xMm, zMm }: { xMm: number; zMm: number }) => ({ x: xMm / 1000, z: zMm / 1000 });
  return floor.walls.flatMap((wall) => {
    const onLines = onWallLines(wall), half = wall.thicknessMm / 2000;
    return wall.solids.map(({ footprint, startOffsetMm: from, endOffsetMm: to }) => [
      onLines(metres(footprint.startLeft), half, from), onLines(metres(footprint.endLeft), half, to),
      onLines(metres(footprint.endRight), -half, to), onLines(metres(footprint.startRight), -half, from),
    ].map(toLocal));
  })
    .filter((quad) => {
      const bounds = boundsOf(quad);
      return bounds.maxX > room.minX && bounds.minX < room.maxX && bounds.maxZ > room.minZ && bounds.minZ < room.maxZ;
    });
}

/** The room's laminate panels on the floor's walls as drawn, room-local (see above). */
function panelOutlines(room: RoomSnapshot, floor: CanonicalFloorPlanFloorRenderModel, toLocal: (point: Point) => Point): Point[][] {
  return floor.walls.flatMap((wall) => wall.roomSides.filter(({ roomId }) => roomId === room.id).flatMap(({ side }) => {
    const { depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    if (!(depthMm > 0)) return [];
    const onLines = onWallLines(wall), [face, depth] = [side * wall.thicknessMm / 2000, side * (wall.thicknessMm / 2 + depthMm) / 1000];
    return wall.solids.flatMap((solid: CanonicalFloorPlanWallSolid) => {
      const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
      if (trims.hidden) return [];
      const [bare, front] = [trimmedFaceEdge(solid, side, 0, trims), trimmedFaceEdge(solid, side, depthMm, trims)];
      // A panel cut to nothing along the face draws nothing.
      if (Math.hypot(bare.end.x - bare.start.x, bare.end.z - bare.start.z) + Math.hypot(front.end.x - front.start.x, front.end.z - front.start.z) < 1e-7) return [];
      // A face runs with its wall on side 1 and against it on side -1 (wallSurfaceEdge).
      const [first, last] = side === 1 ? [solid.startOffsetMm, solid.endOffsetMm] : [solid.endOffsetMm, solid.startOffsetMm];
      return [[onLines(bare.start, face, first), onLines(bare.end, face, last), onLines(front.end, depth, last), onLines(front.start, depth, first)].map(toLocal)];
    });
  }));
}

/** The room's region from its plan's canonical model (see above), or null where the plan doesn't hold it or its edges aren't named. */
export function buildImportedBuiltInRegion(room: RoomSnapshot, model: CanonicalFloorPlanRenderModel | undefined): ImportedBuiltInRegion | null {
  const floor = model?.floors.find((entry) => entry.rooms.some(({ id }) => id === room.id));
  const edges = readPlanEdgeWallIds(room), outline = room.planPolygon;
  if (!floor || !edges || !outline) return null;
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const walls = edges.map((wallId) => wallById.get(wallId));
  if (walls.some((wall) => !wall)) return null;
  const origin = room.planPosition ?? { x: 0, z: 0 };
  const toLocal = (point: Point): Point => ({ x: point.x - origin.x, z: point.z - origin.z });
  const cores = sliceFootprints(floor, toLocal, outline);
  const panelsDrawn = panelOutlines(room, floor, toLocal);
  const faceIds = getRoomWallFaceIds(room);
  const thicknesses = walls.map((wall) => (wall?.thicknessMm ?? 0) / 1000);
  const panels = edges.map((wallId) => getCanonicalRoomWallFinish(room, wallId).depthMm / 1000);
  const solids = [...cores, ...panelsDrawn].flatMap(convexPieces);
  const region = buildBuiltInRegionFromSolids([...outline], faceIds, panels, thicknesses, room.planHoles ?? [], solids, cores);
  return { region, faceIds, panels, thicknesses };
}
