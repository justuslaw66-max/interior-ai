import { findNearestBuiltInFit, findNearestBuiltInFitAlong, type BuiltInFitObstacles } from "@/lib/built-in-nearest-fit";
import type { BuiltInHostFace } from "@/lib/room-built-in-host-faces";
import type { RegionWall } from "@/lib/room-built-in-region";

type Point = { x: number; z: number };

/**
 * A built-in moved from a place where it doesn't fit (J's delegate, 2 Nov 2026): a run saved before its room's rule
 * overlapping its wall, or one a panel added since cuts into. It comes free near where it stands, never thrown off its wall:
 * against the face it stands against there, its back kept on it (or the baseboard's depth off it), at the nearest place along
 * it within its own length that it fits; standing against none, at the nearest place it fits within its own length. Where
 * none is, the move is refused and it stays where it is (Fit to Space again fits it to its wall as it is now).
 */

/** How far in front of a face (metres, past its stand-off) a built-in's back may stand and still stand against it. */
const AGAINST_IN_FRONT = 0.02;
/** A built-in this near square to a face (the sine of the angle between) stands against it; one turned off it doesn't. */
const SQUARE = 1e-6;

export type StuckBuiltIn = {
  /** The hosts' faces (getBuiltInHostFaces) and the walls they are on, by outline edge. */
  hosts: ReadonlyArray<BuiltInHostFace | null>; walls: readonly RegionWall[];
  families: readonly BuiltInFitObstacles[]; fits: (x: number, z: number) => boolean; outline: readonly Point[];
  width: number; depth: number; rotationY: number; standOff: number;
};

/**
 * The face (its start, direction and normal into the room) a built-in at (x, z) stands against, or null: of those it is square
 * to, its back no further in front than AGAINST_IN_FRONT past its stand-off nor behind than half its depth, the one it runs
 * along furthest (a jog's two faces are both near), then the nearest.
 */
type StandingBuiltIn = Pick<StuckBuiltIn, "hosts" | "walls" | "width" | "depth" | "rotationY" | "standOff">;

export function getFaceStoodAgainst(stuck: StandingBuiltIn, x: number, z: number): { start: Point; along: Point; normal: Point } | null {
  const { hosts, walls, width, depth, rotationY, standOff } = stuck, out = { x: Math.sin(rotationY), z: Math.cos(rotationY) };
  const back = { x: x - (out.x * depth) / 2, z: z - (out.z * depth) / 2 };
  let best: { start: Point; along: Point; normal: Point; off: number; over: number } | null = null;
  hosts.forEach((face, index) => {
    if (!face) return;
    const normal = face.merged ? { x: face.merged.nx, z: face.merged.nz } : { x: walls[index].nx, z: walls[index].nz };
    const length = Math.hypot(face.end.x - face.start.x, face.end.z - face.start.z);
    if (!(length > 0) || out.x * normal.x + out.z * normal.z < 0 || Math.abs(out.x * normal.z - out.z * normal.x) > SQUARE) return;
    const along = { x: (face.end.x - face.start.x) / length, z: (face.end.z - face.start.z) / length };
    const off = (back.x - face.start.x) * normal.x + (back.z - face.start.z) * normal.z - standOff;
    const at = (back.x - face.start.x) * along.x + (back.z - face.start.z) * along.z;
    const over = Math.min(at + width / 2, length) - Math.max(at - width / 2, 0);
    if (off < -depth / 2 || off > AGAINST_IN_FRONT || !(over > 0)) return;
    if (!best || over > best.over + 1e-9 || (over > best.over - 1e-9 && Math.abs(off) < Math.abs(best.off))) best = { start: face.start, along, normal, off, over };
  });
  return best;
}

type Face = NonNullable<ReturnType<typeof getFaceStoodAgainst>>;

/** The place with its back on `face` (or the stand-off off it), as far along it as (x, z). */
function onFace({ start, along, normal }: Face, stuck: StandingBuiltIn, x: number, z: number): Point {
  const out = stuck.depth / 2 + stuck.standOff, t = (x - start.x) * along.x + (z - start.z) * along.z;
  return { x: start.x + along.x * t + normal.x * out, z: start.z + along.z * t + normal.z * out };
}

/** Snap to wall's target from a place a built-in doesn't fit: back onto the face it stands against there, or null for none. */
export function getPlaceOnFaceStoodAgainst(stuck: StandingBuiltIn, x: number, z: number): [number, number] | null {
  const face = getFaceStoodAgainst(stuck, x, z), on = face && onFace(face, stuck, x, z);
  return on ? [on.x, on.z] : null;
}

/**
 * Where a built-in moved to (x, z) from a place it doesn't fit (`from`, where it stands) goes (above), or null where nothing
 * near fits: against the face it stands against there, as far along it as (x, z).
 */
export function findStuckBuiltInPlace(
  stuck: StuckBuiltIn, x: number, z: number, minimumReach: number, from: readonly [number, number] = [x, z]
): [number, number] | null {
  const { families, fits, outline, width, depth } = stuck, face = getFaceStoodAgainst(stuck, from[0], from[1]);
  if (!face) return findNearestBuiltInFit(families, { x, z }, Math.max(minimumReach, width, depth), fits, outline);
  // From the target's place along its face, sliding no further than its own length.
  return findNearestBuiltInFitAlong(families, onFace(face, stuck, x, z), face.along, width, fits, outline);
}
