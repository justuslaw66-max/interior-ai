"use client";

import { useEffect, useRef, useState } from "react";

import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import { useDesignPageBetaStartController } from "@/lib/useDesignPageBetaStartController";
import { useDesignPageDocumentRoomRegistration } from "@/lib/useDesignPageDocumentRoomRegistration";
import { useDesignPageHistoryShortcuts } from "@/lib/useDesignPageDocumentHistoryController";
import { useDesignPageItemDocumentController } from "@/lib/useDesignPageItemDocumentController";
import { useDesignPageItemSelectionController } from "@/lib/useDesignPageItemSelectionController";
import { useDesignPageLateBoundRef } from "@/lib/useDesignPageLateBoundRef";
import { useDesignPageSceneRoomReadRegistration } from "@/lib/useDesignPageSceneRoomReadRegistration";
import { useDesignPageShoppingCatalogRuntime } from "@/lib/useDesignPageShoppingCatalogRuntime";

export type UseDesignPageDocumentSelectionRegistrationFacadeInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
  };
};

/**
 * Registers the document and item lifecycle after the core shell establishes
 * route, viewport, snapshot, and live-catalog state. Existing controllers stay
 * as the behavior owners and no editor state is copied into a broad context.
 */
export function useDesignPageDocumentSelectionRegistrationFacade({
  boundaries: { coreShell },
}: UseDesignPageDocumentSelectionRegistrationFacadeInput) {
  const {
    boundaries: { base, viewportShell, snapshotDocument },
    state: {
      placement: { pendingAiLayoutProposal },
    },
    derived: {
      access: { isClientPreview, isDesigner, liveCatalogReady, canEdit },
    },
    actions: {
      feedback: { showRuleToast },
    },
    refs: { itemsRef, resetSelectionStateRef },
  } = coreShell;
  const {
    boundaries: { planViewport, editorShell },
  } = viewportShell;

  const documentRoom = useDesignPageDocumentRoomRegistration({
    boundaries: {
      plan: planViewport.boundaries.planDocument,
      floorPlan: planViewport.boundaries.floorPlanDocument,
      snapshot: snapshotDocument,
    },
    state: {
      editor: {
        viewMode: base.state.editor.viewMode,
        editorMode: editorShell.state.editor.editorMode,
        designControlsPanelVisible:
          editorShell.state.panel.designControlsPanelVisible,
      },
      plan: {
        focusPanelRevealed: base.state.panels.planFocusPanelRevealed,
        floorPlanCalibrationMode:
          planViewport.state.floorPlan.floorPlanCalibrationMode,
        floorPlanTraceRoomMode:
          planViewport.state.floorPlan.floorPlanTraceRoomMode,
        floorPlanTraceOpeningMode:
          planViewport.state.floorPlan.floorPlanTraceOpeningMode,
      },
    },
    configuration: { isDesigner, isClientPreview },
    refs: {
      actionAdaptersRef: planViewport.refs.camera.floorActionAdapters,
      cameraViewRef: planViewport.refs.camera.cameraView,
      floorCameraViewsRef: planViewport.refs.camera.floorCameraViews,
    },
    actions: {
      history: {
        bumpHistoryRevision: base.actions.editor.bumpHistoryRevision,
      },
      plan: {
        setFocusPanelRevealed:
          base.actions.panels.setPlanFocusPanelRevealed,
        setSelectedPlanRoomId:
          planViewport.actions.overlaySelection.setSelectedPlanRoomId,
      },
      feedback: { showToast: showRuleToast },
    },
  });

  const sceneRoomRead = useDesignPageSceneRoomReadRegistration({
    boundaries: { documentRoom },
    state: {
      plan: {
        selectedPlanRoomId:
          planViewport.state.overlaySelection.selectedPlanRoomId,
      },
      editor: {
        viewMode: base.state.editor.viewMode,
        activeSurfaceTarget: editorShell.state.surface.activeSurfaceTarget,
        surfaceBrushActive: editorShell.state.surface.surfaceBrushActive,
      },
      ai: { pendingProposal: pendingAiLayoutProposal },
      surface: {
        activeSurfaceTarget: editorShell.state.surface.activeSurfaceTarget,
        selectedWallSurfaceTarget:
          editorShell.state.surface.selectedWallSurfaceTarget,
      },
    },
    configuration: { isClientPreview, isDesigner },
    actions: {
      scene: {
        setSelectedPlanRoomId:
          planViewport.actions.overlaySelection.setSelectedPlanRoomId,
        showToast: showRuleToast,
      },
      room: {
        setDesignPanelOpen: base.actions.panels.setDesignPanelOpen,
        setEditorMode: editorShell.actions.editor.setEditorMode,
        setShoppingReadinessFilter:
          editorShell.actions.shopping.setShoppingReadinessFilter,
        goPlan: editorShell.actions.panel.goPlan,
        goFurnish: editorShell.actions.panel.goFurnish,
        goShop: editorShell.actions.panel.goShop,
        showToast: showRuleToast,
      },
    },
  });

  const zonesRef = useRef(documentRoom.derived.room.zones);
  const betaStart = useDesignPageBetaStartController({
    state: {
      isClientPreview,
      planRoomCount: documentRoom.derived.plan.housePlan2D.rooms.length,
      itemCount: documentRoom.derived.room.items.length,
    },
    actions: {
      setGuidedPlanStartMode:
        editorShell.actions.editor.setGuidedPlanStartMode,
      goPlan: editorShell.actions.panel.goPlan,
      goAiDesign: editorShell.actions.panel.goAiDesign,
      setViewMode: base.actions.editor.setViewMode,
      setDesignPanelOpen: base.actions.panels.setDesignPanelOpen,
      activateFloorPlanRoomTrace:
        planViewport.actions.floorPlan.activateFloorPlanRoomTrace,
      showToast: showRuleToast,
    },
  });

  useEffect(() => {
    zonesRef.current = documentRoom.derived.room.zones;
  }, [documentRoom.derived.room.zones]);

  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const itemSelection = useDesignPageItemSelectionController({
    state: {
      items: documentRoom.derived.room.items,
      editorMode: editorShell.state.editor.editorMode,
      selectedZoneId,
    },
    actions: {
      setEditorMode: editorShell.actions.editor.setEditorMode,
      setSelectedZoneId,
    },
  });
  useDesignPageLateBoundRef(
    resetSelectionStateRef,
    itemSelection.actions.resetSelectionState
  );

  const itemDocument = useDesignPageItemDocumentController({
    state: { activeItems: documentRoom.derived.room.items },
    configuration: {
      roomWidth: documentRoom.derived.room.roomWidth,
      roomDepth: documentRoom.derived.room.roomDepth,
      wallThickness: documentRoom.derived.room.wallThickness,
      clampToActiveRoom: documentRoom.actions.room.clampToActiveRoom,
    },
    refs: {
      designSnapshot: snapshotDocument.refs.designSnapshotRef,
      activeItems: itemsRef,
    },
    actions: {
      setDesignSnapshot: snapshotDocument.actions.setDesignSnapshot,
      updateSelection: itemSelection.actions.updateSelection,
      history: documentRoom.refs.documentHistory.history,
    },
  });

  const shopping = useDesignPageShoppingCatalogRuntime({
    actions: {
      document: { commitItems: itemDocument.actions.commitItems },
      shopping: {
        setReadinessFilter:
          editorShell.actions.shopping.setShoppingReadinessFilter,
        goShop: editorShell.actions.panel.goShop,
      },
      feedback: { showToast: showRuleToast },
    },
  });

  const historyShortcuts = useDesignPageHistoryShortcuts({
    state: { isClientPreview },
    actions: {
      flushCoalescedHistoryTransaction:
        documentRoom.actions.history.flushCoalescedHistoryTransaction,
    },
    refs: { history: documentRoom.refs.documentHistory.history },
  });

  return {
    boundaries: {
      coreShell,
      snapshotDocument,
      documentRoom,
      sceneRoomRead,
      itemSelection,
      itemDocument,
    },
    state: {
      catalog: { liveCatalogReady },
      betaStart: betaStart.state,
      selectedZoneId,
      history: historyShortcuts.state,
    },
    derived: {
      access: { canEdit },
      document: documentRoom.derived,
      sceneRoom: sceneRoomRead.derived,
      selection: {
        selectedItem: itemSelection.state.selectedItem,
        selectedInstanceId: itemSelection.state.selectedInstanceId,
      },
    },
    configuration: { access: { isClientPreview, isDesigner } },
    refs: { zones: zonesRef },
    actions: {
      betaStart: betaStart.actions,
      setSelectedZoneId,
      shopping: shopping.actions,
      history: historyShortcuts.actions,
    },
  };
}

export type DesignPageDocumentSelectionRegistrationFacade = ReturnType<
  typeof useDesignPageDocumentSelectionRegistrationFacade
>;
