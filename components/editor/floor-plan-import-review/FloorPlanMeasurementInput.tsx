"use client";

import { useId, useState } from "react";
import { DISPLAY_UNIT_METADATA, formatDisplayLengthInput, parseDisplayLength, type DisplayUnit } from "@/lib/display-units";
import type { FloorPlanSourceMeasurementV2 } from "@/lib/floor-plan-document-v2";

export function useReviewMeasurementInput(initial?: FloorPlanSourceMeasurementV2) {
  const [unit, setUnit] = useState<DisplayUnit>(initial?.inputUnit ?? "mm");
  const [text, setText] = useState(() => formatDisplayLengthInput(initial?.confirmedLengthMm ?? 3000, initial?.inputUnit ?? "mm"));
  const [valueMm, setValueMm] = useState<number | null>(initial?.confirmedLengthMm ?? 3000);
  const [sourceQuality, setSourceQuality] = useState<"clean" | "scan">(initial?.sourceQuality ?? "clean");
  const load = (measurement: FloorPlanSourceMeasurementV2) => {
    setUnit(measurement.inputUnit); setValueMm(measurement.confirmedLengthMm);
    setText(formatDisplayLengthInput(measurement.confirmedLengthMm, measurement.inputUnit));
    setSourceQuality(measurement.sourceQuality);
  };
  const changeUnit = (next: DisplayUnit) => {
    setUnit(next);
    if (valueMm !== null) setText(formatDisplayLengthInput(valueMm, next));
  };
  const changeText = (next: string) => {
    setText(next);
    const parsed = parseDisplayLength(next, unit);
    setValueMm(parsed.status === "valid" ? parsed.valueMm : null);
  };
  return { unit, text, valueMm, confirmedMm: valueMm === null ? NaN : Math.round(valueMm),
    changeUnit, changeText, sourceQuality, setSourceQuality, load };
}

export default function FloorPlanMeasurementInput({ input, disabled, control }: {
  input: ReturnType<typeof useReviewMeasurementInput>; disabled: boolean; control: string;
}) {
  const unitLabelId = useId(), qualityLabelId = useId();
  return <div className="grid gap-2">
    <label className="text-xs"><span id={unitLabelId}>Units</span>
      <select className={`${control} ml-2`} value={input.unit} disabled={disabled} aria-labelledby={unitLabelId}
        onChange={(event) => input.changeUnit(event.target.value as DisplayUnit)}>
        {Object.values(DISPLAY_UNIT_METADATA).map(({ unit, label }) => <option key={unit} value={unit}>{label}</option>)}
      </select>
    </label>
    <label className="text-xs">Printed measurement
      <input className={`${control} mt-1 w-full`} type="text" value={input.text} disabled={disabled}
        onChange={(event) => input.changeText(event.target.value)} />
    </label>
    <p className="text-xs" aria-live="polite">{Number.isFinite(input.confirmedMm)
      ? `Will store ${input.confirmedMm} mm${input.confirmedMm !== input.valueMm ? " (rounded to the nearest millimetre)" : ""}. Changing units keeps the measurement unchanged.`
      : "Enter a valid length in the selected unit."}</p>
    <label className="text-xs"><span id={qualityLabelId}>Source quality</span>
      <select className={`${control} ml-2`} value={input.sourceQuality} disabled={disabled} aria-labelledby={qualityLabelId}
        onChange={(event) => input.setSourceQuality(event.target.value === "scan" ? "scan" : "clean")}>
        <option value="clean">Clean drawing</option><option value="scan">Scanned image</option>
      </select>
    </label>
  </div>;
}
