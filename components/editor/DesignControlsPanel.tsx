"use client";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type {
  HouseRoomConnectionChecklistItem,
  HouseRoomDoorwaySuggestion,
  HousePlanTemplate,
  HousePlanTemplateApplyOptions,
  HouseRoomTemplateId,
  RoomSizePresetId,
} from "@/lib/design-page-house-plan";
import { type AiLayoutProposal, type PlanMeasurementUnit, type Style } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanConsumerMeasurementEvidenceV2 } from "@/lib/floor-plan-measured-property-mutations";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type {
  FloorPlanQualityAction,
  FloorPlanQualityIssue,
  FloorPlanQualityReport,
} from "@/lib/floor-plan-quality";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import type { AiLayoutRole } from "@/lib/ai/layout-planner";
import type { CatalogTopCategory } from "@/lib/catalog/view-builders";
import type { ActiveRoomShoppingItem } from "@/lib/room-shopping";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import type { DesignSelectionContext } from "@/lib/design-page-selection-context";
import type { RoomFloorPattern, RoomPlanShape, RoomSurfaceAssignments, RoomType } from "@/lib/room-types";
import type { FloorSurfacePatch, NormalizedSurfaceSettings, SurfaceSettingsPatch } from "@/lib/surface-settings";
import { PanelLeftOpen, Pin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EditorViewMode } from "./EditorViewToggle";
import DesignControlsAiPanel from "./DesignControlsAiPanel";
import DesignControlsFurnishPanel from "./DesignControlsFurnishPanel";
import DesignControlsPlanPanel, { type FloorPlanLifecycleIdentity, type PlanStartMode } from "./DesignControlsPlanPanel";
import type { FloorPlanTool } from "./FloorPlanToolStrip";

type Budget = "$" | "$$" | "$$$";
type ConsumerPanelMode = "plan" | "furnish" | "ai";
type SurfaceTargetMode = "floor" | "walls" | "selected_wall" | "ceiling";
type ImportedFamilyOption = {
  familyKey: string;
  familyLabel: string;
};

type HouseRoomTemplate = {
  id: HouseRoomTemplateId;
  label: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
};

type SurfaceRoomSummary = {
  id: string;
  name: string;
  floorLabel?: string;
  roomType: RoomType;
  width: number;
  depth: number;
  height?: number;
  surfaces?: RoomSurfaceAssignments;
  surfaceFinishes?: RoomSurfaceAssignments;
};

export type DesignControlsPanelProps = {
  dark: boolean;
  isClientPreview: boolean;
  isAuthed: boolean; floorPlanLifecycleIdentity: FloorPlanLifecycleIdentity;
  isDesigner: boolean;
  canEdit: boolean;
  canEditPlanGeometry: boolean;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  aiDesignEnabled?: boolean;
  panelMode?: ConsumerPanelMode;
  selectionContext?: DesignSelectionContext | null;
  viewMode: EditorViewMode;
  style: Style;
  budget: Budget;
  showGrid: boolean;
  snapEnabled: boolean;
  newRoomType: RoomType;
  newRoomShape: RoomPlanShape;
  activeRoomPresetId: string;
  roomWidthInput: string;
  roomDepthInput: string;
  roomWidth: number;
  roomDepth: number;
  measurementUnit: PlanMeasurementUnit; measurementUnitReady: boolean;
  catalogItems: CatalogItemSchema[];
  selectedImportedFamilyKey: string;
  selectedImportedProductId: string;
  importedFamilyOptions: ImportedFamilyOption[];
  importedModelOptions: ImportedModelOption[];
  visibleImportedModelOptions: ImportedModelOption[];
  floorPlanUnderlay: FloorPlanUnderlay | null;
  floorPlanCalibrationMode: boolean;
  floorPlanCalibrationPointCount: number;
  floorPlanCalibrationDistanceInput: string;
  floorPlanCalibrationSummary: string | null;
  floorPlanTraceRoomMode: boolean;
  floorPlanDrawRoomMode: FloorPlanDrawRoomMode;
  floorPlanDrawAngleLockMode: FloorPlanDrawAngleLockMode;
  floorPlanExactWallLengthInput: string;
  floorPlanTraceRoomPointCount: number;
  floorPlanTraceRoomType: RoomType;
  floorPlanTraceOpeningMode: boolean;
  floorPlanTraceOpeningPointCount: number;
  floorPlanTraceOpeningKind: RoomOpening2D["kind"];
  canTraceOpenings: boolean;
  floorPlanPdfSourceReady: boolean;
  floorPlanPdfRenderingPage: number | null;
  roomConnectionChecklistItems: HouseRoomConnectionChecklistItem[];
  visiblePlanOpening: RoomOpening2D | null;
  visiblePlanOpeningRoomName: string;
  visiblePlanOpeningWallSpanMeters: number;
  visiblePlanOpeningMaxHeightMeters: number;
  planRoomCount: number;
  planItemCount: number;
  planOpeningCount: number;
  activeRoomName: string;
  activeRoomId: string;
  catalogRoomNavigationRevision: number;
  rooms: Array<{ id: string; name: string }>;
  activeRoomType: RoomType;
  activeRoomTypeLabel: string;
  activeRoomFloorMaterialId?: string;
  activeRoomFloorRotationDeg?: number;
  activeRoomFloorScale?: number;
  activeRoomFloorPattern?: RoomFloorPattern;
  activeRoomFloorPatternOffset?: { x: number; y: number };
  activeRoomFloorJointSizeMm?: number;
  activeRoomFloorJointColor?: string;
  activeSurfaceTarget: SurfaceTargetMode;
  selectedWallFaceId?: string | null;
  selectedWallLabel?: string | null;
  activeRoomWallSettings?: NormalizedSurfaceSettings;
  activeRoomSelectedWallSettings?: NormalizedSurfaceSettings;
  activeRoomCeilingSettings?: NormalizedSurfaceSettings;
  surfaceBrushActive: boolean;
  surfaceBrushMaterialId?: string | null;
  surfaceBrushPaintColorHex?: string | null;
  surfaceBrushPaintName?: string | null;
  surfaceRooms: SurfaceRoomSummary[];
  showFloorPropertiesPanel?: boolean;
  floorFinishPanelOpenSignal?: number;
  floorOptions: Array<{ level: number; label: string; roomCount: number }>;
  activeFloorLevel: number;
  activeFloorRoomCount: number;
  activeRoomHeightMm: number;
  activeRoomWallHeightEvidence?: FloorPlanPropertyEvidenceV2 | null;
  canEditActiveRoomWallHeight?: boolean;
  activeRoomWallThicknessMm: number;
  activeRoomSlabThicknessMm: number;
  activeRoomSlabThicknessEvidence?: FloorPlanPropertyEvidenceV2 | null;
  canEditActiveRoomSlabThickness?: boolean;
  activeRoomBaseboardDepthMm: number;
  activeRoomWallOpacity: number;
  activeRoomFloorOpacity: number;
  activeRoomCeilingOpacity: number;
  activeRoomCeilingVisible: boolean;
  activeRoomCeilingColor: string;
  stackedFloorView: boolean;
  activeRoomShoppableCount: number;
  activeRoomNeedsReviewCount: number;
  activeRoomCategoryCounts: Partial<Record<CatalogTopCategory, number>>;
  activeRoomShoppingSubtotal: number;
  activeRoomPreviewNames: string[];
  activeRoomShoppingItems: ActiveRoomShoppingItem[];
  selectedPlacedItemId: string | null;
  activeRoomProductQuantities: Record<string, number>;
  activeRoomVariantQuantities: Record<string, number>;
  placementAddMode: "preview" | "auto";
  aiLayoutProposal: AiLayoutProposal | null;
  activeFloorPlanTool: FloorPlanTool;
  simplePlanControls: boolean;
  planGuidedActionsEnabled: boolean;
  planStartMode?: PlanStartMode;
  planCompletionSignal?: { id: number; kind: "room" | "opening" } | null;
  floorPlanQualityReport?: FloorPlanQualityReport | null;
  onPlanCompletionHandled?: (id: number) => void;
  onPlanStartModeChange?: (mode: PlanStartMode) => void;
  onPlanQualityAction?: (action: FloorPlanQualityAction, issue?: FloorPlanQualityIssue) => void;
  onSimplePlanControlsChange: (enabled: boolean) => void;
  onPlanGuidedActionsEnabledChange: (enabled: boolean) => void;
  onSelectFloorPlanTool: () => void;
  onDrawFloorPlanRoom: () => void;
  onAddFloorPlanOpeningFromTool: (kind: RoomOpening2D["kind"]) => void;
  onHide?: () => void;
  onSignIn: () => void;
  onGoFurnish: () => void;
  onGoAiDesign: () => void;
  onGoShop: () => void;
  onGoView3D?: () => void;
  onSelectRoom: (roomId: string) => void;
  onPlacementAddModeChange: (mode: "preview" | "auto") => void;
  onStyleChange: (style: Style) => void;
  onBudgetChange: (budget: Budget) => void;
  onRunAiLayout: (requestedRoles?: AiLayoutRole[]) => void;
  onApplyAiLayoutProposal: () => void;
  onTryAiLayoutAgain: (requestedRoles?: AiLayoutRole[]) => void;
  onClearAiLayoutProposal: () => void;
  onApplyPlanTemplate: (template: HousePlanTemplate, options?: HousePlanTemplateApplyOptions) => void;
  onAddDesignerRoom: () => void;
  onAddRoomTemplate: (template: HouseRoomTemplate) => void;
  onApplyFloorMaterialToRoom: (materialId: string, roomId?: string) => void;
  onApplyFloorMaterialToAllRooms: (materialId: string) => void;
  onRotateActiveFloorMaterial: () => void;
  onResetActiveFloorMaterialPattern: () => void;
  onActiveFloorMaterialScaleChange: (scale: number) => void;
  onActiveFloorSurfaceSettingsChange: (patch: FloorSurfacePatch) => void;
  onSurfaceTargetChange: (target: SurfaceTargetMode) => void;
  onSurfaceBrushActiveChange: (active: boolean) => void;
  onSurfaceMaterialSelected: (materialId: string | null) => void;
  onSurfacePaintSelected: (colorHex: string | null, name?: string | null) => void;
  onApplyWallMaterialToRoom: (materialId: string, roomId?: string, faceId?: string | null) => void;
  onApplyWallMaterialToAllRooms: (materialId: string) => void;
  onApplyWallPaintToRoom: (colorHex: string, name?: string | null, roomId?: string, faceId?: string | null) => void;
  onApplyWallPaintToAllRooms: (colorHex: string, name?: string | null) => void;
  onApplyCeilingPaintToRoom: (colorHex: string, name?: string | null, roomId?: string | null) => void;
  onApplyCeilingPaintToAllRooms: (colorHex: string, name?: string | null) => void;
  onActiveWallSurfaceSettingsChange: (patch: SurfaceSettingsPatch) => void;
  onResetActiveWallSurface: () => void;
  onResetActiveCeilingSurface: () => void;
  onNewRoomTypeChange: (roomType: RoomType) => void;
  onNewRoomShapeChange: (shape: RoomPlanShape) => void;
  onRoomPresetChange: (presetId: RoomSizePresetId) => void;
  onRoomWidthInputChange: (value: string) => void;
  onRoomDepthInputChange: (value: string) => void;
  onMeasurementUnitChange: (unit: PlanMeasurementUnit) => void;
  onCommitRoomDimension: (axis: "width" | "depth", valueMm: number) => void;
  onActiveRoomHeightMmChange: (
    valueMm: number,
    evidence?: FloorPlanConsumerMeasurementEvidenceV2,
    measurementNote?: string
  ) => void;
  onActiveRoomWallThicknessMmChange: (valueMm: number) => void;
  onActiveRoomSlabThicknessMmChange: (
    valueMm: number,
    evidence?: FloorPlanConsumerMeasurementEvidenceV2,
    measurementNote?: string
  ) => void;
  onActiveRoomBaseboardDepthMmChange: (valueMm: number) => void;
  onActiveRoomSurfaceOpacityChange: (kind: "wall" | "floor" | "ceiling", opacity: number) => void;
  onActiveRoomCeilingVisibleChange: (visible: boolean) => void;
  onActiveRoomCeilingColorChange: (color: string) => void;
  onAddImportedToRoom: () => void;
  onAddCatalogItemToRoom: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  onAutoPlaceCatalogItemInRoom?: (productId: string, variantId?: string, purchaseOptionId?: string) => void;
  onPreviewCatalogPlacementIntent?: (productId: string | null, variantId?: string) => void;
  onCatalogDragStart?: (productId: string, variantId?: string) => void;
  onCatalogDragEnd?: () => void;
  onAddActiveRoomCartReadyItems: () => void;
  onReviewShoppingIssue: (filter: ShoppingReadinessFilter) => void;
  onSelectPlacedItem: (instanceId: string) => void;
  onSelectedImportedFamilyChange: (familyKey: string) => void;
  onSelectedImportedProductChange: (productId: string) => void;
  onGridToggle: () => void;
  onSnapToggle: () => void;
  onFloorPlanUpload: (file: File) => void;
  onFloorPlanPdfPageChange: (pageNumber: number) => void;
  onFloorPlanOpacityChange: (opacity: number) => void;
  onFloorPlanLockChange: (locked: boolean) => void;
  onFloorPlanCalibrationModeChange: (enabled: boolean) => void;
  onFloorPlanCalibrationDistanceChange: (value: string) => void;
  onApplyFloorPlanCalibration: () => void;
  onResetFloorPlanCalibrationPoints: () => void;
  onFloorPlanTraceRoomModeChange: (enabled: boolean) => void;
  onFloorPlanTraceRoomDrawModeChange: (mode: FloorPlanDrawRoomMode) => void;
  onFloorPlanDrawAngleLockModeChange: (mode: FloorPlanDrawAngleLockMode) => void;
  onFloorPlanExactWallLengthInputChange: (value: string) => void;
  onApplyFloorPlanExactWallLength: () => void;
  onFloorPlanTraceRoomTypeChange: (roomType: RoomType) => void;
  onUndoFloorPlanTraceRoomPoint: () => void;
  onResetFloorPlanTraceRoomPoints: () => void;
  onFloorPlanTraceOpeningModeChange: (enabled: boolean) => void;
  onFloorPlanTraceOpeningKindChange: (kind: RoomOpening2D["kind"]) => void;
  onResetFloorPlanTraceOpeningPoints: () => void;
  onClearFloorPlan: () => void;
  onAddSuggestedDoorway: (suggestion: HouseRoomDoorwaySuggestion) => void;
  onUpdateOpeningMetrics: (
    id: string,
    metrics: DesignPageOpeningMetricsPatch
  ) => void;
};

export default function DesignControlsPanel({
  dark, floorPlanLifecycleIdentity,
  isClientPreview,
  isDesigner,
  canEdit,
  canEditPlanGeometry,
  collapsed = false,
  onCollapsedChange,
  aiDesignEnabled = false,
  panelMode = "plan",
  selectionContext = null,
  viewMode,
  style,
  budget,
  showGrid,
  snapEnabled,
  newRoomType,
  newRoomShape,
  activeRoomPresetId,
  roomWidthInput,
  roomDepthInput,
  roomWidth,
  roomDepth,
  measurementUnit, measurementUnitReady,
  catalogItems,
  selectedImportedFamilyKey,
  selectedImportedProductId,
  importedFamilyOptions,
  importedModelOptions,
  visibleImportedModelOptions,
  floorPlanUnderlay,
  floorPlanCalibrationMode,
  floorPlanCalibrationPointCount,
  floorPlanCalibrationDistanceInput,
  floorPlanCalibrationSummary,
  floorPlanTraceRoomMode,
  floorPlanDrawRoomMode,
  floorPlanDrawAngleLockMode,
  floorPlanExactWallLengthInput,
  floorPlanTraceRoomPointCount,
  floorPlanTraceRoomType,
  floorPlanTraceOpeningMode,
  floorPlanTraceOpeningPointCount,
  floorPlanTraceOpeningKind,
  canTraceOpenings,
  floorPlanPdfSourceReady,
  floorPlanPdfRenderingPage,
  roomConnectionChecklistItems,
  visiblePlanOpening,
  visiblePlanOpeningRoomName,
  visiblePlanOpeningWallSpanMeters,
  visiblePlanOpeningMaxHeightMeters,
  planRoomCount,
  planItemCount,
  planOpeningCount,
  activeRoomName,
  activeRoomId,
  catalogRoomNavigationRevision,
  rooms,
  activeRoomType,
  activeRoomTypeLabel,
  activeRoomFloorMaterialId,
  activeRoomFloorRotationDeg,
  activeRoomFloorScale,
  activeRoomFloorPattern,
  activeRoomFloorPatternOffset,
  activeRoomFloorJointSizeMm,
  activeRoomFloorJointColor,
  activeSurfaceTarget,
  selectedWallFaceId,
  selectedWallLabel,
  activeRoomWallSettings,
  activeRoomSelectedWallSettings,
  activeRoomCeilingSettings,
  surfaceBrushActive,
  surfaceBrushMaterialId,
  surfaceBrushPaintColorHex,
  surfaceBrushPaintName,
  surfaceRooms,
  showFloorPropertiesPanel = false,
  floorFinishPanelOpenSignal,
  floorOptions,
  activeFloorLevel,
  activeFloorRoomCount,
  activeRoomHeightMm,
  activeRoomWallHeightEvidence,
  canEditActiveRoomWallHeight,
  activeRoomWallThicknessMm,
  activeRoomSlabThicknessMm,
  activeRoomSlabThicknessEvidence,
  canEditActiveRoomSlabThickness,
  activeRoomBaseboardDepthMm,
  activeRoomWallOpacity,
  activeRoomFloorOpacity,
  activeRoomCeilingOpacity,
  activeRoomCeilingVisible,
  activeRoomCeilingColor,
  stackedFloorView,
  activeRoomShoppableCount,
  activeRoomNeedsReviewCount,
  activeRoomCategoryCounts,
  activeRoomShoppingSubtotal,
  activeRoomPreviewNames,
  activeRoomShoppingItems,
  selectedPlacedItemId,
  activeRoomProductQuantities,
  activeRoomVariantQuantities,
  placementAddMode,
  aiLayoutProposal,
  activeFloorPlanTool,
  simplePlanControls,
  planGuidedActionsEnabled,
  planStartMode,
  planCompletionSignal,
  floorPlanQualityReport,
  onPlanCompletionHandled,
  onPlanStartModeChange,
  onPlanQualityAction,
  onSimplePlanControlsChange,
  onPlanGuidedActionsEnabledChange,
  onSelectFloorPlanTool,
  onDrawFloorPlanRoom,
  onAddFloorPlanOpeningFromTool,
  onGoFurnish,
  onGoAiDesign,
  onGoShop,
  onGoView3D,
  onSelectRoom,
  onPlacementAddModeChange,
  onStyleChange,
  onBudgetChange,
  onRunAiLayout,
  onApplyAiLayoutProposal,
  onTryAiLayoutAgain,
  onClearAiLayoutProposal,
  onApplyPlanTemplate,
  onAddDesignerRoom,
  onAddRoomTemplate,
  onApplyFloorMaterialToRoom,
  onApplyFloorMaterialToAllRooms,
  onRotateActiveFloorMaterial,
  onResetActiveFloorMaterialPattern,
  onActiveFloorMaterialScaleChange,
  onActiveFloorSurfaceSettingsChange,
  onSurfaceTargetChange,
  onSurfaceBrushActiveChange,
  onSurfaceMaterialSelected,
  onSurfacePaintSelected,
  onApplyWallMaterialToRoom,
  onApplyWallMaterialToAllRooms,
  onApplyWallPaintToRoom,
  onApplyWallPaintToAllRooms,
  onApplyCeilingPaintToRoom,
  onApplyCeilingPaintToAllRooms,
  onActiveWallSurfaceSettingsChange,
  onResetActiveWallSurface,
  onResetActiveCeilingSurface,
  onNewRoomTypeChange,
  onNewRoomShapeChange,
  onRoomPresetChange,
  onRoomWidthInputChange,
  onRoomDepthInputChange,
  onMeasurementUnitChange,
  onCommitRoomDimension,
  onActiveRoomHeightMmChange,
  onActiveRoomWallThicknessMmChange,
  onActiveRoomSlabThicknessMmChange,
  onActiveRoomBaseboardDepthMmChange,
  onActiveRoomSurfaceOpacityChange,
  onActiveRoomCeilingVisibleChange,
  onActiveRoomCeilingColorChange,
  onAddImportedToRoom,
  onAddCatalogItemToRoom,
  onAutoPlaceCatalogItemInRoom,
  onPreviewCatalogPlacementIntent,
  onCatalogDragStart,
  onCatalogDragEnd,
  onAddActiveRoomCartReadyItems,
  onReviewShoppingIssue,
  onSelectPlacedItem,
  onSelectedImportedFamilyChange,
  onSelectedImportedProductChange,
  onGridToggle,
  onSnapToggle,
  onFloorPlanUpload,
  onFloorPlanPdfPageChange,
  onFloorPlanOpacityChange,
  onFloorPlanLockChange,
  onFloorPlanCalibrationModeChange,
  onFloorPlanCalibrationDistanceChange,
  onApplyFloorPlanCalibration,
  onResetFloorPlanCalibrationPoints,
  onFloorPlanTraceRoomModeChange,
  onFloorPlanTraceRoomDrawModeChange,
  onFloorPlanDrawAngleLockModeChange,
  onFloorPlanExactWallLengthInputChange,
  onApplyFloorPlanExactWallLength,
  onFloorPlanTraceRoomTypeChange,
  onUndoFloorPlanTraceRoomPoint,
  onResetFloorPlanTraceRoomPoints,
  onFloorPlanTraceOpeningModeChange,
  onFloorPlanTraceOpeningKindChange,
  onResetFloorPlanTraceOpeningPoints,
  onClearFloorPlan,
  onAddSuggestedDoorway,
  onUpdateOpeningMetrics,
}: DesignControlsPanelProps) {
  const [edgePreviewOpen, setEdgePreviewOpen] = useState(false);
  const edgePreviewCloseTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null);
  const temporarilyRevealed = Boolean(collapsed && edgePreviewOpen);

  const cancelEdgePreviewClose = () => {
    if (edgePreviewCloseTimerRef.current === null) return;
    clearTimeout(edgePreviewCloseTimerRef.current);
    edgePreviewCloseTimerRef.current = null;
  };
  const openEdgePreview = () => {
    cancelEdgePreviewClose();
    setEdgePreviewOpen(true);
  };
  const scheduleEdgePreviewClose = () => {
    cancelEdgePreviewClose();
    edgePreviewCloseTimerRef.current = setTimeout(() => {
      edgePreviewCloseTimerRef.current = null;
      setEdgePreviewOpen(false);
    }, 180);
  };

  useEffect(
    () => () => {
      if (edgePreviewCloseTimerRef.current !== null) {
        clearTimeout(edgePreviewCloseTimerRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (!onCollapsedChange) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "b") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      setEdgePreviewOpen(false);
      onCollapsedChange(!collapsed);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [collapsed, onCollapsedChange]);

  const effectivePanelMode = panelMode === "ai" && !aiDesignEnabled ? "plan" : panelMode;
  const panelTitle =
    effectivePanelMode === "plan" ? "Plan" : effectivePanelMode === "furnish" ? "Furnish" : "AI Design";
  const panelSubtitle =
    effectivePanelMode === "plan"
      ? planRoomCount > 0
        ? "Adjust the room, doors, windows, and finish."
        : "Start with a room size, then add doors and windows."
      : effectivePanelMode === "furnish"
        ? "Add real purchasable furniture and arrange it in the active room."
        : "Generate a starter layout, review it, then apply when it looks right.";
  if (isClientPreview) return null;

  const planPanelSurfaceTarget = activeSurfaceTarget;
  const panelClass = "space-y-3";
  const panelHeaderClass = dark
    ? "designer-divider border-b p-3"
    : "rounded-xl border border-neutral-200 bg-white/95 p-3 text-neutral-900 shadow-lg backdrop-blur";
  const panelSubtitleClass = dark ? "designer-text-secondary mt-1 text-xs" : "mt-1 text-xs text-neutral-500";
  const selectedButtonClass = dark ? "designer-control-active border" : "bg-neutral-900 text-white";
  const panelLeftClass = temporarilyRevealed
    ? "left-0 md:left-0"
    : isDesigner
      ? "left-1 md:left-20"
      : "left-1 md:left-1";
  const panelShellClass = `${dark ? "designer-dock overflow-hidden rounded-xl p-2" : ""} absolute bottom-1 right-1 top-auto z-20 w-auto space-y-3 pr-1 md:bottom-auto md:right-auto md:top-11 md:w-[18.15rem] ${panelLeftClass}`;

  if (collapsed && !temporarilyRevealed) {
    return (
      <div
        data-testid="design-controls-edge-reveal"
        className="group absolute bottom-0 left-0 top-9 z-40 w-8 md:top-11 md:w-4"
        onMouseEnter={openEdgePreview}
      >
        <div
          className={`absolute bottom-3 left-0 top-3 w-1 rounded-r-full transition-colors ${
            dark
              ? "bg-white/20 group-hover:bg-blue-400"
              : "bg-neutral-300 group-hover:bg-blue-500"
          }`}
          aria-hidden="true"
        />
        <button
          type="button"
          data-testid="design-controls-edge-toggle"
          aria-label="Show design sidebar"
          title="Show design sidebar (Ctrl/⌘ B)"
          className={
            dark
              ? "designer-work-control absolute left-1 top-4 flex h-9 w-9 items-center justify-center rounded-xl border opacity-70 shadow-xl transition-opacity focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 md:opacity-0"
              : "absolute left-1 top-4 flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-neutral-800 opacity-70 shadow-xl transition-opacity hover:bg-neutral-50 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 md:opacity-0"
          }
          onClick={() => {
            setEdgePreviewOpen(false);
            onCollapsedChange?.(false);
          }}
        >
          <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div
      data-testid="design-controls-panel"
      data-temporary-reveal={temporarilyRevealed ? "true" : "false"}
      className={`${panelShellClass} max-h-[64vh] overflow-y-auto pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:max-h-[calc(100vh-4.75rem)] md:pb-4 ${
        temporarilyRevealed ? "z-40 drop-shadow-2xl" : ""
      }`}
      onMouseEnter={cancelEdgePreviewClose}
      onMouseLeave={() => {
        if (temporarilyRevealed) scheduleEdgePreviewClose();
      }}
    >
      <div
        data-testid="design-controls-panel-handle"
        className="mx-auto h-1.5 w-12 rounded-full bg-neutral-300/80 md:hidden"
        aria-hidden="true"
      />
      <div className={panelHeaderClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={dark ? "designer-text-primary text-lg font-semibold" : "text-lg font-semibold text-neutral-950"}>
              {panelTitle}
            </div>
            <div className={panelSubtitleClass}>{panelSubtitle}</div>
          </div>
          {temporarilyRevealed ? (
            <button
              type="button"
              data-testid="design-controls-sidebar-toggle"
              aria-label="Keep design tools open"
              title="Keep sidebar open"
              className={
                dark
                  ? "designer-work-control inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
                  : "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              }
              onClick={() => {
                setEdgePreviewOpen(false);
                onCollapsedChange?.(false);
              }}
            >
              <Pin className="h-3.5 w-3.5" aria-hidden="true" />
              Keep open
            </button>
          ) : null}
        </div>
      </div>

      {selectionContext && effectivePanelMode !== "plan" && (
        <div
          data-testid="selected-object-context"
          className={
            dark
              ? "designer-raised rounded-xl border px-3 py-2"
              : "rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className={
                  selectionContext.tone === "furnish"
                    ? dark
                      ? "designer-accent text-[11px] font-semibold uppercase tracking-wide"
                      : "text-[11px] font-semibold uppercase tracking-wide text-blue-700"
                    : dark
                      ? "designer-text-secondary text-[11px] font-semibold uppercase tracking-wide"
                      : "text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
                }
              >
                {selectionContext.label}
              </div>
              <div className={dark ? "designer-text-primary mt-0.5 truncate text-sm font-semibold" : "mt-0.5 truncate text-sm font-semibold text-neutral-950"}>
                {selectionContext.title}
              </div>
              <div className={dark ? "designer-text-muted mt-0.5 text-[11px]" : "mt-0.5 text-[11px] text-neutral-500"}>
                {selectionContext.detail}
              </div>
            </div>
            <span
              className={
                selectionContext.tone === "furnish"
                  ? dark
                    ? "designer-status-info shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                    : "shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700"
                  : dark
                    ? "designer-status-ready shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold"
                    : "shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"
              }
            >
              {selectionContext.tone === "furnish" ? "Furnish" : "Plan"}
            </span>
          </div>
        </div>
      )}

      <div className={panelClass}>
        {effectivePanelMode === "plan" && (
          <DesignControlsPlanPanel floorPlanLifecycleIdentity={floorPlanLifecycleIdentity}
            dark={dark}
            isClientPreview={isClientPreview}
            isDesigner={isDesigner}
            canEdit={canEdit}
            canEditPlanGeometry={canEditPlanGeometry}
            aiDesignEnabled={aiDesignEnabled}
            viewMode={viewMode}
            snapEnabled={snapEnabled}
            newRoomType={newRoomType}
            newRoomShape={newRoomShape}
            activeRoomPresetId={activeRoomPresetId}
            roomWidthInput={roomWidthInput}
            roomDepthInput={roomDepthInput}
            roomWidth={roomWidth}
            roomDepth={roomDepth}
            measurementUnit={measurementUnit} measurementUnitReady={measurementUnitReady}
            floorPlanUnderlay={floorPlanUnderlay}
            floorPlanCalibrationMode={floorPlanCalibrationMode}
            floorPlanCalibrationPointCount={floorPlanCalibrationPointCount}
            floorPlanCalibrationDistanceInput={floorPlanCalibrationDistanceInput}
            floorPlanCalibrationSummary={floorPlanCalibrationSummary}
            floorPlanTraceRoomMode={floorPlanTraceRoomMode}
            floorPlanDrawRoomMode={floorPlanDrawRoomMode}
            floorPlanDrawAngleLockMode={floorPlanDrawAngleLockMode}
            floorPlanExactWallLengthInput={floorPlanExactWallLengthInput}
            floorPlanTraceRoomPointCount={floorPlanTraceRoomPointCount}
            floorPlanTraceRoomType={floorPlanTraceRoomType}
            floorPlanTraceOpeningMode={floorPlanTraceOpeningMode}
            floorPlanTraceOpeningPointCount={floorPlanTraceOpeningPointCount}
            floorPlanTraceOpeningKind={floorPlanTraceOpeningKind}
            canTraceOpenings={canTraceOpenings}
            floorPlanPdfSourceReady={floorPlanPdfSourceReady}
            floorPlanPdfRenderingPage={floorPlanPdfRenderingPage}
            roomConnectionChecklistItems={roomConnectionChecklistItems}
            visiblePlanOpening={visiblePlanOpening}
            visiblePlanOpeningRoomName={visiblePlanOpeningRoomName}
            visiblePlanOpeningWallSpanMeters={visiblePlanOpeningWallSpanMeters}
            visiblePlanOpeningMaxHeightMeters={visiblePlanOpeningMaxHeightMeters}
            planRoomCount={planRoomCount}
            planItemCount={planItemCount}
            planOpeningCount={planOpeningCount}
            activeRoomName={activeRoomName}
            activeRoomId={activeRoomId}
            activeRoomType={activeRoomType}
            activeRoomFloorMaterialId={activeRoomFloorMaterialId}
            activeRoomFloorRotationDeg={activeRoomFloorRotationDeg}
            activeRoomFloorScale={activeRoomFloorScale}
            activeRoomFloorPattern={activeRoomFloorPattern}
            activeRoomFloorPatternOffset={activeRoomFloorPatternOffset}
            activeRoomFloorJointSizeMm={activeRoomFloorJointSizeMm}
            activeRoomFloorJointColor={activeRoomFloorJointColor}
            activeSurfaceTarget={planPanelSurfaceTarget}
            selectedWallFaceId={selectedWallFaceId}
            selectedWallLabel={selectedWallLabel}
            activeRoomWallSettings={activeRoomWallSettings}
            activeRoomSelectedWallSettings={activeRoomSelectedWallSettings}
            activeRoomCeilingSettings={activeRoomCeilingSettings}
            surfaceBrushActive={surfaceBrushActive}
            surfaceBrushMaterialId={surfaceBrushMaterialId}
            surfaceBrushPaintColorHex={surfaceBrushPaintColorHex}
            surfaceBrushPaintName={surfaceBrushPaintName}
            surfaceRooms={surfaceRooms}
            showFloorPropertiesPanel={showFloorPropertiesPanel}
            floorFinishPanelOpenSignal={floorFinishPanelOpenSignal}
            floorOptions={floorOptions}
            activeFloorLevel={activeFloorLevel}
            activeFloorRoomCount={activeFloorRoomCount}
            activeRoomHeightMm={activeRoomHeightMm}
            activeRoomWallHeightEvidence={activeRoomWallHeightEvidence}
            canEditActiveRoomWallHeight={canEditActiveRoomWallHeight}
            activeRoomWallThicknessMm={activeRoomWallThicknessMm}
            activeRoomSlabThicknessMm={activeRoomSlabThicknessMm}
            activeRoomSlabThicknessEvidence={activeRoomSlabThicknessEvidence}
            canEditActiveRoomSlabThickness={canEditActiveRoomSlabThickness}
            activeRoomBaseboardDepthMm={activeRoomBaseboardDepthMm}
            activeRoomWallOpacity={activeRoomWallOpacity}
            activeRoomFloorOpacity={activeRoomFloorOpacity}
            activeRoomCeilingOpacity={activeRoomCeilingOpacity}
            activeRoomCeilingVisible={activeRoomCeilingVisible}
            activeRoomCeilingColor={activeRoomCeilingColor}
            stackedFloorView={stackedFloorView}
            activeFloorPlanTool={activeFloorPlanTool}
            simplePlanControls={simplePlanControls}
            planGuidedActionsEnabled={planGuidedActionsEnabled}
            planStartMode={planStartMode}
            planCompletionSignal={planCompletionSignal}
            floorPlanQualityReport={floorPlanQualityReport}
            onPlanCompletionHandled={onPlanCompletionHandled}
            onPlanStartModeChange={onPlanStartModeChange}
            onPlanQualityAction={onPlanQualityAction}
            onSimplePlanControlsChange={onSimplePlanControlsChange}
            onPlanGuidedActionsEnabledChange={onPlanGuidedActionsEnabledChange}
            onSelectFloorPlanTool={onSelectFloorPlanTool}
            onDrawFloorPlanRoom={onDrawFloorPlanRoom}
            onAddFloorPlanOpeningFromTool={onAddFloorPlanOpeningFromTool}
            onGoFurnish={onGoFurnish}
            onGoAiDesign={onGoAiDesign}
            onGoShop={onGoShop}
            onGoView3D={onGoView3D}
            onApplyPlanTemplate={onApplyPlanTemplate}
            onAddDesignerRoom={onAddDesignerRoom}
            onAddRoomTemplate={onAddRoomTemplate}
            onSelectRoom={onSelectRoom}
            onApplyFloorMaterialToRoom={onApplyFloorMaterialToRoom}
            onApplyFloorMaterialToAllRooms={onApplyFloorMaterialToAllRooms}
            onRotateActiveFloorMaterial={onRotateActiveFloorMaterial}
            onResetActiveFloorMaterialPattern={onResetActiveFloorMaterialPattern}
            onActiveFloorMaterialScaleChange={onActiveFloorMaterialScaleChange}
            onActiveFloorSurfaceSettingsChange={onActiveFloorSurfaceSettingsChange}
            onSurfaceTargetChange={onSurfaceTargetChange}
            onSurfaceBrushActiveChange={onSurfaceBrushActiveChange}
            onSurfaceMaterialSelected={onSurfaceMaterialSelected}
            onSurfacePaintSelected={onSurfacePaintSelected}
            onApplyWallMaterialToRoom={onApplyWallMaterialToRoom}
            onApplyWallMaterialToAllRooms={onApplyWallMaterialToAllRooms}
            onApplyWallPaintToRoom={onApplyWallPaintToRoom}
            onApplyWallPaintToAllRooms={onApplyWallPaintToAllRooms}
            onApplyCeilingPaintToRoom={onApplyCeilingPaintToRoom}
            onApplyCeilingPaintToAllRooms={onApplyCeilingPaintToAllRooms}
            onActiveWallSurfaceSettingsChange={onActiveWallSurfaceSettingsChange}
            onResetActiveWallSurface={onResetActiveWallSurface}
            onResetActiveCeilingSurface={onResetActiveCeilingSurface}
            onNewRoomTypeChange={onNewRoomTypeChange}
            onNewRoomShapeChange={onNewRoomShapeChange}
            onRoomPresetChange={onRoomPresetChange}
            onRoomWidthInputChange={onRoomWidthInputChange}
            onRoomDepthInputChange={onRoomDepthInputChange}
            onMeasurementUnitChange={onMeasurementUnitChange}
            onCommitRoomDimension={onCommitRoomDimension}
            onActiveRoomHeightMmChange={onActiveRoomHeightMmChange}
            onActiveRoomWallThicknessMmChange={onActiveRoomWallThicknessMmChange}
            onActiveRoomSlabThicknessMmChange={onActiveRoomSlabThicknessMmChange}
            onActiveRoomBaseboardDepthMmChange={onActiveRoomBaseboardDepthMmChange}
            onActiveRoomSurfaceOpacityChange={onActiveRoomSurfaceOpacityChange}
            onActiveRoomCeilingVisibleChange={onActiveRoomCeilingVisibleChange}
            onActiveRoomCeilingColorChange={onActiveRoomCeilingColorChange}
            onFloorPlanUpload={onFloorPlanUpload}
            onFloorPlanPdfPageChange={onFloorPlanPdfPageChange}
            onFloorPlanOpacityChange={onFloorPlanOpacityChange}
            onFloorPlanLockChange={onFloorPlanLockChange}
            onFloorPlanCalibrationModeChange={onFloorPlanCalibrationModeChange}
            onFloorPlanCalibrationDistanceChange={onFloorPlanCalibrationDistanceChange}
            onApplyFloorPlanCalibration={onApplyFloorPlanCalibration}
            onResetFloorPlanCalibrationPoints={onResetFloorPlanCalibrationPoints}
            onFloorPlanTraceRoomModeChange={onFloorPlanTraceRoomModeChange}
            onFloorPlanTraceRoomDrawModeChange={onFloorPlanTraceRoomDrawModeChange}
            onFloorPlanDrawAngleLockModeChange={onFloorPlanDrawAngleLockModeChange}
            onFloorPlanExactWallLengthInputChange={onFloorPlanExactWallLengthInputChange}
            onApplyFloorPlanExactWallLength={onApplyFloorPlanExactWallLength}
            onFloorPlanTraceRoomTypeChange={onFloorPlanTraceRoomTypeChange}
            onUndoFloorPlanTraceRoomPoint={onUndoFloorPlanTraceRoomPoint}
            onResetFloorPlanTraceRoomPoints={onResetFloorPlanTraceRoomPoints}
            onFloorPlanTraceOpeningModeChange={onFloorPlanTraceOpeningModeChange}
            onFloorPlanTraceOpeningKindChange={onFloorPlanTraceOpeningKindChange}
            onResetFloorPlanTraceOpeningPoints={onResetFloorPlanTraceOpeningPoints}
            onClearFloorPlan={onClearFloorPlan}
            onAddSuggestedDoorway={onAddSuggestedDoorway}
            onUpdateOpeningMetrics={onUpdateOpeningMetrics}
          />
        )}
        {effectivePanelMode === "ai" && aiDesignEnabled && (
          <DesignControlsAiPanel
            dark={dark}
            style={style}
            budget={budget}
            activeRoomName={activeRoomName}
            activeRoomType={activeRoomType}
            activeRoomTypeLabel={activeRoomTypeLabel}
            roomWidth={roomWidth}
            roomDepth={roomDepth}
            activeRoomItemCount={planItemCount}
            aiLayoutProposal={aiLayoutProposal}
            onStyleChange={onStyleChange}
            onBudgetChange={onBudgetChange}
            onRunAiLayout={onRunAiLayout}
            onApplyAiLayoutProposal={onApplyAiLayoutProposal}
            onTryAiLayoutAgain={onTryAiLayoutAgain}
            onClearAiLayoutProposal={onClearAiLayoutProposal}
          />
        )}

        {effectivePanelMode === "furnish" && (
          <DesignControlsFurnishPanel
            dark={dark}
            canEdit={canEdit}
            {...{ activeRoomName, activeRoomId, catalogRoomNavigationRevision }}
            rooms={rooms}
            activeRoomTypeLabel={activeRoomTypeLabel}
            activeRoomItemCount={planItemCount}
            activeRoomShoppableCount={activeRoomShoppableCount}
            activeRoomNeedsReviewCount={activeRoomNeedsReviewCount}
            activeRoomCategoryCounts={activeRoomCategoryCounts}
            roomWidth={roomWidth}
            roomDepth={roomDepth}
            activeRoomShoppingSubtotal={activeRoomShoppingSubtotal}
            activeRoomPreviewNames={activeRoomPreviewNames}
            activeRoomShoppingItems={activeRoomShoppingItems}
            selectedPlacedItemId={selectedPlacedItemId}
            activeRoomProductQuantities={activeRoomProductQuantities}
            activeRoomVariantQuantities={activeRoomVariantQuantities}
            placementAddMode={placementAddMode}
            budget={budget}
            style={style}
            roomCount={planRoomCount}
            catalogItems={catalogItems}
            selectedImportedFamilyKey={selectedImportedFamilyKey}
            selectedImportedProductId={selectedImportedProductId}
            importedFamilyOptions={importedFamilyOptions}
            importedModelOptions={importedModelOptions}
            visibleImportedModelOptions={visibleImportedModelOptions}
            onAddImportedToRoom={onAddImportedToRoom}
            onAddCatalogItemToRoom={onAddCatalogItemToRoom}
            onAutoPlaceCatalogItemInRoom={onAutoPlaceCatalogItemInRoom}
            onPreviewCatalogPlacementIntent={onPreviewCatalogPlacementIntent}
            onCatalogDragStart={onCatalogDragStart}
            onCatalogDragEnd={onCatalogDragEnd}
            onAddActiveRoomCartReadyItems={onAddActiveRoomCartReadyItems}
            onReviewShoppingIssue={onReviewShoppingIssue}
            onSelectPlacedItem={onSelectPlacedItem}
            onSelectRoom={onSelectRoom}
            onPlacementAddModeChange={onPlacementAddModeChange}
            onGoShop={onGoShop}
            onSelectedImportedFamilyChange={onSelectedImportedFamilyChange}
            onSelectedImportedProductChange={onSelectedImportedProductChange}
          />
        )}

        {effectivePanelMode !== "ai" && isDesigner && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              className={`text-xs px-3 py-2 rounded-lg ${
                showGrid ? selectedButtonClass : dark ? "designer-raised text-neutral-200" : "bg-neutral-100"
              }`}
              onClick={onGridToggle}
            >
              Grid
            </button>
            <button
              className={`text-xs px-3 py-2 rounded-lg ${
                snapEnabled ? selectedButtonClass : dark ? "designer-raised text-neutral-200" : "bg-neutral-100"
              }`}
              onClick={onSnapToggle}
            >
              Snap
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
