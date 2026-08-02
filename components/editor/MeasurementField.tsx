"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";

import {
  cabinetMillimetresToDisplay,
  getCabinetDisplayDraftStep,
  resolveCabinetDisplayMeasurement,
} from "@/features/cabinetry/measurementUnits";
import { validateCabinetNumberDraft } from "@/features/cabinetry/numericInput";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";

type MeasurementFieldProps = {
  label: string;
  valueMm: number;
  unit: PlanMeasurementUnit;
  onCommit: (valueMm: number) => void;
  minMm?: number;
  maxMm?: number;
  stepMm?: number;
  keyboardStepMm?: number;
  disabled?: boolean;
  dark?: boolean;
  compact?: boolean;
  touchFriendly?: boolean;
  hideLabel?: boolean;
  hint?: string;
  testId?: string;
  className?: string;
  inputClassName?: string;
};

function draftValue(valueMm: number, unit: PlanMeasurementUnit): string {
  const value = cabinetMillimetresToDisplay(valueMm, unit);
  return Number.isFinite(value) ? String(value) : "";
}

export default function MeasurementField({
  label,
  valueMm,
  unit,
  onCommit,
  minMm,
  maxMm,
  stepMm = 1,
  keyboardStepMm = stepMm,
  disabled = false,
  dark = false,
  compact = false,
  touchFriendly = false,
  hideLabel = false,
  hint,
  testId,
  className = "",
  inputClassName = "",
}: MeasurementFieldProps) {
  const generatedId = useId();
  const inputId = `measurement-${generatedId.replace(/:/g, "")}`;
  const statusId = `${inputId}-status`;
  const hintId = `${inputId}-hint`;
  const displayValue = cabinetMillimetresToDisplay(valueMm, unit);
  const displayMin = minMm === undefined ? undefined : cabinetMillimetresToDisplay(minMm, unit);
  const displayMax = maxMm === undefined ? undefined : cabinetMillimetresToDisplay(maxMm, unit);
  const displayStep = getCabinetDisplayDraftStep(unit);
  const [draft, setDraft] = useState(() => draftValue(valueMm, unit));
  const [dirty, setDirty] = useState(false);
  const [controlledMeasurement, setControlledMeasurement] = useState(() => ({
    unit,
    valueMm,
  }));

  if (
    controlledMeasurement.unit !== unit ||
    !Object.is(controlledMeasurement.valueMm, valueMm)
  ) {
    setControlledMeasurement({ unit, valueMm });
    setDirty(false);
    setDraft(draftValue(valueMm, unit));
  }

  const validation = useMemo(
    () =>
      validateCabinetNumberDraft(draft, {
        min: displayMin,
        max: displayMax,
        step: displayStep,
        unit,
      }),
    [displayMax, displayMin, displayStep, draft, unit]
  );
  const resolved =
    validation.status === "valid"
      ? resolveCabinetDisplayMeasurement(validation.value, unit, {
          referenceMm: valueMm,
          minMm,
          maxMm,
          snapStepMm: stepMm,
          stepBaseMm: minMm,
        })
      : null;
  const error = dirty
    ? validation.status !== "valid"
      ? validation.message
      : resolved?.status === "invalid"
        ? resolved.code === "below_minimum"
          ? `Enter at least ${draftValue(minMm ?? 0, unit)} ${unit}.`
          : resolved.code === "above_maximum"
            ? `Enter no more than ${draftValue(maxMm ?? 0, unit)} ${unit}.`
            : `Use a valid ${unit} increment.`
        : null
    : null;

  const revert = () => {
    setDirty(false);
    setDraft(draftValue(valueMm, unit));
  };
  const commit = () => {
    if (validation.status !== "valid" || resolved?.status !== "valid") {
      setDirty(true);
      return false;
    }
    setDirty(false);
    setDraft(draftValue(resolved.valueMm, unit));
    if (!Object.is(resolved.valueMm, valueMm)) onCommit(resolved.valueMm);
    return true;
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      revert();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
      return;
    }
    if (
      disabled ||
      (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    ) {
      return;
    }

    event.preventDefault();
    const baseMm = resolved?.status === "valid" ? resolved.valueMm : valueMm;
    const direction = event.key === "ArrowUp" ? 1 : -1;
    let nextMm = baseMm + keyboardStepMm * direction;
    if (minMm !== undefined) nextMm = Math.max(minMm, nextMm);
    if (maxMm !== undefined) nextMm = Math.min(maxMm, nextMm);
    setDirty(true);
    setDraft(draftValue(nextMm, unit));
  };

  return (
    <div className={`grid gap-1 ${className}`.trim()} data-draft-state={error ? "invalid" : dirty ? "dirty" : "clean"}>
      {!hideLabel ? (
        <label
          htmlFor={inputId}
          className={dark ? "flex items-center justify-between text-[11px] font-semibold text-neutral-300" : "flex items-center justify-between text-[11px] font-semibold text-neutral-600"}
        >
          <span>{label}</span>
          <span className={dark ? "font-normal text-neutral-400" : "font-normal text-neutral-500"}>{unit}</span>
        </label>
      ) : null}
      <span className="relative block">
        <input
          id={inputId}
          data-testid={testId}
          data-model-value-mm={valueMm}
          type="text"
          role="spinbutton"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={draft}
          aria-label={hideLabel ? label : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={[statusId, hint ? hintId : null].filter(Boolean).join(" ")}
          aria-valuemin={displayMin}
          aria-valuemax={displayMax}
          aria-valuenow={validation.status === "valid" ? validation.value : displayValue}
          className={`${touchFriendly ? "min-h-11 rounded-md px-2" : compact ? "h-9 rounded-md px-2" : "h-10 rounded-lg px-3"} w-full border pr-11 text-sm font-semibold outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            dark
              ? error
                ? "border-red-400 bg-[#10131a] text-red-100 focus-visible:ring-red-400/20"
                : "designer-control border text-neutral-100 focus-visible:border-blue-300 focus-visible:ring-blue-300/20"
              : error
                ? "border-red-400 bg-white text-red-900 focus-visible:ring-red-500/20"
                : "border-neutral-200 bg-white text-neutral-900 focus-visible:border-blue-600 focus-visible:ring-blue-600/20"
          } ${inputClassName}`.trim()}
          onChange={(event) => {
            setDirty(true);
            setDraft(event.currentTarget.value);
          }}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        <span aria-hidden="true" className={dark ? "pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-[11px] text-neutral-400" : "pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-[11px] text-neutral-500"}>
          {unit}
        </span>
      </span>
      <span id={statusId} role={error ? "alert" : undefined} className={error ? "text-[10px] leading-4 text-red-600" : "sr-only"}>
        {error ?? ""}
      </span>
      {hint ? (
        <span id={hintId} className={dark ? "text-[10px] text-neutral-400" : "text-[10px] text-neutral-500"}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
