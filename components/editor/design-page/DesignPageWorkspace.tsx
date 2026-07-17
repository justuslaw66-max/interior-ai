"use client";

import { useCallback } from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { isPro } from "@/lib/plan";
import { track } from "@/lib/analytics";
import { DesignPageComposition } from "@/components/editor/design-page/DesignPageComposition";
import { DesignPageEditorChrome } from "@/components/editor/design-page/DesignPageEditorChrome";
import { DesignPageDialogLayer } from "@/components/editor/design-page/DesignPageDialogLayer";
import { DesignPagePanelRegion } from "@/components/editor/design-page/DesignPagePanelRegion";
import { DesignPagePresentationQaLayer } from "@/components/editor/design-page/DesignPagePresentationQaLayer";
import { DesignPageSceneRegion } from "@/components/editor/design-page/DesignPageSceneRegion";
import { useDesignPageCatalogPlacementRegistrationFacade } from "@/lib/useDesignPageCatalogPlacementRegistrationFacade";
import { useDesignPageAiWorkspaceRegistration } from "@/lib/useDesignPageAiWorkspaceRegistration";
import { useDesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import { useDesignPageSceneItemDrag } from "@/lib/useDesignPageSceneItemDrag";
import { useDesignPageSurfaceTargetingFacade } from "@/lib/useDesignPageSurfaceTargetingFacade";
import { useDesignPageOnboardingRegistrationFacade } from "@/lib/useDesignPageOnboardingRegistrationFacade";
import { buildDesignPageSceneRegionAdapter } from "@/lib/design-page-scene-region-adapter";
import { buildDesignPageViewportRegionAdapter } from "@/lib/design-page-viewport-region-adapter";
import { composeDesignPageSceneRegionModel } from "@/lib/design-page-viewport-region-model";
import { buildDesignPageDialogLayerAdapter } from "@/lib/design-page-dialog-layer-adapter";
import { buildDesignPagePanelRegistration } from "@/lib/design-page-panel-registration";
import { buildDesignPageDialogLayerModel } from "@/lib/design-page-dialog-layer-model";
import {
  DEFAULT_EDITOR_CAMERA_VIEW,
  EDITOR_3D_MAX_POLAR_ANGLE,
  EDITOR_3D_MIN_CAMERA_DISTANCE,
  EDITOR_3D_MIN_POLAR_ANGLE,
  PLAN_FLOATING_OVERLAY_STACK_WIDTH_PX,
} from "@/lib/design-page-editor-configuration";
import { PRO_PLAN_PRICING } from "@/lib/pro-plan-catalog";
import { useDesignPageCommerceActions } from "@/lib/useDesignPageCommerceActions";
import { useDesignPagePresentationBackupRegistrationFacade } from "@/lib/useDesignPagePresentationBackupRegistrationFacade";
import { useDesignPagePlacementSelectionWorkspaceFacade } from "@/lib/useDesignPagePlacementSelectionWorkspaceFacade";
import { useDesignPageDocumentSelectionRegistrationFacade } from "@/lib/useDesignPageDocumentSelectionRegistrationFacade";
import { useDesignPagePlanAuthoringRegistration } from "@/lib/useDesignPagePlanAuthoringRegistration";
import { useDesignPageEditorInteractionRegistration } from "@/lib/useDesignPageEditorInteractionRegistration";
import { useDesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";
import { useDesignPagePresentationQaFacade } from "@/lib/useDesignPagePresentationQaFacade";
import { useDesignPageWorkspaceDeferredPaywallRegistration } from "@/lib/useDesignPagePaywallRegistrationFacade";
import { useDesignPageCabinetryRegistrationFacade } from "@/lib/useDesignPageCabinetryRegistrationFacade";

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
        constraintResults,
        visibleConstraints,
      },
      placement: { pendingAiLayoutProposal, crossRoomDragTarget },
      document: { designSnapshot },
    },
    derived: {
      access: {
        wantsDesigner,
        canUseDesigner,
        isDesigner,
        isClientPreview,
        showDesignerTheme,
        canEdit,
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
        logFunnelEvent,
        trackFirstInteraction,
        signInWithReturn,
        setUrlMode,
      },
      feedback: {
        showRuleToast,
        showConstraintsForMoment,
        showConfidenceSummary,
      },
      placement: { setCrossRoomDragTarget },
      document: { setDesignSnapshot },
    },
    refs: { itemsRef, designSnapshotRef },
  } = coreShellRegistration;
  const {
    boundaries: { importedModels: importedModelsWorkspace },
    state: {
      identity: { session, designId, shareToken },
      brief: { style, budget, mode },
      access: { plan },
      dialogs: { showPlans, feedbackOpen, showUpgrade },
      paywall: {
        upgradeReason,
        upgradeCtaVariant,
        pricingLayoutVariant,
      },
      editor: { showGrid, snapEnabled, placementAddMode, lightingPreset, viewMode },
      panels: {
        itemCartOpen,
        itemCart,
        designPanelOpen,
        designPanelCollapsed,
      },
    },
    derived: {
      navigation: { router, pathname, searchParams },
      importedModels: { selectedImportedProductId },
    },
    actions: {
      brief: { setStyle, setBudget, setMode },
      access: { setPlan, setClientPreview },
      dialogs: { setShowPlans, setFeedbackOpen, setShowUpgrade },
      paywall: {
        setUpgradeReason,
        setUpgradeCtaVariant,
        setPricingLayoutVariant,
      },
      editor: {
        setPlacementAddMode,
        setLightingPreset,
      },
      panels: {
        setItemCartOpen,
        setItemCart,
        setDesignPanelOpen,
        setPlanFocusPanelRevealed,
        setDismissedPlanCanvasGuidanceKey,
      },
      importedModels: {
        ensureImportedCatalogItem,
        getRelatedImportedProductIds,
      },
    },
  } = coreShellBaseRegistration;
  const {
    boundaries: {
      planDocument: planDocumentController,
      floorPlanDocument: floorPlanDocumentController,
      surfaceState: surfaceStateController,
    },
    state: {
      diagnostics: { planDebugMetrics, showLayoutDebugOverlay, viewportSize },
      plan: {
        planTheme,
        planLayers,
        planOpenings,
        simplePlanControls,
        planLayerPreset,
        planMeasurementUnit,
        exportStylePreset,
        planGuidedActionsEnabled,
      },
      floorPlan: {
        floorPlanUnderlay,
        floorPlanCalibrationMode,
        floorPlanCalibrationPoints,
        floorPlanTraceRoomMode,
        floorPlanDrawRoomMode,
        floorPlanTraceRoomPoints,
        blankGridRoomPreviewPoint,
        floorPlanTraceOpeningMode,
        floorPlanTraceOpeningPoints,
        floorPlanTraceOpeningKind,
        blankGridRoomDrawActive,
      },
      planSelection: {
        selectedPlanOverlayId,
        suppressedDoorwaySuggestionKeys,
        selectedPlanRoomId,
      },
      camera: { cameraView },
      presentation: { showPresentModal, presentModeRoomId },
      shopping: { shoppingReadinessFilter, hoveredCartInstanceId },
      surface: {
        activeSurfaceTarget,
        selectedRendererSurfaceTarget,
        surfaceBrushActive,
        surfaceBrushMaterialId,
        surfaceBrushPaint,
      },
      editor: { editorMode, guidedPlanStartMode },
      panels: { designControlsPanelMode },
    },
    derived: { aiDesignEnabled },
    actions: {
      plan: {
        setPlanTheme,
        setPlanLayers,
        setPlanOpenings,
        setPlanFixedElements,
        setSimplePlanControls,
        setPlanMeasurementUnit,
        setExportStylePreset,
        setPlanGuidedActionsEnabled,
        setPlanGuidedActionsChoiceSeen,
        setSelectedPlanRoomId,
      },
      camera: {
        updateProjection,
        preserveCameraAfterPlanOverlaySelection,
        transitionToCameraView,
        resolveGroundPointFromClient,
      },
      presentation: { setShowPresentModal, setPresentModeRoomId },
      shopping: { setShoppingReadinessFilter },
      surface: surfaceStateActions,
      editor: { setEditorMode, setGuidedPlanStartMode },
      panels: { goPlan, goFurnish, goAiDesign, goShop },
      diagnostics: {
        handlePlanDebugMetricsChange,
        handlePlan2DCameraDiagnosticsChange,
      },
    },
    refs: {
      canvasRef,
      cameraRef,
      orbitControlsRef,
      rendererRef,
      sceneRef,
    },
  } = viewportShellRegistration;
  const {
    setActiveSurfaceTarget,
    setSelectedWallSurfaceTarget,
    setSelectedRendererSurfaceTarget,
  } = surfaceStateActions;

  const documentSelectionRegistration =
    useDesignPageDocumentSelectionRegistrationFacade({
      boundaries: { coreShell: coreShellRegistration },
    });
  const {
    boundaries: {
      documentRoom: documentRoomRegistration,
      sceneRoomRead: sceneRoomReadRegistration,
      itemSelection: itemSelectionController,
      itemDocument: itemDocumentController,
    },
    state: {
      betaStart: { visible: showBetaStart },
      selectedZoneId,
      history: {
        canUndo,
        canRedo,
        undoName,
        redoName,
        historyDebugSnapshot,
      },
    },
    actions: {
      betaStart: betaStartActions,
      setSelectedZoneId,
      shopping: {
        swapItem: swapShoppingItemReplacement,
        reviewIssue: reviewShoppingIssue,
      },
      history: { undoSafe, redoSafe },
    },
  } = documentSelectionRegistration;
  const roomFloorWorkspace = documentRoomRegistration.boundaries.roomFloor;
  const documentFloorState = documentRoomRegistration.state.floor;
  const documentRoomModel = documentRoomRegistration.derived.room;
  const documentPlanModel = documentRoomRegistration.derived.plan;
  const documentFloorModel = documentRoomRegistration.derived.floor;
  const documentHistoryRefs = documentRoomRegistration.refs.documentHistory;
  const documentHistoryActions = documentRoomRegistration.actions.history;
  const documentRoomActions = documentRoomRegistration.actions.room;
  const documentFloorActions = documentRoomRegistration.actions.floor;
  const {
    activeRoom,
    roomWidth,
    roomDepth,
    roomHeight,
    wallThickness,
    items,
    zones,
  } = documentRoomModel;
  const {
    housePlan2D,
    activeRoomPlanOffset,
    planViewWidth,
    planViewDepth,
    designControlsPanelVisibleForLayout,
    shoppingPanelVisibleForLayout,
  } = documentPlanModel;
  const { activeFloorLevel, activeFloorRoomCount, floorOptions } =
    documentFloorModel;
  const { history } = documentHistoryRefs;
  const { runHistoryTransaction } = documentHistoryActions;
  const { clampToActiveRoom } = documentRoomActions;

  const sceneRoomReadFacade =
    sceneRoomReadRegistration.boundaries.sceneRoom;
  const sceneReadState = sceneRoomReadRegistration.state.scene;
  const roomReadState = sceneRoomReadRegistration.state.room;
  const sceneReadModel = sceneRoomReadRegistration.derived.scene;
  const roomReadModel = sceneRoomReadRegistration.derived.room;
  const sceneReadActions = sceneRoomReadRegistration.actions.scene;
  const roomReadActions = sceneRoomReadRegistration.actions.room;
  const sceneReadQueries = sceneRoomReadRegistration.queries.scene;
  const { sceneReady } = sceneReadState;
  const {
    activeRoomHealthSummary,
    surfaceInspectorContext,
    surfaceInspectorUiActions,
  } = roomReadState;
  const {
    hasWholeHousePlan,
    houseRoomById,
    selectedPlanRoomContext,
    roomSnapshotById,
  } = sceneReadModel;
  const { wholeHomeShoppingSummary } = roomReadModel;
  const { findPlanRoomAtWorldPoint } = sceneReadQueries;
  const { selectedIds, selectedInstanceId, selectedItem } =
    itemSelectionController.state;
  const { selectedIds: selectedIdsRef, primaryId: primaryIdRef } =
    itemSelectionController.refs;
  const {
    updateSelection,
    clearSelection,
    selectItem: handleSelect,
  } = itemSelectionController.actions;
  const {
    getActiveItems: getActiveCatalogPlacementItems,
    getActiveRoomId: getActiveCatalogPlacementRoomId,
    getRooms: getCatalogPlacementRooms,
  } = itemDocumentController.queries;
  const {
    commitItems,
    commitItemsToRoom,
    setItemsPresent,
    createInstanceId: newInstanceId,
    selectItemsInRoom: selectCatalogPlacementItems,
  } = itemDocumentController.actions;

  const {
    state: { isExporting, isPdfExporting },
    actions: { exportImages, exportPdf },
  } = useDesignPagePresentationBackupRegistrationFacade({
    boundaries: {
      coreShell: coreShellRegistration,
      documentSelection: documentSelectionRegistration,
    },
  });

  const {
    state: { startingCheckout, openingBillingPortal },
    actions: {
      openBillingPortal,
      openPlansFromUpgrade,
      signInFromUpgrade,
      closeUpgradeDialog,
      closePlansDialog,
      manageBillingFromPlans,
      startCheckoutFromPlans,
    },
  } = useDesignPageWorkspaceDeferredPaywallRegistration({
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
    boundaries: {
      coordination: selectionCoordinator,
      inspection: productInspectionController,
      geometry: itemGeometryController,
    },
    state: {
      inspection: {
        rotationSnapEnabled,
        rotationSnapStepDegrees,
        rotationSnapStepRadians,
        previewVariantId,
        previewMaterialPresetId,
      },
    },
    derived: { selectedProduct, itemPlanningBoundsByInstanceId },
    resolvers: {
      resolveItemConfigurationEntry,
      resolveConfiguredVisualDimsMm,
      resolveConfiguredPlanningDimsMm,
      resolveConfiguredNodeTransforms,
      resolveConfiguredModelUrl,
    },
    actions: {
      selection: {
        clearNonRoomSelection,
        clearAllSelection,
        deletePlanOverlayById,
        handleSelectPlanOverlay,
      },
      roomGeometry: {
        changeActiveRoomHeightMm: handleActiveRoomHeightMmChange,
        changeSelectedWallHeight: handleSelectedWallHeightChange,
        resetSelectedWallHeight: handleResetSelectedWallHeight,
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
      geometry: { getItemAABB },
    },
  } = selectionInspectionRuntime;

  const {
    state: {
      room: { pendingRoomRenameId, pendingRoomRenameValue },
      overlay: {
        editorScene2D,
        roomConnectionChecklistItems,
        annotationToolKind,
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
        selectedObjectContext,
        selectedObjectInspector,
        selectedPlanAnnotation,
        selectedPlanFixedElement,
        visiblePlanOpening,
        visiblePlanOpeningMaxHeightMeters,
        visiblePlanOpeningRoomName,
        visiblePlanOpeningWallSpanMeters,
      },
    },
    derived: {
      floatingPlanOverlayStackVisible,
      floatingFloorPropertiesPanelVisible,
      inlineFloorPropertiesPanelVisible,
      plan2DSafeAreaLeftPx,
      selectionInspectorDockedWithRightRail,
      selectionInspectorRightPx,
      selectionInspectorTopPx,
      selectionInspectorWidthPx,
      plan2DSafeAreaRightPx,
      plan2DSafeAreaBottomPx,
      plan2DFitBounds,
      exportReadinessItems,
      exportReadinessReadyCount,
      exportReadinessScore,
      lightConfig,
      sceneBackgroundColor,
      effectivePlanLayers,
      effectivePlanTheme,
      planCanvasCursor,
      compactRoomPlanStatusBar,
      showRoomPlanStatusHealth,
      planCanvasOverlaysState,
    },
    refs: {
      quality: { setReviewPanelNode: setPlanQualityReviewPanelNode },
    },
    actions: {
      room: {
        switchRoom: handleSwitchRoom,
        startRoomRename: handleRenameSelectedPlanRoom,
        setPendingRoomRenameValue,
        cancelRoomRename,
        commitRoomRename,
        duplicateRoom: handleDuplicateSelectedPlanRoom,
        deleteRoom: handleDeleteSelectedPlanRoom,
        resizeRoom2D: handleResizeRoom2D,
        commitRoomDimensionEdit2D: handleCommitRoomDimensionEdit2D,
        commitActiveRoomDimension: handleCommitActiveRoomDimension,
        changeRoomPreset: handleRoomPresetChange,
        nudgeSelectedPlanRoom,
      },
      overlay: {
        setPendingAnnotationText,
        cancelPlanAnnotation,
        commitPlanAnnotation,
        handleMoveOpening2D,
        handleResizeOpening2D,
        handleUpdateOpeningMetrics2D,
        handleAddSuggestedDoorway,
        handleMoveFixedElement2D,
        handleMoveAnnotation2D,
        runPlanOverlayCommand,
        applyPlanLayerPresetInTransaction,
        selectAnnotationTool,
      },
      quality: {
        toggleReviewPanel: togglePlanQualityReviewPanel,
        activateIssue: handlePlanQualityAction,
      },
      clearPlanFocusPoints,
    },
  } = planWorkspace;
  const {
    derived: surfaceWorkspaceDerived,
    actions: surfaceWorkspaceActions,
  } = surfaceWorkspace;
  const {
    state: {
      pendingTemplateReplacement: pendingPlanTemplateReplacement,
    },
    actions: {
      applyPlanTemplate: handleApplyPlanTemplate,
      uploadUnderlay: handleFloorPlanUnderlayUpload,
      changeUnderlayOpacity: handleFloorPlanUnderlayOpacityChange,
      changeUnderlayLock: handleFloorPlanUnderlayLockChange,
      changePdfPage: handleFloorPlanPdfPageChange,
      addCalibrationPoint: handleFloorPlanCalibrationPoint,
      resetCalibrationPoints: handleResetFloorPlanCalibrationPoints,
      applyCalibration: handleApplyFloorPlanCalibration,
      clearUnderlay: handleClearFloorPlanUnderlay,
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
    tracing: planTracing,
    presentationState,
    zone: zoneController,
  } = editorInteractionRegistration.boundaries;
  const { plan2DWholeHomeViewFit } = cameraWorkspace.state.navigation;
  const {
    handleEditorViewModeChange,
    handleFitPlanView,
    handleFitSelectedPlanRoom,
    handleWholeHomeMoveTarget,
    handleWholeHomeMoveCamera,
    nudgeWholeHomeCameraForDrag,
    handleWholeHomeNavigatorZoom,
    handleWholeHomeFocusRoom,
    getEyeLevelView,
    getFocusView,
  } = cameraWorkspace.actions.navigation;
  const {
    controlsEnabled: canvasControlsEnabled,
    gridPulse,
  } = cameraWorkspace.state.canvas;
  const { itemDragCommit: dragCommitRef } = cameraWorkspace.refs.canvas;
  const {
    changeCatalogObjectDragging: setSofaDragging,
    changeSceneItemDragging: handleDraggingChange,
    changePlanRoomDragging: handlePlanRoomDragStateChange,
    changePlanRoomResizing: handlePlanRoomResizeStateChange,
    changePlanOverlayDragging: handlePlanOverlayDragStateChange,
    changePlanOpeningDragging: handlePlanOpeningDragStateChange3D,
    pulseSnapGrid: triggerGridPulse,
    handleOrbitChange: handleOrbitControlsChange,
  } = cameraWorkspace.actions.canvas;

  const {
    state: { consumerPlanCompletionSignal },
    actions: {
      choosePlanGuidedActionsMode,
      handleConsumerPlanCompletionHandled,
      selectFloorPlanTool: handleSelectFloorPlanTool,
      changeCalibrationMode: handleFloorPlanCalibrationModeChange,
      addFloorPlanOpeningFromTool: handleAddFloorPlanOpeningFromTool,
      changeTraceRoomMode: handleFloorPlanTraceRoomModeChange,
      changeDrawRoomMode: handleFloorPlanDrawRoomModeChange,
      changeTraceOpeningMode: handleFloorPlanTraceOpeningModeChange,
      resetTraceOpeningPoints: handleResetFloorPlanTraceOpeningPoints,
      traceOpeningPoint: handleFloorPlanTraceOpeningPoint,
      traceBlankGridOpeningPoint: handleBlankGridTraceOpeningPoint,
      handleApplyFloorPlanExactWallLength,
      handleBlankGridRoomDrawDrag,
      handleBlankGridRoomDrawPoint,
      handleBlankGridRoomDrawPreviewPoint,
      handleCommitWallDrawSegmentLength2D,
      handleFloorPlanTraceRoomPoint,
      handleResetFloorPlanTraceRoomPoints,
      handleUndoFloorPlanTraceRoomPoint,
    },
  } = planTracing;
  const {
    state: { cameraViewNameInput, layoutVersionNameInput },
    actions: {
      setCameraViewNameInput,
      saveCurrentNamedView,
      deleteSavedCameraView,
      openSavedCameraView,
      setLayoutVersionNameInput,
      saveCurrentLayoutVersion,
      restoreRoomLayoutVersion,
      deleteRoomLayoutVersion,
    },
  } = presentationState;

  const {
    state: { selectedZone, pendingZoneType, planZones2D },
    actions: {
      setPendingZoneType,
      createZoneFromSelection,
      autoCreateSeatingZone,
      autoLayoutZone,
      rotateZone,
      ungroupZone,
    },
    resolvers: { getZoneBounds },
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
        lastPersistedSnapshotFingerprint,
        isSaving,
        saveStatus,
        sharingDesign,
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
        saveDesignToCloud,
        retrySaveStatus,
        createShareLinkAndCopy,
        closeShareLinkFallback,
        copyFallbackShareLink,
        openFallbackShareLink,
        toggleMyDesigns,
        closeMyDesigns,
        handleLoadDesign,
        toggleSavedDesignSelection,
        toggleAllSavedDesignSelection,
        requestDeleteSavedDesigns,
        cancelDeleteSavedDesigns,
        handleDeleteSavedDesign,
        openGuestPrompt,
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
  const { walls } = aiWorkspaceRegistration.derived;
  const { panel: panelController } = aiPanelRegistration.boundaries;
  const { actions: panelActions } = panelController;
  const {
    state: { notes: aiNotesState },
    actions: {
      layout: {
        applyPendingProposal: applyPendingAiLayoutProposal,
        dismissPendingProposal: dismissPendingAiLayoutProposal,
        bulkSwap: onBulkSwap,
      },
      notes: {
        generate: generateAINotes,
        applySuggestion,
        close: closeAiNotes,
      },
    },
  } = aiPanelRegistration;
  const {
    open: showAINotes,
    loading: aiNotesLoading,
    data: aiNotesData,
  } = aiNotesState;

  const catalogPlacementRegistration =
    useDesignPageCatalogPlacementRegistrationFacade({
      state: { crossRoomDragTarget },
      configuration: {
        activeRoom,
        activeRoomId: designSnapshot.activeRoomId,
        rooms: designSnapshot.rooms,
        roomSnapshotById,
        houseRoomById,
        planOpenings,
        roomWidth,
        roomDepth,
        wallThickness,
        placementAddMode,
        hasWholeHousePlan,
        catalogCanvasDragDisabled:
          isClientPreview || editorMode === "present",
      },
      refs: {
        designSnapshot: designSnapshotRef,
        activeItems: itemsRef,
        dragCommit: dragCommitRef,
      },
      actions: {
        getActiveItems: getActiveCatalogPlacementItems,
        getActiveRoomId: getActiveCatalogPlacementRoomId,
        getRooms: getCatalogPlacementRooms,
        getItemAABB,
        getPlanningDimensions: resolveConfiguredPlanningDimsMm,
        commitItemsToRoom,
        selectItems: selectCatalogPlacementItems,
        createInstanceId: newInstanceId,
        showToast: showRuleToast,
        clampToActiveRoom,
        resolveGroundPointFromClient,
        findPlanRoomAtWorldPoint,
        nudgeCameraForDrag: nudgeWholeHomeCameraForDrag,
        setCanvasObjectDragging: setSofaDragging,
        setCrossRoomDragTarget,
        setDesignSnapshot,
        updateSelection,
        history,
      },
    });
  const {
    boundaries: {
      roomQueries: placementRoomQueries,
      catalogPlacement: catalogPlacementController,
      crossRoomTransfer: crossRoomTransferController,
    },
    state: { pendingCatalogPlacement, hoverCatalogPlacement },
    derived: {
      pendingCatalogPlacementScene,
      hoverCatalogPlacementScene,
      activeCatalogPlacementSurfaceHighlight,
      pendingCatalogPlacementRoom,
      activePlacementCompatibleZoneIds,
      circulationHeatmap,
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
      placementTargetPlanRoom,
      placementTargetRoom,
    },
    actions: {
      clampToCatalogPlacementRoom,
      findCatalogPlacementBlockerInRoom,
      isCatalogPlacementContainedInRoom,
      getItemDisplayName,
      targetPendingCatalogPlacementToRoom:
        targetPendingCatalogPlacementToRoomAction,
      rotatePendingCatalogPlacement,
      nudgePendingCatalogPlacement,
      centerPendingCatalogPlacement,
      autoPlacePendingCatalogPlacement,
      improvePendingCatalogPlacement,
      restoreLastValidCatalogPlacement,
      movePendingCatalogPlacementToBestRoom:
        movePendingCatalogPlacementToBestRoomAction,
      switchPendingCatalogPlacementToBestOption,
      addCatalogItemDirectlyToRoom,
      addCatalogItemToRoom,
      previewCatalogPlacementIntent,
      selectPendingCatalogPlacementBlocker,
      placePendingCatalogBesideBlocker,
      trySmallerPendingCatalogVariant,
      movePendingCatalogBlockerAside,
      swapPendingCatalogWithBlocker,
      confirmPendingCatalogPlacement,
      cancelPendingCatalogPlacement,
      handleCatalogPlacementPointerDown,
      handleCatalogPlacementPointerMove,
      handleCatalogPlacementPointerUp,
      handleCatalogCanvasDragOver,
      handleCatalogCanvasDrop,
      handleCatalogCanvasDragLeave,
      transferItemToRoom,
    },
  } = catalogPlacementRegistration;

  const canEditPlanGeometry = !isClientPreview;
  const placementTargetingController = useDesignPageSurfaceTargetingFacade({
    state: {
      targeting: { editorMode, surfaceBrush: {
        active: surfaceBrushActive, materialId: surfaceBrushMaterialId, paint: surfaceBrushPaint,
      } },
      inspector: {
        context: surfaceInspectorContext, selectedPlanRoom: selectedPlanRoomContext,
        hasSelectedItem: Boolean(selectedItem), hasVisiblePlanOpening: Boolean(visiblePlanOpening),
        hasSelectedPlanFixedElement: Boolean(selectedPlanFixedElement), hasSelectedPlanAnnotation: Boolean(selectedPlanAnnotation),
        planMeasurementUnit,
      },
    },
    configuration: { targeting: {
      canApplySurfaceBrush: surfaceWorkspaceDerived.canApplySurfaceBrush,
    },
      inspector: { canEdit, canEditPlanGeometry, isDesigner },
    },
    refs: { designSnapshot: designSnapshotRef },
    actions: {
      targetPendingCatalogPlacementToRoom:
        targetPendingCatalogPlacementToRoomAction,
      clearNonRoomSelection,
      setSelectedPlanRoomId,
      setSelectedRendererSurfaceTarget,
      setSelectedWallSurfaceTarget,
      preserveCameraAfterPlanOverlaySelection,
      resetFloorPlanTraceRoomPoints: handleResetFloorPlanTraceRoomPoints,
      switchRoom: handleSwitchRoom,
      setEditorMode,
      setActiveSurfaceTarget,
      surfaceWorkspace: surfaceWorkspaceActions,
      track,
      inspectorUi: surfaceInspectorUiActions,
      changeSelectedWallHeight: handleSelectedWallHeightChange,
      resetSelectedWallHeight: handleResetSelectedWallHeight,
    },
  });
  const { surfaceInspector: selectedSurfaceInspectorState } =
    placementTargetingController.state;
  const {
    targetPendingCatalogPlacementToRoom,
    handlePlacementAwareRoomSelect,
    handleRendererSurfaceTargetSelect,
    surfaceInspector: selectedSurfaceInspectorActions,
  } = placementTargetingController.actions;

  const movePendingCatalogPlacementToBestRoom = useCallback(() => {
    movePendingCatalogPlacementToBestRoomAction();
  }, [movePendingCatalogPlacementToBestRoomAction]);

  const {
    actions: {
      previewShoppingReplacement,
      addSelectedImportedToRoom,
      removeFromCart,
      updateCartQty,
      clearCart,
      addAllToRoom,
    },
  } = useDesignPageCommerceActions({
    state: { selectedImportedProductId, itemCart },
    actions: {
      catalog: {
        previewPlacement: previewCatalogPlacementIntent,
        addToRoom: addCatalogItemToRoom,
        addDirectlyToRoom: addCatalogItemDirectlyToRoom,
      },
      importedCatalog: {
        getRelatedProductIds: getRelatedImportedProductIds,
        ensureCatalogItem: ensureImportedCatalogItem,
      },
      cart: { setItems: setItemCart, setOpen: setItemCartOpen },
      navigation: { goFurnish },
      feedback: { showToast: showRuleToast },
    },
  });

  const {
    state: { firstRunActivationState, nextBestActionNudge },
  } = useDesignPageOnboardingRegistrationFacade({
    state: {
      designId,
      shareToken,
      plan,
      editorMode,
      viewMode,
      mode,
      isClientPreview,
      isGuest: !session?.user,
      items,
      zones,
      constraintResults,
      showBetaStart,
      designRoomCount: designSnapshot.rooms.length,
      planRoomCount: housePlan2D.rooms.length,
      saveStatusKind: saveStatus.kind,
      planGuidedActionsEnabled,
      viewportSize,
    },
    actions: {
      autoCreateSeatingZone,
      clampToRoom: clampToActiveRoom,
      showConstraintsForMoment,
      showConfidenceSummary,
      logFunnelEvent,
    },
    configuration: {
      roomWidth,
      roomDepth,
      wallThickness,
    },
  });

  const {
    boundaries: { cabinetry: cabinetryWorkspace },
    state: {
      studio: cabinetryStudioState,
      canUseStudio: canUseCabinetryStudio,
      accessLevel: cabinetryAccessLevel,
      availableSpaces: cabinetryAvailableSpaces,
      preferredSpaceId: cabinetryPreferredSpaceId,
      selectedItem: selectedCabinetItem,
      project: {
        schedulePackage: projectCabinetSchedulePackage,
        handoffPackage: projectCabinetHandoffPackage,
      },
    },
    refs: { openedAt: cabinetryStudioOpenedAtRef },
    actions: {
      openCreateStudio: openCabinetryStudio,
      dismissStudio: dismissCabinetryStudio,
      saveDefinition: handleSaveCabinetDefinition,
      placeInPlan: handlePlaceCabinetInPlan,
    },
  } = useDesignPageCabinetryRegistrationFacade({
    state: {
      activeRoom: activeRoom ?? null,
      planRoomById: houseRoomById,
      planRoomCount: housePlan2D.rooms.length,
      planOpenings,
      activeSurfaceTarget,
      selectedWallFaceId: roomReadModel.activeSelectedWallFaceId,
      selectedItem: selectedItem ?? null,
      designSnapshot,
    },
    configuration: {
      isClientPreview,
      isDesigner,
      canEdit,
      designId,
      roomWidth,
      roomDepth,
      wallThickness,
      rotationSnapEnabled,
      rotationSnapStepRadians,
    },
    refs: { designSnapshot: designSnapshotRef, activeItems: itemsRef },
    actions: {
      setDesignSnapshot,
      commitItems,
      commitItemsToRoom,
      updateSelection,
      createInstanceId: newInstanceId,
      clampToActiveRoom,
      clampToCatalogPlacementRoom,
      isCatalogPlacementContainedInRoom,
      getItemAABB,
      getItemDisplayName,
      showToast: showRuleToast,
    },
  });

  const placementSelectionWorkspace =
    useDesignPagePlacementSelectionWorkspaceFacade({
      boundaries: {
        selection: itemSelectionController,
        document: itemDocumentController,
        coordination: selectionCoordinator,
        inspection: productInspectionController,
        geometry: itemGeometryController,
        roomQueries: placementRoomQueries,
        catalogPlacement: catalogPlacementController,
        crossRoomTransfer: crossRoomTransferController,
        targeting: placementTargetingController,
      },
      state: {
        selection: {
          selectedItemDeleteLabel:
            selectedCabinetItem?.name ??
            selectedCabinetItem?.cabinetDefinition.name ??
            selectedProduct?.title ??
            "Item",
        },
        room: {
          activeRoom: activeRoom ?? null,
          activeRoomShoppingItems: roomReadModel.activeRoomShoppingItems,
        },
        editor: { editorMode, isClientPreview, viewMode },
        plan: {
          selectedPlanOverlayId,
          selectedPlanRoomId: selectedPlanRoomContext?.id ?? null,
          selectedZoneId,
        },
        presentation: { style, designId },
        crossRoomDragTarget,
        placementTargetRoomName: placementTargetRoom?.name ?? null,
      },
      configuration: {
        canEdit,
        isDesigner,
        roomWidth,
        roomDepth,
        wallThickness,
        rotationSnapEnabled,
        rotationSnapStepRadians,
        catalogItems: CATALOG_ITEMS,
      },
      derived: { activeRoomPlanOffset, roomSnapshotById },
      refs: {
        items: itemsRef,
        selectedIds: selectedIdsRef,
        primaryId: primaryIdRef,
        designSnapshot: designSnapshotRef,
      },
      actions: {
        document: {
          setDesignSnapshot,
          replaceActiveItemsSnapshot: (nextItems) => {
            itemsRef.current = nextItems;
          },
        },
        placement: {
          clampToActiveRoom,
          getItemDisplayName,
        },
        room: {
          keyboard: {
            delete: handleDeleteSelectedPlanRoom,
            duplicate: handleDuplicateSelectedPlanRoom,
            nudge: nudgeSelectedPlanRoom,
          },
        },
        history,
        feedback: {
          showToast: showRuleToast,
          showConstraintsForMoment,
          showConfidenceSummary,
          trackFirstInteraction,
        },
      },
    });
  const {
    alignSelectionX,
    alignSelectionZ,
    applyItemRotation,
    duplicateSelectedItem,
    deleteSelectedItem,
    centerSelectedItemInRoom,
    snapSelectedItemToNearestWall,
    moveSelectedItemToRoom,
  } = placementSelectionWorkspace.actions.interaction;
  const {
    activeTargetValid: activePlacementTargetValid,
    activeTargetLabel: activePlacementTargetLabel,
  } = placementSelectionWorkspace.derived.placement;
  const presentationQaWorkspace = useDesignPagePresentationQaFacade({
    state: {
      identity: { designId, shareToken },
      editor: { mode, viewMode, editorMode, isClientPreview, isDesigner,
        authenticated: Boolean(session?.user), plan, aiDesignEnabled, canUndo, canRedo, undoName, redoName },
      document: { snapshot: designSnapshot, activeRoom: activeRoom ?? null, activeRoomItemCount: items.length,
        roomWidth, roomDepth, zones },
      persistence: { lastPersistedSnapshotFingerprint, isSaving, saveStatus },
      presentation: {
        exportReadiness: { items: exportReadinessItems, readyCount: exportReadinessReadyCount, score: exportReadinessScore },
        presentModeRoomId, cameraViewNameInput, layoutVersionNameInput, simplePlanControls, lightingPreset,
        sharingDesign, exportStylePreset, isExporting, isPdfExporting, aiNotesLoading,
      },
      plan: { planLayerPreset, planLayers, planMeasurementUnit, planTheme, annotationToolKind,
        selectedPlanOverlayId, visiblePlanOpening, visiblePlanOpeningRoomName, visiblePlanOpeningWallSpanMeters,
        visiblePlanOpeningMaxHeightMeters, houseRoomCount: housePlan2D.rooms.length, openingCount: planOpenings.length,
        selectedPlanRoomId, commandSelectedPlanRoomId: selectedPlanRoomContext?.id ?? null },
      scene: { mode: sceneReadState.scenePerformanceMode, liteEnabled: sceneReadState.liteSceneEnabled, renderQuality: sceneReadState.sceneRenderQuality,
        autoLite: sceneReadState.autoLiteScene, sceneReady, roomCount: designSnapshot.rooms.length, activeRoomItemCount: items.length,
        sceneItemCount: sceneReadModel.sceneRoomItems.length, lastFps: sceneReadState.scenePerformanceSample.lastFps,
        fpsSamples: sceneReadState.scenePerformanceSample.samples, planDebugMetrics },
      selection: { itemId: selectedItem?.instanceId ?? null, productId: selectedItem?.productId ?? null,
        hasSelectedItem: Boolean(selectedItem) },
      placement: { score: pendingCatalogPlacementScore?.score ?? null, kind: pendingCatalogPlacementScore?.kind ?? null,
        targetRoomName: pendingCatalogPlacementRoom?.name ?? null },
      shopping: { readyCount: wholeHomeShoppingSummary.shoppableCount,
        needsReviewCount: wholeHomeShoppingSummary.needsReviewCount },
      viewport: { width: viewportSize.width, height: viewportSize.height },
      chrome: { openingBillingPortal, millworkActive: cabinetryStudioState !== null, activeRoomHealthSummary,
        showBetaStart, firstRunActivation: firstRunActivationState, designPanelOpen },
      qa: { showLayoutDebugOverlay,
        history: { pastCount: historyDebugSnapshot.past.length, futureCount: historyDebugSnapshot.future.length,
          transactionName: historyDebugSnapshot.txn?.name ?? null },
        cabinetSchedule: projectCabinetSchedulePackage, cabinetHandoff: projectCabinetHandoffPackage },
    },
    configuration: { presentOpen: editorMode === "present" && showPresentModal, designerTheme: showDesignerTheme,
      canUseDesigner, canUseCabinetryStudio, compactRoomStatus: compactRoomPlanStatusBar,
      showRoomHealth: showRoomPlanStatusHealth, eyeLevelTransitionDurationMs: 500, focusTransitionDurationMs: 460 },
    actions: {
      shell: { setPresentModalOpen: setShowPresentModal, setEditorMode, setPresentModeRoomId, setDesignSnapshot,
        changeViewMode: handleEditorViewModeChange, setUpgradeReason, setUpgradeOpen: setShowUpgrade,
        setDesignPanelOpen, setItemCartOpen, setClientPreview, setUrlMode },
      camera: { getEyeLevelView, getFocusView, transitionToView: transitionToCameraView,
        setName: setCameraViewNameInput, save: saveCurrentNamedView, open: openSavedCameraView,
        delete: deleteSavedCameraView },
      layoutVersions: { setName: setLayoutVersionNameInput, save: saveCurrentLayoutVersion,
        restore: restoreRoomLayoutVersion, delete: deleteRoomLayoutVersion },
      history: { runTransaction: runHistoryTransaction, undo: undoSafe, redo: redoSafe },
      plan: { setSimpleControls: setSimplePlanControls, runOverlayCommand: runPlanOverlayCommand,
        setTheme: setPlanTheme, setLayers: setPlanLayers, setMeasurementUnit: setPlanMeasurementUnit,
        setOpenings: setPlanOpenings, setFixedElements: setPlanFixedElements, selectOverlay: handleSelectPlanOverlay,
        selectAnnotationTool, deleteOverlay: deletePlanOverlayById, changeOpening: handleUpdateOpeningMetrics2D,
        applyLayerPresetInTransaction: applyPlanLayerPresetInTransaction,
        addFloorPlanOpening: handleAddFloorPlanOpeningFromTool, fitPlanView: handleFitPlanView,
        duplicateRoom: handleDuplicateSelectedPlanRoom, deleteRoom: handleDeleteSelectedPlanRoom },
      planCanvas: { setGuidedActionsChoiceSeen: setPlanGuidedActionsChoiceSeen,
        chooseGuidedActionsMode: choosePlanGuidedActionsMode, selectFloorPlanTool: handleSelectFloorPlanTool,
        setGuidedPlanStartMode, changeCalibrationMode: handleFloorPlanCalibrationModeChange,
        changeDrawRoomMode: handleFloorPlanDrawRoomModeChange, setGuidedActionsEnabled: setPlanGuidedActionsEnabled,
        undoFloorPlanTraceRoomPoint: handleUndoFloorPlanTraceRoomPoint, clearPlanFocusPoints,
        setPlanFocusPanelRevealed, dismissPlanCanvasGuidance: setDismissedPlanCanvasGuidanceKey },
      selection: { duplicateItem: duplicateSelectedItem, deleteItem: deleteSelectedItem },
      navigation: { plan: goPlan, furnish: goFurnish, aiDesign: goAiDesign, shop: goShop },
      dialogs: { setPlansOpen: setShowPlans, openNewPlan: openNewPlanPicker, setFeedbackOpen },
      billing: { openPortal: openBillingPortal },
      persistence: { toggleMyDesigns, saveDesignToCloud, retrySaveStatus, openGuestPrompt,
        getStoredDesignForPersistence: documentHistoryRefs.getStoredDesignForPersistence },
      cabinetry: { openStudio: openCabinetryStudio },
      room: { reviewHealth: roomReadActions.reviewActiveRoomHealth, rename: handleRenameSelectedPlanRoom },
      scenePerformance: { changeMode: sceneReadActions.handleScenePerformanceModeChange },
      betaStart: betaStartActions,
      presentation: { changeLightingPreset: setLightingPreset, createShareLink: createShareLinkAndCopy,
        setExportStylePreset, exportImages, exportPdf, generateAiNotes: generateAINotes },
      feedback: { showToast: showRuleToast },
    },
  });
  const {
    derived: { betaFeedbackContext },
    actions: { planCanvas: planCanvasActions },
    regions: { presentExport: presentExportDialog, editorChrome: editorChromeModel,
      presentationQaLayer: presentationQaLayerModel },
  } = presentationQaWorkspace;

  const {
    actions: {
      handleMove: handleSceneItemMove,
      handleDragEnd: handleSceneItemDragEnd,
    },
  } = useDesignPageSceneItemDrag({
    state: {
      hasWholeHousePlan,
      designerMode: isDesigner,
      activeRoom,
      roomWidth,
      roomDepth,
      wallThickness,
      roomSnapshotById,
    },
    refs: {
      items: itemsRef,
      selectedIds: selectedIdsRef,
      dragCommit: dragCommitRef,
    },
    actions: {
      findPlanRoomAtWorldPoint,
      setCrossRoomDragTarget: (target) => setCrossRoomDragTarget(target),
      findPlacementBlocker: findCatalogPlacementBlockerInRoom,
      isPlacementContained: isCatalogPlacementContainedInRoom,
      clampToRoom: clampToActiveRoom,
      getItemBounds: getItemAABB,
      getItemDisplayName,
      setItems: setItemsPresent,
      history,
      trackFirstInteraction,
      showToast: showRuleToast,
      moveSelectionToRoom: moveSelectedItemToRoom,
      transferItemToRoom,
      showConstraints: showConstraintsForMoment,
      showConfidence: showConfidenceSummary,
    },
  });
  const sceneCanvasRegionModel = buildDesignPageSceneRegionAdapter({
    state: {
      editor: { viewMode, editorMode, isClientPreview, isDesigner, canEdit },
      scene: {
        liteEnabled: sceneReadState.liteSceneEnabled,
        loadingVisible: sceneReadState.showSceneLoadingVeil,
        performanceMode: sceneReadState.scenePerformanceMode,
        renderQuality: sceneReadState.sceneRenderQuality,
        controlsEnabled: canvasControlsEnabled,
        cameraY: cameraView.pos[1],
        planDiagnostics: {
          valid: planDebugMetrics.cameraValid,
          recoveries: planDebugMetrics.cameraRecoveries,
          targetX: planDebugMetrics.cameraTargetX,
          targetZ: planDebugMetrics.cameraTargetZ,
          projectedRoomMinWidthPx: planDebugMetrics.projectedRoomMinWidthPx,
          projectedRoomMinHeightPx: planDebugMetrics.projectedRoomMinHeightPx,
          projectedRoomMinAreaPx: planDebugMetrics.projectedRoomMinAreaPx,
        },
        cursor: planCanvasCursor,
        backgroundColor: sceneBackgroundColor,
        lightConfig,
        showGrid,
        gridPulse,
      },
      plan: {
        fit: plan2DWholeHomeViewFit,
        orientation: plan2DWholeHomeViewFit.orientation,
        fitBounds: {
          widthMeters: plan2DFitBounds.widthMeters, depthMeters: plan2DFitBounds.depthMeters,
          centerX: plan2DFitBounds.centerX, centerZ: plan2DFitBounds.centerZ,
        },
        safeArea: { leftPx: plan2DSafeAreaLeftPx, rightPx: plan2DSafeAreaRightPx, bottomPx: plan2DSafeAreaBottomPx },
        rooms: housePlan2D.rooms,
        underlay: floorPlanUnderlay,
        calibration: { enabled: floorPlanCalibrationMode, points: floorPlanCalibrationPoints },
        roomTrace: {
          enabled: floorPlanTraceRoomMode,
          interactionMode: floorPlanDrawRoomMode,
          points: floorPlanTraceRoomPoints,
          previewPoint: blankGridRoomPreviewPoint,
          drawOnBlankGrid: blankGridRoomDrawActive,
        },
        openingTrace: { enabled: floorPlanTraceOpeningMode, points: floorPlanTraceOpeningPoints, kind: floorPlanTraceOpeningKind },
        width: planViewWidth,
        depth: planViewDepth,
        selectedRoomId: selectedPlanRoomId,
        selectedOverlayId: selectedPlanOverlayId,
        suppressedDoorwaySuggestionKeys,
        editorScene: editorScene2D,
        zones: planZones2D,
        qualityIssues: floorPlanQualityReport.issues,
        measurementUnit: planMeasurementUnit,
        theme: effectivePlanTheme,
        layers: effectivePlanLayers,
      },
      room: {
        activeId: designSnapshot.activeRoomId,
        guidanceActiveId: activeRoom?.id ?? null,
        activePlanOffset: activeRoomPlanOffset,
        activeFloorLevel, stackedFloors: documentFloorState.stackedFloorView,
        wholeHomeEnabled: sceneReadModel.usesHousePlanScene,
        wholeHomeRooms: sceneReadModel.sceneHousePlanRooms3D,
        selectedSurfaceTarget: selectedRendererSurfaceTarget,
        width: roomWidth, depth: roomDepth, height: roomHeight, wallThickness,
        slabThickness: activeRoom?.geometry.slabThickness,
        wallOpacity: roomReadModel.activeRoomWallOpacity,
        floorOpacity: roomReadModel.activeRoomFloorOpacity,
        ceilingOpacity: roomReadModel.activeRoomCeilingOpacity,
        ceilingVisible: roomReadModel.activeRoomCeilingVisible, ceilingColor: roomReadModel.activeRoomCeilingColor,
        walls,
      },
      placement: {
        targetRoom: placementTargetPlanRoom,
        showTargetRoom: Boolean(
          pendingCatalogPlacement || crossRoomDragTarget
        ),
        targetValid: activePlacementTargetValid,
        supportSurface: activeCatalogPlacementSurfaceHighlight,
        compatibleZoneIds: activePlacementCompatibleZoneIds,
        pending: pendingCatalogPlacement !== null,
        hover: hoverCatalogPlacement !== null,
        pendingScene: pendingCatalogPlacementScene,
        hoverScene: hoverCatalogPlacementScene,
        hardInvalid: pendingCatalogPlacementHardInvalid,
        pendingRoomSize: pendingCatalogPlacementRoom
          ? {
              width: pendingCatalogPlacementRoom.geometry.width,
              depth: pendingCatalogPlacementRoom.geometry.depth,
            }
          : null,
      },
      zones: {
        entries: zones,
        selectedId: selectedZoneId,
        circulationHeatmap: circulationHeatmap
          ? {
              cells: circulationHeatmap.analysis.heatmap,
              roomOffset: circulationHeatmap.roomOffset,
            }
          : null,
      },
      items: {
        entries: sceneReadModel.sceneRoomItems, selectedIds, selectedInstanceId,
        previewVariantId, previewMaterialPresetId, hoveredCartInstanceId,
        activeSceneItemsForGuides: roomReadModel.activeSceneItemsForGuides, itemPlanningBoundsByInstanceId,
      },
      aiLayout: { footprints: sceneReadModel.aiLayoutPreviewFootprints, tone: sceneReadModel.aiLayoutPreviewTone },
    },
    configuration: {
      initialCameraView: DEFAULT_EDITOR_CAMERA_VIEW,
      orbit: {
        minDistance: EDITOR_3D_MIN_CAMERA_DISTANCE,
        maxDistance: Math.max(
          24,
          Math.max(planViewWidth, planViewDepth) * 6
        ),
        minPolarAngle: EDITOR_3D_MIN_POLAR_ANGLE,
        maxPolarAngle: EDITOR_3D_MAX_POLAR_ANGLE,
      },
      snapEnabled, rotationSnapStepRadians,
      rotationSnapStepDegrees, rotationSnapEnabled,
    },
    references: {
      canvas: { canvas: canvasRef, camera: cameraRef, controls: orbitControlsRef, renderer: rendererRef, scene: sceneRef },
    },
    resolvers: {
      guidance: { getZoneBounds },
      items: {
        resolveItemConfigurationEntry, resolveConfiguredVisualDimsMm,
        resolveConfiguredPlanningDimsMm, resolveConfiguredModelUrl,
        resolveConfiguredNodeTransforms,
        getRoomItems: (roomId) =>
          roomSnapshotById.get(roomId)?.items ?? [],
      },
    },
    actions: {
      shell: { onDragOver: handleCatalogCanvasDragOver, onDrop: handleCatalogCanvasDrop, onDragLeave: handleCatalogCanvasDragLeave },
      canvas: {
        onClearSelection: clearAllSelection,
        onPlanDiagnosticsChange: handlePlan2DCameraDiagnosticsChange,
        updateProjection, onSceneProgressReadyChange: sceneReadActions.setSceneProgressReady,
        onFpsSample: sceneReadActions.handleScenePerformanceSample, onSustainedLowFps: sceneReadActions.handleSustainedLowFps,
        onOrbitChange: handleOrbitControlsChange,
      },
      structure: {
        underlay: {
          addCalibrationPoint: handleFloorPlanCalibrationPoint, addRoomTracePoint: handleFloorPlanTraceRoomPoint,
          addOpeningTracePoint: handleFloorPlanTraceOpeningPoint,
        },
        rooms: {
          select: handlePlacementAwareRoomSelect,
          selectSurfaceTarget: handleRendererSurfaceTargetSelect,
          clearSelection: clearAllSelection, rename: handleRenameSelectedPlanRoom,
          duplicate: handleDuplicateSelectedPlanRoom, delete: handleDeleteSelectedPlanRoom,
          editFloor: surfaceWorkspaceActions.openFloorEditorForRoom,
          fit: handleFitSelectedPlanRoom,
          move: documentRoomActions.handleMoveRoom2D, resize: handleResizeRoom2D,
          setDragging: handlePlanRoomDragStateChange,
          setResizing: handlePlanRoomResizeStateChange,
        },
        overlays: {
          select: handleSelectPlanOverlay, delete: deletePlanOverlayById,
          moveOpening: handleMoveOpening2D, resizeOpening: handleResizeOpening2D,
          addDoorwaySuggestion: handleAddSuggestedDoorway,
          moveFixedElement: handleMoveFixedElement2D, moveAnnotation: handleMoveAnnotation2D,
          setDragging: handlePlanOverlayDragStateChange,
        },
        drawing: {
          addRoomPoint: handleBlankGridRoomDrawPoint, previewRoomPoint: handleBlankGridRoomDrawPreviewPoint,
          commitRoomDimension: handleCommitRoomDimensionEdit2D,
          commitWallSegmentLength: handleCommitWallDrawSegmentLength2D,
          drawRoom: handleBlankGridRoomDrawDrag, addOpeningPoint: handleBlankGridTraceOpeningPoint,
        },
        wholeHome: { setOpeningDragging: handlePlanOpeningDragStateChange3D },
        reportPlanMetrics: handlePlanDebugMetricsChange,
      },
      guidance: {
        showToast: showRuleToast, targetPendingPlacementToRoom: targetPendingCatalogPlacementToRoom,
        selectZone: setSelectedZoneId,
        clearSelection,
      },
      items: {
        onDraggingChange: handleDraggingChange, onRenderReadyChange: sceneReadActions.handleSceneRenderItemReadyChange,
        selectItem: handleSelect, trackFirstInteraction,
        onDuplicateSelectedItem: duplicateSelectedItem, onDeleteSelectedItem: deleteSelectedItem,
        onMove: handleSceneItemMove,
        onDragPointerMove: hasWholeHousePlan
          ? nudgeWholeHomeCameraForDrag
          : undefined,
        applyItemRotation, onSnapPulse: triggerGridPulse, onDragEnd: handleSceneItemDragEnd,
      },
      preview: {
        onPlacementPointerDown: handleCatalogPlacementPointerDown, onPlacementPointerMove: handleCatalogPlacementPointerMove,
        onPlacementPointerUp: handleCatalogPlacementPointerUp,
      },
    },
  });
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
  const panelRegionModel = buildDesignPagePanelRegistration({
    boundaries: {
      cabinetry: cabinetryWorkspace,
      floorPlanDocument: floorPlanDocumentController,
      importedModels: importedModelsWorkspace,
      panel: panelController,
      placementSelection: placementSelectionWorkspace,
      planDocument: planDocumentController,
      roomFloor: roomFloorWorkspace,
      sceneRoom: sceneRoomReadFacade,
      surfaceState: surfaceStateController,
      surfaceWorkspace,
    },
    state: {
      document: {
        designId,
        plan,
        rooms: designSnapshot.rooms,
        activeRoomId: designSnapshot.activeRoomId,
        authenticated: Boolean(session?.user),
      },
      editor: {
        editorMode,
        controlsMode: designControlsPanelMode,
        controls: { collapsed: designPanelCollapsed, selectionContext: selectedObjectContext,
          viewMode, style, budget, showGrid, snapEnabled },
        shoppingVisible: shoppingPanelVisibleForLayout,
        controlsVisible: designControlsPanelVisibleForLayout,
      },
      plan: {
        roomConnectionChecklistItems, visiblePlanOpening, visiblePlanOpeningRoomName,
        visiblePlanOpeningWallSpanMeters, visiblePlanOpeningMaxHeightMeters,
        planStartMode: guidedPlanStartMode, planCompletionSignal: consumerPlanCompletionSignal,
        floorPlanQualityReport,
      },
      shopping: { readinessFilter: shoppingReadinessFilter, placementAddMode },
      ai: { aiLayoutProposal: pendingAiLayoutProposal },
    },
    derived: {
      surface: { showFloorPropertiesPanel: inlineFloorPropertiesPanelVisible },
    },
    configuration: {
      designerTheme: showDesignerTheme, isDesigner, isClientPreview, canEdit,
      canUseCabinetryStudio, canEditPlanGeometry, aiDesignEnabled,
    },
    actions: {
      navigation: {
        signIn: signInWithReturn, goFurnish, goAiDesign, goShop,
        selectRoom: handleSwitchRoom, changePlacementAddMode: setPlacementAddMode,
        changeStyle: setStyle, changeBudget: setBudget,
      },
      room: {
        changePreset: handleRoomPresetChange,
        commitDimension: handleCommitActiveRoomDimension,
        changeHeight: handleActiveRoomHeightMmChange,
        changeWallThickness: handleActiveRoomWallThicknessMmChange,
        changeSlabThickness: handleActiveRoomSlabThicknessMmChange,
        changeBaseboardDepth: handleActiveRoomBaseboardDepthMmChange,
        changeSurfaceOpacity: handleActiveRoomSurfaceOpacityChange,
        changeCeilingVisible: handleActiveRoomCeilingVisibleChange,
        changeCeilingColor: handleActiveRoomCeilingColorChange,
      },
      floorPlan: {
        completionHandled: handleConsumerPlanCompletionHandled,
        changeStartMode: setGuidedPlanStartMode,
        activateQualityIssue: handlePlanQualityAction,
        selectTool: handleSelectFloorPlanTool,
        addOpeningFromTool: handleAddFloorPlanOpeningFromTool,
        applyTemplate: handleApplyPlanTemplate,
        upload: handleFloorPlanUnderlayUpload,
        changePdfPage: handleFloorPlanPdfPageChange,
        changeOpacity: handleFloorPlanUnderlayOpacityChange,
        changeLock: handleFloorPlanUnderlayLockChange,
        changeCalibrationMode: handleFloorPlanCalibrationModeChange,
        applyCalibration: handleApplyFloorPlanCalibration,
        resetCalibrationPoints: handleResetFloorPlanCalibrationPoints,
        changeTraceRoomMode: handleFloorPlanTraceRoomModeChange,
        changeDrawRoomMode: handleFloorPlanDrawRoomModeChange,
        applyExactWallLength: handleApplyFloorPlanExactWallLength,
        undoTraceRoomPoint: handleUndoFloorPlanTraceRoomPoint,
        resetTraceRoomPoints: handleResetFloorPlanTraceRoomPoints,
        changeTraceOpeningMode: handleFloorPlanTraceOpeningModeChange,
        resetTraceOpeningPoints: handleResetFloorPlanTraceOpeningPoints,
        clear: handleClearFloorPlanUnderlay,
        addSuggestedDoorway: handleAddSuggestedDoorway,
        updateOpeningMetrics: handleUpdateOpeningMetrics2D,
      },
      shopping: {
        setReadinessFilter: setShoppingReadinessFilter,
        swapItem: swapShoppingItemReplacement,
        previewReplacement: previewShoppingReplacement,
        bulkSwap: onBulkSwap,
        showUpgrade: () => setShowUpgrade(true),
        openGuestPrompt,
        addImportedToRoom: addSelectedImportedToRoom,
        reviewIssue: reviewShoppingIssue,
      },
      cabinetry: { deleteSelected: deleteSelectedItem },
      ai: {
        onApplyAiLayoutProposal: applyPendingAiLayoutProposal,
        onClearAiLayoutProposal: dismissPendingAiLayoutProposal,
      },
    },
  });
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
