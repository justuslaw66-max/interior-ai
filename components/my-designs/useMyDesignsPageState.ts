"use client";

import { useState } from "react";
import type { MyDesignCardAction } from "@/components/my-designs/MyDesignCardView";
import { useMyDesignActions } from "@/components/my-designs/useMyDesignActions";
import { cleanDesignTitle } from "@/lib/design-title";
import type { MyDesignCard } from "@/lib/my-designs";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

export type MyDesignsDialog =
  | { kind: "rename"; card: MyDesignCard; value: string; busy: boolean }
  | { kind: "delete"; card: MyDesignCard; busy: boolean }
  | { kind: "share"; card: MyDesignCard; url: string | null; error: string | null; copied: boolean }
  | null;

/** The page's menus, dialogs and messages; the actions themselves are in useMyDesignActions. */
export function useMyDesignsPageState() {
  const actions = useMyDesignActions();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<MyDesignsDialog>(null);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const report = (cause: unknown, fallback: string) => setError(userFacingErrorMessage(cause, fallback));

  const share = (card: MyDesignCard) => {
    setDialog({ kind: "share", card, url: null, error: null, copied: false });
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
    if (action === "share") share(card);
    else if (action === "copy") copy(card);
    else if (action === "rename") setDialog({ kind: "rename", card, value: card.title, busy: false });
    else setDialog({ kind: "delete", card, busy: false });
  };
  return { actions, openMenuId, setOpenMenuId, dialog, setDialog, copyingId, status, setStatus, error, report, onAction };
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
