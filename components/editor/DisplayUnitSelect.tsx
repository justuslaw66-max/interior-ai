"use client";

import { ChevronDown } from "lucide-react";
import { useId } from "react";

import {
  DISPLAY_UNIT_GROUPS,
  DISPLAY_UNIT_METADATA,
  isDisplayUnit,
  type DisplayUnit,
} from "@/lib/display-units";

export type DisplayUnitSelectProps = {
  value: DisplayUnit;
  onChange: (unit: DisplayUnit) => void;
  dark?: boolean;
  disabled?: boolean;
  testId?: string;
  className?: string;
};

export function DisplayUnitSelect({
  value,
  onChange,
  dark = false,
  disabled = false,
  testId,
  className = "",
}: DisplayUnitSelectProps) {
  const generatedId = useId();
  const selectId = `display-units-${generatedId.replace(/:/g, "")}`;

  return (
    <label
      htmlFor={selectId}
      className={`grid gap-1 text-xs font-semibold ${
        dark ? "text-neutral-200" : "text-neutral-700"
      } ${className}`.trim()}
    >
      <span>Display units</span>
      <span className="relative block">
        <select
          id={selectId}
          data-testid={testId}
          value={value}
          disabled={disabled}
          className={`min-h-11 w-full appearance-none rounded-lg border px-3 pr-9 text-sm font-medium outline-none transition focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            dark
              ? "designer-control text-neutral-100 focus-visible:border-blue-300 focus-visible:ring-blue-300/20"
              : "border-neutral-200 bg-white text-neutral-900 focus-visible:border-blue-600 focus-visible:ring-blue-600/20"
          }`}
          onChange={(event) => {
            const nextUnit = event.currentTarget.value;
            if (isDisplayUnit(nextUnit)) onChange(nextUnit);
          }}
        >
          {DISPLAY_UNIT_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.units.map((unit) => (
                <option key={unit} value={unit}>
                  {DISPLAY_UNIT_METADATA[unit].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className={`pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 ${
            dark ? "text-neutral-400" : "text-neutral-500"
          }`}
        />
      </span>
    </label>
  );
}
