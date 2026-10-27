import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import {
  floorPlanPropertyEvidenceIsEditable,
  floorPlanPropertyEvidenceLabel,
} from "@/lib/floor-plan-measured-property-mutations";
import { Button } from "@/components/ui/Button";

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
      className="mt-1 text-xs text-on-warning-tint"
      data-testid={`import-review-opening-${field}-locked`}
    >
      {floorPlanPropertyEvidenceLabel(evidence)} measurement is locked; other
      opening fields remain editable.
      {proMode ? (
        <div className="mt-1">
          <Button
            size="compact"
            data-testid={`import-review-opening-${field}-approve-override`}
            disabled={approved}
            onClick={onApprove}
          >
            {approved ? "Reviewed override approved" : "Review and unlock"}
          </Button>
        </div>
      ) : (
        <div>Open Pro tools to review an override.</div>
      )}
    </div>
  );
}
