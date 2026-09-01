"use client";

import { DisplayUnitSelect } from "@/components/editor/DisplayUnitSelect";
import MeasurementField from "@/components/editor/MeasurementField";
import { ROOM_DIMENSION_DEFAULTS } from "@/lib/design-page-house-plan";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatDisplayArea, formatDisplayLength } from "@/lib/display-units";

type ConsumerMeasurementPreferenceRegionProps = {
  dark: boolean;
  canEditPlanGeometry: boolean;
  hasRooms: boolean;
  ready: boolean;
  widthMm: number;
  depthMm: number;
  measurementUnit: PlanMeasurementUnit;
  onChangeUnit: (unit: PlanMeasurementUnit) => void;
  onChangeDraft: (axis: "width" | "depth", value: string) => void;
  onCommitDimension: (axis: "width" | "depth", valueMm: number) => void;
};

function MeasurementPreferencePlaceholder({ dark }: { dark: boolean }) {
  const blockClass = dark ? "bg-white/10" : "bg-neutral-200";
  return (
    <div
      data-testid="room-setup-measurement-placeholder"
      className="mt-3 min-h-[162px] animate-pulse"
      aria-hidden="true"
    >
      <div className={`h-3 w-24 rounded ${blockClass}`} />
      <div className={`mt-1 h-11 rounded-lg ${blockClass}`} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div><div className={`h-3 w-12 rounded ${blockClass}`} /><div className={`mt-1 h-11 rounded-lg ${blockClass}`} /></div>
        <div><div className={`h-3 w-12 rounded ${blockClass}`} /><div className={`mt-1 h-11 rounded-lg ${blockClass}`} /></div>
      </div>
      <div className={`mt-2 h-9 rounded-lg ${blockClass}`} />
    </div>
  );
}

type ReadyMeasurementPreferenceProps = Omit<
  ConsumerMeasurementPreferenceRegionProps,
  "ready"
>;

function ReadyMeasurementPreference({
  dark,
  canEditPlanGeometry,
  hasRooms,
  widthMm,
  depthMm,
  measurementUnit,
  onChangeUnit,
  onChangeDraft,
  onCommitDimension,
}: ReadyMeasurementPreferenceProps) {
  const commit = (axis: "width" | "depth", valueMm: number) => {
    if (hasRooms) return onCommitDimension(axis, valueMm);
    onChangeDraft(axis, String(valueMm / 1000));
  };
  return <>
    <DisplayUnitSelect value={measurementUnit} dark={dark}
      testId="room-setup-measurement-units" className="mt-3" onChange={onChangeUnit} />
    <div className="mt-3 grid grid-cols-2 gap-2">
      {(["width", "depth"] as const).map((axis) => (
        <MeasurementField key={axis} label={axis === "width" ? "Width" : "Depth"}
          valueMm={axis === "width" ? widthMm : depthMm} unit={measurementUnit}
          minMm={ROOM_DIMENSION_DEFAULTS.min * 1000} maxMm={ROOM_DIMENSION_DEFAULTS.max * 1000}
          stepMm={10} keyboardStepMm={50} disabled={!canEditPlanGeometry} dark={dark}
          compact touchFriendly testId={`room-setup-${axis}-input`}
          onCommit={(valueMm) => commit(axis, valueMm)} />
      ))}
    </div>
    <div data-testid="room-setup-scale-summary" role="status" aria-live="polite"
      className={dark
        ? "designer-raised mt-2 rounded-lg px-3 py-2 text-xs text-neutral-300"
        : "mt-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600"}>
      <span className="font-semibold">Visible scale:</span>{" "}
      {formatDisplayLength(widthMm, measurementUnit)} ×{" "}
      {formatDisplayLength(depthMm, measurementUnit)} ·{" "}
      {formatDisplayArea((widthMm * depthMm) / 1_000_000, measurementUnit)}
    </div>
  </>;
}

export function ConsumerMeasurementPreferenceRegion({
  dark,
  canEditPlanGeometry,
  hasRooms,
  ready,
  widthMm,
  depthMm,
  measurementUnit,
  onChangeUnit,
  onChangeDraft,
  onCommitDimension,
}: ConsumerMeasurementPreferenceRegionProps) {
  return (
    <div
      data-testid="room-setup-unit-dependent"
      aria-busy={!ready}
      data-measurement-preference-state={ready ? "ready" : "loading"}
    >
      {!ready ? (
        <>
          <MeasurementPreferencePlaceholder dark={dark} />
          <span className="sr-only" role="status">Loading display units.</span>
        </>
      ) : (
        <ReadyMeasurementPreference dark={dark} canEditPlanGeometry={canEditPlanGeometry}
          hasRooms={hasRooms} widthMm={widthMm} depthMm={depthMm}
          measurementUnit={measurementUnit} onChangeUnit={onChangeUnit}
          onChangeDraft={onChangeDraft} onCommitDimension={onCommitDimension} />
      )}
    </div>
  );
}
