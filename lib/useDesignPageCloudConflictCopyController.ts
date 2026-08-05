"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import { track } from "@/lib/analytics";
import { designApi } from "@/lib/design-api-client";
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
    detachBaseline: () => void;
    stageWriteBaseline: (write: {
      designId: string;
      revision: string;
      fingerprint: string;
      epoch: number;
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
    enqueueCloudWrite: <T>(operation: () => Promise<T>) => Promise<T>;
    getStoredDesignForPersistence: () => StoredDesign;
    fingerprintStoredDesign: (stored: StoredDesign) => string;
  };
  refs: { documentEpochRef: MutableRefObject<number> };
};

type CreatedConflictCopy = {
  designId: string;
  revision: string;
  stored: StoredDesign;
};

async function createConflictCopy(
  input: ConflictCopyControllerInput
): Promise<CreatedConflictCopy> {
  const { state, adapters } = input;
  const stored = adapters.getStoredDesignForPersistence();
  const legacyData = snapshotToLegacyApi(storedToSnapshot(stored));
  const data = await adapters.enqueueCloudWrite(() =>
    designApi.create({
      title: "Recovered design copy",
      ...legacyData,
      savedViews: state.savedViews,
      style: state.style,
      budget: state.budget,
      mode: state.mode,
      notes: state.notes,
    })
  );
  const designId = typeof data?.id === "string" && data.id.trim()
    ? data.id
    : null;
  const revision = typeof data?.updatedAt === "string" && data.updatedAt.trim()
    ? data.updatedAt
    : null;
  if (!designId || !revision) {
    throw new Error("The new cloud copy did not return a valid revision.");
  }
  return { designId, revision, stored };
}

function commitConflictCopy(
  input: ConflictCopyControllerInput,
  conflict: DesignPageCloudSaveConflictState,
  copy: CreatedConflictCopy
): void {
  const { state, actions, adapters, refs } = input;
  actions.detachBaseline();
  if (!actions.stageWriteBaseline({
    designId: copy.designId,
    revision: copy.revision,
    fingerprint: adapters.fingerprintStoredDesign(copy.stored),
    epoch: refs.documentEpochRef.current,
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
  actions.setConflict({ ...conflict, isWorking: true, resolutionError: null });
  try {
    const copy = await createConflictCopy(input);
    if (actions.currentWriteIsBlocked()) {
      throw new Error("The cloud design changed while the new copy was being saved.");
    }
    commitConflictCopy(input, conflict, copy);
  } catch (error) {
    recordConflictCopyFailure(input, conflict, error);
  }
}

export function useDesignPageCloudConflictCopyController(
  input: ConflictCopyControllerInput
) {
  return useCallback(() => saveConflictAsNewCopy(input), [input]);
}
