export {
  MY_DESIGNS_COMMAND_ACTION_ID,
  MY_DESIGNS_FALLBACK_ACTION_ID,
  MY_DESIGNS_RETURN_FOCUS_IDS,
} from "@/lib/my-designs-command-focus";

export const MY_DESIGNS_CLOSE_ACTION_ID = "my-designs-close-action";
export const MY_DESIGNS_DELETE_SELECTED_ACTION_ID =
  "my-designs-delete-selected-action";
export const MY_DESIGNS_DELETE_ALL_ACTION_ID = "my-designs-delete-all-action";
function designActionId(designId: string, action: "open" | "delete") {
  return `my-designs-${encodeURIComponent(designId)}-${action}-action`;
}

export function getMyDesignsOpenActionId(designId: string) {
  return designActionId(designId, "open");
}

export function getMyDesignsDeleteActionId(designId: string) {
  return designActionId(designId, "delete");
}

type DeleteFocusRequest = {
  ids: readonly string[];
  mode: "single" | "selected" | "all";
};

function getDeleteOriginId(request: DeleteFocusRequest) {
  if (request.mode === "single" && request.ids[0]) {
    return getMyDesignsDeleteActionId(request.ids[0]);
  }
  return request.mode === "selected"
    ? MY_DESIGNS_DELETE_SELECTED_ACTION_ID
    : MY_DESIGNS_DELETE_ALL_ACTION_ID;
}

export function getMyDesignsDeleteReturnFocusIds(
  request: DeleteFocusRequest,
  orderedDesignIds: readonly string[]
) {
  return [
    getDeleteOriginId(request),
    ...orderedDesignIds.map(getMyDesignsOpenActionId),
    MY_DESIGNS_CLOSE_ACTION_ID,
  ];
}
