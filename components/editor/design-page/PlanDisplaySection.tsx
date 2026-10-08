"use client";

import dynamic from "next/dynamic";
import { DisplayUnitSelect } from "@/components/editor/DisplayUnitSelect";
import { Button } from "@/components/ui/Button";
import type { PresentationTools } from "@/lib/design-page-presentation-tools";

const PresentExportProfessionalPlanControls = dynamic(
  () => import("@/components/editor/design-page/PresentExportProfessionalPlanControls"),
  {
    ssr: false,
    loading: () => (
      <div role="status" aria-live="polite" className="rounded-lg border border-neutral-200 p-3 text-xs text-neutral-600">
        Loading detailed options…
      </div>
    ),
  }
);

type DialogState = PresentationTools["state"];
type DialogActions = PresentationTools["actions"];

export type PlanDisplaySectionProps = {
  state: Pick<
    DialogState,
    | "simplePlanControls" | "planLayerPreset" | "planLayers" | "planTheme" | "planMeasurementUnit"
    | "annotationToolKind" | "selectedPlanOverlayId" | "exportStylePreset"
  >;
  actions: Pick<
    DialogActions,
    | "onEnableSimplePlanControls" | "onEnableProPlanControls" | "onPlanLayerPresetChange" | "onPlanThemeChange"
    | "onTogglePlanLayer" | "onMeasurementUnitChange" | "onSelectAnnotationTool" | "onAddOpening" | "onAddBuiltIn"
    | "onDeleteSelectedPlanOverlay" | "onExportStyleChange"
  >;
};

type ToggleOption<T extends string> = { value: T; label: string; testId?: string };

function ToggleRow<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: readonly ToggleOption<T>[];
  value: T | null;
  onChange: (next: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          size="compact"
          variant={value === option.value ? "primary" : "secondary"}
          aria-pressed={value === option.value}
          data-testid={option.testId}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

const DETAIL_OPTIONS = [
  { value: "simple", label: "Simple" },
  { value: "detailed", label: "Detailed" },
] as const;
const SIMPLE_NOTE_OPTIONS = [{ value: "note", label: "Add note", testId: "plan-add-note" }] as const;
const NOTE_OPTIONS = [
  ...SIMPLE_NOTE_OPTIONS,
  { value: "callout", label: "Add callout", testId: "plan-add-callout" },
  { value: "room_tag", label: "Add room tag", testId: "plan-add-room-tag" },
] as const;
const EXPORT_STYLE_OPTIONS = [
  { value: "consumer", label: "Consumer" },
  { value: "pro", label: "Pro" },
] as const;

/**
 * How the 2D plan looks and what's written on it, for Pro in Plan (UX audit SX4, phase 4e; J's Q5).
 * It used to sit in Present & export. Simple keeps the plan clean; Detailed adds the layer presets,
 * the plan theme, callouts, room tags, doors, windows, built-ins and the export style.
 */
export function PlanDisplaySection({ state, actions }: PlanDisplaySectionProps) {
  const detailed = !state.simplePlanControls;
  return (
    <section aria-labelledby="plan-display-heading" data-testid="plan-display-section" className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 id="plan-display-heading" className="text-sm font-semibold text-neutral-900">
        Plan display
      </h3>
      <ToggleRow
        label="Plan detail"
        options={DETAIL_OPTIONS}
        value={detailed ? "detailed" : "simple"}
        onChange={(next) => (next === "simple" ? actions.onEnableSimplePlanControls() : actions.onEnableProPlanControls())}
      />
      {detailed ? (
        <PresentExportProfessionalPlanControls
          dark={false}
          preset={state.planLayerPreset}
          layers={state.planLayers}
          theme={state.planTheme}
          onPresetChange={actions.onPlanLayerPresetChange}
          onThemeChange={actions.onPlanThemeChange}
          onToggleLayer={actions.onTogglePlanLayer}
        />
      ) : (
        <p className="text-xs text-neutral-600">Simple keeps the plan clean. Detailed adds layers, notes and the plan theme.</p>
      )}
      <DisplayUnitSelect value={state.planMeasurementUnit} dark={false} onChange={actions.onMeasurementUnitChange} />
      <ToggleRow
        label="Notes on the plan"
        options={detailed ? NOTE_OPTIONS : SIMPLE_NOTE_OPTIONS}
        value={state.annotationToolKind}
        onChange={actions.onSelectAnnotationTool}
      />
      {detailed ? (
        <div className="grid grid-cols-3 gap-2">
          <Button size="compact" onClick={() => actions.onAddOpening("door")}>Add door</Button>
          <Button size="compact" onClick={() => actions.onAddOpening("window")}>Add window</Button>
          <Button size="compact" onClick={actions.onAddBuiltIn}>Add built-in</Button>
        </div>
      ) : null}
      <Button size="compact" variant="danger" className="w-full" disabled={!state.selectedPlanOverlayId} onClick={actions.onDeleteSelectedPlanOverlay}>
        Delete selected
      </Button>
      {detailed ? (
        <>
          <p className="text-xs font-semibold text-neutral-700">Export style</p>
          <ToggleRow label="Export style" options={EXPORT_STYLE_OPTIONS} value={state.exportStylePreset} onChange={actions.onExportStyleChange} />
        </>
      ) : null}
    </section>
  );
}

export type PlanNotesSectionProps = {
  state: Pick<PlanDisplaySectionProps["state"], "annotationToolKind" | "selectedPlanOverlayId">;
  actions: Pick<PlanDisplaySectionProps["actions"], "onSelectAnnotationTool" | "onDeleteSelectedPlanOverlay">;
};

/**
 * Notes on the 2D plan for Free users (J, 1 Oct: option A). Every plan can add notes
 * (`createBasicAnnotations`), and they did so from Present & export; the rest of the plan display
 * is Pro's.
 */
export function PlanNotesSection({ state, actions }: PlanNotesSectionProps) {
  return (
    <section aria-labelledby="plan-notes-heading" data-testid="plan-notes-section" className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 id="plan-notes-heading" className="text-sm font-semibold text-neutral-900">
        Notes on the plan
      </h3>
      <ToggleRow label="Note tools" options={SIMPLE_NOTE_OPTIONS} value={state.annotationToolKind} onChange={actions.onSelectAnnotationTool} />
      <Button size="compact" variant="danger" className="w-full" disabled={!state.selectedPlanOverlayId} onClick={actions.onDeleteSelectedPlanOverlay}>
        Delete selected
      </Button>
    </section>
  );
}

/**
 * The foot of Plan's panel while the 2D plan is on screen (UX 4e): Pro's plan display, or Free's
 * notes. The other steps, and the 3D view, get none.
 */
export function planStepFooter(step: string | undefined, tools: PresentationTools | null | undefined) {
  if (!tools || step !== "plan" || tools.state.viewMode !== "2d") return null;
  return tools.configuration.canUseAdvancedPlanControls
    ? <PlanDisplaySection state={tools.state} actions={tools.actions} />
    : <PlanNotesSection state={tools.state} actions={tools.actions} />;
}
