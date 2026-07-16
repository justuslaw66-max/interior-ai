"use client";

import { useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import {
  normalizeDesignPageLocalBackup,
  type NormalizeDesignPageLocalBackupInput,
} from "@/lib/design-page-local-backup";
import type { NamedCameraView } from "@/lib/design-page-types";
import type { DesignSnapshot } from "@/lib/room-types";

export const DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY =
  "interior-ai:v1:livingroom-design";

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
    ) => Promise<boolean>;
    clearPersistedSnapshotFingerprint: () => void;
  };
};

/**
 * Restores the mount-time local backup once. The initial input ref makes that
 * contract explicit without suppressing dependency checks; late persistence
 * actions can be supplied through stable bridge callbacks.
 */
export function useDesignPageLocalBackupHydration(
  input: UseDesignPageLocalBackupHydrationInput
): void {
  const initialInputRef = useRef(input);

  useEffect(() => {
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

    if (typeof window === "undefined") {
      setLocalBackupHydrated(true);
      return;
    }

    let deferLocalBackupHydrated = false;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
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
        if (restored.format === "v3") {
          if (restored.cloudDesignId) {
            deferLocalBackupHydrated = true;
            void loadDesign(restored.cloudDesignId, {
              notFoundMessage: "Cloud design not found; restored local backup",
            })
              .then((loaded) => {
                if (!loaded) {
                  setDesignId(null);
                  setShareToken(null);
                  setShareEnabled(false);
                  clearPersistedSnapshotFingerprint();
                }
              })
              .finally(() => {
                setLocalBackupHydrated(true);
              });
          }
          hydratePersistedFloorPlanState(restored.snapshot);
        }
        clearHistory();
      }
      setSavedViews(restored.savedViews);
    } catch {
      // Ignore invalid saved data.
    } finally {
      if (!deferLocalBackupHydrated) {
        setLocalBackupHydrated(true);
      }
    }
  }, []);
}
