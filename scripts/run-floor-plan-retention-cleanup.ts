import { prisma } from "@/lib/prisma";
import { PrismaFloorPlanRetentionService } from "@/lib/floor-plan-imports/retention";
import { createFloorPlanObjectStorageFromEnv } from "@/lib/floor-plan-imports/object-storage-factory";
import { processFloorPlanObjectDeletionBatch } from "@/lib/floor-plan-imports/retention-outbox-runner";

function numericArgument(name: string, fallback: number) {
  const prefix = `--${name}=`;
  const value = process.argv.slice(2).find((argument) => argument.startsWith(prefix));
  if (!value) return fallback;
  const parsed = Number.parseInt(value.slice(prefix.length), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const limit = numericArgument("limit", 50);
  const deletionLimit = numericArgument("deletion-limit", 25);
  const dryRun = process.argv.includes("--dry-run");
  const enqueueOnly = process.argv.includes("--enqueue-only");
  const summary = await new PrismaFloorPlanRetentionService().cleanupExpired({
    limit,
    dryRun,
  });
  const storage = !dryRun && !enqueueOnly
    ? createFloorPlanObjectStorageFromEnv()
    : null;
  const missingDeletionStorage =
    !dryRun &&
    !enqueueOnly &&
    !storage &&
    summary.externalContentQueued > 0;
  const deletionWorker = storage
    ? await processFloorPlanObjectDeletionBatch({
        limit: deletionLimit,
        deleter: ({ storageKey }) => storage.deleteObject(storageKey),
      })
    : {
        processed: 0,
        outcome: dryRun
          ? "dry_run"
          : enqueueOnly
            ? "enqueue_only"
            : "external_storage_not_configured",
      };
  console.log(
    JSON.stringify({
      event: "floor_plan_private_source_retention_cleanup",
      dryRun,
      enqueueOnly,
      ...summary,
      deletionWorker,
    })
  );
  if (missingDeletionStorage) {
    throw new Error(
      "External deletions were queued but private object storage is not configured; run the deletion worker or use --enqueue-only explicitly"
    );
  }
}

void main()
  .catch((cause) => {
    console.error("Floor-plan retention cleanup failed", cause);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
