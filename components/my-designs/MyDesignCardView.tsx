"use client";

import Link from "next/link";
import { useRef } from "react";
import { Link2, MoreHorizontal } from "lucide-react";
import { DesignPlanThumbnailSvg } from "@/components/my-designs/DesignPlanThumbnailSvg";
import { buildDesignEditorUrl } from "@/lib/design-editor-url";
import type { MyDesignCard } from "@/lib/my-designs";
import { useDismissibleMenu } from "@/lib/useDismissibleMenu";

/** Dialogs opened from a card hand focus back to its More actions button. */
export const myDesignActionsButtonId = (designId: string) => `my-design-actions-${designId}`;

export type MyDesignCardAction = "share" | "copy" | "rename" | "delete";

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2";
const MENU_ITEM = `flex h-10 w-full items-center rounded-lg px-3 text-left text-sm font-bold hover:bg-neutral-100 ${FOCUS_RING}`;

type MyDesignCardViewProps = {
  card: MyDesignCard;
  menuOpen: boolean;
  /** A copy of this design is being made. */
  busy: boolean;
  onToggleMenu: () => void;
  onCloseMenu: (byKeyboard: boolean) => void;
  onAction: (action: MyDesignCardAction) => void;
};

/** One saved design, as in the My designs mockup: its plan, name, last edit and a More actions menu. */
export function MyDesignCardView({ card, menuOpen, busy, onToggleMenu, onCloseMenu, onAction }: MyDesignCardViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useDismissibleMenu({
    open: menuOpen,
    containerRef,
    onDismiss: (byKeyboard) => {
      onCloseMenu(byKeyboard);
      if (byKeyboard) buttonRef.current?.focus();
    },
  });
  const href = buildDesignEditorUrl({ designId: card.id });
  return (
    <li data-testid={`my-design-card-${card.id}`} className="relative flex flex-col">
      <Link href={href} data-testid={`my-design-open-${card.id}`}
        className={`flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-neutral-950 transition hover:border-neutral-400 hover:shadow-md ${FOCUS_RING}`}>
        <DesignPlanThumbnailSvg thumbnail={card.thumbnail} />
        <span className="flex min-w-0 flex-col gap-1.5 px-3.5 pb-3.5 pt-3">
          <span className="truncate pr-11 text-[15px] font-bold" title={card.title}>{card.title}</span>
          <span className="flex items-center gap-2.5 text-[13px] text-neutral-600">
            {card.editedLabel}
            {card.shared ? (
              <span data-testid="my-design-shared" className="flex items-center gap-1 text-blue-900">
                <Link2 aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={1.8} />
                Shared
              </span>
            ) : null}
          </span>
        </span>
      </Link>
      <div ref={containerRef} className="absolute right-2 top-[156px]">
        <button ref={buttonRef} id={myDesignActionsButtonId(card.id)} type="button" disabled={busy}
          data-testid={`my-design-actions-${card.id}`} aria-label={`More actions for ${card.title}`}
          aria-haspopup="menu" aria-expanded={menuOpen} onClick={onToggleMenu}
          className={`flex h-11 w-11 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}>
          <MoreHorizontal aria-hidden="true" className="h-5 w-5" strokeWidth={2.2} />
        </button>
        {menuOpen ? <MyDesignCardMenu card={card} href={href} onAction={onAction} /> : null}
      </div>
    </li>
  );
}

function MyDesignCardMenu({ card, href, onAction }: { card: MyDesignCard; href: string; onAction: (action: MyDesignCardAction) => void }) {
  const item = (action: MyDesignCardAction, label: string, className = "text-neutral-900") => (
    <button type="button" role="menuitem" data-testid={`my-design-menu-${action}`} onClick={() => onAction(action)}
      className={`${MENU_ITEM} ${className}`}>
      {label}
    </button>
  );
  return (
    <div role="menu" aria-label={`Actions for ${card.title}`} data-testid="my-design-menu"
      className="absolute right-0 top-12 z-20 flex w-52 flex-col rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
      <Link href={href} role="menuitem" data-testid="my-design-menu-open" className={`${MENU_ITEM} text-neutral-900`}>Open</Link>
      {item("share", "Share")}
      {item("copy", "Make a copy")}
      {item("rename", "Rename")}
      <div className="my-1 h-px bg-neutral-200" />
      {item("delete", "Delete", "text-red-800")}
    </div>
  );
}
