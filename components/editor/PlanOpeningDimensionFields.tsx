import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { OpeningInspectorVerticalState } from "@/lib/design-page-opening-inspector";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanPropertyEvidenceIsEditable,
} from "@/lib/floor-plan-measured-property-mutations";
import type { RoomOpening2D } from "@/lib/editorScene";
import FloorPlanPropertyEvidenceControl from "./FloorPlanPropertyEvidenceControl";
import MeasurementField from "./MeasurementField";

const evidence = (value?: FloorPlanPropertyEvidenceV2) => value ?? "assumed";
const openingEvidenceHelp = {
  assumedLabel: "Estimated",
  assumedHelpText: "This opening dimension was not read from a source drawing.",
} as const;

type FieldProps = {
  opening: RoomOpening2D;
  vertical: OpeningInspectorVerticalState;
  maxHeightMeters: number;
  maxWidthMm: number;
  unit: PlanMeasurementUnit;
  dark: boolean;
  onChange: (id: string, patch: DesignPageOpeningMetricsPatch) => void;
};

function measuredField(props: FieldProps & {
  dimension: "width" | "height" | "sill";
}) {
  const { opening, vertical, dimension, maxHeightMeters, maxWidthMm, unit, dark, onChange } = props;
  const propertyEvidence = dimension === "width"
    ? opening.evidence?.width
    : dimension === "height" ? opening.evidence?.height : opening.evidence?.sillHeight;
  const valueMm = dimension === "width" ? opening.widthMm
    : dimension === "height" ? vertical.heightMm : vertical.bottomMm;
  const maxMm = dimension === "width" ? maxWidthMm
    : dimension === "height" ? Math.max(1, maxHeightMeters * 1000 - vertical.bottomMm)
      : Math.max(0, maxHeightMeters * 1000 - 1);
  const commit = (nextMm: number, nextEvidence: "user_confirmed" | "site_measured" = "user_confirmed", note?: string) =>
    onChange(opening.id, dimension === "width"
      ? { widthMeters: nextMm / 1000, widthEvidence: nextEvidence, measurementNote: note }
      : dimension === "height"
        ? { heightMeters: nextMm / 1000, heightEvidence: nextEvidence, measurementNote: note }
        : { bottomMeters: nextMm / 1000, bottomEvidence: nextEvidence, measurementNote: note });
  return (
    <div>
      <MeasurementField
        label={dimension === "sill" ? "Sill height" : dimension[0].toUpperCase() + dimension.slice(1)}
        testId={`plan-opening-${dimension === "sill" ? "bottom" : dimension}-input`}
        valueMm={valueMm} unit={unit} minMm={dimension === "sill" ? 0 : dimension === "width" ? 400 : 1}
        maxMm={maxMm} stepMm={1} keyboardStepMm={50}
        disabled={Boolean(propertyEvidence && !floorPlanPropertyEvidenceIsEditable(propertyEvidence))}
        dark={dark} compact touchFriendly onCommit={(next) => commit(next)}
      />
      <FloorPlanPropertyEvidenceControl
        evidence={evidence(propertyEvidence)} dark={dark}
        testId={`plan-opening-${dimension === "sill" ? "sill" : dimension}-evidence`}
        {...openingEvidenceHelp}
        onConfirm={(nextEvidence, note) => commit(valueMm, nextEvidence, note)}
      />
    </div>
  );
}

export function PlanOpeningDimensionFields(props: FieldProps & {
  wallSpanMeters: number;
}) {
  const { opening, unit, dark, onChange, wallSpanMeters } = props;
  const maxOffsetMm = Math.max(0, (wallSpanMeters * 1000 - opening.widthMm) / 2);
  return (
    <div className="grid grid-cols-2 gap-2">
      {measuredField({ ...props, dimension: "width" })}
      {measuredField({ ...props, dimension: "height" })}
      {opening.kind === "window" ? measuredField({ ...props, dimension: "sill" }) : null}
      <MeasurementField
        label="Position from wall centre" testId="plan-opening-offset-input"
        valueMm={opening.offsetMm} unit={unit} minMm={-maxOffsetMm} maxMm={maxOffsetMm}
        stepMm={50} keyboardStepMm={50} dark={dark} compact touchFriendly
        onCommit={(valueMm) => onChange(opening.id, { offsetMeters: valueMm / 1000 })}
      />
    </div>
  );
}
