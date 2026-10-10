"use client";

import type { CSSProperties } from "react";
import MeasurementField from "@/components/editor/MeasurementField";
import { Button } from "@/components/ui/Button";
import { SurfaceMaterialPicker, type SurfacePickerState } from "@/components/editor/design-page/SurfaceMaterialPicker";
import {
  SurfaceGroutControls,
  SurfacePatternControls,
  type FloorPatternState,
  type SurfaceGroutState,
} from "@/components/editor/design-page/SurfacePatternControls";
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
    /** Pro sees the publish status and has "Adjust pattern" open (UX audit ED5). */
    pro: boolean;
  };
  actions: SelectedSurfaceInspectorActions;
};

const SECONDARY = "min-h-8 touch:min-h-11";

function WallHeightRow({ wallHeight, actions }: { wallHeight: WallHeightState; actions: SelectedSurfaceInspectorActions }) {
  return (
    <div data-testid="selection-inspector-wall-height" className="mb-3 border-b border-neutral-200 pb-3">
      <div className="flex items-end gap-2">
        <MeasurementField
          className="min-w-0 flex-1"
          label={wallHeight.label}
          valueMm={wallHeight.valueMm}
          unit={wallHeight.unit}
          minMm={wallHeight.minMm}
          maxMm={wallHeight.maxMm}
          stepMm={wallHeight.stepMm}
          keyboardStepMm={wallHeight.keyboardStepMm}
          disabled={wallHeight.disabled}
          dark={false}
          compact
          testId="selection-inspector-wall-height-input"
          hint={wallHeight.hint}
          onCommit={actions.onCommitWallHeight}
        />
        <Button size="compact" data-testid="selection-inspector-reset-wall-height" className="h-9" disabled={wallHeight.resetDisabled} onClick={actions.onResetWallHeight}>
          Use floor
        </Button>
      </div>
    </div>
  );
}

function SurfaceHeader({ header, pro }: { header: SelectedSurfaceInspectorState["header"]; pro: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-black/10" style={header.swatchStyle} />
      <div className="min-w-0 flex-1">
        <h3 data-testid="surface-inspector-heading" className="text-xs font-semibold text-neutral-700">
          {header.label}
        </h3>
        <div className="mt-0.5 truncate text-sm font-semibold">{header.displayName}</div>
        <div className="mt-0.5 truncate text-neutral-600">{header.metadata}</div>
      </div>
      {pro ? (
        <span
          data-testid="surface-inspector-publish-status"
          className={
            header.draft
              ? "rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800"
              : "rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-semibold text-neutral-700"
          }
        >
          {header.publishStatus}
        </span>
      ) : null}
    </div>
  );
}

function SizeOptions({ options, onSelect }: { options: SurfaceSizeOption[]; onSelect: (materialId: string) => void }) {
  return (
    <div data-testid="selection-inspector-floor-size-options" className="mt-2 border-t border-neutral-100 pt-2">
      <div className="text-xs font-semibold text-neutral-700">Size</div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        {options.map((option) => (
          <button
            key={option.materialId}
            type="button"
            data-testid={`surface-size-option-${option.materialId}`}
            aria-pressed={option.selected}
            className={
              option.selected
                ? `${SECONDARY} rounded-lg border border-emerald-400 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-900`
                : `${SECONDARY} rounded-lg border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100`
            }
            title={option.title}
            disabled={option.disabled}
            onClick={() => onSelect(option.materialId)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The selected floor, wall or ceiling (UX audit ED5, phase 4f): its name and finish, Change… and
 * Reset, its sizes, where to apply it, and "Adjust pattern" with the rest (rotation, the laying
 * pattern, grout, moving it), closed for consumers and open for Pro.
 */
export function SelectedSurfaceInspector({
  state,
  configuration,
  actions,
}: SelectedSurfaceInspectorProps) {
  const { target } = state;
  const wall = target === "wall";
  const hasAdjustments = target !== "ceiling";
  return (
    <div
      data-testid="selection-inspector-floor-settings"
      data-floor-material-id={state.floorMaterialId}
      data-surface-target={wall ? "selected_wall" : target}
      data-surface-material-id={state.materialId}
      data-selected-wall-panel-id={state.wallPanelId ?? undefined}
      className="mt-2 px-0.5"
    >
      {state.wallHeight ? <WallHeightRow wallHeight={state.wallHeight} actions={actions} /> : null}
      <SurfaceHeader header={state.header} pro={configuration.pro} />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Button
          variant="primary"
          size="compact"
          data-testid={target === "ceiling" ? "plan-change-ceiling-finish" : "plan-change-floor-finish"}
          disabled={state.controls.changeDisabled}
          onClick={actions.onChangeMaterial}
        >
          {target === "ceiling" ? "Change paint…" : "Change material…"}
        </Button>
        <Button
          size="compact"
          data-testid={target === "ceiling" ? "selection-inspector-ceiling-reset" : "selection-inspector-floor-reset"}
          disabled={state.controls.resetDisabled}
          onClick={actions.onReset}
        >
          Reset
        </Button>
      </div>
      {state.sizeOptions.length ? <SizeOptions options={state.sizeOptions} onSelect={actions.onSelectSize} /> : null}
      {state.picker ? <SurfaceMaterialPicker picker={state.picker} onClose={actions.onClosePicker} onSelect={actions.onSelectPickerMaterial} /> : null}

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {wall ? (
          <Button size="compact" data-testid="selection-inspector-wall-apply-room" disabled={state.controls.applyAllDisabled} onClick={actions.onApplyRoom}>
            Apply to room
          </Button>
        ) : null}
        <Button
          size="compact"
          data-testid={
            wall
              ? "selection-inspector-wall-apply-all"
              : target === "ceiling"
                ? "selection-inspector-ceiling-apply-all"
                : "selection-inspector-floor-apply-all"
          }
          className={wall ? "" : "col-span-2"}
          disabled={state.controls.applyAllDisabled}
          onClick={actions.onApplyAll}
        >
          {state.target === "wall" ? "Apply to all walls" : target === "ceiling" ? "Apply to all ceilings" : "Apply to all floors"}
        </Button>
      </div>

      {hasAdjustments ? (
        <details data-testid="surface-adjust-pattern" open={configuration.pro || undefined} className="mt-2 border-t border-neutral-100 pt-2">
          <summary className="min-h-8 cursor-pointer text-xs font-semibold text-neutral-800 touch:min-h-11">Adjust pattern</summary>
          <Button size="compact" data-testid="selection-inspector-floor-rotate" className="mt-2 w-full" disabled={state.controls.rotateDisabled} onClick={actions.onRotate}>
            Rotate 90°
          </Button>
          {state.wallGrout ? (
            <div data-testid="selection-inspector-wall-grout" className="mt-2 border-t border-neutral-100 pt-1">
              <SurfaceGroutControls grout={state.wallGrout} actions={actions} testIdPrefix="wall-surface" />
            </div>
          ) : null}
          {state.floorPattern ? <SurfacePatternControls pattern={state.floorPattern} actions={actions} /> : null}
        </details>
      ) : null}

      <div className="mt-1 text-xs text-neutral-600">{state.footer}</div>
      {state.blockers ? (
        <div className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800">{state.blockers}</div>
      ) : null}
    </div>
  );
}
