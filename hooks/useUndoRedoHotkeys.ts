"use client";

import { useEffect } from "react";

import {
  isEditingShortcutBlocked,
  type EditorShortcutEvent,
} from "@/lib/editor-shortcut-guard";

type UndoRedoKeyEvent = EditorShortcutEvent &
  Pick<KeyboardEvent, "shiftKey" | "preventDefault">;

/**
 * ⌘Z undoes, ⌘⇧Z and ⌘Y redo (Ctrl on other systems). A text field keeps its own undo, and
 * nothing is undone behind an open dialog (UX audit ED12).
 */
export function handleUndoRedoKeyDown(
  event: UndoRedoKeyEvent,
  { undo, redo, isMac }: { undo: () => void; redo: () => void; isMac: boolean }
): void {
  const mod = isMac ? event.metaKey : event.ctrlKey;
  if (!mod || isEditingShortcutBlocked(event)) return;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
  } else if ((key === "z" && event.shiftKey) || key === "y") {
    event.preventDefault();
    redo();
  }
}

export function useUndoRedoHotkeys(opts: {
  undo: () => void;
  redo: () => void;
}) {
  const { undo, redo } = opts;

  useEffect(() => {
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const onKeyDown = (event: KeyboardEvent) =>
      handleUndoRedoKeyDown(event, { undo, redo, isMac });

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [undo, redo]);
}
