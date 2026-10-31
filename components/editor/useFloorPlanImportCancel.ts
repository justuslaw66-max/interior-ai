"use client";

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  readActiveFloorPlanImportId,
  writeActiveFloorPlanImportId,
  writeFloorPlanImportHint,
} from "@/lib/floor-plan-import-client";
import { UserFacingError, userFacingErrorMessage } from "@/lib/user-facing-error";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import { cancelFloorPlanUploadOnArrival } from "./cancelledFloorPlanUploads";

/** Cancel for the reading screen (J, 31 Oct). Only the upload window gives one, so only it shows the button. */
export type FloorPlanImportCancel = {
  cancel: () => void;
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

/** What the screen shows, for the upload it was shown for (`run`), so a new upload starts idle. */
type CancelStatus = { run: unknown; stopping: boolean; error: string | null };
const IDLE: CancelStatus = { run: null, stopping: false, error: null };

/** The upload on screen and its cancel; `generation` moves on whenever the upload does. */
type CancelRun = { key: unknown; jobId: string | null; generation: number; cancelling: boolean };

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

/** Waits before each try of a cancel sent in the background; the last is past the route's one-minute rate window. */
const BACKGROUND_CANCEL_DELAYS_MS = [0, 2_000, 10_000, 65_000];

/**
 * Cancels `jobId` with nobody waiting on screen, trying again after a dropped connection, a server
 * error or the rate limit, since a job left uncancelled would be read. A refusal (409: the plan is
 * past cancelling) is final; a job already gone (404) counts as cancelled.
 */
export async function cancelFloorPlanImportInBackground(jobId: string, wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))) {
  for (const delayMs of BACKGROUND_CANCEL_DELAYS_MS) {
    if (delayMs) await wait(delayMs);
    try {
      await requestFloorPlanImportCancel(jobId);
      return true;
    } catch (cause) {
      if (cause instanceof UserFacingError && cause.status === 409) return false;
    }
  }
  return false;
}

/** A file still uploading when Cancel upload was pressed: its job is cancelled when it arrives. */
function cancelOnArrival(file: File) {
  cancelFloorPlanUploadOnArrival(file, (jobId) => {
    void cancelFloorPlanImportInBackground(jobId);
  });
}

type FloorPlanImportCancelInput = {
  /** A new file being uploaded, whose job isn't known until the upload arrives. */
  request: { file: File } | null;
  /** The upload being resumed when there's no new file. */
  resumeJobId: string | null;
  /** The window's count of uploads opened (its review session): opening the same one again is a new run. */
  session: number;
  onActiveJobIdChange: (jobId: string | null) => void;
  onJobUpdate: (job: ConsumerFloorPlanImportJob) => void;
  /** Back to the drop box. */
  onCancelled: () => void;
};

/**
 * Cancel for the upload on screen. It learns the upload's job from the two callbacks it wraps (kept
 * stable, as the upload's effect depends on them). With the job known, the cancel is sent and a card
 * stands in until the answer. With the file still uploading, the window goes back to the drop box at
 * once, and the upload, left to finish, has its job cancelled on arrival (cancelledFloorPlanUploads.ts).
 */
export function useFloorPlanImportCancel(input: FloorPlanImportCancelInput) {
  const { request, resumeJobId, session, onActiveJobIdChange, onJobUpdate, onCancelled } = input;
  const knownJobId = request ? null : resumeJobId;
  const upload = request ?? knownJobId;
  const runKey = useMemo(() => ({ upload, session }), [upload, session]);
  const runRef = useRef<CancelRun>({ key: runKey, jobId: knownJobId, generation: 0, cancelling: false });
  const onCancelledRef = useRef(onCancelled);
  const [status, setStatus] = useState<CancelStatus>(IDLE);
  useEffect(() => {
    onCancelledRef.current = onCancelled;
  });
  // A new upload (or closing the window) retires the last one's cancel, so a late answer is ignored. Cleanups all run
  // before any effect, so the next upload, reporting its job from its own effect, starts with a clean run.
  useEffect(() => {
    const run = runRef.current;
    Object.assign(run, { key: runKey, jobId: run.jobId ?? knownJobId });
    return () => {
      Object.assign(run, { generation: run.generation + 1, jobId: null, cancelling: false });
    };
  }, [runKey, knownJobId]);

  const file = request?.file ?? null;
  const cancel = useCallback(() => {
    const run = runRef.current;
    const { jobId, key } = run;
    if (run.cancelling) return;
    if (!jobId) {
      // Still uploading: back to the drop box now; the job is cancelled when the upload arrives.
      if (!file) return;
      run.cancelling = true;
      cancelOnArrival(file);
      return onCancelledRef.current();
    }
    run.cancelling = true;
    setStatus({ run: key, stopping: true, error: null });
    const settle = (error: string | null) =>
      setStatus((current) => (current.run === key ? { run: key, stopping: false, error } : current));
    void sendCancel(run, jobId, settle, () => onCancelledRef.current());
  }, [file]);

  const trackJobId = useCallback((jobId: string | null) => {
    const run = runRef.current;
    const { key } = run; // A refusal said for another job (a retry's fork, say) isn't this one's:
    if (jobId !== run.jobId) setStatus((current) => (current.run === key && current.error ? IDLE : current));
    run.jobId = jobId;
    onActiveJobIdChange(jobId);
  }, [onActiveJobIdChange]);

  const trackJob = useCallback((job: ConsumerFloorPlanImportJob) => {
    runRef.current.jobId = job.id;
    onJobUpdate(job);
  }, [onJobUpdate]);

  const shown = status.run === runKey ? status : IDLE;
  const value = useMemo(() => ({ cancel, stopping: shown.stopping, error: shown.error }), [cancel, shown]);
  return { value, trackJobId, trackJob };
}
