"use client";

import { useCallback } from "react";

import {
  resolveDesignLightingSettings,
  updateDesignLightingSettings,
} from "@/lib/design-lighting-settings";
import type {
  DesignLightingSettings,
  LightingPreset,
} from "@/lib/lightingPresets";
import type { DesignPageAiWorkspaceRegistration } from "@/lib/useDesignPageAiWorkspaceRegistration";
import type { DesignPageCommerceOnboardingRegistration } from "@/lib/useDesignPageCommerceOnboardingRegistration";
import type { useDesignPageWorkspaceDeferredPaywallRegistration } from "@/lib/useDesignPagePaywallRegistrationFacade";
import type { DesignPagePresentationBackupRegistrationFacade } from "@/lib/useDesignPagePresentationBackupRegistrationFacade";
import {
  useDesignPagePresentationQaFacade,
  type DesignPagePresentationQaFacade,
} from "@/lib/useDesignPagePresentationQaFacade";
import type { DesignPageSelectionWorkspaceRegistration } from "@/lib/useDesignPageSelectionWorkspaceRegistration";

type DeferredPaywallRegistration = ReturnType<
  typeof useDesignPageWorkspaceDeferredPaywallRegistration
>;

export type UseDesignPagePresentationWorkspaceRegistrationInput = {
  boundaries: {
    aiWorkspace: DesignPageAiWorkspaceRegistration;
    commerceOnboarding: DesignPageCommerceOnboardingRegistration;
    selection: DesignPageSelectionWorkspaceRegistration;
    presentationBackup: DesignPagePresentationBackupRegistrationFacade;
    deferredPaywall: DeferredPaywallRegistration;
  };
};

/**
 * Adapts the established workspace registrations to the presentation and QA
 * facade. This module owns composition only: state and side effects remain in
 * their domain controllers, avoiding a broad presentation context.
 */
export function useDesignPagePresentationWorkspaceRegistration({
  boundaries: {
    aiWorkspace,
    commerceOnboarding,
    selection,
    presentationBackup,
    deferredPaywall,
  },
}: UseDesignPagePresentationWorkspaceRegistrationInput) {
  const {
    coreShell,
    documentSelection,
    planAuthoring,
    editorInteraction,
    persistence,
  } = aiWorkspace.boundaries;
  const { base, viewportShell } = coreShell.boundaries;
  const { documentRoom, sceneRoomRead, itemSelection } =
    documentSelection.boundaries;
  const { planWorkspace, selectionInspection } = planAuthoring.boundaries;
  const { camera, presentationState, tracing } =
    editorInteraction.boundaries;
  const placement = selection.boundaries.placement;
  const cabinetry = selection.boundaries.cabinetry;
  const aiPanel = aiWorkspace.boundaries.aiPanel;
  const lightingSettings = resolveDesignLightingSettings(
    coreShell.state.document.designSnapshot
  );
  const updateLightingSettings = useCallback(
    (
      patch: Partial<DesignLightingSettings>,
      transactionName: string
    ) => {
      documentRoom.actions.history.runHistoryTransaction(
        transactionName,
        () => {
          coreShell.actions.document.setDesignSnapshot((snapshot) =>
            updateDesignLightingSettings(snapshot, patch)
          );
        }
      );
    },
    [
      coreShell.actions.document,
      documentRoom.actions.history,
    ]
  );
  const changeLightingPreset = useCallback(
    (preset: LightingPreset) => {
      updateLightingSettings({ preset }, "Change lighting preset");
    },
    [updateLightingSettings]
  );
  const changeShadowsEnabled = useCallback(
    (shadowsEnabled: boolean) => {
      updateLightingSettings({ shadowsEnabled }, "Toggle scene shadows");
    },
    [updateLightingSettings]
  );

  const presentationQa = useDesignPagePresentationQaFacade({
    state: {
      identity: {
        designId: base.state.identity.designId,
        shareToken: base.state.identity.shareToken,
      },
      editor: {
        mode: base.state.brief.mode,
        viewMode: base.state.editor.viewMode,
        editorMode: viewportShell.state.editor.editorMode,
        isClientPreview: coreShell.derived.access.isClientPreview,
        isDesigner: coreShell.derived.access.isDesigner,
        authenticated: Boolean(base.state.identity.session?.user),
        plan: base.state.access.plan,
        aiDesignEnabled: viewportShell.derived.aiDesignEnabled,
        canUndo: documentSelection.state.history.canUndo,
        canRedo: documentSelection.state.history.canRedo,
        undoName: documentSelection.state.history.undoName,
        redoName: documentSelection.state.history.redoName,
      },
      document: {
        snapshot: coreShell.state.document.designSnapshot,
        activeRoom: documentRoom.derived.room.activeRoom ?? null,
        activeRoomItemCount: documentRoom.derived.room.items.length,
        roomWidth: documentRoom.derived.room.roomWidth,
        roomDepth: documentRoom.derived.room.roomDepth,
        zones: documentRoom.derived.room.zones,
      },
      persistence: {
        currentStoredDesignFingerprint:
          documentRoom.state.document.currentStoredDesignFingerprint,
        isSaving: persistence.state.persistence.isSaving,
        saveStatus: persistence.state.persistence.saveStatus,
      },
      presentation: {
        exportReadiness: {
          items: planWorkspace.derived.exportReadinessItems,
          readyCount: planWorkspace.derived.exportReadinessReadyCount,
          score: planWorkspace.derived.exportReadinessScore,
        },
        presentModeRoomId:
          viewportShell.state.presentation.presentModeRoomId,
        cameraViewNameInput: presentationState.state.cameraViewNameInput,
        layoutVersionNameInput: presentationState.state.layoutVersionNameInput,
        simplePlanControls: viewportShell.state.plan.simplePlanControls,
        lightingPreset: lightingSettings.preset,
        lightingSettings,
        sharingDesign: persistence.state.persistence.sharingDesign,
        exportStylePreset: viewportShell.state.plan.exportStylePreset,
        isExporting: presentationBackup.state.isExporting,
        isPdfExporting: presentationBackup.state.isPdfExporting,
        aiNotesLoading: aiPanel.state.notes.loading,
      },
      plan: {
        planLayerPreset: viewportShell.state.plan.planLayerPreset,
        planLayers: viewportShell.state.plan.planLayers,
        planMeasurementUnit: viewportShell.state.plan.planMeasurementUnit,
        planTheme: viewportShell.state.plan.planTheme,
        annotationToolKind: planWorkspace.state.overlay.annotationToolKind,
        selectedPlanOverlayId:
          viewportShell.state.planSelection.selectedPlanOverlayId,
        visiblePlanOpening: planWorkspace.state.inspector.visiblePlanOpening,
        visiblePlanOpeningRoomName:
          planWorkspace.state.inspector.visiblePlanOpeningRoomName,
        visiblePlanOpeningWallSpanMeters:
          planWorkspace.state.inspector.visiblePlanOpeningWallSpanMeters,
        visiblePlanOpeningMaxHeightMeters:
          planWorkspace.state.inspector.visiblePlanOpeningMaxHeightMeters,
        houseRoomCount: documentRoom.derived.plan.housePlan2D.rooms.length,
        openingCount: viewportShell.state.plan.planOpenings.length,
        selectedPlanRoomId:
          viewportShell.state.planSelection.selectedPlanRoomId,
        commandSelectedPlanRoomId:
          sceneRoomRead.derived.scene.selectedPlanRoomContext?.id ?? null,
      },
      scene: {
        mode: sceneRoomRead.state.scene.scenePerformanceMode,
        liteEnabled: sceneRoomRead.state.scene.liteSceneEnabled,
        renderQuality: sceneRoomRead.state.scene.sceneRenderQuality,
        autoLite: sceneRoomRead.state.scene.autoLiteScene,
        sceneReady: sceneRoomRead.state.scene.sceneReady,
        roomCount: coreShell.state.document.designSnapshot.rooms.length,
        activeRoomItemCount: documentRoom.derived.room.items.length,
        sceneItemCount: sceneRoomRead.derived.scene.sceneRoomItems.length,
        lastFps:
          sceneRoomRead.state.scene.scenePerformanceSample.lastFps,
        fpsSamples:
          sceneRoomRead.state.scene.scenePerformanceSample.samples,
        drawCalls:
          sceneRoomRead.state.scene.sceneRendererMetrics.drawCalls,
        triangles:
          sceneRoomRead.state.scene.sceneRendererMetrics.triangles,
        geometries:
          sceneRoomRead.state.scene.sceneRendererMetrics.geometries,
        textures:
          sceneRoomRead.state.scene.sceneRendererMetrics.textures,
        planDebugMetrics: viewportShell.state.diagnostics.planDebugMetrics,
      },
      selection: {
        itemId: itemSelection.state.selectedItem?.instanceId ?? null,
        productId: itemSelection.state.selectedItem?.productId ?? null,
        hasSelectedItem: Boolean(itemSelection.state.selectedItem),
      },
      placement: {
        score: placement.derived.pendingCatalogPlacementScore?.score ?? null,
        kind: placement.derived.pendingCatalogPlacementScore?.kind ?? null,
        targetRoomName:
          placement.derived.pendingCatalogPlacementRoom?.name ?? null,
      },
      shopping: {
        readyCount:
          sceneRoomRead.derived.room.wholeHomeShoppingSummary.shoppableCount,
        needsReviewCount:
          sceneRoomRead.derived.room.wholeHomeShoppingSummary.needsReviewCount,
      },
      viewport: viewportShell.state.diagnostics.viewportSize,
      chrome: {
        openingBillingPortal: deferredPaywall.state.openingBillingPortal,
        millworkActive: cabinetry.state.studio !== null,
        activeRoomHealthSummary:
          sceneRoomRead.state.room.activeRoomHealthSummary,
        showBetaStart: documentSelection.state.betaStart.visible,
        firstRunActivation:
          commerceOnboarding.state.onboarding.firstRunActivationState,
        designPanelOpen: base.state.panels.designPanelOpen,
      },
      qa: {
        showLayoutDebugOverlay:
          viewportShell.state.diagnostics.showLayoutDebugOverlay,
        history: {
          pastCount: documentSelection.state.history.historyStatus.pastCount,
          futureCount: documentSelection.state.history.historyStatus.futureCount,
          transactionName:
            documentSelection.state.history.historyStatus.activeCommand
              ?.description ?? null,
        },
        cabinetSchedule: cabinetry.state.project.schedulePackage,
        cabinetHandoff: cabinetry.state.project.handoffPackage,
      },
    },
    configuration: {
      presentOpen:
        viewportShell.state.editor.editorMode === "present" &&
        viewportShell.state.presentation.showPresentModal,
      designerTheme: coreShell.derived.access.showDesignerTheme,
      canUseAdvancedPlanControls:
        coreShell.derived.access.capabilities.configurePlanLayers,
      canUseAdvancedExportStyles:
        coreShell.derived.access.capabilities.exportMultipleViews,
      canUseDesigner: coreShell.derived.access.canUseDesigner,
      canUseCabinetryStudio: cabinetry.state.canUseStudio,
      compactRoomStatus: planWorkspace.derived.compactRoomPlanStatusBar,
      showRoomHealth: planWorkspace.derived.showRoomPlanStatusHealth,
      eyeLevelTransitionDurationMs: 500,
      focusTransitionDurationMs: 460,
    },
    actions: {
      shell: {
        setPresentModalOpen:
          viewportShell.actions.presentation.setShowPresentModal,
        setEditorMode: viewportShell.actions.editor.setEditorMode,
        setPresentModeRoomId:
          viewportShell.actions.presentation.setPresentModeRoomId,
        setDesignSnapshot: coreShell.actions.document.setDesignSnapshot,
        changeViewMode: camera.actions.navigation.handleEditorViewModeChange,
        setUpgradeReason: base.actions.paywall.setUpgradeReason,
        setUpgradeOpen: base.actions.dialogs.setShowUpgrade,
        setDesignPanelOpen: base.actions.panels.setDesignPanelOpen,
        setItemCartOpen: base.actions.panels.setItemCartOpen,
        setClientPreview: base.actions.access.setClientPreview,
        setUrlMode: coreShell.actions.paywall.setUrlMode,
      },
      camera: {
        getEyeLevelView: camera.actions.navigation.getEyeLevelView,
        getFocusView: camera.actions.navigation.getFocusView,
        transitionToView:
          viewportShell.actions.camera.transitionToCameraView,
        setName: presentationState.actions.setCameraViewNameInput,
        save: presentationState.actions.saveCurrentNamedView,
        open: presentationState.actions.openSavedCameraView,
        delete: presentationState.actions.deleteSavedCameraView,
      },
      layoutVersions: {
        setName: presentationState.actions.setLayoutVersionNameInput,
        save: presentationState.actions.saveCurrentLayoutVersion,
        restore: presentationState.actions.restoreRoomLayoutVersion,
        delete: presentationState.actions.deleteRoomLayoutVersion,
      },
      history: {
        runTransaction:
          documentRoom.actions.history.runHistoryTransaction,
        undo: documentSelection.actions.history.undoSafe,
        redo: documentSelection.actions.history.redoSafe,
      },
      plan: {
        setSimpleControls: viewportShell.actions.plan.setSimplePlanControls,
        runOverlayCommand: planWorkspace.actions.overlay.runPlanOverlayCommand,
        setTheme: viewportShell.actions.plan.setPlanTheme,
        setLayers: viewportShell.actions.plan.setPlanLayers,
        setMeasurementUnit:
          viewportShell.actions.plan.setPlanMeasurementUnit,
        setOpenings: viewportShell.actions.plan.setPlanOpenings,
        setFixedElements: viewportShell.actions.plan.setPlanFixedElements,
        selectOverlay:
          selectionInspection.actions.selection.handleSelectPlanOverlay,
        selectAnnotationTool:
          planWorkspace.actions.overlay.selectAnnotationTool,
        deleteOverlay:
          selectionInspection.actions.selection.deletePlanOverlayById,
        changeOpening:
          planWorkspace.actions.overlay.handleUpdateOpeningMetrics2D,
        applyLayerPresetInTransaction:
          planWorkspace.actions.overlay.applyPlanLayerPresetInTransaction,
        addFloorPlanOpening:
          tracing.actions.addFloorPlanOpeningFromTool,
        fitPlanView: camera.actions.navigation.handleFitPlanView,
        duplicateRoom: planWorkspace.actions.room.duplicateRoom,
        deleteRoom: planWorkspace.actions.room.deleteRoom,
      },
      planCanvas: {
        setGuidedActionsChoiceSeen:
          viewportShell.actions.plan.setPlanGuidedActionsChoiceSeen,
        chooseGuidedActionsMode: tracing.actions.choosePlanGuidedActionsMode,
        selectFloorPlanTool: tracing.actions.selectFloorPlanTool,
        setGuidedPlanStartMode:
          viewportShell.actions.editor.setGuidedPlanStartMode,
        changeCalibrationMode: tracing.actions.changeCalibrationMode,
        changeDrawRoomMode: tracing.actions.changeDrawRoomMode,
        setGuidedActionsEnabled:
          viewportShell.actions.plan.setPlanGuidedActionsEnabled,
        undoFloorPlanTraceRoomPoint:
          tracing.actions.handleUndoFloorPlanTraceRoomPoint,
        clearPlanFocusPoints: planWorkspace.actions.clearPlanFocusPoints,
        setPlanFocusPanelRevealed:
          base.actions.panels.setPlanFocusPanelRevealed,
        dismissPlanCanvasGuidance:
          base.actions.panels.setDismissedPlanCanvasGuidanceKey,
      },
      selection: {
        duplicateItem:
          selection.boundaries.selection.actions.interaction
            .duplicateSelectedItem,
        deleteItem:
          selection.boundaries.selection.actions.interaction
            .deleteSelectedItem,
      },
      navigation: {
        plan: viewportShell.actions.panels.goPlan,
        furnish: viewportShell.actions.panels.goFurnish,
        aiDesign: viewportShell.actions.panels.goAiDesign,
        shop: viewportShell.actions.panels.goShop,
      },
      dialogs: {
        setPlansOpen: base.actions.dialogs.setShowPlans,
        openNewPlan: persistence.actions.newPlan.openNewPlanPicker,
        setFeedbackOpen: base.actions.dialogs.setFeedbackOpen,
      },
      billing: { openPortal: deferredPaywall.actions.openBillingPortal },
      persistence: {
        toggleMyDesigns:
          persistence.actions.persistence.toggleMyDesigns,
        saveDesignToCloud:
          persistence.actions.persistence.saveDesignToCloud,
        retrySaveStatus: persistence.actions.persistence.retrySaveStatus,
        openGuestPrompt: persistence.actions.persistence.openGuestPrompt,
      },
      cabinetry: { openStudio: cabinetry.actions.openCreateStudio },
      room: {
        reviewHealth: sceneRoomRead.actions.room.reviewActiveRoomHealth,
        rename: planWorkspace.actions.room.startRoomRename,
      },
      scenePerformance: {
        changeMode:
          sceneRoomRead.actions.scene.handleScenePerformanceModeChange,
      },
      lighting: {
        changeShadowsEnabled,
      },
      betaStart: documentSelection.actions.betaStart,
      presentation: {
        changeLightingPreset,
        createShareLink:
          persistence.actions.persistence.createShareLinkAndCopy,
        setExportStylePreset: viewportShell.actions.plan.setExportStylePreset,
        exportImages: presentationBackup.actions.exportImages,
        exportPdf: presentationBackup.actions.exportPdf,
        generateAiNotes: aiPanel.actions.notes.generate,
      },
      feedback: { showToast: coreShell.actions.feedback.showRuleToast },
    },
  });

  return {
    boundaries: {
      presentationQa,
      aiWorkspace,
      commerceOnboarding,
      selection,
      presentationBackup,
      deferredPaywall,
    },
    state: presentationQa.state,
    derived: presentationQa.derived,
    configuration: {},
    refs: {},
    actions: presentationQa.actions,
    regions: presentationQa.regions,
  };
}

export type DesignPagePresentationWorkspaceRegistration = ReturnType<
  typeof useDesignPagePresentationWorkspaceRegistration
>;

export type { DesignPagePresentationQaFacade };
