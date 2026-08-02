"use client";

import MeasurementField from "@/components/editor/MeasurementField";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import {
  HOUSE_ROOM_TYPES,
  ROOM_DIMENSION_DEFAULTS,
  ROOM_SIZE_PRESETS,
  type RoomSizePresetId,
} from "@/lib/design-page-house-plan";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { RoomType } from "@/lib/room-types";

const UNIT_OPTIONS: Array<{
  value: PlanMeasurementUnit;
  shortLabel: string;
  label: string;
}> = [
  { value: "mm", shortLabel: "MM", label: "Millimetres" },
  { value: "cm", shortLabel: "CM", label: "Centimetres" },
  { value: "in", shortLabel: "IN", label: "Inches" },
];

export type ConsumerRoomSetupCardProps = {
  dark: boolean;
  canEdit: boolean;
  canEditPlanGeometry: boolean;
  hasRooms: boolean;
  activeRoomName: string;
  newRoomType: RoomType;
  activeRoomPresetId: string;
  roomWidthInput: string;
  roomDepthInput: string;
  roomWidth: number;
  roomDepth: number;
  measurementUnit: PlanMeasurementUnit;
  openingCount: number;
  hasConnectionBlockers: boolean;
  actions: {
    changeRoomType: (roomType: RoomType) => void;
    changeRoomPreset: (presetId: RoomSizePresetId) => void;
    changeRoomWidthInput: (value: string) => void;
    changeRoomDepthInput: (value: string) => void;
    commitRoomDimension: (axis: "width" | "depth", valueMm: number) => void;
    changeMeasurementUnit: (unit: PlanMeasurementUnit) => void;
    createRoom: () => void;
    chooseTemplate: () => void;
    drawRoom: () => void;
    addOpening: (kind: RoomOpening2D["kind"]) => void;
    continueToFurnish: () => void;
  };
};

function validDraftMetres(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function ConsumerRoomSetupCard({
  dark,
  canEdit,
  canEditPlanGeometry,
  hasRooms,
  activeRoomName,
  newRoomType,
  activeRoomPresetId,
  roomWidthInput,
  roomDepthInput,
  roomWidth,
  roomDepth,
  measurementUnit,
  openingCount,
  hasConnectionBlockers,
  actions,
}: ConsumerRoomSetupCardProps) {
  const widthMm =
    (hasRooms ? roomWidth : validDraftMetres(roomWidthInput, roomWidth)) * 1000;
  const depthMm =
    (hasRooms ? roomDepth : validDraftMetres(roomDepthInput, roomDepth)) * 1000;
  const roomTypeLabel =
    HOUSE_ROOM_TYPES.find((option) => option.type === newRoomType)?.label ??
    "Room";
  const shellClass = dark
    ? "designer-recessed border-b border-white/10 p-3"
    : "border-b border-neutral-100 bg-neutral-50/80 p-3";
  const labelClass = dark
    ? "text-xs font-semibold text-neutral-200"
    : "text-xs font-semibold text-neutral-700";
  const inputClass = dark
    ? "designer-control min-h-11 w-full rounded-lg border px-3 text-sm text-neutral-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-400/40 disabled:opacity-50"
    : "min-h-11 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none focus-visible:border-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600/20 disabled:opacity-50";
  const secondaryActionClass = dark
    ? "designer-control min-h-11 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-blue-400/40 disabled:opacity-50"
    : "min-h-11 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-800 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600/20 disabled:opacity-50";
  const primaryActionClass = dark
    ? "designer-control-active min-h-11 rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-blue-400/40 disabled:opacity-50"
    : "min-h-11 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-blue-600/30 disabled:opacity-50";

  return (
    <section
      data-testid="consumer-room-setup"
      className={shellClass}
      aria-labelledby="consumer-room-setup-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2
            id="consumer-room-setup-title"
            className={
              dark
                ? "text-sm font-semibold text-neutral-100"
                : "text-sm font-semibold text-neutral-950"
            }
          >
            {hasRooms ? "Check your room" : "Set up your room"}
          </h2>
          <p
            className={
              dark
                ? "mt-1 text-xs text-neutral-400"
                : "mt-1 text-xs text-neutral-600"
            }
          >
            {hasRooms
              ? `${activeRoomName}: confirm the real dimensions before furnishing.`
              : "Start with a safe rectangle, then adjust it to your measurements."}
          </p>
        </div>
        <span
          data-testid="room-setup-status"
          className={
            hasRooms
              ? dark
                ? "designer-status-ready rounded-full px-2 py-1 text-[11px] font-semibold"
                : "rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700"
              : dark
                ? "designer-status-warning rounded-full px-2 py-1 text-[11px] font-semibold"
                : "rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700"
          }
        >
          {hasRooms ? "Room ready" : "Needs a room"}
        </span>
      </div>

      {!hasRooms ? (
        <div data-testid="guided-room-start" className="mt-3 grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className={`grid gap-1 ${labelClass}`}>
              Room type
              <select
                data-testid="room-setup-type"
                value={newRoomType}
                className={inputClass}
                disabled={!canEdit}
                onChange={(event) =>
                  actions.changeRoomType(event.currentTarget.value as RoomType)
                }
              >
                {HOUSE_ROOM_TYPES.map((option) => (
                  <option key={option.type} value={option.type}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`grid gap-1 ${labelClass}`}>
              Starting size
              <select
                data-testid="room-setup-size-preset"
                value={activeRoomPresetId}
                className={inputClass}
                disabled={!canEdit}
                onChange={(event) =>
                  actions.changeRoomPreset(
                    event.currentTarget.value as RoomSizePresetId
                  )
                }
              >
                {ROOM_SIZE_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">Custom size</option>
              </select>
            </label>
          </div>
        </div>
      ) : null}

      <fieldset className="mt-3">
        <legend className={labelClass}>Display units</legend>
        <div
          data-testid="room-setup-measurement-units"
          className={
            dark
              ? "designer-raised mt-1 grid grid-cols-3 rounded-lg border p-1"
              : "mt-1 grid grid-cols-3 rounded-lg border border-neutral-200 bg-white p-1"
          }
        >
          {UNIT_OPTIONS.map((option) => {
            const selected = measurementUnit === option.value;
            return (
              <button
                key={option.value}
                type="button"
                data-testid={`room-setup-unit-${option.value}`}
                aria-label={`Use ${option.label.toLowerCase()}`}
                aria-pressed={selected}
                className={
                  selected
                    ? dark
                      ? "designer-work-control-active min-h-11 rounded-md px-2 text-xs font-semibold focus-visible:ring-2 focus-visible:ring-blue-400/40"
                      : "min-h-11 rounded-md bg-neutral-900 px-2 text-xs font-semibold text-white focus-visible:ring-2 focus-visible:ring-blue-600/30"
                    : dark
                      ? "designer-work-control min-h-11 rounded-md px-2 text-xs focus-visible:ring-2 focus-visible:ring-blue-400/40"
                      : "min-h-11 rounded-md px-2 text-xs text-neutral-600 hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-blue-600/20"
                }
                onClick={() => actions.changeMeasurementUnit(option.value)}
              >
                {option.shortLabel}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MeasurementField
          label="Width"
          valueMm={widthMm}
          unit={measurementUnit}
          minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
          maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
          stepMm={10}
          keyboardStepMm={50}
          disabled={!canEditPlanGeometry}
          dark={dark}
          compact
          touchFriendly
          testId="room-setup-width-input"
          onCommit={(valueMm) => {
            if (hasRooms) {
              actions.commitRoomDimension("width", valueMm);
              return;
            }
            actions.changeRoomWidthInput((valueMm / 1000).toFixed(2));
          }}
        />
        <MeasurementField
          label="Depth"
          valueMm={depthMm}
          unit={measurementUnit}
          minMm={ROOM_DIMENSION_DEFAULTS.min * 1000}
          maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
          stepMm={10}
          keyboardStepMm={50}
          disabled={!canEditPlanGeometry}
          dark={dark}
          compact
          touchFriendly
          testId="room-setup-depth-input"
          onCommit={(valueMm) => {
            if (hasRooms) {
              actions.commitRoomDimension("depth", valueMm);
              return;
            }
            actions.changeRoomDepthInput((valueMm / 1000).toFixed(2));
          }}
        />
      </div>

      <div
        data-testid="room-setup-scale-summary"
        role="status"
        aria-live="polite"
        className={
          dark
            ? "designer-raised mt-2 rounded-lg px-3 py-2 text-xs text-neutral-300"
            : "mt-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600"
        }
      >
        <span className="font-semibold">Visible scale:</span>{" "}
        {formatCabinetMeasurement(widthMm, measurementUnit)} ×{" "}
        {formatCabinetMeasurement(depthMm, measurementUnit)} ·{" "}
        {((widthMm * depthMm) / 1_000_000).toFixed(1)} m²
      </div>

      <p
        className={
          dark
            ? "mt-2 text-[11px] leading-4 text-neutral-400"
            : "mt-2 text-[11px] leading-4 text-neutral-500"
        }
      >
        Enter applies, Escape restores the last valid value, and arrow keys
        adjust by 50 mm. Valid room sizes are 1.8–20 m.
      </p>

      {!canEditPlanGeometry ? (
        <div
          role="alert"
          className={
            dark
              ? "mt-3 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
              : "mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          }
        >
          Room geometry is read-only in this view. Return to the editable plan
          to change dimensions or openings.
        </div>
      ) : null}

      {!hasRooms ? (
        <button
          type="button"
          data-testid="guided-create-room"
          className={`${primaryActionClass} mt-3 w-full`}
          disabled={!canEditPlanGeometry}
          onClick={actions.createRoom}
        >
          Create {roomTypeLabel.toLowerCase()}
        </button>
      ) : (
        <div className="mt-3 grid gap-2">
          <div
            id="room-setup-opening-status"
            data-testid="room-setup-opening-status"
            role="status"
            className={
              hasConnectionBlockers
                ? dark
                  ? "rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
                  : "rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
                : dark
                  ? "designer-raised rounded-lg px-3 py-2 text-xs text-neutral-300"
                  : "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600"
            }
          >
            {hasConnectionBlockers
              ? "A connected room still needs a doorway. Add one before furnishing."
              : openingCount > 0
                ? `${openingCount} door/window opening${openingCount === 1 ? "" : "s"} placed.`
                : "No doors or windows placed yet. Add only the openings that affect fit."}
          </div>
          <div className="grid grid-cols-2 gap-2" aria-label="Add room openings">
            <button
              type="button"
              data-testid="plan-tool-door"
              className={secondaryActionClass}
              disabled={!canEditPlanGeometry}
              onClick={() => actions.addOpening("door")}
            >
              Add door
            </button>
            <button
              type="button"
              data-testid="plan-tool-window"
              className={secondaryActionClass}
              disabled={!canEditPlanGeometry}
              onClick={() => actions.addOpening("window")}
            >
              Add window
            </button>
          </div>
          <button
            type="button"
            data-testid="room-setup-continue-furnish"
            className={primaryActionClass}
            disabled={!canEdit || hasConnectionBlockers}
            aria-describedby={hasConnectionBlockers ? "room-setup-opening-status" : undefined}
            onClick={actions.continueToFurnish}
          >
            Continue to Furnish
          </button>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid="plan-start-template"
          className={secondaryActionClass}
          disabled={!canEdit}
          onClick={actions.chooseTemplate}
        >
          Starter layouts
        </button>
        <button
          type="button"
          data-testid="plan-start-draw"
          className={secondaryActionClass}
          disabled={!canEdit}
          onClick={actions.drawRoom}
        >
          Draw measured room
        </button>
      </div>
    </section>
  );
}
