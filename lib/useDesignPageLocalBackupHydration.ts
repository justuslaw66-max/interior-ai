"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  normalizeDesignPageLocalBackup,
  type NormalizeDesignPageLocalBackupInput,
} from "@/lib/design-page-local-backup";
import {
  DesignPageLocalBackupError,
  discardPrimaryLocalBackup,
  getLocalBackupSourceVersion,
  quarantineInvalidLocalBackup,
  readLastKnownValidLocalBackup,
  seedLastKnownValidLocalBackup,
} from "@/lib/design-page-local-backup-recovery";
import { getSerializedDesignDocumentByteLength } from "@/lib/design-document-contract";
import type { NamedCameraView } from "@/lib/design-page-types";
import type { DesignSnapshot } from "@/lib/room-types";

export const DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY =
  "interior-ai:v1:livingroom-design";

export type DesignPageCloudLoadResult =
  | "loaded"
  | "missing"
  | "unavailable"
  | "superseded";

type LocalBackupNormalizationState = Pick<
  NormalizeDesignPageLocalBackupInput["state"],
  "roomWidth" | "roomDepth" | "wallThickness"
>;

export type UseDesignPageLocalBackupHydrationInput = {
  state: LocalBackupNormalizationState;
  configuration: NormalizeDesignPageLocalBackupInput["configuration"] & {
    storageKey: string;
  };
  refs: {
    designSnapshot: { current: DesignSnapshot };
  };
  actions: {
    setDesignSnapshot: (snapshot: DesignSnapshot) => void;
    setDesignId: Dispatch<SetStateAction<string | null>>;
    setShareToken: Dispatch<SetStateAction<string | null>>;
    setShareEnabled: Dispatch<SetStateAction<boolean>>;
    setLocalBackupHydrated: Dispatch<SetStateAction<boolean>>;
    setSavedViews: Dispatch<SetStateAction<NamedCameraView[]>>;
    hydratePersistedFloorPlanState: (snapshot: DesignSnapshot) => void;
    clearHistory: () => void;
    loadDesign: (
      id: string,
      options?: { notFoundMessage?: string }
    ) => Promise<DesignPageCloudLoadResult>;
    clearPersistedSnapshotFingerprint: () => void;
  };
};

export type DesignPageLocalBackupRecoveryState = {
  isBlocked: boolean;
  isWorking: boolean;
  code: DesignPageLocalBackupError["code"] | "UNKNOWN" | null;
  message: string | null;
  sourceVersion: string | null;
  byteLength: number;
  quarantineKey: string | null;
  quarantineSucceeded: boolean;
  lastKnownValidAvailable: boolean;
};

export type DesignPageLocalBackupRecoveryActions = {
  retry: () => Promise<void>;
  openLastKnownValid: () => Promise<void>;
  downloadRawBackup: () => void;
  startCleanCopy: () => void;
};

export type DesignPageLocalBackupHydrationResult = {
  state: DesignPageLocalBackupRecoveryState;
  actions: DesignPageLocalBackupRecoveryActions;
};

/**
 * Restores the mount-time local backup once. The initial input ref makes that
 * contract explicit without suppressing dependency checks; late persistence
 * actions can be supplied through stable bridge callbacks.
 */
export function useDesignPageLocalBackupHydration(
  input: UseDesignPageLocalBackupHydrationInput
): DesignPageLocalBackupHydrationResult {
  const initialInputRef = useRef(input);
  const hydrationStartedRef = useRef(false);
  const invalidRawRef = useRef<string | null>(null);
  const quarantineKeyRef = useRef<string | null>(null);
  const [recovery, setRecovery] = useState<DesignPageLocalBackupRecoveryState>({
    isBlocked: false,
    isWorking: false,
    code: null,
    message: null,
    sourceVersion: null,
    byteLength: 0,
    quarantineKey: null,
    quarantineSucceeded: false,
    lastKnownValidAvailable: false,
  });

  const restoreRawBackup = useCallback(async (raw: string): Promise<boolean> => {
    const {
      state: { roomWidth, roomDepth, wallThickness },
      configuration: {
        storageKey,
        catalogItems,
        resolveConfiguredPlanningDimsMm,
      },
      refs: { designSnapshot },
      actions: {
        setDesignSnapshot,
        setDesignId,
        setShareToken,
        setShareEnabled,
        setLocalBackupHydrated,
        setSavedViews,
        hydratePersistedFloorPlanState,
        clearHistory,
        loadDesign,
        clearPersistedSnapshotFingerprint,
      },
    } = initialInputRef.current;

    setRecovery((previous) => ({ ...previous, isWorking: true }));
    try {
      const restored = normalizeDesignPageLocalBackup({
        rawBackup: raw,
        state: {
          activeRoomId: designSnapshot.current.activeRoomId,
          roomWidth,
          roomDepth,
          wallThickness,
        },
        configuration: {
          catalogItems,
          resolveConfiguredPlanningDimsMm,
        },
      });

      if (restored.snapshot) {
        setDesignSnapshot(restored.snapshot);
        hydratePersistedFloorPlanState(restored.snapshot);
        clearHistory();
      }
      setSavedViews(restored.savedViews);

      if (restored.cloudDesignId) {
        // Keep the validated backup identity stable while its cloud snapshot is
        // checked. Persistence writers remain gated until hydration completes,
        // and only a definitive missing/inaccessible response detaches it.
        setDesignId(restored.cloudDesignId);
        const loadResult = await loadDesign(restored.cloudDesignId, {
          notFoundMessage: "Cloud design not found; restored local backup",
        });
        if (loadResult === "missing") {
          setDesignId(null);
          setShareToken(null);
          setShareEnabled(false);
          clearPersistedSnapshotFingerprint();
        }
      }

      try {
        seedLastKnownValidLocalBackup(window.localStorage, storageKey, raw);
      } catch {
        // The valid design is still open; the next explicit backup reports any
        // storage failure through the normal save-status surface.
      }
      invalidRawRef.current = null;
      setRecovery({
        isBlocked: false,
        isWorking: false,
        code: null,
        message: null,
        sourceVersion: null,
        byteLength: 0,
        quarantineKey: quarantineKeyRef.current,
        quarantineSucceeded: Boolean(quarantineKeyRef.current),
        lastKnownValidAvailable: true,
      });
      setLocalBackupHydrated(true);
      return true;
    } catch (error) {
      const failure =
        error instanceof DesignPageLocalBackupError
          ? error
          : new DesignPageLocalBackupError(
              "INVALID_DOCUMENT",
              "Local design backup could not be validated.",
              getLocalBackupSourceVersion(raw)
            );
      invalidRawRef.current = raw;
      let quarantineSucceeded = Boolean(quarantineKeyRef.current);
      if (!quarantineKeyRef.current) {
        try {
          quarantineKeyRef.current = quarantineInvalidLocalBackup(
            window.localStorage,
            storageKey,
            raw
          );
          quarantineSucceeded = true;
        } catch {
          quarantineSucceeded = false;
        }
      }
      setRecovery({
        isBlocked: true,
        isWorking: false,
        code: failure.code,
        message: failure.message,
        sourceVersion: failure.sourceVersion,
        byteLength: getSerializedDesignDocumentByteLength(raw),
        quarantineKey: quarantineKeyRef.current,
        quarantineSucceeded,
        lastKnownValidAvailable: (() => {
          try {
            return Boolean(
              readLastKnownValidLocalBackup(window.localStorage, storageKey)
            );
          } catch {
            return false;
          }
        })(),
      });
      return false;
    }
  }, []);

  useEffect(() => {
    const { configuration: { storageKey }, actions: { setLocalBackupHydrated } } =
      initialInputRef.current;

    // React Strict Mode replays passive mount effects in development. Starting
    // two cloud restores would let the aborted request clear an identity that
    // the successful request just restored.
    if (hydrationStartedRef.current) return;
    hydrationStartedRef.current = true;

    if (typeof window === "undefined") {
      setLocalBackupHydrated(true);
      return;
    }

    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(storageKey);
    } catch {
      setLocalBackupHydrated(true);
      return;
    }
    if (!raw) {
      setLocalBackupHydrated(true);
      return;
    }
    void restoreRawBackup(raw);
  }, [restoreRawBackup]);

  const retry = useCallback(async () => {
    const raw = invalidRawRef.current;
    if (raw) await restoreRawBackup(raw);
  }, [restoreRawBackup]);

  const openLastKnownValid = useCallback(async () => {
    const { configuration: { storageKey } } = initialInputRef.current;
    let raw: string | null = null;
    try {
      raw = readLastKnownValidLocalBackup(window.localStorage, storageKey);
    } catch {
      setRecovery((previous) => ({
        ...previous,
        isWorking: false,
        code: "STORAGE_WRITE_FAILED",
        message: "The browser could not read the last valid local backup.",
      }));
      return;
    }
    if (raw) await restoreRawBackup(raw);
  }, [restoreRawBackup]);

  const downloadRawBackup = useCallback(() => {
    const raw = invalidRawRef.current;
    if (!raw || typeof document === "undefined") return;
    const url = URL.createObjectURL(
      new Blob([raw], { type: "application/json;charset=utf-8" })
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `interior-ai-unreadable-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, []);

  const startCleanCopy = useCallback(() => {
    const {
      configuration: { storageKey },
      actions: {
        setDesignId,
        setShareToken,
        setShareEnabled,
        setLocalBackupHydrated,
        clearPersistedSnapshotFingerprint,
      },
    } = initialInputRef.current;
    try {
      discardPrimaryLocalBackup(window.localStorage, storageKey);
    } catch {
      setRecovery((previous) => ({
        ...previous,
        isWorking: false,
        code: "STORAGE_WRITE_FAILED",
        message: "The browser could not remove the active local backup.",
      }));
      return;
    }
    setDesignId(null);
    setShareToken(null);
    setShareEnabled(false);
    clearPersistedSnapshotFingerprint();
    invalidRawRef.current = null;
    setRecovery((previous) => ({
      ...previous,
      isBlocked: false,
      isWorking: false,
    }));
    setLocalBackupHydrated(true);
  }, []);

  return {
    state: recovery,
    actions: {
      retry,
      openLastKnownValid,
      downloadRawBackup,
      startCleanCopy,
    },
  };
}
