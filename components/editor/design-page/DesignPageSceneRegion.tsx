"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type DragEventHandler,
} from "react";

import { DesignPageViewportOverlayLayer } from "@/components/editor/design-page/DesignPageViewportOverlayLayer";
import { DesignSceneCanvas } from "@/components/editor/design-page/DesignSceneCanvas";
import { DesignSceneGuidanceLayer } from "@/components/editor/design-page/DesignSceneGuidanceLayer";
import { DesignScenePreviewLayer } from "@/components/editor/design-page/DesignScenePreviewLayer";
import { DesignSceneStructureLayer } from "@/components/editor/design-page/DesignSceneStructureLayer";
import { SceneItemsLayer } from "@/components/editor/design-page/SceneItemsLayer";

type CanvasProps = ComponentProps<typeof DesignSceneCanvas>;
type StructureProps = ComponentProps<typeof DesignSceneStructureLayer>;
type GuidanceProps = ComponentProps<typeof DesignSceneGuidanceLayer>;
type ItemsProps = ComponentProps<typeof SceneItemsLayer>;
type PreviewProps = ComponentProps<typeof DesignScenePreviewLayer>;
type ViewportProps = ComponentProps<typeof DesignPageViewportOverlayLayer>;

export type DesignPageSceneRegionState = {
  canvas: CanvasProps["state"];
  structure: StructureProps["state"];
  guidance: GuidanceProps["state"];
  items: ItemsProps["state"];
  preview: PreviewProps["state"];
  viewport: ViewportProps["state"];
};

export type DesignPageSceneRegionConfiguration = {
  canvas: CanvasProps["configuration"];
  structure: StructureProps["configuration"];
  guidance: GuidanceProps["configuration"];
  items: ItemsProps["configuration"];
  preview: PreviewProps["configuration"];
  viewport: ViewportProps["configuration"];
};

export type DesignPageSceneRegionReferences = {
  canvas: CanvasProps["sceneRefs"];
  viewport: ViewportProps["references"];
};

export type DesignPageSceneRegionResolvers = {
  guidance: GuidanceProps["resolvers"];
  items: ItemsProps["resolvers"];
};

export type DesignPageSceneRegionActions = {
  shell: {
    onDragOver: DragEventHandler<HTMLDivElement>;
    onDrop: DragEventHandler<HTMLDivElement>;
    onDragLeave: DragEventHandler<HTMLDivElement>;
  };
  canvas: CanvasProps["actions"];
  structure: StructureProps["actions"];
  guidance: GuidanceProps["actions"];
  items: ItemsProps["actions"];
  preview: PreviewProps["actions"];
  viewport: ViewportProps["actions"];
};

export type DesignPageSceneRegionProps = {
  state: DesignPageSceneRegionState;
  configuration: DesignPageSceneRegionConfiguration;
  references: DesignPageSceneRegionReferences;
  resolvers: DesignPageSceneRegionResolvers;
  actions: DesignPageSceneRegionActions;
};

export function DesignPageSceneRegion({
  state,
  configuration,
  references,
  resolvers,
  actions,
}: DesignPageSceneRegionProps) {
  const [activeRoomFocusEnabled, setActiveRoomFocusEnabled] = useState(false);
  const lastAppliedFocusKeyRef = useRef<string | null>(null);
  const activeRoom = state.structure.wholeHome.rooms.find(
    (room) => room.id === state.structure.wholeHome.activeRoomId
  );
  const focusAvailable =
    state.canvas.viewMode === "3d" &&
    state.structure.wholeHome.enabled &&
    state.structure.wholeHome.rooms.length > 1 &&
    Boolean(activeRoom);
  const focusedRoomId =
    focusAvailable && activeRoomFocusEnabled ? activeRoom?.id ?? null : null;
  // Readiness is tracked for every item in the current design. Keep the full
  // scene mounted behind the loading veil so inactive-room models can report
  // ready before active-room focus removes them from the render tree.
  const renderFocusRoomId = state.canvas.showSceneLoadingVeil
    ? null
    : focusedRoomId;

  useEffect(() => {
    if (!focusedRoomId) {
      lastAppliedFocusKeyRef.current = null;
      return;
    }
    const focusKey = `${focusedRoomId}:${state.canvas.viewMode}`;
    if (lastAppliedFocusKeyRef.current === focusKey) return;
    lastAppliedFocusKeyRef.current = focusKey;
    actions.structure.rooms.fit(focusedRoomId);
  }, [actions.structure.rooms, focusedRoomId, state.canvas.viewMode]);

  const canvasConfiguration = useMemo(
    () => ({
      ...configuration.canvas,
      presentationBounds:
        focusedRoomId && activeRoom
          ? {
              widthMeters: activeRoom.w,
              depthMeters: activeRoom.d,
              centerX: activeRoom.x,
              centerZ: activeRoom.z,
            }
          : configuration.canvas.planBounds,
    }),
    [activeRoom, configuration.canvas, focusedRoomId]
  );

  return (
    <div
      className="relative h-full w-full"
      onDragOver={actions.shell.onDragOver}
      onDrop={actions.shell.onDrop}
      onDragLeave={actions.shell.onDragLeave}
    >
      <DesignSceneCanvas
        state={state.canvas}
        configuration={canvasConfiguration}
        sceneRefs={references.canvas}
        actions={actions.canvas}
      >
        <DesignSceneStructureLayer
          state={state.structure}
          configuration={configuration.structure}
          actions={actions.structure}
          focusRoomId={renderFocusRoomId}
        />
        <DesignSceneGuidanceLayer
          state={state.guidance}
          configuration={configuration.guidance}
          resolvers={resolvers.guidance}
          actions={actions.guidance}
        />
        <SceneItemsLayer
          state={state.items}
          configuration={configuration.items}
          resolvers={resolvers.items}
          actions={actions.items}
          focusRoomId={renderFocusRoomId}
        />
        <DesignScenePreviewLayer
          state={state.preview}
          configuration={configuration.preview}
          actions={actions.preview}
        />
      </DesignSceneCanvas>

      <DesignPageViewportOverlayLayer
        state={state.viewport}
        configuration={configuration.viewport}
        references={references.viewport}
        actions={actions.viewport}
      />

      {focusAvailable ? (
        <div
          data-testid="active-room-focus-toolbar"
          data-focus-enabled={activeRoomFocusEnabled ? "true" : "false"}
          className="pointer-events-auto absolute left-1/2 top-15 z-30 flex -translate-x-1/2 items-center gap-2 rounded-full border border-neutral-200 bg-white/95 px-2 py-1.5 text-xs text-neutral-700 shadow-md backdrop-blur"
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              activeRoomFocusEnabled ? "bg-emerald-500" : "bg-neutral-300"
            }`}
          />
          <span className="max-w-40 truncate font-medium">
            {activeRoomFocusEnabled
              ? `Focused: ${activeRoom?.name ?? "Active room"}`
              : "Entire home visible"}
          </span>
          <button
            type="button"
            data-testid="active-room-focus-toggle"
            aria-pressed={activeRoomFocusEnabled}
            className="rounded-full bg-neutral-900 px-3 py-1.5 font-semibold text-white hover:bg-neutral-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            onClick={() => {
              if (activeRoomFocusEnabled) {
                setActiveRoomFocusEnabled(false);
                window.requestAnimationFrame(() => {
                  actions.viewport.navigator.onResetView?.();
                });
                return;
              }
              lastAppliedFocusKeyRef.current = null;
              setActiveRoomFocusEnabled(true);
            }}
          >
            {activeRoomFocusEnabled ? "Show home" : "Focus room"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
