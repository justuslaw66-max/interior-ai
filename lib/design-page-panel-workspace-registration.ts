import { buildDesignPagePanelRegistration } from "@/lib/design-page-panel-registration";
import type { DesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";

export type BuildDesignPagePanelWorkspaceRegistrationInput = {
  boundaries: {
    presentation: DesignPagePresentationWorkspaceRegistration;
  };
};

/**
 * Builds the panel region from established domain registrations. The adapter
 * owns no editor state; it keeps panel composition out of the workspace while
 * preserving each feature controller as the source of truth.
 */
export function buildDesignPagePanelWorkspaceRegistration({
  boundaries: { presentation },
}: BuildDesignPagePanelWorkspaceRegistrationInput) {
  const { aiWorkspace, commerceOnboarding, selection } = presentation.boundaries;
  const {
    coreShell,
    documentSelection,
    planAuthoring,
    editorInteraction,
    persistence,
    aiPanel,
  } = aiWorkspace.boundaries;
  const { base, snapshotDocument, viewportShell } = coreShell.boundaries;
  const { importedModels } = base.boundaries;
  const { planDocument, floorPlanDocument, surfaceState } =
    viewportShell.boundaries;
  const { documentRoom, sceneRoomRead } = documentSelection.boundaries;
  const { selectionInspection, planWorkspace, surfaceWorkspace, underlay } =
    planAuthoring.boundaries;
  const { tracing } = editorInteraction.boundaries;
  const placement = selection.boundaries.placement;
  const cabinetry = selection.boundaries.cabinetry;
  const placementSelection = selection.boundaries.selection;
  const panel = aiPanel.boundaries.panel;

  const region = buildDesignPagePanelRegistration({
    boundaries: {
      cabinetry: cabinetry.boundaries.cabinetry,
      floorPlanDocument,
      importedModels,
      panel,
      placementSelection,
      planDocument,
      roomFloor: documentRoom.boundaries.roomFloor,
      sceneRoom: sceneRoomRead.boundaries.sceneRoom,
      surfaceState,
      surfaceWorkspace,
    },
    state: {
      document: {
        designId: base.state.identity.designId,
        plan: base.state.access.plan,
        rooms: coreShell.state.document.designSnapshot.rooms,
        activeRoomId: coreShell.state.document.designSnapshot.activeRoomId,
        catalogRoomNavigationRevision: snapshotDocument.state.catalogRoomNavigationRevision, authenticated: Boolean(base.state.identity.session?.user),
        authScopeKey: base.state.identity.session?.user?.id ?? base.state.identity.session?.user?.email ?? "guest",
      },
      editor: {
        editorMode: viewportShell.state.editor.editorMode,
        controlsMode: viewportShell.state.panels.designControlsPanelMode,
        controls: {
          collapsed: base.state.panels.designPanelCollapsed,
          selectionContext: planWorkspace.state.inspector.selectedObjectContext,
          viewMode: base.state.editor.viewMode,
          style: base.state.brief.style,
          budget: base.state.brief.budget,
          showGrid: base.state.editor.showGrid,
          snapEnabled: base.state.editor.snapEnabled,
        },
        shoppingVisible:
          documentRoom.derived.plan.shoppingPanelVisibleForLayout,
        controlsVisible:
          documentRoom.derived.plan.designControlsPanelVisibleForLayout,
      },
      plan: {
        roomConnectionChecklistItems:
          planWorkspace.state.overlay.roomConnectionChecklistItems,
        visiblePlanOpening:
          planWorkspace.state.inspector.visiblePlanOpening,
        visiblePlanOpeningRoomName:
          planWorkspace.state.inspector.visiblePlanOpeningRoomName,
        visiblePlanOpeningWallSpanMeters:
          planWorkspace.state.inspector.visiblePlanOpeningWallSpanMeters,
        visiblePlanOpeningMaxHeightMeters:
          planWorkspace.state.inspector.visiblePlanOpeningMaxHeightMeters,
        planStartMode: viewportShell.state.editor.guidedPlanStartMode,
        planCompletionSignal: tracing.state.consumerPlanCompletionSignal,
        floorPlanQualityReport: planWorkspace.state.quality.report,
      },
      shopping: {
        readinessFilter: viewportShell.state.shopping.shoppingReadinessFilter,
        placementAddMode: base.state.editor.placementAddMode,
      },
      ai: { aiLayoutProposal: coreShell.state.placement.pendingAiLayoutProposal },
    },
    derived: {
      surface: {
        showFloorPropertiesPanel:
          planWorkspace.derived.inlineFloorPropertiesPanelVisible,
      },
    },
    configuration: {
      designerTheme: coreShell.derived.access.showDesignerTheme,
      isDesigner: coreShell.derived.access.isDesigner,
      isClientPreview: coreShell.derived.access.isClientPreview,
      canEdit: coreShell.derived.access.canEdit,
      canUseCabinetryStudio: cabinetry.state.canUseStudio,
      canEditPlanGeometry: placement.derived.canEditPlanGeometry,
      aiDesignEnabled: viewportShell.derived.aiDesignEnabled,
    },
    actions: {
      navigation: {
        signIn: coreShell.actions.paywall.signInWithReturn,
        goFurnish: viewportShell.actions.panels.goFurnish,
        goAiDesign: viewportShell.actions.panels.goAiDesign,
        goShop: viewportShell.actions.panels.goShop,
        selectRoom: planWorkspace.actions.room.switchRoom,
        changePlacementAddMode: base.actions.editor.setPlacementAddMode,
        changeStyle: base.actions.brief.setStyle,
        changeBudget: base.actions.brief.setBudget,
      },
      room: {
        changePreset: planWorkspace.actions.room.changeRoomPreset,
        commitDimension:
          planWorkspace.actions.room.commitActiveRoomDimension,
        changeHeight:
          selectionInspection.actions.roomGeometry.changeActiveRoomHeightMm,
        changeWallThickness:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomWallThicknessMm,
        changeSlabThickness:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomSlabThicknessMm,
        changeBaseboardDepth:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomBaseboardDepthMm,
        changeSurfaceOpacity:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomSurfaceOpacity,
        changeCeilingVisible:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomCeilingVisible,
        changeCeilingColor:
          selectionInspection.actions.roomGeometry
            .changeActiveRoomCeilingColor,
      },
      floorPlan: {
        completionHandled: tracing.actions.handleConsumerPlanCompletionHandled,
        changeStartMode: viewportShell.actions.editor.setGuidedPlanStartMode,
        activateQualityIssue: planWorkspace.actions.quality.activateIssue,
        selectTool: tracing.actions.selectFloorPlanTool,
        addOpeningFromTool: tracing.actions.addFloorPlanOpeningFromTool,
        applyTemplate: underlay.actions.applyPlanTemplate,
        upload: underlay.actions.uploadUnderlay,
        changePdfPage: underlay.actions.changePdfPage,
        changeOpacity: underlay.actions.changeUnderlayOpacity,
        changeLock: underlay.actions.changeUnderlayLock,
        changeCalibrationMode: tracing.actions.changeCalibrationMode,
        applyCalibration: underlay.actions.applyCalibration,
        resetCalibrationPoints: underlay.actions.resetCalibrationPoints,
        changeTraceRoomMode: tracing.actions.changeTraceRoomMode,
        changeDrawRoomMode: tracing.actions.changeDrawRoomMode,
        applyExactWallLength: tracing.actions.handleApplyFloorPlanExactWallLength,
        undoTraceRoomPoint: tracing.actions.handleUndoFloorPlanTraceRoomPoint,
        resetTraceRoomPoints:
          tracing.actions.handleResetFloorPlanTraceRoomPoints,
        changeTraceOpeningMode: tracing.actions.changeTraceOpeningMode,
        resetTraceOpeningPoints: tracing.actions.resetTraceOpeningPoints,
        clear: underlay.actions.clearUnderlay,
        addSuggestedDoorway:
          planWorkspace.actions.overlay.handleAddSuggestedDoorway,
        updateOpeningMetrics:
          planWorkspace.actions.overlay.handleUpdateOpeningMetrics2D,
      },
      shopping: {
        setReadinessFilter:
          viewportShell.actions.shopping.setShoppingReadinessFilter,
        swapItem: documentSelection.actions.shopping.swapItem,
        previewReplacement:
          commerceOnboarding.actions.commerce.previewShoppingReplacement,
        bulkSwap: aiPanel.actions.layout.bulkSwap,
        showUpgrade: () => base.actions.dialogs.setShowUpgrade(true),
        openGuestPrompt: persistence.actions.persistence.openGuestPrompt,
        addImportedToRoom:
          commerceOnboarding.actions.commerce.addSelectedImportedToRoom,
        reviewIssue: documentSelection.actions.shopping.reviewIssue,
      },
      cabinetry: {
        deleteSelected:
          placementSelection.actions.interaction.deleteSelectedItem,
      },
      ai: {
        onApplyAiLayoutProposal: aiPanel.actions.layout.applyPendingProposal,
        onClearAiLayoutProposal: aiPanel.actions.layout.dismissPendingProposal,
      },
    },
  });

  return {
    boundaries: { presentation },
    state: {},
    derived: {},
    configuration: {},
    refs: {},
    actions: {},
    regions: { panel: region },
  };
}

export type DesignPagePanelWorkspaceRegistration = ReturnType<
  typeof buildDesignPagePanelWorkspaceRegistration
>;
