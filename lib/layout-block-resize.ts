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

const clampSize = (size: number) => Math.min(MAX_M, Math.max(MIN_M, size));
const snapTo = (size: number, step: number) => Math.round(size / step) * step;

/** How far the pointer is from the anchor side, along one axis: the size it asks for, unsnapped. */
function rawSizeAlong(side: number, start: number, pointer: number): number {
  return side * (pointer + side * (start / 2));
}

function sizeAlong(side: number, start: number, pointer: number, step: number): number {
  return clampSize(snapTo(rawSizeAlong(side, start, pointer), step));
}

/**
 * A corner dragged with Shift keeps the block's proportions, as in Illustrator (J, 14 Nov 2026):
 * the axis the pointer has pulled further leads, snapped to the step, and the other follows it.
 * The scale stays where both sides fit the size limits.
 */
function proportionalSize(handle: LayoutBlockResizeHandle, startWidth: number, startDepth: number, pointerX: number, pointerZ: number, step: number) {
  const scaleX = rawSizeAlong(handle.sx, startWidth, pointerX) / startWidth;
  const scaleZ = rawSizeAlong(handle.sz, startDepth, pointerZ) / startDepth;
  const widthLeads = scaleX >= scaleZ;
  const lead = widthLeads ? startWidth : startDepth;
  const smallest = Math.max(MIN_M / startWidth, MIN_M / startDepth);
  const largest = Math.min(MAX_M / startWidth, MAX_M / startDepth);
  const scale = Math.min(largest, Math.max(smallest, snapTo(lead * Math.max(scaleX, scaleZ), step) / lead));
  return { width: startWidth * scale, depth: startDepth * scale };
}

/**
 * The footprint while a handle is dragged to a pointer at (pointerX, pointerZ) in the block's frame.
 * The side opposite the handle is the anchor; a pointer dragged past it stops at the smallest size.
 * With `keepProportion` (Shift), a corner scales width and depth together.
 */
export function resizeLayoutBlockFootprint({
  handle,
  startWidth,
  startDepth,
  pointerX,
  pointerZ,
  snap = true,
  keepProportion = false,
}: {
  handle: LayoutBlockResizeHandle;
  startWidth: number;
  startDepth: number;
  pointerX: number;
  pointerZ: number;
  snap?: boolean;
  keepProportion?: boolean;
}): LayoutBlockFootprint {
  const step = snap ? LAYOUT_BLOCK_RESIZE_STEP_M : FREE_STEP_M;
  const { width, depth } =
    keepProportion && isCornerResizeHandle(handle)
      ? proportionalSize(handle, startWidth, startDepth, pointerX, pointerZ, step)
      : {
          width: handle.sx === 0 ? startWidth : sizeAlong(handle.sx, startWidth, pointerX, step),
          depth: handle.sz === 0 ? startDepth : sizeAlong(handle.sz, startDepth, pointerZ, step),
        };
  // The centre sits halfway between the anchor and the dragged side.
  const offsetX = handle.sx === 0 ? 0 : -handle.sx * (startWidth / 2) + handle.sx * (width / 2);
  const offsetZ = handle.sz === 0 ? 0 : -handle.sz * (startDepth / 2) + handle.sz * (depth / 2);
  return { width, depth, offsetX, offsetZ };
}

/**
 * How far from its own side the pointer took hold of a handle, in the block's frame. Taking that off
 * every later pointer keeps the side the same distance from the pointer, so it follows the drag
 * instead of jumping to the pointer; a 44px touch handle is often grabbed 20px off (Figma and Canva
 * work the same way; J's browser check, 14 Nov 2026).
 */
export function layoutBlockResizeGrab(
  handle: LayoutBlockResizeHandle,
  startWidth: number,
  startDepth: number,
  pointerX: number,
  pointerZ: number
): { x: number; z: number } {
  return {
    x: handle.sx === 0 ? 0 : pointerX - handle.sx * (startWidth / 2),
    z: handle.sz === 0 ? 0 : pointerZ - handle.sz * (startDepth / 2),
  };
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
