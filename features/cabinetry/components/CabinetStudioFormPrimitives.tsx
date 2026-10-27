"use client";

import type { ReactNode } from "react";

import type { CabinetModuleOptionGroupId } from "../moduleOptionGroups";
import type { CabinetValidationIssue } from "../types";
import { CabinetNumberField } from "./CabinetNumberField";

export function selectClass() {
  return "h-8 w-full rounded-md border border-control-secondary-border bg-field px-2 text-sm text-label focus:border-control-primary";
}

export function sectionTitle(title: string) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-label-secondary">{title}</h3>;
}

export function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: ReactNode;
}) {
  return (
    <label className="grid gap-1 text-xs font-medium text-label-secondary">
      <span>{label}</span>
      {children}
      {helper ? <span className="text-xs font-normal leading-4 text-label-secondary">{helper}</span> : null}
    </label>
  );
}

export function CabinetModuleOptionGroup({
  id,
  visible,
  children,
}: {
  id: CabinetModuleOptionGroupId;
  visible: boolean;
  children: ReactNode;
}) {
  if (!visible) return null;
  return (
    <div
      className="contents"
      data-testid={`cabinet-module-option-group-${id.replace(/_/g, "-")}`}
    >
      {children}
    </div>
  );
}

export function GuidedNumberField({
  label,
  value,
  min,
  max,
  step = 10,
  suffix,
  testId,
  fieldPath,
  issues = [],
  disabled = false,
  disabledReason,
  integer = false,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step?: number;
  suffix?: string;
  testId: string;
  fieldPath?: string;
  issues?: CabinetValidationIssue[];
  disabled?: boolean;
  disabledReason?: string;
  integer?: boolean;
  onCommit: (value: number) => void;
}) {
  return (
    <CabinetNumberField
      label={label}
      value={value}
      min={min}
      max={max}
      step={suffix === "mm" ? 1 : step}
      keyboardStep={step}
      integer={integer}
      unit={suffix}
      testId={testId}
      fieldPath={fieldPath}
      issues={issues}
      disabled={disabled}
      disabledReason={disabledReason}
      inputClassName="h-11 rounded-xl text-base"
      onCommit={onCommit}
    />
  );
}
