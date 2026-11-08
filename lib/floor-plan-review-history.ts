import {
  isComposingKey,
  isKeyboardInputTarget,
  type EditorShortcutEvent,
} from "@/lib/editor-shortcut-guard";

/**
 * Undo and redo over the upload review's corrections: one stack of earlier review documents
 * (`FloorPlanDocumentV2`), the newest last.
 *
 * Every correction is one step. Changes that follow each other within
 * `REVIEW_HISTORY_COALESCE_MS` (a drag, typing a measurement) are one step, so Undo goes back to
 * before the gesture rather than one pixel or one keystroke. The stack keeps
 * `REVIEW_HISTORY_MAX_STEPS` steps, as the editor's history does (`lib/historyManager.ts`).
 */
export const REVIEW_HISTORY_MAX_STEPS = 100;
export const REVIEW_HISTORY_COALESCE_MS = 500;

export type ReviewHistory<TDocument> = {
  past: readonly TDocument[];
  future: readonly TDocument[];
  /** When the newest step was recorded or extended (ms), for coalescing. */
  lastChangeAt: number | null;
};

export function emptyReviewHistory<TDocument>(): ReviewHistory<TDocument> {
  return { past: [], future: [], lastChangeAt: null };
}

/** The history once `before` was replaced by a correction made at `now`; redo is gone. */
export function recordReviewChange<TDocument>(
  history: ReviewHistory<TDocument>,
  before: TDocument,
  now: number
): ReviewHistory<TDocument> {
  const continues = history.lastChangeAt !== null && history.past.length > 0 &&
    now - history.lastChangeAt < REVIEW_HISTORY_COALESCE_MS;
  if (continues) return { past: history.past, future: [], lastChangeAt: now };
  const past = [...history.past, before].slice(-REVIEW_HISTORY_MAX_STEPS);
  return { past, future: [], lastChangeAt: now };
}

/** Going back one step from `current`, or null when there is nothing to undo. */
export function undoReviewChange<TDocument>(
  history: ReviewHistory<TDocument>,
  current: TDocument
): { history: ReviewHistory<TDocument>; document: TDocument } | null {
  const document = history.past[history.past.length - 1];
  if (document === undefined) return null;
  return {
    document,
    history: { past: history.past.slice(0, -1), future: [...history.future, current], lastChangeAt: null },
  };
}

/** Going forward one undone step from `current`, or null when there is nothing to redo. */
export function redoReviewChange<TDocument>(
  history: ReviewHistory<TDocument>,
  current: TDocument
): { history: ReviewHistory<TDocument>; document: TDocument } | null {
  const document = history.future[history.future.length - 1];
  if (document === undefined) return null;
  return {
    document,
    history: { past: [...history.past, current].slice(-REVIEW_HISTORY_MAX_STEPS), future: history.future.slice(0, -1), lastChangeAt: null },
  };
}

type ShortcutRoot = { querySelectorAll: (selector: string) => ArrayLike<{ matches: (selector: string) => boolean }> };

/** The upload review's own dialog (`FloorPlanUploadWorkspaceDialog.tsx`). */
const REVIEW_DIALOG_SELECTOR = '[data-testid="floor-plan-import-dialog"]';
// An inline confirmation (`role="alertdialog"`, e.g. deleting an upload) owns the keys too.
const KEYBOARD_OWNER_SELECTOR = '[aria-modal="true"], [role="alertdialog"], [data-testid="editor-command-palette"]';

/**
 * The editor's undo keys (`hooks/useUndoRedoHotkeys.ts`), for the review: ⌘Z undoes, ⌘⇧Z and ⌘Y
 * redo (Ctrl on other systems). A field keeps its own undo, and a dialog opened over the review
 * owns the keyboard. The review's own dialog doesn't: the editor's undo already stands aside for it
 * (`lib/editor-shortcut-guard.ts`), so the two never both act on one key.
 */
export function reviewHistoryShortcut(
  event: EditorShortcutEvent & Pick<KeyboardEvent, "shiftKey">,
  { isMac, root }: { isMac: boolean; root: ShortcutRoot | null }
): "undo" | "redo" | null {
  if (!(isMac ? event.metaKey : event.ctrlKey)) return null;
  if (isComposingKey(event) || isKeyboardInputTarget(event.target)) return null;
  const owners = Array.from(root?.querySelectorAll(KEYBOARD_OWNER_SELECTOR) ?? []);
  if (owners.some((owner) => !owner.matches(REVIEW_DIALOG_SELECTOR))) return null;
  const key = event.key.toLowerCase();
  if (key === "z") return event.shiftKey ? "redo" : "undo";
  return key === "y" ? "redo" : null;
}
