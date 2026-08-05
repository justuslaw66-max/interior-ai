"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  designApi,
  DesignApiError,
  type LoadedDesignTransport,
} from "@/lib/design-api-client";
import {
  DesignPageCloudNormalizationError,
  normalizeLoadedCloudDesign,
} from "@/lib/design-page-persistence-projection";
import {
  STYLES,
  type DesignPageCloudLoadResult,
  type NamedCameraView,
  type Style,
} from "@/lib/design-page-types";
import type { DesignSnapshot } from "@/lib/room-types";
import { resolveSharedDesignPresentation } from "@/lib/shared-design-projection-schema";
import {
  isSupersededDesignPageLoadError,
  type createDesignPageLoadRequestCoordinator,
} from "@/lib/design-page-requested-design-load-coordinator";
import type { DesignPageCloudBaselineController } from "@/lib/useDesignPageCloudBaselineController";
import type { CloudBaselineIdentity } from "@/lib/design-page-cloud-baseline";

type DesignMode = "homeowner" | "designer";
type Budget = "$" | "$$" | "$$$";
type LoadRequestCoordinator = ReturnType<
  typeof createDesignPageLoadRequestCoordinator
>;

type CloudLoadControllerInput = {
  baseline: DesignPageCloudBaselineController["actions"];
  requestCoordinator: LoadRequestCoordinator;
  actions: {
    setDesignSnapshot: (snapshot: DesignSnapshot) => void;
    hydratePersistedFloorPlanState: (
      snapshot: DesignSnapshot,
      clearWhenMissing?: boolean
    ) => void;
    clearHistory: () => void;
    setDesignId: Dispatch<SetStateAction<string | null>>;
    setLastPersistedFingerprint: (fingerprint: string | null) => void;
    setLastCloudRevision: (revision: string | null) => void;
    setLastDbSaveAt: (savedAt: number | null) => void;
    setLastCloudSaveError: (error: string | null) => void;
    setCloudSaveConflict: (conflict: null) => void;
    invalidateCloudWrites: () => void;
    installCloudWriteIdentity: (identity: {
      designId: string;
      revision: string;
      documentEpoch: number;
    }) => void;
    setMode: Dispatch<SetStateAction<DesignMode>>;
    setNotes: Dispatch<SetStateAction<string>>;
    setSavedViews: Dispatch<SetStateAction<NamedCameraView[]>>;
    setStyle: Dispatch<SetStateAction<Style>>;
    setBudget: Dispatch<SetStateAction<Budget>>;
    fetchShareStatus: (id?: string) => Promise<void>;
    enableShare: (id: string) => Promise<void>;
    showRuleToast: (message: string) => void;
  };
};

export function resolveDesignPageCloudPresentation(
  data: LoadedDesignTransport,
  snapshot: DesignSnapshot
) {
  const presentation = resolveSharedDesignPresentation(snapshot, data);
  const style = presentation.style === null
    ? null
    : STYLES.find(
        (candidate) => candidate.toLowerCase() === presentation.style?.toLowerCase()
      ) ?? null;
  const budgetByPublicCategory: Record<string, Budget> = {
    budget: "$",
    mid: "$$",
    luxury: "$$$",
    $: "$",
    $$: "$$",
    $$$: "$$$",
  };
  return {
    ...presentation,
    style,
    budget: presentation.budget === null
      ? null
      : budgetByPublicCategory[presentation.budget],
  };
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
      return typeof candidate.name === "string" &&
        Array.isArray(candidate.view?.pos) &&
        candidate.view.pos.length === 3 &&
        Array.isArray(candidate.view?.target) &&
        candidate.view.target.length === 3;
    })
    .slice(0, 6);
}

function commitLoadedCloudDesign(
  input: CloudLoadControllerInput,
  data: LoadedDesignTransport,
  normalized: ReturnType<typeof normalizeLoadedCloudDesign>,
  identity: CloudBaselineIdentity
): void {
  const { actions } = input;
  const presentation = resolveDesignPageCloudPresentation(
    data,
    normalized.snapshot
  );
  actions.installCloudWriteIdentity({
    designId: identity.designId,
    revision: identity.revision,
    documentEpoch: identity.epoch,
  });
  actions.setLastPersistedFingerprint(null);
  actions.setDesignSnapshot(normalized.snapshot);
  actions.hydratePersistedFloorPlanState(normalized.snapshot, true);
  actions.clearHistory();
  actions.setDesignId(data.id);
  actions.setLastCloudRevision(normalized.revision);
  actions.setLastDbSaveAt(Date.parse(normalized.revision));
  actions.setLastCloudSaveError(null);
  actions.setCloudSaveConflict(null);
  const nextMode = data.mode === "designer" ? "designer" : "homeowner";
  actions.setMode(nextMode);
  actions.setNotes(presentation.notes ?? "");
  actions.setSavedViews(sanitizeDesignPageSavedViews(data.savedViews));
  if (presentation.style !== null) {
    actions.setStyle(presentation.style);
  }
  if (presentation.budget !== null) {
    actions.setBudget(presentation.budget);
  }
  void actions.fetchShareStatus(data.id);
  if (nextMode === "designer" && !data.shareEnabled) {
    void actions.enableShare(data.id);
  }
  actions.showRuleToast(`Loaded ${presentation.title}`);
}

function handleCloudLoadFailure(
  input: CloudLoadControllerInput,
  error: unknown,
  load: {
    designId: string;
    requestEpoch: number;
    notFoundMessage?: string;
  }
): Exclude<DesignPageCloudLoadResult, "loaded"> {
  input.baseline.failLoad({
    designId: load.designId,
    requestEpoch: load.requestEpoch,
    reason:
      error instanceof DesignPageCloudNormalizationError
        ? "normalization_failed"
        : "load_failed",
  });
  input.actions.showRuleToast(
    error instanceof DesignApiError && error.kind === "forbidden"
      ? "You do not have access to that design"
      : error instanceof DesignApiError && error.kind === "not_found"
        ? load.notFoundMessage ?? "Design not found"
        : error instanceof Error
          ? error.message
          : "Failed to load design"
  );
  return error instanceof DesignApiError &&
    (error.kind === "forbidden" || error.kind === "not_found")
    ? "missing"
    : "unavailable";
}

async function executeCloudDesignLoad(
  input: CloudLoadControllerInput,
  id: string,
  options?: { notFoundMessage?: string }
): Promise<DesignPageCloudLoadResult> {
  input.actions.invalidateCloudWrites();
  const request = input.requestCoordinator.start();
  input.baseline.beginLoad({
    designId: id,
    requestEpoch: request.epoch,
  });
  try {
    const data = await designApi.get(id, request.controller.signal);
    if (!input.requestCoordinator.isCurrent(request)) return "superseded";
    const normalized = normalizeLoadedCloudDesign(data, id);
    if (!input.requestCoordinator.isCurrent(request)) return "superseded";
    const identity = input.baseline.installLoaded({
      designId: data.id,
      revision: normalized.revision,
      requestEpoch: request.epoch,
      fingerprint: normalized.fingerprint,
    });
    if (!identity) return "superseded";
    commitLoadedCloudDesign(input, data, normalized, identity);
    return "loaded";
  } catch (error) {
    if (isSupersededDesignPageLoadError(
      input.requestCoordinator.isCurrent(request), error
    )) {
      input.baseline.cancelLoad(request.epoch);
      return "superseded";
    }
    return handleCloudLoadFailure(input, error, {
      designId: id,
      requestEpoch: request.epoch,
      notFoundMessage: options?.notFoundMessage,
    });
  } finally {
    input.requestCoordinator.finish(request);
  }
}

export function useDesignPageCloudLoadController(
  input: CloudLoadControllerInput
) {
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  const loadDesign = useCallback(
    (id: string, options?: { notFoundMessage?: string }) =>
      executeCloudDesignLoad(inputRef.current, id, options),
    []
  );
  const cancelDesignLoad = useCallback(() => {
    inputRef.current.requestCoordinator.cancel();
    inputRef.current.baseline.cancelLoad();
  }, []);
  return { loadDesign, cancelDesignLoad };
}
