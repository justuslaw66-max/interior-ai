import { randomUUID } from "node:crypto";
import { hashCanonicalJson, hashFloorPlanSource } from "./json";
import type { FloorPlanStagedObjectWrite } from "./staged-object-write";
import type { StoreFloorPlanSourceInput } from "./source-adapter";
import type { FloorPlanSourceDescriptor } from "./types";

export type PrismaFloorPlanSourceAssetRow = {
  id: string;
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
  bytes: Uint8Array | null;
  storageProvider?: "database" | "external";
  storageKey?: string;
  contentDeletedAt?: Date | null;
};

export type PrismaFloorPlanSourceAssetClient = {
  createMany(args: unknown): Promise<{ count: number }>;
  findFirst(args: unknown): Promise<PrismaFloorPlanSourceAssetRow | null>;
  findUnique(args: unknown): Promise<PrismaFloorPlanSourceAssetRow | null>;
};

export type PendingFloorPlanBytes = {
  storageProvider: "database" | "external";
  storageKey: string;
  bytes: Buffer | null;
  externalWrite: FloorPlanStagedObjectWrite | null;
};

export type PreparedFloorPlanSourceWrite = {
  /** Database-only persistence; safe to call inside the import transaction. */
  persist(client?: unknown): Promise<FloorPlanSourceDescriptor>;
  /** Keeps the selected object and removes an unused concurrent-stage object. */
  finalize(): Promise<void>;
  /** Removes only the attempt-owned object while preserving the original error. */
  rollback(originalCause: unknown): Promise<void>;
};

function descriptor(
  row: PrismaFloorPlanSourceAssetRow
): FloorPlanSourceDescriptor {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteLength: row.byteLength,
    sha256: row.sha256,
  };
}

/**
 * Prepares a source outside a transaction, then exposes a database-only
 * persist operation so source metadata and the import job can commit together.
 */
export async function preparePrismaFloorPlanSourceWrite(
  input: StoreFloorPlanSourceInput,
  dependencies: {
    client: PrismaFloorPlanSourceAssetClient;
    clientFrom(value: unknown): PrismaFloorPlanSourceAssetClient;
    stageBytes(input: {
      logicalIdentity: string;
      databaseStorageKey: string;
      mimeType: string;
      sha256: string;
      bytes: Uint8Array;
    }): Promise<PendingFloorPlanBytes>;
  }
): Promise<PreparedFloorPlanSourceWrite> {
  const sha256 = hashFloorPlanSource(input.bytes);
  const ownerScope = input.ownerScope?.trim() || "system";
  const baseDedupeKey = hashCanonicalJson({
    ownerScope,
    sha256,
    fileName: input.fileName,
    mimeType: input.mimeType,
  });
  const select = {
    id: true,
    fileName: true,
    mimeType: true,
    byteLength: true,
    sha256: true,
    bytes: true,
    storageProvider: true,
    storageKey: true,
    contentDeletedAt: true,
  };
  const live = await dependencies.client.findFirst({
    where: {
      ownerScope,
      sha256,
      fileName: input.fileName,
      mimeType: input.mimeType,
      contentDeletedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select,
  });
  if (live) {
    return {
      async persist() {
        return descriptor(live);
      },
      async finalize() {},
      async rollback() {},
    };
  }

  const base = await dependencies.client.findUnique({
    where: { dedupeKey: baseDedupeKey },
    select: { id: true, contentDeletedAt: true },
  });
  // A tombstone is immutable evidence that bytes were deleted. A re-upload
  // therefore gets a new generation instead of reviving deleted content.
  const dedupeKey = base
    ? hashCanonicalJson({ baseDedupeKey, generationId: randomUUID() })
    : baseDedupeKey;
  const staged = await dependencies.stageBytes({
    logicalIdentity: dedupeKey,
    databaseStorageKey: `database:source:${ownerScope}:${dedupeKey}`,
    mimeType: input.mimeType,
    sha256,
    bytes: input.bytes,
  });
  let selectedStorageKey: string | null = null;
  let settled = false;

  return {
    persist: async (persistClient?: unknown) => {
      if (settled) throw new Error("FLOOR_PLAN_SOURCE_WRITE_ALREADY_SETTLED");
      const client =
        persistClient === undefined
          ? dependencies.client
          : dependencies.clientFrom(persistClient);
      await client.createMany({
        data: [
          {
            sha256,
            dedupeKey,
            ownerScope,
            fileName: input.fileName,
            mimeType: input.mimeType,
            byteLength: input.bytes.byteLength,
            storageProvider: staged.storageProvider,
            storageKey: staged.storageKey,
            bytes: staged.bytes,
            externalUrl: null,
          },
        ],
        skipDuplicates: true,
      });
      const row =
        (await client.findUnique({ where: { dedupeKey }, select })) ??
        // A different generation may win the partial live-dedupe constraint.
        (await client.findFirst({
          where: {
            ownerScope,
            sha256,
            fileName: input.fileName,
            mimeType: input.mimeType,
            contentDeletedAt: null,
          },
          orderBy: { createdAt: "asc" },
          select,
        }));
      if (!row) throw new Error("FLOOR_PLAN_SOURCE_PERSISTENCE_CONFLICT");
      selectedStorageKey = row.storageKey ?? null;
      return descriptor(row);
    },
    finalize: async () => {
      if (settled) return;
      settled = true;
      if (!staged.externalWrite) return;
      if (selectedStorageKey === staged.externalWrite.storageKey) {
        staged.externalWrite.commit();
      } else {
        await staged.externalWrite.discard();
      }
    },
    rollback: async (originalCause) => {
      if (settled) return;
      settled = true;
      await staged.externalWrite?.discard(originalCause);
    },
  };
}
