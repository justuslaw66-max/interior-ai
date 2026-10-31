import type { FloorPlanDocumentV2, FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import {
  REVIEW_HOME_TYPES,
  storeyTypedAtReview,
  type ReviewHomeTypeId,
  type ReviewHomeTypeResult,
} from "@/lib/floor-plan-imports/review-home-type";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-measured-property-mutations";

type Floor = FloorPlanDocumentV2["floors"][number];

/** 2600 → "2.6 m", 2750 → "2.75 m", 2755 → "2.755 m": metres to the millimetre, without trailing zeros. */
const metres = (valueMm: number) => `${Number((valueMm / 1000).toFixed(3))} m`;

const EVIDENCE_WORDS: Record<FloorPlanPropertyEvidenceV2, string> = {
  assumed: "assumed",
  source_documented: "from the plan",
  user_confirmed: "confirmed",
  site_measured: "measured on site",
};

function heightWords(floor: Floor) {
  const storeyEvidence = floor.verticalEvidence?.storeyHeight.evidence ?? "assumed";
  return {
    wall: EVIDENCE_WORDS[floor.defaults.wallHeight.evidence],
    storey: storeyEvidence === "assumed" && storeyTypedAtReview(floor) ? "typed" : EVIDENCE_WORDS[storeyEvidence],
  };
}

/** The review's home type: it sets the floor's assumed wall and storey heights by the height rules. */
export default function FloorPlanReviewHomeType({
  floor, homeType, kept, refused, storeyBelowWalls, disabled, onChange,
}: {
  floor: Floor;
  homeType: ReviewHomeTypeId;
  kept: ReviewHomeTypeResult["kept"];
  refused: boolean;
  storeyBelowWalls: boolean;
  disabled?: boolean;
  onChange: (next: ReviewHomeTypeId) => void;
}) {
  const words = heightWords(floor);
  const editable = floorPlanPropertyEvidenceIsEditable(floor.defaults.wallHeight.evidence) ||
    floorPlanPropertyEvidenceIsEditable(floor.verticalEvidence?.storeyHeight.evidence ?? "assumed");
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
        Walls {metres(floor.defaults.wallHeight.valueMm)} ({words.wall}) · storey {metres(floor.storeyHeightMm)} ({words.storey}).
        {editable ? " You can change them in Optional plan details." : ""}
      </p>
      <div role="status" aria-live="polite" className="text-xs text-label-secondary">
        {refused ? (
          <p className="mt-1">That home type&apos;s walls would be lower than a door or window on the plan, so the heights stay as they are.</p>
        ) : kept.map((item) => (
          <p key={item} className="mt-1">The {item} height stays as it is ({words[item]}).</p>
        ))}
        {!refused && storeyBelowWalls ? (
          <p className="mt-1">The storey is now less than 0.2 m above the walls: check it in Optional plan details.</p>
        ) : null}
      </div>
    </div>
  );
}
