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
import { track } from "@/lib/analytics";
import { getAnonId } from "@/lib/anon";
import { getDesignPageSaveStatus } from "@/lib/design-page-save-status";
import { STYLES, type NamedCameraView, type Style } from "@/lib/design-page-types";
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

type LoadedDesignResponse = Parameters<typeof legacyApiToSnapshot>[0] & {
  shareEnabled?: boolean;
  shareToken?: string | null;
};

async function readCloudSaveError(response: Response): Promise<string> {
  try {
    const text = await response.text();
    if (!text) return `Server error (${response.status}): No response body`;
    try {
      const parsed = JSON.parse(text) as { error?: unknown };
      return typeof parsed.error === "string"
        ? parsed.error
        : `Server error (${response.status})`;
    } catch {
      return `Server error (${response.status}): ${text}`;
    }
  } catch {
    return `Server error (${response.status}): Unable to read response`;
  }
}

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
  const [lastPersistedSnapshotFingerprint, setLastPersistedSnapshotFingerprint] =
    useState<string | null>(null);
  const [lastLocalSaveError, setLastLocalSaveError] = useState<string | null>(null);
  const [lastCloudSaveError, setLastCloudSaveError] = useState<string | null>(null);
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

  const fetchShareStatus = useCallback(
    async (id?: string) => {
      const targetId = id ?? designId;
      if (!targetId) return;
      const requestEpoch = documentEpochRef.current;

      try {
        const res = await fetch(`/api/designs/${targetId}`);
        if (!res.ok) return;
        const raw = await res.text();
        const data = raw ? JSON.parse(raw) : null;
        if (requestEpoch !== documentEpochRef.current) return;
        setShareToken(data?.shareToken ?? null);
        setShareEnabled(Boolean(data?.shareEnabled));
      } catch {
        // ignore share status errors
      }
    },
    [designId, setShareEnabled, setShareToken]
  );

  const enableShare = useCallback(
    async (id: string) => {
      const requestEpoch = documentEpochRef.current;
      try {
        const res = await fetch(`/api/designs/${id}/share`, { method: "POST" });
        const raw = await res.text();
        const data = raw ? JSON.parse(raw) : null;
        if (res.ok && requestEpoch === documentEpochRef.current) {
          setShareToken(data?.shareToken ?? null);
          setShareEnabled(true);
          if (data?.shareToken) {
            track("share_link_created", {
              design_id: id,
              share_token: data.shareToken,
            });
          }
        }
      } catch (error) {
        console.error("Share enable error:", error);
      }
    },
    [setShareEnabled, setShareToken]
  );

  const saveDesignToCloud = useCallback(async () => {
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
      };

      const res = await enqueueCloudWrite(() =>
        fetch("/api/designs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      );

      if (!res.ok) {
        const errorMessage = await readCloudSaveError(res);
        if (res.status === 403) {
          showMaxDesignUpgrade();
          track("upgrade_prompt_shown", { reason: "max_designs" });
        }
        setLastCloudSaveError(errorMessage);
        showRuleToast(`Save failed: ${errorMessage}`);
        return null;
      }

      const data = await res.json();
      if (data?.id) {
        setDesignId(data.id);
        setLastDbSaveAt(Date.now());
        setLastPersistedSnapshotFingerprint(fingerprintStoredDesign(storedSnapshot));
        setLastCloudSaveError(null);
        void fetchShareStatus(data.id);
        if (isDesigner) {
          void enableShare(data.id);
        }
        if (!firstSaveRef.current) {
          track("design_saved_db", {
            design_id: data.id,
            items_count: items.length,
            room_type: "living_room",
            mode,
            is_guest: !isAuthenticated,
          });
          firstSaveRef.current = true;
        }
        return data.id as string;
      }

      showRuleToast("Save failed: no design ID returned");
      setLastCloudSaveError("No design ID returned");
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastCloudSaveError(message);
      showRuleToast(`Save failed: ${message}`);
      return null;
    } finally {
      setIsSaving(false);
    }
  }, [
    budget,
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
      const response = await enqueueCloudWrite(() =>
        fetch(designId ? `/api/designs/${designId}` : "/api/designs", {
          method: designId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            designId
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
                }
              : {
                  title: "My Living Room",
                  ...legacyData,
                  savedViews,
                  style,
                  budget,
                  mode,
                  notes,
                }
          ),
        })
      );

      if (!response.ok) {
        const error = await readCloudSaveError(response);
        if (response.status === 403) {
          showMaxDesignUpgrade();
          track("upgrade_prompt_shown", { reason: "max_designs" });
        }
        setLastCloudSaveError(error);
        return { ok: false, error };
      }

      const data = (await response.json().catch(() => null)) as { id?: unknown } | null;
      const savedDesignId = designId ??
        (typeof data?.id === "string" && data.id.trim() ? data.id : null);
      if (!savedDesignId) {
        const error = "The current design was saved without a design ID.";
        setLastCloudSaveError(error);
        return { ok: false, error };
      }

      setLastDbSaveAt(Date.now());
      setLastPersistedSnapshotFingerprint(fingerprintStoredDesign(storedSnapshot));
      setLastCloudSaveError(null);
      track("design_preserved_before_new_plan", {
        design_id: savedDesignId,
        created_saved_copy: creatingSavedCopy,
        room_count: designSnapshot.rooms.length,
        items_count: items.length,
      });
      return { ok: true, savedDesignId };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastCloudSaveError(message);
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
    mode,
    notes,
    roomDepth,
    roomWidth,
    savedViews,
    showMaxDesignUpgrade,
    style,
    zones,
  ]);

  const detachCurrentDesignForNewDraft = useCallback(() => {
    documentEpochRef.current += 1;
    setDesignId(null);
    setShareToken(null);
    setShareEnabled(false);
    setLastPersistedSnapshotFingerprint(null);
    setLastDbSaveAt(null);
    setLastCloudSaveError(null);
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
    setDesignId,
    setNotes,
    setSavedViews,
    setShareEnabled,
    setShareToken,
    storageKey,
  ]);

  const fetchMyDesigns = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoadingDesigns(true);
    try {
      const res = await fetch("/api/designs");
      if (!res.ok) {
        console.error("Failed to fetch designs:", res.status);
        return;
      }
      const data = await res.json();
      const nextDesigns = Array.isArray(data) ? (data as SavedDesignSummary[]) : [];
      setMyDesigns(nextDesigns);
      setSelectedSavedDesignIds((previous) => {
        if (!Array.isArray(data) || previous.size === 0) return previous;
        const availableIds = new Set(
          data.map((design: { id: string }) => design.id)
        );
        return new Set(Array.from(previous).filter((id) => availableIds.has(id)));
      });
    } catch (error) {
      console.error("Error fetching designs:", error);
    } finally {
      setLoadingDesigns(false);
    }
  }, [isAuthenticated]);

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
        const res = await fetch(`/api/designs/${targetId}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          failedIds.push(targetId);
          continue;
        }
        deletedIds.add(targetId);
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
    } catch (error) {
      console.error("Delete saved design error:", error);
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
      const res = await fetch(`/api/designs/${designId}/share`, { method: "POST" });
      const raw = await res.text();
      let data = null;
      try {
        data = raw ? JSON.parse(raw) : null;
      } catch (parseError) {
        console.error("Failed to parse share response:", parseError, raw);
        setShareErrorToast("Failed to create share link (invalid response)");
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }

      if (!res.ok) {
        const errorMessage = data?.error || `Server error (${res.status})`;
        console.error("Share creation failed:", errorMessage);
        setShareErrorToast(`Failed to create share link: ${errorMessage}`);
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }

      if (!data?.shareToken) {
        console.error("No share token in response:", data);
        setShareErrorToast("Failed to create share link (no token)");
        setTimeout(() => setShareErrorToast(null), 3000);
        return;
      }

      setShareToken(data.shareToken);
      setShareEnabled(true);
      const shareUrl = `${window.location.origin}/share/${data.shareToken}`;

      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareSuccessToast(true);
        setTimeout(() => setShareSuccessToast(false), 3000);
        track("share_link_copied", {
          design_id: designId,
          share_token: data.shareToken,
        });
      } catch (clipboardError) {
        console.warn("Clipboard access denied, showing fallback modal:", clipboardError);
        setShareLinkFallback(shareUrl);
        track("share_link_created_fallback", {
          design_id: designId,
          share_token: data.shareToken,
          error:
            clipboardError instanceof Error
              ? clipboardError.name
              : String(clipboardError),
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Share error:", error);
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
    ): Promise<boolean> => {
      const requestEpoch = documentEpochRef.current;
      try {
        const res = await fetch(`/api/designs/${id}`);
        if (!res.ok) {
          showRuleToast(
            res.status === 403
              ? "You do not have access to that design"
              : options?.notFoundMessage ?? "Design not found"
          );
          return false;
        }

        const data = (await res.json()) as LoadedDesignResponse;
        if (requestEpoch !== documentEpochRef.current) return false;
        documentEpochRef.current += 1;
        const snapshot = legacyApiToSnapshot(data);
        setLastPersistedSnapshotFingerprint(fingerprintDesignSnapshot(snapshot));
        setDesignSnapshot(snapshot);
        hydratePersistedFloorPlanState(snapshot, true);
        clearHistory();
        setDesignId(data.id);
        const nextMode = data?.mode === "designer" ? "designer" : "homeowner";
        setMode(nextMode);
        setNotes(typeof data?.notes === "string" ? data.notes : "");
        setSavedViews(sanitizeDesignPageSavedViews(data?.savedViews));
        if (typeof data?.style === "string" && STYLES.includes(data.style as Style)) {
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
        return true;
      } catch (error) {
        console.error("Load error:", error);
        showRuleToast("Failed to load design");
        return false;
      }
    },
    [
      clearHistory,
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

  const handleLoadDesign = useCallback(
    async (id: string) => {
      await loadDesign(id);
      setShowMyDesigns(false);
    },
    [loadDesign]
  );

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

    const res = await fetch("/api/designs/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.designId) {
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
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...getStoredDesignForPersistence(designSnapshot),
          savedViews,
          designId,
        })
      );
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
          const res = await fetch(`/api/designs/${designId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items,
              zones,
              savedViews,
              roomWidth,
              roomDepth,
              snapshot,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || `Autosave failed (${res.status})`);
          }
          return snapshot;
        });
        if (
          storedSnapshot &&
          !cancelled &&
          scheduledEpoch === documentEpochRef.current
        ) {
          setLastDbSaveAt(Date.now());
          setLastPersistedSnapshotFingerprint(fingerprintStoredDesign(storedSnapshot));
          setLastCloudSaveError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setLastCloudSaveError(
            error instanceof Error ? error.message : "Autosave failed"
          );
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
    currentStoredDesignFingerprint,
    designId,
    enqueueCloudWrite,
    fingerprintStoredDesign,
    getStoredDesignForPersistence,
    items,
    lastPersistedSnapshotFingerprint,
    localBackupHydrated,
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
    if (lastCloudSaveError && isAuthenticated) {
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
    isAuthenticated,
    lastCloudSaveError,
    saveDesignToCloud,
    showRuleToast,
    writeLocalDesignBackup,
  ]);

  return {
    state: {
      lastPersistedSnapshotFingerprint,
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
      retrySaveStatus,
      loadDesign,
      clearPersistedSnapshotFingerprint,
      createShareLinkAndCopy,
      closeShareLinkFallback,
      copyFallbackShareLink,
      openFallbackShareLink,
      toggleMyDesigns,
      closeMyDesigns,
      handleLoadDesign,
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
