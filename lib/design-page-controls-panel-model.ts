import type {
  DesignControlsPanelAdapterActions,
  DesignControlsPanelAdapterConfiguration,
  DesignControlsPanelAdapterProps,
  DesignControlsPanelAdapterState,
} from "@/components/editor/design-page/DesignControlsPanelAdapter";

type StateSlice<Key extends keyof DesignControlsPanelAdapterState> = Pick<
  DesignControlsPanelAdapterState,
  Key
>;
type ActionSlice<Key extends keyof DesignControlsPanelAdapterActions> = Pick<
  DesignControlsPanelAdapterActions,
  Key
>;

type PanelState = StateSlice<
  | "collapsed"
  | "selectionContext"
  | "viewMode"
  | "style"
  | "budget"
  | "showGrid"
  | "snapEnabled"
>;

type RoomState = StateSlice<
  | "newRoomType"
  | "newRoomShape"
  | "activeRoomPresetId"
  | "roomWidthInput"
  | "roomDepthInput"
  | "roomWidth"
  | "roomDepth"
  | "activeRoomName"
  | "activeRoomId"
  | "catalogRoomNavigationRevision"
  | "rooms"
  | "activeRoomType"
  | "activeRoomTypeLabel"
  | "activeFloorLevel"
  | "activeFloorRoomCount"
  | "activeRoomHeightMm"
  | "activeRoomWallHeightEvidence"
  | "canEditActiveRoomWallHeight"
  | "activeRoomWallThicknessMm"
  | "activeRoomSlabThicknessMm"
  | "activeRoomSlabThicknessEvidence"
  | "canEditActiveRoomSlabThickness"
  | "activeRoomBaseboardDepthMm"
  | "activeRoomWallOpacity"
  | "activeRoomFloorOpacity"
  | "activeRoomCeilingOpacity"
  | "activeRoomCeilingVisible"
  | "activeRoomCeilingColor"
  | "stackedFloorView"
>;

type RoomActions = ActionSlice<
  | "onAddRoomTemplate"
  | "onNewRoomTypeChange"
  | "onNewRoomShapeChange"
  | "onRoomPresetChange"
  | "onRoomWidthInputChange"
  | "onRoomDepthInputChange"
  | "onCommitRoomDimension"
  | "onActiveRoomHeightMmChange"
  | "onActiveRoomWallThicknessMmChange"
  | "onActiveRoomSlabThicknessMmChange"
  | "onActiveRoomBaseboardDepthMmChange"
  | "onActiveRoomSurfaceOpacityChange"
  | "onActiveRoomCeilingVisibleChange"
  | "onActiveRoomCeilingColorChange"
> & {
  addDesignerRoom: DesignControlsPanelAdapterActions["onAddDesignerRoom"];
};

type FloorPlanState = StateSlice<
  | "measurementUnit"
  | "measurementUnitReady"
  | "floorPlanUnderlay"
  | "floorPlanCalibrationMode"
  | "floorPlanCalibrationPointCount"
  | "floorPlanCalibrationDistanceInput"
  | "floorPlanCalibrationSummary"
  | "floorPlanTraceRoomMode"
  | "floorPlanDrawRoomMode"
  | "floorPlanDrawAngleLockMode"
  | "floorPlanExactWallLengthInput"
  | "floorPlanTraceRoomPointCount"
  | "floorPlanTraceRoomType"
  | "floorPlanTraceOpeningMode"
  | "floorPlanTraceOpeningPointCount"
  | "floorPlanTraceOpeningKind"
  | "floorPlanPdfSourceReady"
  | "floorPlanPdfRenderingPage"
  | "roomConnectionChecklistItems"
  | "visiblePlanOpening"
  | "visiblePlanOpeningRoomName"
  | "visiblePlanOpeningWallSpanMeters"
  | "visiblePlanOpeningMaxHeightMeters"
  | "planRoomCount"
  | "planItemCount"
  | "planOpeningCount"
  | "activeFloorPlanTool"
  | "simplePlanControls"
  | "planGuidedActionsEnabled"
  | "planStartMode"
  | "planCompletionSignal"
  | "floorPlanQualityReport"
>;

type FloorPlanActions = ActionSlice<
  | "onMeasurementUnitChange"
  | "onPlanCompletionHandled"
  | "onPlanStartModeChange"
  | "onPlanQualityAction"
  | "onSimplePlanControlsChange"
  | "onPlanGuidedActionsEnabledChange"
  | "onSelectFloorPlanTool"
  | "onAddFloorPlanOpeningFromTool"
  | "onApplyPlanTemplate"
  | "onFloorPlanUpload"
  | "onFloorPlanPdfPageChange"
  | "onFloorPlanOpacityChange"
  | "onFloorPlanLockChange"
  | "onFloorPlanCalibrationModeChange"
  | "onFloorPlanCalibrationDistanceChange"
  | "onApplyFloorPlanCalibration"
  | "onResetFloorPlanCalibrationPoints"
  | "onFloorPlanTraceRoomModeChange"
  | "onFloorPlanTraceRoomDrawModeChange"
  | "onFloorPlanDrawAngleLockModeChange"
  | "onFloorPlanExactWallLengthInputChange"
  | "onApplyFloorPlanExactWallLength"
  | "onFloorPlanTraceRoomTypeChange"
  | "onUndoFloorPlanTraceRoomPoint"
  | "onResetFloorPlanTraceRoomPoints"
  | "onFloorPlanTraceOpeningModeChange"
  | "onFloorPlanTraceOpeningKindChange"
  | "onResetFloorPlanTraceOpeningPoints"
  | "onClearFloorPlan"
  | "onAddSuggestedDoorway"
  | "onUpdateOpeningMetrics"
>;

type SurfaceState = StateSlice<
  | "activeRoomFloorMaterialId"
  | "activeRoomFloorRotationDeg"
  | "activeRoomFloorScale"
  | "activeRoomFloorPattern"
  | "activeRoomFloorPatternOffset"
  | "activeRoomFloorJointSizeMm"
  | "activeRoomFloorJointColor"
  | "activeSurfaceTarget"
  | "selectedWallFaceId"
  | "selectedWallLabel"
  | "activeRoomWallSettings"
  | "activeRoomSelectedWallSettings"
  | "activeRoomCeilingSettings"
  | "surfaceBrushActive"
  | "surfaceBrushMaterialId"
  | "surfaceBrushPaintColorHex"
  | "surfaceBrushPaintName"
  | "surfaceRooms"
  | "floorFinishPanelOpenSignal"
  | "floorOptions"
  | "showFloorPropertiesPanel"
>;

type SurfaceActions = ActionSlice<
  | "onApplyFloorMaterialToRoom"
  | "onApplyFloorMaterialToAllRooms"
  | "onRotateActiveFloorMaterial"
  | "onResetActiveFloorMaterialPattern"
  | "onActiveFloorMaterialScaleChange"
  | "onActiveFloorSurfaceSettingsChange"
  | "onSurfaceTargetChange"
  | "onSurfaceBrushActiveChange"
  | "onSurfaceMaterialSelected"
  | "onSurfacePaintSelected"
  | "onApplyWallMaterialToRoom"
  | "onApplyWallMaterialToAllRooms"
  | "onApplyWallPaintToRoom"
  | "onApplyWallPaintToAllRooms"
  | "onApplyCeilingPaintToRoom"
  | "onApplyCeilingPaintToAllRooms"
>;

type ShoppingState = StateSlice<
  | "catalogItems"
  | "selectedImportedFamilyKey"
  | "selectedImportedProductId"
  | "importedFamilyOptions"
  | "importedModelOptions"
  | "visibleImportedModelOptions"
  | "activeRoomShoppableCount"
  | "activeRoomNeedsReviewCount"
  | "activeRoomCategoryCounts"
  | "activeRoomShoppingSubtotal"
  | "activeRoomPreviewNames"
  | "activeRoomShoppingItems"
  | "selectedPlacedItemId"
  | "activeRoomProductQuantities"
  | "activeRoomVariantQuantities"
  | "placementAddMode"
>;

type ShoppingActions = ActionSlice<
  | "onAddImportedToRoom"
  | "onAddCatalogItemToRoom"
  | "onAutoPlaceCatalogItemInRoom"
  | "onPreviewCatalogPlacementIntent"
  | "onCatalogDragStart"
  | "onCatalogDragEnd"
  | "onAddActiveRoomCartReadyItems"
  | "onReviewShoppingIssue"
  | "onSelectPlacedItem"
  | "onSelectedImportedFamilyChange"
  | "onSelectedImportedProductChange"
>;

type AiState = StateSlice<"aiLayoutProposal">;
type AiActions = ActionSlice<
  "onApplyAiLayoutProposal" | "onClearAiLayoutProposal"
>;

type NavigationActions = ActionSlice<
  | "onSignIn"
  | "onGoFurnish"
  | "onGoAiDesign"
  | "onGoShop"
  | "onSelectRoom"
  | "onPlacementAddModeChange"
  | "onStyleChange"
  | "onBudgetChange"
>;

export type DesignControlsPanelCallbacks = {
  changeDesignPanelCollapsed: NonNullable<
    DesignControlsPanelAdapterActions["onCollapsedChange"]
  >;
  goView3D: NonNullable<DesignControlsPanelAdapterActions["onGoView3D"]>;
  runAiLayout: DesignControlsPanelAdapterActions["onRunAiLayout"];
  regenerateAiLayout: DesignControlsPanelAdapterActions["onTryAiLayoutAgain"];
  changeActiveWallSurfaceSettings: DesignControlsPanelAdapterActions["onActiveWallSurfaceSettingsChange"];
  resetActiveWallSurface: DesignControlsPanelAdapterActions["onResetActiveWallSurface"];
  resetActiveCeilingSurface: DesignControlsPanelAdapterActions["onResetActiveCeilingSurface"];
  toggleGrid: DesignControlsPanelAdapterActions["onGridToggle"];
  toggleSnap: DesignControlsPanelAdapterActions["onSnapToggle"];
};

export type BuildDesignControlsPanelModelInput = {
  access: Omit<DesignControlsPanelAdapterConfiguration, "panelMode">;
  panel: {
    mode: DesignControlsPanelAdapterConfiguration["panelMode"];
    state: PanelState;
  };
  room: { state: RoomState; actions: RoomActions };
  floorPlan: { state: FloorPlanState; actions: FloorPlanActions };
  surfaces: { state: SurfaceState; actions: SurfaceActions };
  shopping: { state: ShoppingState; actions: ShoppingActions };
  ai: { state: AiState; actions: AiActions };
  actions: {
    navigation: NavigationActions;
    panel: DesignControlsPanelCallbacks;
  };
};

/** Builds the leaf panel contract from editor-domain slices. */
export function buildDesignControlsPanelModel({
  access,
  panel,
  room,
  floorPlan,
  surfaces,
  shopping,
  ai,
  actions,
}: BuildDesignControlsPanelModelInput): DesignControlsPanelAdapterProps {
  const panelActions = actions.panel;
  const { addDesignerRoom, ...roomActions } = room.actions;

  return {
    configuration: { ...access, panelMode: panel.mode },
    state: {
      ...panel.state,
      ...room.state,
      ...floorPlan.state,
      canTraceOpenings: Boolean(
        floorPlan.state.floorPlanUnderlay?.mimeType.startsWith("image/") &&
          floorPlan.state.floorPlanUnderlay.calibration &&
          floorPlan.state.planRoomCount > 0
      ),
      ...surfaces.state,
      ...shopping.state,
      ...ai.state,
    },
    actions: {
      ...actions.navigation,
      ...roomActions,
      onAddDesignerRoom: () => addDesignerRoom(),
      ...floorPlan.actions,
      onDrawFloorPlanRoom: () =>
        floorPlan.actions.onFloorPlanTraceRoomDrawModeChange(
          "rectangle_wall"
        ),
      ...surfaces.actions,
      ...shopping.actions,
      ...ai.actions,
      onCollapsedChange: panelActions.changeDesignPanelCollapsed,
      onGoView3D: panelActions.goView3D,
      onRunAiLayout: panelActions.runAiLayout,
      onTryAiLayoutAgain: panelActions.regenerateAiLayout,
      onActiveWallSurfaceSettingsChange:
        panelActions.changeActiveWallSurfaceSettings,
      onResetActiveWallSurface: panelActions.resetActiveWallSurface,
      onResetActiveCeilingSurface: panelActions.resetActiveCeilingSurface,
      onGridToggle: panelActions.toggleGrid,
      onSnapToggle: panelActions.toggleSnap,
    },
  };
}
