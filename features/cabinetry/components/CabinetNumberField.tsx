"use client";

import {
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  validateCabinetNumberDraft,
  type CabinetNumberConstraints,
} from "../numericInput";
import {
  cabinetMillimetresToDisplay,
  formatCabinetMeasurement,
  getCabinetDisplayDraftStep,
  resolveCabinetDisplayMeasurement,
} from "../measurementUnits";
import type { CabinetValidationIssue } from "../types";
import { useCabinetMeasurementUnit } from "./CabinetMeasurementUnitContext";

export type CabinetNumberFieldExternalIssue = Pick<
  CabinetValidationIssue,
  "severity" | "title" | "message" | "resolution"
>;

export interface CabinetNumberFieldProps extends CabinetNumberConstraints {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  id?: string;
  name?: string;
  testId?: string;
  fieldPath?: string;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
  issues?: readonly CabinetNumberFieldExternalIssue[];
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
  /** Keeps the accessible label in the nearest wrapping Field control. */
  hideLabel?: boolean;
  /** Uses the denser sizing of the professional inspector. */
  compact?: boolean;
  /** Arrow-key increment when it should be coarser than the accepted numeric precision. */
  keyboardStep?: number;
  /** Accepted increment; defaults to `step`. */
  validationStep?: number;
}

function committedDraft(value: number): string {
  return Number.isFinite(value) ? String(value) : "";
}

function issueText(issue: CabinetNumberFieldExternalIssue): string {
  return [issue.title, issue.message, issue.resolution].filter(Boolean).join(" ");
}

function decimalPlaces(value: number): number {
  const source = String(value).toLowerCase();
  if (source.includes("e")) {
    const [coefficient, exponentSource] = source.split("e");
    const exponent = Number(exponentSource);
    const coefficientPlaces = coefficient.split(".")[1]?.length ?? 0;
    return Math.max(0, coefficientPlaces - exponent);
  }
  return source.split(".")[1]?.length ?? 0;
}

function steppedValue(value: number, step: number, direction: 1 | -1): number {
  const places = Math.min(12, Math.max(decimalPlaces(value), decimalPlaces(step)));
  return Number((value + step * direction).toFixed(places));
}

export function CabinetNumberField({
  label,
  value,
  onCommit,
  id,
  name,
  testId,
  fieldPath,
  min,
  max,
  step = 1,
  integer = false,
  unit,
  hint,
  disabled = false,
  disabledReason,
  issues = [],
  className = "",
  inputClassName = "",
  autoFocus = false,
  hideLabel = false,
  compact = false,
  keyboardStep,
  validationStep,
}: CabinetNumberFieldProps) {
  const projectMeasurementUnit = useCabinetMeasurementUnit();
  const convertsMillimetres = unit === "mm" && projectMeasurementUnit !== "mm";
  const displayUnit = convertsMillimetres ? projectMeasurementUnit : unit;
  const toDisplayValue = (modelValue: number) =>
    convertsMillimetres
      ? cabinetMillimetresToDisplay(modelValue, projectMeasurementUnit)
      : modelValue;
  const displayValue = toDisplayValue(value);
  const displayMin = min === undefined ? undefined : toDisplayValue(min);
  const displayMax = max === undefined ? undefined : toDisplayValue(max);
  const displayStep = convertsMillimetres
    ? getCabinetDisplayDraftStep(projectMeasurementUnit)
    : validationStep ?? step;
  const modelKeyboardStep = keyboardStep ?? step;
  const displayKeyboardStep = convertsMillimetres
    ? Math.max(
        getCabinetDisplayDraftStep(projectMeasurementUnit),
        Math.abs(cabinetMillimetresToDisplay(modelKeyboardStep, projectMeasurementUnit))
      )
    : modelKeyboardStep;
  const acceptedModelStep = validationStep ?? step;
  const resolveDisplayValue = (nextDisplayValue: number) =>
    resolveCabinetDisplayMeasurement(nextDisplayValue, projectMeasurementUnit, {
      referenceMm: value,
      minMm: min,
      maxMm: max,
      snapStepMm: acceptedModelStep,
      stepBaseMm: min,
      integer,
    });
  const generatedId = useId();
  const resolvedId = id ?? `cabinet-number-${generatedId.replace(/:/g, "")}`;
  const statusId = `${resolvedId}-status`;
  const hintId = `${resolvedId}-hint`;
  const disabledReasonId = `${resolvedId}-disabled-reason`;
  const [draft, setDraft] = useState(() => committedDraft(displayValue));
  const [dirty, setDirty] = useState(false);
  const [lastExternalValue, setLastExternalValue] = useState(displayValue);

  if (!Object.is(displayValue, lastExternalValue)) {
    setLastExternalValue(displayValue);
    if (!dirty) setDraft(committedDraft(displayValue));
  }

  const validation = useMemo(
    () =>
      validateCabinetNumberDraft(draft, {
        min: displayMin,
        max: displayMax,
        step: displayStep,
        integer: convertsMillimetres ? false : integer,
        unit: displayUnit,
      }),
    [convertsMillimetres, displayMax, displayMin, displayStep, displayUnit, draft, integer]
  );
  const modelResolution =
    convertsMillimetres && validation.status === "valid"
      ? resolveDisplayValue(validation.value)
      : null;
  const modelIssueMessage =
    modelResolution?.status === "invalid"
      ? modelResolution.code === "below_minimum" && Number.isFinite(min)
        ? `Enter ${formatCabinetMeasurement(min!, projectMeasurementUnit, { includeMillimetreReference: true })} or more.`
        : modelResolution.code === "above_maximum" && Number.isFinite(max)
          ? `Enter ${formatCabinetMeasurement(max!, projectMeasurementUnit, { includeMillimetreReference: true })} or less.`
          : modelResolution.code === "integer_required"
            ? "Enter a value that resolves to a whole millimetre."
            : modelResolution.code === "step_mismatch" && Number.isFinite(acceptedModelStep)
              ? `Use increments of ${formatCabinetMeasurement(acceptedModelStep, projectMeasurementUnit, { includeMillimetreReference: true })} starting at ${formatCabinetMeasurement(Number.isFinite(min) ? min! : 0, projectMeasurementUnit, { includeMillimetreReference: true })}.`
              : "Enter a finite value within the supported range."
      : null;
  const externalIssue =
    issues.find((issue) => issue.severity === "error") ?? issues[0] ?? null;
  const internalMessage = dirty
    ? validation.status !== "valid"
      ? validation.message
      : modelIssueMessage
    : null;
  const message = internalMessage ?? (externalIssue ? issueText(externalIssue) : null);
  const severity = internalMessage ? "error" : externalIssue?.severity;
  const invalid = Boolean(internalMessage || externalIssue?.severity === "error");
  const describedBy = [
    statusId,
    hint ? hintId : null,
    disabled && disabledReason ? disabledReasonId : null,
  ]
    .filter(Boolean)
    .join(" ");
  const draftIsAccepted =
    validation.status === "valid" && modelResolution?.status !== "invalid";
  const draftState =
    validation.status !== "valid"
      ? validation.status
      : modelResolution?.status === "invalid"
        ? "invalid"
        : "valid";
  const draftIssueCode =
    validation.status !== "valid"
      ? validation.code
      : modelResolution?.status === "invalid"
        ? modelResolution.code
        : undefined;
  const ariaValue =
    draftIsAccepted && validation.status === "valid"
      ? validation.value
      : Number.isFinite(displayValue)
        ? displayValue
        : undefined;

  const setAuthoredDraft = (nextDraft: string) => {
    setDirty(true);
    setDraft(nextDraft);
  };

  const revert = () => {
    setDirty(false);
    setDraft(committedDraft(displayValue));
  };

  const commit = () => {
    const result = validateCabinetNumberDraft(draft, {
      min: displayMin,
      max: displayMax,
      step: displayStep,
      integer: convertsMillimetres ? false : integer,
      unit: displayUnit,
    });
    if (result.status !== "valid") {
      setDirty(true);
      return false;
    }

    const resolvedModelValue = convertsMillimetres
      ? resolveDisplayValue(result.value)
      : { status: "valid" as const, valueMm: result.value };
    if (resolvedModelValue.status !== "valid") {
      setDirty(true);
      return false;
    }
    setDirty(false);
    setDraft(result.normalizedDraft);
    const modelValue = resolvedModelValue.valueMm;
    if (!Object.is(modelValue, value)) onCommit(modelValue);
    return true;
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
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
    if (convertsMillimetres) {
      const baseMm = modelResolution?.status === "valid" ? modelResolution.valueMm : value;
      const effectiveModelStep =
        Number.isFinite(modelKeyboardStep) && modelKeyboardStep > 0 ? modelKeyboardStep : 1;
      if (!Number.isFinite(baseMm)) return;
      let nextValueMm = steppedValue(
        baseMm,
        effectiveModelStep,
        event.key === "ArrowUp" ? 1 : -1
      );
      if (Number.isFinite(min)) nextValueMm = Math.max(min!, nextValueMm);
      if (Number.isFinite(max)) nextValueMm = Math.min(max!, nextValueMm);
      setAuthoredDraft(String(toDisplayValue(nextValueMm)));
      return;
    }

    const effectiveStep =
      Number.isFinite(displayKeyboardStep) && displayKeyboardStep > 0
        ? displayKeyboardStep
        : 1;
    const base = validation.status === "valid" ? validation.value : displayValue;
    if (!Number.isFinite(base)) return;
    let nextValue = steppedValue(base, effectiveStep, event.key === "ArrowUp" ? 1 : -1);
    if (Number.isFinite(displayMin)) nextValue = Math.max(displayMin!, nextValue);
    if (Number.isFinite(displayMax)) nextValue = Math.min(displayMax!, nextValue);
    setAuthoredDraft(String(nextValue));
  };

  const messageTone =
    severity === "error"
      ? "text-red-700"
      : severity === "warning"
        ? "text-amber-700"
        : "text-blue-700";
  const Wrapper = hideLabel ? "span" : "div";

  return (
    <Wrapper
      className={`grid gap-1.5 ${className}`.trim()}
      data-draft-state={draftState}
    >
      {!hideLabel ? (
        <label htmlFor={resolvedId} className="flex items-baseline justify-between gap-2 text-xs font-medium text-neutral-700">
          <span>{label}</span>
          {displayUnit ? <span className="shrink-0 font-normal text-neutral-500">{displayUnit}</span> : null}
        </label>
      ) : null}
      <span className="relative block">
        <input
          id={resolvedId}
          name={name}
          data-testid={testId}
          data-validation-field={fieldPath}
          data-model-value-mm={unit === "mm" ? value : undefined}
          data-display-step={displayStep}
          data-keyboard-step={displayKeyboardStep}
          data-draft-issue={draftIssueCode}
          type="text"
          role="spinbutton"
          inputMode={
            integer && !convertsMillimetres && (min === undefined || min >= 0)
              ? "numeric"
              : "decimal"
          }
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          disabled={disabled}
          value={draft}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          aria-valuemin={Number.isFinite(displayMin) ? displayMin : undefined}
          aria-valuemax={Number.isFinite(displayMax) ? displayMax : undefined}
          aria-valuenow={ariaValue}
          aria-valuetext={
            draftIsAccepted && validation.status === "valid"
              ? `${validation.value}${displayUnit ? ` ${displayUnit}` : ""}`
              : `Last valid value ${Number.isFinite(displayValue) ? displayValue : "unavailable"}${
                  displayUnit ? ` ${displayUnit}` : ""
                }`
          }
          className={`${compact ? "h-8 rounded-md px-2" : "h-10 rounded-lg px-3"} w-full border bg-white text-sm text-neutral-950 outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 ${
            invalid
              ? "border-red-400 focus-visible:border-red-600 focus-visible:ring-red-600/20"
              : "border-neutral-300 focus-visible:border-blue-600 focus-visible:ring-blue-600/20"
          } ${displayUnit ? "pr-14" : ""} ${inputClassName}`.trim()}
          onChange={(event) => setAuthoredDraft(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={handleKeyDown}
        />
        {displayUnit ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-xs font-medium text-neutral-500"
          >
            {displayUnit}
          </span>
        ) : null}
      </span>
      <span
        id={statusId}
        role={message ? (severity === "error" ? "alert" : "status") : undefined}
        aria-live={severity === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        className={`${message ? "block" : "sr-only"} text-xs leading-4 ${messageTone}`}
      >
        {message ?? ""}
      </span>
      {hint ? (
        <span id={hintId} className="text-xs leading-4 text-neutral-500">
          {hint}
        </span>
      ) : null}
      {disabled && disabledReason ? (
        <span id={disabledReasonId} className="text-xs leading-4 text-neutral-500">
          {disabledReason}
        </span>
      ) : null}
    </Wrapper>
  );
}
