import { randomUUID } from "node:crypto";
import type {
  FloorPlanObjectKind,
  PrivateFloorPlanObjectStorage,
} from "./object-storage";

export type FloorPlanStagedObjectWrite = {
  storageProvider: "external";
  storageKey: string;
  bytes: null;
  /** The key is attempt-unique, so this can never delete a dedupe winner. */
  discard(originalCause?: unknown): Promise<void>;
  commit(): void;
};

export type FloorPlanStagedObjectWriteOptions = {
  createWriteId?: () => string;
  onCleanupError?: (input: {
    kind: FloorPlanObjectKind;
    storageKey: string;
    cleanupCause: unknown;
    originalCause: unknown;
  }) => void;
};

function reportCleanupError(
  options: FloorPlanStagedObjectWriteOptions,
  input: Parameters<NonNullable<FloorPlanStagedObjectWriteOptions["onCleanupError"]>>[0]
) {
  try {
    if (options.onCleanupError) {
      options.onCleanupError(input);
      return;
    }
    // Do not include source names, owner scopes, hashes, or object contents.
    console.error("Floor-plan staged object cleanup failed", {
      kind: input.kind,
      storageKey: input.storageKey,
      cleanupCause: input.cleanupCause,
    });
  } catch {
    // Observability must never replace the storage/database error that caused
    // compensation. A production reporter is expected to be non-throwing.
  }
}

/**
 * Writes an object before its database transaction starts. The opaque object
 * key contains a fresh write identity, so rollback cleanup owns that key and
 * cannot remove an object selected by a concurrent dedupe winner.
 *
 * A failed PUT is also compensated because an object server may have accepted
 * the bytes even when the client only observed a timeout or connection error.
 * Cleanup is best effort and never replaces the persistence error that caused
 * it. Committed writes cannot be discarded accidentally.
 */
export async function stageFloorPlanObjectWrite(
  storage: PrivateFloorPlanObjectStorage,
  input: {
    kind: FloorPlanObjectKind;
    logicalIdentity: string;
    bytes: Uint8Array;
    mimeType: string;
    sha256: string;
  },
  options: FloorPlanStagedObjectWriteOptions = {}
): Promise<FloorPlanStagedObjectWrite> {
  const writeId = (options.createWriteId ?? randomUUID)();
  const storageKey = storage.keyFor(
    input.kind,
    `${input.logicalIdentity}\0staged-write\0${writeId}`
  );
  let state: "staged" | "committed" | "discarded" = "staged";

  const discard = async (originalCause?: unknown) => {
    if (state !== "staged") return;
    state = "discarded";
    try {
      await storage.deleteObject(storageKey);
    } catch (cleanupCause) {
      reportCleanupError(options, {
        kind: input.kind,
        storageKey,
        cleanupCause,
        originalCause,
      });
    }
  };

  try {
    await storage.putObject({
      key: storageKey,
      bytes: input.bytes,
      mimeType: input.mimeType,
      sha256: input.sha256,
    });
  } catch (cause) {
    await discard(cause);
    throw cause;
  }

  return {
    storageProvider: "external",
    storageKey,
    bytes: null,
    discard,
    commit() {
      if (state === "staged") state = "committed";
    },
  };
}
