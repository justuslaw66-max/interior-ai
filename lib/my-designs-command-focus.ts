import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

export const MY_DESIGNS_COMMAND_ACTION_ID = "editor-command-my-designs-action";
export const MY_DESIGNS_FALLBACK_ACTION_ID = CLIENT_PREVIEW_FALLBACK_ACTION_ID;
export const MY_DESIGNS_RETURN_FOCUS_IDS = [
  MY_DESIGNS_COMMAND_ACTION_ID,
  MY_DESIGNS_FALLBACK_ACTION_ID,
] as const;
