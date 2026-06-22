import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { mapToTopCategory } from "@/lib/catalog/view-builders";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignItem, RoomSnapshot, ZoneMin } from "@/lib/room-types";

type CirculationCatalog = Record<string, CatalogItemSchema | undefined>;

export type CirculationHeatCell = {
  x: number;
  z: number;
  clearanceM: number;
  level: "blocked" | "tight" | "warn" | "clear";
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
  if (mapToTopCategory(product.category, product) === "rug") return null;
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

function hasPath(cells: GridCell[][], starts: Array<{ x: number; z: number }>, destinations: Array<{ x: number; z: number }>): boolean {
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
      if (!next || next.blocked) continue;
      const key = `${nextX}:${nextZ}`;
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push([nextX, nextZ]);
    }
  }

  return false;
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
  const wallThickness = room.geometry.wallThickness ?? 0.12;
  const minX = -room.geometry.width / 2 + wallThickness + gridSizeM / 2;
  const maxX = room.geometry.width / 2 - wallThickness - gridSizeM / 2;
  const minZ = -room.geometry.depth / 2 + wallThickness + gridSizeM / 2;
  const maxZ = room.geometry.depth / 2 - wallThickness - gridSizeM / 2;
  const obstacles = items
    .map((item) => getItemObstacle(item, catalogItems, walkwayRadiusM))
    .filter((entry): entry is Obstacle => Boolean(entry));
  const cells: GridCell[][] = [];
  const heatmap: CirculationHeatCell[] = [];
  let minClearanceM = Infinity;

  for (let z = minZ, zIndex = 0; z <= maxZ + 0.001; z += gridSizeM, zIndex += 1) {
    const row: GridCell[] = [];
    for (let x = minX, xIndex = 0; x <= maxX + 0.001; x += gridSizeM, xIndex += 1) {
      const point = { x, z };
      const blocked = obstacles.some((obstacle) => pointInsideObstacle(point, obstacle));
      const wallClearance = Math.min(x - minX, maxX - x, z - minZ, maxZ - z) + gridSizeM / 2;
      const obstacleClearance = obstacles.length
        ? Math.min(...obstacles.map((obstacle) => distanceToObstacle(point, obstacle)))
        : Infinity;
      const clearanceM = blocked ? 0 : Math.min(wallClearance, obstacleClearance);
      if (!blocked) minClearanceM = Math.min(minClearanceM, clearanceM);
      const level: CirculationHeatCell["level"] = blocked
        ? "blocked"
        : clearanceM < 0.32
          ? "tight"
          : clearanceM < 0.6
            ? "warn"
            : "clear";
      if (level !== "clear") {
        heatmap.push({ x, z, clearanceM, level });
      }
      row.push({ xIndex, zIndex, x, z, blocked, clearanceM });
    }
    cells.push(row);
  }

  const roomOpenings = openings.filter((opening) => opening.kind === "door" && (!opening.roomId || opening.roomId === room.id));
  const starts =
    roomOpenings.length > 0
      ? roomOpenings.map((opening) => getOpeningPoint(opening, room))
      : [{ x: 0, z: room.geometry.depth / 2 - wallThickness - 0.3 }];
  const destinations = [
    { x: 0, z: 0 },
    ...zones
      .map((zone) => zone.anchor)
      .filter((anchor): anchor is [number, number, number] => Boolean(anchor))
      .map((anchor) => ({ x: anchor[0], z: anchor[2] })),
  ];
  const pathValid = hasPath(cells, starts, destinations);
  const warnings: string[] = [];
  const hasObstacles = obstacles.length > 0;
  if (!pathValid) warnings.push("No clear walking path from the doorway to the room zones.");
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
