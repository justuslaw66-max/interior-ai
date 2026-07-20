import assert from "node:assert/strict";

import {
  DesignPageLocalBackupError,
  discardPrimaryLocalBackup,
  getLastKnownValidLocalBackupKey,
  quarantineInvalidLocalBackup,
  readLastKnownValidLocalBackup,
  writeValidatedLocalBackup,
  type LocalBackupStorage,
} from "@/lib/design-page-local-backup-recovery";
import {
  DESIGN_DOCUMENT_COORDINATE_SYSTEM,
  DESIGN_DOCUMENT_SCHEMA_REVISION,
  DESIGN_DOCUMENT_UNITS,
} from "@/lib/design-document-contract";

class MemoryStorage implements LocalBackupStorage {
  readonly entries = new Map<string, string>();
  failKey: string | null = null;

  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (key === this.failKey) throw new Error("quota");
    this.entries.set(key, value);
  }
  removeItem(key: string) {
    this.entries.delete(key);
  }
}

const storageKey = "interior-ai:test-design";
const validRaw = JSON.stringify({
  version: 3,
  schemaRevision: DESIGN_DOCUMENT_SCHEMA_REVISION,
  units: DESIGN_DOCUMENT_UNITS,
  coordinateSystem: DESIGN_DOCUMENT_COORDINATE_SYSTEM,
  activeRoomId: "room-001",
  rooms: [
    {
      id: "room-001",
      name: "Living Room",
      roomType: "living",
      geometry: { width: 5, depth: 4 },
      items: [],
      zones: [],
      savedViews: [],
    },
  ],
});

const storage = new MemoryStorage();
writeValidatedLocalBackup(storage, storageKey, validRaw);
assert.equal(storage.getItem(storageKey), validRaw);
assert.equal(readLastKnownValidLocalBackup(storage, storageKey), validRaw);

const invalidRaw = '{"token":"private-marker-do-not-log"';
storage.setItem(storageKey, invalidRaw);
const quarantineKey = quarantineInvalidLocalBackup(
  storage,
  storageKey,
  invalidRaw,
  12345
);
assert.equal(storage.getItem(storageKey), invalidRaw, "quarantine must not replace source");
assert.equal(storage.getItem(quarantineKey), invalidRaw);
assert.equal(readLastKnownValidLocalBackup(storage, storageKey), validRaw);

assert.throws(
  () => writeValidatedLocalBackup(storage, storageKey, invalidRaw),
  (error) => {
    assert.ok(error instanceof DesignPageLocalBackupError);
    assert.equal(error.code, "INVALID_JSON");
    assert.equal(error.message.includes("private-marker-do-not-log"), false);
    return true;
  }
);

const partialFailure = new MemoryStorage();
partialFailure.failKey = storageKey;
assert.throws(() => writeValidatedLocalBackup(partialFailure, storageKey, validRaw));
assert.equal(
  partialFailure.getItem(getLastKnownValidLocalBackupKey(storageKey)),
  validRaw,
  "last-known-valid must survive failure of the active-copy write"
);

discardPrimaryLocalBackup(storage, storageKey);
assert.equal(storage.getItem(storageKey), null);
assert.equal(storage.getItem(quarantineKey), invalidRaw);
assert.equal(readLastKnownValidLocalBackup(storage, storageKey), validRaw);

console.log("Design-page local-backup recovery checks passed.");
