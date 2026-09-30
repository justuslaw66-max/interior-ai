"use client";

import { useState } from "react";
import { myDesignActionsButtonId, type MyDesignCardAction } from "@/components/my-designs/MyDesignCardView";
import { useMyDesignActions } from "@/components/my-designs/useMyDesignActions";
import { cleanDesignTitle } from "@/lib/design-title";
import type { MyDesignCard } from "@/lib/my-designs";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

/** New design's id: where focus goes when no card is left to go back to. */
export const MY_DESIGNS_NEW_DESIGN_ID = "my-designs-new-design-action";

/** Set when a dialog opens and kept while it's open, so the dialogs keep one focus plan. */
type ReturnFocus = { returnFocusIds: readonly string[] };

export type MyDesignsDialog =
  | ({ kind: "rename"; card: MyDesignCard; value: string; busy: boolean } & ReturnFocus)
  | ({ kind: "delete"; card: MyDesignCard; busy: boolean } & ReturnFocus)
  | ({ kind: "share"; card: MyDesignCard; url: string | null; error: string | null; copied: boolean } & ReturnFocus)
  | null;

/**
 * Dialogs hand focus back to the card's More button. After a delete that button is gone, so
 * focus moves to the next card's, then the previous card's, then New design.
 */
export function myDesignsReturnFocusIds(designs: readonly MyDesignCard[], card: MyDesignCard, action: MyDesignCardAction) {
  const own = myDesignActionsButtonId(card.id);
  if (action !== "delete") return [own];
  const index = designs.findIndex((design) => design.id === card.id);
  const neighbours = [designs[index + 1], index > 0 ? designs[index - 1] : undefined]
    .filter((design): design is MyDesignCard => design !== undefined);
  return [own, ...neighbours.map((design) => myDesignActionsButtonId(design.id)), MY_DESIGNS_NEW_DESIGN_ID];
}

/** The page's menus, dialogs and messages; the actions themselves are in useMyDesignActions. */
export function useMyDesignsPageState(designs: readonly MyDesignCard[]) {
  const actions = useMyDesignActions();
  // A deleted design leaves at once; the server's list catches up on the refresh that follows.
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());
  const visibleDesigns = designs.filter((design) => !removedIds.has(design.id));
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<MyDesignsDialog>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const report = (cause: unknown, fallback: string) => setError(userFacingErrorMessage(cause, fallback));
  const markRemoved = (id: string) => setRemovedIds((current) => new Set(current).add(id));

  const share = (card: MyDesignCard, focus: ReturnFocus) => {
    setDialog({ kind: "share", card, url: null, error: null, copied: false, ...focus });
    const settle = (change: { url?: string; error?: string }) =>
      setDialog((current) => (current?.kind === "share" && current.card.id === card.id ? { ...current, ...change } : current));
    actions.share(card).then(
      (url) => settle({ url }),
      (cause: unknown) => settle({ error: userFacingErrorMessage(cause, "Couldn't make a link. Try again.") })
    );
  };
  const copy = (card: MyDesignCard) => {
    setCopyingId(card.id);
    setStatus(`Making a copy of ${card.title}…`);
    actions.duplicate(card).catch((cause: unknown) => {
      setStatus("");
      report(cause, "Couldn't make a copy. Try again.");
      setCopyingId(null);
    });
  };
  const onAction = (card: MyDesignCard, action: MyDesignCardAction) => {
    setOpenMenuId(null);
    setError(null);
    const focus = { returnFocusIds: myDesignsReturnFocusIds(visibleDesigns, card, action) };
    if (action === "share") share(card, focus);
    else if (action === "copy") copy(card);
    else if (action === "rename") setDialog({ kind: "rename", card, value: card.title, busy: false, ...focus });
    else setDialog({ kind: "delete", card, busy: false, ...focus });
  };
  return {
    actions, visibleDesigns, markRemoved, openMenuId, setOpenMenuId, dialog, setDialog, copyingId,
    status, setStatus, error, report, onAction,
  };
}

export type MyDesignsPageState = ReturnType<typeof useMyDesignsPageState>;

/** Rename: an empty or unchanged name closes without saving, as in the editor. */
export async function saveRename(state: MyDesignsPageState) {
  const { dialog } = state;
  if (dialog?.kind !== "rename" || dialog.busy) return;
  const title = cleanDesignTitle(dialog.value);
  if (!title || title === dialog.card.title) return state.setDialog(null);
  state.setDialog({ ...dialog, busy: true });
  try {
    await state.actions.rename(dialog.card, title);
    state.setDialog(null);
    state.setStatus(`Renamed to ${title}`);
  } catch (cause) {
    state.setDialog({ ...dialog, busy: false });
    state.report(cause, "Couldn't rename this design. Try again.");
  }
}

export async function confirmDelete(state: MyDesignsPageState) {
  const { dialog } = state;
  if (dialog?.kind !== "delete" || dialog.busy) return;
  state.setDialog({ ...dialog, busy: true });
  try {
    await state.actions.remove(dialog.card);
    state.markRemoved(dialog.card.id);
    state.setDialog(null);
    state.setStatus(`Deleted ${dialog.card.title}`);
  } catch (cause) {
    state.setDialog(null);
    state.report(cause, "Couldn't delete this design. Try again.");
  }
}

export function copyShareLink(state: MyDesignsPageState) {
  const { dialog } = state;
  if (dialog?.kind !== "share" || !dialog.url) return;
  const settle = (change: { copied: boolean; error: string | null }) =>
    state.setDialog((current) => (current?.kind === "share" ? { ...current, ...change } : current));
  // Pages served without HTTPS (other than localhost) have no clipboard.
  const clipboard: Clipboard | undefined = navigator.clipboard;
  const writing = clipboard ? clipboard.writeText(dialog.url) : Promise.reject(new Error("No clipboard"));
  writing.then(
    () => settle({ copied: true, error: null }),
    () => settle({ copied: false, error: "Couldn't copy. Select the link and copy it yourself." })
  );
}
