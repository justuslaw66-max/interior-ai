"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { describeCabinetFinishChoice, findCabinetFinishMaterial } from "../catalog/finishes";
import { findCabinetLaminate } from "../catalog/laminates";
import type { CabinetMaterialRef } from "../types";
import { CabinetFinishPicker, CabinetFinishSwatch } from "./CabinetFinishPicker";

/** The chosen finish: a swatch, its name and one line on it. */
export function CabinetFinishSummary({
  materialId,
  materials,
  label,
  large = false,
  testId,
}: {
  materialId: string | undefined;
  materials: readonly CabinetMaterialRef[];
  label: string;
  large?: boolean;
  testId?: string;
}) {
  const choice = describeCabinetFinishChoice(materialId, materials);
  const swatch = findCabinetLaminate(materialId ?? "") ?? findCabinetFinishMaterial(materialId, materials) ?? {};
  return (
    <span data-testid={testId} className="flex min-w-0 flex-1 items-center gap-3">
      <CabinetFinishSwatch material={swatch} className={large ? "h-24 w-12" : "h-14 w-7"} />
      <span className="grid min-w-0 gap-0.5">
        <span className="text-xs font-semibold text-neutral-500">{label}</span>
        <span className={`${large ? "text-[15px]" : "text-sm"} font-semibold text-neutral-900`}>{choice.title}</span>
        {choice.detail ? (
          <span className={`text-xs leading-4 ${choice.placeholder ? "text-amber-700" : "text-neutral-600"}`}>
            {choice.detail}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** One finish choice in the Detailed editor: the chosen finish, and "Change" opens the picker. */
export function CabinetFinishField({
  label,
  value,
  materials,
  onChange,
  testId,
  disabled = false,
}: {
  label: string;
  value: string | undefined;
  materials: readonly CabinetMaterialRef[];
  onChange: (materialId: string) => void;
  testId: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    // Focusable so the property search and validation links can bring a finish choice into view.
    <div data-testid={testId} data-value={value ?? ""} role="group" aria-label={label} tabIndex={-1} className="grid gap-2">
      <div className="flex items-center gap-3">
        <CabinetFinishSummary materialId={value} materials={materials} label={label} />
        <Button
          data-testid={`${testId}-change`}
          size="compact"
          className="shrink-0"
          aria-expanded={open}
          aria-label={`${open ? "Done choosing" : "Change"} ${label}`}
          disabled={disabled && !open}
          onClick={() => setOpen((current) => !current)}
        >
          {open ? "Done" : "Change"}
        </Button>
      </div>
      {open ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
          <CabinetFinishPicker value={value} onChange={onChange} testIdPrefix={`${testId}-picker`} disabled={disabled} compact />
        </div>
      ) : null}
    </div>
  );
}
