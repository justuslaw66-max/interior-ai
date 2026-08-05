"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, type KeyboardEvent } from "react";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import type { DesignLightingSettings } from "@/lib/lightingPresets";
import { resolveDesignLightingSettings } from "@/lib/design-lighting-settings";
import {
  publicShareRoomActionTestId,
  publicShareSavedViewActionTestId,
} from "@/lib/public-share-layout";
import {
  resolvePublicShareSavedViews,
  type PublicShareCameraView,
} from "@/lib/public-share-saved-views";
import { usePublicShareLayout } from "@/components/public-share/PublicShareShell";
import { ShareScene } from "@/components/public-share/ShareScene";

function focusAdjacentRoom(event: KeyboardEvent<HTMLButtonElement>) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const roomButtons = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button") ?? []
  );
  const currentIndex = roomButtons.indexOf(event.currentTarget);
  if (currentIndex < 0) return;
  const nextIndex =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? roomButtons.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + roomButtons.length) %
          roomButtons.length;
  event.preventDefault();
  roomButtons[nextIndex]?.focus();
}

function RoomNavigation({
  rooms,
  selectedRoomId,
  selectRoom,
}: {
  rooms: readonly RoomSnapshot[];
  selectedRoomId: string | null;
  selectRoom: (roomId: string) => void;
}) {
  if (rooms.length <= 1) return null;
  return (
    <nav
      aria-label="Shared rooms"
      className="flex gap-2 overflow-x-auto pb-1 md:flex-wrap md:overflow-visible"
      data-testid="share-room-navigation"
    >
      {rooms.map((room) => (
        <button
          key={room.id}
          type="button"
          aria-controls="public-share-preview-surface"
          aria-pressed={room.id === selectedRoomId}
          data-testid={publicShareRoomActionTestId(room.id)}
          data-share-touch-target="true"
          onClick={() => selectRoom(room.id)}
          onKeyDown={focusAdjacentRoom}
          className={
            room.id === selectedRoomId
              ? "min-h-11 min-w-11 shrink-0 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white outline-offset-2 focus:outline-2"
              : "min-h-11 min-w-11 shrink-0 rounded-lg border bg-white px-4 py-2 text-sm font-medium text-gray-700 outline-offset-2 hover:bg-gray-50 focus:outline-2"
          }
        >
          {room.name}
        </button>
      ))}
    </nav>
  );
}

function SharePreviewSurface({
  room,
  lightingSettings,
  activeView,
}: {
  room: RoomSnapshot;
  lightingSettings: DesignLightingSettings;
  activeView: PublicShareCameraView | null;
}) {
  const { layoutGeneration, layoutKey, reportCanvasReady, reportSurfaceMeasurement } =
    usePublicShareLayout();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const canvasCreatedRef = useRef(false);
  const markCanvasCreated = useCallback(() => {
    canvasCreatedRef.current = true;
    if (layoutKey) reportCanvasReady(layoutKey);
  }, [layoutKey, reportCanvasReady]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || !layoutKey || layoutGeneration <= 0) return;
    if (canvasCreatedRef.current) reportCanvasReady(layoutKey);
    const report = () => {
      const bounds = surface.getBoundingClientRect();
      reportSurfaceMeasurement({
        layoutKey,
        generation: layoutGeneration,
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      });
    };
    const observer = new ResizeObserver(report);
    observer.observe(surface);
    report();
    return () => observer.disconnect();
  }, [layoutGeneration, layoutKey, reportCanvasReady, reportSurfaceMeasurement]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white shadow">
      <div className="pointer-events-none absolute right-3 top-3 z-10 rounded-lg bg-black/70 px-3 py-1 text-xs text-white md:right-4 md:top-4">
        Shared preview
      </div>
      <div
        ref={surfaceRef}
        id="public-share-preview-surface"
        className="h-[min(68svh,36rem)] min-h-72 w-full md:h-[min(72vh,44rem)] md:min-h-80"
        data-testid="share-preview-surface"
        data-room-id={room.id}
      >
        <ShareScene
          room={room}
          lightingSettings={lightingSettings}
          activeView={activeView}
          onCreated={markCanvasCreated}
        />
      </div>
    </div>
  );
}

function SavedViewNavigation({
  room,
  savedViews,
  selectedSavedViewId,
  selectSavedView,
}: {
  room: RoomSnapshot;
  savedViews: readonly PublicShareCameraView[];
  selectedSavedViewId: string | null;
  selectSavedView: (savedViewId: string) => void;
}) {
  if (savedViews.length === 0) return null;
  return (
    <nav
      aria-label={`Saved views for ${room.name}`}
      className="rounded-xl bg-white p-4 shadow"
      data-testid="share-saved-view-navigation"
    >
      <h3 className="mb-2 text-sm font-semibold text-gray-800">Saved Views</h3>
      <div className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-3">
        {savedViews.map((view) => (
          <button
            type="button"
            key={view.id}
            aria-pressed={view.id === selectedSavedViewId}
            data-testid={publicShareSavedViewActionTestId(view.id)}
            data-share-touch-target="true"
            onClick={() => selectSavedView(view.id)}
            className={
              view.id === selectedSavedViewId
                ? "min-h-11 rounded-lg border border-neutral-900 bg-neutral-900 p-3 text-center text-white outline-offset-2 focus:outline-2"
                : "min-h-11 rounded-lg border bg-gray-50 p-3 text-center text-gray-700 outline-offset-2 transition hover:border-neutral-400 hover:bg-white focus:outline-2"
            }
          >
            <span className="text-sm font-medium">{view.name}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

function useShareViewerModel(snapshot: DesignSnapshot, room: RoomSnapshot | null) {
  const lightingSettings = useMemo(() => resolveDesignLightingSettings(snapshot), [snapshot]);
  const savedViews = useMemo(() => resolvePublicShareSavedViews(room), [room]);
  return { lightingSettings, savedViews };
}

export default function ShareViewer() {
  const layout = usePublicShareLayout();
  const { lightingSettings, savedViews } = useShareViewerModel(layout.snapshot, layout.activeRoom);
  const activeSavedView =
    savedViews.find((view) => view.id === layout.selectedSavedViewId) ?? null;

  if (!layout.activeRoom) {
    return (
      <section className="rounded-xl border bg-white p-6" data-testid="public-share-empty">
        No room is available in this shared design.
      </section>
    );
  }

  return (
    <section
      className="space-y-4"
      data-testid="share-viewer"
      data-ready={layout.layoutReady ? "true" : "false"}
      data-layout-mode={layout.layoutMode ?? "resolving"}
      data-selected-room-id={layout.selectedRoomId ?? ""}
    >
      <RoomNavigation
        rooms={layout.snapshot.rooms}
        selectedRoomId={layout.selectedRoomId}
        selectRoom={layout.selectRoom}
      />
      <SharePreviewSurface
        room={layout.activeRoom}
        lightingSettings={lightingSettings}
        activeView={activeSavedView}
      />
      <SavedViewNavigation
        room={layout.activeRoom}
        savedViews={savedViews}
        selectedSavedViewId={layout.selectedSavedViewId}
        selectSavedView={layout.selectSavedView}
      />
    </section>
  );
}
