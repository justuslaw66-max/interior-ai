import type { RoomOpening2D } from "@/lib/editorScene";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";
import MeasurementField from "./MeasurementField";
import FloorPlanPropertyEvidenceControl from "./FloorPlanPropertyEvidenceControl";
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
  const maxOffsetMm = Math.max(0, (wallSpanMeters * 1000 - opening.widthMm) / 2);
  const heightEvidence = opening.evidence?.height;
  const sillEvidence = opening.evidence?.sillHeight;
  const heightEditable =
    !heightEvidence || floorPlanPropertyEvidenceIsEditable(heightEvidence);
  const sillEditable =
    !sillEvidence || floorPlanPropertyEvidenceIsEditable(sillEvidence);

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

      <div className="grid grid-cols-2 gap-2">
        <MeasurementField
          label="Width"
          testId="plan-opening-width-input"
          valueMm={opening.widthMm}
          unit={measurementUnit}
          minMm={400}
          maxMm={Math.max(400, (wallSpanMeters - 0.06) * 1000)}
          stepMm={50}
          keyboardStepMm={50}
          dark={dark}
          compact
          touchFriendly
          onCommit={(valueMm) => onChange(opening.id, { widthMeters: valueMm / 1000 })}
        />
        <div>
          <MeasurementField
            label="Height"
            testId="plan-opening-height-input"
            valueMm={opening.heightMm ?? 2100}
            unit={measurementUnit}
            minMm={400}
            maxMm={
              Math.max(
                0.4,
                maxHeightMeters - (opening.kind === "window" ? (opening.bottomMm ?? 900) / 1000 : 0)
              ) * 1000
            }
            stepMm={50}
            keyboardStepMm={50}
            disabled={!heightEditable}
            dark={dark}
            compact
            touchFriendly
            onCommit={(valueMm) =>
              onChange(opening.id, {
                heightMeters: valueMm / 1000,
                ...(heightEvidence ? { heightEvidence: "user_confirmed" } : {}),
              })
            }
          />
          <FloorPlanPropertyEvidenceControl
            evidence={heightEvidence}
            dark={dark}
            testId="plan-opening-height-evidence"
            onConfirm={(evidence, measurementNote) =>
              onChange(opening.id, {
                heightMeters: (opening.heightMm ?? 2100) / 1000,
                heightEvidence: evidence,
                measurementNote,
              })
            }
          />
        </div>
        {opening.kind === "window" ? (
          <div>
            <MeasurementField
              label="Sill height"
              testId="plan-opening-bottom-input"
              valueMm={opening.bottomMm ?? 900}
              unit={measurementUnit}
              minMm={0}
              maxMm={Math.max(0, maxHeightMeters - 0.4) * 1000}
              stepMm={50}
              keyboardStepMm={50}
              disabled={!sillEditable}
              dark={dark}
              compact
              touchFriendly
              onCommit={(valueMm) =>
                onChange(opening.id, {
                  bottomMeters: valueMm / 1000,
                  ...(sillEvidence ? { bottomEvidence: "user_confirmed" } : {}),
                })
              }
            />
            <FloorPlanPropertyEvidenceControl
              evidence={sillEvidence}
              dark={dark}
              testId="plan-opening-sill-evidence"
              onConfirm={(evidence, measurementNote) =>
                onChange(opening.id, {
                  bottomMeters: (opening.bottomMm ?? 900) / 1000,
                  bottomEvidence: evidence,
                  measurementNote,
                })
              }
            />
          </div>
        ) : null}
        <MeasurementField
          label="Position from wall centre"
          testId="plan-opening-offset-input"
          valueMm={opening.offsetMm}
          unit={measurementUnit}
          minMm={-maxOffsetMm}
          maxMm={maxOffsetMm}
          stepMm={50}
          keyboardStepMm={50}
          dark={dark}
          compact
          touchFriendly
          onCommit={(valueMm) => onChange(opening.id, { offsetMeters: valueMm / 1000 })}
        />
      </div>
    </div>
  );
}
