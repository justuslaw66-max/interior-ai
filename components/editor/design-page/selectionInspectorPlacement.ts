"use client";

import { useEffect, type CSSProperties } from "react";
import {
  isPhoneSheetInspectorSelection,
  setPhoneSheetInspectorActive,
  usePhoneSheetInspector,
} from "@/lib/phone-step-sheet";
import { CANVAS_TOOLBAR_MEDIA_QUERY, useMediaQuery } from "@/lib/useMediaQuery";
import type { DesignPageSelectionInspectorProps } from "./DesignPageSelectionInspector";

type InspectorState = Parameters<typeof isPhoneSheetInspectorSelection>[0];
type InspectorConfiguration = Pick<
  DesignPageSelectionInspectorProps["configuration"],
  "dark" | "dockWhenPortalAvailable" | "portalTarget" | "dockedWidthPx" | "floatingRightPx" | "floatingTopPx" | "floatingWidthPx"
>;

/**
 * Where the inspector goes: from md, floating or docked in the Plan rail; on phones (UX 4d, audit
 * AX2), the step sheet for a wall, ceiling, door, window, fixed element or note, with Done to
 * deselect, and nowhere otherwise (rooms keep the Plan panel's room section).
 */
export function useInspectorPlacement(state: InspectorState, configuration: InspectorConfiguration) {
  const wide = useMediaQuery(CANVAS_TOOLBAR_MEDIA_QUERY);
  const sheet = usePhoneSheetInspector();
  const inSheet = !wide && Boolean(sheet.slot) && isPhoneSheetInspectorSelection(state);
  useEffect(() => {
    if (!inSheet) return;
    setPhoneSheetInspectorActive(true);
    return () => setPhoneSheetInspectorActive(false);
  }, [inSheet]);
  if (inSheet) return { shown: true, inSheet, portalTarget: sheet.slot };
  const docked = Boolean(configuration.dockWhenPortalAvailable && configuration.portalTarget);
  return { shown: wide, inSheet, portalTarget: docked ? configuration.portalTarget : null };
}

/** The inspector's frame and its Clear button, which in the sheet is Done, a 44px target. */
export function inspectorFrame(configuration: InspectorConfiguration, placement: { inSheet: boolean; portalTarget: HTMLDivElement | null }) {
  const surface = configuration.dark
    ? "designer-work-surface pointer-events-auto z-30 shrink-0 rounded-lg p-3 text-xs"
    : `pointer-events-auto z-30 shrink-0 rounded-lg border border-neutral-200 bg-white/95 p-3 text-xs text-neutral-800${placement.inSheet ? "" : " shadow-xl backdrop-blur"}`;
  const clear = configuration.dark
    ? "designer-work-control rounded-lg px-2 py-1 font-semibold"
    : "rounded-lg border border-neutral-200 px-2 py-1 font-semibold text-neutral-600 hover:bg-neutral-50";
  const clearClassName = placement.inSheet ? `${clear} min-h-11` : clear;
  if (placement.inSheet) return { className: surface, clearClassName, style: { position: "relative", width: "100%" } as CSSProperties };
  const style: CSSProperties = placement.portalTarget
    ? { position: "relative", width: `${configuration.dockedWidthPx}px` }
    : {
        position: "absolute",
        right: configuration.floatingRightPx,
        top: configuration.floatingTopPx,
        width: configuration.floatingWidthPx,
        maxHeight: `calc(100vh - ${configuration.floatingTopPx + 16}px)`,
        overflowY: "auto",
        overscrollBehavior: "contain",
      };
  return { className: `${surface} hidden md:block`, clearClassName, style };
}
