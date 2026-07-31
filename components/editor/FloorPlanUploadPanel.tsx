"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import FloorPlanImportWorkspace from "./FloorPlanImportWorkspace";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
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
  "application/dxf",
  "application/x-dxf",
  "application/ifc",
  "application/x-ifc",
  "application/step",
  "application/x-step",
  "application/dwg",
  "application/x-dwg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".pdf",
  ".dxf",
  ".ifc",
  ".ifcstep",
  ".step",
  ".stp",
  ".dwg",
].join(",");

const PRIMARY_DRAW_ROOM_TOOLS: Array<{
  id: FloorPlanDrawRoomMode;
  label: string;
  detail: string;
  shortcut: string;
}> = [
  { id: "rectangle_wall", label: "Outline room", detail: "Fastest start", shortcut: "F" },
  { id: "straight_wall", label: "Custom shape", detail: "Click corners", shortcut: "B" },
];

const ADVANCED_DRAW_ROOM_TOOLS: Array<{
  id: FloorPlanDrawRoomMode;
  label: string;
  detail: string;
  shortcut: string;
}> = [
  { id: "arc_wall", label: "Curved wall", detail: "Rounded edge", shortcut: "H" },
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
  traceRoomDrawMode = "rectangle_wall",
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
  const dialogRef = useRef<HTMLElement | null>(null);
  const [trainingBenchmarkOptIn, setTrainingBenchmarkOptIn] = useState(false);
  const [importWorkspaceOpen, setImportWorkspaceOpen] = useState(false);
  const [autoImportRequest, setAutoImportRequest] = useState<{
    file: File;
    trainingBenchmarkOptIn: boolean;
  } | null>(null);
  const cardClass = dark
    ? "designer-raised rounded-xl p-3"
    : "rounded-xl border border-neutral-200 bg-white p-3";
  const titleClass = dark
    ? "text-sm font-semibold text-neutral-100"
    : "text-sm font-semibold text-neutral-900";
  const subtleClass = dark ? "text-xs text-neutral-400" : "text-xs text-neutral-500";
  const buttonClass = dark
    ? "designer-control-active rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
    : "rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50";
  const secondaryButtonClass = dark
    ? "designer-control rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50"
    : "rounded-lg border border-neutral-200 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";
  const rangeClass = "h-2 w-full accent-neutral-900";
  const selectClass = dark
    ? "designer-control rounded border px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-50"
    : "rounded border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-900 disabled:opacity-50";
  const drawToolButtonClass = (mode: FloorPlanDrawRoomMode) => {
    const isActive = traceRoomMode && traceRoomDrawMode === mode;
    if (dark) {
      return [
        "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
        isActive
          ? "border-blue-400/45 bg-blue-500/20 text-blue-100"
          : "designer-control border text-neutral-200",
      ].join(" ");
    }
    return [
      "flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-45",
      isActive
        ? "border-blue-200 bg-blue-50 text-neutral-900 shadow-sm"
        : "border-neutral-100 bg-white text-neutral-700 hover:border-neutral-200 hover:bg-neutral-50",
    ].join(" ");
  };
  const drawStatusClass = dark
    ? "designer-status-pending rounded-full px-2 py-1 text-[11px] font-semibold"
    : "rounded-full border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-500";
  const drawToolMetaClass = dark
    ? "mt-0.5 block text-[11px] font-medium text-neutral-400"
    : "mt-0.5 block text-[11px] font-medium text-neutral-500";
  const drawToolIconClass = dark ? "border-neutral-400 bg-neutral-500" : "border-neutral-600 bg-neutral-300";
  const traceRoomHint =
    traceRoomDrawMode === "straight_wall"
      ? "Click corners, then close the outline."
      : traceRoomDrawMode === "rectangle_wall"
        ? "Drag across the room area."
        : "Pick two endpoints for the curved wall.";
  const canShowPdfPagePicker =
    underlay?.sourceMimeType === "application/pdf" && (underlay.pageCount ?? 0) > 1;
  const showAngleLockControls =
    showDesignerDrawControls && traceRoomMode && traceRoomDrawMode === "straight_wall";
  const showExactWallLengthControls = traceRoomMode && traceRoomDrawMode === "straight_wall";
  const canUndoTraceRoomPoint =
    traceRoomMode && traceRoomDrawMode === "straight_wall" && traceRoomPointCount > 0;
  const startRoomDraw = (mode: FloorPlanDrawRoomMode) => {
    onTraceRoomDrawModeChange?.(mode);
    if (!traceRoomMode) {
      onTraceRoomModeChange?.(true);
    }
  };
  useEffect(() => {
    if (!importWorkspaceOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setImportWorkspaceOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousBodyOverflow;
      previouslyFocused?.focus({ preventScroll: true });
    };
  }, [importWorkspaceOpen]);

  return (
    <>
    <div id="floor-plan-upload" className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
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
          onClick={() => setImportWorkspaceOpen(true)}
        >
          Import
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        data-testid="floor-plan-upload-input"
        aria-label="Choose a floor plan to import"
        accept={ACCEPTED_PLAN_FILE_TYPES}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) {
            setAutoImportRequest({ file, trainingBenchmarkOptIn });
            setImportWorkspaceOpen(true);
          }
        }}
      />

      <div className="mt-3 space-y-3">
        <button
          type="button"
          data-testid="floor-plan-import-workspace-launcher"
          className={
            dark
              ? "designer-recessed flex w-full items-center justify-between gap-3 rounded-lg p-3 text-left"
              : "flex w-full items-center justify-between gap-3 rounded-lg bg-neutral-50 p-3 text-left hover:bg-neutral-100"
          }
          disabled={disabled}
          onClick={() => setImportWorkspaceOpen(true)}
        >
          <span className="min-w-0">
            <span
              className={
                dark
                  ? "block text-xs font-semibold text-neutral-100"
                  : "block text-xs font-semibold text-neutral-800"
              }
            >
              Open import workspace
            </span>
            <span className={`${subtleClass} mt-0.5 block`}>
              Review the source at full size without covering your design.
            </span>
          </span>
          <span aria-hidden="true" className="shrink-0 text-lg">
            ↗
          </span>
        </button>
        {!underlay && !showDrawRoomTools && (
          <div
            data-testid="floor-plan-upload-empty-state"
            className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg bg-neutral-50 p-3"}
          >
            <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-800"}>
              Upload a floor-plan image, PDF, DXF, IFC, or DWG
            </div>
            <div className={`${subtleClass} mt-1`}>
              Imports are analyzed in a separate review workspace and never
              placed over the design you are currently editing.
            </div>
          </div>
        )}

        {underlay && (
          <>
          <div
            className={
              dark
                ? "designer-recessed flex items-center justify-between gap-2 rounded-lg p-3"
                : "flex items-center justify-between gap-2 rounded-lg bg-neutral-50 p-3"
            }
          >
            <div>
              <div
                className={
                  dark
                    ? "text-xs font-semibold text-neutral-100"
                    : "text-xs font-semibold text-neutral-800"
                }
              >
                Source reference
              </div>
              <div className={subtleClass}>
                Locked visual reference; it is not editable room geometry.
              </div>
            </div>
            <button
              type="button"
              data-testid="floor-plan-source-reference-toggle"
              className={secondaryButtonClass}
              disabled={disabled}
              aria-pressed={underlay.visible !== false}
              onClick={() =>
                onOpacityChange(
                  underlay.visible === false ? underlay.opacity || 0.45 : 0
                )
              }
            >
              {underlay.visible === false ? "Show" : "Hide"}
            </button>
          </div>
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
              disabled={disabled || underlay.visible === false}
              className={rangeClass}
              onChange={(event) => onOpacityChange(Number(event.target.value))}
            />
          </div>
          <div className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg bg-neutral-50 p-3"}>
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
                        ? "designer-control w-24 rounded border px-2 py-1.5 text-sm text-neutral-100"
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
          <div className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg bg-neutral-50 p-3"}>
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
                onClick={() => {
                  if (traceRoomMode) {
                    onTraceRoomModeChange?.(false);
                    return;
                  }
                  startRoomDraw("rectangle_wall");
                }}
              >
                {traceRoomMode ? "Done" : "Draw"}
              </button>
            </div>

            <div className="mt-3 grid gap-2">
              {PRIMARY_DRAW_ROOM_TOOLS.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  data-testid={`floor-plan-draw-mode-${tool.id}`}
                  className={drawToolButtonClass(tool.id)}
                  disabled={disabled || !canTraceRooms}
                  onClick={() => startRoomDraw(tool.id)}
                >
                  <span className="relative block h-9 w-10 shrink-0" aria-hidden="true">
                    {tool.id === "straight_wall" && (
                      <span
                        className={`absolute left-1 top-4 h-4 w-8 -skew-y-12 border ${drawToolIconClass}`}
                      />
                    )}
                    {tool.id === "rectangle_wall" && (
                      <>
                        <span
                          className={`absolute left-1 top-3 h-6 w-8 border ${drawToolIconClass}`}
                        />
                        <span
                          className={`absolute left-3 top-1 h-3 w-7 border ${drawToolIconClass}`}
                        />
                      </>
                    )}
                  </span>
                  <span className="min-w-0 leading-tight">
                    {tool.label}
                    <span className={drawToolMetaClass}>
                      {tool.detail} · {tool.shortcut}
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
                    className={drawStatusClass}
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
                          ? "designer-control min-w-32 rounded border px-2 py-1.5 text-sm text-neutral-100"
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
                {(showAngleLockControls || showExactWallLengthControls) && (
                  <div className={dark ? "designer-recessed rounded-lg p-2" : "rounded-lg bg-white p-2"}>
                    <div className={subtleClass}>Precision</div>
                    {showAngleLockControls && (
                      <div className={dark ? "designer-raised mt-1.5 grid grid-cols-3 gap-1 rounded-lg p-1" : "mt-1.5 grid grid-cols-3 gap-1 rounded-lg bg-black/5 p-1"}>
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
                    )}
                    {showExactWallLengthControls && (
                      <div className="mt-2">
                        <div className="flex items-center gap-2">
                          <input
                            data-testid="floor-plan-exact-wall-length"
                            type="number"
                            min={1}
                            max={ROOM_DIMENSION_DEFAULTS.max * 1000}
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
                                ? "designer-control min-w-0 flex-1 rounded border px-2 py-1.5 text-sm text-neutral-100 disabled:opacity-50"
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
                      </div>
                    )}
                  </div>
                )}
                <details className="pt-1">
                  <summary
                    className={
                      dark
                        ? "cursor-pointer text-xs font-semibold text-neutral-300"
                        : "cursor-pointer text-xs font-semibold text-neutral-600"
                    }
                  >
                    More drawing options
                  </summary>
                  <div className="mt-2 grid gap-2">
                    {ADVANCED_DRAW_ROOM_TOOLS.map((tool) => (
                      <button
                        key={tool.id}
                        type="button"
                        data-testid={`floor-plan-draw-mode-${tool.id}`}
                        className={drawToolButtonClass(tool.id)}
                        disabled={disabled || !canTraceRooms}
                        onClick={() => startRoomDraw(tool.id)}
                      >
                        <span className="relative block h-9 w-10 shrink-0" aria-hidden="true">
                          <span
                            className={`absolute left-1 top-3 h-6 w-8 rounded-b-full border-b-2 border-l-2 border-r-2 ${dark ? "border-neutral-400" : "border-neutral-600"}`}
                          />
                          <span
                            className={`absolute right-1 top-1 h-5 w-5 rounded-tr-full border-r-2 border-t-2 ${dark ? "border-neutral-400" : "border-neutral-600"}`}
                          />
                        </span>
                        <span className="min-w-0 leading-tight">
                          {tool.label}
                          <span className={drawToolMetaClass}>
                            {tool.detail} · {tool.shortcut}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            )}
          </div>
        )}

        {underlay && (
          <>
          <div className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg bg-neutral-50 p-3"}>
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
                        ? "designer-control min-w-28 rounded border px-2 py-1.5 text-sm text-neutral-100"
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
              onClick={() => {
                setAutoImportRequest(null);
                onClear();
              }}
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
    {importWorkspaceOpen
      ? createPortal(
          <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-4"
            data-testid="floor-plan-import-dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setImportWorkspaceOpen(false);
              }
            }}
          >
            <section
              ref={dialogRef}
              aria-labelledby="floor-plan-import-dialog-title"
              aria-modal="true"
              className={
                dark
                  ? "flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-neutral-950 text-neutral-100 shadow-2xl outline-none sm:h-[calc(100dvh-2rem)] sm:max-w-[1600px] sm:rounded-2xl sm:border sm:border-white/10"
                  : "flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white text-neutral-950 shadow-2xl outline-none sm:h-[calc(100dvh-2rem)] sm:max-w-[1600px] sm:rounded-2xl sm:border sm:border-neutral-200"
              }
              data-testid="floor-plan-import-dialog"
              role="dialog"
              tabIndex={-1}
            >
              <header
                className={
                  dark
                    ? "flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/95 px-4 py-3 sm:px-6 sm:py-4"
                    : "flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6 sm:py-4"
                }
              >
                <div className="min-w-0">
                  <div
                    className={
                      dark
                        ? "text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300"
                        : "text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700"
                    }
                  >
                    Import workspace
                  </div>
                  <h2
                    id="floor-plan-import-dialog-title"
                    className="truncate text-lg font-semibold sm:text-xl"
                  >
                    Import a floor plan
                  </h2>
                  <p className={`${subtleClass} hidden sm:block`}>
                    Upload once. AI builds an editable 2D and 3D design.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={disabled}
                    onClick={() => inputRef.current?.click()}
                  >
                    Choose file
                  </button>
                  <button
                    type="button"
                    aria-label="Close floor-plan import"
                    className={
                      dark
                        ? "designer-control flex h-10 w-10 items-center justify-center rounded-full border text-xl text-neutral-100 hover:bg-white/10"
                        : "flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-xl text-neutral-700 hover:bg-neutral-100"
                    }
                    onClick={() => setImportWorkspaceOpen(false)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </div>
              </header>
              <div
                className={
                  dark
                    ? "min-h-0 flex-1 overflow-y-auto bg-neutral-950 p-3 sm:p-5 lg:p-6"
                    : "min-h-0 flex-1 overflow-y-auto bg-neutral-100/70 p-3 sm:p-5 lg:p-6"
                }
              >
                <FloorPlanImportWorkspace
                  request={autoImportRequest}
                  trainingBenchmarkOptIn={trainingBenchmarkOptIn}
                  dark={dark}
                  disabled={disabled}
                  onChooseFile={() => inputRef.current?.click()}
                  onTrainingBenchmarkOptInChange={setTrainingBenchmarkOptIn}
                />
              </div>
            </section>
          </div>,
          document.body
        )
      : null}
    </>
  );
}
