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
import { type AiLayoutProposal, type Style } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import type { AiLayoutRole } from "@/lib/ai/layout-planner";
import type { CatalogTopCategory } from "@/lib/catalog/view-builders";
import type { ActiveRoomShoppingItem } from "@/lib/room-shopping";
import type { ShoppingReadinessFilter } from "@/lib/shopping-readiness";
import type { DesignSelectionContext } from "@/lib/design-page-selection-context";
import type { RoomPlanShape, RoomType } from "@/lib/room-types";
import type { EditorViewMode } from "./EditorViewToggle";
import DesignControlsAiPanel from "./DesignControlsAiPanel";
import DesignControlsFurnishPanel from "./DesignControlsFurnishPanel";
import DesignControlsPlanPanel, { type PlanStartMode } from "./DesignControlsPlanPanel";
import type { FloorPlanTool } from "./FloorPlanToolStrip";

type Budget = "$" | "$$" | "$$$";
type ConsumerPanelMode = "plan" | "furnish" | "ai";

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

type DesignControlsPanelProps = {
  dark: boolean;
  isClientPreview: boolean;
  isAuthed: boolean;
  isDesigner: boolean;
  canEdit: boolean;
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
  planRoomCount: number;
  planItemCount: number;
  planOpeningCount: number;
  activeRoomName: string;
  activeRoomId: string;
  rooms: Array<{ id: string; name: string }>;
  activeRoomType: RoomType;
  activeRoomTypeLabel: string;
  activeRoomFloorMaterialId?: string;
  activeRoomFloorRotationDeg?: number;
  activeRoomFloorScale?: number;
  floorOptions: Array<{ level: number; label: string; roomCount: number }>;
  activeFloorLevel: number;
  activeFloorRoomCount: number;
  activeRoomHeightMm: number;
  activeRoomWallThicknessMm: number;
  activeRoomSlabThicknessMm: number;
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
  activeRoomProductQuantities: Record<string, number>;
  activeRoomVariantQuantities: Record<string, number>;
  placementAddMode: "preview" | "auto";
  aiLayoutProposal: AiLayoutProposal | null;
  activeFloorPlanTool: FloorPlanTool;
  simplePlanControls: boolean;
  planGuidedActionsEnabled: boolean;
  planStartMode?: PlanStartMode;
  planCompletionSignal?: { id: number; kind: "room" | "opening" } | null;
  onPlanCompletionHandled?: (id: number) => void;
  onPlanStartModeChange?: (mode: PlanStartMode) => void;
  onSimplePlanControlsChange: (enabled: boolean) => void;
  onPlanGuidedActionsEnabledChange: (enabled: boolean) => void;
  onSelectFloorPlanTool: () => void;
  onDrawFloorPlanRoom: () => void;
  onAddFloorPlanOpeningFromTool: (kind: RoomOpening2D["kind"]) => void;
  onHide: () => void;
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
  onApplyFloorMaterialToRoom: (materialId: string) => void;
  onApplyFloorMaterialToAllRooms: (materialId: string) => void;
  onRotateActiveFloorMaterial: () => void;
  onResetActiveFloorMaterialPattern: () => void;
  onActiveFloorMaterialScaleChange: (scale: number) => void;
  onNewRoomTypeChange: (roomType: RoomType) => void;
  onNewRoomShapeChange: (shape: RoomPlanShape) => void;
  onRoomPresetChange: (presetId: RoomSizePresetId) => void;
  onRoomWidthInputChange: (value: string) => void;
  onRoomDepthInputChange: (value: string) => void;
  onApplyRoomSize: () => void;
  onActiveRoomHeightMmChange: (valueMm: number) => void;
  onActiveRoomWallThicknessMmChange: (valueMm: number) => void;
  onActiveRoomSlabThicknessMmChange: (valueMm: number) => void;
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
    metrics: {
      widthMeters?: number;
      offsetMeters?: number;
      kind?: RoomOpening2D["kind"];
    }
  ) => void;
};

export default function DesignControlsPanel({
  dark,
  isClientPreview,
  isAuthed,
  isDesigner,
  canEdit,
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
  planRoomCount,
  planItemCount,
  planOpeningCount,
  activeRoomName,
  activeRoomId,
  rooms,
  activeRoomType,
  activeRoomTypeLabel,
  activeRoomFloorMaterialId,
  activeRoomFloorRotationDeg,
  activeRoomFloorScale,
  floorOptions,
  activeFloorLevel,
  activeFloorRoomCount,
  activeRoomHeightMm,
  activeRoomWallThicknessMm,
  activeRoomSlabThicknessMm,
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
  activeRoomProductQuantities,
  activeRoomVariantQuantities,
  placementAddMode,
  aiLayoutProposal,
  activeFloorPlanTool,
  simplePlanControls,
  planGuidedActionsEnabled,
  planStartMode,
  planCompletionSignal,
  onPlanCompletionHandled,
  onPlanStartModeChange,
  onSimplePlanControlsChange,
  onPlanGuidedActionsEnabledChange,
  onSelectFloorPlanTool,
  onDrawFloorPlanRoom,
  onAddFloorPlanOpeningFromTool,
  onHide,
  onSignIn,
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
  onNewRoomTypeChange,
  onNewRoomShapeChange,
  onRoomPresetChange,
  onRoomWidthInputChange,
  onRoomDepthInputChange,
  onApplyRoomSize,
  onActiveRoomHeightMmChange,
  onActiveRoomWallThicknessMmChange,
  onActiveRoomSlabThicknessMmChange,
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

  const panelClass = "space-y-3";
  const panelHeaderClass = dark
    ? "rounded-xl border border-white/15 bg-[#12151dcc] p-3 text-neutral-100 shadow-xl backdrop-blur"
    : "rounded-xl border border-neutral-200 bg-white/95 p-3 text-neutral-900 shadow-lg backdrop-blur";
  const panelSubtitleClass = dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500";
  const selectedButtonClass = dark ? "bg-[#1b2030] text-white" : "bg-neutral-900 text-white";

  return (
    <div
      data-testid="design-controls-panel"
      className={`absolute bottom-3 left-3 right-3 top-auto z-20 max-h-[64vh] w-auto space-y-3 overflow-y-auto pb-[calc(0.75rem+env(safe-area-inset-bottom))] pr-1 md:bottom-auto md:right-auto md:top-20 md:max-h-[calc(100vh-6rem)] md:w-[22rem] md:pb-4 ${
        isDesigner ? "md:left-20" : "md:left-4"
      }`}
    >
      <div
        data-testid="design-controls-panel-handle"
        className="mx-auto h-1.5 w-12 rounded-full bg-neutral-300/80 md:hidden"
        aria-hidden="true"
      />
      <div className={panelHeaderClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className={dark ? "text-lg font-semibold text-white" : "text-lg font-semibold text-neutral-950"}>
              {panelTitle}
            </div>
            <div className={panelSubtitleClass}>{panelSubtitle}</div>
          </div>
          <button
            type="button"
            aria-label="Hide design tools"
            className={
              dark
                ? "shrink-0 rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/10"
                : "shrink-0 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
            }
            onClick={onHide}
          >
            Hide
          </button>
        </div>
      </div>

      {!isAuthed && (
        <div
          className={
            dark
              ? "flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#151820] px-3 py-2"
              : "flex items-center justify-between gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm"
          }
        >
          <div className="min-w-0">
            <div className={dark ? "designer-text-primary text-xs font-semibold" : "text-xs font-semibold text-neutral-900"}>
              Guest mode
            </div>
            <div className={dark ? "designer-text-muted text-[11px]" : "text-[11px] text-neutral-500"}>
              Sign in to save and share.
            </div>
          </div>
          <button
            className={
              dark
                ? "shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-neutral-950"
                : "shrink-0 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-semibold text-white"
            }
            onClick={onSignIn}
          >
            Sign in
          </button>
        </div>
      )}

      {selectionContext && effectivePanelMode !== "plan" && (
        <div
          data-testid="selected-object-context"
          className={
            dark
              ? "rounded-xl border border-white/10 bg-[#151820] px-3 py-2"
              : "rounded-xl border border-neutral-200 bg-white px-3 py-2 shadow-sm"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className={
                  selectionContext.tone === "furnish"
                    ? dark
                      ? "text-[11px] font-semibold uppercase tracking-wide text-blue-200"
                      : "text-[11px] font-semibold uppercase tracking-wide text-blue-700"
                    : dark
                      ? "text-[11px] font-semibold uppercase tracking-wide text-emerald-200"
                      : "text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
                }
              >
                {selectionContext.label}
              </div>
              <div className={dark ? "mt-0.5 truncate text-sm font-semibold text-white" : "mt-0.5 truncate text-sm font-semibold text-neutral-950"}>
                {selectionContext.title}
              </div>
              <div className={dark ? "mt-0.5 text-[11px] text-neutral-400" : "mt-0.5 text-[11px] text-neutral-500"}>
                {selectionContext.detail}
              </div>
            </div>
            <span
              className={
                selectionContext.tone === "furnish"
                  ? dark
                    ? "shrink-0 rounded-full bg-blue-400/15 px-2 py-1 text-[10px] font-semibold text-blue-100"
                    : "shrink-0 rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700"
                  : dark
                    ? "shrink-0 rounded-full bg-emerald-400/15 px-2 py-1 text-[10px] font-semibold text-emerald-100"
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
          <DesignControlsPlanPanel
            dark={dark}
            isClientPreview={isClientPreview}
            isDesigner={isDesigner}
            canEdit={canEdit}
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
            planRoomCount={planRoomCount}
            planItemCount={planItemCount}
            planOpeningCount={planOpeningCount}
            activeRoomName={activeRoomName}
            activeRoomType={activeRoomType}
            activeRoomFloorMaterialId={activeRoomFloorMaterialId}
            activeRoomFloorRotationDeg={activeRoomFloorRotationDeg}
            activeRoomFloorScale={activeRoomFloorScale}
            floorOptions={floorOptions}
            activeFloorLevel={activeFloorLevel}
            activeFloorRoomCount={activeFloorRoomCount}
            activeRoomHeightMm={activeRoomHeightMm}
            activeRoomWallThicknessMm={activeRoomWallThicknessMm}
            activeRoomSlabThicknessMm={activeRoomSlabThicknessMm}
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
            onPlanCompletionHandled={onPlanCompletionHandled}
            onPlanStartModeChange={onPlanStartModeChange}
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
            onApplyFloorMaterialToRoom={onApplyFloorMaterialToRoom}
            onApplyFloorMaterialToAllRooms={onApplyFloorMaterialToAllRooms}
            onRotateActiveFloorMaterial={onRotateActiveFloorMaterial}
            onResetActiveFloorMaterialPattern={onResetActiveFloorMaterialPattern}
            onActiveFloorMaterialScaleChange={onActiveFloorMaterialScaleChange}
            onNewRoomTypeChange={onNewRoomTypeChange}
            onNewRoomShapeChange={onNewRoomShapeChange}
            onRoomPresetChange={onRoomPresetChange}
            onRoomWidthInputChange={onRoomWidthInputChange}
            onRoomDepthInputChange={onRoomDepthInputChange}
            onApplyRoomSize={onApplyRoomSize}
            onActiveRoomHeightMmChange={onActiveRoomHeightMmChange}
            onActiveRoomWallThicknessMmChange={onActiveRoomWallThicknessMmChange}
            onActiveRoomSlabThicknessMmChange={onActiveRoomSlabThicknessMmChange}
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
            activeRoomName={activeRoomName}
            activeRoomId={activeRoomId}
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
            onSelectRoom={onSelectRoom}
            onPlacementAddModeChange={onPlacementAddModeChange}
            onGoShop={onGoShop}
            onSelectedImportedFamilyChange={onSelectedImportedFamilyChange}
            onSelectedImportedProductChange={onSelectedImportedProductChange}
          />
        )}

        {isDesigner && effectivePanelMode !== "ai" && (
          <div className="mt-3 flex gap-2">
            <button
              className={`text-xs px-3 py-2 rounded-lg ${
                showGrid ? selectedButtonClass : dark ? "bg-[#151820] text-neutral-200" : "bg-neutral-100"
              }`}
              onClick={onGridToggle}
            >
              Grid
            </button>
            <button
              className={`text-xs px-3 py-2 rounded-lg ${
                snapEnabled ? selectedButtonClass : dark ? "bg-[#151820] text-neutral-200" : "bg-neutral-100"
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
