import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { OpeningInspectorVerticalState } from "@/lib/design-page-opening-inspector";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatDisplayLength } from "@/lib/display-units";
import type { RoomOpening2D } from "@/lib/editorScene";

const warningClass = "rounded-lg border border-warning-tint-border bg-warning-tint p-2 text-xs text-on-warning-tint";

function HostWarning({
  opening,
  onChange,
}: {
  opening: RoomOpening2D;
  onChange: (id: string, patch: DesignPageOpeningMetricsPatch) => void;
}) {
  if (opening.canonicalHost) return (
    <div data-testid="plan-opening-host-warning" className={warningClass}>
      {opening.canonicalHost.pathKind === "arc"
        ? "This opening is retained on its curved wall. Position and width editing on curves is not supported."
        : "This opening needs a valid wall position before it can be edited."}
    </div>
  );
  return (
    <div data-testid="plan-opening-host-warning" className={warningClass}>
      <div className="font-semibold">{opening.kind === "door" ? "Door" : "Window"} needs wall repair</div>
      <div className="mt-0.5">
        It is saved, but it will not cut the plan or reduce wall-material quantities until it resolves to one physical wall.
      </div>
      <label className="mt-2 block font-semibold">
        Requested wall
        <select
          data-testid="plan-opening-wall-repair-input"
          className="mt-1 w-full rounded-md border border-warning-tint-border bg-field px-2 py-2 text-xs text-label"
          value={opening.wall}
          onChange={(event) => onChange(opening.id, {
            wall: event.currentTarget.value as RoomOpening2D["wall"],
          })}
        >
          {(["north", "east", "south", "west"] as const).map((wall) => (
            <option key={wall} value={wall}>{wall[0].toUpperCase() + wall.slice(1)}</option>
          ))}
        </select>
      </label>
    </div>
  );
}

function DimensionWarning({
  vertical,
  unit,
}: {
  vertical: OpeningInspectorVerticalState;
  unit: PlanMeasurementUnit;
}) {
  const needsWarning = [vertical.heightStatus, vertical.bottomStatus]
    .some((status) => status === "constrained" || status === "invalid");
  if (!needsWarning) return null;
  const length = (valueMm: number) => formatDisplayLength(valueMm, unit);
  return (
    <div data-testid="plan-opening-dimension-resolution-warning" className={warningClass}>
      <div className="font-semibold">Stored dimensions differ from physical geometry</div>
      <div className="mt-0.5">
        Stored: {length(vertical.heightMm)} high at {length(vertical.bottomMm)}. Effective render: {length(vertical.effectiveHeightMm)} high at {length(vertical.effectiveBottomMm)}.
      </div>
      {vertical.issues.map((issue) => <div key={issue} className="mt-0.5">{issue}</div>)}
    </div>
  );
}

export function PlanOpeningInspectorWarnings({
  opening,
  hostNeedsRepair,
  vertical,
  unit,
  onChange,
}: {
  opening: RoomOpening2D;
  hostNeedsRepair: boolean;
  vertical: OpeningInspectorVerticalState;
  unit: PlanMeasurementUnit;
  onChange: (id: string, patch: DesignPageOpeningMetricsPatch) => void;
}) {
  return (
    <>
      {hostNeedsRepair ? <HostWarning opening={opening} onChange={onChange} /> : null}
      <DimensionWarning vertical={vertical} unit={unit} />
    </>
  );
}
