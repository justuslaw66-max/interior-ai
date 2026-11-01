import { getBuiltInFaceOnLine, type BuiltInFaceHost, type BuiltInRegion, type RegionWall } from "@/lib/room-built-in-region";

type Point = { x: number; z: number };

/**
 * Pieces of a room's outline this near collinear (degrees between them) are one host for Fit to Space (J's delegate, 1 Nov
 * 2026: "Treat collinear pieces as one host"). A turned plan's whole-millimetre vertices bend a straight wall by thousandths of
 * a degree (a T-junction's through wall); a bend a plan means is far more (a tenth of a degree takes a 3 m wall 5 mm off line).
 */
export const COLLINEAR_HOST_DEGREES = 0.05;
/**
 * And whose faces meet: each face runs on to the next one's start (along, metres), and ends within this (across, metres) of the
 * next one's line, and as much more as their lines part over the stretch where they overlap (at a bend into the room, each face
 * runs on past the bend to where its wall's core ends).
 */
const MEET_ACROSS = 0.00005, MEET_ALONG = 0.0005;
const COLLINEAR_COS = Math.cos((COLLINEAR_HOST_DEGREES * Math.PI) / 180);

/** A host's face: its wall's exposed face, or one face over several pieces (`merged`: the outline edges it runs over, its normal). */
export type BuiltInHostFace = BuiltInFaceHost & { merged?: { pieces: number[]; nx: number; nz: number } };

const keyOf = (face: BuiltInFaceHost) => [face.start.x, face.start.z, face.end.x, face.end.z].map((value) => value.toFixed(6)).join();
const across = (point: Point, wall: RegionWall, face: BuiltInFaceHost) =>
  Math.abs((point.x - face.start.x) * wall.nx + (point.z - face.start.z) * wall.nz);

/** True when edge `index`'s exposed face and the next edge's are one: their pieces collinear and their faces meeting. */
function joinsNext(region: BuiltInRegion, index: number): boolean {
  const next = (index + 1) % region.walls.length, [face, nextFace] = [region.exposed[index], region.exposed[next]];
  const [wall, nextWall] = [region.walls[index], region.walls[next]];
  if (!face || !nextFace || wall.dx * nextWall.dx + wall.dz * nextWall.dz < COLLINEAR_COS) return false;
  const gap = (nextFace.start.x - face.end.x) * wall.dx + (nextFace.start.z - face.end.z) * wall.dz;
  const within = MEET_ACROSS + Math.max(0, -gap) * Math.abs(wall.dx * nextWall.dz - wall.dz * nextWall.dx);
  return across(nextFace.start, wall, face) <= within && across(face.end, nextWall, nextFace) <= within && gap <= MEET_ALONG;
}

/**
 * Each edge's host face: its exposed face, or where its piece and the next ones are collinear (COLLINEAR_HOST_DEGREES) and their
 * faces meet, one face over them all, the same for each piece: straight from the first face's start to the last one's end,
 * moved into the room as far as any of their ends stands (so no wall stands in front of it), with the faces' clear stretches
 * and obstacles on that line. A straight wall drawn in pieces (already one face) and every other face are as exposed.
 */
export function getBuiltInHostFaces(region: BuiltInRegion): Array<BuiltInHostFace | null> {
  const known = hostFacesByRegion.get(region);
  if (known) return known;
  const hosts = buildHostFaces(region);
  hostFacesByRegion.set(region, hosts);
  return hosts;
}
// Per region (kept per room as long as its geometry is): Fit's hosts, and a stuck built-in's moves on every frame of a drag.
const hostFacesByRegion = new WeakMap<BuiltInRegion, Array<BuiltInHostFace | null>>();

function buildHostFaces(region: BuiltInRegion): Array<BuiltInHostFace | null> {
  const count = region.walls.length, joined = region.walls.map((_, index) => count > 1 && joinsNext(region, index));
  if (!joined.some(Boolean) || joined.every(Boolean)) return region.exposed;
  const hosts: Array<BuiltInHostFace | null> = [...region.exposed];
  const first = joined.findIndex((_, index) => !joined[(index - 1 + count) % count]);
  for (let done = 0; done < count;) {
    const chain = [(first + done) % count];
    while (joined[chain[chain.length - 1]]) chain.push((chain[chain.length - 1] + 1) % count);
    done += chain.length;
    const merged = chain.length > 1 ? mergeFaces(region, chain) : null;
    if (merged) chain.forEach((index) => { hosts[index] = merged; });
  }
  return hosts;
}

function mergeFaces(region: BuiltInRegion, chain: number[]): BuiltInHostFace | null {
  const faces = chain.map((index) => region.exposed[index] as BuiltInFaceHost);
  if (new Set(faces.map(keyOf)).size < 2) return null;
  const from = faces[0].start, to = faces[faces.length - 1].end, length = Math.hypot(to.x - from.x, to.z - from.z), own = region.walls[chain[0]];
  if (!(length > 0)) return null;
  const [dx, dz] = [(to.x - from.x) / length, (to.z - from.z) / length], side = -dz * own.nx + dx * own.nz >= 0 ? 1 : -1;
  const [nx, nz] = [-dz * side, dx * side], ends = faces.flatMap((face) => [face.start, face.end]);
  const out = Math.max(...ends.map((point) => (point.x - from.x) * nx + (point.z - from.z) * nz));
  const along = ends.map((point) => (point.x - from.x) * dx + (point.z - from.z) * dz);
  const line: RegionWall = { ...own, start: { x: from.x + nx * out, z: from.z + nz * out }, dx, dz, nx, nz, length };
  const host = getBuiltInFaceOnLine(region, line, Math.min(...along), Math.max(...along), faces[0].inset);
  return host && Object.assign(host, { merged: { pieces: chain, nx, nz } });
}
