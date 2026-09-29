"use client";

import { Pencil } from "lucide-react";
import { DESIGN_RENAME_OPENER_ID } from "@/lib/design-rename-focus";

type CommandBarDesignTitleProps = {
  dark: boolean;
  title?: string;
  onRename?: () => void;
};

/**
 * The design's name, which opens Rename design (audit finding F, as in the mockups), with the
 * save status under it. From md, now that undo, redo and 2D/3D sit over the canvas (UX 4c); on
 * phones Rename design is in More. Long names are cut short, with the full name in the tooltip.
 */
export function CommandBarDesignTitle({ dark, title, onRename }: CommandBarDesignTitleProps) {
  if (!title || !onRename) return null;
  return (
    <button
      id={DESIGN_RENAME_OPENER_ID}
      type="button"
      data-testid="editor-design-title"
      aria-haspopup="dialog"
      aria-label={`Rename design, ${title}`}
      title={title}
      className={`-ml-1.5 hidden h-6 min-w-0 max-w-[240px] items-center gap-1.5 rounded-md px-1.5 text-sm font-bold leading-none md:flex ${
        dark ? "hover:bg-white/10" : "text-neutral-900 hover:bg-neutral-100"
      }`}
      onClick={onRename}
    >
      <span className="truncate">{title}</span>
      <Pencil aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${dark ? "opacity-70" : "text-ink-muted"}`} />
    </button>
  );
}
