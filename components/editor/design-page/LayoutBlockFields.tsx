"use client";

import { useId, useState } from "react";
import { DisplayUnitSelect } from "@/components/editor/DisplayUnitSelect";
import MeasurementField from "@/components/editor/MeasurementField";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { LAYOUT_BLOCK_LIMITS_MM, type LayoutBlockPatch } from "@/lib/layout-blocks";

export type LayoutBlockFieldsProps = {
  name: string;
  sizeMm: { w: number; d: number; h: number };
  unit: PlanMeasurementUnit;
  disabled: boolean;
  onUpdate: (patch: LayoutBlockPatch) => void;
  /** The design's unit, the same setting as Plan's Units (J, 13 Nov 2026). */
  onUnitChange: (unit: PlanMeasurementUnit) => void;
};

const AXES = [
  { key: "w", label: "Width", min: LAYOUT_BLOCK_LIMITS_MM.minPlan, max: LAYOUT_BLOCK_LIMITS_MM.maxPlan },
  { key: "d", label: "Depth", min: LAYOUT_BLOCK_LIMITS_MM.minPlan, max: LAYOUT_BLOCK_LIMITS_MM.maxPlan },
  { key: "h", label: "Height", min: LAYOUT_BLOCK_LIMITS_MM.minHeight, max: LAYOUT_BLOCK_LIMITS_MM.maxHeight },
] as const;

/**
 * A layout block's own name and size: it isn't a product, so both are the person's to set.
 * Keyed by the block and its name, so an undone rename shows the name it went back to.
 */
export function LayoutBlockFields({ name, sizeMm, unit, disabled, onUpdate, onUnitChange }: LayoutBlockFieldsProps) {
  const nameId = useId();
  const [draftName, setDraftName] = useState(name);
  const commitName = () => {
    if (draftName.trim() && draftName.trim() !== name) onUpdate({ name: draftName });
    else setDraftName(name);
  };
  return (
    <div className="flex flex-col gap-2" data-testid="layout-block-fields">
      <label htmlFor={nameId} className="text-[13px] font-bold text-label">Name</label>
      <input
        id={nameId}
        data-testid="layout-block-name"
        className="min-h-10 rounded-lg border border-control-secondary-border bg-field px-2 text-[13px] text-label md:min-h-8"
        value={draftName}
        maxLength={80}
        disabled={disabled}
        onChange={(event) => setDraftName(event.currentTarget.value)}
        onBlur={commitName}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
      />
      {/* Units are the design's display setting, not the block's, so a lock doesn't grey them out (14 Nov 2026). */}
      <DisplayUnitSelect value={unit} testId="layout-block-units" onChange={onUnitChange} />
      {AXES.map((axis) => (
        <MeasurementField
          key={axis.key}
          label={axis.label}
          valueMm={sizeMm[axis.key]}
          minMm={axis.min}
          maxMm={axis.max}
          unit={unit}
          stepMm={1}
          keyboardStepMm={50}
          disabled={disabled}
          compact
          touchFriendly
          testId={`layout-block-${axis.key}`}
          onCommit={(valueMm) => onUpdate({ sizeMm: { ...sizeMm, [axis.key]: valueMm } })}
        />
      ))}
    </div>
  );
}
