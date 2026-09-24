/**
 * How editor feedback looks and how long it stays (UX audit 2026-09-23, AX4).
 * Editor toasts carry text only, so their tone comes from the wording:
 * failures and refusals are errors, everything else is a neutral notice.
 * Success is never styled as a warning, and errors stay up long enough to read.
 */
export type EditorFeedbackTone = "error" | "notice" | "success" | "tip";

const ERROR_WORDING =
  /\b(?:failed|failure|invalid|error|blocked|unavailable|unable|overlaps?)\b|\bcould not\b|\bcouldn['’]t\b|\bcannot\b|\bcan['’]t\b|\bnot found\b|\btry again\b|^enter a valid\b|^choose a valid\b|^keep at least\b/i;

export function editorFeedbackTone(message: string): "error" | "notice" {
  return ERROR_WORDING.test(message) ? "error" : "notice";
}

/** A newer message replaces an older one, so a long error never stacks up. */
export const EDITOR_FEEDBACK_DURATION_MS: Record<"error" | "notice" | "success", number> = {
  error: 8000,
  notice: 3000,
  success: 3000,
};

/** White text has at least 4.5:1 contrast on each of these backgrounds. */
export const EDITOR_FEEDBACK_TONE_CLASS: Record<EditorFeedbackTone, string> = {
  error: "bg-red-700 text-white",
  notice: "bg-neutral-900 text-white",
  success: "bg-emerald-700 text-white",
  tip: "bg-purple-600 text-white",
};
