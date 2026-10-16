import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { resolveOpeningInspectorVerticalState } from "@/lib/design-page-opening-inspector";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import { PlanOpeningDimensionFields } from "./PlanOpeningDimensionFields";
import { PlanOpeningInspectorWarnings } from "./PlanOpeningInspectorWarnings";
import { OpeningKindControl } from "./OpeningKindControl";

type PlanOpeningInspectorProps = {
  opening: RoomOpening2D | null;
  roomName: string;
  wallSpanMeters: number;
  maxHeightMeters?: number;
  measurementUnit: PlanMeasurementUnit;
  proMode?: boolean;
  onChange: (id: string, metrics: DesignPageOpeningMetricsPatch) => void;
};

function OpeningHeader({ opening, roomName }: {
  opening: RoomOpening2D;
  roomName: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="text-xs font-semibold text-gray-900">{opening.kind === "door" ? "Door" : "Window"}</div>
        <div className="mt-0.5 text-xs text-gray-500">
          On the {opening.canonicalHost ? "selected" : opening.wall} wall
        </div>
      </div>
      <div className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
        {roomName}
      </div>
    </div>
  );
}

function OpeningBasics({ opening, wallSpanMeters, unit, proMode, onChange }: {
  opening: RoomOpening2D;
  wallSpanMeters: number;
  unit: PlanMeasurementUnit;
  proMode: boolean;
  onChange: PlanOpeningInspectorProps["onChange"];
}) {
  const labelClass = "text-xs font-medium text-gray-600";
  return (
    <div className="grid grid-cols-2 gap-2">
      <OpeningKindControl
        opening={opening} canEdit proMode={proMode}
        testId="plan-opening-kind-input"
        onChange={(patch) => onChange(opening.id, patch)}
      />
      <div className={labelClass}>Wall span
        <div className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-900">
          {formatCabinetMeasurement(wallSpanMeters * 1000, unit)}
        </div>
      </div>
    </div>
  );
}

export default function PlanOpeningInspector({
  opening,
  roomName,
  wallSpanMeters,
  maxHeightMeters = 3.2,
  measurementUnit,
  proMode = false,
  onChange,
}: PlanOpeningInspectorProps) {
  if (!opening) return null;
  const vertical = resolveOpeningInspectorVerticalState(opening, maxHeightMeters);

  return (
    <div
      data-testid="plan-opening-inspector"
      className="space-y-3 rounded-lg border border-gray-200 bg-white p-3"
    >
      <OpeningHeader opening={opening} roomName={roomName} />
      <OpeningBasics opening={opening} wallSpanMeters={wallSpanMeters} unit={measurementUnit} proMode={proMode} onChange={onChange} />

      <PlanOpeningInspectorWarnings
        opening={opening} hostNeedsRepair={wallSpanMeters <= 0}
        vertical={vertical} unit={measurementUnit} onChange={onChange}
      />
      <PlanOpeningDimensionFields
        opening={opening} vertical={vertical} wallSpanMeters={wallSpanMeters}
        maxHeightMeters={maxHeightMeters}
        maxWidthMm={Math.max(400, (wallSpanMeters - 0.06) * 1000)}
        unit={measurementUnit} onChange={onChange}
      />
    </div>
  );
}
