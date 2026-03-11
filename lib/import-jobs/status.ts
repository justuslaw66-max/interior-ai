import type { ImportJobStatus } from "./types";

export const IMPORT_JOB_STATUS_SEQUENCE: ImportJobStatus[] = [
  "received",
  "normalizing",
  "optimized",
  "preview_generated",
  "metadata_extracted",
  "needs_mapping",
  "needs_review",
  "approved",
  "published",
  "failed",
];

const STATUS_INDEX = new Map(IMPORT_JOB_STATUS_SEQUENCE.map((status, idx) => [status, idx]));

export function isTerminalImportStatus(status: ImportJobStatus): boolean {
  return status === "failed" || status === "published";
}

export function canTransitionImportStatus(from: ImportJobStatus, to: ImportJobStatus): boolean {
  if (from === to) return true;
  if (isTerminalImportStatus(from)) return false;
  if (to === "failed") return true;

  const fromIndex = STATUS_INDEX.get(from);
  const toIndex = STATUS_INDEX.get(to);
  if (fromIndex === undefined || toIndex === undefined) return false;

  return toIndex >= fromIndex;
}
