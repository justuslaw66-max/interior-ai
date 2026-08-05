"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { track } from "@/lib/analytics";
import { designApi } from "@/lib/design-api-client";
import {
  executeDesignPageCloudWrite,
  type DesignPageCloudWriteResult,
} from "@/lib/design-page-cloud-write-execution";
import type {
  DesignPageCloudWriteBinding,
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
    conflict: DesignPageCloudSaveConflictState | null;
    isDesigner: boolean;
    savedViews: NamedCameraView[];
    style: Style;
    budget: Budget;
    mode: DesignMode;
    notes: string;
  };
  actions: {
    setConflict: Dispatch<SetStateAction<DesignPageCloudSaveConflictState | null>>;
    currentWriteIsBlocked: () => boolean;
    invalidateCloudWrites: () => void;
    installCloudWriteIdentity: (identity: {
      designId: string;
      revision: string;
      documentEpoch: number;
    }) => void;
    detachBaseline: () => void;
    stageWriteBaseline: (write: {
      designId: string;
      revision: string;
      fingerprint: string;
      epoch: number;
      requestId: number;
      persistenceEpoch: number;
    }) => boolean;
    setDesignId: Dispatch<SetStateAction<string | null>>;
    setShareToken: Dispatch<SetStateAction<string | null>>;
    setShareEnabled: Dispatch<SetStateAction<boolean>>;
    setLastCloudRevision: Dispatch<SetStateAction<string | null>>;
    setLastDbSaveAt: Dispatch<SetStateAction<number | null>>;
    setLastPersistedFingerprint: Dispatch<SetStateAction<string | null>>;
    setLastCloudSaveError: Dispatch<SetStateAction<string | null>>;
    fetchShareStatus: (designId: string) => Promise<void>;
    enableShare: (designId: string) => Promise<void>;
    showRuleToast: (message: string) => void;
  };
  adapters: {
    cloudWriteQueue: DesignPageCloudWriteQueue;
    getStoredDesignForPersistence: () => StoredDesign;
    fingerprintStoredDesign: (stored: StoredDesign) => string;
  };
  refs: { documentEpochRef: MutableRefObject<number> };
};

type CreatedConflictCopy = {
  designId: string;
  revision: string;
  stored: StoredDesign;
  binding: DesignPageCloudWriteBinding;
};

type UnsuccessfulConflictCopy = Exclude<
  DesignPageCloudWriteResult,
  { status: "saved" }
>;

function prepareConflictCopy(
  input: ConflictCopyControllerInput
): {
  stored: StoredDesign;
  fingerprint: string;
  payload: Parameters<typeof designApi.create>[0];
} {
  const { state, adapters } = input;
  const stored = adapters.getStoredDesignForPersistence();
  const legacyData = snapshotToLegacyApi(storedToSnapshot(stored));
  const payload = {
    title: "Recovered design copy",
    ...legacyData,
    savedViews: state.savedViews,
    style: state.style,
    budget: state.budget,
    mode: state.mode,
    notes: state.notes,
  };
  return {
    stored,
    fingerprint: adapters.fingerprintStoredDesign(stored),
    payload,
  };
}

async function createConflictCopy(
  input: ConflictCopyControllerInput,
  prepared: ReturnType<typeof prepareConflictCopy>
): Promise<CreatedConflictCopy | UnsuccessfulConflictCopy> {
  const result = await executeDesignPageCloudWrite({
    queue: input.adapters.cloudWriteQueue,
    kind: "recovery_copy",
    fingerprint: prepared.fingerprint,
    prepare: () => () => designApi.create(prepared.payload),
  });
  if (result.status !== "saved") return result;
  return {
    designId: result.designId,
    revision: result.revision,
    stored: prepared.stored,
    binding: result.binding,
  };
}

function commitConflictCopy(
  input: ConflictCopyControllerInput,
  conflict: DesignPageCloudSaveConflictState,
  copy: CreatedConflictCopy
): void {
  const { state, actions, adapters, refs } = input;
  actions.detachBaseline();
  actions.installCloudWriteIdentity({
    designId: copy.designId,
    revision: copy.revision,
    documentEpoch: refs.documentEpochRef.current,
  });
  if (!actions.stageWriteBaseline({
    designId: copy.designId,
    revision: copy.revision,
    fingerprint: adapters.fingerprintStoredDesign(copy.stored),
    epoch: refs.documentEpochRef.current,
    requestId: copy.binding.requestId,
    persistenceEpoch: copy.binding.persistenceEpoch,
  })) throw new Error("The new cloud copy could not establish its baseline.");
  actions.setDesignId(copy.designId);
  actions.setShareToken(null);
  actions.setShareEnabled(false);
  actions.setLastCloudRevision(copy.revision);
  actions.setLastDbSaveAt(Date.now());
  actions.setLastPersistedFingerprint(null);
  actions.setLastCloudSaveError(null);
  actions.setConflict(null);
  void actions.fetchShareStatus(copy.designId);
  if (state.isDesigner) void actions.enableShare(copy.designId);
  track("design_conflict_saved_as_copy", {
    prior_design_id: conflict.designId,
    saved_design_id: copy.designId,
  });
  actions.showRuleToast("Local changes saved as a new cloud copy");
}

function recordConflictCopyFailure(
  input: ConflictCopyControllerInput,
  conflict: DesignPageCloudSaveConflictState,
  error: unknown
): void {
  const message = error instanceof Error
    ? error.message
    : "The local copy could not be saved to the cloud.";
  input.actions.setConflict((previous) =>
    previous?.designId === conflict.designId
      ? { ...previous, isWorking: false, resolutionError: message }
      : previous
  );
}

function stopStaleConflictCopy(
  input: ConflictCopyControllerInput,
  conflict: DesignPageCloudSaveConflictState
): void {
  input.actions.setConflict((previous) =>
    previous?.designId === conflict.designId &&
      previous.detectedAt === conflict.detectedAt
      ? { ...previous, isWorking: false }
      : previous
  );
}

async function saveConflictAsNewCopy(
  input: ConflictCopyControllerInput
): Promise<void> {
  const { actions } = input;
  const conflict = input.state.conflict;
  if (!conflict || conflict.isWorking) return;
  if (actions.currentWriteIsBlocked()) {
    actions.setConflict({
      ...conflict,
      resolutionError: "Wait for the loaded cloud design to finish restoring.",
    });
    return;
  }
  actions.invalidateCloudWrites();
  actions.setConflict({ ...conflict, isWorking: true, resolutionError: null });
  try {
    const prepared = prepareConflictCopy(input);
    const result = await createConflictCopy(input, prepared);
    if ("status" in result) {
      if (result.status === "stale") {
        stopStaleConflictCopy(input, conflict);
        return;
      }
      const error = result.status === "failed"
        ? result.error
        : new Error(result.message);
      recordConflictCopyFailure(input, conflict, error);
      return;
    }
    commitConflictCopy(input, conflict, result);
  } catch (error) {
    recordConflictCopyFailure(input, conflict, error);
  }
}

export function useDesignPageCloudConflictCopyController(
  input: ConflictCopyControllerInput
) {
  return useCallback(() => saveConflictAsNewCopy(input), [input]);
}
