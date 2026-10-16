"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

/**
 * Whether the Lighting drawer is open. It's a 3D drawer, so leaving 3D closes it, from the bar's
 * 2D/3D or the canvas toolbar's (UX 4c).
 */
export function useLightingSettingsOpen(viewMode: EditorViewMode) {
  const [open, setOpen] = useState(false);
  const [openViewMode, setOpenViewMode] = useState(viewMode);
  if (viewMode !== openViewMode) {
    setOpenViewMode(viewMode);
    if (viewMode !== "3d") setOpen(false);
  }
  return [open, setOpen] as const;
}

type LightingSettingsDrawerProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Lighting settings: a sheet from the bottom on phones and down the right side from sm. The shared
 * dialog owns focus, Escape, the backdrop, the inert page and the scroll lock (UX AX5). Its menu
 * item has gone by the time it closes, so focus returns to More (the Menu on phones). It's
 * portalled to the body, out of the command bar.
 */
export function LightingSettingsDrawer({
  open,
  onClose,
  children,
}: LightingSettingsDrawerProps) {
  if (!open) return null;

  return createPortal(
    <EditorDialog
      open
      placement="sheet"
      title="Lighting settings"
      description="Choose a clear viewport scene and adjust only supported rendering preferences."
      onClose={onClose}
      closeLabel="Close lighting settings"
      closeButtonTestId="lighting-settings-close"
      dialogId="lighting-settings-drawer"
      testId="lighting-settings-overlay"
      panelTestId="lighting-settings-drawer"
      returnFocusId={CLIENT_PREVIEW_FALLBACK_ACTION_ID}
      layerClassName="z-[120]"
    >
      {children}
    </EditorDialog>,
    document.body
  );
}
