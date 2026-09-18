import type { RoomOpening2D } from "@/lib/editorScene";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { resolvePlanOpeningVerticalMetrics } from "@/lib/design-page-plan-overlays";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import MeasurementField from "./MeasurementField";
import FloorPlanPropertyEvidenceControl from "./FloorPlanPropertyEvidenceControl";

export type OpeningDimensionFieldsProps = {
  opening: RoomOpening2D;
  wallSpanMeters: number;
  maxHeightMeters: number;
  measurementUnit: PlanMeasurementUnit;
  dark?: boolean;
  disabled?: boolean;
  testIdPrefix?: string;
  inputTestIdSuffix?: string;
  onChange: (id: string, metrics: DesignPageOpeningMetricsPatch) => void;
};
type DimensionField = {
  key: "width" | "height" | "bottom" | "offset";
  label: string;
  hint?: string;
  metric: "widthMeters" | "heightMeters" | "bottomMeters" | "offsetMeters";
  valueMm: number;
  minMm: number;
  maxMm: number;
  evidence?: NonNullable<RoomOpening2D["evidence"]>["height"];
  evidenceKey?: "heightEvidence" | "bottomEvidence";
};

function OpeningDimensionField({ field, props }: { field: DimensionField; props: OpeningDimensionFieldsProps }) {
  const { opening, measurementUnit, dark, disabled, onChange,
    testIdPrefix = "plan-opening", inputTestIdSuffix = "-input" } = props;
  const evidenceEditable = !field.evidence || floorPlanPropertyEvidenceIsEditable(field.evidence);
  return (
    <div>
      <MeasurementField label={field.label} hint={field.hint} className="[&>label]:gap-2"
        testId={`${testIdPrefix}-${field.key}${inputTestIdSuffix}`}
        valueMm={field.valueMm} unit={measurementUnit}
        minMm={field.minMm} maxMm={field.maxMm} stepMm={50} keyboardStepMm={50}
        disabled={disabled || !evidenceEditable} dark={dark} compact touchFriendly
        onCommit={(valueMm) => onChange(opening.id, {
          [field.metric]: valueMm / 1000,
          ...(field.evidence && field.evidenceKey ? { [field.evidenceKey]: "user_confirmed" } : {}),
        })} />
      {field.evidenceKey && <FloorPlanPropertyEvidenceControl evidence={field.evidence}
        dark={dark} disabled={disabled}
        testId={`${testIdPrefix}-${field.key === "bottom" ? "sill" : field.key}-evidence`}
        onConfirm={(evidence, measurementNote) => onChange(opening.id, {
          [field.metric]: field.valueMm / 1000,
          ...(field.evidenceKey ? { [field.evidenceKey]: evidence } : {}), measurementNote,
        })} />}
    </div>
  );
}

/** One set of dimension controls for the viewport inspector and plan sidebar. */
export default function OpeningDimensionFields(props: OpeningDimensionFieldsProps) {
  const { opening, wallSpanMeters, maxHeightMeters } = props;
  const { heightMeters, bottomMeters } = resolvePlanOpeningVerticalMetrics(opening);
  const maxOffsetMm = Math.max(0, (wallSpanMeters * 1000 - opening.widthMm) / 2);
  const fields: DimensionField[] = [
    { key: "width", label: "Width", metric: "widthMeters", valueMm: opening.widthMm,
      minMm: 400, maxMm: Math.max(400, (wallSpanMeters - 0.06) * 1000) },
    { key: "height", label: "Height", metric: "heightMeters", valueMm: heightMeters * 1000,
      minMm: 400, maxMm: Math.max(0.4, maxHeightMeters - (opening.kind === "window" ? bottomMeters : 0)) * 1000,
      evidence: opening.evidence?.height, evidenceKey: "heightEvidence" },
  ];
  if (opening.kind === "window") fields.push({
    key: "bottom", label: "Height above floor", hint: "Floor to bottom of window.",
    metric: "bottomMeters", valueMm: bottomMeters * 1000,
    minMm: 0, maxMm: Math.max(0, maxHeightMeters - 0.4) * 1000,
    evidence: opening.evidence?.sillHeight, evidenceKey: "bottomEvidence",
  });
  fields.push({ key: "offset", label: "Horizontal position", hint: "0 = centred on the wall.", metric: "offsetMeters",
    valueMm: opening.offsetMm, minMm: -maxOffsetMm, maxMm: maxOffsetMm });
  return <div className="grid grid-cols-2 gap-2">
    {fields.map((field) => <OpeningDimensionField key={field.key} field={field} props={props} />)}
  </div>;
}
