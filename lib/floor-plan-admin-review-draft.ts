export type FloorPlanAdminReviewDraftInput = {
  candidateText: string;
  issues: unknown;
  correctionNote: string;
};

/**
 * Captures the persisted correction fields that hydration can replace. The
 * exact candidate text is retained so unsaved JSON formatting and partially
 * typed corrections count as work.
 */
export function fingerprintFloorPlanAdminReviewDraft(
  draft: FloorPlanAdminReviewDraftInput
) {
  return JSON.stringify([
    draft.candidateText,
    draft.issues,
    draft.correctionNote,
  ]);
}

export type FloorPlanAdminReviewReloadDecision = "reload" | "preserve";

/**
 * A dirty draft may only be replaced when the reviewer confirmed discarding
 * that exact fingerprint. If they continue editing while a request is in
 * flight, the new fingerprint is preserved.
 */
export function decideFloorPlanAdminReviewReload(input: {
  baselineFingerprint: string | null;
  currentFingerprint: string;
  confirmedFingerprint?: string | null;
}): FloorPlanAdminReviewReloadDecision {
  if (
    input.baselineFingerprint === null ||
    input.currentFingerprint === input.baselineFingerprint ||
    input.currentFingerprint === input.confirmedFingerprint
  ) {
    return "reload";
  }
  return "preserve";
}
