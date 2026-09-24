import MeasurementField from "@/components/editor/MeasurementField";
import FloorPlanPropertyEvidenceControl from "@/components/editor/FloorPlanPropertyEvidenceControl";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanConsumerMeasurementEvidenceV2 } from "@/lib/floor-plan-measured-property-mutations";
import type { OpeningDimensionResolutionStatus } from "@/lib/design-page-opening-dimensions";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { formatDisplayLength } from "@/lib/display-units";
import { OpeningKindControl } from "@/components/editor/OpeningKindControl";

/** Commits a measured opening value; evidence and note come from an evidence confirmation. */
type CommitMeasuredMm = (
  valueMm: number,
  evidence?: FloorPlanConsumerMeasurementEvidenceV2,
  measurementNote?: string
) => void;

export type SelectedOpeningDimensionsActions = {
  commitWidthMm: CommitMeasuredMm;
  commitHeightMm: CommitMeasuredMm;
  commitBottomMm: CommitMeasuredMm;
  commitOffsetMm: (valueMm: number) => void;
  commitKind: (patch: DesignPageOpeningMetricsPatch) => void;
  commitWall: (wall: "north" | "south" | "east" | "west") => void;
};

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
    offsetMm: number;
    maxOffsetMm: number;
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
    measurementUnit: PlanMeasurementUnit;
  };
  configuration: {
    dark: boolean;
    canEdit: boolean;
    proMode: boolean;
  };
  actions: SelectedOpeningDimensionsActions;
};

function OpeningOffsetField({ state, configuration, onCommit }: Pick<SelectedOpeningDimensionsProps, "state" | "configuration"> & {
  onCommit: SelectedOpeningDimensionsActions["commitOffsetMm"];
}) {
  return (
    <MeasurementField
      label="Position from wall centre" valueMm={state.offsetMm}
      minMm={-state.maxOffsetMm} maxMm={state.maxOffsetMm}
      disabled={!configuration.canEdit || state.hostNeedsRepair}
      testId="selection-inspector-opening-offset" unit={state.measurementUnit}
      stepMm={50} keyboardStepMm={50} dark={configuration.dark} compact touchFriendly
      onCommit={onCommit}
    />
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
  onCommit: CommitMeasuredMm;
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
        evidence={evidence} dark={dark} disabled={disabled}
        testId={evidenceTestId ?? `${testId}-evidence`}
        assumedLabel="Estimated"
        assumedHelpText="This measurement was not read from your floor plan."
        onConfirm={(nextEvidence, note) => onCommit(valueMm, nextEvidence, note)}
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
  const length = (valueMm: number) => formatDisplayLength(valueMm, state.measurementUnit);
  return (
    <div
      data-testid="selection-inspector-opening-dimension-warning"
      className={dark
        ? "col-span-2 rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-[10px] text-amber-100"
        : "col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900"}
    >
      Stored {length(state.heightMm)} at {length(state.bottomMm)}; effective render {length(state.effectiveHeightMm)} at {length(state.effectiveBottomMm)}.
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
      <div className="font-semibold">{state.kind === "door" ? "Door" : "Window"} needs wall repair</div>
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
      <OpeningOffsetField state={state} configuration={configuration} onCommit={actions.commitOffsetMm} />
    </div>
  );
}
