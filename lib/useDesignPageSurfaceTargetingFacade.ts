"use client";

import { useDesignPagePlacementTargetController } from "@/lib/useDesignPagePlacementTargetController";
import { useDesignPageSurfaceInspector } from "@/lib/useDesignPageSurfaceInspector";
import type { DesignPageSurfaceWorkspaceActions } from "@/lib/useDesignPageSurfaceWorkspaceFacade";

type PlacementTargetInput = Parameters<
  typeof useDesignPagePlacementTargetController
>[0];
type SurfaceInspectorInput = Parameters<typeof useDesignPageSurfaceInspector>[0];
type PlacementActions = PlacementTargetInput["actions"];
type InspectorActions = SurfaceInspectorInput["actions"];

export type UseDesignPageSurfaceTargetingFacadeInput = {
  state: {
    targeting: PlacementTargetInput["state"];
    inspector: SurfaceInspectorInput["state"];
  };
  configuration: {
    targeting: PlacementTargetInput["configuration"];
    inspector: SurfaceInspectorInput["configuration"];
  };
  refs: PlacementTargetInput["refs"];
  actions: {
    targetPendingCatalogPlacementToRoom: PlacementActions["placement"]["targetPendingCatalogPlacementToRoom"];
    clearNonRoomSelection: PlacementActions["selection"]["clearNonRoomSelection"];
    setSelectedPlanRoomId: PlacementActions["selection"]["setSelectedPlanRoomId"];
    setSelectedPlanRoomSelection: PlacementActions["selection"]["setSelectedPlanRoomSelection"];
    setSelectedRendererSurfaceTarget: PlacementActions["selection"]["setSelectedRendererSurfaceTarget"];
    setSelectedWallSurfaceTarget: PlacementActions["selection"]["setSelectedWallSurfaceTarget"];
    preserveCameraAfterPlanOverlaySelection: PlacementActions["navigation"]["preserveCameraAfterPlanOverlaySelection"];
    resetFloorPlanTraceRoomPoints: PlacementActions["navigation"]["resetFloorPlanTraceRoomPoints"];
    switchRoom: PlacementActions["navigation"]["switchRoom"];
    setEditorMode: PlacementActions["navigation"]["setEditorMode"];
    setActiveSurfaceTarget: PlacementActions["surface"]["setActiveSurfaceTarget"];
    surfaceWorkspace: DesignPageSurfaceWorkspaceActions;
    track: PlacementActions["telemetry"]["track"];
    inspectorUi: InspectorActions["inspectorUi"];
    changeSelectedWallHeight: InspectorActions["changeSelectedWallHeight"];
    resetSelectedWallHeight: InspectorActions["resetSelectedWallHeight"];
  };
};

/** Joins late surface targeting and inspector bindings after catalog placement. */
export function useDesignPageSurfaceTargetingFacade({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageSurfaceTargetingFacadeInput) {
  const surfaceWorkspace = actions.surfaceWorkspace;
  const targetingController = useDesignPagePlacementTargetController({
    state: state.targeting,
    configuration: configuration.targeting,
    refs,
    actions: {
      placement: {
        targetPendingCatalogPlacementToRoom:
          actions.targetPendingCatalogPlacementToRoom,
      },
      selection: {
        clearNonRoomSelection: actions.clearNonRoomSelection,
        setSelectedPlanRoomId: actions.setSelectedPlanRoomId,
        setSelectedPlanRoomSelection: actions.setSelectedPlanRoomSelection,
        setSelectedRendererSurfaceTarget:
          actions.setSelectedRendererSurfaceTarget,
        setSelectedWallSurfaceTarget: actions.setSelectedWallSurfaceTarget,
      },
      navigation: {
        preserveCameraAfterPlanOverlaySelection:
          actions.preserveCameraAfterPlanOverlaySelection,
        resetFloorPlanTraceRoomPoints: actions.resetFloorPlanTraceRoomPoints,
        switchRoom: actions.switchRoom,
        setEditorMode: actions.setEditorMode,
      },
      surface: {
        setActiveSurfaceTarget: actions.setActiveSurfaceTarget,
        applyFloorMaterialToRoom: surfaceWorkspace.applyFloorMaterialToRoom,
        applyCeilingPaintToRoom: surfaceWorkspace.applyCeilingPaintToRoom,
        applyWallPaintToRoom: surfaceWorkspace.applyWallPaintToRoom,
        applyWallMaterialToRoom: surfaceWorkspace.applyWallMaterialToRoom,
      },
      telemetry: { track: actions.track },
    },
  });
  const inspectorController = useDesignPageSurfaceInspector({
    state: state.inspector,
    configuration: configuration.inspector,
    actions: {
      surface: surfaceWorkspace,
      inspectorUi: actions.inspectorUi,
      changeSelectedWallHeight: actions.changeSelectedWallHeight,
      resetSelectedWallHeight: actions.resetSelectedWallHeight,
      openFloorEditorForRoom: surfaceWorkspace.openFloorEditorForRoom,
      openWallMaterialEditorForRoom:
        surfaceWorkspace.openWallMaterialEditorForRoom,
      openCeilingEditorForRoom: surfaceWorkspace.openCeilingEditorForRoom,
    },
  });

  return {
    state: { surfaceInspector: inspectorController.state },
    actions: {
      ...targetingController.actions,
      surfaceInspector: inspectorController.actions,
    },
  };
}
