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
  dark?: boolean;
  proMode?: boolean;
  onChange: (id: string, metrics: DesignPageOpeningMetricsPatch) => void;
};

function OpeningHeader({ opening, roomName, dark }: {
  opening: RoomOpening2D;
  roomName: string;
  dark: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-gray-900"}>Opening</div>
        <div className={dark ? "mt-0.5 text-[11px] text-neutral-400" : "mt-0.5 text-[11px] text-gray-500"}>
          {opening.kind === "door" ? "Door" : "Window"} on {opening.wall} wall
        </div>
      </div>
      <div className={dark
        ? "rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-medium text-neutral-200"
        : "rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600"}>
        {roomName}
      </div>
    </div>
  );
}

function OpeningBasics({ opening, wallSpanMeters, unit, dark, proMode, onChange }: {
  opening: RoomOpening2D;
  wallSpanMeters: number;
  unit: PlanMeasurementUnit;
  dark: boolean;
  proMode: boolean;
  onChange: PlanOpeningInspectorProps["onChange"];
}) {
  const labelClass = dark ? "text-[11px] font-medium text-neutral-300" : "text-[11px] font-medium text-gray-600";
  return (
    <div className="grid grid-cols-2 gap-2">
      <OpeningKindControl
        opening={opening} dark={dark} canEdit proMode={proMode}
        testId="plan-opening-kind-input"
        onChange={(patch) => onChange(opening.id, patch)}
      />
      <div className={labelClass}>Wall span
        <div className={dark
          ? "designer-control mt-1 rounded-md border px-2 py-2 text-xs text-neutral-100"
          : "mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-900"}>
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
  dark = false,
  proMode = false,
  onChange,
}: PlanOpeningInspectorProps) {
  if (!opening) return null;
  const vertical = resolveOpeningInspectorVerticalState(opening, maxHeightMeters);

  return (
    <div
      data-testid="plan-opening-inspector"
      className={dark
        ? "designer-raised space-y-3 rounded-lg p-3"
        : "space-y-3 rounded-lg border border-gray-200 bg-white p-3"}
    >
      <OpeningHeader opening={opening} roomName={roomName} dark={dark} />
      <OpeningBasics opening={opening} wallSpanMeters={wallSpanMeters} unit={measurementUnit} dark={dark} proMode={proMode} onChange={onChange} />

      <PlanOpeningInspectorWarnings
        opening={opening} hostNeedsRepair={wallSpanMeters <= 0}
        vertical={vertical} dark={dark} onChange={onChange}
      />
      <PlanOpeningDimensionFields
        opening={opening} vertical={vertical} wallSpanMeters={wallSpanMeters}
        maxHeightMeters={maxHeightMeters}
        maxWidthMm={Math.max(400, (wallSpanMeters - 0.06) * 1000)}
        unit={measurementUnit} dark={dark} onChange={onChange}
      />
    </div>
  );
}
