"use client";

import { useEffect } from "react";
import { setPhoneSheetInspectorActive, usePhoneSheetInspector } from "@/lib/phone-step-sheet";
import { CANVAS_TOOLBAR_MEDIA_QUERY, useMediaQuery } from "@/lib/useMediaQuery";

/**
 * Where the item panel goes. From md it floats at the canvas's right. On phones it moves into the
 * step sheet (14 Nov 2026), as Canva's and Planner 5D's phone apps keep the selection and its
 * handles in view and put the item's settings in a bottom sheet: the sheet opens to half height,
 * the plan is framed above it, and the sheet's handle pulls it up for the rest. The floating panel
 * used to cover the plan on a phone, so a block's resize and rotate handles couldn't be reached.
 */
export function useSelectedItemPanelPlacement(isClientPreview: boolean): { inSheet: boolean; slot: HTMLDivElement | null } {
  const wide = useMediaQuery(CANVAS_TOOLBAR_MEDIA_QUERY);
  const sheet = usePhoneSheetInspector();
  const inSheet = !wide && !isClientPreview && Boolean(sheet.slot);
  useEffect(() => {
    if (!inSheet) return;
    setPhoneSheetInspectorActive(true);
    return () => setPhoneSheetInspectorActive(false);
  }, [inSheet]);
  return { inSheet, slot: inSheet ? sheet.slot : null };
}

/** The panel's frame: a card filling the sheet on phones, else the floating panel at the right. */
export function selectedItemPanelFrameClass(inSheet: boolean, isClientPreview: boolean): string {
  if (inSheet) return "relative w-full";
  return `absolute right-4 top-bar-17 z-40 md:top-bar-6 w-[320px] max-h-[calc(100vh-12.75rem-env(safe-area-inset-bottom))] overflow-y-auto pr-1 transition-opacity duration-300 md:max-h-[calc(100vh-var(--editor-bar-h)-2.5rem)] md:w-[21.25rem] ${
    isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
  }`;
}
