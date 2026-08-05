"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import {
  buildPublicShareLayoutKey,
  buildPublicShareLayoutGeneration,
  isPublicShareLayoutReady,
  resolvePublicShareLayoutMode,
  resolvePublicShareSelectedRoomId,
  type PublicShareLayoutMode,
} from "@/lib/public-share-layout";

type SurfaceMeasurement = {
  layoutKey: string;
  generation: number;
  width: number;
  height: number;
};

type PublicShareLayoutContextValue = {
  snapshot: DesignSnapshot;
  activeRoom: RoomSnapshot | null;
  selectedRoomId: string | null;
  selectedSavedViewId: string | null;
  layoutMode: PublicShareLayoutMode | null;
  layoutGeneration: number;
  layoutKey: string | null;
  layoutReady: boolean;
  selectRoom: (roomId: string) => void;
  selectSavedView: (savedViewId: string) => void;
  reportCanvasReady: (layoutKey: string) => void;
  reportSurfaceMeasurement: (measurement: SurfaceMeasurement) => void;
};

const PublicShareLayoutContext = createContext<PublicShareLayoutContextValue | null>(null);

function useResponsiveLayoutMode() {
  const [mode, setMode] = useState<PublicShareLayoutMode | null>(null);

  useEffect(() => {
    const updateMode = () => setMode(resolvePublicShareLayoutMode(window.innerWidth));
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    updateMode();
    mobileQuery.addEventListener("change", updateMode);
    desktopQuery.addEventListener("change", updateMode);
    return () => {
      mobileQuery.removeEventListener("change", updateMode);
      desktopQuery.removeEventListener("change", updateMode);
    };
  }, []);
  return mode;
}

const safeAreaStyle: CSSProperties = {
  paddingTop: "env(safe-area-inset-top)",
  paddingLeft: "env(safe-area-inset-left)",
  paddingRight: "env(safe-area-inset-right)",
  paddingBottom: "env(safe-area-inset-bottom)",
};

function usePublicShareSelection(snapshot: DesignSnapshot) {
  const [requestedRoomId, setRequestedRoomId] = useState(() =>
    resolvePublicShareSelectedRoomId(snapshot.rooms, snapshot.activeRoomId)
  );
  const [requestedSavedViewId, setRequestedSavedViewId] = useState<string | null>(null);
  const selectedRoomId = resolvePublicShareSelectedRoomId(snapshot.rooms, requestedRoomId);
  const activeRoom = useMemo(
    () => snapshot.rooms.find((room) => room.id === selectedRoomId) ?? null,
    [selectedRoomId, snapshot.rooms]
  );
  const selectedSavedViewId = activeRoom?.savedViews.some(
    (view) => view.id === requestedSavedViewId
  )
    ? requestedSavedViewId
    : null;
  const selectRoom = useCallback(
    (roomId: string) => {
      if (!snapshot.rooms.some((room) => room.id === roomId)) return;
      setRequestedRoomId(roomId);
      setRequestedSavedViewId(null);
    },
    [snapshot.rooms]
  );
  const selectSavedView = useCallback((savedViewId: string) => {
    setRequestedSavedViewId(savedViewId);
  }, []);
  return { activeRoom, selectedRoomId, selectedSavedViewId, selectRoom, selectSavedView };
}

function usePublicShareReadiness(input: {
  projectionContentIdentity: string;
  layoutMode: PublicShareLayoutMode | null;
  selectedRoomId: string | null;
  selectedSavedViewId: string | null;
  hasSelectedRoom: boolean;
}) {
  const {
    projectionContentIdentity,
    layoutMode,
    selectedRoomId,
    selectedSavedViewId,
    hasSelectedRoom,
  } = input;
  const layoutKey =
    layoutMode && selectedRoomId
      ? buildPublicShareLayoutKey(
          projectionContentIdentity,
          layoutMode,
          selectedRoomId,
          selectedSavedViewId
        )
      : null;
  const layoutGeneration = layoutKey ? buildPublicShareLayoutGeneration(layoutKey) : 0;
  const [canvasLayoutKey, setCanvasLayoutKey] = useState<string | null>(null);
  const [surface, setSurface] = useState<SurfaceMeasurement | null>(null);
  const reportCanvasReady = useCallback(
    (reportedKey: string) => {
      if (reportedKey === layoutKey) setCanvasLayoutKey(reportedKey);
    },
    [layoutKey]
  );
  const reportSurfaceMeasurement = useCallback(
    (measurement: SurfaceMeasurement) => {
      if (measurement.layoutKey !== layoutKey) return;
      if (measurement.generation !== layoutGeneration) return;
      if (!Number.isFinite(measurement.width) || !Number.isFinite(measurement.height)) return;
      if (measurement.width > 0 && measurement.height > 0) setSurface(measurement);
    },
    [layoutGeneration, layoutKey]
  );
  const layoutReady = isPublicShareLayoutReady({
    hasSelectedRoom,
    layoutMode,
    layoutGeneration,
    layoutKey,
    canvasLayoutKey,
    surface,
  });
  return { layoutGeneration, layoutKey, layoutReady, reportCanvasReady, reportSurfaceMeasurement, surface };
}

function PublicShareRoot({
  children,
  projectionContentIdentity,
  projectionDiagnosticFingerprint,
  layoutMode,
  layoutGeneration,
  layoutReady,
  selectedRoomId,
  selectedSavedViewId,
  hasSelectedRoom,
  surface,
}: {
  children: ReactNode;
  projectionContentIdentity: string;
  projectionDiagnosticFingerprint: string;
  layoutMode: PublicShareLayoutMode | null;
  layoutGeneration: number;
  layoutReady: boolean;
  selectedRoomId: string | null;
  selectedSavedViewId: string | null;
  hasSelectedRoom: boolean;
  surface: SurfaceMeasurement | null;
}) {
  const layoutStatus = hasSelectedRoom ? (layoutReady ? "ready" : "resolving") : "empty";
  return (
    <main
      className="min-h-screen overflow-x-clip bg-neutral-100"
      data-testid="public-share-root"
      data-layout-status={layoutStatus}
      data-layout-mode={layoutMode ?? "resolving"}
      data-layout-generation={layoutGeneration}
      data-selected-room-id={selectedRoomId ?? ""}
      data-selected-saved-view-id={selectedSavedViewId ?? ""}
      data-projection-content-identity={projectionContentIdentity}
      data-projection-fingerprint={projectionDiagnosticFingerprint}
      data-surface-width={surface?.width ?? 0}
      data-surface-height={surface?.height ?? 0}
      style={safeAreaStyle}
    >
      {children}
    </main>
  );
}

export function PublicShareShell({
  snapshot,
  projectionContentIdentity,
  projectionDiagnosticFingerprint,
  children,
}: {
  snapshot: DesignSnapshot;
  projectionContentIdentity: string;
  projectionDiagnosticFingerprint: string;
  children: ReactNode;
}) {
  const layoutMode = useResponsiveLayoutMode();
  const selection = usePublicShareSelection(snapshot);
  const readiness = usePublicShareReadiness({
    projectionContentIdentity,
    layoutMode,
    selectedRoomId: selection.selectedRoomId,
    selectedSavedViewId: selection.selectedSavedViewId,
    hasSelectedRoom: Boolean(selection.activeRoom),
  });
  const contextValue: PublicShareLayoutContextValue = {
    snapshot,
    ...selection,
    layoutMode,
    layoutGeneration: readiness.layoutGeneration,
    layoutKey: readiness.layoutKey,
    layoutReady: readiness.layoutReady,
    reportCanvasReady: readiness.reportCanvasReady,
    reportSurfaceMeasurement: readiness.reportSurfaceMeasurement,
  };
  return (
    <PublicShareLayoutContext.Provider value={contextValue}>
      <PublicShareRoot
        projectionContentIdentity={projectionContentIdentity}
        projectionDiagnosticFingerprint={projectionDiagnosticFingerprint}
        layoutMode={layoutMode}
        layoutGeneration={readiness.layoutGeneration}
        layoutReady={readiness.layoutReady}
        selectedRoomId={selection.selectedRoomId}
        selectedSavedViewId={selection.selectedSavedViewId}
        hasSelectedRoom={Boolean(selection.activeRoom)}
        surface={readiness.surface}
      >
        {children}
      </PublicShareRoot>
    </PublicShareLayoutContext.Provider>
  );
}

export function usePublicShareLayout() {
  const context = useContext(PublicShareLayoutContext);
  if (!context) throw new Error("Public share layout must be inside PublicShareShell.");
  return context;
}
