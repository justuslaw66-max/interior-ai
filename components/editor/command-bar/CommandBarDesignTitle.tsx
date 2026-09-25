"use client";

import { Pencil } from "lucide-react";
import { DESIGN_RENAME_OPENER_ID } from "@/lib/design-rename-focus";

type CommandBarDesignTitleProps = {
  dark: boolean;
  title?: string;
  onRename?: () => void;
};

/**
 * The design's name, which opens Rename design (audit finding F, as in the mockups). While undo,
 * redo and 2D/3D share the bar, only `xl` screens have room for it; below that, Rename design is
 * in More. Long names are cut short, with the full name in the tooltip.
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
      className={`hidden h-[30px] min-w-0 max-w-[200px] items-center gap-1.5 rounded-lg px-2 text-sm font-semibold leading-none xl:flex ${
        dark ? "hover:bg-white/10" : "text-neutral-950 hover:bg-neutral-100"
      }`}
      onClick={onRename}
    >
      <span className="truncate">{title}</span>
      <Pencil aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${dark ? "opacity-70" : "text-neutral-500"}`} />
    </button>
  );
}
