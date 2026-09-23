"use client";

import { FloorPlanApprovalPanel } from "./FloorPlanApprovalPanel";
import { FloorPlanCandidateReviewPanel } from "./FloorPlanCandidateReviewPanel";
import { FloorPlanJobSummary } from "./FloorPlanJobSummary";
import { FloorPlanMvpChecklist } from "./FloorPlanMvpChecklist";
import { FloorPlanReviewAuditPanels } from "./FloorPlanReviewAuditPanels";
import { FloorPlanReviewIssuesPanel } from "./FloorPlanReviewIssuesPanel";
import { FloorPlanSourceOverlayPanel } from "./FloorPlanSourceOverlayPanel";
import { feedbackTone } from "./floorPlanReviewModel";
import { useFloorPlanReviewWorkspace } from "./useFloorPlanReviewWorkspace";

export default function FloorPlanReviewWorkspace({ jobId }: { jobId: string }) {
  const review = useFloorPlanReviewWorkspace(jobId);

  if (review.loading && !review.job) {
    return (
      <div className="rounded-xl border bg-white p-8 text-sm text-neutral-500">
        Loading import…
      </div>
    );
  }
  if (!review.job) {
    return (
      <div
        className={`rounded-xl border p-4 text-sm ${feedbackTone(review.feedback)}`}
      >
        {review.feedback?.message ?? "Import not found."}
      </div>
    );
  }

  const job = review.job;
  return (
    <div className="space-y-5">
      {review.feedback ? (
        <div
          className={`rounded-xl border p-3 text-sm ${feedbackTone(review.feedback)}`}
          role="status"
        >
          {review.feedback.message}
        </div>
      ) : null}

      <FloorPlanMvpChecklist
        bindings={review.bindings}
        document={review.document}
        job={job}
        unresolvedCriticalCount={review.unresolvedCriticalCount}
      />

      <FloorPlanCandidateReviewPanel
        candidateText={review.candidateText}
        correctionNote={review.correctionNote}
        document={review.document}
        hasUnsavedChanges={review.hasUnsavedChanges}
        job={job}
        missingResolution={review.missingResolution}
        onCandidateTextChange={review.setCandidateText}
        onCorrectionNoteChange={review.setCorrectionNote}
        onRoomChange={review.updateRoom}
        onSave={review.saveCorrections}
        pages={review.pages}
        pending={review.pending}
        reviewable={review.reviewable}
        rooms={review.rooms}
      />

      <FloorPlanReviewIssuesPanel
        document={review.document}
        issues={review.issues}
        pending={review.pending}
        reviewable={review.reviewable}
        setIssues={review.setIssues}
      />

      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800">
          Automated overlay diagnostics
        </summary>
        <div className="mt-4">
          <FloorPlanSourceOverlayPanel
            job={job}
            onPageChange={review.setSelectedPageNumber}
            onShowEvidenceChange={review.setShowEvidence}
            onShowWallsChange={review.setShowWalls}
            overlay={review.overlay}
            pages={review.pages}
            selectedPage={review.selectedPage}
            selectedPageNumber={review.selectedPageNumber}
            showEvidence={review.showEvidence}
            showWalls={review.showWalls}
          />
        </div>
      </details>

      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800">
          Processing details
        </summary>
        <div className="mt-4">
          <FloorPlanJobSummary
            job={job}
            onRefresh={() => void review.refreshReview()}
            pending={review.pending}
          />
        </div>
      </details>

      <FloorPlanApprovalPanel
        approve={review.approve}
        bindings={review.bindings}
        constructionEvidenceText={review.constructionEvidenceText}
        document={review.document}
        hasUnsavedChanges={review.hasUnsavedChanges}
        job={job}
        onObservationSaved={async () => {
          await review.reload();
        }}
        pages={review.pages}
        pending={review.pending}
        publicDisplayMetadata={review.publicDisplayMetadata}
        publish={review.publish}
        publishConfirmed={review.publishConfirmed}
        retire={review.retire}
        retireConfirmation={review.retireConfirmation}
        retireReason={review.retireReason}
        reviewable={review.reviewable}
        setBindings={review.setBindings}
        setConstructionEvidenceText={review.setConstructionEvidenceText}
        setPublishConfirmed={review.setPublishConfirmed}
        setPublicDisplayMetadata={review.setPublicDisplayMetadata}
        setRetireConfirmation={review.setRetireConfirmation}
        setRetireReason={review.setRetireReason}
        setSupersedeConfirmed={review.setSupersedeConfirmed}
        setSupersedeReason={review.setSupersedeReason}
        setSupersedesRevisionId={review.setSupersedesRevisionId}
        setVerificationTier={review.setVerificationTier}
        supersedeConfirmed={review.supersedeConfirmed}
        supersedeReason={review.supersedeReason}
        supersedesRevisionId={review.supersedesRevisionId}
        unresolvedCriticalCount={review.unresolvedCriticalCount}
        verificationTier={review.verificationTier}
      />

      <details className="rounded-xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-neutral-800">
          Technical audit history
        </summary>
        <div className="mt-4">
          <FloorPlanReviewAuditPanels job={job} />
        </div>
      </details>
    </div>
  );
}
