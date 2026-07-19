import type { FloorPlanImportStatus } from "./types";

export const FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_ENV =
  "FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS";
export const DEFAULT_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS = 30;
export const MIN_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS = 1;
export const MAX_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS = 365;
export const FLOOR_PLAN_TRAINING_BENCHMARK_CONSENT_VERSION =
  "private-floor-plan-training-benchmark-v1";

export type FloorPlanImportPrivacy = {
  trainingBenchmarkOptIn: boolean;
  trainingBenchmarkOptInAt: Date | null;
  trainingBenchmarkConsentVersion: string | null;
  trainingBenchmarkRevokedAt: Date | null;
  sourceRetentionExpiresAt: Date;
  sourceDeletionRequestedAt: Date | null;
};

export type FloorPlanAssetDeletionReason =
  | "retention_expired"
  | "owner_requested";

export function floorPlanPrivateSourceRetentionDays(
  environment: Record<string, string | undefined> = process.env
) {
  const configured = environment[FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_ENV]?.trim();
  if (!configured) return DEFAULT_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS;
  if (!/^\d+$/.test(configured)) {
    return DEFAULT_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS;
  }
  const parsed = Number.parseInt(configured, 10);
  if (!Number.isSafeInteger(parsed)) {
    return DEFAULT_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS;
  }
  return Math.min(
    MAX_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS,
    Math.max(MIN_FLOOR_PLAN_PRIVATE_SOURCE_RETENTION_DAYS, parsed)
  );
}

export function floorPlanSourceRetentionDeadline(
  now = new Date(),
  retentionDays = floorPlanPrivateSourceRetentionDays()
) {
  return new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1_000);
}

/** Missing is deliberately false. Only the literal string `true` records consent. */
export function parseFloorPlanTrainingBenchmarkOptIn(value: FormDataEntryValue | null) {
  if (value === null || value === "" || value === "false") return false;
  if (value === "true") return true;
  throw new Error("Invalid floor-plan training and benchmark consent value");
}

export function floorPlanImportPrivacyForUpload(input: {
  trainingBenchmarkOptIn: boolean;
  now?: Date;
  retentionDays?: number;
}): FloorPlanImportPrivacy {
  const now = input.now ?? new Date();
  const optedIn = input.trainingBenchmarkOptIn === true;
  return {
    trainingBenchmarkOptIn: optedIn,
    trainingBenchmarkOptInAt: optedIn ? now : null,
    trainingBenchmarkConsentVersion: optedIn
      ? FLOOR_PLAN_TRAINING_BENCHMARK_CONSENT_VERSION
      : null,
    trainingBenchmarkRevokedAt: null,
    sourceRetentionExpiresAt: floorPlanSourceRetentionDeadline(
      now,
      input.retentionDays ?? floorPlanPrivateSourceRetentionDays()
    ),
    sourceDeletionRequestedAt: null,
  };
}

export function canUsePrivateFloorPlanForTrainingOrBenchmark(
  privacy: FloorPlanImportPrivacy,
  now = new Date()
) {
  return Boolean(
    privacy.trainingBenchmarkOptIn === true &&
      privacy.trainingBenchmarkOptInAt &&
      privacy.trainingBenchmarkConsentVersion ===
        FLOOR_PLAN_TRAINING_BENCHMARK_CONSENT_VERSION &&
      !privacy.trainingBenchmarkRevokedAt &&
      !privacy.sourceDeletionRequestedAt &&
      privacy.sourceRetentionExpiresAt.getTime() > now.getTime()
  );
}

export type FloorPlanRetentionRevision = {
  publicationStatus: string;
  approvedAt: Date | null;
  publishedAt: Date | null;
};

export type FloorPlanRetentionJob = {
  id: string;
  userId: string;
  status: FloorPlanImportStatus;
  sourceRetentionExpiresAt: Date;
  sourceDeletionRequestedAt: Date | null;
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
  revision: FloorPlanRetentionRevision | null;
};

export type FloorPlanRetentionAsset = {
  id: string;
  ownerScope: string;
  contentDeletedAt: Date | null;
  jobs: FloorPlanRetentionJob[];
};

export type FloorPlanRetentionDecisionCode =
  | "purge"
  | "not_due"
  | "not_found"
  | "owner_boundary"
  | "active_lease"
  | "processing_incomplete"
  | "protected_revision";

export type FloorPlanRetentionDecision = {
  code: FloorPlanRetentionDecisionCode;
  purgeSource: boolean;
  purgeDerivedJobIds: string[];
  failJobIds: string[];
  affectedJobIds: string[];
};

const PROCESSABLE_STATUSES = new Set<FloorPlanImportStatus>([
  "received",
  "rendered",
  "extracted",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
]);

const OWNER_DELETION_SAFE_STATUSES = new Set<FloorPlanImportStatus>([
  "ready",
  "applied",
  "failed",
]);

export function floorPlanRevisionProtectsSource(
  revision: FloorPlanRetentionRevision | null
) {
  if (!revision) return false;
  return Boolean(
    revision.approvedAt ||
      revision.publishedAt ||
      revision.publicationStatus === "approved" ||
      revision.publicationStatus === "published"
  );
}

function hasActiveLease(job: FloorPlanRetentionJob, now: Date) {
  return Boolean(
    job.leaseToken &&
      job.leaseExpiresAt &&
      job.leaseExpiresAt.getTime() > now.getTime()
  );
}

function isDue(job: FloorPlanRetentionJob, now: Date) {
  return Boolean(
    job.sourceDeletionRequestedAt ||
      job.sourceRetentionExpiresAt.getTime() <= now.getTime()
  );
}

function blocked(code: FloorPlanRetentionDecisionCode): FloorPlanRetentionDecision {
  return {
    code,
    purgeSource: false,
    purgeDerivedJobIds: [],
    failJobIds: [],
    affectedJobIds: [],
  };
}

/**
 * Pure policy used by both the authenticated early-delete route and cron cleanup.
 * The database service re-checks this policy in its transaction before clearing
 * content, while leaving hashes, manifests and provenance rows intact.
 */
export function assessFloorPlanRetentionPurge(input: {
  asset: FloorPlanRetentionAsset;
  targetJobId: string;
  mode: FloorPlanAssetDeletionReason;
  now?: Date;
  ownerUserId?: string;
}): FloorPlanRetentionDecision {
  const now = input.now ?? new Date();
  const target = input.asset.jobs.find((job) => job.id === input.targetJobId);
  if (!target) return blocked("not_found");

  const ownerIsCoherent =
    input.asset.ownerScope !== "system" &&
    input.asset.jobs.every((job) => job.userId === input.asset.ownerScope);
  if (!ownerIsCoherent) return blocked("owner_boundary");

  if (input.mode === "owner_requested") {
    if (!input.ownerUserId || input.ownerUserId !== input.asset.ownerScope) {
      return blocked("owner_boundary");
    }
    if (input.asset.jobs.some((job) => floorPlanRevisionProtectsSource(job.revision))) {
      return blocked("protected_revision");
    }
    if (input.asset.jobs.some((job) => hasActiveLease(job, now))) {
      return blocked("active_lease");
    }
    if (
      input.asset.jobs.some(
        (job) => !OWNER_DELETION_SAFE_STATUSES.has(job.status)
      )
    ) {
      return blocked("processing_incomplete");
    }
    return {
      code: "purge",
      purgeSource: true,
      purgeDerivedJobIds: input.asset.jobs.map((job) => job.id),
      failJobIds: [],
      affectedJobIds: input.asset.jobs.map((job) => job.id),
    };
  }

  if (!isDue(target, now)) return blocked("not_due");
  if (floorPlanRevisionProtectsSource(target.revision)) {
    return blocked("protected_revision");
  }
  if (hasActiveLease(target, now)) return blocked("active_lease");

  const sourceCanBePurged = input.asset.jobs.every(
    (job) =>
      isDue(job, now) &&
      !hasActiveLease(job, now) &&
      !floorPlanRevisionProtectsSource(job.revision)
  );
  const affected = sourceCanBePurged ? input.asset.jobs : [target];
  return {
    code: "purge",
    purgeSource: sourceCanBePurged,
    purgeDerivedJobIds: [target.id],
    failJobIds: affected
      .filter((job) => PROCESSABLE_STATUSES.has(job.status))
      .map((job) => job.id),
    affectedJobIds: affected.map((job) => job.id),
  };
}
