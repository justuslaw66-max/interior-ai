import { FLOOR_PLAN_IMPORT_PROGRESS, assertFloorPlanImportTransition } from "./status";
import type {
  FloorPlanImportJobRecord,
  FloorPlanImportStatus,
  FloorPlanReviewIssue,
} from "./types";
import {
  FloorPlanSourceAdapterRegistry,
  type FloorPlanSourceStore,
  type FloorPlanStageResult,
} from "./source-adapter";
import {
  compileCandidateFloorPlanDocumentV2,
  hasUnresolvedCriticalIssues,
} from "./validation";
import { reconcileFloorPlanImportReadinessIssues } from "./readiness";
import type {
  FloorPlanImportStageTelemetry,
  FloorPlanImportTelemetryObserver,
} from "./telemetry";
import { readFloorPlanPageSelection } from "./page-selection";

export type FloorPlanImportJobPatch = Partial<
  Omit<FloorPlanImportJobRecord, "id" | "userId" | "sourceAssetId" | "status">
>;

export type FloorPlanImportLeaseGuard = {
  token: string;
  workerId: string;
};

export interface FloorPlanImportJobRepository {
  getById(id: string): Promise<FloorPlanImportJobRecord | null>;
  transition(
    id: string,
    from: FloorPlanImportStatus,
    to: FloorPlanImportStatus,
    patch?: FloorPlanImportJobPatch,
    lease?: FloorPlanImportLeaseGuard
  ): Promise<FloorPlanImportJobRecord>;
}

function mergeIssues(
  current: FloorPlanReviewIssue[],
  incoming: FloorPlanReviewIssue[]
) {
  const byId = new Map(current.map((issue) => [issue.id, issue]));
  for (const issue of incoming) byId.set(issue.id, issue);
  return [...byId.values()];
}

function patchFromStage(
  result: FloorPlanStageResult,
  reviewIssues: FloorPlanReviewIssue[]
): FloorPlanImportJobPatch {
  return {
    candidate: result.candidate,
    sourceManifest: result.sourceManifest,
    reviewIssues,
  };
}

function addCanonicalDocumentIssue(
  result: FloorPlanStageResult,
  issues: FloorPlanReviewIssue[]
) {
  try {
    compileCandidateFloorPlanDocumentV2(result.candidate);
    return issues;
  } catch (cause) {
    return mergeIssues(issues, [
      {
        id: "canonical-document-invalid",
        code: "canonical_document_invalid",
        message:
          cause instanceof Error
            ? cause.message
            : "The extracted candidate is not a valid FloorPlanDocumentV2 document",
        severity: "critical",
        resolved: false,
      },
    ]);
  }
}

function addReadinessIssues(
  result: FloorPlanStageResult,
  issues: FloorPlanReviewIssue[]
) {
  try {
    const { document } = compileCandidateFloorPlanDocumentV2(result.candidate);
    return reconcileFloorPlanImportReadinessIssues({
      document,
      sourceManifest: result.sourceManifest,
      reviewIssues: issues,
    });
  } catch {
    // The canonical-document issue explains malformed candidates. Readiness
    // can only be assessed after the document itself compiles.
    return issues;
  }
}

async function move(
  repository: FloorPlanImportJobRepository,
  job: FloorPlanImportJobRecord,
  to: FloorPlanImportStatus,
  patch: FloorPlanImportJobPatch = {},
  lease?: FloorPlanImportLeaseGuard,
  telemetry?: {
    observer?: FloorPlanImportTelemetryObserver;
    startedAt: number;
    metrics?: FloorPlanImportStageTelemetry["metrics"];
  }
) {
  assertFloorPlanImportTransition(job.status, to);
  const from = job.status;
  const transitioned = await repository.transition(job.id, job.status, to, {
    ...patch,
    progress: FLOOR_PLAN_IMPORT_PROGRESS[to],
  }, lease);
  if (telemetry?.observer) {
    try {
      await telemetry.observer.transition({
        jobId: transitioned.id,
        adapterId: transitioned.adapterId,
        extractionVersion: transitioned.extractionVersion,
        from,
        to,
        durationMs: Date.now() - telemetry.startedAt,
        metrics: telemetry.metrics,
        reviewIssues: transitioned.reviewIssues,
      });
    } catch (cause) {
      console.warn("Floor-plan stage telemetry observer failed", cause);
    }
  }
  return transitioned;
}

async function stopForReviewIfNeeded(
  repository: FloorPlanImportJobRepository,
  job: FloorPlanImportJobRecord,
  lease?: FloorPlanImportLeaseGuard,
  observer?: FloorPlanImportTelemetryObserver,
  startedAt = Date.now()
) {
  if (!hasUnresolvedCriticalIssues(job.reviewIssues)) return job;
  return move(repository, job, "needs_review", {}, lease, {
    observer,
    startedAt,
  });
}

function stageResultFromJob(job: FloorPlanImportJobRecord): FloorPlanStageResult {
  if (!job.candidate) {
    throw new Error(`Floor-plan import ${job.id} has no persisted candidate at ${job.status}`);
  }
  return {
    candidate: job.candidate,
    sourceManifest: job.sourceManifest,
    reviewIssues: job.reviewIssues,
  };
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new Error("Floor-plan processing was aborted");
}

export async function runFloorPlanImportPipeline(input: {
  jobId: string;
  repository: FloorPlanImportJobRepository;
  store: FloorPlanSourceStore;
  adapters: FloorPlanSourceAdapterRegistry;
  signal?: AbortSignal;
  lease?: FloorPlanImportLeaseGuard;
  telemetry?: FloorPlanImportTelemetryObserver;
}) {
  let job = await input.repository.getById(input.jobId);
  if (!job) throw new Error(`Floor-plan import ${input.jobId} was not found`);
  if (
    job.status === "needs_review" ||
    job.status === "ready" ||
    job.status === "applied" ||
    job.status === "published" ||
    job.status === "failed"
  ) {
    return job;
  }

  const source = await input.store.readSource(job.sourceAssetId);
  if (!source) throw new Error(`Floor-plan source ${job.sourceAssetId} was not found`);
  const adapter =
    (job.adapterId ? input.adapters.getById(job.adapterId) : null) ??
    input.adapters.resolve(source);
  const context = {
    jobId: job.id,
    store: input.store,
    privacy: job.privacy,
    signal: input.signal,
  };

  while (true) {
    throwIfAborted(input.signal);
    switch (job.status) {
      case "received": {
        const startedAt = Date.now();
        const pages = await adapter.render(source, context);
        job = await move(
          input.repository,
          job,
          "rendered",
          {
            adapterId: adapter.id,
            extractionVersion: adapter.extractionVersion,
            renderedPages: pages,
          },
          input.lease,
          {
            observer: input.telemetry,
            startedAt,
            metrics: { pageCount: pages.length },
          }
        );
        break;
      }
      case "rendered": {
        const startedAt = Date.now();
        const result = await adapter.extract(source, job.renderedPages, context);
        const issues = mergeIssues(job.reviewIssues, result.reviewIssues);
        job = await move(
          input.repository,
          job,
          "extracted",
          patchFromStage(result, issues),
          input.lease,
          { observer: input.telemetry, startedAt, metrics: result.metrics }
        );
        break;
      }
      case "extracted": {
        const startedAt = Date.now();
        const pageSelection = readFloorPlanPageSelection(job.candidate);
        if (
          pageSelection?.required &&
          pageSelection.selectedPageNumber === null
        ) {
          job = await move(
            input.repository,
            job,
            "selecting_page",
            {},
            input.lease,
            {
              observer: input.telemetry,
              startedAt,
              metrics: {
                candidatePlanPageCount: pageSelection.candidates.length,
              },
            }
          );
          return job;
        }
        job = await stopForReviewIfNeeded(
          input.repository,
          job,
          input.lease,
          input.telemetry,
          startedAt
        );
        if (job.status === "needs_review") return job;
        const previous = stageResultFromJob(job);
        const result = await adapter.solveScale(previous, context);
        const issues = mergeIssues(job.reviewIssues, result.reviewIssues);
        job = await move(
          input.repository,
          job,
          "scale_solved",
          patchFromStage(result, issues),
          input.lease,
          { observer: input.telemetry, startedAt, metrics: result.metrics }
        );
        break;
      }
      case "selecting_page": {
        const startedAt = Date.now();
        const pageSelection = readFloorPlanPageSelection(job.candidate);
        if (!pageSelection?.selectedPageNumber) return job;
        const previous = stageResultFromJob(job);
        const result = await adapter.solveScale(previous, context);
        const issues = mergeIssues(job.reviewIssues, result.reviewIssues);
        job = await move(
          input.repository,
          job,
          "scale_solved",
          patchFromStage(result, issues),
          input.lease,
          { observer: input.telemetry, startedAt, metrics: result.metrics }
        );
        break;
      }
      case "scale_solved": {
        const startedAt = Date.now();
        job = await stopForReviewIfNeeded(
          input.repository,
          job,
          input.lease,
          input.telemetry,
          startedAt
        );
        if (job.status === "needs_review") return job;
        const previous = stageResultFromJob(job);
        const result = await adapter.buildTopology(previous, context);
        const issues = mergeIssues(job.reviewIssues, result.reviewIssues);
        job = await move(
          input.repository,
          job,
          "topology_built",
          patchFromStage(result, issues),
          input.lease,
          { observer: input.telemetry, startedAt, metrics: result.metrics }
        );
        break;
      }
      case "topology_built": {
        const startedAt = Date.now();
        const issues = addReadinessIssues(stageResultFromJob(job), job.reviewIssues);
        if (hasUnresolvedCriticalIssues(issues)) {
          return move(
            input.repository,
            job,
            "needs_review",
            { reviewIssues: issues },
            input.lease,
            { observer: input.telemetry, startedAt }
          );
        }
        job = await move(
          input.repository,
          job,
          "validating",
          { reviewIssues: issues },
          input.lease,
          { observer: input.telemetry, startedAt }
        );
        break;
      }
      case "validating": {
        const startedAt = Date.now();
        const previous = stageResultFromJob(job);
        const result = await adapter.validate(previous, context);
        let issues = mergeIssues(job.reviewIssues, result.reviewIssues);
        issues = addCanonicalDocumentIssue(result, issues);
        issues = addReadinessIssues(result, issues);
        job = await move(
          input.repository,
          job,
          hasUnresolvedCriticalIssues(issues) ? "needs_review" : "ready",
          patchFromStage(result, issues),
          input.lease,
          { observer: input.telemetry, startedAt, metrics: result.metrics }
        );
        return job;
      }
      default:
        return job;
    }
  }
}

/** Resume the validation stage after a consumer or reviewer submits corrections. */
export async function resumeFloorPlanImportValidation(input: {
  jobId: string;
  repository: FloorPlanImportJobRepository;
  store: FloorPlanSourceStore;
  adapters: FloorPlanSourceAdapterRegistry;
  signal?: AbortSignal;
  lease?: FloorPlanImportLeaseGuard;
}) {
  const job = await input.repository.getById(input.jobId);
  if (!job) throw new Error(`Floor-plan import ${input.jobId} was not found`);
  if (job.status !== "validating") {
    throw new Error(`Floor-plan import ${job.id} is ${job.status}, not validating`);
  }
  return runFloorPlanImportPipeline(input);
}
