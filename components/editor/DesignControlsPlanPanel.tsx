"use client";

import { useState } from "react";
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
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { RoomPlanShape, RoomType } from "@/lib/room-types";
import type { EditorViewMode } from "./EditorViewToggle";
import FloorPlanUploadPanel from "./FloorPlanUploadPanel";
import PlanOpeningInspector from "./PlanOpeningInspector";
import RoomConnectionChecklist from "./RoomConnectionChecklist";

type PlanStartMode = "start" | "draw" | "upload" | "template";

type HouseRoomTemplate = {
  id: HouseRoomTemplateId;
  label: string;
  roomType: RoomType;
  shape: RoomPlanShape;
  width: number;
  depth: number;
};

type DesignControlsPlanPanelProps = {
  dark: boolean;
  isClientPreview: boolean;
  isDesigner: boolean;
  canEdit: boolean;
  aiDesignEnabled?: boolean;
  viewMode: EditorViewMode;
  newRoomType: RoomType;
  newRoomShape: RoomPlanShape;
  activeRoomPresetId: string;
  roomWidthInput: string;
  roomDepthInput: string;
  roomWidth: number;
  roomDepth: number;
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
  onGoFurnish: () => void;
  onGoAiDesign: () => void;
  onGoShop: () => void;
  onAddDesignerRoom: () => void;
  onAddRoomTemplate: (template: HouseRoomTemplate) => void;
  onNewRoomTypeChange: (roomType: RoomType) => void;
  onNewRoomShapeChange: (shape: RoomPlanShape) => void;
  onRoomPresetChange: (presetId: RoomSizePresetId) => void;
  onRoomWidthInputChange: (value: string) => void;
  onRoomDepthInputChange: (value: string) => void;
  onApplyRoomSize: () => void;
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

export default function DesignControlsPlanPanel({
  dark,
  isClientPreview,
  isDesigner,
  canEdit,
  aiDesignEnabled = false,
  viewMode,
  newRoomType,
  newRoomShape,
  activeRoomPresetId,
  roomWidthInput,
  roomDepthInput,
  roomWidth,
  roomDepth,
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
  onGoFurnish,
  onGoAiDesign,
  onGoShop,
  onAddDesignerRoom,
  onAddRoomTemplate,
  onNewRoomTypeChange,
  onNewRoomShapeChange,
  onRoomPresetChange,
  onRoomWidthInputChange,
  onRoomDepthInputChange,
  onApplyRoomSize,
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
}: DesignControlsPlanPanelProps) {
  const [planStartMode, setPlanStartMode] = useState<PlanStartMode>("start");

  const titleClass = dark
    ? "designer-text-primary text-sm font-semibold"
    : "text-sm font-semibold text-neutral-800";
  const planStartButtonClass = (mode: Exclude<PlanStartMode, "start">) => {
    const isActive = planStartMode === mode;
    if (dark) {
      return [
        "rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        isActive
          ? "border-blue-400/45 bg-blue-500/20 text-blue-100"
          : "border-white/15 bg-[#1b2030] text-white hover:bg-white/10",
      ].join(" ");
    }
    return [
      "rounded-lg border px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
      isActive
        ? "border-neutral-900 bg-neutral-900 text-white"
        : "border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-100",
    ].join(" ");
  };
  const showPlanDetails =
    planStartMode !== "start" ||
    Boolean(floorPlanUnderlay) ||
    floorPlanTraceRoomMode ||
    floorPlanTraceRoomPointCount > 0 ||
    floorPlanTraceOpeningMode ||
    floorPlanTraceOpeningPointCount > 0 ||
    roomConnectionChecklistItems.length > 0 ||
    Boolean(visiblePlanOpening) ||
    isDesigner;
  const showTemplatePicker = planStartMode === "template" || isDesigner;
  const hasActivePlanTrace =
    floorPlanTraceRoomMode ||
    floorPlanTraceRoomPointCount > 0 ||
    floorPlanTraceOpeningMode ||
    floorPlanTraceOpeningPointCount > 0;
  const showFloorPlanPanel =
    showPlanDetails &&
    (isDesigner ||
      planStartMode === "draw" ||
      planStartMode === "upload" ||
      Boolean(floorPlanUnderlay) ||
      hasActivePlanTrace ||
      Boolean(visiblePlanOpening));
  const showDrawTools =
    viewMode === "2d" &&
    (planStartMode === "draw" ||
      Boolean(floorPlanUnderlay) ||
      floorPlanTraceRoomMode ||
      floorPlanTraceRoomPointCount > 0);
  const hasConnectionBlockers = roomConnectionChecklistItems.some(
    (item) => item.status === "needs_doorway"
  );
  const hasRooms = planRoomCount > 0;
  const hasStartedFurniture = planItemCount > 0;
  const hasOpenings = planOpeningCount > 0;
  const progressCardClass = dark
    ? "mt-3 rounded-xl border border-white/10 bg-[#151820] p-3"
    : "mt-3 rounded-xl border border-neutral-200 bg-white p-3";
  const progressRowClass = dark
    ? "rounded-lg border border-white/10 bg-white/5 px-3 py-2"
    : "rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2";
  const progressLabelClass = dark
    ? "text-xs font-semibold text-neutral-100"
    : "text-xs font-semibold text-neutral-900";
  const progressMetaClass = dark
    ? "mt-0.5 text-[11px] text-neutral-400"
    : "mt-0.5 text-[11px] text-neutral-500";
  const progressReadyClass = dark
    ? "rounded-full bg-emerald-400/15 px-2 py-1 text-[11px] font-semibold text-emerald-200"
    : "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700";
  const progressTodoClass = dark
    ? "rounded-full bg-amber-400/15 px-2 py-1 text-[11px] font-semibold text-amber-200"
    : "rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700";
  const progressActionClass = dark
    ? "rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:opacity-50"
    : "rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-neutral-700 disabled:opacity-50";
  const progressSecondaryActionClass = dark
    ? "rounded-lg border border-white/15 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-100 disabled:opacity-50"
    : "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-800 hover:bg-neutral-100 disabled:opacity-50";

  return (
    <div>
      <div
        className={
          dark
            ? "mb-3 rounded-xl border border-white/10 bg-[#151820] p-3"
            : "mb-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className={titleClass}>Start your floor plan</div>
            <div className={dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
              Choose one path, then the editor shows only the tools you need.
            </div>
          </div>
          {showPlanDetails && (
            <button
              type="button"
              className={
                dark
                  ? "rounded-lg border border-white/15 px-2.5 py-1.5 text-xs font-semibold text-neutral-200"
                  : "rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-neutral-700"
              }
              onClick={() => setPlanStartMode("start")}
            >
              Change
            </button>
          )}
        </div>
        <div className="mt-3 grid gap-2">
          <button
            type="button"
            data-testid="plan-start-draw"
            className={planStartButtonClass("draw")}
            disabled={!canEdit || viewMode !== "2d"}
            onClick={() => {
              setPlanStartMode("draw");
              onFloorPlanTraceRoomModeChange(true);
            }}
          >
            Draw from scratch
          </button>
          <button
            type="button"
            data-testid="plan-start-upload"
            className={planStartButtonClass("upload")}
            disabled={!canEdit}
            onClick={() => setPlanStartMode("upload")}
          >
            Upload floor plan
          </button>
          <button
            type="button"
            data-testid="plan-start-template"
            className={planStartButtonClass("template")}
            disabled={!canEdit}
            onClick={() => setPlanStartMode("template")}
          >
            Start from template
          </button>
        </div>
        {planStartMode === "upload" && !floorPlanUnderlay && (
          <div
            className={
              dark
                ? "mt-3 rounded-lg bg-white/5 p-3 text-xs text-neutral-300"
                : "mt-3 rounded-lg bg-white p-3 text-xs text-neutral-600"
            }
          >
            Upload a drawing first, then trace rooms, doors, and windows over it.
          </div>
        )}
        {planStartMode === "template" && !isDesigner && (
          <div
            className={
              dark
                ? "mt-3 rounded-lg bg-white/5 p-3 text-xs text-neutral-300"
                : "mt-3 rounded-lg bg-white p-3 text-xs text-neutral-600"
            }
          >
            Pick a starter room below. You can resize it, add connected rooms, then switch to 3D.
          </div>
        )}
      </div>
      {showPlanDetails && (
        <div data-testid="consumer-plan-next-steps" className={progressCardClass}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={titleClass}>Next steps</div>
              <div className={progressMetaClass}>
                Finish the plan, then add furniture and review the shopping list.
              </div>
            </div>
            {hasStartedFurniture ? (
              <button type="button" className={progressSecondaryActionClass} onClick={onGoShop}>
                Shop
              </button>
            ) : (
              <button
                type="button"
                className={progressSecondaryActionClass}
                onClick={onGoFurnish}
                disabled={!hasRooms}
              >
                Furnish
              </button>
            )}
          </div>
          <div className="mt-3 space-y-2">
            <div className={progressRowClass}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={progressLabelClass}>Floor plan</div>
                  <div className={progressMetaClass}>
                    {hasRooms
                      ? `${planRoomCount} room${planRoomCount === 1 ? "" : "s"} ready`
                      : "Draw, upload, or choose a template."}
                  </div>
                </div>
                <span className={hasRooms ? progressReadyClass : progressTodoClass}>
                  {hasRooms ? "Ready" : "Start"}
                </span>
              </div>
            </div>

            <div className={progressRowClass}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={progressLabelClass}>Doors and windows</div>
                  <div className={progressMetaClass}>
                    {hasConnectionBlockers
                      ? "Add doorway links from Connections."
                      : hasOpenings
                        ? `${planOpeningCount} opening${planOpeningCount === 1 ? "" : "s"} placed`
                        : "Optional before furnishing."}
                  </div>
                </div>
                <span className={hasConnectionBlockers ? progressTodoClass : progressReadyClass}>
                  {hasConnectionBlockers ? "Check" : "OK"}
                </span>
              </div>
            </div>

            <div className={progressRowClass}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className={progressLabelClass}>Furniture layout</div>
                  <div className={progressMetaClass}>
                    {hasStartedFurniture
                      ? `${planItemCount} item${planItemCount === 1 ? "" : "s"} placed`
                      : aiDesignEnabled
                        ? "Add real catalog items or ask AI for a starter layout."
                        : "Add real catalog items to start furnishing this room."}
                  </div>
                </div>
                {hasStartedFurniture ? (
                  <span className={progressReadyClass}>Started</span>
                ) : (
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className={progressActionClass}
                      onClick={onGoFurnish}
                      disabled={!hasRooms}
                    >
                      Add
                    </button>
                        {aiDesignEnabled && (
                          <button
                            type="button"
                            className={progressSecondaryActionClass}
                            onClick={onGoAiDesign}
                            disabled={!hasRooms}
                          >
                            AI
                          </button>
                        )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {floorPlanTraceOpeningMode && (
        <div
          data-testid="floor-plan-opening-active-card"
          className={
            dark
              ? "mt-3 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-3"
              : "mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3"
          }
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className={dark ? "text-sm font-semibold text-emerald-100" : "text-sm font-semibold text-emerald-900"}>
                {floorPlanTraceOpeningKind === "door" ? "Door tool active" : "Window tool active"}
              </div>
              <div className={dark ? "mt-1 text-xs text-emerald-100/75" : "mt-1 text-xs text-emerald-800"}>
                {floorPlanUnderlay
                  ? "Pick two points along the same wall. Green means it fits."
                  : "Move near a wall, then click when the preview turns green."}
              </div>
              <div className={dark ? "mt-1 text-[11px] font-semibold text-emerald-100/70" : "mt-1 text-[11px] font-semibold text-emerald-700"}>
                Esc {floorPlanTraceOpeningPointCount > 0 ? "clears points" : "exits tool"}
              </div>
            </div>
            <button
              type="button"
              className={progressSecondaryActionClass}
              onClick={() => onFloorPlanTraceOpeningModeChange(false)}
            >
              Done
            </button>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <select
              data-testid="floor-plan-opening-active-kind"
              value={floorPlanTraceOpeningKind}
              disabled={!canEdit}
              onChange={(event) =>
                onFloorPlanTraceOpeningKindChange(event.target.value as RoomOpening2D["kind"])
              }
              className={
                dark
                  ? "min-w-28 rounded-lg border border-white/15 bg-[#10131a] px-2 py-2 text-sm text-neutral-100"
                  : "min-w-28 rounded-lg border border-emerald-200 bg-white px-2 py-2 text-sm text-neutral-900"
              }
            >
              <option value="door">Door</option>
              <option value="window">Window</option>
            </select>
            <button
              type="button"
              className={progressSecondaryActionClass}
              disabled={!canEdit || floorPlanTraceOpeningPointCount === 0}
              onClick={onResetFloorPlanTraceOpeningPoints}
            >
              Reset points
            </button>
          </div>
        </div>
      )}
      {showFloorPlanPanel && (
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
          showDrawRoomTools={showDrawTools}
          showDesignerDrawControls={isDesigner}
          traceRoomMode={floorPlanTraceRoomMode}
          traceRoomDrawMode={floorPlanDrawRoomMode}
          traceRoomAngleLockMode={floorPlanDrawAngleLockMode}
          exactWallLengthInput={floorPlanExactWallLengthInput}
          canApplyExactWallLength={
            floorPlanDrawRoomMode === "straight_wall" && floorPlanTraceRoomPointCount > 0
          }
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
          onTraceRoomAngleLockModeChange={onFloorPlanDrawAngleLockModeChange}
          onExactWallLengthInputChange={onFloorPlanExactWallLengthInputChange}
          onApplyExactWallLength={onApplyFloorPlanExactWallLength}
          onTraceRoomTypeChange={onFloorPlanTraceRoomTypeChange}
          onUndoTraceRoomPoint={onUndoFloorPlanTraceRoomPoint}
          onResetTraceRoomPoints={onResetFloorPlanTraceRoomPoints}
          onTraceOpeningModeChange={onFloorPlanTraceOpeningModeChange}
          onTraceOpeningKindChange={onFloorPlanTraceOpeningKindChange}
          onResetTraceOpeningPoints={onResetFloorPlanTraceOpeningPoints}
          onClear={onClearFloorPlan}
        />
      )}
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
      {!isDesigner && showTemplatePicker && (
        <div
          className={
            dark
              ? "mt-3 rounded-xl border border-white/10 bg-[#151820] p-3"
              : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"
          }
        >
          <div className={titleClass}>Add rooms</div>
          <div className={dark ? "mt-1 text-xs text-neutral-400" : "mt-1 text-xs text-neutral-500"}>
            Start with a common room, then adjust dimensions on the plan.
          </div>
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
                    ? "rounded-lg bg-[#1b2030] px-3 py-2 text-left text-sm font-medium text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                    : "rounded-lg bg-white px-3 py-2 text-left text-sm font-medium text-neutral-800 shadow-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
                }
              >
                <span className="block">{template.label}</span>
                <span className={dark ? "mt-0.5 block text-xs text-neutral-400" : "mt-0.5 block text-xs text-neutral-500"}>
                  {template.width} x {template.depth}m
                </span>
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
  );
}
