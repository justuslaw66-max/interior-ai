"use client";

import { useState } from "react";
import type { DesignRenameDialogProps } from "@/components/editor/design-page/DesignRenameDialog";
import { cleanDesignTitle, resolveDesignTitle } from "@/lib/design-title";
import type { DesignSnapshot } from "@/lib/room-types";

export type UseDesignPageDesignRenameInput = {
  snapshot: DesignSnapshot;
  dark: boolean;
  runTransaction: (name: string, action: () => void) => void;
  setDesignSnapshot: (snapshot: DesignSnapshot) => void;
  showToast: (message: string) => void;
};

/**
 * Gives the design a typed name as one undoable step. The name lives in the design's snapshot, so
 * it saves like any other change. An empty or unchanged name changes nothing.
 */
export function applyDesignRename(
  value: string,
  input: Omit<UseDesignPageDesignRenameInput, "dark">
) {
  const next = cleanDesignTitle(value);
  if (!next || next === resolveDesignTitle(input.snapshot.title)) return false;
  input.runTransaction("Rename design", () => input.setDesignSnapshot({ ...input.snapshot, title: next }));
  input.showToast(`Renamed to ${next}`);
  return true;
}

/** The design's name for the command bar, and the Rename design dialog (audit finding F). */
export function useDesignPageDesignRename(input: UseDesignPageDesignRenameInput) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const title = resolveDesignTitle(input.snapshot.title);
  const dialog: DesignRenameDialogProps = {
    open,
    dark: input.dark,
    value,
    onValueChange: setValue,
    onCancel: () => setOpen(false),
    onSave: () => {
      if (!cleanDesignTitle(value)) return;
      setOpen(false);
      applyDesignRename(value, input);
    },
  };
  const openRename = () => {
    setValue(title);
    setOpen(true);
  };
  return { title, openRename, dialog };
}
