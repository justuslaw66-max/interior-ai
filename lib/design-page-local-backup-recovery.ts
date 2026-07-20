import {
  DESIGN_DOCUMENT_LIMITS,
  getSerializedDesignDocumentByteLength,
} from "@/lib/design-document-contract";
import { migrateDesignDocument } from "@/lib/design-document-migrations";

export type LocalBackupStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

export const LOCAL_BACKUP_LAST_VALID_SUFFIX = ":last-known-valid";
export const LOCAL_BACKUP_QUARANTINE_SUFFIX = ":quarantine:";

export class DesignPageLocalBackupError extends Error {
  constructor(
    readonly code:
      | "INVALID_JSON"
      | "INVALID_DOCUMENT"
      | "UNSUPPORTED_VERSION"
      | "SIZE_LIMIT_EXCEEDED"
      | "STORAGE_WRITE_FAILED",
    message: string,
    readonly sourceVersion: string = "unknown"
  ) {
    super(message);
    this.name = "DesignPageLocalBackupError";
  }
}

export function getLastKnownValidLocalBackupKey(storageKey: string): string {
  return `${storageKey}${LOCAL_BACKUP_LAST_VALID_SUFFIX}`;
}

export function getLocalBackupSourceVersion(raw: string): string {
  try {
    const value = JSON.parse(raw) as { version?: unknown };
    return typeof value?.version === "number"
      ? `v${value.version}`
      : "unversioned";
  } catch {
    return "unparseable";
  }
}

export function assertLocalBackupWithinSizeLimit(raw: string): void {
  const byteLength = getSerializedDesignDocumentByteLength(raw);
  if (byteLength > DESIGN_DOCUMENT_LIMITS.maxSerializedBytes) {
    throw new DesignPageLocalBackupError(
      "SIZE_LIMIT_EXCEEDED",
      `Local design backup exceeds the ${DESIGN_DOCUMENT_LIMITS.maxSerializedBytes}-byte limit.`,
      getLocalBackupSourceVersion(raw)
    );
  }
}

export function assertCurrentDesignDocument(raw: string): void {
  assertLocalBackupWithinSizeLimit(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DesignPageLocalBackupError(
      "INVALID_JSON",
      "Local design backup is not valid JSON.",
      "unparseable"
    );
  }
  const migrated = migrateDesignDocument(parsed);
  if (!migrated.ok) {
    throw new DesignPageLocalBackupError(
      migrated.error.code,
      migrated.error.message,
      migrated.error.sourceVersion
    );
  }
}

export function seedLastKnownValidLocalBackup(
  storage: LocalBackupStorage,
  storageKey: string,
  raw: string
): void {
  assertCurrentDesignDocument(raw);
  storage.setItem(getLastKnownValidLocalBackupKey(storageKey), raw);
}

export function writeValidatedLocalBackup(
  storage: LocalBackupStorage,
  storageKey: string,
  raw: string
): void {
  assertCurrentDesignDocument(raw);
  try {
    // If the second write fails, a complete valid copy still survives here.
    storage.setItem(getLastKnownValidLocalBackupKey(storageKey), raw);
    storage.setItem(storageKey, raw);
  } catch {
    throw new DesignPageLocalBackupError(
      "STORAGE_WRITE_FAILED",
      "The browser could not write the local design backup.",
      getLocalBackupSourceVersion(raw)
    );
  }
}

export function quarantineInvalidLocalBackup(
  storage: LocalBackupStorage,
  storageKey: string,
  raw: string,
  timestamp: number = Date.now()
): string {
  const quarantineKey = `${storageKey}${LOCAL_BACKUP_QUARANTINE_SUFFIX}${timestamp}`;
  storage.setItem(quarantineKey, raw);
  return quarantineKey;
}

export function readLastKnownValidLocalBackup(
  storage: LocalBackupStorage,
  storageKey: string
): string | null {
  return storage.getItem(getLastKnownValidLocalBackupKey(storageKey));
}

/** Removes only the active copy after an explicit clean-start decision. */
export function discardPrimaryLocalBackup(
  storage: LocalBackupStorage,
  storageKey: string
): void {
  storage.removeItem(storageKey);
}
