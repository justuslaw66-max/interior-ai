"use client";

import { useState } from "react";
import { changeReviewMeasurement } from "@/lib/floor-plan-review-measurements";
import { evaluateSourceMeasurement } from "@/lib/floor-plan-scale-measurements";
import type { FloorPlanSourceMeasurementV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanScaleReviewPanelProps } from "./FloorPlanScaleReviewPanel";
import FloorPlanMeasurementInput, { useReviewMeasurementInput } from "./FloorPlanMeasurementInput";
import { scaleReviewFailureMessage } from "./applyScaleReviewMeasurement";

type Props = Pick<FloorPlanScaleReviewPanelProps, "document" | "floorId" | "calibration" | "scalePoints" |
  "onScalePointsChange" | "onPickingScaleChange" | "onChange" | "onError" | "disabled"> & { control: string };

function SavedChecks({ props, change, edit }: { props: Props; change: (value: { removeId: string }) => void;
  edit: (measurement: FloorPlanSourceMeasurementV2) => void }) {
  return <ul className="grid gap-2" aria-label="Saved scale checks">
    {(props.calibration?.independentMeasurements ?? []).map((measurement, index) => {
      const result = evaluateSourceMeasurement(props.calibration!, measurement);
      return <li key={measurement.id} className="rounded border p-2 text-xs">
        <p>{`Check ${index + 1}: ${measurement.confirmedLengthMm} mm (${measurement.inputUnit}) — ${result.agrees ? "agrees" : "conflict"}`}</p>
        <p>{!result.independent ? "Choose a different dimension from the scale-setting span."
          : Number.isFinite(result.residualPx) ? `Current difference ${result.residualMm.toFixed(1)} mm; ${Math.abs(result.residualPx).toFixed(2)} source pixels (limit ${result.tolerancePx}).`
            : "The registration cannot measure this span. Re-register the source page."}</p>
        <button type="button" className={props.control} disabled={props.disabled}
          onClick={() => edit(measurement)}>Edit check {index + 1}</button>
        <button type="button" className={props.control} disabled={props.disabled}
          onClick={() => change({ removeId: measurement.id })}>Remove check {index + 1}</button>
      </li>;
    })}
  </ul>;
}

export default function FloorPlanIndependentScaleReview(props: Props) {
  const input = useReviewMeasurementInput();
  const [editingId, setEditingId] = useState<string | null>(null);
  const change = (measurement: FloorPlanSourceMeasurementV2 | { removeId: string }) => {
    if (!props.calibration) return;
    try {
      props.onError(null);
      props.onChange(changeReviewMeasurement({ document: props.document, floorId: props.floorId,
        calibrationId: props.calibration.id, measurement }));
      props.onPickingScaleChange(false);
      setEditingId(null);
    } catch (cause) { props.onError(scaleReviewFailureMessage(cause)); }
  };
  return <section className="mt-3 grid gap-2" aria-label="Independent scale check">
    <p className="text-xs">Choose a different printed dimension, preferably in the other direction. A disagreement needs correction before creating a design. This check does not resize the plan.</p>
    <button type="button" className={props.control} disabled={props.disabled} onClick={() => {
      props.onScalePointsChange([]); props.onPickingScaleChange(true);
    }}>Choose check endpoints</button>
    <FloorPlanMeasurementInput input={input} control={props.control} disabled={props.disabled} />
    <button type="button" className={props.control} disabled={props.disabled || props.scalePoints.length !== 2 || !Number.isFinite(input.confirmedMm)}
      onClick={() => change({ id: editingId ?? `check-${crypto.randomUUID()}`, firstPx: props.scalePoints[0], secondPx: props.scalePoints[1],
        confirmedLengthMm: input.confirmedMm, inputUnit: input.unit, sourceQuality: input.sourceQuality, confirmedAt: new Date().toISOString() })}>
      {editingId ? "Save check correction" : "Save independent check"}</button>
    {!props.calibration?.independentMeasurements?.length && <p className="text-xs">No independent check recorded. If another dimension is available, check it before continuing. A single measurement cannot establish accuracy across the whole plan.</p>}
    <SavedChecks props={props} change={change} edit={(measurement) => {
      setEditingId(measurement.id); input.load(measurement);
      props.onScalePointsChange([measurement.firstPx, measurement.secondPx]); props.onPickingScaleChange(true);
    }} />
  </section>;
}
