import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanPropertyEvidenceIsEditable,
  floorPlanPropertyEvidenceLabel,
} from "@/lib/floor-plan-measured-property-mutations";

export function FloorPlanOpeningEvidenceLockNotice({
  evidence,
  field,
  proMode,
  approved,
  onApprove,
}: {
  evidence: FloorPlanPropertyEvidenceV2;
  field: "width" | "height" | "sill";
  proMode: boolean;
  approved: boolean;
  onApprove: () => void;
}) {
  if (floorPlanPropertyEvidenceIsEditable(evidence)) return null;
  return (
    <div
      className="mt-1 text-[9px] leading-3 text-amber-700"
      data-testid={`import-review-opening-${field}-locked`}
    >
      {floorPlanPropertyEvidenceLabel(evidence)} measurement is locked; other
      opening fields remain editable.
      {proMode ? (
        <button
          type="button"
          className="mt-1 block rounded border border-amber-500 px-1.5 py-0.5 font-semibold"
          data-testid={`import-review-opening-${field}-approve-override`}
          disabled={approved}
          onClick={onApprove}
        >
          {approved ? "Reviewed override approved" : "Review and unlock"}
        </button>
      ) : (
        <div>Open Pro mode to review an override.</div>
      )}
    </div>
  );
}
