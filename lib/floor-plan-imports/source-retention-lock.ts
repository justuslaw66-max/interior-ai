import { Prisma } from "@prisma/client";

/** Must run inside the save transaction; deletion locks this same source row first. */
export async function lockFloorPlanImportSource(
  client: { $queryRaw<T>(query: unknown): Promise<T> },
  jobId: string,
  ownerUserId: string
) {
  await client.$queryRaw(
    Prisma.sql`
      SELECT source."id"
      FROM "FloorPlanSourceAsset" source
      INNER JOIN "FloorPlanImportJob" job
        ON job."sourceAssetId" = source."id"
      WHERE job."id" = ${jobId}
        AND job."userId" = ${ownerUserId}
      FOR UPDATE OF source
    `
  );
}
