import OpeningDimensionFields from "./OpeningDimensionFields";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { formatCabinetMeasurement } from "@/features/cabinetry/measurementUnits";

type PlanOpeningInspectorProps = {
  opening: RoomOpening2D | null;
  roomName: string;
  wallSpanMeters: number;
  maxHeightMeters?: number;
  measurementUnit: PlanMeasurementUnit;
  dark?: boolean;
  onChange: (id: string, metrics: DesignPageOpeningMetricsPatch) => void;
};

export default function PlanOpeningInspector({
  opening,
  roomName,
  wallSpanMeters,
  maxHeightMeters = 3.2,
  measurementUnit,
  dark = false,
  onChange,
}: PlanOpeningInspectorProps) {
  if (!opening) return null;

  return (
    <div
      data-testid="plan-opening-inspector"
      className={
        dark
          ? "designer-raised space-y-3 rounded-lg p-3"
          : "space-y-3 rounded-lg border border-gray-200 bg-white p-3"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className={
              dark
                ? "text-xs font-semibold text-neutral-100"
                : "text-xs font-semibold text-gray-900"
            }
          >
            Opening
          </div>
          <div
            className={
              dark
                ? "mt-0.5 text-[11px] text-neutral-400"
                : "mt-0.5 text-[11px] text-gray-500"
            }
          >
            {opening.kind === "door" ? "Door" : "Window"} on {opening.wall} wall
          </div>
        </div>
        <div
          className={
            dark
              ? "rounded-full bg-neutral-800 px-2 py-1 text-[10px] font-medium text-neutral-200"
              : "rounded-full bg-gray-100 px-2 py-1 text-[10px] font-medium text-gray-600"
          }
        >
          {roomName}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label
          className={
            dark
              ? "text-[11px] font-medium text-neutral-300"
              : "text-[11px] font-medium text-gray-600"
          }
        >
          Type
          <select
            data-testid="plan-opening-kind-input"
            className={
              dark
                ? "designer-control mt-1 w-full rounded-md border px-2 py-2 text-xs text-neutral-100 outline-none focus:border-blue-300"
                : "mt-1 w-full rounded-md border border-gray-200 px-2 py-2 text-xs text-gray-900 outline-none focus:border-teal-500"
            }
            value={opening.kind}
            onChange={(event) =>
              onChange(opening.id, { kind: event.currentTarget.value as RoomOpening2D["kind"] })
            }
          >
            <option value="door">Door</option>
            <option value="window">Window</option>
          </select>
        </label>
        <div
          className={
            dark
              ? "text-[11px] font-medium text-neutral-300"
              : "text-[11px] font-medium text-gray-600"
          }
        >
          Wall span
          <div
            className={
              dark
                ? "designer-control mt-1 rounded-md border px-2 py-2 text-xs text-neutral-100"
                : "mt-1 rounded-md border border-gray-200 bg-gray-50 px-2 py-2 text-xs text-gray-900"
            }
          >
            {formatCabinetMeasurement(wallSpanMeters * 1000, measurementUnit)}
          </div>
        </div>
      </div>

      <OpeningDimensionFields opening={opening} wallSpanMeters={wallSpanMeters}
        maxHeightMeters={maxHeightMeters} measurementUnit={measurementUnit}
        dark={dark} onChange={onChange} />
    </div>
  );
}
