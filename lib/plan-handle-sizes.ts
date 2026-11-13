"use client";

import { useMediaQuery } from "@/lib/useMediaQuery";

/**
 * How big the plan's selection handles are on screen, in CSS pixels, so they can be grabbed at any
 * zoom (market practice, 14 Nov 2026). With a mouse or trackpad a grab area is at least 24px, the
 * WCAG 2.2 minimum target; on a touch screen it is 44px, Apple's minimum (Material asks 48dp). The
 * marks drawn inside stay small so they don't hide the item.
 */
export type PlanHandleSizes = {
  cornerHit: number;
  cornerMark: number;
  edgeHit: number;
  edgeMark: readonly [number, number];
  /** The rotate knob's grab circle and its drawn dot, as diameters. */
  knobHit: number;
  knobMark: number;
  /** From the item's edge to the knob's centre, so the knob clears the edge's own grab area. */
  knobOffset: number;
};

export const PLAN_HANDLE_SIZES_POINTER: PlanHandleSizes = {
  cornerHit: 24,
  cornerMark: 8,
  edgeHit: 16,
  edgeMark: [14, 5],
  knobHit: 24,
  knobMark: 10,
  knobOffset: 28,
};

export const PLAN_HANDLE_SIZES_TOUCH: PlanHandleSizes = {
  cornerHit: 44,
  cornerMark: 12,
  edgeHit: 28,
  edgeMark: [20, 6],
  knobHit: 44,
  knobMark: 16,
  knobOffset: 44,
};

/** A touch screen's primary pointer is coarse; a phone or tablet without a trackpad. */
export const COARSE_POINTER_MEDIA_QUERY = "(pointer: coarse)";

/** The handle sizes for the device's main pointer, updating if it changes (a tablet's trackpad). */
export function usePlanHandleSizes(): PlanHandleSizes {
  return useMediaQuery(COARSE_POINTER_MEDIA_QUERY) ? PLAN_HANDLE_SIZES_TOUCH : PLAN_HANDLE_SIZES_POINTER;
}

/** A size in metres that is `px` CSS pixels on screen at this zoom, never below `minimumM`. */
export function planMetresForPixels(px: number, zoom: number, minimumM = 0): number {
  return Math.max(minimumM, px / Math.max(zoom, 1e-6));
}
