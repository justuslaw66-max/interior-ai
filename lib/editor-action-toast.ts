/**
 * A toast for an action that can be undone (audit finding FU4): "Winora Armchair added to the Living
 * Room", with Undo. Whatever did the action announces it; the command bar, which owns Undo, shows it.
 * Undo only runs while the newest step in the history is still one of `undoLabels`.
 */
export const EDITOR_UNDOABLE_ACTION_EVENT = "editor-undoable-action";

export type UndoableActionAnnouncement = {
  message: string;
  /** The history step names this action can have ("Add Winora Armchair", or "… set" for a set). */
  undoLabels: string[];
};

export function announceUndoableAction(announcement: UndoableActionAnnouncement) {
  window.dispatchEvent(new CustomEvent(EDITOR_UNDOABLE_ACTION_EVENT, { detail: announcement }));
}

/** A product added to a room. The labels match the history steps the catalogue's add records. */
export function catalogAddAnnouncement(productTitle: string | undefined, roomName: string | undefined): UndoableActionAnnouncement {
  const title = productTitle || "Item";
  return {
    message: `${title} added to the ${roomName || "room"}`,
    undoLabels: [`Add ${title}`, `Add ${productTitle} set`],
  };
}

export function undoableActionOf(event: Event): UndoableActionAnnouncement | null {
  const detail = (event as CustomEvent<UndoableActionAnnouncement | null>).detail;
  return detail && typeof detail.message === "string" && Array.isArray(detail.undoLabels) ? detail : null;
}
