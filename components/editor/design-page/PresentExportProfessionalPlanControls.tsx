"use client";

import {
  PLAN_LAYER_PRESETS,
  type PlanLayerPresetId,
} from "@/lib/design-page-types";
import type {
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";

export type PresentExportProfessionalPlanControlsProps = {
  dark: boolean;
  preset: PlanLayerPresetId;
  layers: PlanLayers;
  theme: PlanTheme;
  onPresetChange: (preset: PlanLayerPresetId) => void;
  onThemeChange: (theme: PlanTheme) => void;
  onToggleLayer: (layer: keyof PlanLayers) => void;
};

const LAYERS: ReadonlyArray<[keyof PlanLayers, string]> = [
  ["grid", "Grid"],
  ["dimensions", "Dimensions"],
  ["labels", "Labels"],
  ["openings", "Doors/windows"],
  ["builtIns", "Built-ins"],
  ["zones", "Zones"],
  ["annotations", "Notes"],
];

export default function PresentExportProfessionalPlanControls({
  dark,
  preset,
  layers,
  theme,
  onPresetChange,
  onThemeChange,
  onToggleLayer,
}: PresentExportProfessionalPlanControlsProps) {
  const controlClass = (active: boolean, compact = false) =>
    active
      ? `min-h-11 rounded-lg bg-teal-600 ${compact ? "px-2" : "px-3"} py-2 text-xs font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2`
      : dark
        ? `designer-control min-h-11 rounded-lg border ${compact ? "px-2" : "px-3"} py-2 text-xs text-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2`
        : `min-h-11 rounded-lg bg-gray-100 ${compact ? "px-2" : "px-3"} py-2 text-xs outline-none hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2`;

  return (
    <div className="space-y-2" data-testid="professional-plan-controls">
      <div className="rounded-lg border border-gray-200/70 p-2">
        <div className={dark ? "mb-2 text-[11px] text-neutral-400" : "mb-2 text-[11px] text-gray-500"}>
          Layer presets
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(["presentation", "technical", "staging"] as const).map(
            (option) => (
              <button
                key={option}
                type="button"
                aria-pressed={preset === option}
                className={controlClass(preset === option, true)}
                onClick={() => onPresetChange(option)}
              >
                {PLAN_LAYER_PRESETS[option].label}
              </button>
            )
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2" aria-label="Plan theme">
        {(["consumer", "pro"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={theme === option}
            className={controlClass(theme === option)}
            onClick={() => onThemeChange(option)}
          >
            {option === "consumer" ? "Consumer theme" : "Pro theme"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2" aria-label="Visible plan layers">
        {LAYERS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={layers[key]}
            className={controlClass(layers[key])}
            onClick={() => onToggleLayer(key)}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
