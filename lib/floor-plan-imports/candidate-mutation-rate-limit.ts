import type { PrismaClient } from "@prisma/client";
import { rateLimit } from "@/lib/rateLimit";
import { takeSharedRateLimit } from "@/lib/shared-rate-limit";

export const FLOOR_PLAN_CANDIDATE_MUTATION_RATE_LIMIT = 30;
export const FLOOR_PLAN_CANDIDATE_MUTATION_RATE_WINDOW_MS = 60_000;

type SharedRateLimitClient = Pick<PrismaClient, "apiRateLimitBucket">;
type LocalRateLimit = typeof rateLimit;
type SharedRateLimit = typeof takeSharedRateLimit;

export type FloorPlanCandidateMutationAllowance =
  | { outcome: "allowed" }
  | { outcome: "limited" }
  | { outcome: "unavailable"; cause: unknown };

/**
 * Combines the inexpensive per-process burst guard with the durable shared
 * counter. The injected functions are deliberately limited to deterministic
 * boundary tests; production callers use the defaults.
 */
export async function takeFloorPlanCandidateMutationAllowance(
  client: SharedRateLimitClient,
  userId: string,
  dependencies: {
    localRateLimit?: LocalRateLimit;
    sharedRateLimit?: SharedRateLimit;
  } = {}
): Promise<FloorPlanCandidateMutationAllowance> {
  const takeLocal = dependencies.localRateLimit ?? rateLimit;
  const local = takeLocal(
    `floor-plan-candidate-mutation:${userId}`,
    FLOOR_PLAN_CANDIDATE_MUTATION_RATE_LIMIT,
    FLOOR_PLAN_CANDIDATE_MUTATION_RATE_WINDOW_MS
  );
  if (!local.ok) return { outcome: "limited" };

  try {
    const shared = await (dependencies.sharedRateLimit ?? takeSharedRateLimit)(
      client,
      {
        scope: "floor-plan-candidate-mutation",
        subject: userId,
        limit: FLOOR_PLAN_CANDIDATE_MUTATION_RATE_LIMIT,
        windowMs: FLOOR_PLAN_CANDIDATE_MUTATION_RATE_WINDOW_MS,
      }
    );
    return shared.ok ? { outcome: "allowed" } : { outcome: "limited" };
  } catch (cause) {
    return { outcome: "unavailable", cause };
  }
}
