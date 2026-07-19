const REQUIRED_PUBLICATION_CHECKS = [
  "dimensionsExact",
  "criticalElementsAccountedFor",
  "topologyValid",
  "overlayRegistered",
  "sourceOverlayAnchorsWithinOnePixel",
  "renderParityVerified",
  "persistenceRoundTripVerified",
  "sourceBound",
  "sourceEvidenceWithinBounds",
] as const;

const SOURCE_OBSERVATION_PUBLICATION_CHECKS = [
  "sourceObservationsComplete",
  "publicationRightsCleared",
] as const;

const PUBLIC_VERIFICATION_TIERS = new Set([
  "source_verified",
  "construction_verified",
]);

const PUBLIC_LICENSE_STATUSES = new Set([
  "licensed",
  "permission_confirmed",
  "public_domain",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Defensive read-side gate for immutable canonical revisions.
 *
 * Lifecycle APIs already compute and persist this evidence during approval.
 * Public reads still validate its minimum server-generated contract so a
 * legacy/corrupt `published` row cannot become searchable merely because its
 * status string says published.
 */
export function hasPublicFloorPlanPublicationEvidence(input: {
  revisionId: string;
  geometryHash: string;
  verificationTier: string;
  publishedAt: Date | string | null;
  approvedByEmail?: string | null;
  publishedByEmail?: string | null;
  sourceManifest: unknown;
  document?: unknown;
}): boolean {
  if (
    !PUBLIC_VERIFICATION_TIERS.has(input.verificationTier) ||
    input.publishedAt === null ||
    Number.isNaN(new Date(input.publishedAt).getTime())
  ) {
    return false;
  }

  const manifest = isRecord(input.sourceManifest) ? input.sourceManifest : null;
  const inventory = manifest && isRecord(manifest.sourceInventory)
    ? manifest.sourceInventory
    : null;
  const checks = manifest && isRecord(manifest.publicationChecks)
    ? manifest.publicationChecks
    : null;
  const overlay = manifest && isRecord(manifest.sourceOverlayVerification)
    ? manifest.sourceOverlayVerification
    : null;
  if (
    !manifest ||
    ![2, 3].includes(Number(manifest.schemaVersion)) ||
    manifest.geometryHash !== input.geometryHash ||
    typeof manifest.reviewerId !== "string" ||
    manifest.reviewerId.trim().length === 0 ||
    typeof manifest.generatedAt !== "string" ||
    Number.isNaN(new Date(manifest.generatedAt).getTime()) ||
    !inventory ||
    typeof inventory.licenseStatus !== "string" ||
    !PUBLIC_LICENSE_STATUSES.has(inventory.licenseStatus) ||
    !checks ||
    !REQUIRED_PUBLICATION_CHECKS.every((key) => checks[key] === true) ||
    !overlay ||
    overlay.passed !== true ||
    !Array.isArray(overlay.residuals) ||
    overlay.residuals.length === 0
  ) {
    return false;
  }

  if (manifest.schemaVersion === 3) {
    const observationManifest = isRecord(manifest.sourceObservationManifest)
      ? manifest.sourceObservationManifest
      : null;
    const reviewer = input.approvedByEmail?.trim().toLowerCase() ?? "";
    const publisher = input.publishedByEmail?.trim().toLowerCase() ?? "";
    if (
      !observationManifest ||
      observationManifest.schemaVersion !== 1 ||
      !Array.isArray(observationManifest.observations) ||
      observationManifest.observations.length === 0 ||
      typeof observationManifest.recordedByReviewerId !== "string" ||
      observationManifest.recordedByReviewerId.trim().toLowerCase() !== reviewer ||
      !reviewer ||
      !publisher ||
      reviewer === publisher ||
      !SOURCE_OBSERVATION_PUBLICATION_CHECKS.every((key) => checks[key] === true)
    ) {
      return false;
    }
  }

  if (input.document !== undefined) {
    const document = isRecord(input.document) ? input.document : null;
    const verification = document && isRecord(document.verification)
      ? document.verification
      : null;
    if (
      !document ||
      document.schemaVersion !== 2 ||
      document.revisionId !== input.revisionId ||
      !verification ||
      verification.tier !== input.verificationTier ||
      !Array.isArray(verification.criticalIssueIds) ||
      verification.criticalIssueIds.length > 0 ||
      typeof verification.approvedBy !== "string" ||
      verification.approvedBy.trim().length === 0 ||
      typeof verification.approvedAt !== "string" ||
      Number.isNaN(new Date(verification.approvedAt).getTime())
    ) {
      return false;
    }
  }

  return true;
}
