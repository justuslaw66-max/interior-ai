import type { Dispatch, SetStateAction } from "react";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanRenderedPage, FloorPlanReviewIssue } from "@/lib/floor-plan-imports/types";
import { resolveFloorPlanReviewTarget } from "@/lib/floor-plan-review-target";

export function FloorPlanIssueFocusButton({ issue, document, pages, focusedIssueId, setFocusedIssueId }: {
  issue: FloorPlanReviewIssue; document: FloorPlanDocumentV2; pages: FloorPlanRenderedPage[];
  focusedIssueId: string | null; setFocusedIssueId: Dispatch<SetStateAction<string | null>>;
}) {
  const target = resolveFloorPlanReviewTarget(document, pages, issue), count = issue.entityIds?.length ?? 0;
  if (!count && !target) return null;
  return <button type="button" className="mt-1 text-[10px] font-semibold text-blue-600" aria-pressed={focusedIssueId === issue.id}
    onClick={() => setFocusedIssueId((current) => current === issue.id ? null : issue.id)}>
    {focusedIssueId === issue.id ? "Clear source focus" : count ? `Show ${count} affected item${count === 1 ? "" : "s"}` : `Show ${target!.label} review`}
  </button>;
}
