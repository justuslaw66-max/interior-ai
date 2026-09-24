type RetentionNoticeProps = {
  sourceDeletionPending: boolean;
  sourceContentDeleted: boolean;
  savedUnderlaysScrubbed: number;
  retentionDate: Date | null;
  subtle: string;
};

export function FloorPlanImportRetentionNotice({ sourceDeletionPending, sourceContentDeleted, savedUnderlaysScrubbed, retentionDate, subtle }: RetentionNoticeProps) {
  return (
    <p className={`mt-2 text-xs leading-5 ${subtle}`}>
      {sourceDeletionPending
        ? "Private-source deletion is queued."
        : sourceContentDeleted
          ? savedUnderlaysScrubbed > 0
            ? "The upload and saved-design reference were deleted."
            : "The private upload was deleted."
          : retentionDate && !Number.isNaN(retentionDate.getTime())
            ? `Private file bytes are scheduled for deletion by ${retentionDate.toLocaleDateString()}.`
            : "Private file bytes are retained temporarily."}
    </p>
  );
}
