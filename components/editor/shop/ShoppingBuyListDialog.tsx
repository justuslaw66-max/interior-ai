"use client";

import { Check, ExternalLink } from "lucide-react";
import { useMemo } from "react";
import {
  EditorDialog,
  EditorDialogActions,
  EditorDialogButton,
} from "@/components/editor/design-system/EditorDialog";
import { retailerCheckoutNote, type ShoppingListLine, type ShoppingRetailer } from "@/lib/shopping-list";
import { SHOPPING_BUY_LIST_DIALOG_ID, shoppingBuyListReturnFocusIds } from "@/lib/shopping-list-buy";
import type { ShoppingNotice } from "@/lib/useShoppingListBuy";

export type ShoppingBuyListDialogProps = {
  retailer: ShoppingRetailer | null;
  /** Products opened at the shop while Shop has been open. */
  openedIds: ReadonlySet<string>;
  /** A blocked tab, say: said inside the list, since the page behind it is hidden while it's open. */
  notice: ShoppingNotice | null;
  busy: boolean;
  onOpenLine: (line: ShoppingListLine) => void;
  onClose: () => void;
};

function addLabel(line: ShoppingListLine) {
  return line.addCount > 1 ? `Add ${line.addCount} to your cart` : "Add 1 to your cart";
}

function BuyListRow({ line, retailer, opened, busy, onOpenLine }: {
  line: ShoppingListLine;
  retailer: ShoppingRetailer;
  opened: boolean;
  busy: boolean;
  onOpenLine: (line: ShoppingListLine) => void;
}) {
  return (
    <li data-testid="shopping-buy-list-row" data-instance-id={line.instanceId} data-opened={opened ? "true" : "false"} className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-neutral-900" title={line.title}>{line.title}</div>
        <div className="truncate text-xs text-neutral-600" title={line.detail}>{line.detail}</div>
        <div data-testid="shopping-buy-list-add" className="text-xs font-bold text-neutral-800">{addLabel(line)}</div>
      </div>
      <button
        type="button"
        data-testid="shopping-buy-list-open"
        aria-label={opened ? `Open ${line.title} at ${retailer.name} again` : `Open ${line.title} at ${retailer.name}`}
        disabled={busy}
        onClick={() => onOpenLine(line)}
        className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 text-[13px] font-bold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        {opened ? <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" /> : null}
        {opened ? "Opened" : "Open"}
        {opened ? null : <ExternalLink className="h-4 w-4" aria-hidden="true" />}
      </button>
    </li>
  );
}

/** Always in place while the list is open, so a screen reader hears a blocked tab when it happens. */
function BuyListNotice({ notice }: { notice: ShoppingNotice | null }) {
  const tone = notice?.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900";
  return (
    <p role="status" data-testid="shopping-buy-list-notice" className={notice ? `mt-2 rounded-lg border px-3 py-2 text-[13px] ${tone}` : "sr-only"}>
      {notice?.message ?? ""}
    </p>
  );
}

/**
 * Buy at a shop with several products: one link per product, each opening one tab, ticked once
 * opened. Browsers let one click open one tab, so a burst of tabs would be blocked (J's Q2, 27 Sep).
 * Close shows its ring on any focus, as the retailer dialog's Close did: after a click opens the
 * list, WebKit doesn't treat Close as focus-visible when the dialog's Tab trap moves focus onto it.
 */
export function ShoppingBuyListDialog({ retailer, openedIds, notice, busy, onOpenLine, onClose }: ShoppingBuyListDialogProps) {
  const opened = retailer ? retailer.lines.filter((line) => openedIds.has(line.instanceId)).length : 0;
  // One focus plan per opening: a new array on every render would restart the dialog's session.
  const retailerId = retailer?.id ?? null;
  const returnFocusIds = useMemo(() => (retailerId ? shoppingBuyListReturnFocusIds(retailerId) : undefined), [retailerId]);
  return (
    <EditorDialog
      open={retailer !== null}
      title={retailer ? `Buy at ${retailer.name}` : "Buy"}
      description={retailer ? `Open each product at ${retailer.name} and add it to your cart there.` : undefined}
      onClose={onClose}
      closeLabel="Close the buy list"
      closeButtonTestId="shopping-buy-list-close"
      closeButtonClassName="focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      testId="shopping-buy-list"
      dialogId={SHOPPING_BUY_LIST_DIALOG_ID}
      returnFocusIds={returnFocusIds}
      cancelFocusRestorationOnUnmount
      manageBackground
      forceLight
      panelClassName="max-h-[calc(100dvh-2rem)] overflow-y-auto"
      footer={
        <EditorDialogActions>
          <EditorDialogButton data-testid="shopping-buy-list-done" variant="primary" onClick={onClose}>
            Done
          </EditorDialogButton>
        </EditorDialogActions>
      }
    >
      {retailer ? (
        <>
          <p data-testid="shopping-buy-list-progress" aria-live="polite" className="text-[13px] text-neutral-600">
            {opened} of {retailer.lines.length} opened
          </p>
          <BuyListNotice notice={notice} />
          <ul className="mt-1 divide-y divide-neutral-100">
            {retailer.lines.map((line) => (
              <BuyListRow key={line.instanceId} line={line} retailer={retailer} opened={openedIds.has(line.instanceId)} busy={busy} onOpenLine={onOpenLine} />
            ))}
          </ul>
          <p className="mt-2 text-[13px] text-neutral-600">{retailerCheckoutNote(retailer)}</p>
        </>
      ) : null}
    </EditorDialog>
  );
}
