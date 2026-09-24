import type { FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";

export type CanonicalOpeningDragMode = "move" | "resize";
export type CanonicalOpeningDragMetricsV2 = {
  centerMm: FloorPlanPointMmV2;
  offsetMm: number;
  widthMm: number;
  expectedRevisionId: string;
};
export type OpeningGestureAnchor =
  | { mode: "move"; grabDeltaMm: number }
  | { mode: "resize"; fixedOffsetMm: number; edge: "start" | "end" };

/** Resolve a draft along the real host, preserving integer offsets and odd-width centres. */
export function buildOpeningGestureDraft(input: {
  anchor: OpeningGestureAnchor; pointerOffsetMm: number; widthMm: number;
  wallStart: FloorPlanPointMmV2; wallEnd: FloorPlanPointMmV2; revisionId: string;
}): CanonicalOpeningDragMetricsV2 | null {
  const { anchor, pointerOffsetMm, wallStart, wallEnd, revisionId } = input;
  const dx = wallEnd.xMm - wallStart.xMm, dz = wallEnd.zMm - wallStart.zMm;
  const lengthMm = Math.hypot(dx, dz), maximumMm = Math.floor(lengthMm);
  if (!Number.isFinite(pointerOffsetMm) || maximumMm < 1) return null;
  let offsetMm: number, widthMm: number;
  if (anchor.mode === "move") {
    widthMm = input.widthMm;
    if (widthMm > maximumMm || widthMm < 1) return null;
    offsetMm = Math.max(0, Math.min(maximumMm - widthMm, Math.round(pointerOffsetMm + anchor.grabDeltaMm - widthMm / 2)));
  } else {
    const fixed = anchor.fixedOffsetMm;
    const minimumMm = Math.min(400, anchor.edge === "start" ? fixed : maximumMm - fixed);
    if (minimumMm < 1) return null;
    const moving = anchor.edge === "start"
      ? Math.max(0, Math.min(fixed - minimumMm, Math.round(pointerOffsetMm)))
      : Math.max(fixed + minimumMm, Math.min(maximumMm, Math.round(pointerOffsetMm)));
    offsetMm = Math.min(fixed, moving); widthMm = Math.abs(moving - fixed);
  }
  const centerOffset = offsetMm + widthMm / 2;
  return { offsetMm, widthMm, expectedRevisionId: revisionId,
    centerMm: { xMm: wallStart.xMm + dx * centerOffset / lengthMm, zMm: wallStart.zMm + dz * centerOffset / lengthMm } };
}
