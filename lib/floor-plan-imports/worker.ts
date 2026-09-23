import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { createDefaultFloorPlanSourceAdapterRegistry } from "./default-services";
import {
  DEFAULT_FLOOR_PLAN_HEARTBEAT_MS,
  DEFAULT_FLOOR_PLAN_LEASE_MS,
  PrismaFloorPlanImportLeaseService,
  floorPlanLeaseGuard,
  type FloorPlanImportLease,
  type FloorPlanImportWorkerStatus,
  type FloorPlanLeaseClaimResult,
} from "./lease";
import { runFloorPlanImportPipeline } from "./pipeline";
import { PrismaFloorPlanImportJobRepository } from "./prisma-repository";
import { PrismaFloorPlanSourceStore } from "./prisma-store";
import type { FloorPlanSourceAdapterRegistry } from "./source-adapter";
import type { FloorPlanImportJobRecord } from "./types";
import {
  composeFloorPlanImportTelemetryObservers,
  createFloorPlanImportTelemetryObserver,
  createPrismaFloorPlanImportTelemetryObserver,
} from "./telemetry";
import { prisma } from "../prisma";

export type FloorPlanImportWorkerResult =
  | {
      outcome: "completed";
      job: FloorPlanImportJobRecord;
      attemptNumber: number;
    }
  | {
      outcome: "retry_scheduled" | "failed";
      job: FloorPlanImportWorkerStatus;
      attemptNumber: number;
      error: string;
    }
  | {
      outcome: "lease_lost";
      attemptNumber: number;
      error: string;
    }
  | Exclude<FloorPlanLeaseClaimResult, { outcome: "claimed" }>;

export function createFloorPlanWorkerId(prefix = "floor-plan-worker") {
  return `${prefix}:${hostname()}:${process.pid}:${randomUUID()}`.slice(0, 160);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Floor-plan processing failed";
}

function attachAbortForwarder(source: AbortSignal | undefined, target: AbortController) {
  if (!source) return () => undefined;
  const abort = () => target.abort(source.reason);
  if (source.aborted) abort();
  else source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

async function runClaimedJob(input: {
  lease: FloorPlanImportLease;
  leaseService: PrismaFloorPlanImportLeaseService;
  leaseMs: number;
  heartbeatMs: number;
  signal?: AbortSignal;
  adapters?: FloorPlanSourceAdapterRegistry;
}): Promise<FloorPlanImportWorkerResult> {
  const controller = new AbortController();
  const detachAbort = attachAbortForwarder(input.signal, controller);
  let renewalInFlight = false;
  let lostLease = false;
  const heartbeat = setInterval(() => {
    if (renewalInFlight || controller.signal.aborted) return;
    renewalInFlight = true;
    void input.leaseService
      .renew({ lease: input.lease, leaseMs: input.leaseMs })
      .then((result) => {
        if (!result.renewed) {
          lostLease = true;
          controller.abort(new Error("Floor-plan worker lease was lost"));
        }
      })
      .catch((cause) => {
        lostLease = true;
        controller.abort(
          cause instanceof Error ? cause : new Error("Floor-plan lease heartbeat failed")
        );
      })
      .finally(() => {
        renewalInFlight = false;
      });
  }, input.heartbeatMs);
  heartbeat.unref?.();

  try {
    const repository = new PrismaFloorPlanImportJobRepository();
    const job = await runFloorPlanImportPipeline({
      jobId: input.lease.jobId,
      repository,
      store: new PrismaFloorPlanSourceStore(),
      adapters: input.adapters ?? createDefaultFloorPlanSourceAdapterRegistry(),
      signal: controller.signal,
      lease: floorPlanLeaseGuard(input.lease),
      telemetry: composeFloorPlanImportTelemetryObservers(
        [
          createFloorPlanImportTelemetryObserver(),
          createPrismaFloorPlanImportTelemetryObserver(prisma),
        ],
        {
          onError: (cause) =>
            console.warn("Floor-plan stage telemetry observer failed", cause),
        }
      ),
    });
    if (lostLease) {
      return {
        outcome: "lease_lost",
        attemptNumber: input.lease.attemptNumber,
        error: "Floor-plan worker lease was lost before completion",
      };
    }
    const released = await input.leaseService.release({ lease: input.lease });
    if (!released) {
      return {
        outcome: "lease_lost",
        attemptNumber: input.lease.attemptNumber,
        error: "Floor-plan worker completed but no longer owned its lease",
      };
    }
    return { outcome: "completed", job, attemptNumber: input.lease.attemptNumber };
  } catch (cause) {
    const message = errorMessage(cause);
    const released = await input.leaseService.releaseAfterFailure({
      lease: input.lease,
      error: cause,
      // A lost token is rejected by the release CAS. A transient heartbeat or
      // adapter failure should remain resumable while attempts are available.
      retryable: true,
    });
    if (released.outcome === "lease_lost") {
      return {
        outcome: "lease_lost",
        attemptNumber: input.lease.attemptNumber,
        error: message,
      };
    }
    return {
      outcome: released.outcome,
      job: released.job,
      attemptNumber: input.lease.attemptNumber,
      error: message,
    };
  } finally {
    clearInterval(heartbeat);
    detachAbort();
  }
}

export async function processFloorPlanImportJob(input: {
  jobId: string;
  workerId?: string;
  ownerUserId?: string;
  leaseMs?: number;
  heartbeatMs?: number;
  signal?: AbortSignal;
  leaseService?: PrismaFloorPlanImportLeaseService;
  /** Injection point for audited CAD/DWG conversion providers. Defaults fail closed. */
  adapters?: FloorPlanSourceAdapterRegistry;
}): Promise<FloorPlanImportWorkerResult> {
  const leaseService = input.leaseService ?? new PrismaFloorPlanImportLeaseService();
  const leaseMs = input.leaseMs ?? DEFAULT_FLOOR_PLAN_LEASE_MS;
  const claim = await leaseService.claimById({
    jobId: input.jobId,
    workerId: input.workerId ?? createFloorPlanWorkerId("floor-plan-on-demand"),
    ownerUserId: input.ownerUserId,
    leaseMs,
  });
  if (claim.outcome !== "claimed") return claim;
  return runClaimedJob({
    lease: claim.lease,
    leaseService,
    leaseMs,
    heartbeatMs: input.heartbeatMs ?? DEFAULT_FLOOR_PLAN_HEARTBEAT_MS,
    signal: input.signal,
    adapters: input.adapters,
  });
}

export async function processNextFloorPlanImportJob(input: {
  workerId?: string;
  leaseMs?: number;
  heartbeatMs?: number;
  signal?: AbortSignal;
  leaseService?: PrismaFloorPlanImportLeaseService;
  /** Injection point for audited CAD/DWG conversion providers. Defaults fail closed. */
  adapters?: FloorPlanSourceAdapterRegistry;
} = {}): Promise<FloorPlanImportWorkerResult> {
  const leaseService = input.leaseService ?? new PrismaFloorPlanImportLeaseService();
  const leaseMs = input.leaseMs ?? DEFAULT_FLOOR_PLAN_LEASE_MS;
  const workerId = input.workerId ?? createFloorPlanWorkerId();
  await leaseService.recoverExpired();
  const claim = await leaseService.claimNext({ workerId, leaseMs });
  if (claim.outcome !== "claimed") return claim;
  return runClaimedJob({
    lease: claim.lease,
    leaseService,
    leaseMs,
    heartbeatMs: input.heartbeatMs ?? DEFAULT_FLOOR_PLAN_HEARTBEAT_MS,
    signal: input.signal,
    adapters: input.adapters,
  });
}
