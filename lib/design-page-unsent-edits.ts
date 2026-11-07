import type { LoadedDesignTransport } from "@/lib/design-api-client";
import type { NamedCameraView } from "@/lib/design-page-types";
import type { StoredDesign } from "@/lib/room-persistence";

/**
 * Edits to an account design that the server hasn't taken yet, kept in this browser per design.
 *
 * The browser's backup (`design-page-local-backup.ts`) holds one design and doesn't say whether
 * the account has it, so reopening a design (a reload, signing in again, opening it from My
 * designs) loaded the account copy over edits that never reached it: after a dropped connection,
 * an expired sign-in, a failed save, or a tab closed before autosave sent them. This record says
 * which revision the edits were made on. Reopening the design then either resumes them (the
 * account still has that revision, so autosave sends them) or asks which copy to keep (the
 * account copy moved on, from another tab or device).
 */
export type UnsentDesignEdits = {
  version: 1;
  designId: string;
  /** The account revision the edits were made on (`Design.updatedAt`, as the server sent it). */
  baseRevision: string;
  /** When this browser last wrote the record (ms since the epoch). */
  savedAt: number;
  stored: StoredDesign;
  savedViews: NamedCameraView[];
};

export type UnsentEditsStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export const UNSENT_EDITS_KEY_PREFIX = "interior-ai:unsent-design-edits:";
/** Designs kept at once; the oldest goes first when a new one needs room. */
export const UNSENT_EDITS_MAX_DESIGNS = 3;

export function unsentEditsKey(designId: string): string {
  return `${UNSENT_EDITS_KEY_PREFIX}${designId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseUnsentEdits(raw: string | null, designId?: string): UnsentDesignEdits | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1) return null;
    if (typeof value.designId !== "string" || !value.designId) return null;
    if (designId !== undefined && value.designId !== designId) return null;
    if (typeof value.baseRevision !== "string" || !Number.isFinite(Date.parse(value.baseRevision))) return null;
    if (typeof value.savedAt !== "number" || !isRecord(value.stored)) return null;
    return {
      version: 1,
      designId: value.designId,
      baseRevision: value.baseRevision,
      savedAt: value.savedAt,
      stored: value.stored as StoredDesign,
      savedViews: Array.isArray(value.savedViews) ? (value.savedViews as NamedCameraView[]) : [],
    };
  } catch {
    return null;
  }
}

/** The design's unsent edits, or null (none, or a record that can't be read, which is then removed). */
export function readUnsentEdits(storage: UnsentEditsStorage, designId: string): UnsentDesignEdits | null {
  const key = unsentEditsKey(designId);
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  const record = parseUnsentEdits(raw, designId);
  if (raw && !record) clearUnsentEdits(storage, designId);
  return record;
}

export function clearUnsentEdits(storage: UnsentEditsStorage, designId: string): void {
  try {
    storage.removeItem(unsentEditsKey(designId));
  } catch {
    // Nothing to keep: a record that can't be removed is replaced or ignored next time.
  }
}

function otherRecordsOldestFirst(storage: UnsentEditsStorage, designId: string): UnsentDesignEdits[] {
  const records: UnsentDesignEdits[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(UNSENT_EDITS_KEY_PREFIX) || key === unsentEditsKey(designId)) continue;
    const record = parseUnsentEdits(storage.getItem(key));
    if (record) records.push(record);
  }
  return records.sort((left, right) => left.savedAt - right.savedAt);
}

/**
 * Keeps the design's unsent edits. At most `UNSENT_EDITS_MAX_DESIGNS` designs are kept; the oldest
 * go first, also when the browser's storage is full. False when the record couldn't be written.
 */
export function writeUnsentEdits(storage: UnsentEditsStorage, record: UnsentDesignEdits): boolean {
  const key = unsentEditsKey(record.designId);
  const serialized = JSON.stringify(record);
  let others: UnsentDesignEdits[] | null = null;
  try {
    // A design already kept takes no new room in the count, so the others are read only for a new one.
    if (storage.getItem(key) === null) {
      others = otherRecordsOldestFirst(storage, record.designId);
      while (others.length >= UNSENT_EDITS_MAX_DESIGNS) clearUnsentEdits(storage, others.shift()!.designId);
    }
  } catch {
    others = [];
  }
  for (;;) {
    try {
      storage.setItem(key, serialized);
      return true;
    } catch {
      others ??= otherRecordsOldestFirst(storage, record.designId);
      const oldest = others.shift();
      if (!oldest) return false;
      clearUnsentEdits(storage, oldest.designId);
    }
  }
}

/** The loaded account design, as it would read with the unsent edits in place of its snapshot. */
export function unsentEditsAsLoadedDesign(
  loaded: LoadedDesignTransport,
  record: UnsentDesignEdits
): LoadedDesignTransport {
  // The edits' own name (an unsent rename) wins over the account row's. Saved views come back
  // from the record as the editor keeps them, not through the transport.
  return { ...loaded, snapshot: record.stored, title: record.stored.title || loaded.title };
}

export type UnsentEditsOnLoad = "none" | "resume" | "conflict";

/**
 * What opening an account design does with this browser's unsent edits to it: nothing (none, or
 * they are what the account already has), resume them (they were made on the revision the account
 * still has), or ask which copy to keep (the account copy changed since).
 */
export function resolveUnsentEditsOnLoad(input: {
  record: UnsentDesignEdits | null;
  loadedRevision: string;
  loadedFingerprint: string;
  unsentFingerprint: string | null;
}): UnsentEditsOnLoad {
  if (!input.record || !input.unsentFingerprint) return "none";
  if (input.unsentFingerprint === input.loadedFingerprint) return "none";
  return Date.parse(input.record.baseRevision) === Date.parse(input.loadedRevision) ? "resume" : "conflict";
}
