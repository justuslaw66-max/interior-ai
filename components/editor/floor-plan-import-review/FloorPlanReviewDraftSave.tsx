"use client";

type Props = {
  disabled: boolean;
  submitting: boolean;
  deletingSource: boolean;
  savedVersion: number | null;
  control: string;
  subtle: string;
  onSave: () => void;
};

export default function FloorPlanReviewDraftSave(props: Props) {
  return <div className="mb-3 flex flex-wrap items-center gap-3">
    <button type="button" className={props.control}
      disabled={props.disabled || props.submitting || props.deletingSource}
      onClick={props.onSave}>Save review draft</button>
    {props.savedVersion !== null && <p role="status" className={`text-xs ${props.subtle}`}>
      Review draft version {props.savedVersion} saved. Unresolved checks still need review.
    </p>}
  </div>;
}
