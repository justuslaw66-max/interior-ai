import MeasurementField from "@/components/editor/MeasurementField";
import FloorPlanPropertyEvidenceControl from "@/components/editor/FloorPlanPropertyEvidenceControl";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import type { OpeningDimensionResolutionStatus } from "@/lib/design-page-opening-dimensions";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { OpeningKindControl } from "@/components/editor/OpeningKindControl";

type SelectedOpeningDimensionsProps = {
  state: {
    id: string;
    kind: "door" | "window";
    wall: "north" | "south" | "east" | "west";
    hostNeedsRepair: boolean;
    widthMm: number;
    heightMm: number;
    bottomMm: number;
    maxWidthMm: number;
    maxHeightMm: number;
    effectiveHeightMm: number;
    effectiveBottomMm: number;
    heightStatus: OpeningDimensionResolutionStatus;
    bottomStatus: OpeningDimensionResolutionStatus;
    dimensionIssues: string[];
    widthEvidence: FloorPlanPropertyEvidenceV2;
    heightEvidence: FloorPlanPropertyEvidenceV2;
    sillEvidence: FloorPlanPropertyEvidenceV2;
    widthEditable: boolean;
    heightEditable: boolean;
    sillEditable: boolean;
    positionLabel: string;
    measurementUnit: PlanMeasurementUnit;
  };
  configuration: {
    dark: boolean;
    canEdit: boolean;
    proMode: boolean;
  };
  actions: {
    commitWidthMm: (valueMm: number) => void;
    commitHeightMm: (valueMm: number) => void;
    commitBottomMm: (valueMm: number) => void;
    commitKind: (patch: DesignPageOpeningMetricsPatch) => void;
    commitWall: (wall: "north" | "south" | "east" | "west") => void;
  };
};

function OpeningPositionDisplay({
  label,
  measurementUnit,
  dark,
}: {
  label: string;
  measurementUnit: PlanMeasurementUnit;
  dark: boolean;
}) {
  return (
    <div>
      <div
        className={
          dark
            ? "flex items-center justify-between text-[11px] font-semibold text-neutral-300"
            : "flex items-center justify-between text-[11px] font-semibold text-neutral-600"
        }
      >
        <span>Position</span>
        <span className={dark ? "font-normal text-neutral-400" : "font-normal text-neutral-500"}>
          {measurementUnit}
        </span>
      </div>
      <div
        className={
          dark
            ? "designer-raised mt-1 flex h-9 items-center rounded-md border px-2 text-xs font-semibold"
            : "mt-1 flex h-9 items-center rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs font-semibold text-neutral-800"
        }
      >
        {label}
      </div>
    </div>
  );
}

function OpeningMeasuredField({
  label, valueMm, minMm, maxMm, disabled, testId, evidenceTestId, evidence,
  measurementUnit, dark, onCommit,
}: {
  label: string; valueMm: number; minMm: number; maxMm: number;
  disabled: boolean; testId: string; evidenceTestId?: string;
  evidence: FloorPlanPropertyEvidenceV2;
  measurementUnit: PlanMeasurementUnit; dark: boolean;
  onCommit: (valueMm: number) => void;
}) {
  return (
    <div>
      <MeasurementField
        label={label} valueMm={valueMm} minMm={minMm} maxMm={maxMm}
        disabled={disabled} testId={testId} unit={measurementUnit}
        stepMm={1} keyboardStepMm={50} dark={dark} compact touchFriendly
        onCommit={onCommit}
      />
      <FloorPlanPropertyEvidenceControl
        evidence={evidence} dark={dark} testId={evidenceTestId ?? `${testId}-evidence`}
        assumedLabel="Estimated"
        assumedHelpText="This opening dimension was not read from a source drawing."
      />
    </div>
  );
}

function OpeningDimensionWarning({
  state,
  dark,
}: {
  state: SelectedOpeningDimensionsProps["state"];
  dark: boolean;
}) {
  const visible = [state.heightStatus, state.bottomStatus]
    .some((status) => status === "constrained" || status === "invalid");
  if (!visible) return null;
  return (
    <div
      data-testid="selection-inspector-opening-dimension-warning"
      className={dark
        ? "col-span-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-[10px] text-amber-100"
        : "col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900"}
    >
      Stored {state.heightMm} mm at {state.bottomMm} mm; effective render {state.effectiveHeightMm} mm at {state.effectiveBottomMm} mm.
      {state.dimensionIssues.map((issue) => <div key={issue} className="mt-0.5">{issue}</div>)}
    </div>
  );
}

function OpeningHostRepair({
  state, configuration, commitWall,
}: Pick<SelectedOpeningDimensionsProps, "state" | "configuration"> & {
  commitWall: SelectedOpeningDimensionsProps["actions"]["commitWall"];
}) {
  if (!state.hostNeedsRepair) return null;
  return (
    <div
      data-testid="selection-inspector-opening-host-warning"
      className={configuration.dark
        ? "col-span-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-[10px] text-amber-100"
        : "col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900"}
    >
      <div className="font-semibold">Opening needs wall repair</div>
      <div className="mt-0.5">Choose a wall that contains the requested position.</div>
      <select
        data-testid="selection-inspector-opening-wall-repair"
        className={configuration.dark
          ? "designer-control mt-2 w-full rounded-md border px-2 py-2 text-xs text-neutral-100"
          : "mt-2 w-full rounded-md border border-amber-300 bg-white px-2 py-2 text-xs text-gray-900"}
        value={state.wall}
        disabled={!configuration.canEdit}
        onChange={(event) => commitWall(event.currentTarget.value as typeof state.wall)}
      >
        {(["north", "east", "south", "west"] as const).map((wall) => (
          <option key={wall} value={wall}>{wall[0].toUpperCase() + wall.slice(1)}</option>
        ))}
      </select>
    </div>
  );
}

export function SelectedOpeningDimensions({ state, configuration, actions }: SelectedOpeningDimensionsProps) {
  return (
    <div data-testid="selection-inspector-opening-dimensions" className="mt-3 grid grid-cols-2 gap-2">
      <OpeningDimensionWarning state={state} dark={configuration.dark} />
      <OpeningHostRepair state={state} configuration={configuration} commitWall={actions.commitWall} />
      <OpeningKindControl
        opening={{
          id: state.id,
          kind: state.kind,
          widthMm: state.widthMm,
          heightMm: state.heightMm,
          bottomMm: state.bottomMm,
          evidence: {
            width: state.widthEvidence,
            height: state.heightEvidence,
            sillHeight: state.sillEvidence,
          },
        }}
        dark={configuration.dark}
        canEdit={configuration.canEdit}
        proMode={configuration.proMode}
        testId="selection-inspector-opening-kind"
        onChange={actions.commitKind}
      />
      <OpeningMeasuredField
        label="Width" valueMm={state.widthMm} minMm={400}
        maxMm={state.maxWidthMm}
        disabled={!configuration.canEdit || !state.widthEditable}
        testId="selection-inspector-opening-width" evidence={state.widthEvidence}
        measurementUnit={state.measurementUnit} dark={configuration.dark}
        onCommit={actions.commitWidthMm}
      />
      <OpeningMeasuredField
        label="Height" valueMm={state.heightMm} minMm={1}
        maxMm={Math.max(1, state.maxHeightMm - state.bottomMm)}
        disabled={!configuration.canEdit || !state.heightEditable}
        testId="selection-inspector-opening-height" evidence={state.heightEvidence}
        measurementUnit={state.measurementUnit} dark={configuration.dark}
        onCommit={actions.commitHeightMm}
      />
      {state.kind === "window" ? (
        <OpeningMeasuredField
          label="Sill height" valueMm={state.bottomMm} minMm={0}
          maxMm={Math.max(0, state.maxHeightMm - 1)}
          disabled={!configuration.canEdit || !state.sillEditable}
          testId="selection-inspector-opening-bottom" evidence={state.sillEvidence}
          evidenceTestId="selection-inspector-opening-sill-evidence"
          measurementUnit={state.measurementUnit} dark={configuration.dark}
          onCommit={actions.commitBottomMm}
        />
      ) : null}
      <OpeningPositionDisplay
        label={state.positionLabel}
        measurementUnit={state.measurementUnit}
        dark={configuration.dark}
      />
    </div>
  );
}
