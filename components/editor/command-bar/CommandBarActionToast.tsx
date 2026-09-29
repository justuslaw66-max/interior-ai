"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  EDITOR_UNDOABLE_ACTION_EVENT,
  undoableActionOf,
  type UndoableActionAnnouncement,
} from "@/lib/editor-action-toast";
import { useClientHydrated } from "@/lib/useClientHydrated";

/** How long the toast stays while nothing holds it: long enough to reach Undo. */
export const EDITOR_ACTION_TOAST_MS = 8000;

type CommandBarActionToastProps = {
  isClientPreview: boolean;
  /** The newest step in the history, as the Undo button names it. */
  undoName: string | null;
  onUndo: () => void;
};

export function actionToastCanUndo(action: UndoableActionAnnouncement, undoName: string | null) {
  return undoName !== null && action.undoLabels.includes(undoName);
}

function useUndoableAction() {
  const [action, setAction] = useState<UndoableActionAnnouncement | null>(null);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const show = (event: Event) => setAction(undoableActionOf(event));
    window.addEventListener(EDITOR_UNDOABLE_ACTION_EVENT, show);
    return () => window.removeEventListener(EDITOR_UNDOABLE_ACTION_EVENT, show);
  }, []);
  // Pointer or keyboard focus on the toast holds it, so Undo doesn't vanish on the way there.
  useEffect(() => {
    if (!action || held) return;
    const timer = window.setTimeout(() => setAction(null), EDITOR_ACTION_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [action, held]);
  return { action, dismiss: () => setAction(null), setHeld };
}

/**
 * "Winora Armchair added to the Living Room", with Undo (audit finding FU4), portaled to the page
 * body: the bar is a containing block from `md` up. The status region stays mounted, so the message
 * is announced when it arrives. Undo shows only while the newest history step is still that action.
 */
export function CommandBarActionToast({ isClientPreview, undoName, onUndo }: CommandBarActionToastProps) {
  const hydrated = useClientHydrated();
  const { action, dismiss, setHeld } = useUndoableAction();
  if (!hydrated || isClientPreview) return null;
  return createPortal(
    <div role="status" aria-live="polite" aria-atomic="true" data-testid="editor-action-toast-region"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4 md:bottom-6">
      {action ? (
        <div data-testid="editor-action-toast"
          className="pointer-events-auto flex min-w-0 max-w-full items-center gap-3 rounded-xl bg-neutral-900 py-1.5 pl-4 pr-1.5 text-sm text-white shadow-lg"
          onPointerEnter={() => setHeld(true)} onPointerLeave={() => setHeld(false)}
          onFocus={() => setHeld(true)} onBlur={() => setHeld(false)}>
          <span className="min-w-0 truncate" title={action.message}>{action.message}</span>
          {actionToastCanUndo(action, undoName) ? (
            <button type="button" data-testid="editor-action-toast-undo"
              className="min-h-11 shrink-0 rounded-lg bg-white/15 px-3 font-bold hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white md:min-h-9"
              onClick={(event) => {
                const hadFocus = document.activeElement === event.currentTarget;
                onUndo();
                dismiss();
                // Keyboard users keep their place: the current step, as other editor dialogs use.
                if (hadFocus) document.getElementById("editor-command-workspace-action")?.focus();
              }}>
              Undo
            </button>
          ) : null}
        </div>
      ) : null}
    </div>,
    document.body
  );
}
