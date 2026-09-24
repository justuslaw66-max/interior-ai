import type { DesignPageLocalBackupError } from "@/lib/design-page-local-backup-recovery";
import type { FloorPlanMeasuredPropertyMutationErrorCodeV2 } from "@/lib/floor-plan-measured-property-types";
import type { CanonicalOpeningProjectionErrorV2 } from "@/lib/floor-plan-topology-editor";
import type { FloorPlanTopologyMutationErrorCodeV2 } from "@/lib/floor-plan-topology-mutation-types";

/**
 * Turns a caught error into words for the person using the app (UX audit
 * 2026-09-23, AX8). Only a UserFacingError brings its own message to the
 * screen; typed codes and common browser failures map to plain sentences, and
 * anything else shows the caller's fallback. Error sentences use wording that
 * lib/editor-feedback-tone.ts reads as an error, so toasts show them as one.
 */
export const GENERIC_ERROR_MESSAGE = "Something went wrong. Try again.";

/** An error whose message is final copy for the person using the app. */
export class UserFacingError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "UserFacingError";
  }
}

type KnownErrorCode =
  | CanonicalOpeningProjectionErrorV2["code"]
  | DesignPageLocalBackupError["code"]
  | FloorPlanMeasuredPropertyMutationErrorCodeV2
  | FloorPlanTopologyMutationErrorCodeV2;

// Codes people reach through normal editing. The rest mean an internal
// inconsistency, and the caller's fallback says what failed instead.
const MESSAGE_BY_CODE: Partial<Record<KnownErrorCode, string>> = {
  POINT_OFF_WALL: "Doors and windows can't be moved off their wall.",
  OPENING_OUT_OF_BOUNDS: "A door or window can't extend past the end of its wall.",
  ARC_EDIT_UNSUPPORTED: "Doors and windows on curved walls can't be moved yet.",
  ARC_MUTATION_UNSUPPORTED: "Curved walls can't be edited yet.",
  OPENING_EVIDENCE_OVERRIDE_REQUIRED: "This size comes from your floor plan and can't be changed here.",
  DOCUMENTED_VALUE_LOCKED: "This measurement comes from your floor plan and can't be changed here.",
  SITE_MEASUREMENT_NOTE_REQUIRED: "Add a short note on how you measured this.",
  INVALID_MEASUREMENT: "Enter a valid measurement.",
  NON_INTEGER_MILLIMETRES: "Enter a valid measurement in whole millimetres.",
  NO_OP_MUTATION: "Nothing to change.",
  SIZE_LIMIT_EXCEEDED: "This browser couldn't back up a design this large.",
  STORAGE_WRITE_FAILED: "This browser couldn't save a local backup. Its storage may be full.",
};

// Errors that have no code, recognised by name.
const MESSAGE_BY_NAME: Record<string, string> = {
  AbortError: "That took too long. Try again.",
  TimeoutError: "That took too long. Try again.",
  DesignPageOpeningMutationError: "This door or window comes from your floor plan and can't be changed here.",
  DesignPageOpeningKindMutationError: "This door or window comes from your floor plan and can't be changed here.",
};

// fetch() rejects with a TypeError whose wording differs by browser.
const NETWORK_FAILURE = /^(?:Failed to fetch|NetworkError when attempting to fetch resource\.|Load failed)$/;

function isKnownErrorCode(code: unknown): code is KnownErrorCode {
  return typeof code === "string" && Object.hasOwn(MESSAGE_BY_CODE, code);
}

export function userFacingErrorMessage(cause: unknown, fallback = GENERIC_ERROR_MESSAGE): string {
  if (cause instanceof UserFacingError) return cause.message;
  if (!(cause instanceof Error)) return fallback;
  const code = "code" in cause ? cause.code : undefined;
  if (isKnownErrorCode(code)) return MESSAGE_BY_CODE[code] ?? fallback;
  if (Object.hasOwn(MESSAGE_BY_NAME, cause.name)) return MESSAGE_BY_NAME[cause.name];
  if (cause instanceof TypeError && NETWORK_FAILURE.test(cause.message)) {
    return "Can't reach the server. Check your connection and try again.";
  }
  return fallback;
}
