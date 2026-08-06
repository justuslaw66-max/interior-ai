"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
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
import {
  PublicShareRootStateReporter,
  type PublicShareRootState,
} from "@/components/public-share/PublicShareRootStateReporter";

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

function useReportPublicShareShellRootState(input: {
  selection: ReturnType<typeof usePublicShareSelection>;
  readiness: ReturnType<typeof usePublicShareReadiness>;
  layoutMode: PublicShareLayoutMode | null;
  projectionContentIdentity: string;
  projectionDiagnosticFingerprint: string;
}) {
  const { selection, readiness, layoutMode, projectionContentIdentity, projectionDiagnosticFingerprint } = input;
  const rootState = useMemo<PublicShareRootState>(
    () => ({
      layoutStatus: selection.activeRoom
        ? readiness.layoutReady
          ? "ready"
          : "resolving"
        : "empty",
      projectionContentIdentity,
      projectionDiagnosticFingerprint,
      layoutMode,
      layoutGeneration: readiness.layoutGeneration,
      selectedRoomId: selection.selectedRoomId,
      selectedSavedViewId: selection.selectedSavedViewId,
      surface: readiness.surface,
    }),
    [
      layoutMode,
      projectionContentIdentity,
      projectionDiagnosticFingerprint,
      readiness.layoutGeneration,
      readiness.layoutReady,
      readiness.surface,
      selection.activeRoom,
      selection.selectedRoomId,
      selection.selectedSavedViewId,
    ]
  );
  return rootState;
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
  const rootState = useReportPublicShareShellRootState({
    selection,
    readiness,
    layoutMode,
    projectionContentIdentity,
    projectionDiagnosticFingerprint,
  });
  return (
    <PublicShareLayoutContext.Provider value={contextValue}>
      <PublicShareRootStateReporter state={rootState} />
      {children}
    </PublicShareLayoutContext.Provider>
  );
}

export function usePublicShareLayout() {
  const context = useContext(PublicShareLayoutContext);
  if (!context) throw new Error("Public share layout must be inside PublicShareShell.");
  return context;
}
