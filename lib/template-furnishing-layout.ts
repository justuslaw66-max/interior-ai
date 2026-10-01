import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { HousePlanTemplateFurnishingIntent } from "@/lib/design-page-house-plan";
import { getFurnitureWallInset } from "@/lib/design-page-geometry";

// A template pack's furniture, fitted to the products it gets (UX phase 4g, audit ST9). The packs
// give each piece a spot for a mid-sized product; the catalogue decides the real size. Each piece
// stays inside its room, a sofa, TV console or sideboard has its back to a wall, the coffee table
// is in front of the sofa, a floor lamp or side table stands beside it, nothing overlaps, and
// nothing stops just short of a wall.

type Category = HousePlanTemplateFurnishingIntent["category"];
export type PlacedFootprint = { category: Category; x: number; z: number; w: number; d: number };
export type FurnishingRoom = { width: number; depth: number; wallThickness: number };

/** Clear of a wall: closer than this and a piece is either against the wall or in the way. */
export const TEMPLATE_FURNITURE_CLEAR_OF_WALL_METERS = 0.35;
const GAP_METERS = 0.05;
const AGAINST_WALL: ReadonlySet<Category> = new Set(["sofa", "tv_console", "sideboard"]);
const BESIDE_SOFA: ReadonlySet<Category> = new Set(["floor_lamp", "side_table"]);
const COFFEE_TABLE_GAP_METERS = 0.45;
/** Within this of its spot against the wall a piece is against it, not "tight" (the plan review agrees). */
export const AGAINST_WALL_TOLERANCE_METERS = 0.03;

export function productFootprint(product: CatalogItemSchema, rotationY: number) {
  const width = product.bounds?.type === "aabb" ? product.bounds.size.w : product.dimsMm.w / 1000;
  const depth = product.bounds?.type === "aabb" ? product.bounds.size.d : product.dimsMm.d / 1000;
  const cos = Math.abs(Math.cos(rotationY));
  const sin = Math.abs(Math.sin(rotationY));
  return { w: cos * width + sin * depth, d: sin * width + cos * depth };
}

/** How far the piece can go from the room's centre on each axis, against the walls' faces. */
function limits(piece: Pick<PlacedFootprint, "w" | "d">, room: FurnishingRoom) {
  const inset = getFurnitureWallInset(room.wallThickness);
  return { x: Math.max(0, room.width / 2 - inset - piece.w / 2), z: Math.max(0, room.depth / 2 - inset - piece.d / 2) };
}

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

function inside(piece: PlacedFootprint, room: FurnishingRoom): PlacedFootprint {
  const limit = limits(piece, room);
  return { ...piece, x: clamp(piece.x, limit.x), z: clamp(piece.z, limit.z) };
}

/** Against the nearer wall (a sofa, TV console or sideboard); else clear of the walls, when it fits. */
function settle(piece: PlacedFootprint, room: FurnishingRoom, againstWall: boolean): PlacedFootprint {
  const limit = limits(piece, room);
  const inset = getFurnitureWallInset(room.wallThickness);
  if (againstWall) {
    // Back to the wall: a piece longer across x has its back on a north or south wall.
    return piece.w >= piece.d
      ? { ...piece, z: Math.sign(piece.z || -1) * limit.z }
      : { ...piece, x: Math.sign(piece.x || 1) * limit.x };
  }
  const clear = Math.max(0, TEMPLATE_FURNITURE_CLEAR_OF_WALL_METERS + 0.01 - inset);
  const away = (value: number, axisLimit: number) => {
    const gap = axisLimit - Math.abs(value);
    return gap > AGAINST_WALL_TOLERANCE_METERS && gap < clear && axisLimit > clear ? Math.sign(value) * (axisLimit - clear) : value;
  };
  return { ...piece, x: away(piece.x, limit.x), z: away(piece.z, limit.z) };
}

/** Beside the room's sofa, at the end nearer its spot (the other end if it doesn't fit), back to the sofa's back. */
function besideSofa(piece: PlacedFootprint, sofa: PlacedFootprint, room: FurnishingRoom): PlacedFootprint | null {
  const alongX = sofa.w >= sofa.d;
  const limit = limits(piece, room);
  const ends = alongX
    ? [sofa.x - sofa.w / 2 - GAP_METERS - piece.w / 2, sofa.x + sofa.w / 2 + GAP_METERS + piece.w / 2]
    : [sofa.z - sofa.d / 2 - GAP_METERS - piece.d / 2, sofa.z + sofa.d / 2 + GAP_METERS + piece.d / 2];
  const wanted = alongX ? piece.x : piece.z;
  const order = Math.abs(ends[0] - wanted) <= Math.abs(ends[1] - wanted) ? ends : [ends[1], ends[0]];
  const end = order.find((value) => Math.abs(value) <= (alongX ? limit.x : limit.z) + 1e-6);
  if (end === undefined) return null;
  const back = alongX
    ? Math.sign(sofa.z || -1) * (Math.abs(sofa.z) + sofa.d / 2 - piece.d / 2)
    : Math.sign(sofa.x || 1) * (Math.abs(sofa.x) + sofa.w / 2 - piece.w / 2);
  return alongX ? { ...piece, x: end, z: clamp(back, limit.z) } : { ...piece, x: clamp(back, limit.x), z: end };
}

/** In front of the sofa, a knee's width away, centred on it. */
function inFrontOfSofa(piece: PlacedFootprint, sofa: PlacedFootprint, room: FurnishingRoom): PlacedFootprint {
  const alongX = sofa.w >= sofa.d;
  const facing = -Math.sign((alongX ? sofa.z : sofa.x) || -1);
  const front = alongX
    ? { x: sofa.x, z: sofa.z + facing * (sofa.d / 2 + COFFEE_TABLE_GAP_METERS + piece.d / 2) }
    : { x: sofa.x + facing * (sofa.w / 2 + COFFEE_TABLE_GAP_METERS + piece.w / 2), z: sofa.z };
  return inside({ ...piece, ...front }, room);
}

function overlap(a: PlacedFootprint, b: PlacedFootprint) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + GAP_METERS && Math.abs(a.z - b.z) < (a.d + b.d) / 2 + GAP_METERS;
}

/** Out of every earlier piece, the shortest way, and back inside the room. */
function clearOf(piece: PlacedFootprint, placed: readonly PlacedFootprint[], room: FurnishingRoom): PlacedFootprint {
  let next = piece;
  for (let pass = 0; pass < 8; pass += 1) {
    const other = placed.find((entry) => overlap(next, entry));
    if (!other) return next;
    const moves = [
      { x: other.x - (other.w + next.w) / 2 - GAP_METERS * 1.5, z: next.z },
      { x: other.x + (other.w + next.w) / 2 + GAP_METERS * 1.5, z: next.z },
      { x: next.x, z: other.z - (other.d + next.d) / 2 - GAP_METERS * 1.5 },
      { x: next.x, z: other.z + (other.d + next.d) / 2 + GAP_METERS * 1.5 },
    ]
      .map((move) => inside({ ...next, ...move }, room))
      .sort((a, b) => Math.hypot(a.x - next.x, a.z - next.z) - Math.hypot(b.x - next.x, b.z - next.z));
    next = moves.find((move) => !placed.some((entry) => overlap(move, entry))) ?? moves[0];
  }
  return next;
}

/** Where a pack's piece goes once its product is known, given the pieces already in the room. */
export function fitTemplateFurnishing(
  piece: PlacedFootprint,
  placed: readonly PlacedFootprint[],
  room: FurnishingRoom,
  /** Keep the pack's spot (only inside the room and clear of the others): the fallback by a door. */
  keepSpot = false
): PlacedFootprint {
  const sofa = placed.find((entry) => entry.category === "sofa");
  const start = keepSpot
    ? settle(inside(piece, room), room, false)
    : piece.category === "coffee_table" && sofa
      ? inFrontOfSofa(piece, sofa, room)
      : (BESIDE_SOFA.has(piece.category) && sofa && besideSofa(piece, sofa, room)) ||
        settle(inside(piece, room), room, AGAINST_WALL.has(piece.category));
  const fitted = clearOf(start, placed, room);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return { ...fitted, x: round(fitted.x), z: round(fitted.z) };
}
