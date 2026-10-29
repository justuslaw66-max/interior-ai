"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  isPhoneSheetInspectorSelection,
  setPhoneSheetInspectorActive,
  usePhoneSheetInspector,
} from "@/lib/phone-step-sheet";
import { useReportTabletRightPanel } from "@/lib/tablet-panel-policy";
import { CANVAS_TOOLBAR_MEDIA_QUERY, useMediaQuery } from "@/lib/useMediaQuery";

type InspectorState = Parameters<typeof isPhoneSheetInspectorSelection>[0];
/**
 * The inspector's placement settings, spelled out here rather than picked from its props, so this
 * file doesn't import the inspector that imports it (the design-page architecture check).
 */
type InspectorConfiguration = {
  dockWhenPortalAvailable: boolean;
  portalTarget: HTMLDivElement | null;
  dockedWidthPx: number;
  floatingRightPx: number;
  floatingTopPx: number;
  floatingWidthPx: number;
};

/** The nearest ancestor that scrolls up and down: the Plan rail, for a docked inspector. */
function scrollingAncestor(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * A docked inspector is the Plan rail's last card, so at 1280×720 a wall's Change material sat below
 * the rail's fold (30 Oct 2026). When the selection changes, the rail scrolls just enough to show
 * the inspector, keeping its top in view when it's taller than the rail.
 */
function useRevealDockedInspector(element: HTMLElement | null, docked: boolean, selectionKey: string) {
  useEffect(() => {
    if (!docked || !element) return;
    const frame = requestAnimationFrame(() => {
      const rail = scrollingAncestor(element);
      if (!rail) return;
      const railBox = rail.getBoundingClientRect();
      const box = element.getBoundingClientRect();
      const above = box.top - railBox.top;
      const below = box.bottom - railBox.bottom;
      if (above < 0) rail.scrollTop += above;
      else if (below > 0) rail.scrollTop += Math.min(below, above);
    });
    return () => cancelAnimationFrame(frame);
  }, [docked, element, selectionKey]);
}

/**
 * Where the inspector goes: from md, floating or docked in the Plan rail; on phones (UX 4d, audit
 * AX2), the step sheet for a wall, ceiling, door, window, fixed element or note, with Done to
 * deselect, and nowhere otherwise (rooms keep the Plan panel's room section). Floating for one of
 * those on a tablet, the step panel steps aside for it (AX11).
 */
export function useInspectorPlacement(state: InspectorState, configuration: InspectorConfiguration, selectionKey = "") {
  const wide = useMediaQuery(CANVAS_TOOLBAR_MEDIA_QUERY);
  const sheet = usePhoneSheetInspector();
  const takesOver = isPhoneSheetInspectorSelection(state);
  const inSheet = !wide && Boolean(sheet.slot) && takesOver;
  const docked = Boolean(configuration.dockWhenPortalAvailable && configuration.portalTarget);
  useEffect(() => {
    if (!inSheet) return;
    setPhoneSheetInspectorActive(true);
    return () => setPhoneSheetInspectorActive(false);
  }, [inSheet]);
  useReportTabletRightPanel("inspector", wide && !docked && takesOver, configuration.floatingWidthPx + configuration.floatingRightPx);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  useRevealDockedInspector(element, docked && !inSheet, selectionKey);
  if (inSheet) return { shown: true, inSheet, portalTarget: sheet.slot, attach: setElement };
  return { shown: wide, inSheet, portalTarget: docked ? configuration.portalTarget : null, attach: setElement };
}

/**
 * The inspector's frame and the size of its × Deselect Button (UX 4f, ED7; UX 5n): in the sheet it
 * is Done, a 44px Button, on a card like the step panel's; elsewhere a 36px icon, 44px on touch
 * screens, on a floating surface (dark mode step 5.2b: data-surface="floating").
 */
export function inspectorFrame(configuration: InspectorConfiguration, placement: { inSheet: boolean; portalTarget: HTMLDivElement | null }) {
  const surface = `pointer-events-auto z-30 shrink-0 rounded-lg border p-3 text-xs text-control-label ${placement.inSheet ? "border-box-border bg-surface-secondary" : "border-separator bg-surface-floating/95 shadow-xl backdrop-blur"}`;
  if (placement.inSheet) return { className: surface, clearSize: "touch" as const, dataSurface: undefined, style: { position: "relative", width: "100%" } as CSSProperties };
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
  return { className: `${surface} hidden md:block`, dataSurface: "floating" as const, clearSize: "icon" as const, style };
}
