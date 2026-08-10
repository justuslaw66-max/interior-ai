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
import { executeDesignPageCloudWrite } from "@/lib/design-page-cloud-write-execution";
import {
  createDesignPageCloudWriteQueue,
} from "@/lib/design-page-cloud-write-queue";
import { getDesignPageSaveStatus } from "@/lib/design-page-save-status";
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

export { sanitizeDesignPageSavedViews };
export type { DesignPageCloudSaveConflictState };

type Budget = "$" | "$$" | "$$$";
type DesignMode = "homeowner" | "designer";
type SavedDesignDeleteMode = "single" | "selected" | "all";

export type SavedDesignSummary = {
  id: string;
  title: string;
  createdAt: string;
};

export type PendingSavedDesignDelete = {
  ids: string[];
  title?: string;
  mode: SavedDesignDeleteMode;
};

export type { PreserveCurrentDesignResult } from "@/lib/useDesignPageExplicitCloudSaveController";

type DesignPagePersistenceState = {
  identity: {
    designId: string | null;
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

type DesignPagePersistenceActions = {
  setDesignId: Dispatch<SetStateAction<string | null>>;
  setShareToken: Dispatch<SetStateAction<string | null>>;
  setShareEnabled: Dispatch<SetStateAction<boolean>>;
  setDesignSnapshot: (snapshot: DesignSnapshot) => void;
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
    identity: { designId, shareEnabled, guestPromptScopeKey },
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
    setDesignId,
    setShareToken,
    setShareEnabled,
    setDesignSnapshot,
    hydratePersistedFloorPlanState,
    clearHistory,
    setMode,
    setNotes,
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
  const [sharingDesign, setSharingDesign] = useState(false);
  const [shareSuccessToast, setShareSuccessToast] = useState(false);
  const [shareErrorToast, setShareErrorToast] = useState<string | null>(null);
  const [shareLinkFallback, setShareLinkFallback] =
    useState<{ designId: string; url: string } | null>(null);
  const [showMyDesigns, setShowMyDesigns] = useState(false);
  const [myDesigns, setMyDesigns] = useState<SavedDesignSummary[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [selectedSavedDesignIds, setSelectedSavedDesignIds] = useState<Set<string>>(
    new Set()
  );
  const [deletingDesignIds, setDeletingDesignIds] = useState<Set<string>>(new Set());
  const [pendingDeleteDesign, setPendingDeleteDesign] =
    useState<PendingSavedDesignDelete | null>(null);
  const firstSaveRef = useRef(false);
  const documentEpochRef = useRef(0);
  const [cloudWriteQueue] = useState(() =>
    createDesignPageCloudWriteQueue({
      designId,
      revision: lastCloudRevision,
      documentEpoch: documentEpochRef.current,
    })
  );
  const shareStatusAbortRef = useRef<AbortController | null>(null);
  const designListAbortRef = useRef<AbortController | null>(null);
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
      const message = error instanceof Error ? error.message : fallback;
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
    setSharingDesign(false);
    setShareSuccessToast(false);
    setShareErrorToast(null);
    setShareLinkFallback(null);
    setSavedViews([]);
    setNotes("");
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
    setDesignId,
    setNotes,
    setSavedViews,
    setShareEnabled,
    setShareToken,
    storageKey,
  ]);

  const fetchMyDesigns = useCallback(async () => {
    if (!isAuthenticated) return;
    designListAbortRef.current?.abort();
    const controller = new AbortController();
    designListAbortRef.current = controller;
    setLoadingDesigns(true);
    try {
      const data = await designApi.list(controller.signal);
      const nextDesigns = data as SavedDesignSummary[];
      setMyDesigns(nextDesigns);
      setSelectedSavedDesignIds((previous) => {
        if (!Array.isArray(data) || previous.size === 0) return previous;
        const availableIds = new Set(
          data.map((design: { id: string }) => design.id)
        );
        return new Set(Array.from(previous).filter((id) => availableIds.has(id)));
      });
    } catch (error) {
      if (!(error instanceof DesignApiError && error.kind === "aborted")) {
        showRuleToast(error instanceof Error ? error.message : "Failed to load designs.");
      }
    } finally {
      if (designListAbortRef.current === controller) {
        designListAbortRef.current = null;
        setLoadingDesigns(false);
      }
    }
  }, [isAuthenticated, showRuleToast]);

  const toggleMyDesigns = useCallback(() => {
    if (!showMyDesigns) {
      void fetchMyDesigns();
    }
    setShowMyDesigns(!showMyDesigns);
  }, [fetchMyDesigns, showMyDesigns]);

  const closeMyDesigns = useCallback(() => {
    setShowMyDesigns(false);
  }, []);

  const toggleSavedDesignSelection = useCallback((id: string) => {
    setSelectedSavedDesignIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allSavedDesignIds = useMemo(
    () => myDesigns.map((design) => design.id),
    [myDesigns]
  );
  const selectedSavedDesignCount = selectedSavedDesignIds.size;
  const allSavedDesignsSelected =
    myDesigns.length > 0 &&
    myDesigns.every((design) => selectedSavedDesignIds.has(design.id));

  const toggleAllSavedDesignSelection = useCallback(() => {
    setSelectedSavedDesignIds(
      allSavedDesignsSelected ? new Set() : new Set(allSavedDesignIds)
    );
  }, [allSavedDesignIds, allSavedDesignsSelected]);

  const requestDeleteSavedDesigns = useCallback(
    (ids: string[], deleteMode: SavedDesignDeleteMode, title?: string) => {
      const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
      if (uniqueIds.length === 0) return;
      setPendingDeleteDesign({ ids: uniqueIds, mode: deleteMode, title });
    },
    []
  );

  const cancelDeleteSavedDesigns = useCallback(() => {
    if (deletingDesignIds.size === 0) {
      setPendingDeleteDesign(null);
    }
  }, [deletingDesignIds.size]);

  const handleDeleteSavedDesign = useCallback(async () => {
    const target = pendingDeleteDesign;
    if (!target || deletingDesignIds.size > 0) return;

    const targetIds = Array.from(new Set(target.ids)).filter(Boolean);
    if (targetIds.length === 0) {
      setPendingDeleteDesign(null);
      return;
    }

    setDeletingDesignIds(new Set(targetIds));
    const deletedIds = new Set<string>();
    const failedIds: string[] = [];
    try {
      for (const targetId of targetIds) {
        try {
          await designApi.delete(targetId);
          deletedIds.add(targetId);
        } catch {
          failedIds.push(targetId);
        }
      }

      if (deletedIds.size > 0) {
        setMyDesigns((previous) =>
          previous.filter((design) => !deletedIds.has(design.id))
        );
        setSelectedSavedDesignIds((previous) => {
          const next = new Set(previous);
          deletedIds.forEach((id) => next.delete(id));
          return next;
        });
      }
      if (designId && deletedIds.has(designId)) {
        detachCloudBaseline();
        cloudWriteQueue.invalidate({
          designId: null,
          revision: null,
          documentEpoch: documentEpochRef.current,
        });
        setDesignId(null);
        setShareToken(null);
        setShareEnabled(false);
        setLastCloudRevision(null);
        setLastPersistedSnapshotFingerprint(null);
      }
      setPendingDeleteDesign(null);

      if (deletedIds.size > 0 && failedIds.length === 0) {
        showRuleToast(
          deletedIds.size === 1 ? "Design deleted" : `${deletedIds.size} designs deleted`
        );
      } else if (deletedIds.size > 0) {
        showRuleToast(`${deletedIds.size} deleted, ${failedIds.length} failed`);
      } else {
        showRuleToast("Delete failed");
      }

      track("load_design_modal_deleted", {
        design_ids: Array.from(deletedIds),
        count: deletedIds.size,
        mode: target.mode,
      });
    } catch {
      showRuleToast("Delete failed");
    } finally {
      setDeletingDesignIds(new Set());
    }
  }, [
    cloudWriteQueue,
    deletingDesignIds.size,
    detachCloudBaseline,
    designId,
    pendingDeleteDesign,
    setDesignId,
    setShareEnabled,
    setShareToken,
    showRuleToast,
  ]);

  const createShareLinkAndCopy = useCallback(async () => {
    if (!designId) return;
    setSharingDesign(true);
    try {
      const data = await designApi.share(designId);

      setShareToken(data.shareToken);
      setShareEnabled(true);
      const shareUrl = `${window.location.origin}/share/${data.shareToken}`;

      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareSuccessToast(true);
        setTimeout(() => setShareSuccessToast(false), 3000);
        track("share_link_copied", {
          design_id: designId,
          shared_context: true,
        });
      } catch (clipboardError) {
        console.warn("Clipboard access denied, showing fallback modal:", clipboardError);
        setShareLinkFallback({ designId, url: shareUrl });
        track("share_link_created_fallback", {
          design_id: designId,
          shared_context: true,
          error:
            clipboardError instanceof Error
              ? clipboardError.name
              : String(clipboardError),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unable to create share link.";
      setShareErrorToast(`Failed to create share link: ${errorMessage}`);
      setTimeout(() => setShareErrorToast(null), 3000);
    } finally {
      setSharingDesign(false);
    }
  }, [designId, setShareEnabled, setShareToken]);

  const closeShareLinkFallback = useCallback(() => {
    setShareLinkFallback(null);
  }, []);

  const copyFallbackShareLink = useCallback((url: string) => {
    void navigator.clipboard.writeText(url);
    setShareSuccessToast(true);
    setTimeout(() => setShareSuccessToast(false), 3000);
  }, []);

  const openFallbackShareLink = useCallback((url: string) => {
    window.open(url, "_blank");
    setShareLinkFallback(null);
  }, []);

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

  const saveConflictAsNewCopy = useDesignPageCloudConflictCopyController({
    state: {
      conflict: cloudSaveConflict,
      isDesigner,
      savedViews,
      style,
      budget,
      mode,
      notes,
    },
    actions: {
      setConflict: setCloudSaveConflict,
      currentWriteIsBlocked: currentCloudWriteIsBlocked,
      invalidateCloudWrites,
      installCloudWriteIdentity,
      detachBaseline: detachCloudBaseline,
      stageWriteBaseline: stageCloudWriteBaseline,
      setDesignId,
      setShareToken,
      setShareEnabled,
      setLastCloudRevision,
      setLastDbSaveAt,
      setLastPersistedFingerprint: setLastPersistedSnapshotFingerprint,
      setLastCloudSaveError,
      fetchShareStatus,
      enableShare,
      showRuleToast,
    },
    adapters: {
      cloudWriteQueue,
      getStoredDesignForPersistence,
      fingerprintStoredDesign,
    },
    refs: { documentEpochRef },
  });

  const reloadCloudAfterConflict = useCallback(async () => {
    const conflict = cloudSaveConflict;
    if (!conflict || conflict.isWorking) return;
    setCloudSaveConflict({
      ...conflict,
      isWorking: true,
      resolutionError: null,
    });
    const result = await loadDesign(conflict.designId);
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
  }, [cloudSaveConflict, loadDesign, showRuleToast]);

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
        title: "Guest Design",
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
    budget,
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

  useEffect(() => {
    return () => {
      shareStatusAbortRef.current?.abort();
      designListAbortRef.current?.abort();
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
    setShareLinkFallback((current) => current?.designId === designId ? current : null);
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
      setLastLocalSaveError(
        error instanceof Error ? error.message : "Local backup failed"
      );
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
              snapshot,
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
          title: "Guest Design",
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
    budget,
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

  return {
    state: {
      lastPersistedSnapshotFingerprint,
      lastCloudRevision,
      cloudSaveConflict,
      isSaving,
      saveStatus,
      sharingDesign,
      shareSuccessToast,
      shareErrorToast,
      shareLinkFallback: shareLinkFallback?.designId === designId ? shareLinkFallback.url : null,
      showMyDesigns,
      myDesigns,
      loadingDesigns,
      selectedSavedDesignIds,
      deletingDesignIds,
      pendingDeleteDesign,
      allSavedDesignIds,
      selectedSavedDesignCount,
      allSavedDesignsSelected,
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
      loadDesign,
      cancelDesignLoad,
      clearPersistedSnapshotFingerprint,
      createShareLinkAndCopy,
      closeShareLinkFallback,
      copyFallbackShareLink,
      openFallbackShareLink,
      toggleMyDesigns,
      closeMyDesigns,
      toggleSavedDesignSelection,
      toggleAllSavedDesignSelection,
      requestDeleteSavedDesigns,
      cancelDeleteSavedDesigns,
      handleDeleteSavedDesign,
      openGuestPrompt: guestPromptController.open,
      cancelGuestPrompt: guestPromptController.cancel,
      handleGuestPromptNotNow: guestPromptController.continueWithoutSaving,
      handleGuestSaveAndContinue: guestPromptController.saveAndContinue,
    },
  };
}
