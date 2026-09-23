import { asFloorPlanDocumentV2 } from "@/lib/floor-plan-imports/admin-review";
import { buildAddressBindingInputs, parseJson } from "./floorPlanReviewModel";
import type {
  AdminJob,
  BindingDraft,
  PublicDisplayMetadataDraft,
  ReviewIssue,
  VerificationTier,
} from "./floorPlanReviewTypes";

async function responsePayload<T>(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) throw new Error(payload?.error ?? fallback);
  return payload;
}

export async function loadFloorPlanAdminJob(jobId: string) {
  const response = await fetch(`/api/admin/floor-plan-imports/${jobId}`, {
    cache: "no-store",
  });
  const payload = await responsePayload<{ job?: AdminJob }>(
    response,
    "Unable to load import"
  );
  if (!payload?.job) throw new Error("Unable to load import");
  return payload.job;
}

export async function saveFloorPlanCandidate(input: {
  job: AdminJob;
  candidateText: string;
  issues: ReviewIssue[];
  correctionNote: string;
  missingResolution: boolean;
}) {
  const parsed = parseJson(input.candidateText, "Candidate document");
  if (!asFloorPlanDocumentV2(parsed)) {
    throw new Error("Candidate must remain a FloorPlanDocumentV2 document");
  }
  if (input.missingResolution) {
    throw new Error("Resolved critical issues require resolution notes");
  }
  const response = await fetch(`/api/admin/floor-plan-imports/${input.job.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      candidateVersion: input.job.candidateVersion,
      candidate: parsed,
      reviewIssues: input.issues,
      correctionNote: input.correctionNote,
    }),
  });
  return responsePayload<{ candidateVersion?: number }>(
    response,
    "Unable to save review"
  );
}

export async function approveFloorPlanRevision(input: {
  job: AdminJob;
  bindings: BindingDraft[];
  verificationTier: VerificationTier;
  constructionEvidenceText: string;
  publicDisplayMetadata: PublicDisplayMetadataDraft;
  supersedesRevisionId: string;
  supersedeReason: string;
  supersedeConfirmed: boolean;
  hasUnsavedChanges: boolean;
}) {
  if (input.hasUnsavedChanges) {
    throw new Error("Save candidate and review corrections before approval");
  }
  if (!input.job.sourceObservationManifestJson) {
    throw new Error("Save the independent source observation manifest before approval");
  }
  const addressBindings = buildAddressBindingInputs(input.bindings);
  const constructionEvidence =
    input.verificationTier === "construction_verified"
      ? parseJson(input.constructionEvidenceText, "Construction evidence")
      : undefined;
  const floorAreaSqm = input.publicDisplayMetadata.floorAreaSqm.trim()
    ? Number(input.publicDisplayMetadata.floorAreaSqm)
    : null;
  const sourcePage = input.publicDisplayMetadata.sourcePage.trim()
    ? Number(input.publicDisplayMetadata.sourcePage)
    : null;
  if (floorAreaSqm !== null && !Number.isFinite(floorAreaSqm)) {
    throw new Error("Floor area must be a number");
  }
  if (sourcePage !== null && !Number.isInteger(sourcePage)) {
    throw new Error("Source page must be a whole number");
  }
  const publicDisplayMetadata = {
    projectName: input.publicDisplayMetadata.projectName.trim(),
    label: input.publicDisplayMetadata.label.trim(),
    flatType: input.publicDisplayMetadata.flatType.trim(),
    floorAreaSqm,
    previewUrl: input.publicDisplayMetadata.previewUrl.trim(),
    sourceUrl: input.publicDisplayMetadata.sourceUrl.trim() || null,
    sourceTitle: input.publicDisplayMetadata.sourceTitle.trim() || null,
    sourcePage,
    publisher: input.publicDisplayMetadata.publisher.trim(),
  };
  const supersededRevision = input.supersedesRevisionId.trim();
  if (supersededRevision && input.supersedeReason.trim().length < 10) {
    throw new Error(
      "Describe why this published revision is being replaced (at least 10 characters)"
    );
  }
  if (supersededRevision && !input.supersedeConfirmed) {
    throw new Error("Confirm the atomic replacement before continuing");
  }
  const response = await fetch(
    `/api/admin/floor-plan-imports/${input.job.id}/approve`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidateVersion: input.job.candidateVersion,
        sourceObservationVersion: input.job.sourceObservationVersion,
        verificationTier: input.verificationTier,
        publicDisplayMetadata,
        addressBindings,
        ...(constructionEvidence ? { constructionEvidence } : {}),
        ...(supersededRevision
          ? {
              supersedesRevisionId: supersededRevision,
              supersedeReason: input.supersedeReason.trim(),
            }
          : {}),
      }),
    }
  );
  return responsePayload<{
    revision?: { id: string };
    supersededRevisionId?: string;
    awaitingPublication?: boolean;
  }>(response, "Unable to approve revision");
}

export async function publishFloorPlanRevision(jobId: string) {
  const response = await fetch(`/api/admin/floor-plan-imports/${jobId}/publish`, {
    method: "POST",
  });
  return responsePayload<{ revisionId?: string }>(
    response,
    "Unable to publish revision"
  );
}

export async function retireFloorPlanRevision(input: {
  revisionId: string;
  jobId: string;
  reason: string;
  confirmation: string;
}) {
  const response = await fetch(`/api/admin/floor-plan-imports/${input.jobId}/retire`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      revisionId: input.revisionId,
      reason: input.reason.trim(),
      confirmation: input.confirmation.trim(),
    }),
  });
  return responsePayload<{ revisionId?: string }>(
    response,
    "Unable to retire revision"
  );
}
