/**
 * One way into Upload floor plan (audit findings ST2 and ST3). Every entry asks with
 * `requestFloorPlanUpload`, and Start a new design's hook answers (useDesignPageStartChooser):
 * guests sign in first, and members get the upload window, which Plan opens when it hears
 * `floor-plan-upload-requested`. Events keep the entries, which sit deep in Plan, free of props.
 */
export const FLOOR_PLAN_UPLOAD_ENTRY_EVENT = "floor-plan-upload-entry";
export const FLOOR_PLAN_UPLOAD_REQUESTED_EVENT = "floor-plan-upload-requested";
export const FLOOR_PLAN_UPLOAD_SIGN_IN_EVENT = "floor-plan-upload-sign-in";

/** Where an upload started, for `launch_path_selected`. */
export type FloorPlanUploadSource =
  | "plan_panel"
  | "address_search"
  | "pro_plan_tools"
  | "start_chooser"
  | "start_link";

export type FloorPlanUploadRequest = {
  source: FloorPlanUploadSource;
  /** The control to hand focus back to when the upload window or the sign-in dialog closes. */
  openerId: string | null;
};

function dispatchUploadEvent(type: string, request?: FloorPlanUploadRequest) {
  window.dispatchEvent(new CustomEvent(type, { detail: request ?? null }));
}

/** An entry asks for the upload: guests are asked to sign in, members get the upload window. */
export function requestFloorPlanUpload(request: FloorPlanUploadRequest) {
  dispatchUploadEvent(FLOOR_PLAN_UPLOAD_ENTRY_EVENT, request);
}

/** Plan opens the upload window when it hears this; only the entry's answer sends it. */
export function openFloorPlanUploadWindow(request: FloorPlanUploadRequest) {
  dispatchUploadEvent(FLOOR_PLAN_UPLOAD_REQUESTED_EVENT, request);
}

/** Signs in with Google and comes back to the upload window (`/design?start=upload`). */
export function requestFloorPlanUploadSignIn() {
  dispatchUploadEvent(FLOOR_PLAN_UPLOAD_SIGN_IN_EVENT);
}

export function floorPlanUploadRequestOf(event: Event): FloorPlanUploadRequest {
  const detail = (event as CustomEvent<Partial<FloorPlanUploadRequest> | null>).detail;
  return { source: detail?.source ?? "plan_panel", openerId: detail?.openerId ?? null };
}
