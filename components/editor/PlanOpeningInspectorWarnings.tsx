import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import type { OpeningInspectorVerticalState } from "@/lib/design-page-opening-inspector";
import type { RoomOpening2D } from "@/lib/editorScene";

const warningClass = (dark: boolean) => dark
  ? "rounded-lg border border-amber-400/40 bg-amber-400/10 p-2 text-[11px] text-amber-100"
  : "rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-900";

function HostWarning({
  opening,
  dark,
  onChange,
}: {
  opening: RoomOpening2D;
  dark: boolean;
  onChange: (id: string, patch: DesignPageOpeningMetricsPatch) => void;
}) {
  return (
    <div data-testid="plan-opening-host-warning" className={warningClass(dark)}>
      <div className="font-semibold">Opening needs wall repair</div>
      <div className="mt-0.5">
        It is saved, but it will not cut the plan or reduce wall-material quantities until it resolves to one physical wall.
      </div>
      <label className="mt-2 block font-semibold">
        Requested wall
        <select
          data-testid="plan-opening-wall-repair-input"
          className={dark
            ? "designer-control mt-1 w-full rounded-md border px-2 py-2 text-xs text-neutral-100"
            : "mt-1 w-full rounded-md border border-amber-300 bg-white px-2 py-2 text-xs text-gray-900"}
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
  dark,
}: {
  vertical: OpeningInspectorVerticalState;
  dark: boolean;
}) {
  const needsWarning = [vertical.heightStatus, vertical.bottomStatus]
    .some((status) => status === "constrained" || status === "invalid");
  if (!needsWarning) return null;
  return (
    <div data-testid="plan-opening-dimension-resolution-warning" className={warningClass(dark)}>
      <div className="font-semibold">Stored dimensions differ from physical geometry</div>
      <div className="mt-0.5">
        Stored: {vertical.heightMm} mm high at {vertical.bottomMm} mm. Effective render: {vertical.effectiveHeightMm} mm high at {vertical.effectiveBottomMm} mm.
      </div>
      {vertical.issues.map((issue) => <div key={issue} className="mt-0.5">{issue}</div>)}
    </div>
  );
}

export function PlanOpeningInspectorWarnings({
  opening,
  hostNeedsRepair,
  vertical,
  dark,
  onChange,
}: {
  opening: RoomOpening2D;
  hostNeedsRepair: boolean;
  vertical: OpeningInspectorVerticalState;
  dark: boolean;
  onChange: (id: string, patch: DesignPageOpeningMetricsPatch) => void;
}) {
  return (
    <>
      {hostNeedsRepair ? <HostWarning opening={opening} dark={dark} onChange={onChange} /> : null}
      <DimensionWarning vertical={vertical} dark={dark} />
    </>
  );
}
