/**
 * One click inside a room on the clean drawing finds that room (the review's "Click inside a room").
 *
 * The drawing is a mask of ink. A square of side 2r sweeps the paper of a room but cannot squeeze through a doorway
 * narrower than 2r, so the paper it sweeps falls apart into cores, about one per room. Every core then floods the paper
 * around it at once, each pixel going to the core that reaches it first: a doorway splits between its two rooms, and
 * the text and furniture inside a room go to that room. A room cut into several cores by its own text or furniture
 * comes back whole, because pieces of one room meet along a long edge while two rooms meet only across a doorway. The
 * clicked core's share, closed over small notches and with its holes filled, is the room. r is tried from wide to
 * narrow, so a narrow room (a bath, a store) still gets a core.
 */
import { squareToPage } from "@/lib/floor-plan-review-room-outline";

export type RoomFillMask = { ink: Uint8Array; widthPx: number; heightPx: number };
export type RoomFillFailure = "no_room_here" | "open_to_edge" | "too_small" | "too_large";
export type RoomFillRegion =
  | { ok: true; region: Uint8Array; areaM2: number; sweepMm: number }
  | { ok: false; failure: RoomFillFailure };

/** Half the side of the sweeping square, widest first: 450 mm stops a 900 mm doorway. */
export const ROOM_FILL_SWEEPS_MM = [450, 350, 250, 180, 120] as const;
/** Two pieces join when the edge they share is at least this share of the smaller piece's size (its area's root). */
const JOIN_RATIO = 0.7;
/** Notches narrower than this (door leaves, wardrobe fronts against a wall) are closed over. */
const CLOSE_MM = 300;
const MIN_AREA_M2 = 0.8;
const MAX_AREA_M2 = 80;

const FAR = 1 << 29;

function at(d: Int32Array, w: number, h: number, x: number, y: number, outside: number) {
  return x < 0 || y < 0 || x >= w || y >= h ? outside : d[y * w + x];
}

/**
 * Chessboard distance from each pixel to the nearest set pixel of `ink` (set pixels: 0). Outside the page counts as
 * ink where `edgeIsInk`, so the page edge stops a sweep; otherwise it is far away.
 */
export function distanceToInk(ink: Uint8Array, w: number, h: number, edgeIsInk: boolean): Int32Array {
  const d = new Int32Array(w * h);
  const out = edgeIsInk ? 0 : FAR;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const i = y * w + x;
      d[i] = ink[i] ? 0 : Math.min(FAR, 1 + Math.min(at(d, w, h, x - 1, y, out), at(d, w, h, x - 1, y - 1, out),
        at(d, w, h, x, y - 1, out), at(d, w, h, x + 1, y - 1, out)));
    }
  }
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = w - 1; x >= 0; x -= 1) {
      const i = y * w + x;
      if (d[i]) d[i] = Math.min(d[i], 1 + Math.min(at(d, w, h, x + 1, y, out), at(d, w, h, x + 1, y + 1, out),
        at(d, w, h, x, y + 1, out), at(d, w, h, x - 1, y + 1, out)));
    }
  }
  return d;
}

/** The 4 neighbours of pixel i inside the page, written to `out`; returns how many. */
function neighbours(i: number, w: number, h: number, out: Int32Array) {
  let n = 0;
  const x = i % w;
  if (x > 0) out[n++] = i - 1;
  if (x < w - 1) out[n++] = i + 1;
  if (i >= w) out[n++] = i - w;
  if (i < w * (h - 1)) out[n++] = i + w;
  return n;
}

type Window = { x0: number; y0: number; x1: number; y1: number; cx: number; cy: number };

/** The floor within e px of the click not walked yet, where a walk starts (the click itself may be on a letter's ink). */
function startRing(d: Int32Array, w: number, box: Window, e: number, seen: Set<number>) {
  const start: number[] = [];
  for (let y = Math.max(box.y0, box.cy - e); y <= Math.min(box.y1, box.cy + e); y += 1) {
    for (let x = Math.max(box.x0, box.cx - e); x <= Math.min(box.x1, box.cx + e); x += 1) {
      const i = y * w + x;
      if (d[i] > 0 && !seen.has(i) && (x - box.cx) ** 2 + (y - box.cy) ** 2 <= e * e) start.push(i);
    }
  }
  start.forEach((i) => seen.add(i));
  return start;
}

/**
 * A walk over the floor inside the window from start, layer by layer: the swept pixel (d > r) nearest the click on the
 * first layer that has one (-1 if none), and whether the floor walked has room anywhere for the narrowest square.
 */
function walkFloor(d: Int32Array, w: number, h: number, box: Window, start: number[], seen: Set<number>, r: number, rMin: number) {
  const around = new Int32Array(4);
  let layer = start, roomy = false;
  while (layer.length) {
    const hits = layer.filter((i) => d[i] > r);
    if (hits.length) return { hit: hits.reduce((best, i) => (dist2(i, w, box) < dist2(best, w, box) ? i : best)), roomy: true };
    roomy ||= layer.some((i) => d[i] > rMin);
    const next: number[] = [];
    for (const i of layer) {
      const n = neighbours(i, w, h, around);
      for (let k = 0; k < n; k += 1) {
        const j = around[k], x = j % w, y = Math.floor(j / w);
        if (d[j] > 0 && !seen.has(j) && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) { seen.add(j); next.push(j); }
      }
    }
    layer = next;
  }
  return { hit: -1, roomy };
}

/**
 * The swept pixel (d > r) the click reaches first over the floor, within 2r of it; -1 if none. The walk goes through
 * floor only, so the sweep of the room next door, past a wall a few pixels from the click, is never taken for this
 * room's (a click in a store by its wall, the bedroom beyond it nearer in a straight line). A walk shut in where not
 * even the narrowest square fits (the inside of a letter of the room's name, clicked) is no room: it starts again
 * from the floor a little farther out, 2, 4, 8 and then r px from the click.
 */
function seedOf(d: Int32Array, w: number, h: number, point: { x: number; y: number }, r: number, rMin: number) {
  const cx = Math.floor(point.x), cy = Math.floor(point.y);
  const box: Window = { x0: Math.max(0, cx - 2 * r), y0: Math.max(0, cy - 2 * r), x1: Math.min(w - 1, cx + 2 * r), y1: Math.min(h - 1, cy + 2 * r), cx, cy };
  const seen = new Set<number>();
  for (const e of [2, 4, 8, Math.max(8, r)]) {
    const start = startRing(d, w, box, e, seen);
    if (!start.length) continue;
    const { hit, roomy } = walkFloor(d, w, h, box, start, seen, r, rMin);
    if (hit >= 0 || roomy) return hit;                  // (roomy, no hit: a space of its own, for a narrower square)
  }
  return -1;
}

const dist2 = (i: number, w: number, box: Window) => ((i % w) - box.cx) ** 2 + (Math.floor(i / w) - box.cy) ** 2;

/** Cores: the 4-connected pieces of the paper the square sweeps (d > r), numbered from 1. */
function labelCores(d: Int32Array, w: number, h: number, r: number) {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const around = new Int32Array(4);
  let count = 0;
  for (let i = 0; i < w * h; i += 1) {
    if (d[i] <= r || labels[i]) continue;
    labels[i] = ++count;
    let top = 0;
    stack[top++] = i;
    while (top) {
      const j = stack[--top];
      const n = neighbours(j, w, h, around);
      for (let k = 0; k < n; k += 1) {
        const next = around[k];
        if (d[next] > r && !labels[next]) {
          labels[next] = count;
          stack[top++] = next;
        }
      }
    }
  }
  return { labels, count };
}

/** Every core floods the paper at once; each paper pixel takes the label of the core that reaches it first. */
function floodFromCores(cores: Int32Array, ink: Uint8Array, w: number, h: number) {
  const shares = cores.slice();
  const queue = new Int32Array(w * h);
  const around = new Int32Array(4);
  let head = 0, tail = 0;
  for (let i = 0; i < w * h; i += 1) if (shares[i]) queue[tail++] = i;
  while (head < tail) {
    const i = queue[head++];
    const n = neighbours(i, w, h, around);
    for (let k = 0; k < n; k += 1) {
      const j = around[k];
      if (!ink[j] && !shares[j]) {
        shares[j] = shares[i];
        queue[tail++] = j;
      }
    }
  }
  return shares;
}

function shareSizes(shares: Int32Array, count: number, w: number, h: number) {
  const area = new Float64Array(count + 1);
  const atEdge = new Uint8Array(count + 1);
  for (let i = 0; i < w * h; i += 1) area[shares[i]] += 1;
  for (let x = 0; x < w; x += 1) {
    atEdge[shares[x]] = 1;
    atEdge[shares[(h - 1) * w + x]] = 1;
  }
  for (let y = 0; y < h; y += 1) {
    atEdge[shares[y * w]] = 1;
    atEdge[shares[y * w + w - 1]] = 1;
  }
  return { area, atEdge };
}

/** How many neighbouring pixel pairs each two shares have, keyed low * (count + 1) + high. */
function sharedEdges(shares: Int32Array, count: number, w: number, h: number) {
  const edges = new Map<number, number>();
  const add = (a: number, b: number) => {
    if (!a || !b || a === b) return;
    const key = Math.min(a, b) * (count + 1) + Math.max(a, b);
    edges.set(key, (edges.get(key) ?? 0) + 1);
  };
  for (let i = 0; i < w * h; i += 1) {
    if (i % w < w - 1) add(shares[i], shares[i + 1]);
    if (i < w * (h - 1)) add(shares[i], shares[i + w]);
  }
  return edges;
}

/**
 * Joins shares that meet along more than a doorway: the edge they share is at least JOIN_RATIO of the smaller one's
 * size. A share reaching the page edge (the paper around the plan) never joins. Returns each label's room.
 */
function joinPieces(shares: Int32Array, count: number, w: number, h: number) {
  const { area, atEdge } = shareSizes(shares, count, w, h);
  const parent = Int32Array.from({ length: count + 1 }, (_, i) => i);
  const root = (a: number): number => {
    while (parent[a] !== a) a = parent[a] = parent[parent[a]];
    return a;
  };
  for (const [key, length] of sharedEdges(shares, count, w, h)) {
    const a = Math.floor(key / (count + 1)), b = key % (count + 1);
    if (atEdge[a] || atEdge[b]) continue;
    if (length >= JOIN_RATIO * Math.sqrt(Math.min(area[a], area[b]))) parent[root(a)] = root(b);
  }
  return Int32Array.from({ length: count + 1 }, (_, i) => root(i));
}

function touchesEdge(region: Uint8Array, w: number, h: number) {
  for (let x = 0; x < w; x += 1) if (region[x] || region[(h - 1) * w + x]) return true;
  for (let y = 0; y < h; y += 1) if (region[y * w] || region[y * w + w - 1]) return true;
  return false;
}

/** Closing with a square of side 2c+1: grown by c, then shrunk by c (the page edge does not shrink it). */
export function closeRegion(region: Uint8Array, w: number, h: number, c: number) {
  const grown = distanceToInk(region, w, h, false);
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) outside[i] = grown[i] > c ? 1 : 0;
  const shrink = distanceToInk(outside, w, h, false);
  const closed = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) closed[i] = shrink[i] > c ? 1 : 0;
  return closed;
}

/** The region with every hole (paper or ink it encloses) filled: what the page edge cannot reach around it. */
export function fillHoles(region: Uint8Array, w: number, h: number) {
  const reached = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const around = new Int32Array(4);
  let head = 0, tail = 0;
  const seed = (i: number) => {
    if (!region[i] && !reached[i]) {
      reached[i] = 1;
      queue[tail++] = i;
    }
  };
  for (let x = 0; x < w; x += 1) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y += 1) { seed(y * w); seed(y * w + w - 1); }
  while (head < tail) {
    const n = neighbours(queue[head++], w, h, around);
    for (let k = 0; k < n; k += 1) seed(around[k]);
  }
  const filled = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) filled[i] = reached[i] ? 0 : 1;
  return filled;
}

/**
 * Opening with a square of side 2r+1 (shrunk by r, grown back): what the sweeping square covers. It cuts off what pokes
 * out of a room narrower than the square, such as a door's swing beyond its doorway, and keeps the piece holding
 * `seed`.
 */
export function openRegion(region: Uint8Array, w: number, h: number, r: number, seed: number) {
  const outside = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) outside[i] = region[i] ? 0 : 1;
  const depth = distanceToInk(outside, w, h, true);
  const kernel = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) kernel[i] = depth[i] > r ? 1 : 0;
  const reach = distanceToInk(kernel, w, h, false);
  const opened = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) opened[i] = reach[i] <= r ? 1 : 0;
  if (!opened[seed]) return opened;
  const piece = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const around = new Int32Array(4);
  let head = 0, tail = 0;
  piece[seed] = 1;
  queue[tail++] = seed;
  while (head < tail) {
    const n = neighbours(queue[head++], w, h, around);
    for (let k = 0; k < n; k += 1) {
      if (opened[around[k]] && !piece[around[k]]) { piece[around[k]] = 1; queue[tail++] = around[k]; }
    }
  }
  return piece;
}

function roomAround(mask: RoomFillMask, d: Int32Array, r: number, seed: number, mmPerPx: number): RoomFillRegion {
  const { ink, widthPx: w, heightPx: h } = mask;
  const { labels, count } = labelCores(d, w, h, r);
  const shares = floodFromCores(labels, ink, w, h);
  const rooms = joinPieces(shares, count, w, h);
  const mine = rooms[labels[seed]];
  const region = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i += 1) region[i] = shares[i] && rooms[shares[i]] === mine ? 1 : 0;
  if (touchesEdge(region, w, h)) return { ok: false, failure: "open_to_edge" };
  const closed = fillHoles(closeRegion(region, w, h, Math.max(1, Math.round(CLOSE_MM / mmPerPx))), w, h);
  // A room drawn at an angle keeps its corners: a level square cannot reach into them.
  const filled = squareToPage(closed, w, h, Math.max(1, 60 / mmPerPx)) ? openRegion(closed, w, h, r, seed) : closed;
  let pixels = 0;
  for (let i = 0; i < w * h; i += 1) pixels += filled[i];
  const areaM2 = (pixels * mmPerPx * mmPerPx) / 1e6;
  if (areaM2 < MIN_AREA_M2) return { ok: false, failure: "too_small" };
  if (areaM2 > MAX_AREA_M2) return { ok: false, failure: "too_large" };
  return { ok: true, region: filled, areaM2, sweepMm: Math.round(r * mmPerPx) };
}

/** The room around a click on the drawing's mask, at mmPerPx millimetres per mask pixel. */
export function findRoomRegion(mask: RoomFillMask, point: { x: number; y: number }, mmPerPx: number): RoomFillRegion {
  const { widthPx: w, heightPx: h } = mask;
  if (!(mmPerPx > 0) || mask.ink.length !== w * h) return { ok: false, failure: "no_room_here" };
  const d = distanceToInk(mask.ink, w, h, true);
  const rMin = Math.max(1, Math.round(ROOM_FILL_SWEEPS_MM[ROOM_FILL_SWEEPS_MM.length - 1] / mmPerPx));
  for (const sweepMm of ROOM_FILL_SWEEPS_MM) {
    const r = Math.max(1, Math.round(sweepMm / mmPerPx));
    const seed = seedOf(d, w, h, point, r, rMin);
    if (seed >= 0) return roomAround(mask, d, r, seed, mmPerPx);
  }
  return { ok: false, failure: "no_room_here" };
}
