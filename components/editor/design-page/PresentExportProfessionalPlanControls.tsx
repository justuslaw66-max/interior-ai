"use client";

import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import {
  PLAN_LAYER_PRESETS,
  type PlanLayerPresetId,
} from "@/lib/design-page-types";
import type {
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";

export type PresentExportProfessionalPlanControlsProps = {
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
  ["openings", "Doors & windows"],
  ["builtIns", "Built-ins"],
  ["zones", "Zones"],
  ["annotations", "Notes"],
];

const PRESET_OPTIONS = (["presentation", "technical", "staging"] as const).map((value) => ({
  value,
  label: PLAN_LAYER_PRESETS[value].label,
}));
const THEME_OPTIONS = [
  { value: "consumer", label: "Consumer theme" },
  { value: "pro", label: "Pro theme" },
] as const;

export default function PresentExportProfessionalPlanControls({
  preset,
  layers,
  theme,
  onPresetChange,
  onThemeChange,
  onToggleLayer,
}: PresentExportProfessionalPlanControlsProps) {
  return (
    <div className="space-y-2" data-testid="professional-plan-controls">
      <div className="rounded-lg border border-gray-200/70 p-2">
        <div className="mb-2 text-xs text-gray-500">
          Layer presets
        </div>
        <SegmentedControl label="Layer presets" size="compact" fill value={preset} onChange={onPresetChange} options={PRESET_OPTIONS} />
      </div>

      <SegmentedControl label="Plan theme" size="compact" fill value={theme} onChange={onThemeChange} options={THEME_OPTIONS} />

      <div role="group" aria-label="Visible plan layers" className="grid grid-cols-2 gap-2">
        {LAYERS.map(([key, label]) => (
          <Button key={key} size="compact" pressed={layers[key]} onClick={() => onToggleLayer(key)}>
            {label}
          </Button>
        ))}
      </div>
    </div>
  );
}
