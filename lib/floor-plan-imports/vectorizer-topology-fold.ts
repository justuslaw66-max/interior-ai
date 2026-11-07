import type { FloorPlanVertexV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import {
  directionFrom,
  dropWall,
  moveVertex,
  type TopologyFloor,
  vertexMap,
  wallLength,
  wallsByVertex,
} from "./vectorizer-topology-graph";

/**
 * A wall piece no room uses, lying along a wall for most of that wall's length - the vectorizer read the drawn wall as
 * a thinner wall plus a piece beside it - folded into that wall: the wall takes the two bands' width (to 5 mm) and moves
 * sideways to their middle, and the piece goes. The 3D otherwise draws two walls in one place, and the 2D drawing two
 * outlines. Only where the wall runs between corners or T's (no wall running straight on from either end, which the
 * move would kink) and the bands touch.
 */
export const FOLD_TOLERANCES = Object.freeze({
  COVER_SHARE: 0.8,
  PARALLEL_DEG: 2,
  TOUCH_MM: 5,
});

export type FoldEdit = (edit: () => boolean) => boolean;

export function foldAlongside(floor: TopologyFloor, tryEdit: FoldEdit) {
  let folded = 0;
  for (const id of floor.walls.map((wall) => wall.id)) {
    const piece = floor.walls.find((wall) => wall.id === id);
    if (!piece || piece.adjacentRoomIds.length || piece.path.kind !== "line") continue;
    const vertices = vertexMap(floor);
    const host = floor.walls
      .filter((wall) => wall !== piece && wall.path.kind === "line")
      .map((wall) => ({ wall, band: unionBand(piece, wall, vertices) }))
      .filter((entry) => entry.band && entry.band.cover >= FOLD_TOLERANCES.COVER_SHARE && runsBetweenCorners(floor, entry.wall))
      .sort((left, right) => right.band!.cover - left.band!.cover)[0];
    if (!host?.band) continue;
    const { wall, band } = host;
    if (tryEdit(() => fold(floor, piece, wall.id, band))) folded += 1;
  }
  return folded;
}

type Band = { cover: number; shiftMm: number; thicknessMm: number };

/** The two walls' bands across the host's line: where they touch, their width and middle, and the share of the host's
 * length the piece lies along. */
function unionBand(piece: FloorPlanWallV2, host: FloorPlanWallV2, vertices: Map<string, FloorPlanVertexV2>): Band | null {
  const a = vertices.get(host.path.startVertexId)!;
  const length = wallLength(host, vertices);
  if (!length) return null;
  const along = directionFrom(host, a.id, vertices);
  const own = directionFrom(piece, piece.path.startVertexId, vertices);
  if (Math.abs(along.x * own.z - along.z * own.x) > Math.sin((FOLD_TOLERANCES.PARALLEL_DEG * Math.PI) / 180)) return null;
  const ends = [piece.path.startVertexId, piece.path.endVertexId].map((id) => vertices.get(id)!);
  const offset = ends.reduce((sum, p) => sum + (p.xMm - a.xMm) * -along.z + (p.zMm - a.zMm) * along.x, 0) / 2;
  if (Math.abs(offset) > (piece.thicknessMm + host.thicknessMm) / 2 + FOLD_TOLERANCES.TOUCH_MM) return null;
  const s = ends.map((p) => (p.xMm - a.xMm) * along.x + (p.zMm - a.zMm) * along.z);
  const cover = Math.max(0, Math.min(length, Math.max(...s)) - Math.max(0, Math.min(...s))) / length;
  const low = Math.min(-host.thicknessMm / 2, offset - piece.thicknessMm / 2);
  const high = Math.max(host.thicknessMm / 2, offset + piece.thicknessMm / 2);
  return { cover, shiftMm: Math.round((low + high) / 2), thicknessMm: Math.max(5, Math.round((high - low) / 5) * 5) };
}

/** No other wall runs straight on from either end of the wall. */
function runsBetweenCorners(floor: TopologyFloor, wall: FloorPlanWallV2) {
  const vertices = vertexMap(floor);
  const ends = wallsByVertex(floor);
  return [wall.path.startVertexId, wall.path.endVertexId].every((at) => (ends.get(at) ?? []).every((other) => {
    if (other === wall) return true;
    const a = directionFrom(wall, at, vertices);
    const b = directionFrom(other, at, vertices);
    return Math.abs(a.x * b.z - a.z * b.x) > Math.sin((10 * Math.PI) / 180);
  }));
}

function fold(floor: TopologyFloor, piece: FloorPlanWallV2, hostId: string, band: Band) {
  const vertices = vertexMap(floor);
  const host = floor.walls.find((wall) => wall.id === hostId)!;
  const along = directionFrom(host, host.path.startVertexId, vertices);
  const dx = Math.round(-along.z * band.shiftMm);
  const dz = Math.round(along.x * band.shiftMm);
  for (const id of [host.path.startVertexId, host.path.endVertexId]) moveVertex(floor, id, dx, dz);
  host.thicknessMm = band.thicknessMm;
  const own = floor.walls.find((wall) => wall.id === piece.id);
  return Boolean(own && dropWall(floor, own));
}
