"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { track } from "@/lib/analytics";
import { designApi } from "@/lib/design-api-client";
import type { CloudBaselineTransitionSnapshot } from "@/lib/design-page-cloud-baseline";
import {
  createConflictCopyOperationCoordinator,
  runConflictCopyTransition,
  type ConflictCopyAuthority,
  type ConflictCopyOperation,
  type ConflictCopyOperationCoordinator,
  type ConflictCopyRouteActions,
  type ConflictCopyRouteSnapshot,
  type CreatedConflictCopyIdentity,
} from "@/lib/design-page-cloud-conflict-copy-transition";
import type {
  DesignPageCloudWriteContext,
  DesignPageCloudWriteQueue,
} from "@/lib/design-page-cloud-write-queue";
import type { NamedCameraView, Style } from "@/lib/design-page-types";
import {
  snapshotToLegacyApi,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";

type Budget = "$" | "$$" | "$$$";
type DesignMode = "homeowner" | "designer";

export type DesignPageCloudSaveConflictState = {
  designId: string;
  detectedAt: number;
  message: string;
  isWorking: boolean;
  resolutionError: string | null;
};

type ConflictCopyControllerInput = {
  state: {
    cloudSaveConflict: DesignPageCloudSaveConflictState | null;
    designId: string | null;
    shareToken: string | null;
    shareEnabled: boolean;
    currentStoredDesignFingerprint: string;
    lastCloudRevision: string | null;
    lastDbSaveAt: number | null;
    lastPersistedSnapshotFingerprint: string | null;
    lastCloudSaveError: string | null;
    isSaving: boolean;
    isDesigner: boolean;
    savedViews: NamedCameraView[];
    style: Style;
    budget: Budget;
    mode: DesignMode;
    notes: string;
  };
  actions: ConflictCopyRouteActions & {
    setCloudSaveConflict: Dispatch<
      SetStateAction<DesignPageCloudSaveConflictState | null>
    >;
    currentCloudWriteIsBlocked: () => boolean;
    cloudBaseline: {
      captureTransition: () => CloudBaselineTransitionSnapshot;
      canCommitTransition: (snapshot: CloudBaselineTransitionSnapshot) => boolean;
      commitTransition: (input: {
        snapshot: CloudBaselineTransitionSnapshot;
        designId: string;
        revision: string;
        fingerprint: string;
      }) => { epoch: number } | null;
      restoreTransition: (snapshot: CloudBaselineTransitionSnapshot) => void;
    };
    cancelDesignLoad: () => void;
    setDesignId: Dispatch<SetStateAction<string | null>>;
    setShareToken: Dispatch<SetStateAction<string | null>>;
    setShareEnabled: Dispatch<SetStateAction<boolean>>;
    setLastCloudRevision: Dispatch<SetStateAction<string | null>>;
    setLastDbSaveAt: Dispatch<SetStateAction<number | null>>;
    setLastPersistedSnapshotFingerprint: Dispatch<SetStateAction<string | null>>;
    setLastCloudSaveError: Dispatch<SetStateAction<string | null>>;
    setIsSaving: Dispatch<SetStateAction<boolean>>;
    fetchShareStatus: (designId: string) => Promise<void>;
    enableShare: (designId: string) => Promise<void>;
    showRuleToast: (message: string) => void;
  };
  adapters: {
    cloudWriteQueue: DesignPageCloudWriteQueue;
    getStoredDesignForPersistence: () => StoredDesign;
    fingerprintStoredDesign: (stored: StoredDesign) => string;
  };
};

type ConflictCopyTransitionSnapshot = {
  baseline: CloudBaselineTransitionSnapshot;
  writeContext: DesignPageCloudWriteContext;
  stored: StoredDesign;
  fingerprint: string;
  local: Pick<
    ConflictCopyControllerInput["state"],
    | "cloudSaveConflict"
    | "designId"
    | "shareToken"
    | "shareEnabled"
    | "lastCloudRevision"
    | "lastDbSaveAt"
    | "lastPersistedSnapshotFingerprint"
    | "lastCloudSaveError"
    | "isSaving"
  >;
};

function readAuthority(input: ConflictCopyControllerInput): ConflictCopyAuthority {
  const baseline = input.actions.cloudBaseline.captureTransition();
  const writeContext = input.adapters.cloudWriteQueue.getCurrent();
  const route = input.actions.readDesignRoute();
  return {
    routeDesignId: route.designId,
    visibleDesignId: input.state.designId,
    revision: input.state.lastCloudRevision,
    documentFingerprint: input.state.currentStoredDesignFingerprint,
    documentEpoch: baseline.documentEpoch,
    persistenceEpoch: writeContext.persistenceEpoch,
    routeIdentity: route.identity,
  };
}

function captureTransition(
  input: ConflictCopyControllerInput,
): ConflictCopyTransitionSnapshot {
  const stored = input.adapters.getStoredDesignForPersistence();
  return {
    baseline: input.actions.cloudBaseline.captureTransition(),
    writeContext: input.adapters.cloudWriteQueue.getCurrent(),
    stored,
    fingerprint: input.adapters.fingerprintStoredDesign(stored),
    local: {
      cloudSaveConflict: input.state.cloudSaveConflict,
      designId: input.state.designId,
      shareToken: input.state.shareToken,
      shareEnabled: input.state.shareEnabled,
      lastCloudRevision: input.state.lastCloudRevision,
      lastDbSaveAt: input.state.lastDbSaveAt,
      lastPersistedSnapshotFingerprint:
        input.state.lastPersistedSnapshotFingerprint,
      lastCloudSaveError: input.state.lastCloudSaveError,
      isSaving: input.state.isSaving,
    },
  };
}

function buildCopyPayload(
  input: ConflictCopyControllerInput,
  snapshot: ConflictCopyTransitionSnapshot,
) {
  const legacyData = snapshotToLegacyApi(storedToSnapshot(snapshot.stored));
  return {
    title: "Recovered design copy",
    ...legacyData,
    savedViews: input.state.savedViews,
    style: input.state.style,
    budget: input.state.budget,
    mode: input.state.mode,
    notes: input.state.notes,
  };
}

function writeContextMatches(
  left: DesignPageCloudWriteContext,
  right: DesignPageCloudWriteContext,
) {
  return left.designId === right.designId &&
    left.revision === right.revision &&
    left.documentEpoch === right.documentEpoch &&
    left.persistenceEpoch === right.persistenceEpoch;
}

function snapshotMatchesOperation(
  snapshot: ConflictCopyTransitionSnapshot,
  operation: ConflictCopyOperation,
) {
  return snapshot.writeContext.designId === operation.sourceDesignId &&
    snapshot.writeContext.revision === operation.sourceRevision &&
    snapshot.writeContext.documentEpoch === operation.documentEpoch &&
    snapshot.writeContext.persistenceEpoch === operation.persistenceEpoch &&
    snapshot.fingerprint === operation.documentFingerprint;
}

function commitLocalTransition(
  input: ConflictCopyControllerInput,
  snapshot: ConflictCopyTransitionSnapshot,
  copy: CreatedConflictCopyIdentity,
) {
  input.actions.cancelDesignLoad();
  const identity = input.actions.cloudBaseline.commitTransition({
    snapshot: snapshot.baseline,
    designId: copy.designId,
    revision: copy.revision,
    fingerprint: snapshot.fingerprint,
  });
  if (!identity) return false;
  input.adapters.cloudWriteQueue.invalidate({
    designId: copy.designId,
    revision: copy.revision,
    documentEpoch: identity.epoch,
  });
  input.actions.setDesignId(copy.designId);
  input.actions.setShareToken(null);
  input.actions.setShareEnabled(false);
  input.actions.setLastCloudRevision(copy.revision);
  input.actions.setLastDbSaveAt(Date.parse(copy.revision));
  input.actions.setLastPersistedSnapshotFingerprint(null);
  input.actions.setLastCloudSaveError(null);
  input.actions.setIsSaving(false);
  input.actions.setCloudSaveConflict(null);
  return true;
}

function restoreLocalTransition(
  input: ConflictCopyControllerInput,
  snapshot: ConflictCopyTransitionSnapshot,
) {
  input.actions.cloudBaseline.restoreTransition(snapshot.baseline);
  input.adapters.cloudWriteQueue.invalidate({
    designId: snapshot.writeContext.designId,
    revision: snapshot.writeContext.revision,
    documentEpoch: snapshot.writeContext.documentEpoch,
  });
  input.actions.setDesignId(snapshot.local.designId);
  input.actions.setShareToken(snapshot.local.shareToken);
  input.actions.setShareEnabled(snapshot.local.shareEnabled);
  input.actions.setLastCloudRevision(snapshot.local.lastCloudRevision);
  input.actions.setLastDbSaveAt(snapshot.local.lastDbSaveAt);
  input.actions.setLastPersistedSnapshotFingerprint(
    snapshot.local.lastPersistedSnapshotFingerprint,
  );
  input.actions.setLastCloudSaveError(snapshot.local.lastCloudSaveError);
  input.actions.setIsSaving(snapshot.local.isSaving);
  input.actions.setCloudSaveConflict(snapshot.local.cloudSaveConflict);
}

function recordFailure(
  input: ConflictCopyControllerInput,
  conflict: DesignPageCloudSaveConflictState,
  error: unknown,
  copyCreated: boolean,
) {
  const detail = error instanceof Error
    ? error.message
    : "The local copy could not be saved to the cloud.";
  const message = copyCreated
    ? `A cloud copy was created but was not activated. ${detail}`
    : detail;
  input.actions.setCloudSaveConflict((previous) =>
    previous?.designId === conflict.designId &&
      previous.detectedAt === conflict.detectedAt
      ? { ...previous, isWorking: false, resolutionError: message }
      : previous
  );
}

function publishTransition(
  input: ConflictCopyControllerInput,
  conflict: DesignPageCloudSaveConflictState,
  copy: CreatedConflictCopyIdentity,
) {
  void input.actions.fetchShareStatus(copy.designId);
  if (input.state.isDesigner) void input.actions.enableShare(copy.designId);
  track("design_conflict_saved_as_copy", {
    prior_design_id: conflict.designId,
    saved_design_id: copy.designId,
  });
  input.actions.showRuleToast("Local changes saved as a new cloud copy");
}

type ConflictCopyInputRef = { current: ConflictCopyControllerInput };

function createTransitionAdapters(
  inputRef: ConflictCopyInputRef,
  conflict: DesignPageCloudSaveConflictState,
  payload: ReturnType<typeof buildCopyPayload>,
) {
  return {
    readAuthority: () => readAuthority(inputRef.current),
    readRoute: () => inputRef.current.actions.readDesignRoute(),
    createCopy: (active: ConflictCopyOperation) =>
      designApi.create(payload, active.signal),
    preflight: (
      original: ConflictCopyTransitionSnapshot,
      _copy: CreatedConflictCopyIdentity,
      active: ConflictCopyOperation,
    ) => {
      const latest = inputRef.current;
      return snapshotMatchesOperation(original, active) &&
        latest.actions.cloudBaseline.canCommitTransition(original.baseline) &&
        writeContextMatches(
          latest.adapters.cloudWriteQueue.getCurrent(),
          original.writeContext,
        );
    },
    replaceRoute: (route: ConflictCopyRouteSnapshot, designId: string) =>
      inputRef.current.actions.replaceDesignRoute(route, designId),
    restoreRoute: (route: ConflictCopyRouteSnapshot, designId: string) =>
      inputRef.current.actions.restoreDesignRoute(route, designId),
    commit: (
      original: ConflictCopyTransitionSnapshot,
      copy: CreatedConflictCopyIdentity,
    ) => commitLocalTransition(inputRef.current, original, copy),
    restore: (original: ConflictCopyTransitionSnapshot) =>
      restoreLocalTransition(inputRef.current, original),
    publish: (copy: CreatedConflictCopyIdentity) =>
      publishTransition(inputRef.current, conflict, copy),
  };
}

async function executeConflictCopy(
  inputRef: ConflictCopyInputRef,
  coordinator: ConflictCopyOperationCoordinator,
) {
  const current = inputRef.current;
  const conflict = current.state.cloudSaveConflict;
  if (!conflict || conflict.isWorking) return;
  if (current.actions.currentCloudWriteIsBlocked()) {
    current.actions.setCloudSaveConflict({
      ...conflict,
      resolutionError: "Wait for the loaded cloud design to finish restoring.",
    });
    return;
  }
  const snapshot = captureTransition(current);
  const operation = coordinator.begin({
    conflictKey: `${conflict.designId}:${conflict.detectedAt}`,
    authority: readAuthority(current),
  });
  if (!operation) return;
  current.actions.setCloudSaveConflict({
    ...conflict,
    isWorking: true,
    resolutionError: null,
  });
  const result = await runConflictCopyTransition({
    coordinator,
    operation,
    snapshot,
    adapters: createTransitionAdapters(
      inputRef,
      conflict,
      buildCopyPayload(current, snapshot),
    ),
  });
  coordinator.finish(operation);
  if (result.status !== "failed" && result.status !== "copy_created_not_activated") {
    return;
  }
  recordFailure(
    inputRef.current,
    conflict,
    result.error,
    result.status === "copy_created_not_activated",
  );
}
export function useDesignPageCloudConflictCopyController(
  input: ConflictCopyControllerInput,
) {
  const inputRef = useRef(input);
  const [coordinator] = useState(createConflictCopyOperationCoordinator);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);
  useEffect(() => {
    const observeRoute = () => coordinator.invalidateIfAuthorityChanged(
      readAuthority(inputRef.current),
    );
    window.addEventListener("popstate", observeRoute);
    return () => {
      window.removeEventListener("popstate", observeRoute);
      coordinator.invalidate();
    };
  }, [coordinator]);

  useEffect(() => {
    coordinator.invalidateIfAuthorityChanged(readAuthority(input));
  }, [coordinator, input]);
  const cancel = useCallback(() => coordinator.invalidate(), [coordinator]);
  const save = useCallback(
    () => executeConflictCopy(inputRef, coordinator),
    [coordinator],
  );
  return { save, cancel };
}
