"use client";

import { useCallback } from "react";

import { track } from "@/lib/analytics";
import { useDesignPageCatalogPlacementRegistrationFacade } from "@/lib/useDesignPageCatalogPlacementRegistrationFacade";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import type { DesignPageEditorInteractionRegistration } from "@/lib/useDesignPageEditorInteractionRegistration";
import type { DesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";
import { useDesignPageSurfaceTargetingFacade } from "@/lib/useDesignPageSurfaceTargetingFacade";

export type UseDesignPagePlacementWorkspaceRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    planAuthoring: DesignPagePlanAuthoringRegistration;
    editorInteraction: DesignPageEditorInteractionRegistration;
  };
};

/**
 * Owns catalog placement and placement-aware surface targeting. The adapter
 * keeps geometry, document, camera, and selection state with their established
 * feature owners while preserving the original hook order.
 */
export function useDesignPagePlacementWorkspaceRegistration({
  boundaries: {
    coreShell,
    documentSelection,
    planAuthoring,
    editorInteraction,
  },
}: UseDesignPagePlacementWorkspaceRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const { documentRoom, sceneRoomRead, itemSelection, itemDocument } =
    documentSelection.boundaries;
  const { selectionInspection, planWorkspace, surfaceWorkspace } =
    planAuthoring.boundaries;
  const { camera, tracing } = editorInteraction.boundaries;
  const { activeRoom, roomWidth, roomDepth, wallThickness } =
    documentRoom.derived.room;
  const scene = sceneRoomRead.derived.scene;
  const room = sceneRoomRead.state.room;
  const planInspector = planWorkspace.state.inspector;
  const editorMode = viewportShell.state.editor.editorMode;
  const designSnapshot = coreShell.state.document.designSnapshot;
  const { isClientPreview, isDesigner, canEdit } = coreShell.derived.access;
  const catalogPlacement = useDesignPageCatalogPlacementRegistrationFacade({
    state: { crossRoomDragTarget: coreShell.state.placement.crossRoomDragTarget },
    configuration: {
      activeRoom,
      activeRoomId: designSnapshot.activeRoomId,
      rooms: designSnapshot.rooms,
      roomSnapshotById: scene.roomSnapshotById,
      houseRoomById: scene.houseRoomById,
      planOpenings: viewportShell.state.plan.planOpenings,
      roomWidth,
      roomDepth,
      wallThickness,
      placementAddMode: base.state.editor.placementAddMode,
      hasWholeHousePlan: scene.hasWholeHousePlan,
      catalogCanvasDragDisabled:
        isClientPreview || editorMode === "present",
    },
    refs: {
      designSnapshot: coreShell.refs.designSnapshotRef,
      activeItems: coreShell.refs.itemsRef,
      dragCommit: camera.refs.canvas.itemDragCommit,
    },
    actions: {
      getActiveItems: itemDocument.queries.getActiveItems,
      getActiveRoomId: itemDocument.queries.getActiveRoomId,
      getRooms: itemDocument.queries.getRooms,
      getItemAABB: selectionInspection.actions.geometry.getItemAABB,
      getPlanningDimensions:
        selectionInspection.resolvers.resolveConfiguredPlanningDimsMm,
      commitItemsToRoom: itemDocument.actions.commitItemsToRoom,
      selectItems: itemDocument.actions.selectItemsInRoom,
      createInstanceId: itemDocument.actions.createInstanceId,
      showToast: coreShell.actions.feedback.showRuleToast,
      clampToActiveRoom: documentRoom.actions.room.clampToActiveRoom,
      resolveGroundPointFromClient:
        viewportShell.actions.camera.resolveGroundPointFromClient,
      findPlanRoomAtWorldPoint:
        sceneRoomRead.queries.scene.findPlanRoomAtWorldPoint,
      nudgeCameraForDrag:
        camera.actions.navigation.nudgeWholeHomeCameraForDrag,
      setCanvasObjectDragging:
        camera.actions.canvas.changeCatalogObjectDragging,
      setCrossRoomDragTarget:
        coreShell.actions.placement.setCrossRoomDragTarget,
      setDesignSnapshot: coreShell.actions.document.setDesignSnapshot,
      updateSelection: itemSelection.actions.updateSelection,
      history: documentRoom.refs.documentHistory.history,
    },
  });

  const targeting = useDesignPageSurfaceTargetingFacade({
    state: {
      targeting: {
        editorMode,
        surfaceBrush: {
          active: viewportShell.state.surface.surfaceBrushActive,
          materialId: viewportShell.state.surface.surfaceBrushMaterialId,
          paint: viewportShell.state.surface.surfaceBrushPaint,
        },
      },
      inspector: {
        context: room.surfaceInspectorContext,
        selectedPlanRoom: scene.selectedPlanRoomContext,
        hasSelectedItem: Boolean(itemSelection.state.selectedItem),
        hasVisiblePlanOpening: Boolean(planInspector.visiblePlanOpening),
        hasSelectedPlanFixedElement: Boolean(
          planInspector.selectedPlanFixedElement
        ),
        hasSelectedPlanAnnotation: Boolean(
          planInspector.selectedPlanAnnotation
        ),
        planMeasurementUnit: viewportShell.state.plan.planMeasurementUnit,
      },
    },
    configuration: {
      targeting: {
        canApplySurfaceBrush: surfaceWorkspace.derived.canApplySurfaceBrush,
      },
      inspector: {
        canEdit,
        canEditPlanGeometry: !isClientPreview,
        isDesigner,
      },
    },
    refs: { designSnapshot: coreShell.refs.designSnapshotRef },
    actions: {
      targetPendingCatalogPlacementToRoom:
        catalogPlacement.actions.targetPendingCatalogPlacementToRoom,
      clearNonRoomSelection:
        selectionInspection.actions.selection.clearNonRoomSelection,
      setSelectedPlanRoomId:
        viewportShell.actions.plan.setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget:
        viewportShell.actions.surface.setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget:
        viewportShell.actions.surface.setSelectedWallSurfaceTarget,
      preserveCameraAfterPlanOverlaySelection:
        viewportShell.actions.camera.preserveCameraAfterPlanOverlaySelection,
      resetFloorPlanTraceRoomPoints:
        tracing.actions.handleResetFloorPlanTraceRoomPoints,
      switchRoom: planWorkspace.actions.room.switchRoom,
      setEditorMode: viewportShell.actions.editor.setEditorMode,
      setActiveSurfaceTarget:
        viewportShell.actions.surface.setActiveSurfaceTarget,
      surfaceWorkspace: surfaceWorkspace.actions,
      track,
      inspectorUi: room.surfaceInspectorUiActions,
      changeSelectedWallHeight:
        selectionInspection.actions.roomGeometry.changeSelectedWallHeight,
      resetSelectedWallHeight:
        selectionInspection.actions.roomGeometry.resetSelectedWallHeight,
    },
  });

  const movePendingCatalogPlacementToBestRoomAction =
    catalogPlacement.actions.movePendingCatalogPlacementToBestRoom;
  const movePendingCatalogPlacementToBestRoom = useCallback(() => {
    movePendingCatalogPlacementToBestRoomAction();
  }, [movePendingCatalogPlacementToBestRoomAction]);

  return {
    boundaries: {
      catalogPlacement,
      roomQueries: catalogPlacement.boundaries.roomQueries,
      catalogPlacementController:
        catalogPlacement.boundaries.catalogPlacement,
      crossRoomTransfer: catalogPlacement.boundaries.crossRoomTransfer,
      targeting,
    },
    state: {
      pendingCatalogPlacement: catalogPlacement.state.pendingCatalogPlacement,
      hoverCatalogPlacement: catalogPlacement.state.hoverCatalogPlacement,
      surfaceInspector: targeting.state.surfaceInspector,
    },
    derived: {
      ...catalogPlacement.derived,
      canEditPlanGeometry: !isClientPreview,
    },
    configuration: {},
    refs: {},
    actions: {
      catalog: {
        ...catalogPlacement.actions,
        movePendingCatalogPlacementToBestRoom,
      },
      targeting: targeting.actions,
    },
  };
}

export type DesignPagePlacementWorkspaceRegistration = ReturnType<
  typeof useDesignPagePlacementWorkspaceRegistration
>;
