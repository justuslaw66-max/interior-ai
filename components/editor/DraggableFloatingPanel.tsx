"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from "react";

type FloatingPanelPosition = {
  x: number;
  y: number;
};

type SnapPreview = {
  rightGuideX?: number;
  stackGuideY?: number;
  stackGuideLeft?: number;
  stackGuideWidth?: number;
};

type DraggableFloatingPanelProps = {
  children: ReactNode;
  defaultPosition: { x?: number; y: number; right?: number; width?: number };
  positionPresets?: Array<{ label: string; y: number; right?: number; x?: number }>;
  className?: string;
  dragHandleClassName?: string;
  ariaLabel: string;
  storageKey?: string;
  mobilePlacement?: "top" | "bottom";
};

const EDGE_MARGIN = 4;
const RIGHT_SNAP_DISTANCE = 56;
const TOP_SNAP_DISTANCE = 56;
const DEFAULT_TOP_DOCK_Y = 64;
const STACK_SNAP_DISTANCE = 36;
const STACK_GAP = 2;
const MIN_STACK_OVERLAP_RATIO = 0.6;
const MOBILE_PANEL_BREAKPOINT = 520;
const STORAGE_PREFIX = "interior-ai-floating-panel:";

const floatingPanelRegistry = new Map<string, HTMLElement>();

function DockIcon() {
  return (
    <span className="relative h-3.5 w-3.5 text-current" aria-hidden="true">
      <span className="absolute inset-0 rounded-[3px] border border-current" />
      <span className="absolute bottom-0.5 right-0.5 top-0.5 w-0.5 rounded-full bg-current" />
      <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-r border-t border-current" />
    </span>
  );
}

function ResetIcon() {
  return (
    <span className="relative h-3.5 w-3.5 text-current" aria-hidden="true">
      <span className="absolute inset-0 rounded-full border-2 border-current border-r-transparent" />
      <span className="absolute -right-0.5 top-0 h-1.5 w-1.5 rotate-45 border-r-2 border-t-2 border-current" />
    </span>
  );
}

function PresetIcon() {
  return (
    <span className="flex h-3.5 w-3.5 items-center justify-center gap-0.5" aria-hidden="true">
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
      <span className="h-1 w-1 rounded-full bg-current" />
    </span>
  );
}

function RailTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-7 top-1/2 z-[80] hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-neutral-950 px-2 py-1 text-[10px] font-semibold text-white shadow-lg group-hover:block group-focus-visible:block">
      {label}
    </span>
  );
}

function readStoredPosition(storageKey?: string): FloatingPanelPosition | null {
  if (!storageKey || typeof window === "undefined") return null;

  try {
    const rawValue = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);
    if (!rawValue) return null;
    const parsed = JSON.parse(rawValue) as Partial<FloatingPanelPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

function writeStoredPosition(storageKey: string | undefined, position: FloatingPanelPosition) {
  if (!storageKey || typeof window === "undefined") return;

  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, JSON.stringify(position));
  } catch {
    // Best-effort preference storage; dragging should never fail if storage is blocked.
  }
}

function removeStoredPosition(storageKey?: string) {
  if (!storageKey || typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${storageKey}`);
  } catch {
    // Best-effort preference storage; resetting should never block interaction.
  }
}

export default function DraggableFloatingPanel({
  children,
  defaultPosition,
  positionPresets = [],
  className = "",
  dragHandleClassName = "",
  ariaLabel,
  storageKey,
  mobilePlacement = "bottom",
}: DraggableFloatingPanelProps) {
  const panelId = useId();
  const [position, setPosition] = useState<FloatingPanelPosition>({
    x: defaultPosition.x ?? 0,
    y: defaultPosition.y,
  });
  const [snapPreview, setSnapPreview] = useState<SnapPreview>({});
  const [isMobilePanel, setIsMobilePanel] = useState(false);
  const [presetMenuOpen, setPresetMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    pointerId: number;
    pointerX: number;
    pointerY: number;
    panelX: number;
    panelY: number;
  } | null>(null);

  const getPanelWidth = useCallback(
    () => panelRef.current?.getBoundingClientRect().width ?? defaultPosition.width ?? 320,
    [defaultPosition.width]
  );

  const getPanelHeight = useCallback(
    () => panelRef.current?.getBoundingClientRect().height ?? 72,
    []
  );

  const resolveRightDockX = useCallback(() => {
    const width = getPanelWidth();
    const right = defaultPosition.right ?? 16;
    return Math.max(EDGE_MARGIN, window.innerWidth - width - right);
  }, [defaultPosition.right, getPanelWidth]);

  const resolveTopDockY = useCallback(() => {
    const presetYValues = positionPresets.map((preset) => preset.y);
    return Math.max(
      EDGE_MARGIN,
      Math.min(DEFAULT_TOP_DOCK_Y, defaultPosition.y, ...presetYValues)
    );
  }, [defaultPosition.y, positionPresets]);

  const clampPosition = useCallback((nextX: number, nextY: number) => {
    const width = getPanelWidth();
    const height = getPanelHeight();
    const maxX = Math.max(EDGE_MARGIN, window.innerWidth - width - EDGE_MARGIN);
    const maxY = Math.max(EDGE_MARGIN, window.innerHeight - height - EDGE_MARGIN);
    return {
      x: Math.max(EDGE_MARGIN, Math.min(maxX, nextX)),
      y: Math.max(EDGE_MARGIN, Math.min(maxY, nextY)),
    };
  }, [getPanelHeight, getPanelWidth]);

  const resolveTopSnap = (nextY: number): { y: number; guideY?: number } => {
    const dockY = resolveTopDockY();
    if (Math.abs(nextY - dockY) > TOP_SNAP_DISTANCE) {
      return { y: nextY };
    }

    return { y: dockY, guideY: dockY };
  };

  const resolveStackSnap = (
    current: FloatingPanelPosition,
    nextX: number,
    nextY: number
  ): {
    y: number;
    guideY?: number;
    guideLeft?: number;
    guideWidth?: number;
  } => {
    const element = panelRef.current;
    if (!element) return { y: nextY };

    const rect = element.getBoundingClientRect();
    const dx = nextX - current.x;
    const dy = nextY - current.y;
    const projectedLeft = rect.left + dx;
    const projectedRight = rect.right + dx;
    const projectedTop = rect.top + dy;
    const projectedBottom = rect.bottom + dy;
    const minOverlap = rect.width * MIN_STACK_OVERLAP_RATIO;
    let closestDistance = STACK_SNAP_DISTANCE + 1;
    let targetViewportTop: number | null = null;
    let guideLeft: number | undefined;
    let guideWidth: number | undefined;

    floatingPanelRegistry.forEach((otherElement, otherId) => {
      if (otherId === panelId) return;

      const otherRect = otherElement.getBoundingClientRect();
      const horizontalOverlap =
        Math.min(projectedRight, otherRect.right) - Math.max(projectedLeft, otherRect.left);
      if (horizontalOverlap < minOverlap) return;

      const topDock = otherRect.bottom + STACK_GAP;
      const bottomDock = otherRect.top - rect.height - STACK_GAP;
      const topToOtherBottom = Math.abs(projectedTop - topDock);
      const bottomToOtherTop = Math.abs(projectedTop - bottomDock);
      const verticalOverlap =
        Math.min(projectedBottom, otherRect.bottom) - Math.max(projectedTop, otherRect.top);

      if (topToOtherBottom <= STACK_SNAP_DISTANCE && topToOtherBottom < closestDistance) {
        closestDistance = topToOtherBottom;
        targetViewportTop = topDock;
        guideLeft = Math.min(projectedLeft, otherRect.left);
        guideWidth = Math.max(projectedRight, otherRect.right) - guideLeft;
      }

      if (bottomToOtherTop <= STACK_SNAP_DISTANCE && bottomToOtherTop < closestDistance) {
        closestDistance = bottomToOtherTop;
        targetViewportTop = bottomDock;
        guideLeft = Math.min(projectedLeft, otherRect.left);
        guideWidth = Math.max(projectedRight, otherRect.right) - guideLeft;
      }

      if (verticalOverlap > 0) {
        const shouldMoveBelow = projectedTop >= otherRect.top;
        targetViewportTop = shouldMoveBelow ? topDock : bottomDock;
        closestDistance = 0;
        guideLeft = Math.min(projectedLeft, otherRect.left);
        guideWidth = Math.max(projectedRight, otherRect.right) - guideLeft;
      }
    });

    if (targetViewportTop === null) return { y: nextY };

    return {
      y: current.y + targetViewportTop - rect.top,
      guideY: targetViewportTop,
      guideLeft,
      guideWidth,
    };
  };

  const resolveSnappedPosition = (current: FloatingPanelPosition) => {
    const dockX = resolveRightDockX();
    const shouldDockRight = Math.abs(current.x - dockX) <= RIGHT_SNAP_DISTANCE;
    const nextX = shouldDockRight ? dockX : current.x;
    const stackSnap = resolveStackSnap(current, nextX, current.y);
    const topSnap = stackSnap.guideY === undefined ? resolveTopSnap(stackSnap.y) : stackSnap;
    return clampPosition(nextX, topSnap.y);
  };

  const handleDockToRight = () => {
    if (isMobilePanel) return;

    setPosition((current) => {
      const dockX = resolveRightDockX();
      const stackSnap = resolveStackSnap(current, dockX, current.y);
      const topSnap = stackSnap.guideY === undefined ? resolveTopSnap(stackSnap.y) : stackSnap;
      const next = clampPosition(dockX, topSnap.y);
      writeStoredPosition(storageKey, next);
      return next;
    });
  };

  const applyPositionPreset = (preset: { y: number; right?: number; x?: number }) => {
    if (isMobilePanel) return;

    const nextX =
      typeof preset.x === "number"
        ? preset.x
        : Math.max(
            EDGE_MARGIN,
            window.innerWidth - getPanelWidth() - (preset.right ?? defaultPosition.right ?? 16)
          );
    const next = clampPosition(nextX, preset.y);
    setPosition(next);
    writeStoredPosition(storageKey, next);
    setPresetMenuOpen(false);
  };

  const handleResetPosition = () => {
    if (isMobilePanel) return;

    removeStoredPosition(storageKey);
    setPosition(() => {
      if (typeof defaultPosition.x === "number") {
        return clampPosition(defaultPosition.x, defaultPosition.y);
      }
      return clampPosition(resolveRightDockX(), defaultPosition.y);
    });
  };

  useEffect(() => {
    const updateMobileState = () => {
      setIsMobilePanel(window.innerWidth < MOBILE_PANEL_BREAKPOINT);
    };

    updateMobileState();
    window.addEventListener("resize", updateMobileState);
    return () => window.removeEventListener("resize", updateMobileState);
  }, []);

  useEffect(() => {
    const element = panelRef.current;
    if (!element) return;

    floatingPanelRegistry.set(panelId, element);
    return () => {
      floatingPanelRegistry.delete(panelId);
    };
  }, [panelId]);

  useEffect(() => {
    if (isMobilePanel) return;

    const frame = window.requestAnimationFrame(() => {
      const storedPosition = readStoredPosition(storageKey);
      if (storedPosition) {
        setPosition(clampPosition(storedPosition.x, storedPosition.y));
        return;
      }

      if (typeof defaultPosition.x === "number") {
        setPosition(clampPosition(defaultPosition.x, defaultPosition.y));
        return;
      }

      setPosition({
        x: resolveRightDockX(),
        y: defaultPosition.y,
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [
    defaultPosition.right,
    defaultPosition.width,
    defaultPosition.x,
    defaultPosition.y,
    clampPosition,
    isMobilePanel,
    resolveRightDockX,
    storageKey,
  ]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (isMobilePanel) return;

    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, summary")) return;

    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      panelX: position.x,
      panelY: position.y,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;

    const nextX = dragStart.panelX + event.clientX - dragStart.pointerX;
    const nextY = dragStart.panelY + event.clientY - dragStart.pointerY;
    const clamped = clampPosition(nextX, nextY);
    const dockX = resolveRightDockX();
    const shouldDockRight = Math.abs(clamped.x - dockX) <= RIGHT_SNAP_DISTANCE;
    const previewX = shouldDockRight ? dockX : clamped.x;
    const stackSnap = resolveStackSnap(clamped, previewX, clamped.y);
    const topSnap = stackSnap.guideY === undefined ? resolveTopSnap(stackSnap.y) : stackSnap;
    const hasVerticalGuide = stackSnap.guideY !== undefined || topSnap.guideY !== undefined;

    setSnapPreview({
      rightGuideX: shouldDockRight ? dockX + getPanelWidth() : undefined,
      stackGuideY: stackSnap.guideY ?? topSnap.guideY,
      stackGuideLeft: stackSnap.guideLeft ?? (hasVerticalGuide ? previewX : undefined),
      stackGuideWidth: stackSnap.guideWidth ?? (hasVerticalGuide ? getPanelWidth() : undefined),
    });
    setPosition(clamped);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    setPosition((current) => {
      const next = resolveSnappedPosition(current);
      writeStoredPosition(storageKey, next);
      return next;
    });
    setSnapPreview({});
    dragStartRef.current = null;
  };

  const defaultPresets = [
    { label: "Coohom stack", y: defaultPosition.y, right: defaultPosition.right },
    { label: "Dock top", y: 64, right: defaultPosition.right },
    { label: "Dock lower", y: Math.max(88, defaultPosition.y + 182), right: defaultPosition.right },
  ];
  const resolvedPositionPresets = positionPresets.length > 0 ? positionPresets : defaultPresets;

  const containerStyle: CSSProperties = isMobilePanel
    ? mobilePlacement === "top"
      ? { left: EDGE_MARGIN, right: EDGE_MARGIN, top: 60 }
      : { left: EDGE_MARGIN, right: EDGE_MARGIN, bottom: EDGE_MARGIN }
    : { left: position.x, top: position.y };

  return (
    <>
      {snapPreview.rightGuideX !== undefined && (
        <div
          className="pointer-events-none fixed bottom-0 top-0 z-[60] w-px bg-blue-500/55"
          style={{ left: snapPreview.rightGuideX }}
        />
      )}
      {snapPreview.stackGuideY !== undefined && (
        <div
          className="pointer-events-none fixed z-[60] h-0.5 bg-blue-500/55"
          style={{
            left: snapPreview.stackGuideLeft,
            top: snapPreview.stackGuideY,
            width: snapPreview.stackGuideWidth,
          }}
        />
      )}
      <div
        ref={panelRef}
        className={`${isMobilePanel ? "fixed" : "absolute"} z-30 ${className}`}
        style={containerStyle}
        aria-label={ariaLabel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {!isMobilePanel && (
          <div className="absolute -left-7 top-2 flex w-5 flex-col items-center gap-1">
            <button
              type="button"
              className="group relative grid h-5 w-5 place-items-center rounded-md bg-white/95 text-neutral-600 shadow-sm ring-1 ring-black/10 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Dock panel to right"
              title="Dock to right"
              onClick={() => {
                setPresetMenuOpen(false);
                handleDockToRight();
              }}
            >
              <DockIcon />
              <RailTooltip label="Dock right" />
            </button>
            <button
              type="button"
              className="group relative grid h-5 w-5 place-items-center rounded-md bg-white/95 text-neutral-600 shadow-sm ring-1 ring-black/10 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Reset panel position"
              title="Reset panel position"
              onClick={() => {
                setPresetMenuOpen(false);
                handleResetPosition();
              }}
            >
              <ResetIcon />
              <RailTooltip label="Reset" />
            </button>
            <div className="relative">
              <button
                type="button"
                className="group relative grid h-5 w-5 place-items-center rounded-md bg-white/95 text-neutral-600 shadow-sm ring-1 ring-black/10 hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                aria-label="Panel position presets"
                title="Panel presets"
                data-testid={`floating-panel-presets-${storageKey ?? panelId}`}
                onClick={() => setPresetMenuOpen((open) => !open)}
              >
                <PresetIcon />
                <RailTooltip label="Presets" />
              </button>
              {presetMenuOpen && (
                <div
                  className="absolute left-7 top-0 z-[70] w-32 rounded-lg border border-neutral-200 bg-white p-1 text-xs shadow-xl"
                  data-testid={`floating-panel-preset-menu-${storageKey ?? panelId}`}
                >
                  {resolvedPositionPresets.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="block w-full rounded-md px-2 py-1.5 text-left font-semibold text-neutral-700 hover:bg-neutral-100"
                      onClick={() => applyPositionPreset(preset)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className={`cursor-grab touch-none active:cursor-grabbing ${dragHandleClassName}`}>
          {children}
        </div>
      </div>
    </>
  );
}
