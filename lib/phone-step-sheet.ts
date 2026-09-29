"use client";

import { useSyncExternalStore } from "react";
import { EDITOR_BAR_HEIGHT_PX } from "@/lib/design-page-editor-configuration";

/**
 * The phone's step sheet (UX 4d, audit AX3, the PhonePlan and PhoneFurnish mockups): the step
 * panel below md, over the canvas and above the step bar. Peek shows only its title, half is the
 * mockups' height, and full reaches up to the canvas pills.
 */
export type PhoneSheetSnap = "peek" | "half" | "full";

/** The handle (a 44px target) and the title with the line under it. */
export const PHONE_SHEET_PEEK_PX = 92;
/** The step bar along the bottom of a phone (CommandBarStepTabs), without the safe area. */
export const PHONE_STEP_BAR_PX = 64;
/** The header and the canvas pills under it (12px gap, 52px pills), then 8px of room. */
export const PHONE_CANVAS_TOP_INSET_PX = EDITOR_BAR_HEIGHT_PX + 72;

export function phoneSheetHeightPx(snap: PhoneSheetSnap, viewportHeightPx: number): number {
  const full = Math.max(PHONE_SHEET_PEEK_PX, viewportHeightPx - PHONE_CANVAS_TOP_INSET_PX - PHONE_STEP_BAR_PX);
  if (snap === "peek") return PHONE_SHEET_PEEK_PX;
  if (snap === "full") return full;
  return Math.max(PHONE_SHEET_PEEK_PX, Math.min(full, Math.round(Math.min(viewportHeightPx * 0.46, 420))));
}

/** Where a dragged sheet settles when it's let go: the height nearest to where it was. */
export function nearestPhoneSheetSnap(heightPx: number, viewportHeightPx: number): PhoneSheetSnap {
  const snaps: PhoneSheetSnap[] = ["peek", "half", "full"];
  return snaps.reduce((best, snap) =>
    Math.abs(phoneSheetHeightPx(snap, viewportHeightPx) - heightPx) <
    Math.abs(phoneSheetHeightPx(best, viewportHeightPx) - heightPx)
      ? snap
      : best
  );
}

/** The handle's press: peek opens to half, half grows to full, and full comes back to half. */
export function nextPhoneSheetSnap(snap: PhoneSheetSnap): PhoneSheetSnap {
  return snap === "half" ? "full" : "half";
}

// The open sheet's height and snap, so the plan can be framed above it and the Plan tip placed on
// top of it (height 0 when there's no sheet: md and up, Shop, Client Preview).
export type PhoneSheetState = { heightPx: number; snap: PhoneSheetSnap | null };
const CLOSED: PhoneSheetState = { heightPx: 0, snap: null };
let sheetState: PhoneSheetState = CLOSED;
const listeners = new Set<() => void>();

export function setPhoneSheetState(next: PhoneSheetState | null) {
  const value = next ?? CLOSED;
  if (value.heightPx === sheetState.heightPx && value.snap === sheetState.snap) return;
  sheetState = value;
  listeners.forEach((listener) => listener());
}

export function getPhoneSheetState(): PhoneSheetState {
  return sheetState;
}

export function usePhoneSheetState(): PhoneSheetState {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    getPhoneSheetState,
    () => CLOSED
  );
}

/**
 * How much of the canvas a phone's chrome covers, for framing the plan (UX 4d): the header and
 * the canvas pills at the top; at the bottom the step bar, with the sheet over it while one is
 * open. Nothing from md, or in Client Preview, which shows neither.
 */
export function resolvePhoneCanvasInsets({
  viewportWidth,
  isClientPreview,
  sheetOpen,
  sheetHeightPx,
}: {
  viewportWidth: number;
  isClientPreview: boolean;
  sheetOpen: boolean;
  sheetHeightPx: number;
}): { topPx: number; bottomPx: number } {
  if (isClientPreview || viewportWidth <= 0 || viewportWidth >= 768) return { topPx: 0, bottomPx: 0 };
  return { topPx: PHONE_CANVAS_TOP_INSET_PX, bottomPx: PHONE_STEP_BAR_PX + (sheetOpen ? sheetHeightPx : 0) };
}
