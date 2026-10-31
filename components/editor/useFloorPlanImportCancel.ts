"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readActiveFloorPlanImportId,
  writeActiveFloorPlanImportId,
  writeFloorPlanImportHint,
} from "@/lib/floor-plan-import-client";
import { UserFacingError, userFacingErrorMessage } from "@/lib/user-facing-error";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";

/** Cancel for the reading screen (J, 31 Oct). Only the upload window gives one, so only it shows the button. */
export type FloorPlanImportCancel = {
  cancel: () => void;
  /** Cancel was pressed: from then until the answer, or until a still-uploading file arrives. */
  cancelling: boolean;
  /** The cancel has gone to the server; the screen behind may change meanwhile, so it is hidden. */
  stopping: boolean;
  error: string | null;
};

export const FloorPlanImportCancelContext = createContext<FloorPlanImportCancel | null>(null);

/**
 * Asks the server to cancel an upload. It stops a read already under way too (the cancel route);
 * an upload that is gone already (404) counts as cancelled.
 */
export async function requestFloorPlanImportCancel(jobId: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(`/api/floor-plan-imports/${encodeURIComponent(jobId)}/cancel`, {
    method: "POST",
    headers: { Accept: "application/json" },
  });
  if (response.ok || response.status === 404) return;
  const payload = (await response.json().catch(() => ({}))) as { error?: unknown };
  throw new UserFacingError(
    typeof payload.error === "string" ? payload.error : "Unable to cancel this upload",
    response.status
  );
}

/** A cancelled upload is no longer the one the window reopens on, whenever the answer arrives. */
function forgetStoredImport(jobId: string) {
  try {
    if (readActiveFloorPlanImportId(window.localStorage) !== jobId) return;
    writeActiveFloorPlanImportId(window.localStorage, null);
    writeFloorPlanImportHint(window.localStorage, null);
  } catch {
    // Storage can be unavailable (private windows); the server's answer still stands.
  }
}

type CancelPhase = "idle" | "waiting" | "sending";
/** What the screen shows, for the upload it was shown for (`run`), so a new upload starts idle. */
type CancelStatus = { run: unknown; phase: CancelPhase; error: string | null };
const IDLE: CancelStatus = { run: null, phase: "idle", error: null };

/** The upload on screen and its cancel; `generation` moves on whenever the upload does. */
type CancelRun = { key: unknown; jobId: string | null; generation: number; cancelling: boolean; waitingForJob: boolean };

/**
 * Cancels `jobId`. `settle` hears how it went; `onCancelled` (back to the drop box) runs only if
 * the window is still on that upload.
 */
async function sendCancel(run: CancelRun, jobId: string, settle: (error: string | null) => void, onCancelled: () => void) {
  const generation = run.generation;
  try {
    await requestFloorPlanImportCancel(jobId);
    forgetStoredImport(jobId);
    settle(null);
    if (generation === run.generation) onCancelled();
  } catch (cause) {
    if (generation === run.generation) run.cancelling = false;
    settle(userFacingErrorMessage(cause, "Unable to cancel this upload"));
  }
}

type FloorPlanImportCancelInput = {
  /** A new file being uploaded, whose job isn't known until the upload arrives. */
  request: object | null;
  /** The upload being resumed when there's no new file. */
  resumeJobId: string | null;
  onActiveJobIdChange: (jobId: string | null) => void;
  onJobUpdate: (job: ConsumerFloorPlanImportJob) => void;
  /** Back to the drop box. */
  onCancelled: () => void;
};

/**
 * Cancel for the upload on screen. It learns the upload's job from the two callbacks it wraps (kept
 * stable, as the upload's effect depends on them), so a file still uploading is cancelled the
 * moment its job exists: cancelling the upload request itself could leave a job a worker would
 * still read.
 */
export function useFloorPlanImportCancel(input: FloorPlanImportCancelInput) {
  const { request, resumeJobId, onActiveJobIdChange, onJobUpdate, onCancelled } = input;
  const knownJobId = request ? null : resumeJobId;
  const runKey = request ?? knownJobId;
  const runRef = useRef<CancelRun>({ key: runKey, jobId: knownJobId, generation: 0, cancelling: false, waitingForJob: false });
  const onCancelledRef = useRef(onCancelled);
  const [status, setStatus] = useState<CancelStatus>(IDLE);
  useEffect(() => {
    onCancelledRef.current = onCancelled;
  });
  // A new upload (or closing the window) retires the last one's cancel, so a late answer is ignored.
  useEffect(() => {
    const run = runRef.current;
    Object.assign(run, { key: runKey, jobId: knownJobId, cancelling: false, waitingForJob: false });
    return () => {
      run.generation += 1;
    };
  }, [runKey, knownJobId]);

  const send = useCallback((jobId: string) => {
    const key = runRef.current.key;
    setStatus({ run: key, phase: "sending", error: null });
    const settle = (error: string | null) =>
      setStatus((current) => (current.run === key ? { run: key, phase: "idle", error } : current));
    void sendCancel(runRef.current, jobId, settle, () => onCancelledRef.current());
  }, []);

  const cancel = useCallback(() => {
    const run = runRef.current;
    if (run.cancelling) return;
    run.cancelling = true;
    if (run.jobId) return send(run.jobId);
    run.waitingForJob = true;
    setStatus({ run: run.key, phase: "waiting", error: null });
  }, [send]);

  const trackJobId = useCallback((jobId: string | null) => {
    const run = runRef.current;
    run.jobId = jobId;
    onActiveJobIdChange(jobId);
    if (!jobId || !run.waitingForJob) return;
    run.waitingForJob = false;
    send(jobId);
  }, [onActiveJobIdChange, send]);

  const trackJob = useCallback((job: ConsumerFloorPlanImportJob) => {
    runRef.current.jobId = job.id;
    onJobUpdate(job);
  }, [onJobUpdate]);

  const shown = status.run === runKey ? status : IDLE;
  const value = useMemo(
    () => ({ cancel, cancelling: shown.phase !== "idle", stopping: shown.phase === "sending", error: shown.error }),
    [cancel, shown]
  );
  return { value, trackJobId, trackJob };
}
