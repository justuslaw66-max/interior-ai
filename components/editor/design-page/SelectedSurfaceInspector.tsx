"use client";

import type { CSSProperties, KeyboardEvent } from "react";
import MeasurementField from "@/components/editor/MeasurementField";
import SurfacePatternPreview from "@/components/editor/design-page/SurfacePatternPreview";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { RoomFloorPattern } from "@/lib/room-types";

type SurfaceInspectorTarget = "floor" | "wall" | "ceiling";

type WallHeightState = {
  label: string;
  valueMm: number;
  unit: PlanMeasurementUnit;
  minMm: number;
  maxMm: number;
  stepMm: number;
  keyboardStepMm: number;
  disabled: boolean;
  resetDisabled: boolean;
  hint: string;
};

type SurfaceSizeOption = {
  materialId: string;
  label: string;
  title: string;
  selected: boolean;
  disabled: boolean;
};

type SurfacePickerOption = {
  materialId: string;
  name: string;
  metadata: string;
  swatchStyle: CSSProperties;
  selected: boolean;
  disabled: boolean;
  showGovernance: boolean;
  draft: boolean;
  publishStatus: string;
  blockerCount: number;
};

type SurfacePickerState = {
  title: string;
  options: SurfacePickerOption[];
  emptyMessage: string;
};

type SurfaceGroutState = {
  groutSizes: Array<{
    valueMm: number;
    selected: boolean;
    testId: string;
  }>;
  groutColor: string;
  groutPaletteOpen: boolean;
  groutColors: Array<{
    key: string;
    color: string;
    selected: boolean;
    testId: string;
  }>;
  disabled: boolean;
};

type FloorPatternState = SurfaceGroutState & {
  value: RoomFloorPattern;
  options: Array<{
    id: RoomFloorPattern;
    label: string;
    selected: boolean;
  }>;
  rotations: Array<{
    value: number;
    selected: boolean;
  }>;
  scale: number;
  offset: { x: number; y: number };
};

export type SelectedSurfaceInspectorState = {
  target: SurfaceInspectorTarget;
  wallPanelId: string | null;
  floorMaterialId: string;
  materialId: string;
  wallHeight: WallHeightState | null;
  header: {
    label: string;
    displayName: string;
    metadata: string;
    swatchStyle: CSSProperties;
    publishStatus: string;
    draft: boolean;
  };
  sizeOptions: SurfaceSizeOption[];
  controls: {
    changeDisabled: boolean;
    rotateDisabled: boolean;
    resetDisabled: boolean;
    applyAllDisabled: boolean;
  };
  picker: SurfacePickerState | null;
  wallGrout: SurfaceGroutState | null;
  floorPattern: FloorPatternState | null;
  footer: string;
  blockers: string | null;
};

export type SelectedSurfaceInspectorActions = {
  onCommitWallHeight: (valueMm: number) => void;
  onResetWallHeight: () => void;
  onSelectSize: (materialId: string) => void;
  onChangeMaterial: () => void;
  onRotate: () => void;
  onReset: () => void;
  onApplyRoom: () => void;
  onApplyAll: () => void;
  onClosePicker: () => void;
  onSelectPickerMaterial: (materialId: string) => void;
  onSelectPattern: (pattern: RoomFloorPattern) => void;
  onSelectRotation: (rotationDeg: number) => void;
  onChangeScale: (scale: number) => void;
  onSelectGroutSize: (sizeMm: number) => void;
  onToggleGroutPalette: () => void;
  onSelectGroutColor: (color: string) => void;
  onMovePattern: (deltaX: number, deltaY: number) => void;
  onResetPattern: () => void;
  onResetSurface: () => void;
};

type SelectedSurfaceInspectorProps = {
  state: SelectedSurfaceInspectorState;
  configuration: {
    dark: boolean;
  };
  actions: SelectedSurfaceInspectorActions;
};

function SurfaceGroutControls({
  grout,
  dark,
  actions,
  testIdPrefix,
}: {
  grout: SurfaceGroutState;
  dark: boolean;
  actions: Pick<
    SelectedSurfaceInspectorActions,
    "onSelectGroutSize" | "onToggleGroutPalette" | "onSelectGroutColor"
  >;
  testIdPrefix: "surface" | "wall-surface";
}) {
  return (
    <div className="mt-2">
      <div
        className={
          dark
            ? "text-[11px] font-semibold text-neutral-300"
            : "text-[11px] font-semibold text-neutral-600"
        }
      >
        Grout
      </div>
      <div className="mt-1 grid grid-cols-[1fr_auto] gap-2">
        <div
          className={
            dark
              ? "block text-[11px] font-semibold text-neutral-300"
              : "block text-[11px] font-semibold text-neutral-600"
          }
        >
          Grout size
          <div className="mt-1 grid grid-cols-3 gap-1">
            {grout.groutSizes.map((size) => (
              <button
                key={size.valueMm}
                type="button"
                data-testid={size.testId}
                disabled={grout.disabled}
                className={
                  size.selected
                    ? "min-h-8 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                    : dark
                      ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                      : "min-h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                }
                onClick={() => actions.onSelectGroutSize(size.valueMm)}
              >
                {size.valueMm} mm
              </button>
            ))}
          </div>
        </div>
        <div
          className={
            dark
              ? "block text-[11px] font-semibold text-neutral-300"
              : "block text-[11px] font-semibold text-neutral-600"
          }
        >
          Color
          <button
            type="button"
            data-testid={`${testIdPrefix}-joint-color`}
            disabled={grout.disabled}
            className={
              dark
                ? "designer-control mt-1 grid h-8 w-12 place-items-center rounded-lg border p-1 disabled:opacity-50"
                : "mt-1 grid h-8 w-12 place-items-center rounded-lg border border-neutral-200 bg-white p-1 disabled:opacity-50"
            }
            aria-label="Choose grout color"
            title="Choose grout color"
            onClick={actions.onToggleGroutPalette}
          >
            <span
              aria-hidden="true"
              className="block h-full w-full rounded border border-black/15"
              style={{ backgroundColor: grout.groutColor }}
            />
          </button>
        </div>
      </div>
      {grout.groutPaletteOpen ? (
        <div
          data-testid={`${testIdPrefix}-grout-color-palette`}
          className={
            dark
              ? "designer-recessed mt-2 grid grid-cols-5 gap-1.5 rounded-lg p-1.5"
              : "mt-2 grid grid-cols-5 gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 p-1.5"
          }
        >
          {grout.groutColors.map((color) => (
            <button
              key={color.key}
              type="button"
              data-testid={color.testId}
              disabled={grout.disabled}
              className={
                color.selected
                  ? dark
                    ? "grid aspect-square min-h-8 place-items-center rounded-md border border-white/25 bg-white/10 p-0"
                    : "grid aspect-square min-h-8 place-items-center rounded-md border border-neutral-200 bg-white p-0 shadow-sm"
                  : dark
                    ? "grid aspect-square min-h-8 place-items-center rounded-md border border-transparent bg-white/5 p-0 hover:bg-white/10"
                    : "grid aspect-square min-h-8 place-items-center rounded-md border border-transparent bg-white p-0 hover:border-neutral-200"
              }
              aria-label={`Set grout color ${color.color}`}
              title={color.color}
              onClick={() => actions.onSelectGroutColor(color.color)}
            >
              <span
                aria-hidden="true"
                className="block h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-md border border-black/5"
                style={{ backgroundColor: color.color }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SelectedSurfaceInspector({
  state,
  configuration,
  actions,
}: SelectedSurfaceInspectorProps) {
  const { dark } = configuration;
  const handleOffsetKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta =
      event.key === "ArrowLeft"
        ? { x: -0.05, y: 0 }
        : event.key === "ArrowRight"
          ? { x: 0.05, y: 0 }
          : event.key === "ArrowUp"
            ? { x: 0, y: 0.05 }
            : event.key === "ArrowDown"
              ? { x: 0, y: -0.05 }
              : null;
    if (!delta) return;
    event.preventDefault();
    actions.onMovePattern(delta.x, delta.y);
  };

  return (
    <div
      data-testid="selection-inspector-floor-settings"
      data-floor-material-id={state.floorMaterialId}
      data-surface-target={state.target === "wall" ? "selected_wall" : state.target}
      data-surface-material-id={state.materialId}
      data-selected-wall-panel-id={state.wallPanelId ?? undefined}
      className="mt-2 px-0.5"
    >
      {state.wallHeight ? (
        <div
          data-testid="selection-inspector-wall-height"
          className={
            dark
              ? "mb-3 border-b border-white/10 pb-3"
              : "mb-3 border-b border-neutral-200 pb-3"
          }
        >
          <div className="flex items-end gap-2">
            <MeasurementField
              className="min-w-0 flex-1"
              label={state.wallHeight.label}
              valueMm={state.wallHeight.valueMm}
              unit={state.wallHeight.unit}
              minMm={state.wallHeight.minMm}
              maxMm={state.wallHeight.maxMm}
              stepMm={state.wallHeight.stepMm}
              keyboardStepMm={state.wallHeight.keyboardStepMm}
              disabled={state.wallHeight.disabled}
              dark={dark}
              compact
              testId="selection-inspector-wall-height-input"
              hint={state.wallHeight.hint}
              onCommit={actions.onCommitWallHeight}
            />
            <button
              type="button"
              data-testid="selection-inspector-reset-wall-height"
              className={
                dark
                  ? "h-9 rounded-md border border-white/15 px-2 font-semibold text-neutral-100 hover:bg-white/10 disabled:opacity-40"
                  : "h-9 rounded-md border border-neutral-200 bg-white px-2 font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
              }
              disabled={state.wallHeight.resetDisabled}
              onClick={actions.onResetWallHeight}
            >
              Use floor
            </button>
          </div>
        </div>
      ) : null}

      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="h-10 w-10 shrink-0 rounded-md border border-black/10"
          style={state.header.swatchStyle}
        />
        <div className="min-w-0 flex-1">
          <div
            className={
              dark
                ? "text-[11px] font-semibold uppercase text-neutral-400"
                : "text-[11px] font-semibold uppercase text-neutral-500"
            }
          >
            {state.header.label}
          </div>
          <div className="mt-0.5 truncate text-sm font-semibold">
            {state.header.displayName}
          </div>
          <div
            className={
              dark
                ? "mt-0.5 truncate text-neutral-400"
                : "mt-0.5 truncate text-neutral-500"
            }
          >
            {state.header.metadata}
          </div>
        </div>
        <span
          className={
            state.header.draft
              ? dark
                ? "designer-status-warning rounded-full px-2 py-0.5 text-[10px] font-semibold"
                : "rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800"
              : dark
                ? "designer-status-ready rounded-full px-2 py-0.5 text-[10px] font-semibold"
                : "rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-neutral-600"
          }
        >
          {state.header.publishStatus}
        </span>
      </div>

      {state.sizeOptions.length ? (
        <div
          data-testid="selection-inspector-floor-size-options"
          className={
            dark
              ? "mt-2 border-t border-white/10 pt-2"
              : "mt-2 border-t border-neutral-100 pt-2"
          }
        >
          <div
            className={
              dark
                ? "text-[11px] font-semibold text-neutral-300"
                : "text-[11px] font-semibold text-neutral-600"
            }
          >
            Size
          </div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            {state.sizeOptions.map((option) => (
              <button
                key={option.materialId}
                type="button"
                data-testid={`surface-size-option-${option.materialId}`}
                className={
                  option.selected
                    ? dark
                      ? "min-h-8 rounded-lg border border-emerald-300/50 bg-emerald-400/15 px-2 py-1 text-xs font-semibold text-emerald-100"
                      : "min-h-8 rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900"
                    : dark
                      ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                      : "min-h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                }
                title={option.title}
                disabled={option.disabled}
                onClick={() => actions.onSelectSize(option.materialId)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {state.target === "ceiling" ? (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="plan-change-ceiling-finish"
            className={
              dark
                ? "min-h-8 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-neutral-950 hover:bg-neutral-200"
                : "min-h-8 rounded-lg bg-neutral-950 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800"
            }
            disabled={state.controls.changeDisabled}
            onClick={actions.onChangeMaterial}
          >
            Change paint
          </button>
          <button
            type="button"
            data-testid="selection-inspector-ceiling-reset"
            className={
              dark
                ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                : "min-h-8 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            }
            disabled={state.controls.resetDisabled}
            onClick={actions.onReset}
          >
            Reset
          </button>
          <button
            type="button"
            data-testid="selection-inspector-ceiling-apply-all"
            className={
              dark
                ? "col-span-2 min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                : "col-span-2 min-h-8 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            }
            disabled={state.controls.applyAllDisabled}
            onClick={actions.onApplyAll}
          >
            Apply to all ceilings
          </button>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            type="button"
            data-testid="plan-change-floor-finish"
            className={
              dark
                ? "min-h-8 rounded-lg bg-white px-2 py-1 text-xs font-semibold text-neutral-950 hover:bg-neutral-200"
                : "min-h-8 rounded-lg bg-neutral-950 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800"
            }
            disabled={state.controls.changeDisabled}
            onClick={actions.onChangeMaterial}
          >
            Change material
          </button>
          <button
            type="button"
            data-testid="selection-inspector-floor-rotate"
            className={
              dark
                ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                : "min-h-8 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            }
            disabled={state.controls.rotateDisabled}
            onClick={actions.onRotate}
          >
            Rotate 90°
          </button>
          <button
            type="button"
            data-testid="selection-inspector-floor-reset"
            className={
              dark
                ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                : "min-h-8 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
            }
            disabled={state.controls.resetDisabled}
            onClick={actions.onReset}
          >
            Reset
          </button>
          {state.target === "wall" ? (
            <button
              type="button"
              data-testid="selection-inspector-wall-apply-room"
              className={
                dark
                  ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                  : "min-h-8 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
              }
              disabled={state.controls.applyAllDisabled}
              onClick={actions.onApplyRoom}
            >
              Apply to room
            </button>
          ) : null}
          <button
            type="button"
            data-testid={
              state.target === "wall"
                ? "selection-inspector-wall-apply-all"
                : "selection-inspector-floor-apply-all"
            }
            className={
              dark
                ? `${state.target === "wall" ? "col-span-2 " : ""}min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10`
                : `${state.target === "wall" ? "col-span-2 " : ""}min-h-8 rounded-lg border border-neutral-200 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50`
            }
            disabled={state.controls.applyAllDisabled}
            onClick={actions.onApplyAll}
          >
            {state.target === "wall" ? "Apply to all walls" : "Apply all"}
          </button>
        </div>
      )}

      {state.picker ? (
        <div
          data-testid="selection-inspector-floor-picker"
          className={
            dark
              ? "designer-recessed mt-3 max-h-80 overflow-y-auto rounded-lg p-2"
              : "mt-3 max-h-80 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2"
          }
        >
          <div className="flex items-center justify-between gap-2">
            <div
              className={
                dark
                  ? "text-xs font-semibold text-neutral-100"
                  : "text-xs font-semibold text-neutral-900"
              }
            >
              {state.picker.title}
            </div>
            <button
              type="button"
              data-testid="selection-inspector-floor-picker-close"
              className={
                dark
                  ? "rounded-md border border-white/15 px-2 py-1 text-[11px] font-semibold text-neutral-200"
                  : "rounded-md border border-neutral-200 px-2 py-1 text-[11px] font-semibold text-neutral-600"
              }
              onClick={actions.onClosePicker}
            >
              Close
            </button>
          </div>
          {state.picker.options.length ? (
            <div className="mt-2 grid gap-2">
              {state.picker.options.map((option) => (
                <button
                  key={option.materialId}
                  type="button"
                  data-testid={`selection-inspector-floor-material-${option.materialId}`}
                  className={
                    option.selected
                      ? dark
                        ? "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-emerald-300/50 bg-emerald-400/15 p-2 text-left"
                        : "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-left"
                      : dark
                        ? "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10"
                        : "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-neutral-200 bg-white p-2 text-left hover:bg-neutral-50"
                  }
                  disabled={option.disabled}
                  onClick={() => actions.onSelectPickerMaterial(option.materialId)}
                >
                  <span
                    aria-hidden="true"
                    className="h-10 w-10 rounded-md border border-black/10"
                    style={option.swatchStyle}
                  />
                  <span className="min-w-0">
                    <span
                      className={
                        dark
                          ? "block truncate text-xs font-semibold text-neutral-100"
                          : "block truncate text-xs font-semibold text-neutral-900"
                      }
                    >
                      {option.name}
                    </span>
                    <span
                      className={
                        dark
                          ? "block truncate text-[11px] text-neutral-400"
                          : "block truncate text-[11px] text-neutral-500"
                      }
                    >
                      {option.metadata}
                    </span>
                    {option.showGovernance ? (
                      <span className="mt-1 flex flex-wrap gap-1">
                        <span
                          className={
                            dark
                              ? option.draft
                                ? "designer-status-warning rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                : "designer-status-ready rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                              : option.draft
                                ? "rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800"
                                : "rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"
                          }
                        >
                          {option.publishStatus}
                        </span>
                        {option.blockerCount > 0 ? (
                          <span
                            className={
                              dark
                                ? "designer-status-blocked rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                                : "rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-orange-700"
                            }
                          >
                            {option.blockerCount} blockers
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div
              className={
                dark
                  ? "mt-2 rounded-lg border border-white/10 p-2 text-[11px] text-neutral-400"
                  : "mt-2 rounded-lg border border-neutral-200 p-2 text-[11px] text-neutral-500"
              }
            >
              {state.picker.emptyMessage}
            </div>
          )}
        </div>
      ) : null}

      {state.wallGrout ? (
        <div
          data-testid="selection-inspector-wall-grout"
          className={
            dark
              ? "mt-2 border-t border-white/10 pt-1"
              : "mt-2 border-t border-neutral-100 pt-1"
          }
        >
          <SurfaceGroutControls
            grout={state.wallGrout}
            dark={dark}
            actions={actions}
            testIdPrefix="wall-surface"
          />
        </div>
      ) : null}

      {state.floorPattern ? (
        <div
          className={
            dark
              ? "mt-2 border-t border-white/10 pt-2"
              : "mt-2 border-t border-neutral-100 pt-2"
          }
        >
          <div>
            <div
              className={
                dark
                  ? "text-[11px] font-semibold text-neutral-300"
                  : "text-[11px] font-semibold text-neutral-600"
              }
            >
              Pattern
            </div>
            <select
              data-testid="surface-pattern-select"
              aria-label="Floor pattern"
              value={state.floorPattern.value}
              disabled={state.floorPattern.disabled}
              className="sr-only"
              onChange={(event) =>
                actions.onSelectPattern(event.currentTarget.value as RoomFloorPattern)
              }
            >
              {state.floorPattern.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <div
              data-testid="surface-pattern-options"
              className="mt-1.5 grid grid-cols-3 gap-1.5"
            >
              {state.floorPattern.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-testid={`surface-pattern-option-${option.id}`}
                  aria-label={`Set ${option.label} pattern`}
                  aria-pressed={option.selected}
                  title={option.label}
                  disabled={state.floorPattern?.disabled}
                  className={
                    option.selected
                      ? dark
                        ? "grid h-12 place-items-center rounded-lg border border-emerald-300/60 bg-emerald-400/15 p-1 shadow-sm shadow-emerald-950/20"
                        : "grid h-12 place-items-center rounded-lg border border-emerald-400 bg-emerald-50 p-1 shadow-sm"
                      : dark
                        ? "designer-control grid h-12 place-items-center rounded-lg border p-1"
                        : "grid h-12 place-items-center rounded-lg border border-neutral-200 bg-white p-1 hover:border-neutral-300 hover:bg-neutral-50"
                  }
                  onClick={() => actions.onSelectPattern(option.id)}
                >
                  <SurfacePatternPreview pattern={option.id} dark={dark} />
                  <span className="sr-only">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2">
            <div
              className={
                dark
                  ? "text-[11px] font-semibold text-neutral-300"
                  : "text-[11px] font-semibold text-neutral-600"
              }
            >
              Rotation
            </div>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {state.floorPattern.rotations.map((rotation) => (
                <button
                  key={rotation.value}
                  type="button"
                  data-testid={`surface-rotation-${rotation.value}`}
                  className={
                    rotation.selected
                      ? "min-h-8 rounded-lg bg-emerald-600 px-2 py-1 text-xs font-semibold text-white"
                      : dark
                        ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                        : "min-h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                  }
                  disabled={state.floorPattern?.disabled}
                  onClick={() => actions.onSelectRotation(rotation.value)}
                >
                  {rotation.value}°
                </button>
              ))}
            </div>
          </div>

          <label
            className={
              dark
                ? "mt-2 block text-[11px] font-semibold text-neutral-300"
                : "mt-2 block text-[11px] font-semibold text-neutral-600"
            }
          >
            Pattern size · {state.floorPattern.scale.toFixed(2)}x
            <input
              type="range"
              data-testid="surface-pattern-scale"
              min={0.5}
              max={2}
              step={0.05}
              value={state.floorPattern.scale}
              disabled={state.floorPattern.disabled}
              onChange={(event) => actions.onChangeScale(Number(event.currentTarget.value))}
              className="mt-2 w-full accent-emerald-600 disabled:opacity-50"
            />
          </label>

          <SurfaceGroutControls
            grout={state.floorPattern}
            dark={dark}
            actions={actions}
            testIdPrefix="surface"
          />

          <div
            data-testid="surface-offset-controls"
            role="group"
            tabIndex={0}
            aria-label="Move floor pattern"
            className="mt-2"
            onKeyDown={handleOffsetKeyDown}
          >
            <div
              className={
                dark
                  ? "text-[11px] font-semibold text-neutral-300"
                  : "text-[11px] font-semibold text-neutral-600"
              }
            >
              Move pattern
            </div>
            <div className="mt-1 grid grid-cols-4 gap-1">
              {[
                { label: "Left", x: -0.05, y: 0 },
                { label: "Right", x: 0.05, y: 0 },
                { label: "Up", x: 0, y: 0.05 },
                { label: "Down", x: 0, y: -0.05 },
              ].map((action) => (
                <button
                  key={action.label}
                  type="button"
                  data-testid={`surface-offset-${action.label.toLowerCase()}`}
                  className={
                    dark
                      ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                      : "min-h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                  }
                  disabled={state.floorPattern?.disabled}
                  onClick={() => actions.onMovePattern(action.x, action.y)}
                >
                  {action.label}
                </button>
              ))}
            </div>
            <div
              className={
                dark
                  ? "mt-1 text-[11px] text-neutral-400"
                  : "mt-1 text-[11px] text-neutral-500"
              }
            >
              Offset {state.floorPattern.offset.x.toFixed(2)}, {state.floorPattern.offset.y.toFixed(2)}
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-1.5">
            <button
              type="button"
              className={
                dark
                  ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                  : "min-h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
              }
              disabled={state.floorPattern.disabled}
              onClick={actions.onResetPattern}
            >
              Reset pattern
            </button>
            <button
              type="button"
              className={
                dark
                  ? "min-h-8 rounded-lg border border-white/15 px-2 py-1 text-xs font-semibold text-neutral-100 hover:bg-white/10"
                  : "min-h-8 rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
              }
              disabled={state.floorPattern.disabled}
              onClick={actions.onResetSurface}
            >
              Reset surface
            </button>
          </div>
        </div>
      ) : null}

      <div
        className={
          dark
            ? "mt-1 text-[11px] text-neutral-400"
            : "mt-1 text-[11px] text-neutral-500"
        }
      >
        {state.footer}
      </div>
      {state.blockers ? (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-semibold text-amber-800">
          {state.blockers}
        </div>
      ) : null}
    </div>
  );
}
