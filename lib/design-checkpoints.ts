import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

/**
 * Earlier versions of a design (`DesignCheckpoint`), kept on the server so the owner can go back
 * after a bad edit, a wrong conflict choice or an unwanted change from another device.
 *
 * A checkpoint is the design as it stood before a save overwrote it (at most one every
 * `DESIGN_CHECKPOINT_INTERVAL_MS`) and before a restore replaced it. Each design keeps its newest
 * `DESIGN_CHECKPOINT_KEEP_LATEST`, plus the newest of each of the last `DESIGN_CHECKPOINT_KEEP_DAYS`
 * days (J, 7 Nov 2026: "Last 20 + daily for 14 days"; Free designs too during the beta). A day is
 * a calendar day in Singapore time, where the beta runs.
 *
 * A checkpoint never holds the private floor-plan image link (`snapshot.floorPlan.underlay`), so
 * an upload's retention and "delete my upload" have nothing to purge here; restoring keeps the
 * design's current image when it belongs to the same import (J, 7 Nov: "Leave it out").
 */
export const DESIGN_CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000;
export const DESIGN_CHECKPOINT_KEEP_LATEST = 20;
export const DESIGN_CHECKPOINT_KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const SINGAPORE_OFFSET_MS = 8 * 60 * 60 * 1000;

function singaporeDay(at: Date): number {
  return Math.floor((at.getTime() + SINGAPORE_OFFSET_MS) / DAY_MS);
}

export type DesignCheckpointReason = "save" | "restore";

/** The design columns a checkpoint copies and a restore writes back. */
export type CheckpointedDesign = {
  id: string;
  updatedAt: Date;
  title: string;
  roomWidth: number;
  roomDepth: number;
  items: Prisma.JsonValue;
  zones: Prisma.JsonValue | null;
  savedViews: Prisma.JsonValue | null;
  snapshot: Prisma.JsonValue | null;
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function floorPlanOf(snapshot: unknown): JsonRecord | null {
  return isRecord(snapshot) && isRecord(snapshot.floorPlan) ? snapshot.floorPlan : null;
}

/**
 * A checkpoint's snapshot with the design's current floor-plan image put back, when the version
 * comes from the import that image belongs to. Otherwise the restored design has no image link.
 */
export function withCurrentUnderlay(
  restored: Prisma.JsonValue | null,
  current: Prisma.JsonValue | null
): Prisma.JsonValue | null {
  const restoredPlan = floorPlanOf(restored);
  const currentPlan = floorPlanOf(current);
  if (!restoredPlan || !currentPlan || !isRecord(currentPlan.underlay)) return restored;
  const imageJobId = typeof currentPlan.underlay.sourceJobId === "string" ? currentPlan.underlay.sourceJobId : currentPlan.sourceJobId;
  if (typeof restoredPlan.sourceJobId !== "string" || restoredPlan.sourceJobId !== imageJobId) return restored;
  return { ...(restored as JsonRecord), floorPlan: { ...restoredPlan, underlay: currentPlan.underlay } } as Prisma.JsonValue;
}

/** The checkpoints to delete: all but the newest `KEEP_LATEST` and the newest of each recent day. */
export function checkpointsToPrune(
  checkpoints: readonly { id: string; createdAt: Date }[],
  now: Date
): string[] {
  const newestFirst = [...checkpoints].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const keep = new Set(newestFirst.slice(0, DESIGN_CHECKPOINT_KEEP_LATEST).map((checkpoint) => checkpoint.id));
  const daysKept = new Set<number>();
  const today = singaporeDay(now);
  for (const checkpoint of newestFirst) {
    const daysAgo = today - singaporeDay(checkpoint.createdAt);
    if (daysAgo < 0 || daysAgo >= DESIGN_CHECKPOINT_KEEP_DAYS || daysKept.has(daysAgo)) continue;
    daysKept.add(daysAgo);
    keep.add(checkpoint.id);
  }
  return newestFirst.filter((checkpoint) => !keep.has(checkpoint.id)).map((checkpoint) => checkpoint.id);
}

type CheckpointClient = Pick<Prisma.TransactionClient, "designCheckpoint" | "$executeRaw">;

/**
 * Keeps the design as it stands now, inside the transaction that is about to change it. A save
 * keeps one only when the newest is older than the interval; a restore always keeps one.
 * The copy is made in the database (`INSERT … SELECT`), so a large design isn't sent back and
 * forth inside the save's transaction, and it is the row as the transaction sees it. Returns
 * whether a checkpoint was written.
 */
export async function recordDesignCheckpoint(
  client: CheckpointClient,
  designId: string,
  reason: DesignCheckpointReason,
  now: Date = new Date()
): Promise<boolean> {
  if (reason === "save") {
    const newest = await client.designCheckpoint.findFirst({
      where: { designId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (newest && now.getTime() - newest.createdAt.getTime() < DESIGN_CHECKPOINT_INTERVAL_MS) return false;
  }
  const written = await client.$executeRaw`
    INSERT INTO "DesignCheckpoint"
      ("id", "designId", "createdAt", "reason", "sourceUpdatedAt", "title", "roomWidth", "roomDepth",
       "items", "zones", "savedViews", "snapshot")
    SELECT ${randomUUID()}, "id", ${now}, ${reason}, "updatedAt", "title", "roomWidth", "roomDepth",
       "items", "zones", "savedViews", "snapshot" #- '{floorPlan,underlay}'
    FROM "Design" WHERE "id" = ${designId}`;
  if (written !== 1) return false;
  const all = await client.designCheckpoint.findMany({
    where: { designId },
    select: { id: true, createdAt: true },
  });
  const prune = checkpointsToPrune(all, now);
  if (prune.length) await client.designCheckpoint.deleteMany({ where: { id: { in: prune } } });
  return true;
}

function jsonOrDbNull(value: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/** The design columns a restore writes: the checkpoint, with the design's current image link. */
export function restoredDesignData(
  checkpoint: Omit<CheckpointedDesign, "id" | "updatedAt">,
  current: Pick<CheckpointedDesign, "snapshot">
) {
  return {
    title: checkpoint.title,
    roomWidth: checkpoint.roomWidth,
    roomDepth: checkpoint.roomDepth,
    items: checkpoint.items as Prisma.InputJsonValue,
    // An empty column in the version empties it in the design too, rather than keeping today's.
    zones: jsonOrDbNull(checkpoint.zones),
    savedViews: jsonOrDbNull(checkpoint.savedViews),
    snapshot: jsonOrDbNull(withCurrentUnderlay(checkpoint.snapshot, current.snapshot)),
  };
}
