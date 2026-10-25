"use client";

import type { CSSProperties } from "react";
import { Button } from "@/components/ui/Button";

export type SurfacePickerOption = {
  materialId: string;
  name: string;
  metadata: string;
  swatchStyle: CSSProperties;
  selected: boolean;
  disabled: boolean;
  showGovernance: boolean;
  draft: boolean;
  publishStatus: string;
  blockerCount: number;
};

export type SurfacePickerState = {
  title: string;
  options: SurfacePickerOption[];
  emptyMessage: string;
};

function PickerOption({ option, onSelect }: { option: SurfacePickerOption; onSelect: () => void }) {
  return (
    <button
      type="button"
      data-testid={`selection-inspector-floor-material-${option.materialId}`}
      aria-pressed={option.selected}
      className={
        option.selected
          ? "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-emerald-300 bg-success-tint p-2 text-left"
          : "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-separator bg-surface-floating p-2 text-left hover:bg-control-secondary-hover"
      }
      disabled={option.disabled}
      onClick={onSelect}
    >
      <span aria-hidden="true" className="h-10 w-10 rounded-md border border-swatch-edge" style={option.swatchStyle} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-label">{option.name}</span>
        <span className="block truncate text-xs text-label-secondary">{option.metadata}</span>
        {option.showGovernance ? (
          <span className="mt-1 flex flex-wrap gap-1">
            <span
              className={
                option.draft
                  ? "rounded-full bg-warning-tint px-1.5 py-0.5 text-xs font-semibold text-on-warning-tint"
                  : "rounded-full bg-success-tint px-1.5 py-0.5 text-xs font-semibold text-on-success-tint"
              }
            >
              {option.publishStatus}
            </span>
            {option.blockerCount > 0 ? (
              <span className="rounded-full bg-warning-tint px-1.5 py-0.5 text-xs font-semibold text-on-warning-tint">
                {option.blockerCount} blockers
              </span>
            ) : null}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * The surface's material list inside the inspector (UX audit ED5, phase 4f): pick one to apply it,
 * or Close to go back. Extracted from `SelectedSurfaceInspector`, which can't grow.
 */
export function SurfaceMaterialPicker({ picker, onClose, onSelect }: {
  picker: SurfacePickerState;
  onClose: () => void;
  onSelect: (materialId: string) => void;
}) {
  return (
    <div data-testid="selection-inspector-floor-picker" className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-separator bg-surface-floating p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-label">{picker.title}</div>
        <Button
          data-testid="selection-inspector-floor-picker-close"
          variant="secondary" size="compact"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
      {picker.options.length ? (
        <div className="mt-2 grid gap-2">
          {picker.options.map((option) => (
            <PickerOption key={option.materialId} option={option} onSelect={() => onSelect(option.materialId)} />
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-separator p-2 text-xs text-label-secondary">{picker.emptyMessage}</div>
      )}
    </div>
  );
}
