import {
  isSingleKeyShortcutBlocked,
  type EditorShortcutEvent,
} from "@/lib/editor-shortcut-guard";

export type DesignPagePresentHotkeyCommand =
  | "toggle-client-preview"
  | null;

/**
 * P toggles Pro's Client Preview. It follows the single-key rule (not in a field, not with ⌘,
 * Ctrl or Alt; UX audit ED12) but still works with focus on a button inside a dialog, such as the
 * command palette's.
 */
export function resolveDesignPagePresentHotkey({
  isDesigner,
  event,
}: {
  isDesigner: boolean;
  event: EditorShortcutEvent;
}): DesignPagePresentHotkeyCommand {
  if (!isDesigner || isSingleKeyShortcutBlocked(event, { inDialogs: true })) {
    return null;
  }
  return event.key === "p" || event.key === "P" ? "toggle-client-preview" : null;
}
