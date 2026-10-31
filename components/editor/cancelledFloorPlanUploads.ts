/**
 * Uploads whose Cancel upload was pressed before their job existed (J, 31 Oct). The window goes back
 * to the drop box at once, but the upload request is left to finish, even after the window moves on
 * or closes, so the job it makes is cancelled the moment it exists: abandoning the request could
 * leave a job that a worker would still read.
 *
 * Each upload has its own ticket, so two uploads of the same File (a script re-dropping one, say)
 * never take each other's cancel. Cancel upload marks the file's latest upload: the one on screen.
 */
export type FloorPlanUploadTicket = { file: File; cancelJob: ((jobId: string) => void) | null };

const latestUpload = new WeakMap<File, FloorPlanUploadTicket>();

/** An upload of `file` starts. */
export function startFloorPlanUpload(file: File): FloorPlanUploadTicket {
  const ticket: FloorPlanUploadTicket = { file, cancelJob: null };
  latestUpload.set(file, ticket);
  return ticket;
}

/** Cancel upload was pressed while `file` uploads: its latest upload's job gets `cancelJob` on arrival. */
export function cancelFloorPlanUploadOnArrival(file: File, cancelJob: (jobId: string) => void) {
  const ticket = latestUpload.get(file);
  if (ticket) ticket.cancelJob = cancelJob;
}

/** Whether this upload is to be left to finish, because its cancel waits for it. */
export function isFloorPlanUploadCancelPending(ticket: FloorPlanUploadTicket | null) {
  return Boolean(ticket?.cancelJob);
}

/**
 * The upload arrived with `jobId` (or failed, with none): true, once that job is being cancelled,
 * if Cancel upload was pressed meanwhile. Either way the upload's wait ends here.
 */
export function settleFloorPlanUploadCancel(ticket: FloorPlanUploadTicket, jobId: unknown) {
  const { cancelJob } = ticket;
  ticket.cancelJob = null;
  if (latestUpload.get(ticket.file) === ticket) latestUpload.delete(ticket.file);
  if (!cancelJob || typeof jobId !== "string") return false;
  cancelJob(jobId);
  return true;
}
