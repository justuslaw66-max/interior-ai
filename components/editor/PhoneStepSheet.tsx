"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import {
  PHONE_SHEET_PEEK_PX,
  nearestPhoneSheetSnap,
  nextPhoneSheetSnap,
  phoneSheetHeightPx,
  setPhoneSheetInspectorSlot,
  setPhoneSheetState,
  usePhoneSheetInspector,
  type PhoneSheetSnap,
} from "@/lib/phone-step-sheet";

type PhoneStepSheetProps = {
  dark: boolean;
  title: string;
  subtitle: string;
  /** Collapsed is the sheet's peek: only its title shows (Ctrl/⌘ B, or dragging it down). */
  collapsed: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children: ReactNode;
};

const SHEET_BODY_ID = "design-controls-sheet-body";

/**
 * The viewport's height. While the server renders and the page hydrates it's a phone's (844px), so
 * the two agree; the real height follows straight after. Reading `window` in the first render made
 * the sheet's height differ from the server's, a hydration error (the window suite, 30 Sep).
 */
const SERVER_VIEWPORT_HEIGHT_PX = 844;
function subscribeToResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
function useViewportHeight() {
  return useSyncExternalStore(subscribeToResize, () => window.innerHeight, () => SERVER_VIEWPORT_HEIGHT_PX);
}

type SheetDrag = { startY: number; moved: boolean; heightPx: number };

/**
 * Dragging the handle resizes the sheet directly (no state per move), and it settles on the
 * nearest height when let go; a drag isn't also a press.
 */
function useSheetDrag(heightPx: number, viewportHeight: number, settle: (snap: PhoneSheetSnap) => void) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const drag = useRef<SheetDrag | null>(null);
  const suppressClick = useRef(false);
  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, moved: false, heightPx };
  };
  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    const sheet = sheetRef.current;
    if (!current || !sheet) return;
    const deltaY = event.clientY - current.startY;
    if (Math.abs(deltaY) > 6) current.moved = true;
    if (!current.moved) return;
    const full = phoneSheetHeightPx("full", viewportHeight);
    current.heightPx = Math.min(full, Math.max(PHONE_SHEET_PEEK_PX, heightPx - deltaY));
    sheet.dataset.dragging = "true";
    sheet.style.height = `${current.heightPx}px`;
  };
  const onPointerEnd = () => {
    const current = drag.current;
    drag.current = null;
    if (!current?.moved) return;
    suppressClick.current = true;
    if (sheetRef.current) {
      delete sheetRef.current.dataset.dragging;
      sheetRef.current.style.height = `${heightPx}px`;
    }
    settle(nearestPhoneSheetSnap(current.heightPx, viewportHeight));
  };
  const consumeDragClick = () => {
    const suppressed = suppressClick.current;
    suppressClick.current = false;
    return suppressed;
  };
  return { sheetRef, consumeDragClick, handlers: { onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd } };
}

/**
 * The step panel on phones (UX 4d, audit AX3, the PhonePlan and PhoneFurnish mockups): a sheet
 * over the canvas, above the step bar. Its handle is a button that expands it (half, then full)
 * and brings it back, or drags it; it reports its height, so the plan is framed above it.
 */
export function PhoneStepSheet({ dark, title, subtitle, collapsed, onCollapsedChange, children }: PhoneStepSheetProps) {
  const [expanded, setExpanded] = useState<Exclude<PhoneSheetSnap, "peek">>("half");
  const snap: PhoneSheetSnap = collapsed ? "peek" : expanded;
  const viewportHeight = useViewportHeight();
  const heightPx = phoneSheetHeightPx(snap, viewportHeight);
  const settle = (next: PhoneSheetSnap) => {
    if (next === "peek") return onCollapsedChange?.(true);
    setExpanded(next);
    if (collapsed) onCollapsedChange?.(false);
  };
  const { sheetRef, consumeDragClick, handlers } = useSheetDrag(heightPx, viewportHeight, settle);
  // A wall, door or window selected on the canvas shows its inspector here (AX2), opening a peeking sheet.
  const inspecting = usePhoneSheetInspector().active;
  useEffect(() => {
    if (inspecting && collapsed) onCollapsedChange?.(false);
  }, [inspecting, collapsed, onCollapsedChange]);
  useEffect(() => setPhoneSheetState({ heightPx, snap }), [heightPx, snap]);
  useEffect(() => () => setPhoneSheetState(null), []);
  const handleLabel = snap === "full" ? "Collapse panel" : "Expand panel";

  return (
    <section
      ref={sheetRef}
      data-testid="design-controls-panel"
      data-touch-area
      data-temporary-reveal="false"
      data-sheet-snap={snap}
      aria-label={title}
      style={{ height: heightPx }}
      className={`absolute inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex flex-col rounded-t-[20px] shadow-[0_-6px_24px_rgba(23,23,23,0.12)] transition-[height] duration-200 data-[dragging=true]:transition-none motion-reduce:transition-none ${
        dark ? "designer-dock" : "bg-white text-neutral-900"
      }`}
    >
      <div className="flex shrink-0 justify-center">
        <Button variant="quiet" data-testid="design-controls-panel-handle" aria-label={handleLabel} aria-expanded={snap === "full"}
          aria-controls={SHEET_BODY_ID} title={handleLabel} className="h-11 w-24 touch-none px-0 py-0" {...handlers}
          onClick={() => { if (!consumeDragClick()) settle(nextPhoneSheetSnap(snap)); }}>
          <span aria-hidden="true" className="block h-[5px] w-9 rounded-full bg-neutral-300" />
        </Button>
      </div>
      <div hidden={inspecting} className="-mt-1.5 shrink-0 px-4 pb-2">
        <h2 className="text-lg font-bold leading-6">{title}</h2>
        <p className={`truncate text-xs ${dark ? "designer-text-secondary" : "text-neutral-600"}`}>{subtitle}</p>
      </div>
      <div id={SHEET_BODY_ID} hidden={snap === "peek"} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
        <div ref={setPhoneSheetInspectorSlot} data-testid="phone-sheet-inspector" hidden={!inspecting} />
        <div hidden={inspecting} className="space-y-3">{children}</div>
      </div>
    </section>
  );
}
