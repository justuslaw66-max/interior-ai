"use client";

import { isPro } from "@/lib/plan";
import { DesignPageComposition } from "@/components/editor/design-page/DesignPageComposition";
import { DesignPageEditorChrome } from "@/components/editor/design-page/DesignPageEditorChrome";
import { DesignPageDialogLayer } from "@/components/editor/design-page/DesignPageDialogLayer";
import { DesignPagePanelRegion } from "@/components/editor/design-page/DesignPagePanelRegion";
import { DesignPagePresentationQaLayer } from "@/components/editor/design-page/DesignPagePresentationQaLayer";
import { DesignPageSceneRegion } from "@/components/editor/design-page/DesignPageSceneRegion";
import { useDesignPagePlacementWorkspaceRegistration } from "@/lib/useDesignPagePlacementWorkspaceRegistration";
import { useDesignPageAiWorkspaceRegistration } from "@/lib/useDesignPageAiWorkspaceRegistration";
import { useDesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import { useDesignPageSceneRegionWorkspaceRegistration } from "@/lib/useDesignPageSceneRegionWorkspaceRegistration";
import { useDesignPageCommerceOnboardingRegistration } from "@/lib/useDesignPageCommerceOnboardingRegistration";
import { buildDesignPageViewportRegionAdapter } from "@/lib/design-page-viewport-region-adapter";
import { composeDesignPageSceneRegionModel } from "@/lib/design-page-viewport-region-model";
import { buildDesignPageDialogLayerAdapter } from "@/lib/design-page-dialog-layer-adapter";
import { buildDesignPagePanelWorkspaceRegistration } from "@/lib/design-page-panel-workspace-registration";
import { buildDesignPageDialogLayerModel } from "@/lib/design-page-dialog-layer-model";
import {
  DEFAULT_EDITOR_CAMERA_VIEW,
  PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
} from "@/lib/design-page-editor-configuration";
import { PRO_PLAN_PRICING } from "@/lib/pro-plan-catalog";
import { useDesignPageCabinetryWorkspaceRegistration } from "@/lib/useDesignPageCabinetryWorkspaceRegistration";
import { useDesignPagePresentationBackupRegistrationFacade } from "@/lib/useDesignPagePresentationBackupRegistrationFacade";
import { useDesignPageSelectionWorkspaceRegistration } from "@/lib/useDesignPageSelectionWorkspaceRegistration";
import { useDesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import { useDesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";
import { useDesignPageEditorInteractionRegistration } from "@/lib/useDesignPageEditorInteractionRegistration";
import { useDesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";
import { useDesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";
import { useDesignPageWorkspaceDeferredPaywallRegistration } from "@/lib/useDesignPagePaywallRegistrationFacade";

export function DesignPageWorkspace() {
  const coreShellRegistration = useDesignPageCoreShellRegistration({
    configuration: {
      initialCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
      nodeEnv: process.env.NODE_ENV,
    },
  });
  const {
    boundaries: {
      base: coreShellBaseRegistration,
      viewportShell: viewportShellRegistration,
      paywall: paywallRegistration,
    },
    state: {
      feedback: {
        ruleToast,
        layoutConfidence,
        visibleConstraints,
      },
      placement: { pendingAiLayoutProposal, crossRoomDragTarget },
      document: { designSnapshot },
    },
    derived: {
      access: {
        wantsDesigner,
        canUseDesigner,
        isClientPreview,
        showDesignerTheme,
      },
      paywall: {
        primaryUpgradeCtaLabel,
        annualPlanSavingsLabel,
        upgradeDialogDescription,
        upgradeDialogExportWorkflowBenefit,
        upgradeDialogPricingGuidance,
      },
    },
    actions: {
      paywall: {
        signInWithReturn,
      },
      feedback: {
        showRuleToast,
      },
    },
  } = coreShellRegistration;
  const {
    state: {
      identity: { session, designId },
      brief: { mode },
      access: { plan },
      dialogs: { showPlans, feedbackOpen, showUpgrade },
      paywall: {
        upgradeReason,
        upgradeCtaVariant,
        pricingLayoutVariant,
      },
      editor: { viewMode },
      panels: {
        itemCartOpen,
        itemCart,
      },
    },
    derived: { navigation: { router, pathname, searchParams } },
    actions: {
      brief: { setMode },
      access: { setPlan },
      dialogs: { setShowPlans, setFeedbackOpen, setShowUpgrade },
      paywall: {
        setUpgradeReason,
        setUpgradeCtaVariant,
        setPricingLayoutVariant,
      },
    },
  } = coreShellBaseRegistration;
  const {
    state: {
      plan: {
        planMeasurementUnit,
      },
      planSelection: {
        selectedPlanOverlayId,
      },
      camera: { cameraView },
      editor: { editorMode },
    },
    actions: {
      plan: {
        setPlanMeasurementUnit,
      },
    },
  } = viewportShellRegistration;
  const documentSelectionRegistration =
    useDesignPageDocumentSelectionRegistrationFacade({
      boundaries: { coreShell: coreShellRegistration },
    });
  const {
    boundaries: {
      documentRoom: documentRoomRegistration,
      sceneRoomRead: sceneRoomReadRegistration,
      itemSelection: itemSelectionController,
    },
    state: {
      history: {
        canRedo,
      },
    },
    actions: {
      history: { redoSafe },
    },
  } = documentSelectionRegistration;
  const documentFloorState = documentRoomRegistration.state.floor;
  const documentRoomModel = documentRoomRegistration.derived.room;
  const documentPlanModel = documentRoomRegistration.derived.plan;
  const documentFloorModel = documentRoomRegistration.derived.floor;
  const documentFloorActions = documentRoomRegistration.actions.floor;
  const {
    activeRoom,
    roomWidth,
    roomDepth,
  } = documentRoomModel;
  const {
    housePlan2D,
    designControlsPanelVisibleForLayout,
  } = documentPlanModel;
  const { activeFloorLevel, activeFloorRoomCount, floorOptions } =
    documentFloorModel;

  const sceneReadState = sceneRoomReadRegistration.state.scene;
  const sceneReadModel = sceneRoomReadRegistration.derived.scene;
  const roomReadModel = sceneRoomReadRegistration.derived.room;
  const {
    hasWholeHousePlan,
    selectedPlanRoomContext,
  } = sceneReadModel;
  const { selectedIds, selectedItem } =
    itemSelectionController.state;

  const presentationBackupRegistration =
    useDesignPagePresentationBackupRegistrationFacade({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
      },
    });
  const deferredPaywallRegistration =
    useDesignPageWorkspaceDeferredPaywallRegistration({
      boundaries: { paywall: paywallRegistration },
      navigation: router,
      searchParams,
      state: {
        identity: {
          authenticated: Boolean(session?.user),
          designId,
        },
        route: { pathname },
        billing: { upgradeReason, pricingLayoutVariant },
        telemetry: { mode },
        access: { wantsDesigner, canUseDesigner, showUpgrade },
      },
      actions: {
        billing: {
          setPlan,
          setShowUpgrade,
          setUpgradeReason,
          setShowPlans,
          requestSignIn: signInWithReturn,
          showToast: showRuleToast,
        },
        lifecycle: {
          setMode,
          setUpgradeCtaVariant,
          setPricingLayoutVariant,
        },
      },
    });
  const {
    state: { startingCheckout, openingBillingPortal },
    actions: {
      openPlansFromUpgrade,
      signInFromUpgrade,
      closeUpgradeDialog,
      closePlansDialog,
      manageBillingFromPlans,
      startCheckoutFromPlans,
    },
  } = deferredPaywallRegistration;

  const planAuthoringRegistration = useDesignPagePlanAuthoringRegistration({
    boundaries: {
      coreShell: coreShellRegistration,
      documentSelection: documentSelectionRegistration,
    },
  });
  const {
    selectionInspection: selectionInspectionRuntime,
    planWorkspace,
    surfaceWorkspace,
    underlay: planUnderlay,
  } = planAuthoringRegistration.boundaries;
  const {
    actions: {
      selection: {
        clearAllSelection,
        deletePlanOverlayById,
      },
      roomGeometry: {
        changeActiveRoomHeightMm: handleActiveRoomHeightMmChange,
        changeActiveRoomSlabThicknessMm:
          handleActiveRoomSlabThicknessMmChange,
        changeActiveRoomBaseboardDepthMm:
          handleActiveRoomBaseboardDepthMmChange,
        changeActiveRoomWallThicknessMm:
          handleActiveRoomWallThicknessMmChange,
        changeActiveRoomSurfaceOpacity:
          handleActiveRoomSurfaceOpacityChange,
        changeActiveRoomCeilingVisible:
          handleActiveRoomCeilingVisibleChange,
        changeActiveRoomCeilingColor:
          handleActiveRoomCeilingColorChange,
      },
    },
  } = selectionInspectionRuntime;

  const {
    state: {
      room: { pendingRoomRenameId, pendingRoomRenameValue },
      overlay: {
        pendingAnnotationKind,
        pendingAnnotationText,
      },
      quality: {
        report: floorPlanQualityReport,
        reviewPanelCollapsed: planQualityReviewCollapsed,
        reviewPanelVisible: plan2DQualityReviewPanelVisible,
        reviewPanelTopPx: plan2DQualityReviewPanelTopPx,
      },
      inspector: {
        floatingSelectionInspectorVisible,
        selectedObjectInspector,
        selectedPlanAnnotation,
        selectedPlanFixedElement,
        visiblePlanOpening,
      },
    },
    derived: {
      floatingPlanOverlayStackVisible,
      floatingFloorPropertiesPanelVisible,
      selectionInspectorDockedWithRightRail,
      selectionInspectorRightPx,
      selectionInspectorTopPx,
      selectionInspectorWidthPx,
      sceneBackgroundColor,
      planCanvasOverlaysState,
    },
    refs: {
      quality: { setReviewPanelNode: setPlanQualityReviewPanelNode },
    },
    actions: {
      room: {
        setPendingRoomRenameValue,
        cancelRoomRename,
        commitRoomRename,
        duplicateRoom: handleDuplicateSelectedPlanRoom,
        deleteRoom: handleDeleteSelectedPlanRoom,
        commitRoomDimensionEdit2D: handleCommitRoomDimensionEdit2D,
      },
      overlay: {
        setPendingAnnotationText,
        cancelPlanAnnotation,
        commitPlanAnnotation,
      },
      quality: {
        toggleReviewPanel: togglePlanQualityReviewPanel,
        activateIssue: handlePlanQualityAction,
      },
    },
  } = planWorkspace;
  const { actions: surfaceWorkspaceActions } = surfaceWorkspace;
  const {
    state: {
      pendingTemplateReplacement: pendingPlanTemplateReplacement,
    },
  } = planUnderlay;
  const editorInteractionRegistration =
    useDesignPageEditorInteractionRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
      },
    });
  const {
    camera: cameraWorkspace,
    zone: zoneController,
  } = editorInteractionRegistration.boundaries;
  const {
    handleFitPlanView,
    handleFitSelectedPlanRoom,
    handleWholeHomeMoveTarget,
    handleWholeHomeMoveCamera,
    handleWholeHomeNavigatorZoom,
    handleWholeHomeFocusRoom,
  } = cameraWorkspace.actions.navigation;
  const {
    state: { selectedZone, pendingZoneType },
    actions: {
      setPendingZoneType,
      createZoneFromSelection,
      autoLayoutZone,
      rotateZone,
      ungroupZone,
    },
  } = zoneController;

  const persistenceWorkspaceRegistration =
    useDesignPagePersistenceWorkspaceRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
      },
    });
  const {
    state: {
      persistence: {
        shareSuccessToast,
        shareErrorToast,
        shareLinkFallback,
        showMyDesigns,
        myDesigns,
        loadingDesigns,
        selectedSavedDesignIds,
        deletingDesignIds,
        pendingDeleteDesign,
        allSavedDesignIds,
        selectedSavedDesignCount,
        allSavedDesignsSelected,
        guestPromptReason,
      },
      newPlan: { startingNewPlan, newPlanStartError },
    },
    actions: {
      persistence: {
        closeShareLinkFallback,
        copyFallbackShareLink,
        openFallbackShareLink,
        closeMyDesigns,
        handleLoadDesign,
        toggleSavedDesignSelection,
        toggleAllSavedDesignSelection,
        requestDeleteSavedDesigns,
        cancelDeleteSavedDesigns,
        handleDeleteSavedDesign,
        handleGuestPromptNotNow,
        handleGuestSaveAndContinue,
      },
      newPlan: {
        openNewPlanPicker,
        cancelPendingPlanChoice,
        replaceCurrentPlanFromChoice,
        saveCurrentAndStartNewPlan,
      },
    },
  } = persistenceWorkspaceRegistration;

  const aiWorkspaceRegistration = useDesignPageAiWorkspaceRegistration({
    boundaries: {
      coreShell: coreShellRegistration,
      documentSelection: documentSelectionRegistration,
      planAuthoring: planAuthoringRegistration,
      editorInteraction: editorInteractionRegistration,
      persistence: persistenceWorkspaceRegistration,
    },
  });
  const { aiPanel: aiPanelRegistration } =
    aiWorkspaceRegistration.boundaries;
  const { panel: panelController } = aiPanelRegistration.boundaries;
  const { actions: panelActions } = panelController;
  const {
    state: { notes: aiNotesState },
    actions: {
      layout: {
        applyPendingProposal: applyPendingAiLayoutProposal,
        dismissPendingProposal: dismissPendingAiLayoutProposal,
      },
      notes: {
        applySuggestion,
        close: closeAiNotes,
      },
    },
  } = aiPanelRegistration;
  const {
    open: showAINotes,
    data: aiNotesData,
  } = aiNotesState;

  const placementWorkspaceRegistration =
    useDesignPagePlacementWorkspaceRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
        editorInteraction: editorInteractionRegistration,
      },
    });
  const {
    state: {
      surfaceInspector: selectedSurfaceInspectorState,
    },
    derived: {
      pendingCatalogPlacementScene,
      pendingCatalogPlacementRoom,
      pendingCatalogPlacementBlocked,
      restorableCatalogPlacement,
      pendingCatalogPlacementScore,
      pendingCatalogPlacementQuality,
      pendingCatalogPlacementImprovement,
      pendingCatalogBestRoomPlacement,
      pendingCatalogBestVariantPlacement,
      pendingCatalogPlacementHardInvalid,
      pendingCatalogPlacementStatusLabel,
      shouldConfirmImprovedCatalogPlacement,
      shouldConfirmRestoredCatalogPlacement,
      placementTargetRoomId,
      canEditPlanGeometry,
    },
    actions: {
      catalog: {
        rotatePendingCatalogPlacement,
        nudgePendingCatalogPlacement,
        centerPendingCatalogPlacement,
        autoPlacePendingCatalogPlacement,
        improvePendingCatalogPlacement,
        restoreLastValidCatalogPlacement,
        movePendingCatalogPlacementToBestRoom,
        switchPendingCatalogPlacementToBestOption,
        selectPendingCatalogPlacementBlocker,
        placePendingCatalogBesideBlocker,
        trySmallerPendingCatalogVariant,
        movePendingCatalogBlockerAside,
        swapPendingCatalogWithBlocker,
        confirmPendingCatalogPlacement,
        cancelPendingCatalogPlacement,
      },
      targeting: {
        surfaceInspector: selectedSurfaceInspectorActions,
      },
    },
  } = placementWorkspaceRegistration;

  const commerceOnboardingRegistration =
    useDesignPageCommerceOnboardingRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        editorInteraction: editorInteractionRegistration,
        persistence: persistenceWorkspaceRegistration,
        placement: placementWorkspaceRegistration,
      },
    });
  const {
    state: {
      onboarding: { nextBestActionNudge },
    },
    actions: {
      commerce: {
        removeFromCart,
        updateCartQty,
        clearCart,
        addAllToRoom,
      },
    },
  } = commerceOnboardingRegistration;

  const cabinetryRegistration = useDesignPageCabinetryWorkspaceRegistration({
    boundaries: {
      coreShell: coreShellRegistration,
      documentSelection: documentSelectionRegistration,
      planAuthoring: planAuthoringRegistration,
      placement: placementWorkspaceRegistration,
    },
  });
  const {
    state: {
      studio: cabinetryStudioState,
      canUseStudio: canUseCabinetryStudio,
      accessLevel: cabinetryAccessLevel,
      availableSpaces: cabinetryAvailableSpaces,
      preferredSpaceId: cabinetryPreferredSpaceId,
    },
    refs: { openedAt: cabinetryStudioOpenedAtRef },
    actions: {
      dismissStudio: dismissCabinetryStudio,
      saveDefinition: handleSaveCabinetDefinition,
      placeInPlan: handlePlaceCabinetInPlan,
    },
  } = cabinetryRegistration;

  const selectionWorkspaceRegistration =
    useDesignPageSelectionWorkspaceRegistration({
      boundaries: {
        coreShell: coreShellRegistration,
        documentSelection: documentSelectionRegistration,
        planAuthoring: planAuthoringRegistration,
        placement: placementWorkspaceRegistration,
        cabinetry: cabinetryRegistration,
      },
    });
  const { selection: placementSelectionWorkspace } =
    selectionWorkspaceRegistration.boundaries;
  const {
    alignSelectionX,
    alignSelectionZ,
    duplicateSelectedItem,
    deleteSelectedItem,
    centerSelectedItemInRoom,
    snapSelectedItemToNearestWall,
  } = placementSelectionWorkspace.actions.interaction;
  const {
    activeTargetValid: activePlacementTargetValid,
    activeTargetLabel: activePlacementTargetLabel,
  } = placementSelectionWorkspace.derived.placement;
  const presentationQaWorkspace =
    useDesignPagePresentationWorkspaceRegistration({
      boundaries: {
        aiWorkspace: aiWorkspaceRegistration,
        commerceOnboarding: commerceOnboardingRegistration,
        selection: selectionWorkspaceRegistration,
        presentationBackup: presentationBackupRegistration,
        deferredPaywall: deferredPaywallRegistration,
      },
    });
  const {
    derived: { betaFeedbackContext },
    actions: { planCanvas: planCanvasActions },
    regions: { presentExport: presentExportDialog, editorChrome: editorChromeModel,
      presentationQaLayer: presentationQaLayerModel },
  } = presentationQaWorkspace;

  const sceneCanvasRegionModel =
    useDesignPageSceneRegionWorkspaceRegistration({
      boundaries: { presentation: presentationQaWorkspace },
    }).regions.scene;
  const viewportRegionModel = buildDesignPageViewportRegionAdapter({
    state: {
      visibility: {
        rail: floatingPlanOverlayStackVisible, sceneLoading: sceneReadState.showSceneLoadingVeil,
        selectionInspector: floatingSelectionInspectorVisible, planQuality: plan2DQualityReviewPanelVisible,
        floorProperties: floatingFloorPropertiesPanelVisible,
        isClientPreview,
      },
      opening: {
        selectedId: selectedPlanOverlayId,
        value: visiblePlanOpening
          ? {
              kind: visiblePlanOpening.kind, wall: visiblePlanOpening.wall,
              widthMm: visiblePlanOpening.widthMm,
            }
          : null,
      },
      selectionInspector: {
        summary: selectedObjectInspector, selectedRoom: selectedPlanRoomContext,
        hasSelectedItem: Boolean(selectedItem), hasVisiblePlanOpening: Boolean(visiblePlanOpening),
        hasSelectedPlanFixedElement: Boolean(selectedPlanFixedElement),
        hasSelectedPlanAnnotation: Boolean(selectedPlanAnnotation),
        surfaceInspectorIsWall: roomReadModel.surfaceInspectorIsWall,
        surfaceInspectorIsCeiling: roomReadModel.surfaceInspectorIsCeiling,
        surfaceInspector: selectedSurfaceInspectorState,
        measurementUnit: planMeasurementUnit,
        activeRoomHeightMm: roomReadModel.activeRoomHeightMm,
        activeFloorRoomCount,
        designRoomCount: designSnapshot.rooms.length,
      },
      planQuality: { report: floorPlanQualityReport, collapsed: planQualityReviewCollapsed },
      planCanvas: planCanvasOverlaysState,
      aiLayoutPreview: { proposal: pendingAiLayoutProposal, toneText: sceneReadModel.aiLayoutPreviewTone.text },
      crossRoomDragTarget,
      navigator: {
        enabled: viewMode === "3d" && hasWholeHousePlan, rooms: housePlan2D.rooms,
        activeRoomId: designSnapshot.activeRoomId,
        cameraPosition: cameraView.pos, cameraTarget: cameraView.target,
        itemCountsByRoomId: roomReadModel.roomItemCountsById,
        targetRoomId: placementTargetRoomId, targetRoomValid: activePlacementTargetValid,
      },
      floorProperties: {
        roomWidth, roomDepth, floorOptions,
        hiddenFloorLevels: documentFloorState.hiddenFloorLevels,
        activeFloorLevel, activeFloorRoomCount,
        measurementUnit: planMeasurementUnit,
        activeRoomHeightMm: roomReadModel.activeRoomHeightMm,
        activeRoomWallThicknessMm: roomReadModel.activeRoomWallThicknessMm,
        activeRoomSlabThicknessMm: roomReadModel.activeRoomSlabThicknessMm,
        activeRoomBaseboardDepthMm: roomReadModel.activeRoomBaseboardDepthMm,
        activeRoomWallOpacity: roomReadModel.activeRoomWallOpacity,
        activeRoomFloorOpacity: roomReadModel.activeRoomFloorOpacity,
        activeRoomCeilingOpacity: roomReadModel.activeRoomCeilingOpacity,
        activeRoomCeilingVisible: roomReadModel.activeRoomCeilingVisible,
        activeRoomCeilingColor: roomReadModel.activeRoomCeilingColor,
        stackedFloorView: documentFloorState.stackedFloorView, canRedo,
      },
      selectionControls: {
        viewMode, stackedFloorView: documentFloorState.stackedFloorView,
        floorOptions, activeFloorLevel,
        hiddenFloorLevels: documentFloorState.hiddenFloorLevels,
        selectedCount: selectedIds.size,
        pendingZoneType, selectedZone, isClientPreview,
      },
    },
    configuration: {
      dark: showDesignerTheme,
      sceneBackgroundColor,
      canEditPlanGeometry,
      selectionInspectorDockedWithRightRail,
      floatingOverlayStackWidthPx: PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
      selectionInspectorRightPx,
      selectionInspectorTopPx,
      selectionInspectorWidthPx,
      planQualityReviewTopPx: plan2DQualityReviewPanelTopPx,
      editorMode,
    },
    references: {
      planQuality: { setPanel: setPlanQualityReviewPanelNode },
    },
    actions: {
      deletePlanOverlay: deletePlanOverlayById,
      showToast: showRuleToast,
      selectionInspector: {
        clearSelection: clearAllSelection, setMeasurementUnit: setPlanMeasurementUnit,
        commitRoomDimensionMeters: handleCommitRoomDimensionEdit2D,
        commitActiveFloorWallHeightMm: handleActiveRoomHeightMmChange,
        item: {
          center: centerSelectedItemInRoom, snapToWall: snapSelectedItemToNearestWall,
          duplicate: duplicateSelectedItem, delete: deleteSelectedItem,
        },
        room: {
          editFloor: surfaceWorkspaceActions.openFloorEditorForRoom,
          fit: handleFitSelectedPlanRoom,
          duplicate: handleDuplicateSelectedPlanRoom, delete: handleDeleteSelectedPlanRoom,
        },
        surfaceInspector: selectedSurfaceInspectorActions,
      },
      planQuality: { toggleCollapsed: togglePlanQualityReviewPanel, activateIssue: handlePlanQualityAction },
      planCanvas: planCanvasActions,
      aiLayoutPreview: { apply: applyPendingAiLayoutProposal, dismiss: dismissPendingAiLayoutProposal },
      navigator: {
        onMoveCamera: handleWholeHomeMoveCamera, onMoveTarget: handleWholeHomeMoveTarget,
        onFocusRoom: handleWholeHomeFocusRoom,
        onZoom: handleWholeHomeNavigatorZoom, onResetView: handleFitPlanView,
      },
      floorProperties: {
        addFloor: documentFloorActions.handleAddFloor,
        onToggleFloorVisibility: documentFloorActions.handleToggleFloorVisibility,
        onRenameFloor: documentFloorActions.handleRenameFloor,
        onDuplicateFloor: documentFloorActions.handleDuplicateFloor,
        onDeleteFloor: documentFloorActions.handleDeleteFloor,
        onSwitchFloor: documentFloorActions.handleSwitchFloor,
        onStackedFloorViewChange: documentFloorActions.setStackedFloorView,
        onRedo: redoSafe, onActiveRoomHeightMmChange: handleActiveRoomHeightMmChange,
        onActiveRoomWallThicknessMmChange:
          handleActiveRoomWallThicknessMmChange,
        onActiveRoomSlabThicknessMmChange:
          handleActiveRoomSlabThicknessMmChange,
        onActiveRoomBaseboardDepthMmChange:
          handleActiveRoomBaseboardDepthMmChange,
        onActiveRoomSurfaceOpacityChange:
          handleActiveRoomSurfaceOpacityChange,
        onActiveRoomCeilingVisibleChange:
          handleActiveRoomCeilingVisibleChange,
        onActiveRoomCeilingColorChange: handleActiveRoomCeilingColorChange,
      },
      selectionControls: {
        floorStack: { switchFloor: documentFloorActions.handleSwitchFloor },
        multiSelection: {
          alignX: alignSelectionX, alignZ: alignSelectionZ,
          changeZoneType: setPendingZoneType, createZone: createZoneFromSelection,
          clear: clearAllSelection,
        },
        selectedZone: { autoLayout: autoLayoutZone, rotateZone, ungroup: ungroupZone },
      },
    },
  });
  const sceneRegionModel = composeDesignPageSceneRegionModel({
    scene: sceneCanvasRegionModel,
    viewport: viewportRegionModel,
  });
  const panelRegionModel = buildDesignPagePanelWorkspaceRegistration({
    boundaries: { presentation: presentationQaWorkspace },
  }).regions.panel;
  const dialogLayerModel = buildDesignPageDialogLayerAdapter(buildDesignPageDialogLayerModel({
    access: { isClientPreview, isAuthenticated: Boolean(session?.user), isPro: isPro(plan), designerTheme: showDesignerTheme },
    billing: {
      upgrade: { open: showUpgrade, variantLabel: upgradeCtaVariant, contentVariant: upgradeCtaVariant,
        description: upgradeDialogDescription, exportWorkflowBenefit: upgradeDialogExportWorkflowBenefit,
        pricingGuidance: upgradeDialogPricingGuidance, primaryCtaLabel: primaryUpgradeCtaLabel },
      plans: { open: showPlans, layout: pricingLayoutVariant, openingBillingPortal, monthlyLabel: PRO_PLAN_PRICING.monthly.label,
        yearlyLabel: PRO_PLAN_PRICING.yearly.label, yearlyEffectiveMonthlyLabel: PRO_PLAN_PRICING.yearly.effectiveMonthlyLabel },
      startingCheckout, annualSavingsLabel: annualPlanSavingsLabel,
      upgradeActions: { onSeePlans: openPlansFromUpgrade, onSignIn: signInFromUpgrade, onClose: closeUpgradeDialog },
      plansActions: { onClose: closePlansDialog, onManageBilling: manageBillingFromPlans, onStartCheckout: startCheckoutFromPlans },
    },
    persistence: {
      guestSave: { open: Boolean(guestPromptReason), onNotNow: handleGuestPromptNotNow, onSaveAndContinue: handleGuestSaveAndContinue },
      myDesigns: {
        data: { open: showMyDesigns, designs: myDesigns, loading: loadingDesigns, allDesignIds: allSavedDesignIds,
          selectedDesignIds: selectedSavedDesignIds, selectedDesignCount: selectedSavedDesignCount,
          allDesignsSelected: allSavedDesignsSelected, deletingDesignIds, pendingDeleteDesign },
        actions: { onClose: closeMyDesigns, onOpenTemplates: openNewPlanPicker, onToggleAll: toggleAllSavedDesignSelection,
          onToggleSelection: toggleSavedDesignSelection, onLoadDesign: handleLoadDesign, onRequestDelete: requestDeleteSavedDesigns,
          onCancelDelete: cancelDeleteSavedDesigns, onConfirmDelete: handleDeleteSavedDesign },
      },
      templateChoice: {
        data: { open: Boolean(pendingPlanTemplateReplacement), templateLabel: pendingPlanTemplateReplacement?.template.label ?? "this floor plan",
          busy: startingNewPlan, errorMessage: newPlanStartError },
        actions: { onCancel: cancelPendingPlanChoice, onReplaceCurrent: replaceCurrentPlanFromChoice,
          onSaveCurrentAndStartNew: saveCurrentAndStartNewPlan, onSignIn: signInWithReturn },
      },
    },
    ai: { notes: { open: showAINotes, data: aiNotesData, onApplySuggestion: applySuggestion, onClose: closeAiNotes } },
    presentation: { presentExport: presentExportDialog },
    editing: {
      roomRename: { pendingRoomId: pendingRoomRenameId, value: pendingRoomRenameValue,
        onValueChange: setPendingRoomRenameValue, onCancel: cancelRoomRename, onSave: commitRoomRename },
      annotation: { kind: pendingAnnotationKind, text: pendingAnnotationText, onTextChange: setPendingAnnotationText,
        onCancel: cancelPlanAnnotation, onAdd: commitPlanAnnotation },
    },
    placement: {
      identity: { scene: pendingCatalogPlacementScene, roomName: pendingCatalogPlacementRoom?.name ?? null },
      assessment: { hardInvalid: pendingCatalogPlacementHardInvalid, statusLabel: pendingCatalogPlacementStatusLabel,
        targetLabel: activePlacementTargetLabel ?? null, targetValid: activePlacementTargetValid, quality: pendingCatalogPlacementQuality,
        score: pendingCatalogPlacementScore, improvement: pendingCatalogPlacementImprovement,
        bestRoomPlacement: pendingCatalogBestRoomPlacement, bestVariantPlacement: pendingCatalogBestVariantPlacement,
        blocked: pendingCatalogPlacementBlocked, hasRestorablePlacement: Boolean(restorableCatalogPlacement),
        shouldConfirmImprovedPlacement: shouldConfirmImprovedCatalogPlacement,
        shouldConfirmRestoredPlacement: shouldConfirmRestoredCatalogPlacement },
      activeRoomName: activeRoom?.name ?? null,
      actions: { onAutoPlace: autoPlacePendingCatalogPlacement, onMoveToBestRoom: movePendingCatalogPlacementToBestRoom,
        onSwitchToBestOption: switchPendingCatalogPlacementToBestOption, onImprovePlacement: improvePendingCatalogPlacement,
        onRestoreValidPlacement: restoreLastValidCatalogPlacement, onSelectBlocker: selectPendingCatalogPlacementBlocker,
        onSwapWithBlocker: swapPendingCatalogWithBlocker, onMoveBlockerAside: movePendingCatalogBlockerAside,
        onPlaceBesideBlocker: placePendingCatalogBesideBlocker, onTrySmallerVariant: trySmallerPendingCatalogVariant,
        onCenter: centerPendingCatalogPlacement, onNudge: nudgePendingCatalogPlacement, onRotate: rotatePendingCatalogPlacement,
        onCancel: cancelPendingCatalogPlacement, onConfirm: confirmPendingCatalogPlacement },
    },
    feedback: {
      beta: { open: feedbackOpen, context: betaFeedbackContext, onOpenChange: setFeedbackOpen },
      toasts: { ruleMessage: ruleToast, nudgeMessage: nextBestActionNudge, shareCopied: shareSuccessToast, shareErrorMessage: shareErrorToast },
      validation: { constraints: visibleConstraints, confidence: layoutConfidence },
    },
    sharing: { url: shareLinkFallback, onClose: closeShareLinkFallback, onCopy: copyFallbackShareLink, onOpen: openFallbackShareLink },
    cabinetry: {
      state: cabinetryStudioState, access: { enabled: canUseCabinetryStudio, accessLevel: cabinetryAccessLevel },
      configuration: { measurementUnit: planMeasurementUnit, availableSpaces: cabinetryAvailableSpaces,
        preferredSpaceId: cabinetryPreferredSpaceId },
      refs: { openedAt: cabinetryStudioOpenedAtRef },
      actions: { onSave: handleSaveCabinetDefinition, onPlaceInPlan: handlePlaceCabinetInPlan, onDismiss: dismissCabinetryStudio },
    },
    cart: { items: itemCart, isOpen: itemCartOpen, controlsPanelVisible: designControlsPanelVisibleForLayout,
      onRemove: removeFromCart, onUpdateQty: updateCartQty, onClear: clearCart,
      onAddAllToRoom: addAllToRoom, onToggle: panelActions.toggleItemCart },
  }));
  return (
    <DesignPageComposition configuration={{ designerTheme: showDesignerTheme }}>
      <DesignPagePresentationQaLayer {...presentationQaLayerModel} />
      <div className="absolute inset-0">
        <DesignPageSceneRegion {...sceneRegionModel} />
        <DesignPageEditorChrome {...editorChromeModel} />
      </div>
      <DesignPagePanelRegion {...panelRegionModel} />
      <DesignPageDialogLayer {...dialogLayerModel} />
    </DesignPageComposition>
  );
}
