import { prisma } from "@/lib/prisma";
import {
  createFloorPlanWorkerId,
  processNextFloorPlanImportJob,
} from "@/lib/floor-plan-imports/worker";

const args = new Set(process.argv.slice(2));
const once = args.has("--once");
const limitArgument = process.argv
  .slice(2)
  .find((argument) => argument.startsWith("--limit="));
const requestedLimit = limitArgument
  ? Number.parseInt(limitArgument.slice("--limit=".length), 10)
  : once
    ? 1
    : Number.POSITIVE_INFINITY;
const limit = Number.isFinite(requestedLimit)
  ? Math.max(1, Math.min(10_000, requestedLimit))
  : Number.POSITIVE_INFINITY;
const workerId = createFloorPlanWorkerId("floor-plan-queue");
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
  });
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function main() {
  let processed = 0;
  while (!stopping && processed < limit) {
    const result = await processNextFloorPlanImportJob({ workerId });
    if (result.outcome === "not_found") {
      if (once || Number.isFinite(limit)) break;
      await wait(2_000);
      continue;
    }

    if (result.outcome === "completed") {
      processed += 1;
      console.log(
        JSON.stringify({
          event: "floor_plan_import_completed",
          jobId: result.job.id,
          status: result.job.status,
          attemptNumber: result.attemptNumber,
        })
      );
      continue;
    }

    if (result.outcome === "retry_scheduled" || result.outcome === "failed") {
      processed += 1;
      console.log(
        JSON.stringify({
          event: `floor_plan_import_${result.outcome}`,
          jobId: result.job.id,
          status: result.job.status,
          attemptNumber: "attemptNumber" in result ? result.attemptNumber : null,
          error: "error" in result ? result.error : result.job.errorMessage,
        })
      );
      continue;
    }

    if (result.outcome === "attempts_exhausted") {
      processed += 1;
      console.log(
        JSON.stringify({
          event: "floor_plan_import_attempts_exhausted",
          jobId: result.job?.id ?? null,
        })
      );
      continue;
    }

    if (result.outcome === "lease_lost") {
      console.warn(
        JSON.stringify({
          event: "floor_plan_import_lease_lost",
          attemptNumber: result.attemptNumber,
          error: result.error,
        })
      );
    }
  }
}

void main()
  .catch((error) => {
    console.error("Floor-plan import worker failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
