const EMAIL_PATTERN = /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/;

function normalizedEmail(value?: string | null) {
  const email = value?.trim().toLowerCase() ?? "";
  return EMAIL_PATTERN.test(email) ? email : null;
}

function configuredEmails(name: string) {
  const raw = process.env[name];
  if (!raw?.trim()) return null;

  const emails = raw.split(",").map((value) => normalizedEmail(value));
  if (emails.some((email) => email === null)) return null;

  return new Set(emails as string[]);
}

/**
 * Floor-plan review and publication are narrower than general admin access.
 * Production deployments must assign the two roles explicitly; no general
 * admin fallback can silently acquire either public-library authority.
 */
export function canReviewPublicFloorPlans(email?: string | null) {
  const actor = normalizedEmail(email);
  return Boolean(actor && configuredEmails("FLOOR_PLAN_REVIEWER_EMAILS")?.has(actor));
}

export function canPublishPublicFloorPlans(email?: string | null) {
  const actor = normalizedEmail(email);
  return Boolean(actor && configuredEmails("FLOOR_PLAN_PUBLISHER_EMAILS")?.has(actor));
}

export function requireFloorPlanReviewer(email?: string | null) {
  const actor = normalizedEmail(email);
  if (!actor || !canReviewPublicFloorPlans(actor)) {
    throw new FloorPlanGovernanceError(
      "FLOOR_PLAN_REVIEWER_ROLE_REQUIRED",
      "An authenticated floor-plan reviewer is required"
    );
  }
  return actor;
}

export function requireFloorPlanPublisher(email?: string | null) {
  const actor = normalizedEmail(email);
  if (!actor || !canPublishPublicFloorPlans(actor)) {
    throw new FloorPlanGovernanceError(
      "FLOOR_PLAN_PUBLISHER_ROLE_REQUIRED",
      "An authenticated floor-plan publisher is required"
    );
  }
  return actor;
}

export function assertDistinctFloorPlanReviewerPublisher(input: {
  reviewerEmail?: string | null;
  publisherEmail?: string | null;
}) {
  const reviewer = normalizedEmail(input.reviewerEmail);
  const publisher = normalizedEmail(input.publisherEmail);
  if (!reviewer || !publisher || reviewer === publisher) {
    throw new FloorPlanGovernanceError(
      "FLOOR_PLAN_MAKER_CHECKER_REQUIRED",
      "The publisher must be a different authenticated person from the reviewer"
    );
  }
  return { reviewer, publisher };
}

export class FloorPlanGovernanceError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "FloorPlanGovernanceError";
  }
}
