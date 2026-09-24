import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

/** The command bar's Download button. Phones open Download from More, so focus falls back there. */
export const EDITOR_DOWNLOAD_OPENER_ID = "editor-command-download-action";
export const EDITOR_DOWNLOAD_RETURN_FOCUS_IDS = [
  EDITOR_DOWNLOAD_OPENER_ID,
  CLIENT_PREVIEW_FALLBACK_ACTION_ID,
] as const;
