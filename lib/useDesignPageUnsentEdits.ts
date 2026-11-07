"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LoadedDesignTransport } from "@/lib/design-api-client";
import type { CloudBaselineState } from "@/lib/design-page-cloud-baseline";
import { normalizeLoadedCloudDesign } from "@/lib/design-page-persistence-projection";
import type { NamedCameraView } from "@/lib/design-page-types";
import {
  clearUnsentEdits,
  readUnsentEdits,
  resolveUnsentEditsOnLoad,
  unsentEditsAsLoadedDesign,
  writeUnsentEdits,
  type UnsentEditsStorage,
} from "@/lib/design-page-unsent-edits";
import type { DesignPageCloudSaveConflictState } from "@/lib/useDesignPageCloudConflictCopyController";
import type { StoredDesign } from "@/lib/room-persistence";
import type { DesignSnapshot } from "@/lib/room-types";

export const UNSENT_EDITS_CONFLICT_MESSAGE =
  "Changes made on this device weren't saved to your account, and the design has changed elsewhere since.";
export const UNSENT_EDITS_RESUMED_TOAST = "Restored unsaved changes from this device";

type PendingRestore = {
  designId: string;
  revision: string;
  snapshot: DesignSnapshot;
  savedViews: NamedCameraView[];
  outcome: "resume" | "conflict";
};

export type UseDesignPageUnsentEditsInput = {
  designId: string | null;
  lastCloudRevision: string | null;
  hasPendingCloudSnapshotChanges: boolean;
  localBackupHydrated: boolean;
  cloudBaseline: CloudBaselineState;
  cloudSaveConflict: DesignPageCloudSaveConflictState | null;
  savedViews: NamedCameraView[];
  currentStoredDesignFingerprint: string;
  getStoredDesignForPersistence: (snapshot?: DesignSnapshot) => StoredDesign;
  actions: {
    setDesignSnapshot: (snapshot: DesignSnapshot) => void;
    hydratePersistedFloorPlanState: (snapshot: DesignSnapshot, clearWhenMissing?: boolean) => void;
    setSavedViews: (views: NamedCameraView[]) => void;
    setCloudSaveConflict: (conflict: DesignPageCloudSaveConflictState) => void;
    showRuleToast: (message: string) => void;
  };
  storage?: () => UnsentEditsStorage | null;
};

function browserStorage(): UnsentEditsStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** The unsent edits this browser holds for a design, as the editor would open them. */
function pendingRestoreFor(
  storage: UnsentEditsStorage,
  data: LoadedDesignTransport,
  loaded: { fingerprint: string; revision: string }
): PendingRestore | null {
  const record = readUnsentEdits(storage, data.id);
  if (!record) return null;
  try {
    const unsent = normalizeLoadedCloudDesign(unsentEditsAsLoadedDesign(data, record), data.id);
    const outcome = resolveUnsentEditsOnLoad({
      record,
      loadedRevision: loaded.revision,
      loadedFingerprint: loaded.fingerprint,
      unsentFingerprint: unsent.fingerprint,
    });
    if (outcome === "none") {
      clearUnsentEdits(storage, data.id);
      return null;
    }
    return { designId: data.id, revision: loaded.revision, snapshot: unsent.snapshot, savedViews: record.savedViews, outcome };
  } catch {
    clearUnsentEdits(storage, data.id);
    return null;
  }
}

type StorageSource = () => UnsentEditsStorage | null;
type RefBox<T> = { current: T };

/** Brings the opened design's unsent edits back once its account copy is the acknowledged baseline. */
function useApplyPendingRestore(
  pendingRef: RefBox<PendingRestore | null>,
  cloudBaseline: CloudBaselineState,
  actions: UseDesignPageUnsentEditsInput["actions"]
) {
  const baselineIdentity = cloudBaseline.status === "acknowledged" ? cloudBaseline.identity : null;
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || !baselineIdentity) return;
    if (baselineIdentity.designId !== pending.designId || baselineIdentity.revision !== pending.revision) return;
    pendingRef.current = null;
    actions.setDesignSnapshot(pending.snapshot);
    actions.hydratePersistedFloorPlanState(pending.snapshot, true);
    actions.setSavedViews(pending.savedViews);
    if (pending.outcome === "conflict") {
      actions.setCloudSaveConflict({ designId: pending.designId, detectedAt: Date.now(),
        message: UNSENT_EDITS_CONFLICT_MESSAGE, isWorking: false, resolutionError: null });
    } else {
      actions.showRuleToast(UNSENT_EDITS_RESUMED_TOAST);
    }
  }, [actions, baselineIdentity, pendingRef]);
}

/**
 * Writes the record while the account lacks the latest change, and removes it once a save of this
 * design has been acknowledged with nothing left to send. A loaded copy never removes it: opening
 * the design already decided what the record is for (`pendingRestoreFor`), and in a conflict the
 * edits keep the revision they were made on, not the newer one just opened.
 */
function usePersistUnsentEdits(
  input: UseDesignPageUnsentEditsInput,
  storage: StorageSource,
  pendingRef: RefBox<PendingRestore | null>,
  discardedDesignIdRef: RefBox<string | null>
) {
  const { designId, lastCloudRevision, hasPendingCloudSnapshotChanges, localBackupHydrated, cloudBaseline,
    cloudSaveConflict, savedViews, currentStoredDesignFingerprint, getStoredDesignForPersistence } = input;
  const savedByWrite = cloudBaseline.status === "acknowledged" && cloudBaseline.writeRequest !== null;
  useEffect(() => {
    const target = storage();
    if (!target || !localBackupHydrated || !designId) return;
    if (pendingRef.current?.designId === designId || discardedDesignIdRef.current === designId) return;
    if (hasPendingCloudSnapshotChanges && lastCloudRevision) {
      const kept = cloudSaveConflict?.designId === designId ? readUnsentEdits(target, designId) : null;
      writeUnsentEdits(target, { version: 1, designId, baseRevision: kept?.baseRevision ?? lastCloudRevision,
        savedAt: Date.now(), stored: getStoredDesignForPersistence(), savedViews });
    } else if (savedByWrite && !cloudSaveConflict) {
      clearUnsentEdits(target, designId);
    }
  }, [cloudSaveConflict, currentStoredDesignFingerprint, designId, discardedDesignIdRef,
    getStoredDesignForPersistence, hasPendingCloudSnapshotChanges, lastCloudRevision, localBackupHydrated,
    pendingRef, savedByWrite, savedViews, storage]);
}

/**
 * Keeps an account design's unsent edits in this browser while the server hasn't taken them,
 * and brings them back when the design is opened again (`design-page-unsent-edits.ts`).
 *
 * The edits come back once the account copy is the editor's acknowledged baseline, as if the
 * person had made them again: autosave then sends them on that revision, or, when the account
 * copy changed since, the conflict dialog asks which copy to keep.
 */
export function useDesignPageUnsentEdits(input: UseDesignPageUnsentEditsInput) {
  const storage = input.storage ?? browserStorage;
  const pendingRef = useRef<PendingRestore | null>(null);
  // "Discard local changes & reload": the record goes once the account copy has loaded.
  const discardedDesignIdRef = useRef<string | null>(null);

  const noteLoadedCloudDesign = useCallback(
    (data: LoadedDesignTransport, loaded: { fingerprint: string; revision: string }) => {
      const target = storage();
      if (target && discardedDesignIdRef.current === data.id) clearUnsentEdits(target, data.id);
      discardedDesignIdRef.current = null;
      pendingRef.current = target ? pendingRestoreFor(target, data, loaded) : null;
    },
    [storage]
  );
  const discardUnsentEdits = useCallback((designId: string) => {
    discardedDesignIdRef.current = designId;
    if (pendingRef.current?.designId === designId) pendingRef.current = null;
  }, []);
  /** The discarding reload didn't load: the edits stay, as the dialog says. */
  const keepUnsentEdits = useCallback((designId: string) => {
    if (discardedDesignIdRef.current === designId) discardedDesignIdRef.current = null;
  }, []);
  /** A copy saved from the conflict dialog took over: the original stays as the account has it. */
  const forgetUnsentEdits = useCallback((designId: string) => {
    const target = storage();
    if (target) clearUnsentEdits(target, designId);
  }, [storage]);

  useApplyPendingRestore(pendingRef, input.cloudBaseline, input.actions);
  usePersistUnsentEdits(input, storage, pendingRef, discardedDesignIdRef);
  return { noteLoadedCloudDesign, discardUnsentEdits, keepUnsentEdits, forgetUnsentEdits };
}
