"use client";

import {
  useCallback,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import {
  resolveDesignPageSurfaceBrushAction,
  resolvePlacementAwareRoomSelectionDecision,
} from "@/lib/design-page-placement-target-policy";
import type { CatalogPlacementRoomTargetOptions } from "@/lib/catalog-placement-policy";
import type { CatalogPlacementTargetResult } from "@/lib/useDesignPageCatalogPlacement";
import type { DesignSnapshot } from "@/lib/room-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import type {
  DesignPageSurfaceActions,
  RendererSurfaceTarget,
  SelectedWallSurfaceTarget,
  SurfaceBrushPaint,
  SurfaceTargetMode,
} from "@/lib/useDesignPageSurfaceActions";

type TargetPendingCatalogPlacementToRoom = (
  roomId: string,
  options: CatalogPlacementRoomTargetOptions
) => CatalogPlacementTargetResult | null;

type TrackDesignPagePlacementTarget = (
  event: string,
  properties?: object
) => void;

export type UseDesignPagePlacementTargetControllerInput = {
  state: {
    editorMode: DesignPageEditorMode;
    surfaceBrush: {
      active: boolean;
      materialId: string | null;
      paint: SurfaceBrushPaint | null;
    };
  };
  configuration: {
    canApplySurfaceBrush: boolean;
  };
  refs: {
    designSnapshot: MutableRefObject<DesignSnapshot>;
  };
  actions: {
    placement: {
      targetPendingCatalogPlacementToRoom: TargetPendingCatalogPlacementToRoom;
    };
    selection: {
      clearNonRoomSelection: () => void;
      setSelectedPlanRoomId: Dispatch<SetStateAction<string | null>>;
      setSelectedRendererSurfaceTarget: Dispatch<
        SetStateAction<RendererSurfaceTarget | null>
      >;
      setSelectedWallSurfaceTarget: Dispatch<
        SetStateAction<SelectedWallSurfaceTarget | null>
      >;
    };
    navigation: {
      preserveCameraAfterPlanOverlaySelection: () => void;
      resetFloorPlanTraceRoomPoints: () => void;
      switchRoom: (roomId: string) => void;
      setEditorMode: Dispatch<SetStateAction<DesignPageEditorMode>>;
    };
    surface: Pick<
      DesignPageSurfaceActions,
      | "applyFloorMaterialToRoom"
      | "applyCeilingPaintToRoom"
      | "applyWallPaintToRoom"
      | "applyWallMaterialToRoom"
    > & {
      setActiveSurfaceTarget: Dispatch<SetStateAction<SurfaceTargetMode>>;
    };
    telemetry: {
      track: TrackDesignPagePlacementTarget;
    };
  };
};

export function useDesignPagePlacementTargetController({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPagePlacementTargetControllerInput) {
  const { editorMode, surfaceBrush } = state;
  const {
    active: surfaceBrushActive,
    materialId: surfaceBrushMaterialId,
    paint: surfaceBrushPaint,
  } = surfaceBrush;
  const { canApplySurfaceBrush } = configuration;
  const { designSnapshot: designSnapshotRef } = refs;
  const {
    placement: {
      targetPendingCatalogPlacementToRoom:
        targetPendingCatalogPlacementToRoomAction,
    },
    selection: {
      clearNonRoomSelection,
      setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget,
    },
    navigation: {
      preserveCameraAfterPlanOverlaySelection,
      resetFloorPlanTraceRoomPoints: handleResetFloorPlanTraceRoomPoints,
      switchRoom: handleSwitchRoom,
      setEditorMode,
    },
    surface: {
      setActiveSurfaceTarget,
      applyFloorMaterialToRoom: handleApplyFloorMaterialToRoom,
      applyCeilingPaintToRoom: handleApplyCeilingPaintToRoom,
      applyWallPaintToRoom: handleApplyWallPaintToRoom,
      applyWallMaterialToRoom: handleApplyWallMaterialToRoom,
    },
    telemetry: { track },
  } = actions;

  const targetPendingCatalogPlacementToRoom = useCallback(
    (roomId: string, options: CatalogPlacementRoomTargetOptions) => {
      const result = targetPendingCatalogPlacementToRoomAction(
        roomId,
        options
      );
      if (!result) return false;
      return result.handled;
    },
    [targetPendingCatalogPlacementToRoomAction]
  );

  const handlePlacementAwareRoomSelect = useCallback(
    (roomId: string) => {
      preserveCameraAfterPlanOverlaySelection();
      handleResetFloorPlanTraceRoomPoints();

      const pendingPlacementHandled =
        targetPendingCatalogPlacementToRoom(roomId, { source: "room" });
      const decision = resolvePlacementAwareRoomSelectionDecision({
        pendingPlacementHandled,
        editorMode,
        activeRoomId: designSnapshotRef.current.activeRoomId,
        targetRoomId: roomId,
      });

      clearNonRoomSelection();
      setSelectedPlanRoomId(roomId);
      if (decision.shouldSetDesignMode) setEditorMode("design");
      if (decision.shouldSwitchRoom) handleSwitchRoom(roomId);
    },
    [
      clearNonRoomSelection,
      designSnapshotRef,
      editorMode,
      handleResetFloorPlanTraceRoomPoints,
      handleSwitchRoom,
      preserveCameraAfterPlanOverlaySelection,
      setEditorMode,
      setSelectedPlanRoomId,
      targetPendingCatalogPlacementToRoom,
    ]
  );

  const handleRendererSurfaceTargetSelect = useCallback(
    (target: RendererSurfaceTarget) => {
      preserveCameraAfterPlanOverlaySelection();
      handleResetFloorPlanTraceRoomPoints();

      const pendingPlacementHandled =
        targetPendingCatalogPlacementToRoom(target.roomId, {
          source: "room",
        });
      const decision = resolvePlacementAwareRoomSelectionDecision({
        pendingPlacementHandled,
        editorMode,
        activeRoomId: designSnapshotRef.current.activeRoomId,
        targetRoomId: target.roomId,
      });

      clearNonRoomSelection();
      setSelectedPlanRoomId(target.roomId);
      if (pendingPlacementHandled) {
        if (decision.shouldSetDesignMode) setEditorMode("design");
        return;
      }

      setSelectedRendererSurfaceTarget(target);
      if (decision.shouldSetDesignMode) setEditorMode("design");
      if (decision.shouldSwitchRoom) handleSwitchRoom(target.roomId);
      const brushAction = resolveDesignPageSurfaceBrushAction({
        target,
        active: surfaceBrushActive,
        canApply: canApplySurfaceBrush,
        materialId: surfaceBrushMaterialId,
        paint: surfaceBrushPaint,
      });

      if (target.kind === "floor") {
        setActiveSurfaceTarget("floor");
        setSelectedWallSurfaceTarget(null);
        if (brushAction?.kind === "floor_material") {
          handleApplyFloorMaterialToRoom(
            brushAction.materialId,
            target.roomId
          );
        }
        track("surface_scene_target_selected", {
          target: "floor",
          roomId: target.roomId,
          brush: surfaceBrushActive,
        });
        return;
      }

      if (target.kind === "ceiling") {
        setActiveSurfaceTarget("ceiling");
        setSelectedWallSurfaceTarget(null);
        if (brushAction?.kind === "ceiling_paint") {
          handleApplyCeilingPaintToRoom(
            brushAction.paint.colorHex,
            brushAction.paint.name,
            target.roomId
          );
        }
        track("surface_scene_target_selected", {
          target: "ceiling",
          roomId: target.roomId,
          brush: surfaceBrushActive,
        });
        return;
      }

      setSelectedWallSurfaceTarget({
        roomId: target.roomId,
        faceId: target.id,
      });
      setActiveSurfaceTarget("selected_wall");
      if (brushAction?.kind === "wall_paint") {
        handleApplyWallPaintToRoom(
          brushAction.paint.colorHex,
          brushAction.paint.name,
          target.roomId,
          target.id
        );
      } else if (brushAction?.kind === "wall_material") {
        handleApplyWallMaterialToRoom(
          brushAction.materialId,
          target.roomId,
          target.id
        );
      }
      track("surface_scene_target_selected", {
        target: "selected_wall",
        roomId: target.roomId,
        faceId: target.id,
        brush: surfaceBrushActive,
      });
    },
    [
      canApplySurfaceBrush,
      clearNonRoomSelection,
      designSnapshotRef,
      editorMode,
      handleApplyCeilingPaintToRoom,
      handleApplyFloorMaterialToRoom,
      handleApplyWallMaterialToRoom,
      handleApplyWallPaintToRoom,
      handleResetFloorPlanTraceRoomPoints,
      handleSwitchRoom,
      preserveCameraAfterPlanOverlaySelection,
      setActiveSurfaceTarget,
      setEditorMode,
      setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget,
      surfaceBrushActive,
      surfaceBrushMaterialId,
      surfaceBrushPaint,
      targetPendingCatalogPlacementToRoom,
      track,
    ]
  );

  return {
    actions: {
      targetPendingCatalogPlacementToRoom,
      handlePlacementAwareRoomSelect,
      handleRendererSurfaceTargetSelect,
    },
  };
}
