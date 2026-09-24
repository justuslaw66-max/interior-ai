import type { Prisma } from "@prisma/client";
import { lockFloorPlanImportSource } from "./source-retention-lock";

/** Source first, then current job conditions: the same ordering as source deletion. */
export async function lockImportForConfirmation(
  client: Pick<Prisma.TransactionClient, "$queryRaw" | "floorPlanImportJob">,
  expected: { id: string; userId: string; candidateVersion: number; sourceAsset: { id: string; sha256: string } }
): Promise<Prisma.FloorPlanImportJobWhereInput> {
  await lockFloorPlanImportSource(client, expected.id, expected.userId);
  const where: Prisma.FloorPlanImportJobWhereInput = {
    id: expected.id,
    userId: expected.userId,
    status: "ready",
    candidateVersion: expected.candidateVersion,
    appliedDesignId: null,
    revision: { is: null },
    sourceDeletionRequestedAt: null,
    historyDeletedAt: null,
    sourceAssetId: expected.sourceAsset.id,
    sourceAsset: { is: { id: expected.sourceAsset.id, sha256: expected.sourceAsset.sha256, contentDeletedAt: null } },
  };
  const current = await client.floorPlanImportJob.findFirst({ where, select: { id: true } });
  if (!current) throw new Error("IMPORT_CHANGED");
  return where;
}
