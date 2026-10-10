"use client";

import { useEffect, useSyncExternalStore } from "react";

/**
 * Tablets (UX 4d, audit AX11). At 768-1023px a panel open on the right (the item panel, the cabinet
 * panel, or the inspector for a wall, door or window) left a sliver of canvas beside the step
 * panel. While one is open the step panel steps aside (derived, not stored: it's back when the
 * right panel closes), and the 2D plan is framed clear of the right panel. The step panel's own
 * toggles (the edge strip, the bar's sidebar toggle, Ctrl/⌘ B) hold it open anyway, until the
 * right panel closes.
 */
export const TABLET_MEDIA_QUERY = "(min-width: 48rem) and (max-width: 63.98rem)";

export function isTabletWidth(viewportWidthPx: number): boolean {
  return viewportWidthPx >= 768 && viewportWidthPx < 1024;
}

/** The item and cabinet panels: 340px at right-4. */
export const TABLET_ITEM_PANEL_INSET_PX = 356;

export type TabletPanelPolicy = {
  /** Whether the step panel shows collapsed: the stored choice, or a right panel's. */
  collapsed: boolean;
  /** A right panel is open on a tablet (so showing the step panel holds it open). */
  rightPanelOpen: boolean;
  /** How far the right panel reaches into the canvas, for the 2D fit. */
  rightInsetPx: number;
};

export function resolveTabletPanelPolicy({
  tablet,
  collapsed,
  rightPanelInsetPx,
  heldOpen,
}: {
  tablet: boolean;
  collapsed: boolean;
  rightPanelInsetPx: number;
  heldOpen: boolean;
}): TabletPanelPolicy {
  const rightPanelOpen = tablet && rightPanelInsetPx > 0;
  return {
    collapsed: collapsed || (rightPanelOpen && !heldOpen),
    rightPanelOpen,
    rightInsetPx: rightPanelOpen ? rightPanelInsetPx : 0,
  };
}

// The open right panels, by name, and whether the step panel is held open beside them.
const rightPanels = new Map<string, number>();
let snapshot = { rightPanelInsetPx: 0, heldOpen: false };
const listeners = new Set<() => void>();

function publish(next: typeof snapshot) {
  if (next.rightPanelInsetPx === snapshot.rightPanelInsetPx && next.heldOpen === snapshot.heldOpen) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

export function setTabletRightPanel(name: string, insetPx: number | null) {
  if (insetPx === null) rightPanels.delete(name);
  else rightPanels.set(name, insetPx);
  const rightPanelInsetPx = Math.max(0, ...rightPanels.values());
  // Holding the step panel open lasts while a right panel is open.
  publish({ rightPanelInsetPx, heldOpen: rightPanelInsetPx > 0 && snapshot.heldOpen });
}

/** A right panel says it's open (and how far it reaches in) while `open` is true. */
export function useReportTabletRightPanel(name: string, open: boolean, insetPx: number) {
  useEffect(() => {
    if (!open) return;
    setTabletRightPanel(name, insetPx);
    return () => setTabletRightPanel(name, null);
  }, [name, open, insetPx]);
}

export function holdStepPanelOpen(heldOpen: boolean) {
  publish({ ...snapshot, heldOpen: heldOpen && snapshot.rightPanelInsetPx > 0 });
}

const CLOSED = { rightPanelInsetPx: 0, heldOpen: false };

export function getTabletPanelSnapshot() {
  return snapshot;
}

export function useTabletPanelPolicy(tablet: boolean, collapsed: boolean): TabletPanelPolicy {
  const current = useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => snapshot,
    () => CLOSED
  );
  return resolveTabletPanelPolicy({ tablet, collapsed, ...current });
}

/**
 * The step panel's toggles: showing it clears the stored collapse and, beside a right panel on a
 * tablet, holds it open; hiding it stores the collapse.
 */
export function toggleStepPanel(policy: TabletPanelPolicy, storedCollapsed: boolean, setCollapsed: (collapsed: boolean) => void) {
  if (!policy.collapsed) {
    holdStepPanelOpen(false);
    setCollapsed(true);
    return;
  }
  if (policy.rightPanelOpen) holdStepPanelOpen(true);
  if (storedCollapsed) setCollapsed(false);
}
