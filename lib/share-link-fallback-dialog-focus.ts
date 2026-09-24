import { GUEST_SHARE_OPENER_ID } from "@/lib/guest-save-prompt";

export const PRESENT_EXPORT_CREATE_SHARE_ACTION_ID =
  "present-export-create-share-action";
export const PRESENT_EXPORT_CLOSE_ACTION_ID = "present-export-close-action";
export const SHARE_LINK_FALLBACK_CLOSE_ACTION_ID =
  "share-link-fallback-close-action";
export const SHARE_LINK_FALLBACK_COPY_ACTION_ID =
  "share-link-fallback-copy-action";
export const SHARE_LINK_FALLBACK_OPEN_ACTION_ID =
  "share-link-fallback-open-action";

// Present & export's Create link first; a link from the command bar's Share button goes back there.
export const SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS = [
  PRESENT_EXPORT_CREATE_SHARE_ACTION_ID,
  PRESENT_EXPORT_CLOSE_ACTION_ID,
  GUEST_SHARE_OPENER_ID,
] as const;
