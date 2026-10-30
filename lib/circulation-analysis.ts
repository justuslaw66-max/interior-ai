import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignItem, RoomSnapshot, ZoneMin } from "@/lib/room-types";
import { getShapedRoomDoorPoints } from "@/lib/room-door-points";
import { forEachCell, getShapedFloor, routeEntersBoxes, type PlanPoint, type WalkPaint, type WalkSpot } from "@/lib/circulation-shaped-floor";
import { getRoomFinishedOutline } from "@/lib/room-finished-faces";
import { getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";

type CirculationCatalog = Record<string, CatalogItemSchema | undefined>;

export type CirculationHeatCell = {
  x: number;
  z: number;
  clearanceM: number;
  level: "blocked" | "tight" | "warn" | "clear";
  /** Where a shaped room's cell is painted when it isn't the 0.42 m square at x, z: on the floor, within the cell's own square. */
  paint?: WalkPaint;
};

export type CirculationAnalysis = {
  pathValid: boolean;
  minClearanceM: number;
  startCount: number;
  destinationCount: number;
  warnings: string[];
  heatmap: CirculationHeatCell[];
};

type Obstacle = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type GridCell = {
  xIndex: number;
  zIndex: number;
  x: number;
  z: number;
  blocked: boolean;
  clearanceM: number;
};

type ComputeCirculationParams = {
  room: RoomSnapshot;
  items: DesignItem[];
  catalogItems: CirculationCatalog;
  openings?: RoomOpening2D[];
  zones?: ZoneMin[];
  gridSizeM?: number;
  walkwayRadiusM?: number;
};

function getItemObstacle(
  item: DesignItem,
  catalogItems: CirculationCatalog,
  inflateM: number
): Obstacle | null {
  const product = catalogItems[item.productId];
  if (!product) return null;
  const topCategory = mapToTopCategory(product.category, product);
  if (topCategory === "rug" || topCategory === "ceiling_light") return null;
  const variant = item.variantId
    ? product.variants.find((entry) => entry.id === item.variantId)
    : null;
  const dims = variant?.dimensionsMm ?? product.dimsMm;
  const [width, depth] = getRotatedFootprint(
    dims.w / 1000,
    dims.d / 1000,
    item.rotationY ?? 0
  );
  return {
    minX: item.position[0] - width / 2 - inflateM,
    maxX: item.position[0] + width / 2 + inflateM,
    minZ: item.position[2] - depth / 2 - inflateM,
    maxZ: item.position[2] + depth / 2 + inflateM,
  };
}

function pointInsideObstacle(point: { x: number; z: number }, obstacle: Obstacle): boolean {
  return (
    point.x >= obstacle.minX &&
    point.x <= obstacle.maxX &&
    point.z >= obstacle.minZ &&
    point.z <= obstacle.maxZ
  );
}

function distanceToObstacle(point: { x: number; z: number }, obstacle: Obstacle): number {
  const dx = Math.max(obstacle.minX - point.x, 0, point.x - obstacle.maxX);
  const dz = Math.max(obstacle.minZ - point.z, 0, point.z - obstacle.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * Where the walk starts: 30 cm into the room from each of its doors, on the wall the plan puts it on for an L-shape or a drawn
 * shape (lib/room-door-points.ts), or from the middle of the far side with no door.
 */
function getWalkStarts(room: RoomSnapshot, openings: RoomOpening2D[], area: WalkableArea, gridSizeM: number) {
  const roomDoors = openings.filter((opening) => opening.kind === "door" && (!opening.roomId || opening.roomId === room.id));
  const shaped = roomDoors.length > 0 ? getShapedRoomDoorPoints(room, openings) : null;
  if (shaped?.length) return shaped.map(({ center, inward }) => ({ x: center.x + inward.x * 0.3, z: center.z + inward.z * 0.3 }));
  if (roomDoors.length > 0 && !shaped) return roomDoors.map((opening) => getOpeningPoint(opening, room));
  return [{ x: 0, z: area.maxZ + gridSizeM / 2 - 0.3 }];
}

function getOpeningPoint(opening: RoomOpening2D, room: RoomSnapshot): { x: number; z: number } {
  const offset = opening.offsetMm / 1000;
  const width = room.geometry.width;
  const depth = room.geometry.depth;
  if (opening.wall === "north") return { x: offset, z: -depth / 2 + 0.3 };
  if (opening.wall === "south") return { x: offset, z: depth / 2 - 0.3 };
  if (opening.wall === "west") return { x: -width / 2 + 0.3, z: offset };
  return { x: width / 2 - 0.3, z: offset };
}

function nearestCellIndex(cells: GridCell[][], point: { x: number; z: number }): [number, number] | null {
  let best: { key: [number, number]; distance: number } | null = null;
  for (const row of cells) {
    for (const cell of row) {
      if (cell.blocked) continue;
      const distance = Math.hypot(cell.x - point.x, cell.z - point.z);
      if (!best || distance < best.distance) {
        best = { key: [cell.xIndex, cell.zIndex], distance };
      }
    }
  }
  return best?.key ?? null;
}

type CellLink = (xIndex: number, zIndex: number, nextX: number, nextZ: number) => boolean;

function hasPath(
  cells: GridCell[][], starts: Array<{ x: number; z: number }>, destinations: Array<{ x: number; z: number }>, linked?: CellLink
): boolean {
  const startKeys = starts.map((point) => nearestCellIndex(cells, point)).filter((entry): entry is [number, number] => Boolean(entry));
  const destinationKeys = new Set(
    destinations
      .map((point) => nearestCellIndex(cells, point))
      .filter((entry): entry is [number, number] => Boolean(entry))
      .map(([xIndex, zIndex]) => `${xIndex}:${zIndex}`)
  );
  if (!startKeys.length || !destinationKeys.size) return true;

  const queue = [...startKeys];
  const visited = new Set(queue.map(([xIndex, zIndex]) => `${xIndex}:${zIndex}`));
  const neighbors = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  while (queue.length) {
    const [xIndex, zIndex] = queue.shift()!;
    if (destinationKeys.has(`${xIndex}:${zIndex}`)) return true;
    for (const [dx, dz] of neighbors) {
      const nextX = xIndex + dx;
      const nextZ = zIndex + dz;
      const row = cells[nextZ];
      const next = row?.[nextX];
      if (!next || next.blocked || (linked && !linked(xIndex, zIndex, nextX, nextZ))) continue;
      const key = `${nextX}:${nextZ}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push([nextX, nextZ]);
    }
  }

  return false;
}

type WalkableArea = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** A cell's walk spot, or null where the cell isn't on the room's floor. */
  spotAt: (x: number, z: number, xIndex: number, zIndex: number) => WalkSpot | null;
  /** In a shaped room, whether a walk between two neighbouring cells can go clear of the walls; any walk goes in a rectangle. */
  canWalk?: (xIndex: number, zIndex: number, nextX: number, nextZ: number, blocked: (route: readonly PlanPoint[]) => boolean) => boolean;
};

/**
 * The walkable grid's extent: its outer cells' centres half a cell in from the walls' finished faces, which are half the wall
 * in from the outline and in front of each wall's laminate panel (J, 29 Oct 2026: "Fix it, all from the face"). An L-shape's
 * or a drawn shape's grid covers its bounding rectangle (getShapedFloor, lib/circulation-shaped-floor.ts): the map no longer
 * paints a notch as walkable, and a cell's clearance is to the nearest face, the notch's walls included.
 */
function getWalkableArea(room: RoomSnapshot, gridSizeM: number): WalkableArea {
  const wallFace = (room.geometry.wallThickness ?? 0.12) / 2;
  const outline = getRoomFinishedOutline(room, { w: room.geometry.width, d: room.geometry.depth }, wallFace);
  if (outline) {
    const floor = getShapedFloor(outline, gridSizeM);
    return { ...floor, spotAt: (_x, _z, xIndex, zIndex) => floor.spotAt(xIndex, zIndex) };
  }
  const panels = getRoomWallFinishDepths(room);
  const minX = -room.geometry.width / 2 + wallFace + (panels.west ?? 0) + gridSizeM / 2;
  const maxX = room.geometry.width / 2 - wallFace - (panels.east ?? 0) - gridSizeM / 2;
  const minZ = -room.geometry.depth / 2 + wallFace + (panels.north ?? 0) + gridSizeM / 2;
  const maxZ = room.geometry.depth / 2 - wallFace - (panels.south ?? 0) - gridSizeM / 2;
  return {
    minX, maxX, minZ, maxZ,
    spotAt: (x, z) => ({ x, z, clearance: Math.min(x - minX, maxX - x, z - minZ, maxZ - z) + gridSizeM / 2 }),
  };
}

function getClearanceLevel(blocked: boolean, clearanceM: number): CirculationHeatCell["level"] {
  if (blocked) return "blocked";
  if (clearanceM < 0.32) return "tight";
  return clearanceM < 0.6 ? "warn" : "clear";
}

/** The grid of walking cells; one off the room's floor is kept in its place, not walkable and not painted. */
function buildWalkableGrid(area: WalkableArea, obstacles: Obstacle[], gridSizeM: number) {
  const cells: GridCell[][] = [];
  const heatmap: CirculationHeatCell[] = [];
  let minClearanceM = Infinity;
  forEachCell(area, gridSizeM, (x, z, xIndex, zIndex) => {
    const row = (cells[zIndex] ??= []);
    const spot = area.spotAt(x, z, xIndex, zIndex);
    if (!spot) {
      row.push({ xIndex, zIndex, x, z, blocked: true, clearanceM: 0 });
      return;
    }
    // Items are measured from the cell's walk spot: its centre, in a rectangle.
    const point = { x: spot.x, z: spot.z };
    const blocked = obstacles.some((obstacle) => pointInsideObstacle(point, obstacle));
    const obstacleClearance = obstacles.length
      ? Math.min(...obstacles.map((obstacle) => distanceToObstacle(point, obstacle)))
      : Infinity;
    const clearanceM = blocked ? 0 : Math.min(spot.clearance, obstacleClearance);
    if (!blocked) minClearanceM = Math.min(minClearanceM, clearanceM);
    const level = getClearanceLevel(blocked, clearanceM);
    if (level !== "clear") heatmap.push({ ...point, clearanceM, level, ...(spot.paint ? { paint: spot.paint } : {}) });
    row.push({ xIndex, zIndex, ...point, blocked, clearanceM });
  });
  return { cells, heatmap, minClearanceM };
}

export function computeCirculationAnalysis({
  room,
  items,
  catalogItems,
  openings = [],
  zones = room.zones,
  gridSizeM = 0.45,
  walkwayRadiusM = 0.34,
}: ComputeCirculationParams): CirculationAnalysis {
  const area = getWalkableArea(room, gridSizeM);
  const obstacles = items
    .map((item) => getItemObstacle(item, catalogItems, walkwayRadiusM))
    .filter((entry): entry is Obstacle => Boolean(entry));
  const { cells, heatmap, minClearanceM } = buildWalkableGrid(area, obstacles, gridSizeM);

  const starts = getWalkStarts(room, openings, area, gridSizeM);
  const destinations = [
    { x: 0, z: 0 },
    ...zones
      .map((zone) => zone.anchor)
      .filter((anchor): anchor is [number, number, number] => Boolean(anchor))
      .map((anchor) => ({ x: anchor[0], z: anchor[2] })),
  ];
  // In a shaped room a walk between two cells can run up to a cell aside: it must miss every item's walk zone too.
  const { canWalk } = area;
  const linked: CellLink | undefined = canWalk && ((xIndex, zIndex, nextX, nextZ) =>
    canWalk(xIndex, zIndex, nextX, nextZ, (route) => routeEntersBoxes(route, obstacles)));
  const pathValid = hasPath(cells, starts, destinations, linked);
  const warnings: string[] = [];
  const hasObstacles = obstacles.length > 0;
  if (!pathValid) warnings.push("No clear walking path from the door to the room zones.");
  if (hasObstacles && Number.isFinite(minClearanceM) && minClearanceM < 0.32) {
    warnings.push("Walking clearance falls below 32 cm in parts of the room.");
  } else if (hasObstacles && Number.isFinite(minClearanceM) && minClearanceM < 0.6) {
    warnings.push("Walking clearance is tight in parts of the room.");
  }

  return {
    pathValid,
    minClearanceM: Number.isFinite(minClearanceM) ? minClearanceM : 0,
    startCount: starts.length,
    destinationCount: destinations.length,
    warnings,
    heatmap: heatmap.slice(0, 80),
  };
}
