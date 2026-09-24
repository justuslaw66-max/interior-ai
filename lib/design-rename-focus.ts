import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

/** The command bar's design name. Below `xl` Rename design is in More, so focus falls back there. */
export const DESIGN_RENAME_OPENER_ID = "editor-design-title-action";
export const DESIGN_RENAME_RETURN_FOCUS_IDS = [
  DESIGN_RENAME_OPENER_ID,
  CLIENT_PREVIEW_FALLBACK_ACTION_ID,
] as const;
