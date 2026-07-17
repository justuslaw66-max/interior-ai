"use client";

import { useEffect } from "react";

import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  DEFAULT_EDITOR_CAMERA_VIEW,
  EDITOR_3D_MAX_POLAR_ANGLE,
  EDITOR_3D_MIN_POLAR_ANGLE,
} from "@/lib/design-page-editor-configuration";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import type { DesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";
import { useDesignPageCameraWorkspaceFacade } from "@/lib/useDesignPageCameraWorkspaceFacade";
import {
  useDesignPagePlanTracingFacade,
} from "@/lib/useDesignPagePlanWorkspaceFacade";
import { useDesignPagePresentationStateRegistration } from "@/lib/useDesignPagePresentationStateRegistration";
import {
  useDesignPageZoneController,
} from "@/lib/useDesignPageZoneController";

export type UseDesignPageEditorInteractionRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
    planAuthoring: DesignPagePlanAuthoringRegistration;
  };
};

/**
 * Registers camera/canvas interaction, plan tracing, saved presentation state,
 * zones, and the scene-to-camera synchronization effect in lifecycle order.
 */
export function useDesignPageEditorInteractionRegistration({
  boundaries: { coreShell, documentSelection, planAuthoring },
}: UseDesignPageEditorInteractionRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const planViewport = viewportShell.boundaries.planViewport;
  const editorShell = viewportShell.boundaries.editorShell;
  const {
    documentRoom,
    sceneRoomRead: sceneRoom,
    itemSelection,
    itemDocument,
  } = documentSelection.boundaries;
  const { cameraBridge } = planViewport.boundaries;
  const snapshotDocument = documentSelection.boundaries.snapshotDocument;
  const history = documentRoom.boundaries.history.refs.history;
  const { items, zones, roomWidth, roomDepth, roomHeight, wallThickness } =
    documentRoom.derived.room;
  const { housePlan2D, planViewWidth, planViewDepth } =
    documentRoom.derived.plan;
  const selectionInspection =
    planAuthoring.boundaries.selectionInspection;
  const planWorkspace = planAuthoring.boundaries.planWorkspace;
  const { updateCameraViewFromScene } = cameraBridge.actions.navigation;
  const { designId } = base.state.identity;
  const { viewMode, showGrid, snapEnabled } = base.state.editor;
  const { isDesigner, isClientPreview } = coreShell.derived.access;
  const { selectedZoneId } = documentSelection.state;
  const { setViewMode } = base.actions.editor;
  const { showRuleToast } = coreShell.actions.feedback;

  const camera = useDesignPageCameraWorkspaceFacade({
    state: {
      cameraView: planViewport.state.camera.cameraView,
      navigation: {
        viewMode,
        sceneReady: sceneRoom.state.scene.sceneReady,
        hasWholeHousePlan: sceneRoom.derived.scene.hasWholeHousePlan,
        designRoomCount: snapshotDocument.state.designSnapshot.rooms.length,
        rooms: housePlan2D.rooms,
        items,
        selectedItem: itemSelection.state.selectedItem ?? null,
        selectedProduct:
          selectionInspection.derived.selectedProduct ?? null,
      },
      canvas: {
        showGrid,
        snapEnabled,
        isDesigner,
      },
    },
    configuration: {
      navigation: {
        defaultCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
        designId,
        viewportSize: planViewport.state.diagnostics.viewportSize,
        planFitBounds: planWorkspace.derived.plan2DFitBounds,
        planSafeAreaLeftPx: planWorkspace.derived.plan2DSafeAreaLeftPx,
        planSafeAreaRightPx: planWorkspace.derived.plan2DSafeAreaRightPx,
        planSafeAreaBottomPx: planWorkspace.derived.plan2DSafeAreaBottomPx,
        floatingPlanOverlayStackVisible:
          planWorkspace.derived.floatingPlanOverlayStackVisible,
        floatingPlanOverlayStackWidthPx:
          planAuthoring.configuration.floatingOverlayStackWidthPx,
        roomHeight,
        planViewWidth,
        planViewDepth,
        min3DPolarAngle: EDITOR_3D_MIN_POLAR_ANGLE,
        max3DPolarAngle: EDITOR_3D_MAX_POLAR_ANGLE,
      },
    },
    refs: cameraBridge.refs,
    actions: {
      camera: cameraBridge.actions,
      navigation: {
        setViewMode,
        resetFloorPlanInteraction:
          planViewport.actions.floorPlan.resetFloorPlanInteraction,
        showRuleToast,
        switchRoom: planWorkspace.actions.room.switchRoom,
      },
      canvas: { history },
    },
  });

  const tracing = useDesignPagePlanTracingFacade(
    planWorkspace.configuration.tracing
  );

  const presentationState = useDesignPagePresentationStateRegistration({
    state: { cameraView: planViewport.state.camera.cameraView },
    refs: { designSnapshot: snapshotDocument.refs.designSnapshotRef },
    actions: {
      document: { setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot },
      camera: {
        setLegacySavedViews: cameraBridge.actions.setSavedViews,
        handleEditorViewModeChange:
          camera.actions.navigation.handleEditorViewModeChange,
        transitionToCameraView:
          cameraBridge.actions.navigation.transitionToCameraView,
      },
      history: { history },
      selection: { updateSelection: itemSelection.actions.updateSelection },
      feedback: { showToast: showRuleToast },
    },
  });

  const zone = useDesignPageZoneController({
    state: { items, zones, selectedZoneId },
    configuration: {
      editorMode: editorShell.state.editor.editorMode,
      isClientPreview,
      isDesigner,
      catalogItems: CATALOG_ITEMS,
      roomWidth,
      roomDepth,
      wallThickness,
    },
    refs: {
      selectedIds: itemSelection.refs.selectedIds,
      items: itemDocument.refs.activeItems,
      zones: documentSelection.refs.zones,
      seatingZoneAutoDisabled: coreShell.refs.seatingZoneAutoDisabledRef,
    },
    actions: {
      setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
      setSelectedZoneId: documentSelection.actions.setSelectedZoneId,
      clearSelection: itemSelection.actions.clearSelection,
      commitItems: itemDocument.actions.commitItems,
      history,
      clampToRoom: documentRoom.actions.room.clampToActiveRoom,
      getSelectionBounds:
        selectionInspection.actions.geometry.getSelectionBounds,
      getItemAABB: selectionInspection.actions.geometry.getItemAABB,
    },
  });

  useEffect(() => {
    if (!sceneRoom.state.scene.sceneReady) return;
    const timer = window.setTimeout(() => {
      updateCameraViewFromScene();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [
    sceneRoom.state.scene.sceneReady,
    updateCameraViewFromScene,
  ]);

  return {
    boundaries: { camera, tracing, presentationState, zone },
  };
}

export type DesignPageEditorInteractionRegistration = ReturnType<
  typeof useDesignPageEditorInteractionRegistration
>;
