import { prisma } from "@/lib/prisma";
import { createFloorPlanObjectStorageFromEnv } from "@/lib/floor-plan-imports/object-storage-factory";
import {
  processNextFloorPlanObjectDeletion,
} from "@/lib/floor-plan-imports/retention-outbox-runner";
import {
  createFloorPlanObjectDeletionWorkerId,
} from "@/lib/floor-plan-imports/retention-outbox-worker";

const argumentsSet = new Set(process.argv.slice(2));
const once = argumentsSet.has("--once");
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
const workerId = createFloorPlanObjectDeletionWorkerId("floor-plan-deletion-queue");
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
  });
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function main() {
  const storage = createFloorPlanObjectStorageFromEnv();
  if (!storage) {
    throw new Error(
      "External floor-plan object storage must be configured for the deletion worker"
    );
  }
  let processed = 0;
  while (!stopping && processed < limit) {
    const result = await processNextFloorPlanObjectDeletion({
      workerId,
      deleter: ({ storageKey }) => storage.deleteObject(storageKey),
    });
    if (result.outcome === "no_work") {
      if (once || Number.isFinite(limit)) break;
      await wait(2_000);
      continue;
    }
    processed += 1;
    const event = `floor_plan_object_deletion_${result.outcome}`;
    const payload = { event, workerId, ...result };
    if (result.outcome === "dead_letter" || result.outcome === "lease_lost") {
      console.warn(JSON.stringify(payload));
    } else {
      console.log(JSON.stringify(payload));
    }
  }
}

void main()
  .catch((cause) => {
    console.error("Floor-plan object deletion worker failed", cause);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
