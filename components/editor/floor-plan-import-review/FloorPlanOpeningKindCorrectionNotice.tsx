import type { FloorPlanOpeningKindCorrectionPlan } from "@/lib/floor-plan-opening-kind-correction";

export function FloorPlanOpeningKindCorrectionNotice({
  plan, subtleClassName, proMode, approved, onApprove,
}: {
  plan: FloorPlanOpeningKindCorrectionPlan;
  subtleClassName: string;
  proMode: boolean;
  approved: boolean;
  onApprove: () => void;
}) {
  if (plan.locked) {
    return (
      <div className="col-span-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900">
        <div>Changing this window to a door requires changing its documented sill.</div>
        {proMode ? (
          <button
            type="button"
            className="mt-2 rounded bg-amber-900 px-2 py-1 font-semibold text-white"
            data-testid="import-review-opening-kind-approve-override"
            disabled={approved}
            onClick={onApprove}
          >
            {approved ? "Override approved" : "Approve reviewed override"}
          </button>
        ) : (
          <div className="mt-1">This source measurement is locked. Open Pro mode to review an override.</div>
        )}
      </div>
    );
  }
  return plan.resetsSill ? (
    <div className={`col-span-2 text-[10px] ${subtleClassName}`}>
      This kind change will atomically reset the sill to 0 mm and record it as user confirmed.
    </div>
  ) : null;
}
