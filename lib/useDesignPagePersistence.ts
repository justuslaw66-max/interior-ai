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
import { track, trackProductEvent, trackProductPerformance } from "@/lib/analytics";
import { getAnonId } from "@/lib/anon";
import { designApi, DesignApiError } from "@/lib/design-api-client";
import { getDesignPageSaveStatus } from "@/lib/design-page-save-status";
import { writeValidatedLocalBackup } from "@/lib/design-page-local-backup-recovery";
import type { NamedCameraView, Style } from "@/lib/design-page-types";
import {
  loadGuestDesigns,
  markGuestDesignClaimed,
  saveGuestDesign,
} from "@/lib/guestDesigns";
import {
  snapshotToLegacyApi,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
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

export type PreserveCurrentDesignResult =
  | { ok: true; savedDesignId: string }
  | { ok: false; error: string };

type DesignPagePersistenceState = {
  identity: {
    designId: string | null;
    shareEnabled: boolean;
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
    identity: { designId, shareEnabled },
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
  const [shareLinkFallback, setShareLinkFallback] = useState<string | null>(null);
  const [showMyDesigns, setShowMyDesigns] = useState(false);
  const [myDesigns, setMyDesigns] = useState<SavedDesignSummary[]>([]);
  const [loadingDesigns, setLoadingDesigns] = useState(false);
  const [selectedSavedDesignIds, setSelectedSavedDesignIds] = useState<Set<string>>(
    new Set()
  );
  const [deletingDesignIds, setDeletingDesignIds] = useState<Set<string>>(new Set());
  const [pendingDeleteDesign, setPendingDeleteDesign] =
    useState<PendingSavedDesignDelete | null>(null);
  const [guestPromptReason, setGuestPromptReason] = useState<string | null>(null);
  const firstSaveRef = useRef(false);
  const guestPromptActionRef = useRef<null | (() => void)>(null);
  const documentEpochRef = useRef(0);
  const cloudWriteTailRef = useRef<Promise<unknown>>(Promise.resolve());
  const shareStatusAbortRef = useRef<AbortController | null>(null);
  const designListAbortRef = useRef<AbortController | null>(null);
  const [designLoadRequest] = useState(createDesignPageLoadRequestCoordinator);
  const cloudBaselineController = useDesignPageCloudBaselineController({
    designId, revision: lastCloudRevision,
    currentFingerprint: currentStoredDesignFingerprint,
    acknowledgeFingerprint: setLastPersistedSnapshotFingerprint,
    finishSaving: setIsSaving,
    documentEpochRef,
  });
  const cloudBaseline = cloudBaselineController.state.baseline;
  const { currentWriteIsBlocked: currentCloudWriteIsBlocked,
    detach: detachCloudBaseline, stageWrite: stageCloudWriteBaseline } =
    cloudBaselineController.actions;

  const enqueueCloudWrite = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    const queued = cloudWriteTailRef.current
      .catch(() => undefined)
      .then(() => operation());
    cloudWriteTailRef.current = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }, []);

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

  const saveDesignToCloud = useCallback(async () => {
    if (currentCloudWriteIsBlocked()) {
      showRuleToast("Wait for the loaded cloud design to finish restoring before saving.");
      return null;
    }
    const saveEpoch = documentEpochRef.current;
    const saveStartedAt = performance.now();
    setIsSaving(true);
    setLastCloudSaveError(null);
    try {
      const storedSnapshot = getStoredDesignForPersistence();
      const legacyData = snapshotToLegacyApi(storedToSnapshot(storedSnapshot));

      const payload = {
        title: "My Living Room",
        ...legacyData,
        savedViews,
        style,
        budget,
        mode,
        notes,
        ...(designId && lastCloudRevision
          ? { expectedUpdatedAt: lastCloudRevision }
          : {}),
      };

      const data = await enqueueCloudWrite(() =>
        designId
          ? designApi.update(designId, payload)
          : designApi.create(payload)
      );
      const savedDesignId =
        designId ??
        (typeof data?.id === "string" && data.id.trim() ? data.id : null);
      const savedRevision =
        typeof data.updatedAt === "string" && data.updatedAt.trim()
          ? data.updatedAt
          : null;
      if (savedDesignId && savedRevision) {
        const savedFingerprint = fingerprintStoredDesign(storedSnapshot);
        if (!stageCloudWriteBaseline({
          designId: savedDesignId,
          revision: savedRevision,
          fingerprint: savedFingerprint,
          epoch: saveEpoch,
        })) return null;
        setDesignId(savedDesignId);
        setLastCloudRevision(savedRevision);
        setLastDbSaveAt(Date.now());
        setLastCloudSaveError(null);
        setCloudSaveConflict(null);
        void fetchShareStatus(savedDesignId);
        if (isDesigner) {
          void enableShare(savedDesignId);
        }
        if (!firstSaveRef.current) {
          track("design_saved_db", {
            design_id: savedDesignId,
            items_count: items.length,
            room_type: "living_room",
            mode,
            is_guest: !isAuthenticated,
          });
          firstSaveRef.current = true;
        }
        const durationMs = performance.now() - saveStartedAt;
        trackProductEvent("project_saved", {
          source: "cloud",
          result: "success",
          durationMs,
          itemCount: items.length,
        });
        trackProductPerformance({
          metric: "save_duration_ms",
          value: durationMs,
          context: {
            mode: mode === "designer" ? "pro" : "consumer",
            itemCount: items.length,
            source: "cloud",
          },
        });
        return savedDesignId;
      }

      showRuleToast("Save failed: no design identity or revision returned");
      setLastCloudSaveError("No design identity or revision returned");
      trackProductEvent("project_save_failed", {
        source: "cloud",
        result: "failure",
        errorCode: "missing_design_id",
        durationMs: performance.now() - saveStartedAt,
      });
      return null;
    } catch (error) {
      const message = recordCloudSaveFailure(
        error,
        designId,
        "Cloud save failed."
      );
      if (error instanceof DesignApiError && error.kind === "forbidden") {
        showMaxDesignUpgrade();
        track("upgrade_prompt_shown", { reason: "max_designs" });
      }
      showRuleToast(`Save failed: ${message}`);
      trackProductEvent("project_save_failed", {
        source: "cloud",
        result: "failure",
        errorCode:
          error instanceof DesignApiError
            ? error.kind
            : error instanceof Error
              ? error.name
              : "unknown",
        durationMs: performance.now() - saveStartedAt,
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [
    budget,
    currentCloudWriteIsBlocked,
    designId,
    enableShare,
    enqueueCloudWrite,
    fetchShareStatus,
    fingerprintStoredDesign,
    getStoredDesignForPersistence,
    isAuthenticated,
    isDesigner,
    items.length,
    mode,
    notes,
    lastCloudRevision,
    recordCloudSaveFailure,
    savedViews,
    setDesignId,
    showMaxDesignUpgrade,
    showRuleToast,
    style,
    stageCloudWriteBaseline,
  ]);

  const preserveCurrentDesign = useCallback(async (): Promise<PreserveCurrentDesignResult> => {
    if (!isAuthenticated) {
      return {
        ok: false,
        error: "Sign in before starting a new plan so the current design can be kept.",
      };
    }
    if (currentCloudWriteIsBlocked()) {
      return {
        ok: false,
        error: "Wait for the loaded cloud design to finish restoring before starting a new plan.",
      };
    }
    const saveEpoch = documentEpochRef.current;

    setIsSaving(true);
    setLastCloudSaveError(null);
    try {
      const storedSnapshot = getStoredDesignForPersistence();
      const legacyData = snapshotToLegacyApi(storedToSnapshot(storedSnapshot));
      const creatingSavedCopy = !designId;
      const payload = designId
        ? {
                  items,
                  zones,
                  savedViews,
                  roomWidth,
                  roomDepth,
                  snapshot: storedSnapshot,
                  style,
                  budget,
                  mode,
                  notes,
                  ...(lastCloudRevision
                    ? { expectedUpdatedAt: lastCloudRevision }
                    : {}),
                }
        : {
                  title: "My Living Room",
                  ...legacyData,
                  savedViews,
                  style,
                  budget,
                  mode,
                  notes,
                };
      const data = await enqueueCloudWrite(() =>
        designId ? designApi.update(designId, payload) : designApi.create(payload)
      );
      const savedDesignId = designId ??
        (typeof data?.id === "string" && data.id.trim() ? data.id : null);
      const savedRevision =
        typeof data?.updatedAt === "string" && data.updatedAt.trim()
          ? data.updatedAt
          : null;
      if (!savedDesignId || !savedRevision) {
        const error = "The current design was saved without a complete cloud identity.";
        setLastCloudSaveError(error);
        return { ok: false, error };
      }

      if (!stageCloudWriteBaseline({
        designId: savedDesignId,
        revision: savedRevision,
        fingerprint: fingerprintStoredDesign(storedSnapshot),
        epoch: saveEpoch,
      })) {
        return { ok: false, error: "The cloud design changed while it was being saved." };
      }
      setLastDbSaveAt(Date.now());
      setLastCloudRevision(savedRevision);
      setLastCloudSaveError(null);
      setCloudSaveConflict(null);
      track("design_preserved_before_new_plan", {
        design_id: savedDesignId,
        created_saved_copy: creatingSavedCopy,
        room_count: designSnapshot.rooms.length,
        items_count: items.length,
      });
      return { ok: true, savedDesignId };
    } catch (error) {
      const message = recordCloudSaveFailure(
        error,
        designId,
        "Cloud save failed."
      );
      if (error instanceof DesignApiError && error.kind === "forbidden") {
        showMaxDesignUpgrade();
        track("upgrade_prompt_shown", { reason: "max_designs" });
      }
      return { ok: false, error: message };
    } finally {
      setIsSaving(false);
    }
  }, [
    budget,
    currentCloudWriteIsBlocked,
    designId,
    designSnapshot.rooms.length,
    enqueueCloudWrite,
    fingerprintStoredDesign,
    getStoredDesignForPersistence,
    isAuthenticated,
    items,
    lastCloudRevision,
    mode,
    notes,
    roomDepth,
    roomWidth,
    recordCloudSaveFailure,
    savedViews,
    showMaxDesignUpgrade,
    style,
    stageCloudWriteBaseline,
    zones,
  ]);

  const detachCurrentDesignForNewDraft = useCallback(() => {
    detachCloudBaseline();
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
        setShareLinkFallback(shareUrl);
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
      enqueueCloudWrite,
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

  const openGuestPrompt = useCallback((reason: string, onContinue: () => void) => {
    guestPromptActionRef.current = onContinue;
    setGuestPromptReason(reason);
  }, []);

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

  const handleGuestPromptNotNow = useCallback(() => {
    const action = guestPromptActionRef.current;
    guestPromptActionRef.current = null;
    setGuestPromptReason(null);
    action?.();
  }, []);

  const handleGuestSaveAndContinue = useCallback(async () => {
    setGuestPromptReason(null);
    await claimGuestDesign();
    requestSignIn();
  }, [claimGuestDesign, requestSignIn]);

  const clearPersistedSnapshotFingerprint = useCallback(() => {
    detachCloudBaseline();
    setLastPersistedSnapshotFingerprint(null);
    setLastCloudRevision(null);
  }, [detachCloudBaseline]);

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
    if (!designId) {
      setIsSaving(false);
    }
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
    const scheduledEpoch = documentEpochRef.current;
    setIsSaving(true);
    const timer = setTimeout(async () => {
      try {
        const storedSnapshot = await enqueueCloudWrite(async () => {
          if (scheduledEpoch !== documentEpochRef.current) return null;
          const snapshot = getStoredDesignForPersistence();
          const responseData = await designApi.update(
            designId,
            {
              items,
              zones,
              savedViews,
              roomWidth,
              roomDepth,
              snapshot,
              ...(lastCloudRevision
                ? { expectedUpdatedAt: lastCloudRevision }
                : {}),
            }
          );
          return {
            snapshot,
            updatedAt:
              typeof responseData?.updatedAt === "string"
                ? responseData.updatedAt
                : null,
          };
        });
        if (
          storedSnapshot &&
          scheduledEpoch === documentEpochRef.current
        ) {
          // A request can commit after this effect has been superseded. Keep
          // its server revision even when the older UI snapshot should no
          // longer become the displayed saved fingerprint.
          const committedRevision = storedSnapshot.updatedAt;
          if (!committedRevision) {
            setLastCloudRevision(null);
            return;
          }
          if (!stageCloudWriteBaseline({
            designId,
            revision: committedRevision,
            fingerprint: fingerprintStoredDesign(storedSnapshot.snapshot),
            epoch: scheduledEpoch,
          })) return;
          setLastCloudRevision(committedRevision);
          if (!cancelled) {
            setLastDbSaveAt(Date.now());
            setLastCloudSaveError(null);
            setCloudSaveConflict(null);
          }
        }
      } catch (error) {
        if (!cancelled) {
          recordCloudSaveFailure(error, designId, "Autosave failed");
        }
      } finally {
        if (!cancelled) {
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
    currentCloudWriteIsBlocked,
    currentStoredDesignFingerprint,
    designId,
    enqueueCloudWrite,
    fingerprintStoredDesign,
    getStoredDesignForPersistence,
    items,
    lastCloudRevision,
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
      shareLinkFallback,
      showMyDesigns,
      myDesigns,
      loadingDesigns,
      selectedSavedDesignIds,
      deletingDesignIds,
      pendingDeleteDesign,
      allSavedDesignIds,
      selectedSavedDesignCount,
      allSavedDesignsSelected,
      guestPromptReason,
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
      openGuestPrompt,
      handleGuestPromptNotNow,
      handleGuestSaveAndContinue,
    },
  };
}
