import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  clearUnsentEdits,
  readUnsentEdits,
  resolveUnsentEditsOnLoad,
  unsentEditsAsLoadedDesign,
  unsentEditsKey,
  UNSENT_EDITS_MAX_DESIGNS,
  writeUnsentEdits,
  type UnsentDesignEdits,
  type UnsentEditsStorage,
} from "../lib/design-page-unsent-edits";
import { getDesignPageSaveStatus, SIGNED_OUT_SAVE_ERROR } from "../lib/design-page-save-status";
import type { StoredDesign } from "../lib/room-persistence";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

/** An in-memory Storage that can be told to refuse writes past a byte budget. */
function memoryStorage(budgetBytes = Number.POSITIVE_INFINITY): UnsentEditsStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  const used = () => [...map.values()].reduce((sum, value) => sum + value.length, 0);
  return {
    map,
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      const previous = map.get(key)?.length ?? 0;
      if (used() - previous + value.length > budgetBytes) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const stored = { version: 3, rooms: [], activeRoomId: "living" } as unknown as StoredDesign;
function record(designId: string, savedAt: number, baseRevision = "2026-11-07T03:00:00.000Z"): UnsentDesignEdits {
  return { version: 1, designId, baseRevision, savedAt, stored, savedViews: [] };
}

// Written and read back per design, under its own key.
{
  const storage = memoryStorage();
  assert.equal(writeUnsentEdits(storage, record("design-a", 1)), true);
  assert.ok(storage.map.has(unsentEditsKey("design-a")));
  assert.deepEqual(readUnsentEdits(storage, "design-a"), record("design-a", 1));
  assert.equal(readUnsentEdits(storage, "design-b"), null);
  clearUnsentEdits(storage, "design-a");
  assert.equal(readUnsentEdits(storage, "design-a"), null);
}

// A record that can't be read is removed, never restored; one filed under another design is ignored.
{
  const storage = memoryStorage();
  storage.setItem(unsentEditsKey("design-a"), "{not json");
  assert.equal(readUnsentEdits(storage, "design-a"), null);
  assert.equal(storage.map.has(unsentEditsKey("design-a")), false);
  storage.setItem(unsentEditsKey("design-a"), JSON.stringify(record("design-z", 1)));
  assert.equal(readUnsentEdits(storage, "design-a"), null);
  storage.setItem(unsentEditsKey("design-a"), JSON.stringify({ ...record("design-a", 1), baseRevision: "soon" }));
  assert.equal(readUnsentEdits(storage, "design-a"), null);
}

// At most UNSENT_EDITS_MAX_DESIGNS designs; the oldest goes first, and rewriting one keeps the others.
{
  const storage = memoryStorage();
  for (let index = 0; index < UNSENT_EDITS_MAX_DESIGNS; index += 1) {
    assert.equal(writeUnsentEdits(storage, record(`design-${index}`, 10 + index)), true);
  }
  assert.equal(writeUnsentEdits(storage, record("design-0", 99)), true);
  assert.equal(storage.map.size, UNSENT_EDITS_MAX_DESIGNS);
  assert.equal(writeUnsentEdits(storage, record("design-new", 100)), true);
  assert.equal(storage.map.size, UNSENT_EDITS_MAX_DESIGNS);
  assert.equal(readUnsentEdits(storage, "design-1"), null, "the oldest record made room");
  assert.ok(readUnsentEdits(storage, "design-0"));
  assert.ok(readUnsentEdits(storage, "design-new"));
}

// A full storage drops the oldest other design to make room, and says so when nothing helps.
{
  const one = JSON.stringify(record("design-a", 1)).length;
  const storage = memoryStorage(one * 2 + 10);
  assert.equal(writeUnsentEdits(storage, record("design-a", 1)), true);
  assert.equal(writeUnsentEdits(storage, record("design-b", 2)), true);
  assert.equal(writeUnsentEdits(storage, record("design-c", 3)), true);
  assert.equal(readUnsentEdits(storage, "design-a"), null);
  assert.ok(readUnsentEdits(storage, "design-c"));
  assert.equal(writeUnsentEdits(memoryStorage(10), record("design-a", 1)), false);
}

// Opening a design: resume on the revision the edits were made on, ask when it moved, else nothing.
{
  const base = "2026-11-07T03:00:00.000Z";
  const input = { record: record("design-a", 1, base), loadedFingerprint: "cloud", unsentFingerprint: "local" };
  assert.equal(resolveUnsentEditsOnLoad({ ...input, loadedRevision: base }), "resume");
  assert.equal(resolveUnsentEditsOnLoad({ ...input, loadedRevision: "2026-11-07T03:00:00Z" }), "resume",
    "the same instant written differently is the same revision");
  assert.equal(resolveUnsentEditsOnLoad({ ...input, loadedRevision: "2026-11-07T03:05:00.000Z" }), "conflict");
  assert.equal(resolveUnsentEditsOnLoad({ ...input, unsentFingerprint: "cloud", loadedRevision: base }), "none",
    "edits the account already has are nothing to restore");
  assert.equal(resolveUnsentEditsOnLoad({ ...input, record: null, loadedRevision: base }), "none");
}

// The edits replace the loaded snapshot only; the transport's own saved views stay out of it.
{
  const loaded = { id: "design-a", title: "Flat", roomWidth: 5.8, roomDepth: 4, items: [], updatedAt: "x" };
  const asLoaded = unsentEditsAsLoadedDesign(loaded, record("design-a", 1));
  assert.equal(asLoaded.snapshot, stored);
  assert.equal(asLoaded.title, "Flat", "no name of its own: the account's");
  const renamed = { ...record("design-a", 1), stored: { ...stored, title: "Renamed offline" } as StoredDesign };
  assert.equal(unsentEditsAsLoadedDesign(loaded, renamed).title, "Renamed offline", "an unsent rename comes back");
}

// An expired sign-in: "Signed out" with Sign in, not a Retry that can only fail again.
{
  const status = getDesignPageSaveStatus({
    designId: "design-a", isAuthenticated: true, isSaving: false, lastCloudSaveError: SIGNED_OUT_SAVE_ERROR,
    lastDbSaveAt: 1, lastLocalAutosaveAt: 2, lastLocalSaveError: null,
    hasPendingCloudSnapshotChanges: true, hasCloudConflict: false,
  });
  assert.equal(status.kind, "failed");
  assert.equal(status.label, "Signed out");
  assert.equal(status.retryLabel, "Sign in");
  assert.equal(status.canRetry, true);
}

// Wiring: a loaded design is reported, discarding clears the record first, 401 signs in again.
{
  const load = source("lib/useDesignPageCloudLoadController.ts");
  assert.match(load, /actions\.noteLoadedCloudDesign\?\.\(data, normalized\);/);
  const persistence = source("lib/useDesignPagePersistence.ts");
  assert.match(persistence, /fetchShareStatus,\s*showRuleToast, noteLoadedCloudDesign,/);
  assert.match(persistence,
    /discardUnsentEdits\(conflict\.designId\);\s*const result = await loadDesignAfterCancellingConflictCopy/);
  assert.match(persistence, /keepUnsentEdits\(conflict\.designId\);\s*setCloudSaveConflict\(\(previous\) =>/,
    "a discarding reload that fails keeps the edits, as the dialog says");
  assert.match(persistence, /if \(await saveConflictAsNewCopy\(\) && sourceDesignId\) forgetUnsentEdits\(sourceDesignId\);/,
    "only a copy that took over forgets the original's edits");
  assert.match(source("lib/useDesignPageCloudConflictCopyController.ts"), /return result\.status === "activated";/);
  assert.match(persistence, /saveConflictAsNewCopy: saveConflictCopy,/);
  assert.match(persistence, /error\.kind === "unauthorized"/);
  assert.match(persistence, /lastCloudSaveError === SIGNED_OUT_SAVE_ERROR\) return requestSignIn\(\)/);
  const hook = source("lib/useDesignPageUnsentEdits.ts");
  assert.match(hook, /cloudSaveConflict\?\.designId === designId \? readUnsentEdits/,
    "a conflict keeps the revision the edits were made on");
  assert.match(hook, /cloudBaseline\.status === "acknowledged" && cloudBaseline\.writeRequest !== null/,
    "only an acknowledged save removes the record; a loaded copy never does");
  assert.match(hook, /\} else if \(savedByWrite && !cloudSaveConflict\) \{\s*clearUnsentEdits/);
  assert.match(hook, /pendingRef\.current\?\.designId === designId/, "a pending restore holds back only its own design");
  assert.doesNotMatch(hook, /copySourceRef/, "nothing guesses a copy from the editor's state");
  assert.doesNotMatch(hook, /useState/, "the restore's refs stay refs");
  assert.doesNotMatch(hook, /beforeunload/);
  assert.match(source("components/editor/command-bar/CommandBarSaveStatus.tsx"), /saveStatus\.retryLabel \?\? "Retry"/);
}

console.log("design-page unsent edits: ok");
