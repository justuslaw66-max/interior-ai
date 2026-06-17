"use client";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type {
  HouseRoomConnectionChecklistItem,
  HouseRoomDoorwaySuggestion,
  HousePlanTemplate,
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
import type { CatalogTopCategory } from "@/lib/catalog/view-builders";
import type { RoomPlanShape, RoomType } from "@/lib/room-types";
import type { EditorViewMode } from "./EditorViewToggle";
import DesignControlsAiPanel from "./DesignControlsAiPanel";
import DesignControlsFurnishPanel from "./DesignControlsFurnishPanel";
import DesignControlsPlanPanel from "./DesignControlsPlanPanel";

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
  activeRoomTypeLabel: string;
  activeRoomShoppableCount: number;
  activeRoomNeedsReviewCount: number;
  activeRoomCategoryCounts: Partial<Record<CatalogTopCategory, number>>;
  aiLayoutProposal: AiLayoutProposal | null;
  onHide: () => void;
  onSignIn: () => void;
  onGoFurnish: () => void;
  onGoAiDesign: () => void;
  onGoShop: () => void;
  onStyleChange: (style: Style) => void;
  onBudgetChange: (budget: Budget) => void;
  onRunAiLayout: () => void;
  onApplyAiLayoutProposal: () => void;
  onTryAiLayoutAgain: () => void;
  onClearAiLayoutProposal: () => void;
  onApplyPlanTemplate: (template: HousePlanTemplate) => void;
  onAddDesignerRoom: () => void;
  onAddRoomTemplate: (template: HouseRoomTemplate) => void;
  onNewRoomTypeChange: (roomType: RoomType) => void;
  onNewRoomShapeChange: (shape: RoomPlanShape) => void;
  onRoomPresetChange: (presetId: RoomSizePresetId) => void;
  onRoomWidthInputChange: (value: string) => void;
  onRoomDepthInputChange: (value: string) => void;
  onApplyRoomSize: () => void;
  onAddImportedToRoom: () => void;
  onAddCatalogItemToRoom: (productId: string, variantId?: string) => void;
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
  activeRoomTypeLabel,
  activeRoomShoppableCount,
  activeRoomNeedsReviewCount,
  activeRoomCategoryCounts,
  aiLayoutProposal,
  onHide,
  onSignIn,
  onGoFurnish,
  onGoAiDesign,
  onGoShop,
  onStyleChange,
  onBudgetChange,
  onRunAiLayout,
  onApplyAiLayoutProposal,
  onTryAiLayoutAgain,
  onClearAiLayoutProposal,
  onApplyPlanTemplate,
  onAddDesignerRoom,
  onAddRoomTemplate,
  onNewRoomTypeChange,
  onNewRoomShapeChange,
  onRoomPresetChange,
  onRoomWidthInputChange,
  onRoomDepthInputChange,
  onApplyRoomSize,
  onAddImportedToRoom,
  onAddCatalogItemToRoom,
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
      ? "Create the floor plan first, then add rooms, doors, and windows."
      : effectivePanelMode === "furnish"
        ? "Add real purchasable furniture and arrange it in the active room."
        : "Generate a starter layout, review it, then apply when it looks right.";
  if (isClientPreview) return null;

  const panelClass = "space-y-3";
  const panelHeaderClass = dark
    ? "rounded-2xl border border-white/15 bg-[#12151dcc] p-4 text-neutral-100 shadow-xl backdrop-blur"
    : "rounded-2xl border border-neutral-200 bg-white/95 p-4 text-neutral-900 shadow-lg backdrop-blur";
  const panelSubtitleClass = dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500";
  const selectedButtonClass = dark ? "bg-[#1b2030] text-white" : "bg-neutral-900 text-white";

  return (
    <div
      className={`absolute ${isDesigner ? "left-20" : "left-4"} top-20 z-20 w-[22rem] max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 pb-4 space-y-4`}
    >
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
        <div className={dark ? "designer-panel rounded-xl p-3" : "rounded-xl bg-white p-3 shadow"}>
          <div className={dark ? "designer-text-primary text-sm font-semibold" : "text-sm font-semibold"}>
            You are designing as a guest
          </div>
          <div className={dark ? "designer-text-muted mt-1 text-xs" : "mt-1 text-xs text-neutral-500"}>
            Sign in to save to cloud and share.
          </div>
          <button
            className={
              dark
                ? "mt-2 rounded-lg bg-[#1b2030] px-3 py-2 text-sm text-white"
                : "mt-2 rounded-lg bg-neutral-900 px-3 py-2 text-sm text-white"
            }
            onClick={onSignIn}
          >
            Sign in to save
          </button>
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
            onGoFurnish={onGoFurnish}
            onGoAiDesign={onGoAiDesign}
            onGoShop={onGoShop}
            onApplyPlanTemplate={onApplyPlanTemplate}
            onAddDesignerRoom={onAddDesignerRoom}
            onAddRoomTemplate={onAddRoomTemplate}
            onNewRoomTypeChange={onNewRoomTypeChange}
            onNewRoomShapeChange={onNewRoomShapeChange}
            onRoomPresetChange={onRoomPresetChange}
            onRoomWidthInputChange={onRoomWidthInputChange}
            onRoomDepthInputChange={onRoomDepthInputChange}
            onApplyRoomSize={onApplyRoomSize}
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
            activeRoomTypeLabel={activeRoomTypeLabel}
            activeRoomItemCount={planItemCount}
            activeRoomShoppableCount={activeRoomShoppableCount}
            activeRoomNeedsReviewCount={activeRoomNeedsReviewCount}
            activeRoomCategoryCounts={activeRoomCategoryCounts}
            roomCount={planRoomCount}
            catalogItems={catalogItems}
            selectedImportedFamilyKey={selectedImportedFamilyKey}
            selectedImportedProductId={selectedImportedProductId}
            importedFamilyOptions={importedFamilyOptions}
            importedModelOptions={importedModelOptions}
            visibleImportedModelOptions={visibleImportedModelOptions}
            onAddImportedToRoom={onAddImportedToRoom}
            onAddCatalogItemToRoom={onAddCatalogItemToRoom}
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
