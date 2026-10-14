"use client";

import { Pencil } from "lucide-react";
import { DESIGN_RENAME_OPENER_ID } from "@/lib/design-rename-focus";

type CommandBarDesignTitleProps = {
  title?: string;
  onRename?: () => void;
};

/**
 * The design's name, which opens Rename design (audit finding F, as in the mockups), with the
 * save status under it, at every width: undo, redo and 2D/3D sit over the canvas (UX 4c, 4d).
 * Phones also keep Rename design in the Menu. Long names are cut short, with the full name in
 * the tooltip.
 */
export function CommandBarDesignTitle({ title, onRename }: CommandBarDesignTitleProps) {
  if (!title || !onRename) return null;
  return (
    <button
      id={DESIGN_RENAME_OPENER_ID}
      type="button"
      data-testid="editor-design-title"
      aria-haspopup="dialog"
      aria-label={`Rename design, ${title}`}
      title={title}
      className="-ml-1.5 flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-md px-1.5 text-[15px] font-bold leading-none md:max-w-[240px] md:text-sm text-neutral-900 hover:bg-neutral-100"
      onClick={onRename}
    >
      <span className="truncate">{title}</span>
      <Pencil aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
    </button>
  );
}
