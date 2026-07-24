import { buildDesignControlsPanelModel } from "@/lib/design-page-controls-panel-model";
import { buildDesignPagePanelRegionAdapter } from "@/lib/design-page-panel-region-adapter";
import { buildDesignPageSelectionPanelModels } from "@/lib/design-page-selection-panel-model";
import { buildDesignPageShoppingPanelModel } from "@/lib/design-page-shopping-panel-model";
import type { BuildDesignPagePanelRegistrationInput } from "@/lib/design-page-panel-registration-types";
import { getRoomTypeLabel } from "@/lib/design-page-house-plan";
import { getWallFaceLabel } from "@/lib/surface-settings";

/** Registers all fixed editor panels in their established construction order. */
export function buildDesignPagePanelRegistration({
  boundaries,
  state,
  derived,
  configuration,
  actions,
}: BuildDesignPagePanelRegistrationInput) {
  const {
    cabinetry,
    floorPlanDocument,
    importedModels,
    panel,
    placementSelection,
    planDocument,
    roomFloor,
    sceneRoom,
    surfaceState,
    surfaceWorkspace,
  } = boundaries;
  const room = roomFloor.derived.room;
  const floor = roomFloor.derived.floor;
  const roomActions = roomFloor.actions.room;
  const roomRead = sceneRoom.room.derived;
  const inspection = placementSelection.derived.inspection;
  const inspectionState = placementSelection.state.inspection;
  const interaction = placementSelection.state.interaction;
  const interactionActions = placementSelection.actions.interaction;
  const catalogActions = placementSelection.actions.placement.catalog;
  const panelActions = panel.actions;
  const floorPlan = floorPlanDocument.state;
  const floorPlanActions = floorPlanDocument.actions;

  const shoppingPanelModel = buildDesignPageShoppingPanelModel({
    configuration: { designerTheme: configuration.designerTheme },
    state: {
      overview: {
        activeRoom: roomRead.activeRoomShoppingSummary,
        activeRoomItems: roomRead.activeRoomShoppingItems,
        catalogItems: importedModels.state.catalogItems,
        rooms: roomRead.roomShoppingSummaries,
        wholeHome: roomRead.wholeHomeShoppingSummary,
        activeFilter: state.shopping.readinessFilter,
      },
      cart: {
        items: room.items,
        designId: state.document.designId,
        plan: state.document.plan,
        isGuest: !state.document.authenticated,
      },
    },
    actions: {
      overview: {
        onSelectRoom: actions.navigation.selectRoom,
        onGoFurnish: actions.navigation.goFurnish,
        onAddActiveRoomCartReadyItems:
          interactionActions.addActiveRoomCartReadyItems,
        onSetItemInclude: interactionActions.setShoppingItemInclude,
        onSwapShoppingItem: actions.shopping.swapItem,
        onPreviewReplacement: actions.shopping.previewReplacement,
        onFilterChange: actions.shopping.setReadinessFilter,
      },
      cart: {
        onRemove: panelActions.removeShoppingItem,
        onSetQty: interactionActions.setSelectedItemQuantity,
        onSetInclude: interactionActions.setShoppingItemInclude,
        onBulkSwap: actions.shopping.bulkSwap,
        onShowUpgrade: actions.shopping.showUpgrade,
        openGuestPrompt: actions.shopping.openGuestPrompt,
      },
    },
  });

  const selectionPanelModels = buildDesignPageSelectionPanelModels({
    cabinet: {
      state: {
        cabinet: cabinetry.state.selected!,
        project: {
          handoffPackage: cabinetry.state.project.handoffPackage,
          hasAssets: cabinetry.state.project.assets.length > 0,
        },
      },
      configuration: {
        canEdit: configuration.canEdit,
        canUseStudio: configuration.canUseCabinetryStudio,
        isDesigner: configuration.isDesigner,
        isClientPreview: configuration.isClientPreview,
        designerTheme: configuration.designerTheme,
      },
      actions: {
        center: cabinetry.actions.centerSelected,
        snapToWall: cabinetry.actions.snapSelectedToWall,
        nudge: cabinetry.actions.nudgeSelected,
        rotateByDegrees: cabinetry.actions.rotateSelectedByDegrees,
        resetRotation: cabinetry.actions.resetSelectedRotation,
        export: cabinetry.actions.exportSelected,
        edit: cabinetry.actions.editSelected,
        delete: actions.cabinetry.deleteSelected,
      },
    },
    item: {
      state: {
        document: {
          rooms: state.document.rooms.map(({ id, name }) => ({ id, name })),
          activeRoomId: state.document.activeRoomId,
        },
        details: {
          product: inspection.selectedProduct!,
          item: placementSelection.state.selection.selectedItem,
          measurementUnit: planDocument.state.planMeasurementUnit,
          planningDimensionsMm: inspection.selectedItemPlanningDimensionsMm,
          selectedBrand: inspection.selectedBrand,
          selectedModelTitle: inspection.selectedModelTitle,
          selectedCategoryDebugLabel: inspection.selectedCategoryDebugLabel,
          activeVariantLabel: inspection.activeVariantLabel,
          productDetailSections: inspection.selectedProductDetailSections,
          fullDimensionsDetails: inspection.fullDimensionsDetails,
          selectedDimensionImageUrl: inspection.selectedDimensionImageUrl,
          styleConsistencyReport: inspection.selectedStyleConsistencyReport,
        },
        inspectionController: {
          state: interaction.selectedItemPanelControllerState,
          adjustableHangingHeight: inspection.selectedAdjustablePendantHeight
            ? {
                valueCm: inspection.selectedAdjustablePendantHeight.currentCm,
                minCm: inspection.selectedAdjustablePendantHeight.minCm,
                maxCm: inspection.selectedAdjustablePendantHeight.maxCm,
                stepCm: 1,
              }
            : null,
        },
        rotation: {
          enabled: Boolean(placementSelection.state.selection.selectedItem),
          state: {
            selectedRotationDegrees: interaction.selectedRotationDegrees,
            rotationSnapEnabled: placementSelection.configuration.rotationSnapEnabled,
            rotationSnapStepDegrees: inspectionState.rotationSnapStepDegrees,
            rotationSnapPresetDegrees: inspectionState.rotationSnapPresetDegrees,
            rotationInputValue: inspectionState.rotationInputValue,
            disabled: interaction.rotateControlsDisabled,
          },
        },
        productModelVariants: inspectionState.productModelVariantControlsState,
        productFinishes: inspectionState.productFinishControlsState,
      },
      configuration: {
        dark: configuration.designerTheme,
        isDesigner: configuration.isDesigner,
        isClientPreview: configuration.isClientPreview,
        canEdit: configuration.canEdit,
      },
      actions: {
        inspectionController:
          interactionActions.selectedItemPanelControllerActions,
        placement: {
          onMoveToRoom: interactionActions.moveSelectedItemToRoom,
          onDuplicate: interactionActions.duplicateSelectedItem,
          onDelete: interactionActions.deleteSelectedItem,
          onCenterInRoom: interactionActions.centerSelectedItemInRoom,
          onSnapToWall: interactionActions.snapSelectedItemToNearestWall,
          onNudge: interactionActions.nudgeSelectedItem,
          onAdjustHangingHeight:
            placementSelection.actions.inspection.adjustSelectedPendantHeight,
        },
        rotation: {
          onSnapPresetChange:
            placementSelection.actions.inspection.setRotationSnapPresetDegrees,
          onRotateByDegrees: interactionActions.rotateSelectedByDegrees,
          onResetRotation: interactionActions.resetSelectedRotation,
          onRotationInputChange:
            placementSelection.actions.inspection.setRotationInputValue,
          onApplyRotationInput: interactionActions.applyRotationInputValue,
        },
        productConfiguration: {
          model: placementSelection.actions.inspection.modelControls,
          finish: placementSelection.actions.inspection.finishControls,
          selectVariant: interactionActions.selectProductVariant,
        },
      },
    },
  });

  const designControlsPanelModel = buildDesignControlsPanelModel({
    access: {
      dark: configuration.designerTheme,
      isClientPreview: configuration.isClientPreview,
      isAuthed: state.document.authenticated,
      isDesigner: configuration.isDesigner,
      canEdit: configuration.canEdit,
      canEditPlanGeometry: configuration.canEditPlanGeometry,
      aiDesignEnabled: configuration.aiDesignEnabled,
    },
    panel: { mode: state.editor.controlsMode, state: state.editor.controls },
    room: {
      state: {
        newRoomType: roomFloor.state.room.newRoomType,
        newRoomShape: roomFloor.state.room.newRoomShape,
        activeRoomPresetId: room.activeRoomPresetId,
        roomWidthInput: roomFloor.state.room.roomWidthInput,
        roomDepthInput: roomFloor.state.room.roomDepthInput,
        roomWidth: room.roomWidth,
        roomDepth: room.roomDepth,
        activeRoomName: room.activeRoom?.name ?? "Current room",
        activeRoomId: state.document.activeRoomId,
        rooms: state.document.rooms.map(({ id, name }) => ({ id, name })),
        activeRoomType: room.activeRoom?.roomType ?? "living",
        activeRoomTypeLabel: room.activeRoom
          ? getRoomTypeLabel(room.activeRoom.roomType)
          : "Room",
        activeFloorLevel: floor.activeFloorLevel,
        activeFloorRoomCount: floor.activeFloorRoomCount,
        activeRoomHeightMm: roomRead.activeRoomHeightMm,
        activeRoomWallHeightEvidence: roomRead.activeRoomWallHeightEvidence,
        canEditActiveRoomWallHeight: roomRead.canEditActiveRoomWallHeight,
        activeRoomWallThicknessMm: roomRead.activeRoomWallThicknessMm,
        activeRoomSlabThicknessMm: roomRead.activeRoomSlabThicknessMm,
        activeRoomSlabThicknessEvidence:
          roomRead.activeRoomSlabThicknessEvidence,
        canEditActiveRoomSlabThickness:
          roomRead.canEditActiveRoomSlabThickness,
        activeRoomBaseboardDepthMm: roomRead.activeRoomBaseboardDepthMm,
        activeRoomWallOpacity: roomRead.activeRoomWallOpacity,
        activeRoomFloorOpacity: roomRead.activeRoomFloorOpacity,
        activeRoomCeilingOpacity: roomRead.activeRoomCeilingOpacity,
        activeRoomCeilingVisible: roomRead.activeRoomCeilingVisible,
        activeRoomCeilingColor: roomRead.activeRoomCeilingColor,
        stackedFloorView: roomFloor.state.floor.stackedFloorView,
      },
      actions: {
        addDesignerRoom: roomActions.handleAddRoom,
        onAddRoomTemplate: roomActions.handleAddRoom,
        onNewRoomTypeChange: roomActions.setNewRoomType,
        onNewRoomShapeChange: roomActions.setNewRoomShape,
        onRoomPresetChange: actions.room.changePreset,
        onRoomWidthInputChange: roomActions.setRoomWidthInput,
        onRoomDepthInputChange: roomActions.setRoomDepthInput,
        onCommitRoomDimension: actions.room.commitDimension,
        onActiveRoomHeightMmChange: actions.room.changeHeight,
        onActiveRoomWallThicknessMmChange: actions.room.changeWallThickness,
        onActiveRoomSlabThicknessMmChange: actions.room.changeSlabThickness,
        onActiveRoomBaseboardDepthMmChange: actions.room.changeBaseboardDepth,
        onActiveRoomSurfaceOpacityChange: actions.room.changeSurfaceOpacity,
        onActiveRoomCeilingVisibleChange: actions.room.changeCeilingVisible,
        onActiveRoomCeilingColorChange: actions.room.changeCeilingColor,
      },
    },
    floorPlan: {
      state: {
        measurementUnit: planDocument.state.planMeasurementUnit,
        floorPlanUnderlay: floorPlan.floorPlanUnderlay,
        floorPlanCalibrationMode: floorPlan.floorPlanCalibrationMode,
        floorPlanCalibrationPointCount:
          floorPlan.floorPlanCalibrationPoints.length,
        floorPlanCalibrationDistanceInput:
          floorPlan.floorPlanCalibrationDistanceInput,
        floorPlanCalibrationSummary: floorPlan.floorPlanCalibrationSummary,
        floorPlanTraceRoomMode: floorPlan.floorPlanTraceRoomMode,
        floorPlanDrawRoomMode: floorPlan.floorPlanDrawRoomMode,
        floorPlanDrawAngleLockMode: floorPlan.floorPlanDrawAngleLockMode,
        floorPlanExactWallLengthInput: floorPlan.floorPlanExactWallLengthInput,
        floorPlanTraceRoomPointCount: floorPlan.floorPlanTraceRoomPoints.length,
        floorPlanTraceRoomType: floorPlan.floorPlanTraceRoomType,
        floorPlanTraceOpeningMode: floorPlan.floorPlanTraceOpeningMode,
        floorPlanTraceOpeningPointCount:
          floorPlan.floorPlanTraceOpeningPoints.length,
        floorPlanTraceOpeningKind: floorPlan.floorPlanTraceOpeningKind,
        floorPlanPdfSourceReady: floorPlan.floorPlanPdfSourceReady,
        floorPlanPdfRenderingPage: floorPlan.floorPlanPdfRenderingPage,
        ...state.plan,
        planRoomCount: roomFloor.derived.plan.housePlan2D.rooms.length,
        planItemCount: room.items.length,
        planOpeningCount: planDocument.state.planOpenings.length,
        activeFloorPlanTool: floorPlan.activeFloorPlanTool,
        simplePlanControls: planDocument.state.simplePlanControls,
        planGuidedActionsEnabled:
          planDocument.state.planGuidedActionsEnabled,
      },
      actions: {
        onMeasurementUnitChange:
          planDocument.actions.setPlanMeasurementUnit,
        onPlanCompletionHandled: actions.floorPlan.completionHandled,
        onPlanStartModeChange: actions.floorPlan.changeStartMode,
        onPlanQualityAction: actions.floorPlan.activateQualityIssue,
        onSimplePlanControlsChange:
          planDocument.actions.setSimplePlanControls,
        onPlanGuidedActionsEnabledChange:
          planDocument.actions.setPlanGuidedActionsEnabled,
        onSelectFloorPlanTool: actions.floorPlan.selectTool,
        onAddFloorPlanOpeningFromTool: actions.floorPlan.addOpeningFromTool,
        onApplyPlanTemplate: actions.floorPlan.applyTemplate,
        onFloorPlanUpload: actions.floorPlan.upload,
        onFloorPlanPdfPageChange: actions.floorPlan.changePdfPage,
        onFloorPlanOpacityChange: actions.floorPlan.changeOpacity,
        onFloorPlanLockChange: actions.floorPlan.changeLock,
        onFloorPlanCalibrationModeChange:
          actions.floorPlan.changeCalibrationMode,
        onFloorPlanCalibrationDistanceChange:
          floorPlanActions.setFloorPlanCalibrationDistanceInput,
        onApplyFloorPlanCalibration: actions.floorPlan.applyCalibration,
        onResetFloorPlanCalibrationPoints:
          actions.floorPlan.resetCalibrationPoints,
        onFloorPlanTraceRoomModeChange:
          actions.floorPlan.changeTraceRoomMode,
        onFloorPlanTraceRoomDrawModeChange:
          actions.floorPlan.changeDrawRoomMode,
        onFloorPlanDrawAngleLockModeChange:
          floorPlanActions.setFloorPlanDrawAngleLockMode,
        onFloorPlanExactWallLengthInputChange:
          floorPlanActions.setFloorPlanExactWallLengthInput,
        onApplyFloorPlanExactWallLength:
          actions.floorPlan.applyExactWallLength,
        onFloorPlanTraceRoomTypeChange:
          floorPlanActions.setFloorPlanTraceRoomType,
        onUndoFloorPlanTraceRoomPoint: actions.floorPlan.undoTraceRoomPoint,
        onResetFloorPlanTraceRoomPoints:
          actions.floorPlan.resetTraceRoomPoints,
        onFloorPlanTraceOpeningModeChange:
          actions.floorPlan.changeTraceOpeningMode,
        onFloorPlanTraceOpeningKindChange:
          floorPlanActions.setFloorPlanTraceOpeningKind,
        onResetFloorPlanTraceOpeningPoints:
          actions.floorPlan.resetTraceOpeningPoints,
        onClearFloorPlan: actions.floorPlan.clear,
        onAddSuggestedDoorway: actions.floorPlan.addSuggestedDoorway,
        onUpdateOpeningMetrics: actions.floorPlan.updateOpeningMetrics,
      },
    },
    surfaces: {
      state: {
        activeRoomFloorMaterialId: roomRead.activeRoomFloorMaterialId,
        activeRoomFloorRotationDeg: roomRead.activeRoomFloorRotationDeg,
        activeRoomFloorScale: roomRead.activeRoomFloorScale,
        activeRoomFloorPattern: roomRead.activeRoomFloorSettings.floorPattern,
        activeRoomFloorPatternOffset:
          roomRead.activeRoomFloorSettings.floorPatternOffset,
        activeRoomFloorJointSizeMm:
          roomRead.activeRoomFloorSettings.floorJointSizeMm,
        activeRoomFloorJointColor:
          roomRead.activeRoomFloorSettings.floorJointColor,
        activeSurfaceTarget: surfaceState.state.activeSurfaceTarget,
        selectedWallFaceId: roomRead.activeSelectedWallFaceId,
        selectedWallLabel: getWallFaceLabel(roomRead.activeSelectedWallFaceId),
        activeRoomWallSettings: roomRead.activeRoomWallSettings,
        activeRoomSelectedWallSettings:
          roomRead.activeRoomSelectedWallSettings,
        activeRoomCeilingSettings: roomRead.activeRoomCeilingSettings,
        surfaceBrushActive: surfaceState.state.surfaceBrushActive,
        surfaceBrushMaterialId: surfaceState.state.surfaceBrushMaterialId,
        surfaceBrushPaintColorHex:
          surfaceState.state.surfaceBrushPaint?.colorHex ?? null,
        surfaceBrushPaintName:
          surfaceState.state.surfaceBrushPaint?.name ?? null,
        surfaceRooms: roomRead.surfaceRoomSummaries,
        floorFinishPanelOpenSignal:
          surfaceState.state.floorFinishPanelOpenSignal,
        floorOptions: floor.floorOptions,
        showFloorPropertiesPanel:
          derived.surface.showFloorPropertiesPanel,
      },
      actions: {
        onApplyFloorMaterialToRoom:
          surfaceWorkspace.actions.applyFloorMaterialToRoom,
        onApplyFloorMaterialToAllRooms:
          surfaceWorkspace.actions.applyFloorMaterialToAllRooms,
        onRotateActiveFloorMaterial:
          surfaceWorkspace.actions.rotateActiveFloorMaterial,
        onResetActiveFloorMaterialPattern:
          surfaceWorkspace.actions.resetActiveFloorMaterialPattern,
        onActiveFloorMaterialScaleChange:
          surfaceWorkspace.actions.changeActiveFloorMaterialScale,
        onActiveFloorSurfaceSettingsChange:
          surfaceWorkspace.actions.changeActiveFloorSurfaceSettings,
        onSurfaceTargetChange:
          surfaceWorkspace.actions.changeSurfaceTargetMode,
        onSurfaceBrushActiveChange:
          surfaceWorkspace.actions.changeSurfaceBrushActive,
        onSurfaceMaterialSelected:
          surfaceWorkspace.actions.selectSurfaceMaterialForBrush,
        onSurfacePaintSelected:
          surfaceWorkspace.actions.selectSurfacePaintForBrush,
        onApplyWallMaterialToRoom:
          surfaceWorkspace.actions.applyWallMaterialToRoom,
        onApplyWallMaterialToAllRooms:
          surfaceWorkspace.actions.applyWallMaterialToAllRooms,
        onApplyWallPaintToRoom:
          surfaceWorkspace.actions.applyWallPaintToRoom,
        onApplyWallPaintToAllRooms:
          surfaceWorkspace.actions.applyWallPaintToAllRooms,
        onApplyCeilingPaintToRoom:
          surfaceWorkspace.actions.applyCeilingPaintToRoom,
        onApplyCeilingPaintToAllRooms:
          surfaceWorkspace.actions.applyCeilingPaintToAllRooms,
      },
    },
    shopping: {
      state: {
        catalogItems: importedModels.state.catalogItems,
        selectedImportedFamilyKey: importedModels.state.selectedFamilyKey,
        selectedImportedProductId: importedModels.state.selectedProductId,
        importedFamilyOptions: importedModels.state.familyOptions,
        importedModelOptions: importedModels.state.modelOptions,
        visibleImportedModelOptions: importedModels.state.visibleModelOptions,
        activeRoomShoppableCount:
          roomRead.activeRoomShoppingSummary?.shoppableCount ?? 0,
        activeRoomNeedsReviewCount:
          roomRead.activeRoomShoppingSummary?.needsReviewCount ?? 0,
        activeRoomCategoryCounts: roomRead.activeRoomCategoryCounts,
        activeRoomShoppingSubtotal:
          roomRead.activeRoomShoppingSummary?.subtotal ?? 0,
        activeRoomPreviewNames:
          roomRead.activeRoomShoppingSummary?.previewNames ?? [],
        activeRoomShoppingItems: roomRead.activeRoomShoppingItems,
        selectedPlacedItemId:
          placementSelection.state.selection.selectedInstanceId,
        activeRoomProductQuantities: roomRead.activeRoomProductQuantities,
        activeRoomVariantQuantities: roomRead.activeRoomVariantQuantities,
        placementAddMode: state.shopping.placementAddMode,
      },
      actions: {
        onAddImportedToRoom: actions.shopping.addImportedToRoom,
        onAddCatalogItemToRoom: catalogActions.addCatalogItemToRoom,
        onAutoPlaceCatalogItemInRoom:
          catalogActions.autoPlaceCatalogItemInRoom,
        onPreviewCatalogPlacementIntent:
          catalogActions.previewCatalogPlacementIntent,
        onCatalogDragStart: catalogActions.handleCatalogDragStart,
        onCatalogDragEnd: catalogActions.handleCatalogDragEnd,
        onAddActiveRoomCartReadyItems:
          interactionActions.addActiveRoomCartReadyItems,
        onReviewShoppingIssue: actions.shopping.reviewIssue,
        onSelectPlacedItem: (instanceId) =>
          placementSelection.actions.selection.selectItem(instanceId, false),
        onSelectedImportedFamilyChange:
          importedModels.actions.setSelectedFamilyKey,
        onSelectedImportedProductChange:
          importedModels.actions.setSelectedProductId,
      },
    },
    ai: { state: state.ai, actions: actions.ai },
    actions: {
      navigation: {
        onSignIn: actions.navigation.signIn,
        onGoFurnish: actions.navigation.goFurnish,
        onGoAiDesign: actions.navigation.goAiDesign,
        onGoShop: actions.navigation.goShop,
        onSelectRoom: actions.navigation.selectRoom,
        onPlacementAddModeChange: actions.navigation.changePlacementAddMode,
        onStyleChange: actions.navigation.changeStyle,
        onBudgetChange: actions.navigation.changeBudget,
      },
      panel: panelActions,
    },
  });

  return buildDesignPagePanelRegionAdapter({
    state: {
      editorMode: state.editor.editorMode,
      shoppingVisible: state.editor.shoppingVisible,
      controlsVisible: state.editor.controlsVisible,
      hasSelectedCabinet: Boolean(cabinetry.state.selected),
      hasSelectedProduct: Boolean(inspection.selectedProduct),
    },
    configuration: {
      designerTheme: configuration.designerTheme,
      isDesigner: configuration.isDesigner,
      isClientPreview: configuration.isClientPreview,
    },
    panels: {
      shopping: shoppingPanelModel,
      selectedCabinet: selectionPanelModels.selectedCabinet,
      selectedItem: selectionPanelModels.selectedItem,
      controls: designControlsPanelModel,
    },
    actions: { exitClientPreview: panelActions.exitClientPreview },
  });
}
