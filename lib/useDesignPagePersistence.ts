"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { track, trackProductEvent } from "@/lib/analytics";
import { getAnonId } from "@/lib/anon";
import { designApi, DesignApiError } from "@/lib/design-api-client";
import { resolveDesignTitle, withoutDesignTitle } from "@/lib/design-title";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { executeDesignPageCloudWrite } from "@/lib/design-page-cloud-write-execution";
import { createDesignPageCloudWriteQueue } from "@/lib/design-page-cloud-write-queue";
import { getDesignPageSaveStatus, needsSaveBeforeLeaving } from "@/lib/design-page-save-status";
import { writeValidatedLocalBackup } from "@/lib/design-page-local-backup-recovery";
import type { NamedCameraView, Style } from "@/lib/design-page-types";
import {
  loadGuestDesigns,
  markGuestDesignClaimed,
  saveGuestDesign,
} from "@/lib/guestDesigns";
import type { StoredDesign } from "@/lib/room-persistence";
import type { DesignItem, DesignSnapshot, ZoneMin } from "@/lib/room-types";
import { createDesignPageLoadRequestCoordinator } from "@/lib/design-page-requested-design-load-coordinator";
import type { ConflictCopyRouteActions } from "@/lib/design-page-cloud-conflict-copy-transition";
import { useDesignPageCloudBaselineController } from "@/lib/useDesignPageCloudBaselineController";
import {
  useDesignPageCloudConflictCopyController,
  type DesignPageCloudSaveConflictState,
} from "@/lib/useDesignPageCloudConflictCopyController";
import {
  sanitizeDesignPageSavedViews,
  useDesignPageCloudLoadController,
} from "@/lib/useDesignPageCloudLoadController";
import {
  useDesignPageManualCloudSave,
  useDesignPagePreserveCloudSave,
} from "@/lib/useDesignPageExplicitCloudSaveController";
import { useGuestSavePromptController } from "@/lib/useGuestSavePromptController";
import { useDesignPageShareLink } from "@/lib/useDesignPageShareLink";

export { sanitizeDesignPageSavedViews };
export type { DesignPageCloudSaveConflictState };

type Budget = "$" | "$$" | "$$$";
type DesignMode = "homeowner" | "designer";
export type { PreserveCurrentDesignResult } from "@/lib/useDesignPageExplicitCloudSaveController";

type DesignPagePersistenceState = {
  identity: {
    designId: string | null;
    shareToken: string | null;
    shareEnabled: boolean;
    guestPromptScopeKey: string;
  };
  document: {
    designSnapshot: DesignSnapshot;
    currentStoredDesignFingerprint: string;
    items: DesignItem[];
    zones: ZoneMin[];
    savedViews: NamedCameraView[];
    roomWidth: number;
    roomDepth: number;
    style: Style;
    budget: Budget;
    mode: DesignMode;
    notes: string;
  };
  session: {
    isAuthenticated: boolean;
    isDesigner: boolean;
  };
  lifecycle: {
    localBackupHydrated: boolean;
  };
};

type DesignPagePersistenceActions = ConflictCopyRouteActions & {
  setDesignId: Dispatch<SetStateAction<string | null>>;
  setShareToken: Dispatch<SetStateAction<string | null>>;
  setShareEnabled: Dispatch<SetStateAction<boolean>>;
  setDesignSnapshot: (next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot)) => void;
  hydratePersistedFloorPlanState: (
    snapshot: DesignSnapshot,
    clearWhenMissing?: boolean
  ) => void;
  clearHistory: () => void;
  setMode: Dispatch<SetStateAction<DesignMode>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setSavedViews: Dispatch<SetStateAction<NamedCameraView[]>>;
  setStyle: Dispatch<SetStateAction<Style>>;
  setBudget: Dispatch<SetStateAction<Budget>>;
  showRuleToast: (message: string) => void;
  showMaxDesignUpgrade: () => void;
  requestSignIn: () => void;
};

type DesignPagePersistenceConfiguration = {
  storageKey: string;
  cloudSaveDelayMs: number;
  guestSaveDelayMs: number;
};

type DesignPagePersistenceRefs = {
  getStoredDesignForPersistence: (snapshot?: DesignSnapshot) => StoredDesign;
  fingerprintStoredDesign: (stored: StoredDesign) => string;
};

export type UseDesignPagePersistenceParams = {
  state: DesignPagePersistenceState;
  actions: DesignPagePersistenceActions;
  configuration: DesignPagePersistenceConfiguration;
  refs: DesignPagePersistenceRefs;
};

export function useDesignPagePersistence({
  state: {
    identity: { designId, shareToken, shareEnabled, guestPromptScopeKey },
    document: {
      designSnapshot,
      currentStoredDesignFingerprint,
      items,
      zones,
      savedViews,
      roomWidth,
      roomDepth,
      style,
      budget,
      mode,
      notes,
    },
    session: { isAuthenticated, isDesigner },
    lifecycle: { localBackupHydrated },
  },
  actions: {
    readDesignRoute, replaceDesignRoute, restoreDesignRoute, setDesignId,
    setShareToken, setShareEnabled, setDesignSnapshot,
    hydratePersistedFloorPlanState,
    clearHistory,
    setMode, setNotes,
    setSavedViews,
    setStyle,
    setBudget,
    showRuleToast,
    showMaxDesignUpgrade,
    requestSignIn,
  },
  configuration: { storageKey, cloudSaveDelayMs, guestSaveDelayMs },
  refs: { getStoredDesignForPersistence, fingerprintStoredDesign },
}: UseDesignPagePersistenceParams) {
  const [lastLocalAutosaveAt, setLastLocalAutosaveAt] = useState<number | null>(null);
  const [lastDbSaveAt, setLastDbSaveAt] = useState<number | null>(null);
  const [lastCloudRevision, setLastCloudRevision] = useState<string | null>(null);
  const [cloudRetryNonce, setCloudRetryNonce] = useState(0);
  const [lastPersistedSnapshotFingerprint, setLastPersistedSnapshotFingerprint] =
    useState<string | null>(null);
  const [lastLocalSaveError, setLastLocalSaveError] = useState<string | null>(null);
  const [lastCloudSaveError, setLastCloudSaveError] = useState<string | null>(null);
  const [cloudSaveConflict, setCloudSaveConflict] =
    useState<DesignPageCloudSaveConflictState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { state: shareLinkState, actions: shareLinkActions } =
    useDesignPageShareLink({ designId, setShareToken, setShareEnabled });
  const { resetShareLink } = shareLinkActions;
  const firstSaveRef = useRef(false);
  const conflictCopyCancelRef = useRef<() => void>(() => undefined);
  const documentEpochRef = useRef(0);
  const [cloudWriteQueue] = useState(() =>
    createDesignPageCloudWriteQueue({
      designId,
      revision: lastCloudRevision,
      documentEpoch: documentEpochRef.current,
    })
  );
  const shareStatusAbortRef = useRef<AbortController | null>(null);
  const [designLoadRequest] = useState(createDesignPageLoadRequestCoordinator);
  const finishCloudBaselineSaving = useCallback(
    (writeRequest: Parameters<
      typeof cloudWriteQueue.requestIdentityIsLatest
    >[0] | null) => {
      if (
        !writeRequest ||
        cloudWriteQueue.requestIdentityIsLatest(writeRequest)
      ) {
        setIsSaving(false);
      }
    },
    [cloudWriteQueue]
  );
  const cloudBaselineController = useDesignPageCloudBaselineController({
    designId, revision: lastCloudRevision,
    currentFingerprint: currentStoredDesignFingerprint,
    acknowledgeFingerprint: setLastPersistedSnapshotFingerprint,
    finishSaving: finishCloudBaselineSaving,
    documentEpochRef,
  });
  const cloudBaseline = cloudBaselineController.state.baseline;
  const { currentWriteIsBlocked: currentCloudWriteIsBlocked,
    detach: detachCloudBaseline, stageWrite: stageCloudWriteBaseline } =
    cloudBaselineController.actions;

  const invalidateCloudWrites = useCallback(() => {
    cloudWriteQueue.invalidate();
    setIsSaving(false);
  }, [cloudWriteQueue]);

  const installCloudWriteIdentity = useCallback(
    (identity: {
      designId: string;
      revision: string;
      documentEpoch: number;
    }) => cloudWriteQueue.installIdentity(identity),
    [cloudWriteQueue]
  );

  const recordCloudSaveFailure = useCallback(
    (error: unknown, targetDesignId: string | null, fallback: string) => {
      const message = userFacingErrorMessage(error, fallback);
      setLastCloudSaveError(message);
      if (
        targetDesignId &&
        error instanceof DesignApiError &&
        error.kind === "conflict"
      ) {
        setCloudSaveConflict((previous) =>
          previous?.designId === targetDesignId
            ? {
                ...previous,
                message,
                isWorking: false,
                resolutionError: null,
              }
            : {
                designId: targetDesignId,
                detectedAt: Date.now(),
                message,
                isWorking: false,
                resolutionError: null,
              }
        );
      }
      return message;
    },
    []
  );

  const fetchShareStatus = useCallback(
    async (id?: string) => {
      const targetId = id ?? designId;
      if (!targetId) return;
      const requestEpoch = documentEpochRef.current;
      shareStatusAbortRef.current?.abort();
      const controller = new AbortController();
      shareStatusAbortRef.current = controller;

      try {
        const data = await designApi.get(targetId, controller.signal);
        if (requestEpoch !== documentEpochRef.current) return;
        setShareToken(data?.shareToken ?? null);
        setShareEnabled(Boolean(data?.shareEnabled));
      } catch {
        // ignore share status errors
      } finally {
        if (shareStatusAbortRef.current === controller) {
          shareStatusAbortRef.current = null;
        }
      }
    },
    [designId, setShareEnabled, setShareToken]
  );

  const enableShare = useCallback(
    async (id: string) => {
      const requestEpoch = documentEpochRef.current;
      try {
        const data = await designApi.share(id);
        if (requestEpoch === documentEpochRef.current) {
          setShareToken(data?.shareToken ?? null);
          setShareEnabled(true);
          if (data?.shareToken) {
            track("share_link_created", {
              design_id: id,
              shared_context: true,
            });
            trackProductEvent("design_shared", {
              source: "share_link",
              result: "success",
            });
          }
        }
      } catch {
        // Explicit share actions surface errors; automatic designer sharing is best-effort.
      }
    },
    [setShareEnabled, setShareToken]
  );

  const sharedExplicitSaveActions = {
    currentWriteIsBlocked: currentCloudWriteIsBlocked,
    setIsSaving,
    setLastCloudSaveError,
    setLastCloudRevision,
    setLastDbSaveAt,
    setCloudSaveConflict,
    showMaxDesignUpgrade,
    recordCloudSaveFailure,
  };
  const sharedExplicitSaveAdapters = {
    queue: cloudWriteQueue,
    stageWrite: stageCloudWriteBaseline,
    getStoredDesign: getStoredDesignForPersistence,
    fingerprintStoredDesign,
  };
  const saveDesignToCloud = useDesignPageManualCloudSave({
    state: {
      savedViews, style, budget, mode, notes,
      isAuthenticated, isDesigner, itemsCount: items.length,
    },
    actions: {
      ...sharedExplicitSaveActions,
      setDesignId,
      fetchShareStatus,
      enableShare,
      showRuleToast,
    },
    adapters: sharedExplicitSaveAdapters,
    refs: { firstSave: firstSaveRef },
  });
  const preserveCurrentDesign = useDesignPagePreserveCloudSave({
    state: {
      savedViews, style, budget, mode, notes, isAuthenticated,
      designSnapshot, items, zones, roomWidth, roomDepth,
    },
    actions: sharedExplicitSaveActions,
    adapters: sharedExplicitSaveAdapters,
  });

  const detachCurrentDesignForNewDraft = useCallback(() => {
    conflictCopyCancelRef.current();
    detachCloudBaseline();
    cloudWriteQueue.invalidate({
      designId: null,
      revision: null,
      documentEpoch: documentEpochRef.current,
    });
    shareStatusAbortRef.current?.abort();
    designLoadRequest.cancel();
    setDesignId(null);
    setShareToken(null);
    setShareEnabled(false);
    setLastPersistedSnapshotFingerprint(null);
    setLastDbSaveAt(null);
    setLastCloudSaveError(null);
    setCloudSaveConflict(null);
    setLastCloudRevision(null);
    setLastLocalAutosaveAt(null);
    setLastLocalSaveError(null);
    setIsSaving(false);
    resetShareLink();
    setSavedViews([]);
    setNotes("");
    // The new draft doesn't keep the saved design's name; a template may give it its own.
    setDesignSnapshot(withoutDesignTitle);
    firstSaveRef.current = false;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // The next local-backup effect will retry with the new draft.
    }
  }, [
    cloudWriteQueue,
    designLoadRequest,
    detachCloudBaseline,
    resetShareLink,
    setDesignId, setDesignSnapshot,
    setNotes,
    setSavedViews,
    setShareEnabled,
    setShareToken,
    storageKey,
  ]);

  const { loadDesign, cancelDesignLoad } = useDesignPageCloudLoadController({
    baseline: cloudBaselineController.actions,
    requestCoordinator: designLoadRequest,
    actions: {
      setDesignSnapshot,
      hydratePersistedFloorPlanState,
      clearHistory,
      setDesignId,
      setLastPersistedFingerprint: setLastPersistedSnapshotFingerprint,
      setLastCloudRevision,
      setLastDbSaveAt,
      setLastCloudSaveError,
      setCloudSaveConflict,
      invalidateCloudWrites,
      installCloudWriteIdentity,
      setMode,
      setNotes,
      setSavedViews,
      setStyle,
      setBudget,
      fetchShareStatus,
      enableShare,
      showRuleToast,
    },
  });
  const { save: saveConflictAsNewCopy, cancel: cancelConflictCopy } =
    useDesignPageCloudConflictCopyController({
    state: {
      cloudSaveConflict, designId, shareToken, shareEnabled,
      currentStoredDesignFingerprint, lastCloudRevision, lastDbSaveAt,
      lastPersistedSnapshotFingerprint, lastCloudSaveError, isSaving,
      isDesigner, savedViews, style, budget, mode, notes,
    },
    actions: {
      currentCloudWriteIsBlocked, cloudBaseline: cloudBaselineController.actions,
      readDesignRoute, replaceDesignRoute, restoreDesignRoute, cancelDesignLoad,
      setCloudSaveConflict, setDesignId, setShareToken, setShareEnabled,
      setLastCloudRevision, setLastDbSaveAt, setLastPersistedSnapshotFingerprint,
      setLastCloudSaveError, setIsSaving, fetchShareStatus, enableShare,
      showRuleToast,
    },
    adapters: {
      cloudWriteQueue,
      getStoredDesignForPersistence,
      fingerprintStoredDesign,
    },
  });
  conflictCopyCancelRef.current = cancelConflictCopy;
  const loadDesignAfterCancellingConflictCopy = useCallback(
    (...args: Parameters<typeof loadDesign>) => {
      cancelConflictCopy();
      return loadDesign(...args);
    },
    [cancelConflictCopy, loadDesign]
  );
  const cancelDesignTransitions = useCallback(() => {
    cancelConflictCopy();
    cancelDesignLoad();
  }, [cancelDesignLoad, cancelConflictCopy]);
  const reloadCloudAfterConflict = useCallback(async () => {
    const conflict = cloudSaveConflict;
    if (!conflict || conflict.isWorking) return;
    setCloudSaveConflict({
      ...conflict,
      isWorking: true,
      resolutionError: null,
    });
    const result = await loadDesignAfterCancellingConflictCopy(conflict.designId);
    if (result === "loaded") {
      setLastCloudSaveError(null);
      setCloudSaveConflict(null);
      showRuleToast("Newer cloud copy loaded");
      return;
    }
    setCloudSaveConflict((previous) =>
      previous?.designId === conflict.designId
        ? {
            ...previous,
            isWorking: false,
            resolutionError:
              "The newer cloud copy could not be loaded. Your local backup is unchanged.",
          }
        : previous
    );
  }, [cloudSaveConflict, loadDesignAfterCancellingConflictCopy, showRuleToast]);

  const claimGuestDesign = useCallback(async () => {
    if (isAuthenticated) return;
    const anonymousId = getAnonId();
    const existing = loadGuestDesigns().find((entry) => entry.localId === "current");
    if (existing?.dbDesignId) return;

    const payload = {
      anonymousId,
      roomType: "living_room",
      itemsCount: items.length,
      designSnapshot: {
        title: resolveDesignTitle(designSnapshot.title),
        roomWidth,
        roomDepth,
        items,
        zones,
        snapshot: getStoredDesignForPersistence(),
        style,
        budget,
        mode,
        notes,
      },
    };

    const data = await designApi.claim(payload);
    if (data?.designId) {
      markGuestDesignClaimed("current", data.designId);
    }
  }, [
    budget, designSnapshot.title,
    getStoredDesignForPersistence,
    isAuthenticated,
    items,
    mode,
    notes,
    roomDepth,
    roomWidth,
    style,
    zones,
  ]);

  const guestPromptController = useGuestSavePromptController({
    scopeKey: guestPromptScopeKey,
    claimGuestDesign,
    requestSignIn,
  });

  const clearPersistedSnapshotFingerprint = useCallback(() => {
    detachCloudBaseline();
    cloudWriteQueue.invalidate({
      designId: null,
      revision: null,
      documentEpoch: documentEpochRef.current,
    });
    setLastPersistedSnapshotFingerprint(null);
    setLastCloudRevision(null);
  }, [cloudWriteQueue, detachCloudBaseline]);

  // A share-status read may finish after the editor closes (for My designs); React drops it.
  useEffect(() => {
    return () => {
      designLoadRequest.cancel();
    };
  }, [designLoadRequest]);

  useEffect(() => {
    if (
      !lastCloudSaveError ||
      !designId ||
      !isAuthenticated ||
      cloudSaveConflict
    ) {
      return;
    }
    const retryAfterReconnect = () => {
      setLastCloudSaveError(null);
      setCloudRetryNonce((value) => value + 1);
    };
    window.addEventListener("online", retryAfterReconnect);
    return () => window.removeEventListener("online", retryAfterReconnect);
  }, [cloudSaveConflict, designId, isAuthenticated, lastCloudSaveError]);

  useEffect(() => {
    if (!isDesigner) return;
    if (!designId || shareEnabled) return;
    void enableShare(designId);
  }, [designId, enableShare, isDesigner, shareEnabled]);

  useEffect(() => {
    if (!designId) setIsSaving(false);
  }, [designId]);

  const writeLocalDesignBackup = useCallback(() => {
    try {
      const serialized = JSON.stringify({
        ...getStoredDesignForPersistence(designSnapshot),
        savedViews,
        designId,
      });
      writeValidatedLocalBackup(window.localStorage, storageKey, serialized);
      setLastLocalAutosaveAt(Date.now());
      setLastLocalSaveError(null);
      return true;
    } catch (error) {
      setLastLocalSaveError(userFacingErrorMessage(error, "Local backup failed"));
      return false;
    }
  }, [
    designId,
    designSnapshot,
    getStoredDesignForPersistence,
    savedViews,
    storageKey,
  ]);

  useEffect(() => {
    if (!localBackupHydrated) return;
    writeLocalDesignBackup();
  }, [localBackupHydrated, writeLocalDesignBackup]);

  useEffect(() => {
    if (!designId) return;
    if (!localBackupHydrated) return;
    if (currentCloudWriteIsBlocked()) {
      setIsSaving(false);
      return;
    }
    if (cloudSaveConflict) {
      setIsSaving(false);
      return;
    }
    if (
      lastPersistedSnapshotFingerprint &&
      currentStoredDesignFingerprint === lastPersistedSnapshotFingerprint
    ) {
      setIsSaving(false);
      return;
    }

    let cancelled = false;
    let result: Awaited<ReturnType<typeof executeDesignPageCloudWrite>> | null =
      null;
    setIsSaving(true);
    const timer = setTimeout(async () => {
      try {
        const snapshot = getStoredDesignForPersistence();
        const fingerprint = fingerprintStoredDesign(snapshot);
        result = await executeDesignPageCloudWrite({
          queue: cloudWriteQueue,
          kind: "update",
          fingerprint,
          prepare: (binding) => {
            if (!binding.designId || !binding.revision) {
              throw new Error(
                "Autosave was rejected because its cloud identity was incomplete."
              );
            }
            const targetDesignId = binding.designId;
            const payload = {
              items,
              zones,
              savedViews,
              roomWidth,
              roomDepth,
              snapshot, title: resolveDesignTitle(snapshot.title),
              expectedUpdatedAt: binding.revision,
            };
            return () => designApi.update(targetDesignId, payload);
          },
          failureIsRelevant: () => !cancelled,
          stage: stageCloudWriteBaseline,
        });
        if (result.status === "invalid") {
          setLastCloudSaveError("Autosave returned no valid cloud revision.");
          return;
        }
        if (result.status === "failed") {
          recordCloudSaveFailure(
            result.error,
            result.binding.designId,
            "Autosave failed"
          );
          return;
        }
        if (result.status !== "saved") return;
        setLastCloudRevision(result.revision);
        if (!cancelled && cloudWriteQueue.requestIsLatest(result.binding)) {
          setLastDbSaveAt(Date.now());
          setLastCloudSaveError(null);
          setCloudSaveConflict(null);
        }
      } catch (error) {
        if (
          !cancelled &&
          (!result || cloudWriteQueue.failureIsCurrent(result.binding))
        ) {
          recordCloudSaveFailure(
            error,
            result?.binding.designId ?? null,
            "Autosave failed"
          );
        }
      } finally {
        if (
          !cancelled &&
          (!result || cloudWriteQueue.requestIsLatest(result.binding))
        ) {
          setIsSaving(false);
        }
      }
    }, cloudSaveDelayMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    cloudSaveDelayMs,
    cloudRetryNonce,
    cloudSaveConflict,
    cloudBaseline,
    cloudWriteQueue,
    currentCloudWriteIsBlocked,
    currentStoredDesignFingerprint,
    designId,
    fingerprintStoredDesign,
    getStoredDesignForPersistence,
    items,
    lastPersistedSnapshotFingerprint,
    localBackupHydrated,
    recordCloudSaveFailure,
    roomDepth,
    roomWidth,
    savedViews,
    stageCloudWriteBaseline,
    zones,
  ]);

  useEffect(() => {
    if (designId || isAuthenticated) return;
    const timer = setTimeout(() => {
      saveGuestDesign({
        localId: "current",
        updatedAt: Date.now(),
        roomType: "living_room",
        itemsCount: items.length,
        snapshot: {
          title: resolveDesignTitle(designSnapshot.title),
          roomWidth,
          roomDepth,
          items,
          designSnapshot: getStoredDesignForPersistence(),
          style: style ?? null,
          budget: budget ?? null,
          mode: mode ?? null,
          notes: notes ?? null,
        },
      });
    }, guestSaveDelayMs);

    return () => clearTimeout(timer);
  }, [
    budget, designSnapshot.title,
    designId,
    getStoredDesignForPersistence,
    guestSaveDelayMs,
    isAuthenticated,
    items,
    mode,
    notes,
    roomDepth,
    roomWidth,
    style,
  ]);

  const hasPendingCloudSnapshotChanges = Boolean(
    designId &&
      cloudBaseline.status === "acknowledged" &&
      lastPersistedSnapshotFingerprint &&
      currentStoredDesignFingerprint !== lastPersistedSnapshotFingerprint
  );

  const saveStatus = useMemo(
    () =>
      getDesignPageSaveStatus({
        designId,
        hasCloudConflict: Boolean(cloudSaveConflict),
        hasPendingCloudSnapshotChanges,
        isAuthenticated,
        isSaving,
        lastCloudSaveError,
        lastDbSaveAt,
        lastLocalAutosaveAt,
        lastLocalSaveError,
      }),
    [
      designId,
      cloudSaveConflict,
      hasPendingCloudSnapshotChanges,
      isAuthenticated,
      isSaving,
      lastCloudSaveError,
      lastDbSaveAt,
      lastLocalAutosaveAt,
      lastLocalSaveError,
    ]
  );

  const retrySaveStatus = useCallback(async () => {
    if (cloudSaveConflict) return;
    if (lastCloudSaveError && isAuthenticated) {
      if (designId) {
        setLastCloudSaveError(null);
        setCloudRetryNonce((value) => value + 1);
        return;
      }
      const savedId = await saveDesignToCloud();
      if (savedId) {
        showRuleToast("Cloud save restored");
      }
      return;
    }

    if (writeLocalDesignBackup()) {
      showRuleToast("Local backup restored");
    } else {
      showRuleToast("Local backup failed");
    }
  }, [
    designId,
    cloudSaveConflict,
    isAuthenticated,
    lastCloudSaveError,
    saveDesignToCloud,
    showRuleToast,
    writeLocalDesignBackup,
  ]);

  // Leaving the editor for My designs. False keeps the editor open: when the save failed, or when
  // the design changed while it saved, since those edits would be left behind.
  const latestFingerprintRef = useRef(currentStoredDesignFingerprint);
  useEffect(() => {
    latestFingerprintRef.current = currentStoredDesignFingerprint;
  }, [currentStoredDesignFingerprint]);
  const saveBeforeLeaving = useCallback(async () => {
    if (!needsSaveBeforeLeaving({ designId, hasPendingCloudSnapshotChanges, isSaving, lastCloudSaveError })) return true;
    const savedFingerprint = currentStoredDesignFingerprint;
    const saved = (await saveDesignToCloud()) !== null;
    return saved && latestFingerprintRef.current === savedFingerprint;
  }, [currentStoredDesignFingerprint, designId, hasPendingCloudSnapshotChanges, isSaving, lastCloudSaveError, saveDesignToCloud]);

  return {
    state: {
      lastPersistedSnapshotFingerprint,
      lastCloudRevision, cloudBaselineStatus: cloudBaseline.status,
      cloudSaveConflict,
      isSaving,
      saveStatus,
      ...shareLinkState,
      guestPrompt: guestPromptController.snapshot.session,
      guestPromptPrimaryBusy: guestPromptController.snapshot.primaryBusy,
      guestPromptScopeKey,
    },
    actions: {
      saveDesignToCloud,
      preserveCurrentDesign,
      detachCurrentDesignForNewDraft,
      saveConflictAsNewCopy,
      reloadCloudAfterConflict,
      retrySaveStatus,
      loadDesign: loadDesignAfterCancellingConflictCopy,
      cancelDesignLoad: cancelDesignTransitions,
      clearPersistedSnapshotFingerprint,
      createShareLinkAndCopy: shareLinkActions.createShareLinkAndCopy, shareDesign: () => shareLinkActions.shareFromCommandBar(saveDesignToCloud),
      closeShareLinkFallback: shareLinkActions.closeShareLinkFallback,
      copyFallbackShareLink: shareLinkActions.copyFallbackShareLink,
      openFallbackShareLink: shareLinkActions.openFallbackShareLink,
      saveBeforeLeaving,
      openGuestPrompt: guestPromptController.open,
      cancelGuestPrompt: guestPromptController.cancel,
      handleGuestPromptNotNow: guestPromptController.continueWithoutSaving,
      handleGuestSaveAndContinue: guestPromptController.saveAndContinue,
    },
  };
}
