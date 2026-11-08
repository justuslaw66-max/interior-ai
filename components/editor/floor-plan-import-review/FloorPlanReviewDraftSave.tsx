"use client";

import { Button } from "@/components/ui/Button";
import type { FloorPlanReviewHistoryControls as HistoryControls } from "../useFloorPlanReviewHistory";
import FloorPlanReviewHistoryControls from "./FloorPlanReviewHistoryControls";

type Props = {
  disabled: boolean;
  submitting: boolean;
  deletingSource: boolean;
  savedVersion: number | null;
  subtle: string;
  onSave: () => void;
  /** Undo and Redo over the review's corrections, beside Save review draft. */
  history: HistoryControls;
};

export default function FloorPlanReviewDraftSave(props: Props) {
  return <div className="mb-3 flex flex-wrap items-center gap-3">
    <FloorPlanReviewHistoryControls history={props.history} disabled={props.disabled || props.submitting || props.deletingSource} />
    <Button size="compact"
      disabled={props.disabled || props.submitting || props.deletingSource}
      onClick={props.onSave}>Save review draft</Button>
    {props.savedVersion !== null && <p role="status" className={`text-xs ${props.subtle}`}>
      Review draft version {props.savedVersion} saved. Unresolved checks still need review.
    </p>}
  </div>;
}
