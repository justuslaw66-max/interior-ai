"use client";

import { useState } from "react";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";

/**
 * The 2D plan's right inset. Two kinds of panel take space there:
 * - docked panels (a tablet's item, cabinet or inspector panel), which the plan always fits beside;
 * - the floating overlay stack (the plan quality review, the floor panel), which opens and closes
 *   as a side effect of editing: repairing the last window closes the review.
 *
 * The plan makes room for the floating stack whenever it is fitted, but the stack opening or
 * closing never moves the plan by itself, so the plan stays where the person is working. (Closing
 * the review used to refit the plan: a wall repair shifted it 1.4 m and zoomed it.)
 */
export function resolvePlan2DRightInsetsPx(input: {
  applies: boolean;
  planQualityReviewVisible: boolean;
  floorPropertiesPanelVisible: boolean;
  tabletRightInsetPx: number;
}) {
  if (!input.applies) return { floatingRightPx: 0, dockedRightPx: 0, rightPx: 0 };
  const floatingRightPx = Math.max(
    input.planQualityReviewVisible ? 344 : 0,
    input.floorPropertiesPanelVisible ? 284 : 0
  );
  const dockedRightPx = input.tabletRightInsetPx;
  return { floatingRightPx, dockedRightPx, rightPx: Math.max(floatingRightPx, dockedRightPx) };
}

/**
 * Everything that fits the 2D plan by itself: opening 2D, the canvas width, the plan's extent and
 * the docked panels. When one of these changes, the next fit takes the floating stack as it is.
 */
export function plan2DFitKey(
  viewMode: EditorViewMode,
  viewportWidth: number,
  bounds: { centerX: number; centerZ: number; widthMeters: number; depthMeters: number },
  layout: {
    plan2DSafeAreaLeftPx: number;
    plan2DRightInsets: { dockedRightPx: number };
    plan2DSafeAreaTopPx: number;
    plan2DSafeAreaBottomPx: number;
  }
) {
  return [
    viewMode, viewportWidth, bounds.centerX, bounds.centerZ, bounds.widthMeters, bounds.depthMeters,
    layout.plan2DSafeAreaLeftPx, layout.plan2DRightInsets.dockedRightPx,
    layout.plan2DSafeAreaTopPx, layout.plan2DSafeAreaBottomPx,
  ].join("|");
}

export type Plan2DFloatingInsetLatch = { fitKey: string; floatingRightPx: number };

/** The floating stack's inset as of the last fit, until something that fits the plan changes. */
export function nextPlan2DFloatingInsetLatch(
  previous: Plan2DFloatingInsetLatch,
  current: Plan2DFloatingInsetLatch
): Plan2DFloatingInsetLatch {
  return previous.fitKey === current.fitKey ? previous : current;
}

/**
 * The right inset the automatic 2D fits use: docked panels as they are now, the floating stack as
 * it was at the last fit. Explicit fits (Fit, a room's fit) use the live inset instead.
 */
export function usePlan2DFittedRightInsetPx(
  fitKey: string,
  insets: { floatingRightPx: number; dockedRightPx: number }
) {
  const current = { fitKey, floatingRightPx: insets.floatingRightPx };
  const [latch, setLatch] = useState<Plan2DFloatingInsetLatch>(current);
  const next = nextPlan2DFloatingInsetLatch(latch, current);
  if (next !== latch) setLatch(next);
  return Math.max(insets.dockedRightPx, next.floatingRightPx);
}
