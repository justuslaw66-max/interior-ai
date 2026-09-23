export const FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID =
  "floor-plan-consumer-import-2d-action";
export const FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID =
  "floor-plan-pro-start-upload-action";
export const FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID =
  "floor-plan-surfaces-upload-action";
export const FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID =
  "floor-plan-address-upload-action";
export const FLOOR_PLAN_IMPORT_ACTION_ID = "floor-plan-import-action";
export const FLOOR_PLAN_WORKSPACE_LAUNCH_ACTION_ID =
  "floor-plan-workspace-launch-action";
export const FLOOR_PLAN_FILE_INPUT_ACTION_ID =
  "floor-plan-file-input-action";
export const FLOOR_PLAN_WORKSPACE_FALLBACK_ACTION_ID =
  "floor-plan-workspace-fallback-action";

export const FLOOR_PLAN_WORKSPACE_CLOSE_ACTION_ID =
  "floor-plan-workspace-close-action";
export const FLOOR_PLAN_WORKSPACE_HEADER_UPLOAD_ACTION_ID =
  "floor-plan-workspace-header-upload-action";

const SUPPORTED_OPENER_IDS = new Set([
  FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID,
  FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID,
  FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID,
  FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID,
  FLOOR_PLAN_IMPORT_ACTION_ID,
  FLOOR_PLAN_WORKSPACE_LAUNCH_ACTION_ID,
]);

export function captureFloorPlanWorkspaceOpener() {
  const active = document.activeElement;
  return active instanceof HTMLElement && SUPPORTED_OPENER_IDS.has(active.id)
    ? active.id
    : null;
}

export function getFloorPlanWorkspaceReturnFocusIds(
  openerId: string | null
) {
  return [
    ...(openerId && SUPPORTED_OPENER_IDS.has(openerId) ? [openerId] : []),
    FLOOR_PLAN_WORKSPACE_FALLBACK_ACTION_ID,
    FLOOR_PLAN_WORKSPACE_LAUNCH_ACTION_ID,
  ];
}

export function forwardFloorPlanWorkspaceOpener(
  target: HTMLButtonElement | HTMLInputElement,
  openerId: string | null
) {
  if (openerId) target.dataset.floorPlanWorkspaceOpener = openerId;
  target.click();
}

export function getFloorPlanWorkspaceScopeKey(input: {
  pathname: string;
  search: string;
  requestedDesignId: string | null;
  projectId: string | null;
  currentDesignId: string | null;
  authScopeKey: string;
  subscriptionPlan: string;
  mode: string;
  canEdit: boolean;
  planRoomCount: number;
  activeRoomId: string | null;
  underlayId: string | null | undefined;
}) {
  return JSON.stringify(input);
}
