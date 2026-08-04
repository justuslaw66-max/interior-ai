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
import {
  STYLES,
  type DesignPageCloudLoadResult,
  type NamedCameraView,
  type Style,
} from "@/lib/design-page-types";
import {
  loadGuestDesigns,
  markGuestDesignClaimed,
  saveGuestDesign,
} from "@/lib/guestDesigns";
import {
  legacyApiToSnapshot,
  snapshotToLegacyApi,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";
import type { DesignItem, DesignSnapshot, ZoneMin } from "@/lib/room-types";
import {
  createDesignPageLoadRequestCoordinator,
  isSupersededDesignPageLoadError,
} from "@/lib/design-page-requested-design-load-coordinator";

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

export type DesignPageCloudSaveConflictState = {
  designId: string;
  detectedAt: number;
  message: string;
  isWorking: boolean;
  resolutionError: string | null;
};

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

export function sanitizeDesignPageSavedViews(value: unknown): NamedCameraView[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is NamedCameraView => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as {
        name?: unknown;
        view?: { pos?: unknown; target?: unknown };
      };
      return (
        typeof candidate.name === "string" &&
        Array.isArray(candidate.view?.pos) &&
        candidate.view.pos.length === 3 &&
        Array.isArray(candidate.view?.target) &&
        candidate.view.target.length === 3
      );
    })
    .slice(0, 6);
}

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
      if (savedDesignId) {
        setDesignId(savedDesignId);
        setLastCloudRevision(
          typeof data.updatedAt === "string" ? data.updatedAt : null
        );
        setLastDbSaveAt(Date.now());
        setLastPersistedSnapshotFingerprint(fingerprintStoredDesign(storedSnapshot));
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

      showRuleToast("Save failed: no design ID returned");
      setLastCloudSaveError("No design ID returned");
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
  ]);

  const preserveCurrentDesign = useCallback(async (): Promise<PreserveCurrentDesignResult> => {
    if (!isAuthenticated) {
      return {
        ok: false,
        error: "Sign in before starting a new plan so the current design can be kept.",
      };
    }

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
      if (!savedDesignId) {
        const error = "The current design was saved without a design ID.";
        setLastCloudSaveError(error);
        return { ok: false, error };
      }

      setLastDbSaveAt(Date.now());
      setLastCloudRevision(
        typeof data?.updatedAt === "string" ? data.updatedAt : null
      );
      setLastPersistedSnapshotFingerprint(fingerprintStoredDesign(storedSnapshot));
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
    zones,
  ]);

  const detachCurrentDesignForNewDraft = useCallback(() => {
    documentEpochRef.current += 1;
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
        setDesignId(null);
        setShareToken(null);
        setShareEnabled(false);
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

  const loadDesign = useCallback(
    async (
      id: string,
      options?: { notFoundMessage?: string }
    ): Promise<DesignPageCloudLoadResult> => {
      const request = designLoadRequest.start();
      try {
        const data = await designApi.get(id, request.controller.signal);
        if (!designLoadRequest.isCurrent(request)) return "superseded";
        documentEpochRef.current += 1;
        const snapshot = legacyApiToSnapshot(data);
        setLastPersistedSnapshotFingerprint(fingerprintDesignSnapshot(snapshot));
        setDesignSnapshot(snapshot);
        hydratePersistedFloorPlanState(snapshot, true);
        clearHistory();
        setDesignId(data.id);
        const loadedRevision =
          typeof data.updatedAt === "string" ? data.updatedAt : null;
        setLastCloudRevision(loadedRevision);
        setLastDbSaveAt(
          loadedRevision && Number.isFinite(Date.parse(loadedRevision))
            ? Date.parse(loadedRevision)
            : Date.now()
        );
        setLastCloudSaveError(null);
        setCloudSaveConflict(null);
        const nextMode =
          data?.mode === "designer" ? "designer" : "homeowner";
        setMode(nextMode);
        setNotes(typeof data?.notes === "string" ? data.notes : "");
        setSavedViews(sanitizeDesignPageSavedViews(data?.savedViews));
        if (
          typeof data?.style === "string" &&
          STYLES.includes(data.style as Style)
        ) {
          setStyle(data.style as Style);
        }
        if (
          typeof data?.budget === "string" &&
          (["$", "$$", "$$$"] as string[]).includes(data.budget)
        ) {
          setBudget(data.budget as Budget);
        }
        void fetchShareStatus(data.id);
        if (nextMode === "designer" && !data?.shareEnabled) {
          void enableShare(data.id);
        }
        showRuleToast(`Loaded ${data.title}`);
        return "loaded";
      } catch (error) {
        if (isSupersededDesignPageLoadError(
          designLoadRequest.isCurrent(request), error
        )) {
          return "superseded";
        }
        showRuleToast(
          error instanceof DesignApiError && error.kind === "forbidden"
            ? "You do not have access to that design"
            : error instanceof DesignApiError && error.kind === "not_found"
              ? options?.notFoundMessage ?? "Design not found"
              : error instanceof Error
                ? error.message
                : "Failed to load design"
        );
        return error instanceof DesignApiError &&
          (error.kind === "forbidden" || error.kind === "not_found")
          ? "missing"
          : "unavailable";
      } finally {
        designLoadRequest.finish(request);
      }
    },
    [
      clearHistory,
      designLoadRequest,
      enableShare,
      fetchShareStatus,
      hydratePersistedFloorPlanState,
      setBudget,
      setDesignId,
      setDesignSnapshot,
      setMode,
      setNotes,
      setSavedViews,
      setStyle,
      showRuleToast,
    ]
  );

  const saveConflictAsNewCopy = useCallback(async () => {
    const conflict = cloudSaveConflict;
    if (!conflict || conflict.isWorking) return;
    setCloudSaveConflict({
      ...conflict,
      isWorking: true,
      resolutionError: null,
    });
    try {
      const storedSnapshot = getStoredDesignForPersistence();
      const legacyData = snapshotToLegacyApi(storedToSnapshot(storedSnapshot));
      const data = await enqueueCloudWrite(() =>
        designApi.create({
          title: "Recovered design copy",
          ...legacyData,
          savedViews,
          style,
          budget,
          mode,
          notes,
        })
      );
      const savedDesignId =
        typeof data?.id === "string" && data.id.trim() ? data.id : null;
      const savedRevision =
        typeof data?.updatedAt === "string" && data.updatedAt.trim()
          ? data.updatedAt
          : null;
      if (!savedDesignId || !savedRevision) {
        throw new Error("The new cloud copy did not return a valid revision.");
      }

      documentEpochRef.current += 1;
      setDesignId(savedDesignId);
      setShareToken(null);
      setShareEnabled(false);
      setLastCloudRevision(savedRevision);
      setLastDbSaveAt(Date.now());
      setLastPersistedSnapshotFingerprint(
        fingerprintStoredDesign(storedSnapshot)
      );
      setLastCloudSaveError(null);
      setCloudSaveConflict(null);
      void fetchShareStatus(savedDesignId);
      if (isDesigner) void enableShare(savedDesignId);
      track("design_conflict_saved_as_copy", {
        prior_design_id: conflict.designId,
        saved_design_id: savedDesignId,
      });
      showRuleToast("Local changes saved as a new cloud copy");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "The local copy could not be saved to the cloud.";
      setCloudSaveConflict((previous) =>
        previous?.designId === conflict.designId
          ? { ...previous, isWorking: false, resolutionError: message }
          : previous
      );
    }
  }, [
    budget,
    cloudSaveConflict,
    enableShare,
    enqueueCloudWrite,
    fetchShareStatus,
    fingerprintStoredDesign,
    getStoredDesignForPersistence,
    isDesigner,
    mode,
    notes,
    savedViews,
    setDesignId,
    setShareEnabled,
    setShareToken,
    showRuleToast,
    style,
  ]);

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
    setLastPersistedSnapshotFingerprint(null);
  }, []);

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
          setLastCloudRevision(storedSnapshot.updatedAt);
          if (!cancelled) {
            setLastDbSaveAt(Date.now());
            setLastPersistedSnapshotFingerprint(
              fingerprintStoredDesign(storedSnapshot.snapshot)
            );
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
      cancelDesignLoad: designLoadRequest.cancel,
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
