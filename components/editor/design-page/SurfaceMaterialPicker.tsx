"use client";

import type { CSSProperties } from "react";

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
          ? "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-left"
          : "grid grid-cols-[2.5rem_1fr] gap-2 rounded-lg border border-neutral-200 bg-white p-2 text-left hover:bg-neutral-50"
      }
      disabled={option.disabled}
      onClick={onSelect}
    >
      <span aria-hidden="true" className="h-10 w-10 rounded-md border border-black/10" style={option.swatchStyle} />
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-neutral-900">{option.name}</span>
        <span className="block truncate text-xs text-neutral-600">{option.metadata}</span>
        {option.showGovernance ? (
          <span className="mt-1 flex flex-wrap gap-1">
            <span
              className={
                option.draft
                  ? "rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800"
                  : "rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700"
              }
            >
              {option.publishStatus}
            </span>
            {option.blockerCount > 0 ? (
              <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-xs font-semibold text-orange-700">
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
    <div data-testid="selection-inspector-floor-picker" className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold text-neutral-900">{picker.title}</div>
        <button
          type="button"
          data-testid="selection-inspector-floor-picker-close"
          className="rounded-md border border-neutral-200 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          onClick={onClose}
        >
          Close
        </button>
      </div>
      {picker.options.length ? (
        <div className="mt-2 grid gap-2">
          {picker.options.map((option) => (
            <PickerOption key={option.materialId} option={option} onSelect={() => onSelect(option.materialId)} />
          ))}
        </div>
      ) : (
        <div className="mt-2 rounded-lg border border-neutral-200 p-2 text-xs text-neutral-600">{picker.emptyMessage}</div>
      )}
    </div>
  );
}
