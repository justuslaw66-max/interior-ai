import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  REVIEW_HOME_TYPES,
  type ReviewHomeTypeId,
  type ReviewHomeTypeResult,
} from "@/lib/floor-plan-imports/review-home-type";

type Floor = FloorPlanDocumentV2["floors"][number];

const metres = (valueMm: number) => `${(valueMm / 1000).toFixed(valueMm % 100 === 0 ? 1 : 2)} m`;

/** Why a height the home type left alone stays: read from the plan, or set in this review. */
function keptNote(floor: Floor, item: ReviewHomeTypeResult["kept"][number]) {
  const evidence = item === "wall" ? floor.defaults.wallHeight.evidence : floor.verticalEvidence?.storeyHeight.evidence;
  const fromPlan = evidence === "source_documented";
  return `The ${item} height stays as ${fromPlan ? "the plan gives it" : "you set it"}.`;
}

/** The review's home type: it sets the floor's assumed wall and storey heights by the height rules. */
export default function FloorPlanReviewHomeType({
  floor, homeType, kept, disabled, onChange,
}: {
  floor: Floor;
  homeType: ReviewHomeTypeId;
  kept: ReviewHomeTypeResult["kept"];
  disabled?: boolean;
  onChange: (next: ReviewHomeTypeId) => void;
}) {
  const wall = floor.defaults.wallHeight;
  const storeyAssumed = (floor.verticalEvidence?.storeyHeight.evidence ?? "assumed") === "assumed";
  const assumed = wall.evidence === "assumed" || storeyAssumed;
  return (
    <div className="mt-3 rounded-xl border border-separator bg-surface-floating p-3" data-testid="floor-plan-import-home-type">
      <label className="block text-xs font-semibold">
        Home type
        <select
          className="mt-1 w-full rounded-md border border-control-secondary-border bg-field px-2 py-1.5 text-xs font-normal"
          value={homeType}
          disabled={disabled}
          onChange={(event) => {
            const next = REVIEW_HOME_TYPES.find((type) => type.id === event.target.value);
            if (next) onChange(next.id);
          }}
        >
          {REVIEW_HOME_TYPES.map((type) => (
            <option key={type.id} value={type.id}>{type.label}</option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-xs text-label-secondary">
        Walls {metres(wall.valueMm)} · storey {metres(floor.storeyHeightMm)}
        {assumed ? " (assumed; you can change them in Optional plan details)" : ""}
      </p>
      {kept.map((item) => (
        <p key={item} className="mt-1 text-xs text-label-secondary">{keptNote(floor, item)}</p>
      ))}
    </div>
  );
}
