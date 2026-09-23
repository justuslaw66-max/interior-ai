"use client";

import type { ReactNode } from "react";

import type { CabinetModuleOptionGroupId } from "../moduleOptionGroups";
import type { CabinetValidationIssue } from "../types";
import { CabinetNumberField } from "./CabinetNumberField";

export function selectClass() {
  return "h-8 w-full rounded-md border border-neutral-300 bg-white px-2 text-sm text-neutral-900 outline-none focus:border-neutral-900";
}

export function sectionTitle(title: string) {
  return <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</h3>;
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
    <label className="grid gap-1 text-xs font-medium text-neutral-600">
      <span>{label}</span>
      {children}
      {helper ? <span className="text-[10px] font-normal leading-4 text-neutral-400">{helper}</span> : null}
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
