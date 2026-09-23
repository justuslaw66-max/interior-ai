export const FLOOR_PLAN_ADMIN_JOB_UPDATED_EVENT =
  "floor-plan-admin-job-updated";
export const FLOOR_PLAN_ADMIN_BEFORE_JOB_MUTATION_EVENT =
  "floor-plan-admin-before-job-mutation";
export const FLOOR_PLAN_ADMIN_JOB_MUTATION_CANCELLED_EVENT =
  "floor-plan-admin-job-mutation-cancelled";

export type FloorPlanAdminJobUpdateDetail = {
  jobId: string;
  mutationId?: string;
  origin?: "review_workspace";
};

export type FloorPlanAdminJobMutationDetail = {
  jobId: string;
  mutationId: string;
  actionLabel: string;
};

function mutationId() {
  return globalThis.crypto?.randomUUID?.() ??
    `floor-plan-admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function notifyFloorPlanAdminJobUpdated(
  jobId: string,
  options: { mutationId?: string; origin?: "review_workspace" } = {}
) {
  window.dispatchEvent(
    new CustomEvent(FLOOR_PLAN_ADMIN_JOB_UPDATED_EVENT, {
      detail: {
        jobId,
        mutationId: options.mutationId,
        origin: options.origin,
      },
    })
  );
}

/**
 * Gives an open review workspace a synchronous opportunity to block a sibling
 * mutation before it advances candidateVersion. A returned token must be sent
 * with the subsequent update notification or cancellation.
 */
export function requestFloorPlanAdminJobMutation(
  jobId: string,
  actionLabel: string
) {
  const detail: FloorPlanAdminJobMutationDetail = {
    jobId,
    mutationId: mutationId(),
    actionLabel,
  };
  const accepted = window.dispatchEvent(
    new CustomEvent(FLOOR_PLAN_ADMIN_BEFORE_JOB_MUTATION_EVENT, {
      cancelable: true,
      detail,
    })
  );
  if (accepted) return detail.mutationId;
  cancelFloorPlanAdminJobMutation(jobId, detail.mutationId);
  return null;
}

export function cancelFloorPlanAdminJobMutation(
  jobId: string,
  pendingMutationId: string
) {
  window.dispatchEvent(
    new CustomEvent(FLOOR_PLAN_ADMIN_JOB_MUTATION_CANCELLED_EVENT, {
      detail: { jobId, mutationId: pendingMutationId },
    })
  );
}

export function subscribeToFloorPlanAdminJobUpdates(
  jobId: string,
  listener: (detail: FloorPlanAdminJobUpdateDetail) => void
) {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<FloorPlanAdminJobUpdateDetail>).detail;
    if (detail?.jobId === jobId) listener(detail);
  };
  window.addEventListener(FLOOR_PLAN_ADMIN_JOB_UPDATED_EVENT, handle);
  return () => window.removeEventListener(FLOOR_PLAN_ADMIN_JOB_UPDATED_EVENT, handle);
}

export function subscribeToFloorPlanAdminJobMutationRequests(
  jobId: string,
  listener: (detail: FloorPlanAdminJobMutationDetail) => boolean
) {
  const handle = (event: Event) => {
    const mutationEvent = event as CustomEvent<FloorPlanAdminJobMutationDetail>;
    if (mutationEvent.detail?.jobId !== jobId) return;
    if (!listener(mutationEvent.detail)) mutationEvent.preventDefault();
  };
  window.addEventListener(FLOOR_PLAN_ADMIN_BEFORE_JOB_MUTATION_EVENT, handle);
  return () =>
    window.removeEventListener(FLOOR_PLAN_ADMIN_BEFORE_JOB_MUTATION_EVENT, handle);
}

export function subscribeToFloorPlanAdminJobMutationCancellations(
  jobId: string,
  listener: (detail: FloorPlanAdminJobUpdateDetail) => void
) {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<FloorPlanAdminJobUpdateDetail>).detail;
    if (detail?.jobId === jobId) listener(detail);
  };
  window.addEventListener(FLOOR_PLAN_ADMIN_JOB_MUTATION_CANCELLED_EVENT, handle);
  return () =>
    window.removeEventListener(FLOOR_PLAN_ADMIN_JOB_MUTATION_CANCELLED_EVENT, handle);
}
