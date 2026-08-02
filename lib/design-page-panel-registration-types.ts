import type { useDesignPageCabinetry } from "@/features/cabinetry/useDesignPageCabinetry";
import type {
  useDesignPageFloorPlanDocumentState,
  useDesignPagePlanDocumentState,
} from "@/lib/useDesignPageDocumentStateController";
import type { useDesignPageImportedModels } from "@/lib/useDesignPageImportedModels";
import type { useDesignPagePanelActions } from "@/lib/useDesignPagePanelActions";
import type { useDesignPagePlacementSelectionWorkspaceFacade } from "@/lib/useDesignPagePlacementSelectionWorkspaceFacade";
import type { useDesignPageRoomFloorWorkspace } from "@/lib/useDesignPageRoomFloorWorkspace";
import type { DesignPageSceneRoomReadFacade } from "@/lib/useDesignPageSceneRoomReadFacade";
import type { useDesignPageSurfaceStateController } from "@/lib/useDesignPageSurfaceStateController";
import type { useDesignPageSurfaceWorkspaceFacade } from "@/lib/useDesignPageSurfaceWorkspaceFacade";

import type { BuildDesignControlsPanelModelInput } from "@/lib/design-page-controls-panel-model";
import type { BuildDesignPagePanelRegionAdapterInput } from "@/lib/design-page-panel-region-adapter";
import type { BuildDesignPageSelectionPanelModelsInput } from "@/lib/design-page-selection-panel-model";
import type { BuildDesignPageShoppingPanelModelInput } from "@/lib/design-page-shopping-panel-model";

type ControlsInput = BuildDesignControlsPanelModelInput;
type ShoppingInput = BuildDesignPageShoppingPanelModelInput;
type SelectionInput = BuildDesignPageSelectionPanelModelsInput;
type RegionInput = BuildDesignPagePanelRegionAdapterInput;

export type BuildDesignPagePanelRegistrationInput = {
  boundaries: {
    cabinetry: ReturnType<typeof useDesignPageCabinetry>;
    floorPlanDocument: ReturnType<
      typeof useDesignPageFloorPlanDocumentState
    >;
    importedModels: ReturnType<typeof useDesignPageImportedModels>;
    panel: ReturnType<typeof useDesignPagePanelActions>;
    placementSelection: ReturnType<
      typeof useDesignPagePlacementSelectionWorkspaceFacade
    >;
    planDocument: ReturnType<typeof useDesignPagePlanDocumentState>;
    roomFloor: ReturnType<typeof useDesignPageRoomFloorWorkspace>;
    sceneRoom: DesignPageSceneRoomReadFacade;
    surfaceState: ReturnType<typeof useDesignPageSurfaceStateController>;
    surfaceWorkspace: ReturnType<typeof useDesignPageSurfaceWorkspaceFacade>;
  };
  state: {
    document: {
      designId: ShoppingInput["state"]["cart"]["designId"];
      plan: ShoppingInput["state"]["cart"]["plan"];
      rooms: SelectionInput["item"]["state"]["document"]["rooms"];
      activeRoomId: string;
      authenticated: boolean;
    };
    editor: {
      editorMode: RegionInput["state"]["editorMode"];
      controlsMode: ControlsInput["panel"]["mode"];
      controls: ControlsInput["panel"]["state"];
      shoppingVisible: boolean;
      controlsVisible: boolean;
    };
    plan: Pick<
      ControlsInput["floorPlan"]["state"],
      | "roomConnectionChecklistItems"
      | "visiblePlanOpening"
      | "visiblePlanOpeningRoomName"
      | "visiblePlanOpeningWallSpanMeters"
      | "visiblePlanOpeningMaxHeightMeters"
      | "planStartMode"
      | "planCompletionSignal"
      | "floorPlanQualityReport"
    >;
    shopping: {
      readinessFilter: ShoppingInput["state"]["overview"]["activeFilter"];
      placementAddMode: ControlsInput["shopping"]["state"]["placementAddMode"];
    };
    ai: ControlsInput["ai"]["state"];
  };
  derived: {
    surface: { showFloorPropertiesPanel: boolean };
  };
  configuration: {
    designerTheme: boolean;
    isDesigner: boolean;
    isClientPreview: boolean;
    canEdit: boolean;
    canUseCabinetryStudio: boolean;
    canEditPlanGeometry: boolean;
    aiDesignEnabled: boolean;
  };
  actions: {
    navigation: {
      signIn: ControlsInput["actions"]["navigation"]["onSignIn"];
      goFurnish: ControlsInput["actions"]["navigation"]["onGoFurnish"];
      goAiDesign: ControlsInput["actions"]["navigation"]["onGoAiDesign"];
      goShop: ControlsInput["actions"]["navigation"]["onGoShop"];
      selectRoom: ControlsInput["actions"]["navigation"]["onSelectRoom"];
      changePlacementAddMode: ControlsInput["actions"]["navigation"]["onPlacementAddModeChange"];
      changeStyle: ControlsInput["actions"]["navigation"]["onStyleChange"];
      changeBudget: ControlsInput["actions"]["navigation"]["onBudgetChange"];
    };
    room: {
      changePreset: ControlsInput["room"]["actions"]["onRoomPresetChange"];
      commitDimension: ControlsInput["room"]["actions"]["onCommitRoomDimension"];
      changeHeight: ControlsInput["room"]["actions"]["onActiveRoomHeightMmChange"];
      changeWallThickness: ControlsInput["room"]["actions"]["onActiveRoomWallThicknessMmChange"];
      changeSlabThickness: ControlsInput["room"]["actions"]["onActiveRoomSlabThicknessMmChange"];
      changeBaseboardDepth: ControlsInput["room"]["actions"]["onActiveRoomBaseboardDepthMmChange"];
      changeSurfaceOpacity: ControlsInput["room"]["actions"]["onActiveRoomSurfaceOpacityChange"];
      changeCeilingVisible: ControlsInput["room"]["actions"]["onActiveRoomCeilingVisibleChange"];
      changeCeilingColor: ControlsInput["room"]["actions"]["onActiveRoomCeilingColorChange"];
    };
    floorPlan: {
      completionHandled: ControlsInput["floorPlan"]["actions"]["onPlanCompletionHandled"];
      changeStartMode: ControlsInput["floorPlan"]["actions"]["onPlanStartModeChange"];
      activateQualityIssue: ControlsInput["floorPlan"]["actions"]["onPlanQualityAction"];
      selectTool: ControlsInput["floorPlan"]["actions"]["onSelectFloorPlanTool"];
      addOpeningFromTool: ControlsInput["floorPlan"]["actions"]["onAddFloorPlanOpeningFromTool"];
      applyTemplate: ControlsInput["floorPlan"]["actions"]["onApplyPlanTemplate"];
      upload: ControlsInput["floorPlan"]["actions"]["onFloorPlanUpload"];
      changePdfPage: ControlsInput["floorPlan"]["actions"]["onFloorPlanPdfPageChange"];
      changeOpacity: ControlsInput["floorPlan"]["actions"]["onFloorPlanOpacityChange"];
      changeLock: ControlsInput["floorPlan"]["actions"]["onFloorPlanLockChange"];
      changeCalibrationMode: ControlsInput["floorPlan"]["actions"]["onFloorPlanCalibrationModeChange"];
      applyCalibration: ControlsInput["floorPlan"]["actions"]["onApplyFloorPlanCalibration"];
      resetCalibrationPoints: ControlsInput["floorPlan"]["actions"]["onResetFloorPlanCalibrationPoints"];
      changeTraceRoomMode: ControlsInput["floorPlan"]["actions"]["onFloorPlanTraceRoomModeChange"];
      changeDrawRoomMode: ControlsInput["floorPlan"]["actions"]["onFloorPlanTraceRoomDrawModeChange"];
      applyExactWallLength: ControlsInput["floorPlan"]["actions"]["onApplyFloorPlanExactWallLength"];
      undoTraceRoomPoint: ControlsInput["floorPlan"]["actions"]["onUndoFloorPlanTraceRoomPoint"];
      resetTraceRoomPoints: ControlsInput["floorPlan"]["actions"]["onResetFloorPlanTraceRoomPoints"];
      changeTraceOpeningMode: ControlsInput["floorPlan"]["actions"]["onFloorPlanTraceOpeningModeChange"];
      resetTraceOpeningPoints: ControlsInput["floorPlan"]["actions"]["onResetFloorPlanTraceOpeningPoints"];
      clear: ControlsInput["floorPlan"]["actions"]["onClearFloorPlan"];
      addSuggestedDoorway: ControlsInput["floorPlan"]["actions"]["onAddSuggestedDoorway"];
      updateOpeningMetrics: ControlsInput["floorPlan"]["actions"]["onUpdateOpeningMetrics"];
    };
    shopping: {
      setReadinessFilter: ShoppingInput["actions"]["overview"]["onFilterChange"];
      swapItem: ShoppingInput["actions"]["overview"]["onSwapShoppingItem"];
      previewReplacement: ShoppingInput["actions"]["overview"]["onPreviewReplacement"];
      bulkSwap: ShoppingInput["actions"]["cart"]["onBulkSwap"];
      showUpgrade: ShoppingInput["actions"]["cart"]["onShowUpgrade"];
      openGuestPrompt: ShoppingInput["actions"]["cart"]["openGuestPrompt"];
      addImportedToRoom: ControlsInput["shopping"]["actions"]["onAddImportedToRoom"];
      reviewIssue: ControlsInput["shopping"]["actions"]["onReviewShoppingIssue"];
    };
    cabinetry: {
      deleteSelected: SelectionInput["cabinet"]["actions"]["delete"];
    };
    ai: ControlsInput["ai"]["actions"];
  };
};
