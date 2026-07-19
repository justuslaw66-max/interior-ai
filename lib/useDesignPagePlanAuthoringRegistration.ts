"use client";

import { useEffect } from "react";

import { track } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH,
  PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX,
  PLAN_FLOATING_OVERLAY_STACK_GAP_PX,
  PLAN_FLOATING_OVERLAY_STACK_RIGHT_PX,
  PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
  SIMPLE_PLAN_LAYERS,
} from "@/lib/design-page-editor-configuration";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import {
  useDesignPageSelectionInspectionRuntime,
} from "@/lib/useDesignPageSelectionInspectionRuntime";
import { useDesignPageImportedWallEditingController } from "@/lib/useDesignPageImportedWallEditingController";
import {
  useDesignPagePlanWorkspaceRegistrationFacade,
} from "@/lib/useDesignPagePlanWorkspaceRegistrationFacade";
import {
  useDesignPageSurfaceWorkspaceFacade,
} from "@/lib/useDesignPageSurfaceWorkspaceFacade";
import { useDesignPagePlanUnderlayFacade } from "@/lib/useDesignPagePlanWorkspaceFacade";

export type UseDesignPagePlanAuthoringRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    documentSelection: DesignPageDocumentSelectionRegistrationFacade;
  };
};

/**
 * Registers selection/inspection, plan authoring, surfaces, and underlay in the
 * order required by their shared document and selection boundaries.
 */
export function useDesignPagePlanAuthoringRegistration({
  boundaries: { coreShell, documentSelection },
}: UseDesignPagePlanAuthoringRegistrationInput) {
  const base = coreShell.boundaries.base;
  const viewportShell = coreShell.boundaries.viewportShell;
  const planViewport = viewportShell.boundaries.planViewport;
  const editorShell = viewportShell.boundaries.editorShell;
  const importedModels = base.boundaries.importedModels;
  const {
    documentRoom,
    sceneRoomRead: sceneRoom,
    itemSelection,
    itemDocument,
  } = documentSelection.boundaries;
  const { planDocument, floorPlanDocument, cameraBridge } =
    planViewport.boundaries;
  const snapshotDocument = documentSelection.boundaries.snapshotDocument;
  const documentHistory = documentRoom.boundaries.history;
  const house = documentRoom.boundaries.house;
  const { editorMode, guidedPlanStartMode } = editorShell.state.editor;
  const { viewMode, lightingPreset } = base.state.editor;
  const {
    designPanelCollapsed,
    dismissedPlanCanvasGuidanceKey,
  } = base.state.panels;
  const { isClientPreview, isDesigner, showDesignerTheme, canEdit } =
    coreShell.derived.access;
  const { liveCatalogReady } = coreShell.derived.access;
  const { showRuleToast } = coreShell.actions.feedback;
  const { setViewMode } = base.actions.editor;
  const {
    setDesignPanelOpen,
    setDesignPanelCollapsed,
    setPlanFocusPanelRevealed,
  } = base.actions.panels;
  const { selectedZoneId } = documentSelection.state;
  const { visible: showBetaStart } = documentSelection.state.betaStart;
  const {
    selectedPlanRoomId,
    selectedPlanOverlayId,
    suppressedDoorwaySuggestionKeys,
  } = planViewport.state.overlaySelection;
  const {
    planSettingsLoaded,
    planOpeningsStorageState,
    planOpenings,
  } = planDocument.state;
  const { defaultPlanOpeningsSeededRef } = planDocument.refs;
  const { markDefaultPlanOpeningsSeeded, setPlanOpenings } =
    planDocument.actions;

  useEffect(() => {
    if (!planSettingsLoaded) return;
    if (defaultPlanOpeningsSeededRef.current) return;
    if (planOpeningsStorageState === "pending") return;
    if (
      planOpeningsStorageState !== "missing" ||
      planOpenings.length > 0
    ) {
      markDefaultPlanOpeningsSeeded();
      return;
    }
    markDefaultPlanOpeningsSeeded();
    setPlanOpenings([
      {
        id: "door-east-main",
        wall: "east",
        offsetMm: 0,
        widthMm: 900,
        kind: "door",
      },
      {
        id: "window-west-main",
        wall: "west",
        offsetMm: 0,
        widthMm: 1200,
        kind: "window",
      },
    ]);
  }, [
    defaultPlanOpeningsSeededRef,
    markDefaultPlanOpeningsSeeded,
    planOpenings.length,
    planOpeningsStorageState,
    planSettingsLoaded,
    setPlanOpenings,
  ]);

  const selectionInspection = useDesignPageSelectionInspectionRuntime({
    boundaries: {
      planViewport,
      editorShell,
      snapshotDocument,
      documentRoom,
      itemSelection,
      itemDocument,
      importedModels,
    },
    state: { isClientPreview, canEdit, liveCatalogReady },
    configuration: { catalogItems: CATALOG_ITEMS },
    refs: {
      localBackupPlanningResolver:
        coreShell.refs.localBackupPlanningResolverRef,
    },
    actions: {
      setSelectedZoneId: documentSelection.actions.setSelectedZoneId,
      showToast: showRuleToast,
    },
  });

  const importedWallEditing = useDesignPageImportedWallEditingController({
    state: {
      designSnapshot: snapshotDocument.state.designSnapshot,
      canEdit,
      isClientPreview,
      viewMode,
    },
    refs: { designSnapshot: snapshotDocument.refs.designSnapshotRef },
    actions: {
      setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
      setPlanOpenings: planDocument.actions.setPlanOpenings,
      setPlanFixedElements: planDocument.actions.setPlanFixedElements,
      runHistoryTransaction: documentHistory.actions.runHistoryTransaction,
      showToast: showRuleToast,
    },
  });

  const planWorkspace = useDesignPagePlanWorkspaceRegistrationFacade({
    boundaries: {
      document: planDocument,
      floorPlan: floorPlanDocument,
      snapshot: snapshotDocument,
      history: documentHistory,
      house,
      sceneRoom: sceneRoom.boundaries.sceneRoom,
      selection: {
        items: itemSelection,
        coordination: selectionInspection.boundaries.coordination,
      },
      inspection: selectionInspection.boundaries.inspection,
      cameraBridge,
    },
    state: {
      plan: {
        selectedPlanRoomId,
        suppressedDoorwaySuggestionKeys,
        selectedPlanOverlayId,
        canvasInteractionActive:
          documentRoom.derived.plan.activePlanCanvasInteraction,
        canvasFocusActive: documentRoom.derived.plan.planCanvasFocusActive,
        dismissedCanvasGuidanceKey: dismissedPlanCanvasGuidanceKey,
        selectedZoneId,
      },
      editor: {
        editorMode,
        isClientPreview,
        viewMode,
        isDesigner,
        simplePlanControls: planViewport.state.plan.simplePlanControls,
        showDesignerTheme,
        lightingPreset,
        guidedPlanStartMode,
        showBetaStart,
      },
      layout: {
        designControlsPanelVisible:
          documentRoom.derived.plan.designControlsPanelVisibleForLayout,
        designControlsPanelMode: editorShell.state.panel.designControlsPanelMode,
        shoppingPanelVisible:
          documentRoom.derived.plan.shoppingPanelVisibleForLayout,
        commercePanelVisible:
          documentRoom.derived.plan.commercePanelVisibleForLayout,
        designPanelCollapsed,
        floorCount: documentRoom.derived.floor.floorOptions.length,
        viewportWidth: planViewport.state.diagnostics.viewportSize.width,
      },
      export: { sceneReady: sceneRoom.state.scene.sceneReady },
    },
    configuration: {
      canEdit,
      catalogItems: CATALOG_ITEMS,
      qualityReviewPanel: {
        reviewPanelTopPx: 76,
        collapsedReviewPanelFallbackHeightPx: 56,
        expandedReviewPanelFallbackHeightPx: 252,
      },
      simplePlanLayers: SIMPLE_PLAN_LAYERS,
      floatingOverlayDesktopMinWidthPx:
        PLAN_FLOATING_OVERLAY_DESKTOP_MIN_WIDTH,
      floatingOverlayStackRightPx: PLAN_FLOATING_OVERLAY_STACK_RIGHT_PX,
      floatingOverlayInspectorStackTopPx:
        PLAN_FLOATING_OVERLAY_INSPECTOR_STACK_TOP_PX,
      floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
      floatingOverlayStackGapPx: PLAN_FLOATING_OVERLAY_STACK_GAP_PX,
    },
    actions: {
      selection: {
        setSelectedPlanOverlayId:
          planViewport.actions.overlaySelection.setSelectedPlanOverlayId,
      },
      room: {
        setSelectedPlanRoomId:
          planViewport.actions.overlaySelection.setSelectedPlanRoomId,
        renameRoom: documentRoom.actions.room.handleRenameRoom,
        handleAddRoom: documentRoom.actions.room.handleAddRoom,
      },
      navigation: {
        goPlan: editorShell.actions.panel.goPlan,
        goFurnish: editorShell.actions.panel.goFurnish,
        setViewMode,
        setTraceOpeningKind:
          planViewport.actions.floorPlan.setFloorPlanTraceOpeningKind,
        setDesignPanelOpen,
        setPlanFocusPanelRevealed,
      },
      feedback: { showToast: showRuleToast, track },
    },
  });

  const surfaceWorkspace = useDesignPageSurfaceWorkspaceFacade({
    state: {
      document: {
        activeRoomId: snapshotDocument.state.designSnapshot.activeRoomId,
      },
      selection: { selectedPlanRoomId },
      surface: {
        selectedWallSurfaceTarget:
          editorShell.state.surface.selectedWallSurfaceTarget,
        surfaceBrushPaint: editorShell.state.surface.surfaceBrushPaint,
      },
    },
    configuration: {
      isClientPreview,
      liveCatalogReady,
    },
    refs: { designSnapshot: snapshotDocument.refs.designSnapshotRef },
    actions: {
      document: {
        setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
        runHistoryTransaction: documentHistory.actions.runHistoryTransaction,
        runCoalescedHistoryTransaction:
          documentHistory.actions.runCoalescedHistoryTransaction,
      },
      selection: {
        clearNonRoomSelection:
          selectionInspection.actions.selection.clearNonRoomSelection,
        setSelectedPlanRoomId:
          planViewport.actions.overlaySelection.setSelectedPlanRoomId,
      },
      surfaceState: editorShell.actions.surface,
      navigation: {
        switchRoom: planWorkspace.actions.room.switchRoom,
        goPlan: editorShell.actions.panel.goPlan,
      },
      panels: {
        setDesignPanelOpen,
        setDesignPanelCollapsed,
        inspectorUi: sceneRoom.state.room.surfaceInspectorUiActions,
      },
      feedback: { showToast: showRuleToast, track },
    },
  });

  const underlay = useDesignPagePlanUnderlayFacade(
    planWorkspace.configuration.underlay
  );

  return {
    boundaries: {
      selectionInspection,
      planWorkspace,
      importedWallEditing,
      surfaceWorkspace,
      underlay,
    },
    configuration: {
      floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
    },
  };
}

export type DesignPagePlanAuthoringRegistration = ReturnType<
  typeof useDesignPagePlanAuthoringRegistration
>;
