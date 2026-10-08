import { GUEST_SHARE_OPENER_ID } from "@/lib/guest-save-prompt";

export const SHARE_LINK_FALLBACK_CLOSE_ACTION_ID =
  "share-link-fallback-close-action";
export const SHARE_LINK_FALLBACK_COPY_ACTION_ID =
  "share-link-fallback-copy-action";
export const SHARE_LINK_FALLBACK_OPEN_ACTION_ID =
  "share-link-fallback-open-action";

// The fallback opens from the command bar's Share button, and focus goes back there.
export const SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS = [GUEST_SHARE_OPENER_ID] as const;
