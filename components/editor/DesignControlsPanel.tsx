"use client";

import CatalogPanel from "@/components/catalog/CatalogPanel";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type {
  HouseRoomConnectionChecklistItem,
  HouseRoomDoorwaySuggestion,
  HouseRoomTemplateId,
  RoomSizePresetId,
} from "@/lib/design-page-house-plan";
import {
  HOUSE_ROOM_SHAPES,
  HOUSE_ROOM_TEMPLATES,
  HOUSE_ROOM_TYPES,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
} from "@/lib/design-page-house-plan";
import { STYLES, type Style } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanDrawRoomMode, FloorPlanUnderlay } from "@/lib/floor-plan-types";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import type { RoomPlanShape, RoomType } from "@/lib/room-types";
import type { EditorViewMode } from "./EditorViewToggle";
import FloorPlanUploadPanel from "./FloorPlanUploadPanel";
import PlanOpeningInspector from "./PlanOpeningInspector";
import RoomConnectionChecklist from "./RoomConnectionChecklist";

type Budget = "$" | "$$" | "$$$";

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
  onHide: () => void;
  onSignIn: () => void;
  onStyleChange: (style: Style) => void;
  onBudgetChange: (budget: Budget) => void;
  onRunAiLayout: () => void;
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
  onFloorPlanTraceRoomTypeChange: (roomType: RoomType) => void;
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
  onHide,
  onSignIn,
  onStyleChange,
  onBudgetChange,
  onRunAiLayout,
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
  onFloorPlanTraceRoomTypeChange,
  onResetFloorPlanTraceRoomPoints,
  onFloorPlanTraceOpeningModeChange,
  onFloorPlanTraceOpeningKindChange,
  onResetFloorPlanTraceOpeningPoints,
  onClearFloorPlan,
  onAddSuggestedDoorway,
  onUpdateOpeningMetrics,
}: DesignControlsPanelProps) {
  if (isClientPreview) return null;

  const panelClass = dark ? "designer-panel rounded-xl p-4" : "rounded-xl bg-white p-4 shadow";
  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const selectedButtonClass = dark ? "bg-[#1b2030] text-white" : "bg-neutral-900 text-white";
  const idleButtonClass = dark ? "bg-[#151820] text-neutral-200" : "bg-neutral-100 text-neutral-900";
  const secondaryButtonClass = dark
    ? "mt-2 w-full rounded-lg border border-[#2b3245] bg-[#151820] px-4 py-2.5 text-sm font-medium text-white"
    : "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900";

  return (
    <div className="absolute left-20 top-20 z-20 w-[22rem] max-h-[calc(100vh-6rem)] overflow-y-auto pr-1 pb-4 space-y-4">
      <div
        className={
          dark
            ? "sticky top-0 z-30 flex items-center justify-between rounded-lg border border-white/15 bg-[#12151dcc] px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-200 backdrop-blur"
            : "sticky top-0 z-30 flex items-center justify-between rounded-lg border border-neutral-200 bg-white/95 px-3 py-2 text-xs font-semibold uppercase tracking-[0.08em] text-neutral-700 backdrop-blur"
        }
      >
        <span>Design Tools</span>
        <button
          type="button"
          aria-label="Hide design tools"
          className={
            dark
              ? "rounded-md px-2 py-1 text-xs font-semibold normal-case tracking-normal text-neutral-300 hover:bg-white/10"
              : "rounded-md px-2 py-1 text-xs font-semibold normal-case tracking-normal text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          }
          onClick={onHide}
        >
          Hide
        </button>
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
        <div>
          <FloorPlanUploadPanel
            underlay={floorPlanUnderlay}
            canCalibrate={Boolean(floorPlanUnderlay?.mimeType.startsWith("image/"))}
            calibrationMode={floorPlanCalibrationMode}
            calibrationPointCount={floorPlanCalibrationPointCount}
            calibrationDistanceMeters={floorPlanCalibrationDistanceInput}
            calibrationSummary={floorPlanCalibrationSummary}
            canTraceRooms={Boolean(
              !floorPlanUnderlay ||
                (floorPlanUnderlay.mimeType.startsWith("image/") && floorPlanUnderlay.calibration)
            )}
            showDrawRoomTools={viewMode === "2d"}
            traceRoomMode={floorPlanTraceRoomMode}
            traceRoomDrawMode={floorPlanDrawRoomMode}
            traceRoomPointCount={floorPlanTraceRoomPointCount}
            traceRoomType={floorPlanTraceRoomType}
            traceRoomTypeOptions={HOUSE_ROOM_TYPES}
            canTraceOpenings={canTraceOpenings}
            traceOpeningMode={floorPlanTraceOpeningMode}
            traceOpeningPointCount={floorPlanTraceOpeningPointCount}
            traceOpeningKind={floorPlanTraceOpeningKind}
            canSelectPdfPage={Boolean(
              floorPlanUnderlay?.sourceMimeType === "application/pdf" &&
                floorPlanPdfSourceReady &&
                (floorPlanUnderlay.pageCount ?? 0) > 1
            )}
            pdfPageChanging={floorPlanPdfRenderingPage !== null}
            disabled={isClientPreview}
            dark={dark}
            onUpload={onFloorPlanUpload}
            onPdfPageChange={onFloorPlanPdfPageChange}
            onOpacityChange={onFloorPlanOpacityChange}
            onLockChange={onFloorPlanLockChange}
            onCalibrationModeChange={onFloorPlanCalibrationModeChange}
            onCalibrationDistanceChange={onFloorPlanCalibrationDistanceChange}
            onApplyCalibration={onApplyFloorPlanCalibration}
            onResetCalibrationPoints={onResetFloorPlanCalibrationPoints}
            onTraceRoomModeChange={onFloorPlanTraceRoomModeChange}
            onTraceRoomDrawModeChange={onFloorPlanTraceRoomDrawModeChange}
            onTraceRoomTypeChange={onFloorPlanTraceRoomTypeChange}
            onResetTraceRoomPoints={onResetFloorPlanTraceRoomPoints}
            onTraceOpeningModeChange={onFloorPlanTraceOpeningModeChange}
            onTraceOpeningKindChange={onFloorPlanTraceOpeningKindChange}
            onResetTraceOpeningPoints={onResetFloorPlanTraceOpeningPoints}
            onClear={onClearFloorPlan}
          />
          {roomConnectionChecklistItems.length > 0 && (
            <div className="mt-3">
              <RoomConnectionChecklist
                items={roomConnectionChecklistItems}
                disabled={isClientPreview}
                dark={dark}
                onAddDoorway={onAddSuggestedDoorway}
              />
            </div>
          )}
          {viewMode === "2d" && visiblePlanOpening && (
            <div className="mt-3">
              <PlanOpeningInspector
                opening={visiblePlanOpening}
                roomName={visiblePlanOpeningRoomName}
                wallSpanMeters={visiblePlanOpeningWallSpanMeters}
                dark={dark}
                onChange={onUpdateOpeningMetrics}
              />
            </div>
          )}
          {!isDesigner && (
            <div
              className={
                dark
                  ? "mt-3 rounded-xl border border-white/10 bg-[#151820] p-3"
                  : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
              }
            >
              <div className={titleClass}>Add rooms</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {HOUSE_ROOM_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    data-testid={`add-room-template-${template.id}`}
                    onClick={() => onAddRoomTemplate(template)}
                    disabled={!canEdit}
                    className={
                      dark
                        ? "rounded-lg bg-[#1b2030] px-3 py-2 text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                        : "rounded-lg bg-white px-3 py-2 text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    }
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {isDesigner && (
            <div
              className={
                dark
                  ? "mt-3 rounded-xl border border-white/10 bg-[#151820] p-3"
                  : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
              }
            >
              <div className={titleClass}>Room setup</div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
                  Type
                  <select
                    value={newRoomType}
                    onChange={(event) => onNewRoomTypeChange(event.target.value as RoomType)}
                    className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
                    disabled={!canEdit}
                    title="Choose room type for next room"
                  >
                    {HOUSE_ROOM_TYPES.map((option) => (
                      <option key={option.type} value={option.type}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
                  Shape
                  <select
                    value={newRoomShape}
                    onChange={(event) => onNewRoomShapeChange(event.target.value as RoomPlanShape)}
                    className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
                    disabled={!canEdit}
                    title="Choose shape for next room"
                  >
                    {HOUSE_ROOM_SHAPES.map((option) => (
                      <option key={option.shape} value={option.shape}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="mt-2 flex flex-col gap-1 text-xs font-medium text-neutral-600">
                Size preset
                <select
                  value={activeRoomPresetId}
                  onChange={(event) => onRoomPresetChange(event.target.value as RoomSizePresetId)}
                  className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
                  disabled={!canEdit}
                  title="Select a room-size preset"
                >
                  {ROOM_SIZE_PRESETS.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.label}
                    </option>
                  ))}
                  <option value="custom">Custom</option>
                </select>
              </label>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
                  Width
                  <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={ROOM_DIMENSION_DEFAULTS.min}
                      max={ROOM_DIMENSION_DEFAULTS.max}
                      step={0.1}
                      value={roomWidthInput}
                      onChange={(event) => onRoomWidthInputChange(event.target.value)}
                      onBlur={() => {
                        if (roomWidthInput === "") {
                          onRoomWidthInputChange(roomWidth.toFixed(2));
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-xs text-neutral-900 outline-none"
                      disabled={!canEdit}
                      placeholder="Width"
                    />
                    <span className="text-xs text-neutral-500">m</span>
                  </div>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-neutral-600">
                  Depth
                  <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2 py-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={ROOM_DIMENSION_DEFAULTS.min}
                      max={ROOM_DIMENSION_DEFAULTS.max}
                      step={0.1}
                      value={roomDepthInput}
                      onChange={(event) => onRoomDepthInputChange(event.target.value)}
                      onBlur={() => {
                        if (roomDepthInput === "") {
                          onRoomDepthInputChange(roomDepth.toFixed(2));
                        }
                      }}
                      className="min-w-0 flex-1 bg-transparent text-xs text-neutral-900 outline-none"
                      disabled={!canEdit}
                      placeholder="Depth"
                    />
                    <span className="text-xs text-neutral-500">m</span>
                  </div>
                </label>
              </div>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={onApplyRoomSize}
                  disabled={!canEdit}
                  title="Apply room dimensions"
                >
                  Apply size
                </button>
                <button
                  type="button"
                  className="flex-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={onAddDesignerRoom}
                  disabled={!canEdit}
                >
                  Add room
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          className={
            dark
              ? `${viewMode === "2d" ? "mt-4 " : ""}designer-text-primary text-sm font-semibold`
              : `${viewMode === "2d" ? "mt-4 " : ""}text-sm font-semibold text-neutral-800`
          }
        >
          Style
        </div>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {STYLES.map((candidate) => (
            <button
              key={candidate}
              className={`rounded-lg px-2 py-2 text-xs ${
                style === candidate ? selectedButtonClass : idleButtonClass
              }`}
              onClick={() => onStyleChange(candidate)}
            >
              {candidate}
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className={titleClass}>Budget</div>
          <div className="flex gap-2">
            {(["$", "$$", "$$$"] as const).map((candidate) => (
              <button
                key={candidate}
                className={`rounded-lg px-3 py-1 text-sm ${
                  budget === candidate ? selectedButtonClass : idleButtonClass
                }`}
                onClick={() => onBudgetChange(candidate)}
              >
                {candidate}
              </button>
            ))}
          </div>
        </div>

        <button
          className={
            dark
              ? "mt-4 w-full rounded-lg bg-[#1b2030] px-4 py-3 text-sm font-medium text-white"
              : "mt-4 w-full rounded-lg bg-neutral-900 px-4 py-3 text-sm font-medium text-white"
          }
          onClick={onRunAiLayout}
        >
          Design My Room
        </button>

        <button
          className={secondaryButtonClass}
          data-testid="add-imported-btn"
          onClick={onAddImportedToRoom}
          disabled={!selectedImportedProductId || !canEdit}
        >
          + Add Imported Furniture
        </button>

        <div className="mt-4">
          <div className="mb-4 rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 text-xs font-semibold text-neutral-600 uppercase tracking-wide">
              Imported Furniture
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <select
                data-testid="imported-family-select"
                className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
                value={selectedImportedFamilyKey}
                onChange={(event) => {
                  const nextFamilyKey = event.target.value;
                  onSelectedImportedFamilyChange(nextFamilyKey);
                  const firstInFamily = importedModelOptions.find(
                    (item) => item.familyKey === nextFamilyKey
                  );
                  if (firstInFamily) {
                    onSelectedImportedProductChange(firstInFamily.id);
                  }
                }}
              >
                {importedFamilyOptions.map((item) => (
                  <option key={item.familyKey} value={item.familyKey}>
                    {item.familyLabel}
                  </option>
                ))}
              </select>
              <select
                data-testid="imported-product-select"
                className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-900"
                value={selectedImportedProductId}
                onChange={(event) => onSelectedImportedProductChange(event.target.value)}
              >
                {visibleImportedModelOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.pickerLabel}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-3 flex">
              <button
                className="rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={onAddImportedToRoom}
                disabled={!selectedImportedProductId || !canEdit}
              >
                Add Imported
              </button>
            </div>
          </div>
          <CatalogPanel
            items={catalogItems}
            canEdit={canEdit}
            onAddToRoom={onAddCatalogItemToRoom}
          />
        </div>

        {isDesigner && (
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
