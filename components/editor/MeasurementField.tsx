"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import {
  formatDisplayLengthInput,
  getDisplayLengthInputError,
  getDisplayUnitMetadata,
  millimetresToScalarDisplay,
  resolveDisplayLengthInput,
} from "@/lib/display-units";
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
  return formatDisplayLengthInput(valueMm, unit);
}

function resolveMeasurementDraft(
  draft: string,
  unit: PlanMeasurementUnit,
  valueMm: number,
  minMm: number | undefined,
  maxMm: number | undefined,
  stepMm: number
) {
  return resolveDisplayLengthInput(draft, unit, {
    referenceMm: valueMm,
    minMm,
    maxMm,
    snapStepMm: stepMm,
    stepBaseMm: minMm,
  });
}

function getScalarAriaValues(
  valueMm: number,
  unit: PlanMeasurementUnit,
  minMm: number | undefined,
  maxMm: number | undefined
) {
  if (unit === "ft-in") return {};
  return {
    value: millimetresToScalarDisplay(valueMm, unit),
    min: minMm === undefined ? undefined : millimetresToScalarDisplay(minMm, unit),
    max: maxMm === undefined ? undefined : millimetresToScalarDisplay(maxMm, unit),
  };
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
  const metadata = getDisplayUnitMetadata(unit);
  const compound = unit === "ft-in";
  const ariaValues = getScalarAriaValues(valueMm, unit, minMm, maxMm);
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

  const resolved = useMemo(
    () => resolveMeasurementDraft(draft, unit, valueMm, minMm, maxMm, stepMm),
    [draft, maxMm, minMm, stepMm, unit, valueMm]
  );
  const error = dirty
    ? getDisplayLengthInputError(resolved, unit, { minMm, maxMm })
    : null;

  const revert = () => {
    setDirty(false);
    setDraft(draftValue(valueMm, unit));
  };
  const commit = (currentDraft = draft) => {
    const currentResolution = resolveMeasurementDraft(
      currentDraft,
      unit,
      valueMm,
      minMm,
      maxMm,
      stepMm
    );
    if (currentResolution.status !== "valid") {
      setDraft(currentDraft);
      setDirty(true);
      return false;
    }
    setDirty(false);
    setDraft(draftValue(currentResolution.valueMm, unit));
    if (!Object.is(currentResolution.valueMm, valueMm)) {
      onCommit(currentResolution.valueMm);
    }
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
      commit(event.currentTarget.value);
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
    const currentResolution = resolveMeasurementDraft(
      event.currentTarget.value,
      unit,
      valueMm,
      minMm,
      maxMm,
      stepMm
    );
    const baseMm =
      currentResolution.status === "valid"
        ? currentResolution.valueMm
        : valueMm;
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
          <span className={dark ? "font-normal text-neutral-400" : "font-normal text-neutral-500"}>{metadata.indicator}</span>
        </label>
      ) : null}
      <span className="relative block">
        <input
          id={inputId}
          data-testid={testId}
          data-model-value-mm={valueMm}
          type="text"
          role={compound ? undefined : "spinbutton"}
          inputMode={compound ? "text" : "decimal"}
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          value={draft}
          aria-label={hideLabel ? label : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={[statusId, hint ? hintId : null].filter(Boolean).join(" ")}
          aria-valuemin={ariaValues.min}
          aria-valuemax={ariaValues.max}
          aria-valuenow={
            !compound && resolved.status === "valid"
              ? millimetresToScalarDisplay(resolved.valueMm, unit)
              : ariaValues.value
          }
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
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <span aria-hidden="true" className={dark ? "pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-[11px] text-neutral-400" : "pointer-events-none absolute inset-y-0 right-2 grid place-items-center text-[11px] text-neutral-500"}>
          {metadata.indicator}
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
