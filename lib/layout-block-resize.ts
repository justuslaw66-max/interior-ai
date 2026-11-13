import { LAYOUT_BLOCK_LIMITS_MM } from "@/lib/layout-blocks";

/**
 * Resizing a layout block by dragging its outline on the plan (J, 13 Nov 2026). A handle is a
 * corner or an edge of the footprint; the opposite corner or edge stays where it is, so the block
 * grows or shrinks towards the pointer. Everything here is in the block's own frame, in metres:
 * x along its width, z along its depth, origin at its centre.
 */

/** Which side of the footprint a handle moves: -1 or 1 along an axis, 0 when it leaves that axis alone. */
export type LayoutBlockResizeHandle = { sx: -1 | 0 | 1; sz: -1 | 0 | 1 };

export const LAYOUT_BLOCK_RESIZE_HANDLES: readonly LayoutBlockResizeHandle[] = [
  { sx: -1, sz: -1 }, { sx: 1, sz: -1 }, { sx: 1, sz: 1 }, { sx: -1, sz: 1 },
  { sx: 0, sz: -1 }, { sx: 1, sz: 0 }, { sx: 0, sz: 1 }, { sx: -1, sz: 0 },
];

export const isCornerResizeHandle = (handle: LayoutBlockResizeHandle) => handle.sx !== 0 && handle.sz !== 0;

/** A new footprint: its size and how far its centre moved, in the block's frame. */
export type LayoutBlockFootprint = { width: number; depth: number; offsetX: number; offsetZ: number };

/** The step a dragged size snaps to, in metres: 1 cm, or 1 mm when snapping is off. */
export const LAYOUT_BLOCK_RESIZE_STEP_M = 0.01;
const FREE_STEP_M = 0.001;

const MIN_M = LAYOUT_BLOCK_LIMITS_MM.minPlan / 1000;
const MAX_M = LAYOUT_BLOCK_LIMITS_MM.maxPlan / 1000;

function sizeAlong(side: number, start: number, pointer: number, step: number): number {
  const anchor = -side * (start / 2);
  const raw = side * (pointer - anchor);
  const snapped = Math.round(raw / step) * step;
  return Math.min(MAX_M, Math.max(MIN_M, snapped));
}

/**
 * The footprint while a handle is dragged to a pointer at (pointerX, pointerZ) in the block's frame.
 * The side opposite the handle is the anchor; a pointer dragged past it stops at the smallest size.
 */
export function resizeLayoutBlockFootprint({
  handle,
  startWidth,
  startDepth,
  pointerX,
  pointerZ,
  snap = true,
}: {
  handle: LayoutBlockResizeHandle;
  startWidth: number;
  startDepth: number;
  pointerX: number;
  pointerZ: number;
  snap?: boolean;
}): LayoutBlockFootprint {
  const step = snap ? LAYOUT_BLOCK_RESIZE_STEP_M : FREE_STEP_M;
  const width = handle.sx === 0 ? startWidth : sizeAlong(handle.sx, startWidth, pointerX, step);
  const depth = handle.sz === 0 ? startDepth : sizeAlong(handle.sz, startDepth, pointerZ, step);
  // The centre sits halfway between the anchor and the dragged side.
  const offsetX = handle.sx === 0 ? 0 : -handle.sx * (startWidth / 2) + handle.sx * (width / 2);
  const offsetZ = handle.sz === 0 ? 0 : -handle.sz * (startDepth / 2) + handle.sz * (depth / 2);
  return { width, depth, offsetX, offsetZ };
}

/**
 * Where the block goes and how big it is once a resize is let go: the centre offset turned into the
 * room's frame by the block's rotation (three.js turns about y: x' = x cos + z sin, z' = z cos - x sin).
 */
export function layoutBlockResizeTarget(
  item: { position: [number, number, number]; rotationY?: number },
  footprint: LayoutBlockFootprint
): { position: [number, number, number]; sizeMm: { w: number; d: number } } {
  const angle = item.rotationY ?? 0;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const [x, y, z] = item.position;
  return {
    position: [
      x + footprint.offsetX * cos + footprint.offsetZ * sin,
      y,
      z - footprint.offsetX * sin + footprint.offsetZ * cos,
    ],
    sizeMm: { w: Math.round(footprint.width * 1000), d: Math.round(footprint.depth * 1000) },
  };
}
