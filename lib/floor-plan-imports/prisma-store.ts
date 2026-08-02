import { prisma } from "@/lib/prisma";
import { hashCanonicalJson, hashFloorPlanSource } from "./json";
import { createFloorPlanObjectStorageFromEnv } from "./object-storage-factory";
import {
  FloorPlanObjectStorageError,
  verifyFloorPlanObjectBytes,
  type FloorPlanObjectKind,
  type PrivateFloorPlanObjectStorage,
} from "./object-storage";
import {
  stageFloorPlanObjectWrite,
  type FloorPlanStagedObjectWriteOptions,
} from "./staged-object-write";
import {
  preparePrismaFloorPlanSourceWrite,
  type PendingFloorPlanBytes,
  type PrismaFloorPlanSourceAssetClient,
  type PrismaFloorPlanSourceAssetRow,
} from "./prisma-source-write";
export type { PreparedFloorPlanSourceWrite } from "./prisma-source-write";
import type {
  FloorPlanSourceStore,
  StoreFloorPlanDerivativeInput,
  StoreFloorPlanSourceInput,
  StoredFloorPlanDerivative,
  StoredFloorPlanSource,
} from "./source-adapter";
import type { FloorPlanSourceDescriptor } from "./types";

type SourceAssetRow = PrismaFloorPlanSourceAssetRow;

type DerivedAssetRow = {
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

export type PrismaFloorPlanSourceStoreOptions = {
  /** Set null to force the legacy database backend regardless of process env. */
  objectStorage?: PrivateFloorPlanObjectStorage | null;
  env?: Record<string, string | undefined>;
  /** Deterministic seams for consistency/fault-injection tests. */
  stagedWrites?: FloorPlanStagedObjectWriteOptions;
};

type PrismaSourceStoreClient = {
  floorPlanSourceAsset: PrismaFloorPlanSourceAssetClient;
  floorPlanDerivedAsset: {
    upsert(args: unknown): Promise<DerivedAssetRow>;
    findFirst?(args: unknown): Promise<DerivedAssetRow | null>;
    findUnique(args: unknown): Promise<DerivedAssetRow | null>;
  };
};

function asClient(client: unknown): PrismaSourceStoreClient {
  return client as PrismaSourceStoreClient;
}

function descriptor(row: SourceAssetRow): FloorPlanSourceDescriptor {
  return {
    id: row.id,
    fileName: row.fileName,
    mimeType: row.mimeType,
    byteLength: row.byteLength,
    sha256: row.sha256,
  };
}

export class PrismaFloorPlanSourceStore implements FloorPlanSourceStore {
  private readonly objectStorage: PrivateFloorPlanObjectStorage | null;
  private readonly stagedWriteOptions: FloorPlanStagedObjectWriteOptions;

  constructor(
    private readonly client: unknown = prisma,
    options: PrismaFloorPlanSourceStoreOptions = {}
  ) {
    this.objectStorage =
      options.objectStorage === undefined
        ? createFloorPlanObjectStorageFromEnv(options.env)
        : options.objectStorage;
    this.stagedWriteOptions = options.stagedWrites ?? {};
  }

  async putSource(input: StoreFloorPlanSourceInput) {
    const prepared = await this.prepareSource(input);
    try {
      const source = await prepared.persist();
      await prepared.finalize();
      return source;
    } catch (cause) {
      await prepared.rollback(cause);
      throw cause;
    }
  }

  /**
   * Stages external bytes before the caller opens its database transaction.
   * The returned persist callback performs no object-store I/O, allowing the
   * source metadata and FloorPlanImportJob to commit atomically.
   */
  async prepareSource(
    input: StoreFloorPlanSourceInput
  ) {
    return preparePrismaFloorPlanSourceWrite(input, {
      client: asClient(this.client).floorPlanSourceAsset,
      clientFrom: (value) => asClient(value).floorPlanSourceAsset,
      stageBytes: (bytes) =>
        this.stageBytes({ kind: "source", ...bytes }),
    });
  }

  async readSource(id: string): Promise<StoredFloorPlanSource | null> {
    const row = await asClient(this.client).floorPlanSourceAsset.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        byteLength: true,
        sha256: true,
        bytes: true,
        storageProvider: true,
        storageKey: true,
        contentDeletedAt: true,
      },
    });
    if (!row || row.contentDeletedAt) return null;
    const bytes = await this.readPersistedBytes(row);
    return bytes ? { ...descriptor(row), bytes } : null;
  }

  async putDerivative(input: StoreFloorPlanDerivativeInput) {
    const sha256 = hashFloorPlanSource(input.bytes);
    const derivativeIdentity = hashCanonicalJson({
      jobId: input.jobId,
      sha256,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
    const client = asClient(this.client);
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
    const live = await client.floorPlanDerivedAsset.findFirst?.({
      where: {
        jobId: input.jobId,
        sha256,
        fileName: input.fileName,
        mimeType: input.mimeType,
        contentDeletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select,
    });
    if (live) return live.id;

    const persisted = await this.stageBytes({
      kind: "derived",
      logicalIdentity: derivativeIdentity,
      databaseStorageKey: `database:derived:${input.jobId}:${sha256}:${input.fileName}`,
      mimeType: input.mimeType,
      sha256,
      bytes: input.bytes,
    });
    try {
      const raced = await client.floorPlanDerivedAsset.findFirst?.({
        where: {
          jobId: input.jobId,
          sha256,
          fileName: input.fileName,
          mimeType: input.mimeType,
          contentDeletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        select,
      });
      if (raced) {
        await persisted.externalWrite?.discard();
        return raced.id;
      }
      const row = await client.floorPlanDerivedAsset.upsert({
        where: { storageKey: persisted.storageKey },
        update: {
          sha256,
          mimeType: input.mimeType,
          byteLength: input.bytes.byteLength,
          storageProvider: persisted.storageProvider,
          bytes: persisted.bytes,
          externalUrl: null,
          contentDeletedAt: null,
          contentDeletionReason: null,
        },
        create: {
          jobId: input.jobId,
          fileName: input.fileName,
          mimeType: input.mimeType,
          byteLength: input.bytes.byteLength,
          sha256,
          storageProvider: persisted.storageProvider,
          storageKey: persisted.storageKey,
          bytes: persisted.bytes,
          externalUrl: null,
        },
        select,
      });
      if (persisted.externalWrite) {
        if (row.storageKey === persisted.externalWrite.storageKey) {
          persisted.externalWrite.commit();
        } else {
          await persisted.externalWrite.discard();
        }
      }
      return row.id;
    } catch (cause) {
      await persisted.externalWrite?.discard(cause);
      throw cause;
    }
  }

  async readDerivative(id: string): Promise<StoredFloorPlanDerivative | null> {
    const row = await asClient(this.client).floorPlanDerivedAsset.findUnique({
      where: { id },
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        byteLength: true,
        sha256: true,
        bytes: true,
        storageProvider: true,
        storageKey: true,
        contentDeletedAt: true,
      },
    });
    if (!row || row.contentDeletedAt) return null;
    const bytes = await this.readPersistedBytes(row);
    if (!bytes) return null;
    return {
      id: row.id,
      fileName: row.fileName,
      mimeType: row.mimeType,
      byteLength: row.byteLength,
      sha256: row.sha256,
      bytes,
    };
  }

  private async stageBytes(input: {
    kind: FloorPlanObjectKind;
    logicalIdentity: string;
    databaseStorageKey: string;
    mimeType: string;
    sha256: string;
    bytes: Uint8Array;
  }): Promise<PendingFloorPlanBytes> {
    if (!this.objectStorage) {
      return {
        storageProvider: "database",
        storageKey: input.databaseStorageKey,
        bytes: Buffer.from(input.bytes),
        externalWrite: null,
      };
    }
    const externalWrite = await stageFloorPlanObjectWrite(
      this.objectStorage,
      {
        kind: input.kind,
        logicalIdentity: input.logicalIdentity,
        bytes: input.bytes,
        mimeType: input.mimeType,
        sha256: input.sha256,
      },
      this.stagedWriteOptions
    );
    return { ...externalWrite, externalWrite };
  }

  private async readPersistedBytes(
    row: SourceAssetRow | DerivedAssetRow
  ): Promise<Uint8Array | null> {
    if (row.bytes) {
      const bytes = new Uint8Array(row.bytes);
      verifyFloorPlanObjectBytes({
        bytes,
        expectedByteLength: row.byteLength,
        expectedSha256: row.sha256,
      });
      return bytes;
    }
    if (row.storageProvider !== "external" || !row.storageKey) return null;
    if (!this.objectStorage) {
      throw new FloorPlanObjectStorageError(
        "configuration",
        "External floor-plan object storage is required to read this asset."
      );
    }
    return this.objectStorage.getObject({
      key: row.storageKey,
      expectedByteLength: row.byteLength,
      expectedMimeType: row.mimeType,
      expectedSha256: row.sha256,
    });
  }
}
