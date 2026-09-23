"use client";

import {
  useCallback,
  useLayoutEffect,
  useRef,
  type MutableRefObject,
} from "react";

import { track, trackProductEvent, trackProductPerformance } from "@/lib/analytics";
import { designApi, DesignApiError } from "@/lib/design-api-client";
import { executeDesignPageCloudWrite } from "@/lib/design-page-cloud-write-execution";
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
import type { DesignItem, DesignSnapshot, ZoneMin } from "@/lib/room-types";
import type { DesignPageCloudBaselineController } from "@/lib/useDesignPageCloudBaselineController";

type Budget = "$" | "$$" | "$$$";
type DesignMode = "homeowner" | "designer";
type StageWrite = DesignPageCloudBaselineController["actions"]["stageWrite"];

export type PreserveCurrentDesignResult =
  | { ok: true; savedDesignId: string }
  | { ok: false; error: string };

type SharedSaveInput = {
  state: {
    savedViews: NamedCameraView[];
    style: Style;
    budget: Budget;
    mode: DesignMode;
    notes: string;
  };
  actions: {
    currentWriteIsBlocked: () => boolean;
    setIsSaving: (value: boolean) => void;
    setLastCloudSaveError: (error: string | null) => void;
    setLastCloudRevision: (revision: string) => void;
    setLastDbSaveAt: (savedAt: number) => void;
    setCloudSaveConflict: (conflict: null) => void;
    showMaxDesignUpgrade: () => void;
    recordCloudSaveFailure: (
      error: unknown,
      designId: string | null,
      fallback: string
    ) => string;
  };
  adapters: {
    queue: DesignPageCloudWriteQueue;
    stageWrite: StageWrite;
    getStoredDesign: () => StoredDesign;
    fingerprintStoredDesign: (stored: StoredDesign) => string;
  };
};

type ManualSaveInput = SharedSaveInput & {
  state: SharedSaveInput["state"] & {
    isAuthenticated: boolean;
    isDesigner: boolean;
    itemsCount: number;
  };
  actions: SharedSaveInput["actions"] & {
    setDesignId: (designId: string) => void;
    fetchShareStatus: (designId: string) => Promise<void>;
    enableShare: (designId: string) => Promise<void>;
    showRuleToast: (message: string) => void;
  };
  refs: { firstSave: MutableRefObject<boolean> };
};

type PreserveSaveInput = SharedSaveInput & {
  state: SharedSaveInput["state"] & {
    isAuthenticated: boolean;
    designSnapshot: DesignSnapshot;
    items: DesignItem[];
    zones: ZoneMin[];
    roomWidth: number;
    roomDepth: number;
  };
};

function writeKind(queue: DesignPageCloudWriteQueue) {
  return queue.getCurrent().designId ? "update" as const : "create" as const;
}

function prepareManualWrite(
  input: ManualSaveInput,
  stored: StoredDesign,
  binding: DesignPageCloudWriteBinding
) {
  const legacyData = snapshotToLegacyApi(storedToSnapshot(stored));
  const payload = {
    title: "My Living Room",
    ...legacyData,
    savedViews: input.state.savedViews,
    style: input.state.style,
    budget: input.state.budget,
    mode: input.state.mode,
    notes: input.state.notes,
    ...(binding.designId && binding.revision
      ? { expectedUpdatedAt: binding.revision }
      : {}),
  };
  return () => binding.designId
    ? designApi.update(binding.designId, payload)
    : designApi.create(payload);
}

function recordManualPerformance(input: ManualSaveInput, durationMs: number) {
  trackProductEvent("project_saved", {
    source: "cloud",
    result: "success",
    durationMs,
    itemCount: input.state.itemsCount,
  });
  trackProductPerformance({
    metric: "save_duration_ms",
    value: durationMs,
    context: {
      mode: input.state.mode === "designer" ? "pro" : "consumer",
      itemCount: input.state.itemsCount,
      source: "cloud",
    },
  });
}

function commitManualSave(
  input: ManualSaveInput,
  saved: { designId: string; revision: string },
  startedAt: number
) {
  const { actions, state } = input;
  actions.setDesignId(saved.designId);
  actions.setLastCloudRevision(saved.revision);
  actions.setLastDbSaveAt(Date.now());
  actions.setLastCloudSaveError(null);
  actions.setCloudSaveConflict(null);
  void actions.fetchShareStatus(saved.designId);
  if (state.isDesigner) void actions.enableShare(saved.designId);
  if (!input.refs.firstSave.current) {
    track("design_saved_db", {
      design_id: saved.designId,
      items_count: state.itemsCount,
      room_type: "living_room",
      mode: state.mode,
      is_guest: !state.isAuthenticated,
    });
    input.refs.firstSave.current = true;
  }
  recordManualPerformance(input, performance.now() - startedAt);
}

function recordManualFailure(
  input: ManualSaveInput,
  error: unknown,
  designId: string | null,
  startedAt: number
) {
  const message = input.actions.recordCloudSaveFailure(
    error,
    designId,
    "Cloud save failed."
  );
  if (error instanceof DesignApiError && error.kind === "forbidden") {
    input.actions.showMaxDesignUpgrade();
    track("upgrade_prompt_shown", { reason: "max_designs" });
  }
  input.actions.showRuleToast(`Save failed: ${message}`);
  trackProductEvent("project_save_failed", {
    source: "cloud",
    result: "failure",
    errorCode: error instanceof DesignApiError
      ? error.kind
      : error instanceof Error ? error.name : "unknown",
    durationMs: performance.now() - startedAt,
  });
}

function recordInvalidManualResponse(input: ManualSaveInput, startedAt: number) {
  const message = "No design identity or revision returned";
  input.actions.showRuleToast(`Save failed: ${message}`);
  input.actions.setLastCloudSaveError(message);
  trackProductEvent("project_save_failed", {
    source: "cloud",
    result: "failure",
    errorCode: "missing_design_id",
    durationMs: performance.now() - startedAt,
  });
}

async function executeManualSave(input: ManualSaveInput): Promise<string | null> {
  if (input.actions.currentWriteIsBlocked()) {
    input.actions.showRuleToast(
      "Wait for the loaded cloud design to finish restoring before saving."
    );
    return null;
  }
  const startedAt = performance.now();
  input.actions.setIsSaving(true);
  input.actions.setLastCloudSaveError(null);
  let result: Awaited<ReturnType<typeof executeDesignPageCloudWrite>> | null = null;
  try {
    const stored = input.adapters.getStoredDesign();
    result = await executeDesignPageCloudWrite({
      queue: input.adapters.queue,
      kind: writeKind(input.adapters.queue),
      fingerprint: input.adapters.fingerprintStoredDesign(stored),
      prepare: (binding) => prepareManualWrite(input, stored, binding),
      stage: input.adapters.stageWrite,
    });
    if (result.status === "saved") {
      commitManualSave(input, result, startedAt);
      return result.designId;
    }
    if (result.status === "invalid") recordInvalidManualResponse(input, startedAt);
    if (result.status === "failed") {
      recordManualFailure(input, result.error, result.binding.designId, startedAt);
    }
    return null;
  } catch (error) {
    recordManualFailure(input, error, input.adapters.queue.getCurrent().designId, startedAt);
    return null;
  } finally {
    if (!result || input.adapters.queue.requestIsLatest(result.binding)) {
      input.actions.setIsSaving(false);
    }
  }
}

function preparePreserveWrite(
  input: PreserveSaveInput,
  stored: StoredDesign,
  binding: DesignPageCloudWriteBinding
) {
  const legacyData = snapshotToLegacyApi(storedToSnapshot(stored));
  const payload = binding.designId
    ? {
        items: input.state.items,
        zones: input.state.zones,
        savedViews: input.state.savedViews,
        roomWidth: input.state.roomWidth,
        roomDepth: input.state.roomDepth,
        snapshot: stored,
        style: input.state.style,
        budget: input.state.budget,
        mode: input.state.mode,
        notes: input.state.notes,
        ...(binding.revision ? { expectedUpdatedAt: binding.revision } : {}),
      }
    : {
        title: "My Living Room",
        ...legacyData,
        savedViews: input.state.savedViews,
        style: input.state.style,
        budget: input.state.budget,
        mode: input.state.mode,
        notes: input.state.notes,
      };
  return () => binding.designId
    ? designApi.update(binding.designId, payload)
    : designApi.create(payload);
}

function commitPreservedDesign(
  input: PreserveSaveInput,
  saved: { designId: string; revision: string; binding: DesignPageCloudWriteBinding }
): PreserveCurrentDesignResult {
  input.actions.setLastDbSaveAt(Date.now());
  input.actions.setLastCloudRevision(saved.revision);
  input.actions.setLastCloudSaveError(null);
  input.actions.setCloudSaveConflict(null);
  track("design_preserved_before_new_plan", {
    design_id: saved.designId,
    created_saved_copy: !saved.binding.designId,
    room_count: input.state.designSnapshot.rooms.length,
    items_count: input.state.items.length,
  });
  return { ok: true, savedDesignId: saved.designId };
}

function preserveFailure(input: PreserveSaveInput, error: unknown, designId: string | null) {
  const message = input.actions.recordCloudSaveFailure(
    error,
    designId,
    "Cloud save failed."
  );
  if (error instanceof DesignApiError && error.kind === "forbidden") {
    input.actions.showMaxDesignUpgrade();
    track("upgrade_prompt_shown", { reason: "max_designs" });
  }
  return { ok: false, error: message } as const;
}

async function executePreserveSave(
  input: PreserveSaveInput
): Promise<PreserveCurrentDesignResult> {
  if (!input.state.isAuthenticated) {
    return { ok: false, error: "Sign in before starting a new plan so the current design can be kept." };
  }
  if (input.actions.currentWriteIsBlocked()) {
    return { ok: false, error: "Wait for the loaded cloud design to finish restoring before starting a new plan." };
  }
  input.actions.setIsSaving(true);
  input.actions.setLastCloudSaveError(null);
  let result: Awaited<ReturnType<typeof executeDesignPageCloudWrite>> | null = null;
  try {
    const stored = input.adapters.getStoredDesign();
    result = await executeDesignPageCloudWrite({
      queue: input.adapters.queue,
      kind: writeKind(input.adapters.queue),
      fingerprint: input.adapters.fingerprintStoredDesign(stored),
      prepare: (binding) => preparePreserveWrite(input, stored, binding),
      stage: input.adapters.stageWrite,
    });
    if (result.status === "saved") return commitPreservedDesign(input, result);
    if (result.status === "failed") {
      return preserveFailure(input, result.error, result.binding.designId);
    }
    const error = result.status === "invalid"
      ? "The current design was saved without a complete cloud identity."
      : "The obsolete cloud save was ignored.";
    if (result.status === "invalid") input.actions.setLastCloudSaveError(error);
    return { ok: false, error };
  } catch (error) {
    return preserveFailure(input, error, input.adapters.queue.getCurrent().designId);
  } finally {
    if (!result || input.adapters.queue.requestIsLatest(result.binding)) {
      input.actions.setIsSaving(false);
    }
  }
}

export function useDesignPageManualCloudSave(input: ManualSaveInput) {
  const inputRef = useRef(input);
  useLayoutEffect(() => {
    inputRef.current = input;
  }, [input]);
  return useCallback(() => executeManualSave(inputRef.current), []);
}

export function useDesignPagePreserveCloudSave(input: PreserveSaveInput) {
  const inputRef = useRef(input);
  useLayoutEffect(() => {
    inputRef.current = input;
  }, [input]);
  return useCallback(() => executePreserveSave(inputRef.current), []);
}
