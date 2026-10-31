/**
 * Uploads whose Cancel upload was pressed before their job existed (J, 31 Oct). The window goes back
 * to the drop box at once, but the upload request is left to finish, even after the window moves on
 * or closes, so the job it makes is cancelled the moment it exists: abandoning the request could
 * leave a job that a worker would still read. Keyed by the file being uploaded.
 */
const cancelOnArrival = new WeakMap<File, (jobId: string) => void>();

/** Cancel upload was pressed while `file` uploads: `cancelJob` gets its job when the upload arrives. */
export function cancelFloorPlanUploadOnArrival(file: File, cancelJob: (jobId: string) => void) {
  cancelOnArrival.set(file, cancelJob);
}

/** Whether `file`'s upload is to be left to finish, because its cancel waits for it. */
export function isFloorPlanUploadCancelPending(file: File | null) {
  return Boolean(file && cancelOnArrival.has(file));
}

/**
 * The upload of `file` arrived with `jobId` (or failed, with none): true, once that job is being
 * cancelled, if Cancel upload was pressed meanwhile. Either way the file's wait ends here.
 */
export function settleFloorPlanUploadCancel(file: File, jobId: unknown) {
  const cancelJob = cancelOnArrival.get(file);
  cancelOnArrival.delete(file);
  if (!cancelJob || typeof jobId !== "string") return false;
  cancelJob(jobId);
  return true;
}
