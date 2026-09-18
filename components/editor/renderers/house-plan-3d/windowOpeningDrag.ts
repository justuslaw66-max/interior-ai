import { MIN_OPENING_CORNER_CLEARANCE_METERS } from "@/lib/floor-plan-tracing";

export type WindowDragBounds = {
  offset: number;
  sourceOffset: number;
  sourceDirection: number;
  bottom: number;
  width: number;
  height: number;
  wallLength: number;
  wallHeight: number;
};

/** Keep the complete opening on the wall, without changing its size or grab point. */
export function getWindowDragPosition(
  start: WindowDragBounds, horizontalDelta: number, verticalDelta: number
) {
  const limit = Math.max(0, Math.floor(((start.wallLength - start.width) / 2 - MIN_OPENING_CORNER_CLEARANCE_METERS + 1e-9) * 1000) / 1000);
  const offset = Math.max(-limit, Math.min(limit, start.offset + horizontalDelta));
  const bottom = Math.max(0, Math.min(start.wallHeight - start.height, start.bottom + verticalDelta));
  return {
    offsetMeters: Math.round((start.sourceOffset + (offset - start.offset) * start.sourceDirection) * 1000) / 1000,
    bottomMeters: Math.round(bottom * 1000) / 1000,
  };
}
