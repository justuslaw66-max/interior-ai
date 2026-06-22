"use client";

import { useRef } from "react";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { RoomType } from "@/lib/room-types";

type TraceRoomTypeOption = {
  type: RoomType;
  label: string;
};

type FloorPlanUploadPanelProps = {
  underlay: FloorPlanUnderlay | null;
  canCalibrate?: boolean;
  calibrationMode?: boolean;
  calibrationPointCount?: number;
  calibrationDistanceMeters?: string;
  calibrationSummary?: string | null;
  canTraceRooms?: boolean;
  showDrawRoomTools?: boolean;
  showDesignerDrawControls?: boolean;
  traceRoomMode?: boolean;
  traceRoomDrawMode?: FloorPlanDrawRoomMode;
  traceRoomAngleLockMode?: FloorPlanDrawAngleLockMode;
  exactWallLengthInput?: string;
  canApplyExactWallLength?: boolean;
  traceRoomPointCount?: number;
  traceRoomType?: RoomType;
  traceRoomTypeOptions?: TraceRoomTypeOption[];
  canTraceOpenings?: boolean;
  traceOpeningMode?: boolean;
  traceOpeningPointCount?: number;
  traceOpeningKind?: RoomOpening2D["kind"];
  canSelectPdfPage?: boolean;
  pdfPageChanging?: boolean;
  disabled?: boolean;
  dark?: boolean;
  onUpload: (file: File) => void;
  onPdfPageChange?: (pageNumber: number) => void;
  onOpacityChange: (opacity: number) => void;
  onLockChange: (locked: boolean) => void;
  onCalibrationModeChange?: (enabled: boolean) => void;
  onCalibrationDistanceChange?: (value: string) => void;
  onApplyCalibration?: () => void;
  onResetCalibrationPoints?: () => void;
  onTraceRoomModeChange?: (enabled: boolean) => void;
  onTraceRoomDrawModeChange?: (mode: FloorPlanDrawRoomMode) => void;
  onTraceRoomAngleLockModeChange?: (mode: FloorPlanDrawAngleLockMode) => void;
  onExactWallLengthInputChange?: (value: string) => void;
  onApplyExactWallLength?: () => void;
  onTraceRoomTypeChange?: (roomType: RoomType) => void;
  onUndoTraceRoomPoint?: () => void;
  onResetTraceRoomPoints?: () => void;
  onTraceOpeningModeChange?: (enabled: boolean) => void;
  onTraceOpeningKindChange?: (kind: RoomOpening2D["kind"]) => void;
  onResetTraceOpeningPoints?: () => void;
  onClear: () => void;
};

const ACCEPTED_PLAN_FILE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
].join(",");

const DRAW_ROOM_TOOLS: Array<{
  id: FloorPlanDrawRoomMode;
  label: string;
  shortcut: string;
}> = [
  { id: "straight_wall", label: "Straight wall", shortcut: "B" },
  { id: "rectangle_wall", label: "Rectangle wall", shortcut: "F" },
  { id: "arc_wall", label: "Arc wall", shortcut: "H" },
];

const ANGLE_LOCK_TOOLS: Array<{
  id: FloorPlanDrawAngleLockMode;
  label: string;
}> = [
  { id: "ortho", label: "Ortho" },
  { id: "forty_five", label: "45°" },
  { id: "free", label: "Free" },
];

export default function FloorPlanUploadPanel({
  underlay,
  canCalibrate = false,
  calibrationMode = false,
  calibrationPointCount = 0,
  calibrationDistanceMeters = "",
  calibrationSummary = null,
  canTraceRooms = false,
  showDrawRoomTools = true,
  showDesignerDrawControls = false,
  traceRoomMode = false,
  traceRoomDrawMode = "straight_wall",
  traceRoomAngleLockMode = "ortho",
  exactWallLengthInput = "",
  canApplyExactWallLength = false,
  traceRoomPointCount = 0,
  traceRoomType = "living",
  traceRoomTypeOptions = [],
  canTraceOpenings = false,
  traceOpeningMode = false,
  traceOpeningPointCount = 0,
  traceOpeningKind = "door",
  canSelectPdfPage = false,
  pdfPageChanging = false,
  disabled = false,
  dark = false,
  onUpload,
  onPdfPageChange,
  onOpacityChange,
  onLockChange,
  onCalibrationModeChange,
  onCalibrationDistanceChange,
  onApplyCalibration,
  onResetCalibrationPoints,
  onTraceRoomModeChange,
  onTraceRoomDrawModeChange,
  onTraceRoomAngleLockModeChange,
  onExactWallLengthInputChange,
  onApplyExactWallLength,
  onTraceRoomTypeChange,
  onUndoTraceRoomPoint,
  onResetTraceRoomPoints,
  onTraceOpeningModeChange,
  onTraceOpeningKindChange,
  onResetTraceOpeningPoints,
  onClear,
}: FloorPlanUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cardClass = dark
    ? "rounded-xl border border-white/10 bg-[#151820] p-3"
    : "rounded-xl border border-neutral-200 bg-white p-3";
  const titleClass = dark
    ? "text-sm font-semibold text-neutral-100"
    : "text-sm font-semibold text-neutral-900";
  const subtleClass = dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500";
  const buttonClass = dark
    ? "rounded-lg bg-white px-3 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-50"
    : "rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50";
  const secondaryButtonClass = dark
    ? "rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-neutral-200 disabled:opacity-50"
    : "rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";
  const rangeClass = "h-2 w-full accent-neutral-900";
  const selectClass = dark
    ? "rounded border border-white/15 bg-[#10131a] px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-50"
    : "rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 disabled:opacity-50";
  const drawToolButtonClass = (mode: FloorPlanDrawRoomMode) => {
    const isActive = traceRoomMode && traceRoomDrawMode === mode;
    if (dark) {
      return [
        "flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        isActive
          ? "border-blue-400/45 bg-blue-500/20 text-blue-100"
          : "border-white/10 bg-white/5 text-neutral-200 hover:bg-white/10",
      ].join(" ");
    }
    return [
      "flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border p-3 text-center text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
      isActive
        ? "border-blue-200 bg-blue-50 text-neutral-900 shadow-sm"
        : "border-neutral-100 bg-white text-neutral-700 hover:border-neutral-200 hover:bg-neutral-50",
    ].join(" ");
  };
  const drawToolIconClass = dark ? "border-neutral-400 bg-neutral-500" : "border-neutral-600 bg-neutral-300";
  const traceRoomHint =
    traceRoomDrawMode === "straight_wall"
      ? "Click wall points one by one, then close the loop."
      : traceRoomDrawMode === "rectangle_wall"
        ? "Drag or pick two opposite corners."
        : "Drag or pick two endpoints for a rounded room.";
  const canShowPdfPagePicker =
    underlay?.sourceMimeType === "application/pdf" && (underlay.pageCount ?? 0) > 1;
  const showAngleLockControls =
    showDesignerDrawControls && traceRoomMode && traceRoomDrawMode === "straight_wall";
  const showExactWallLengthControls = traceRoomMode && traceRoomDrawMode === "straight_wall";
  const canUndoTraceRoomPoint =
    traceRoomMode && traceRoomDrawMode === "straight_wall" && traceRoomPointCount > 0;

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className={titleClass}>Floor plan</div>
          {underlay && (
            <div className={`${subtleClass} mt-0.5 truncate`} data-testid="floor-plan-file-name">
              {underlay.name}
            </div>
          )}
        </div>
        <button
          type="button"
          className={buttonClass}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          Upload
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        data-testid="floor-plan-upload-input"
        accept={ACCEPTED_PLAN_FILE_TYPES}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            onUpload(file);
          }
        }}
      />

      <div className="mt-3 space-y-3">
        {!underlay && !showDrawRoomTools && (
          <div
            data-testid="floor-plan-upload-empty-state"
            className={dark ? "rounded-lg bg-white/5 p-3" : "rounded-lg bg-neutral-50 p-3"}
          >
            <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-800"}>
              Upload a floor-plan image or PDF
            </div>
            <div className={`${subtleClass} mt-1`}>
              Use a drawing from your designer, contractor, or property listing, then set scale and draw rooms over it.
            </div>
          </div>
        )}

        {underlay && (
          <>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className={subtleClass}>Plan visibility</span>
              <span className={subtleClass}>{Math.round(underlay.opacity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.15}
              max={0.85}
              step={0.05}
              value={underlay.opacity}
              disabled={disabled}
              className={rangeClass}
              onChange={(event) => onOpacityChange(Number(event.target.value))}
            />
          </div>
          <div className={dark ? "rounded-lg bg-white/5 p-3" : "rounded-lg bg-neutral-50 p-3"}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-800"}>
                  Scale
                </div>
                <div className={subtleClass}>
                  {calibrationSummary ?? "Click two points, then enter the real distance."}
                </div>
              </div>
              <button
                type="button"
                data-testid="floor-plan-calibration-toggle"
                className={secondaryButtonClass}
                disabled={disabled || !canCalibrate}
                onClick={() => onCalibrationModeChange?.(!calibrationMode)}
              >
                {calibrationMode ? "Done" : "Set scale"}
              </button>
            </div>

            {calibrationMode && (
              <div className="mt-3 space-y-2">
                <div className={subtleClass}>
                  Scale points: {calibrationPointCount}/2
                </div>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="floor-plan-calibration-distance"
                    type="number"
                    min={0.05}
                    step={0.1}
                    inputMode="decimal"
                    value={calibrationDistanceMeters}
                    disabled={disabled}
                    onChange={(event) => onCalibrationDistanceChange?.(event.target.value)}
                    className={
                      dark
                        ? "w-24 rounded border border-white/15 bg-[#10131a] px-2 py-1.5 text-sm text-neutral-100"
                        : "w-24 rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900"
                    }
                    placeholder="m"
                  />
                  <span className={subtleClass}>m</span>
                  <button
                    type="button"
                    data-testid="floor-plan-apply-calibration"
                    className={secondaryButtonClass}
                    disabled={disabled || calibrationPointCount < 2 || !calibrationDistanceMeters}
                    onClick={onApplyCalibration}
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={disabled || calibrationPointCount === 0}
                    onClick={onResetCalibrationPoints}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>
          </>
        )}

        {showDrawRoomTools && (
          <div className={dark ? "rounded-lg bg-white/5 p-3" : "rounded-lg bg-neutral-50 p-3"}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-800"}>
                  Draw room
                </div>
                <div className={subtleClass}>
                  {canTraceRooms
                    ? traceRoomHint
                    : "Set the uploaded plan scale before drawing over it."}
                </div>
              </div>
              <button
                type="button"
                data-testid="floor-plan-trace-room-toggle"
                className={secondaryButtonClass}
                disabled={disabled || !canTraceRooms}
                onClick={() => onTraceRoomModeChange?.(!traceRoomMode)}
              >
                {traceRoomMode ? "Done" : "Draw"}
              </button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {DRAW_ROOM_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  data-testid={`floor-plan-draw-mode-${tool.id}`}
                  className={drawToolButtonClass(tool.id)}
                  disabled={disabled || !canTraceRooms}
                  onClick={() => onTraceRoomDrawModeChange?.(tool.id)}
                >
                  <span className="relative block h-12 w-12" aria-hidden="true">
                    {tool.id === "straight_wall" && (
                      <span
                        className={`absolute left-2 top-5 h-5 w-8 -skew-y-12 border ${drawToolIconClass}`}
                      />
                    )}
                    {tool.id === "rectangle_wall" && (
                      <>
                        <span
                          className={`absolute left-2 top-4 h-7 w-8 border ${drawToolIconClass}`}
                        />
                        <span
                          className={`absolute left-4 top-2 h-3 w-7 border ${drawToolIconClass}`}
                        />
                      </>
                    )}
                    {tool.id === "arc_wall" && (
                      <>
                        <span
                          className={`absolute left-2 top-4 h-7 w-8 rounded-b-full border-b-2 border-l-2 border-r-2 ${dark ? "border-neutral-400" : "border-neutral-600"}`}
                        />
                        <span
                          className={`absolute right-2 top-2 h-5 w-5 rounded-tr-full border-r-2 border-t-2 ${dark ? "border-neutral-400" : "border-neutral-600"}`}
                        />
                      </>
                    )}
                  </span>
                  <span className="leading-tight">
                    {tool.label}
                    <span className={dark ? "text-neutral-400" : "text-neutral-500"}>
                      {" "}
                      ({tool.shortcut})
                    </span>
                  </span>
                </button>
              ))}
            </div>

            {traceRoomMode && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className={subtleClass}>
                    Wall points: {traceRoomPointCount}
                  </div>
                  <div
                    data-testid="floor-plan-draw-escape-hint"
                    className={
                      dark
                        ? "rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-neutral-300"
                        : "rounded-full border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-500"
                    }
                  >
                    Esc {traceRoomPointCount > 0 ? "cancels line" : "exits draw"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-testid="floor-plan-undo-wall-point"
                    className={secondaryButtonClass}
                    disabled={disabled || !canUndoTraceRoomPoint}
                    onClick={onUndoTraceRoomPoint}
                    title="Remove the last wall point"
                  >
                    Undo point
                  </button>
                  {traceRoomTypeOptions.length > 0 && (
                    <select
                      data-testid="floor-plan-trace-room-type"
                      value={traceRoomType}
                      disabled={disabled}
                      onChange={(event) => onTraceRoomTypeChange?.(event.target.value as RoomType)}
                      className={
                        dark
                          ? "min-w-32 rounded border border-white/15 bg-[#10131a] px-2 py-1.5 text-sm text-neutral-100"
                          : "min-w-32 rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900"
                      }
                    >
                      {traceRoomTypeOptions.map((option) => (
                        <option key={option.type} value={option.type}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={disabled || traceRoomPointCount === 0}
                    onClick={onResetTraceRoomPoints}
                  >
                    Reset
                  </button>
                </div>
                {showAngleLockControls && (
                  <div className="space-y-1.5">
                    <div className={subtleClass}>Angle lock</div>
                    <div className="grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1 dark:bg-white/5">
                      {ANGLE_LOCK_TOOLS.map((tool) => {
                        const isActive = traceRoomAngleLockMode === tool.id;
                        return (
                          <button
                            key={tool.id}
                            type="button"
                            data-testid={`floor-plan-angle-lock-${tool.id}`}
                            className={
                              dark
                                ? [
                                    "rounded-md px-2 py-1.5 text-xs font-semibold transition",
                                    isActive
                                      ? "bg-white text-neutral-950"
                                      : "text-neutral-300 hover:bg-white/10",
                                  ].join(" ")
                                : [
                                    "rounded-md px-2 py-1.5 text-xs font-semibold transition",
                                    isActive
                                      ? "bg-neutral-900 text-white"
                                      : "text-neutral-600 hover:bg-white",
                                  ].join(" ")
                            }
                            disabled={disabled}
                            onClick={() => onTraceRoomAngleLockModeChange?.(tool.id)}
                          >
                            {tool.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {showExactWallLengthControls && (
                  <div className={dark ? "rounded-lg bg-white/5 p-2" : "rounded-lg bg-white p-2"}>
                    <div className={subtleClass}>Exact wall length</div>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        data-testid="floor-plan-exact-wall-length"
                        type="number"
                        min={1}
                        step={10}
                        inputMode="numeric"
                        value={exactWallLengthInput}
                        disabled={disabled}
                        onChange={(event) =>
                          onExactWallLengthInputChange?.(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            onApplyExactWallLength?.();
                          }
                        }}
                        className={
                          dark
                            ? "min-w-0 flex-1 rounded border border-white/15 bg-[#10131a] px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-50"
                            : "min-w-0 flex-1 rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 disabled:opacity-50"
                        }
                        placeholder="3500"
                      />
                      <span className={subtleClass}>mm</span>
                      <button
                        type="button"
                        data-testid="floor-plan-apply-exact-wall-length"
                        className={secondaryButtonClass}
                        disabled={
                          disabled || !canApplyExactWallLength || !exactWallLengthInput
                        }
                        onClick={onApplyExactWallLength}
                      >
                        Place
                      </button>
                    </div>
                    <div className={`${subtleClass} mt-1`}>
                      Pick a start point, type a length, then press Enter or Place.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {underlay && (
          <>
          <div className={dark ? "rounded-lg bg-white/5 p-3" : "rounded-lg bg-neutral-50 p-3"}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-800"}>
                  Trace opening
                </div>
                <div className={subtleClass}>
                  {canTraceOpenings
                    ? "Click along a wall for a door or window."
                    : "Draw a room before adding openings."}
                </div>
              </div>
              <button
                type="button"
                data-testid="floor-plan-trace-opening-toggle"
                className={secondaryButtonClass}
                disabled={disabled || !canTraceOpenings}
                onClick={() => onTraceOpeningModeChange?.(!traceOpeningMode)}
              >
                {traceOpeningMode ? "Done" : "Opening"}
              </button>
            </div>

            {traceOpeningMode && (
              <div className="mt-3 space-y-2">
                <div className={subtleClass}>
                  Opening points: {traceOpeningPointCount}/2
                </div>
                <div className="flex items-center gap-2">
                  <select
                    data-testid="floor-plan-trace-opening-kind"
                    value={traceOpeningKind}
                    disabled={disabled}
                    onChange={(event) =>
                      onTraceOpeningKindChange?.(event.target.value as RoomOpening2D["kind"])
                    }
                    className={
                      dark
                        ? "min-w-28 rounded border border-white/15 bg-[#10131a] px-2 py-1.5 text-sm text-neutral-100"
                        : "min-w-28 rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900"
                    }
                  >
                    <option value="door">Door</option>
                    <option value="window">Window</option>
                  </select>
                  <button
                    type="button"
                    className={secondaryButtonClass}
                    disabled={disabled || traceOpeningPointCount === 0}
                    onClick={onResetTraceOpeningPoints}
                  >
                    Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className={`flex items-center gap-2 ${subtleClass}`}>
              <input
                type="checkbox"
                checked={underlay.locked}
                disabled={disabled}
                onChange={(event) => onLockChange(event.target.checked)}
              />
              Lock
            </label>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={disabled}
              onClick={onClear}
            >
              Clear
            </button>
          </div>

          {underlay.sourceMimeType === "application/pdf" && (
            <div className="space-y-2">
              <div className={subtleClass} data-testid="floor-plan-pdf-status">
                PDF page {underlay.renderedPage ?? 1}
                {underlay.pageCount ? ` of ${underlay.pageCount}` : ""} rendered for tracing.
              </div>
              {canShowPdfPagePicker && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className={subtleClass}>Page</span>
                  <select
                    data-testid="floor-plan-pdf-page-select"
                    value={underlay.renderedPage ?? 1}
                    disabled={disabled || !canSelectPdfPage || pdfPageChanging}
                    className={selectClass}
                    onChange={(event) => onPdfPageChange?.(Number(event.target.value))}
                  >
                    {Array.from({ length: underlay.pageCount ?? 0 }, (_, index) => {
                      const pageNumber = index + 1;
                      return (
                        <option key={pageNumber} value={pageNumber}>
                          Page {pageNumber}
                        </option>
                      );
                    })}
                  </select>
                  {pdfPageChanging && (
                    <span className={subtleClass}>Rendering...</span>
                  )}
                  {!canSelectPdfPage && !pdfPageChanging && (
                    <span className={subtleClass}>Re-upload PDF to switch pages.</span>
                  )}
                </div>
              )}
            </div>
          )}
          </>
        )}
      </div>
    </div>
  );
}
