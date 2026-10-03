"use client";

import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useRef } from "react";
import { createPortal } from "react-dom";
import { useClientHydrated } from "@/lib/useClientHydrated";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { ShoppingList, ShoppingListLine, ShoppingRetailer } from "@/lib/shopping-list";
import type { ShoppingSurface } from "@/lib/shopping-surfaces";
import type { ShoppingNotice } from "@/lib/useShoppingListBuy";
import { ShoppingBuyListDialog } from "./ShoppingBuyListDialog";
import { ShoppingListSection } from "./ShoppingListSection";
import { ShoppingSummary } from "./ShoppingSummary";
import { ShoppingSurfacesSection } from "./ShoppingSurfacesSection";
import { ShoppingSwapAll, type ShoppingSwapAllProps } from "./ShoppingSwapAll";
import { SHOPPING_LIST_TITLE_ID, useShoppingListFocus } from "./useShoppingListFocus";

export type ShoppingListPageProps = {
  list: ShoppingList;
  /** The design's floor and wall finishes, priced by their suppliers. */
  surfaces?: readonly ShoppingSurface[];
  canEdit: boolean;
  busy: boolean;
  notice: ShoppingNotice | null;
  buyList: { retailer: ShoppingRetailer | null; openedIds: ReadonlySet<string> };
  /** Swap all (UX 4h): in the summary from lg, under the heading below it; null when it can't apply. */
  swapAll?: ShoppingSwapAllProps | null;
  actions: {
    buyAtRetailer: (retailerId: string) => void;
    openLine: (line: ShoppingListLine) => void;
    closeBuyList: () => void;
    checkoutHere: () => void;
    dismissNotice: () => void;
    remove: (line: ShoppingListLine) => void;
    swapForCheaper: (line: ShoppingListLine) => void;
    goFurnish: () => void;
  };
};

function ShoppingListEmpty({ onGoFurnish }: { onGoFurnish: () => void }) {
  return (
    <div data-testid="shopping-list-empty" className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-6 py-10 text-center">
      <ShoppingBag className="h-7 w-7 text-neutral-500" aria-hidden="true" />
      <h2 className="text-base font-bold text-neutral-900">Nothing to buy yet</h2>
      <p className="max-w-sm text-sm text-neutral-600">Add products in Furnish, and they appear here with their prices.</p>
      <button
        type="button"
        data-testid="shopping-list-go-furnish"
        onClick={onGoFurnish}
        className="mt-2 flex min-h-11 items-center gap-2 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-bold text-neutral-900 hover:bg-neutral-50 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Go to Furnish
      </button>
    </div>
  );
}

function ShoppingNoticeBar({ notice, onDismiss }: { notice: ShoppingNotice; onDismiss: () => void }) {
  const tone = notice.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : notice.tone === "warning" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-200 bg-sky-50 text-sky-900";
  return (
    <div role={notice.tone === "error" ? "alert" : "status"} data-testid="shopping-list-notice" className={`flex items-start justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm ${tone}`}>
      <span>{notice.message}</span>
      <button type="button" onClick={onDismiss} className="min-h-8 shrink-0 rounded font-bold underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900">
        Dismiss
      </button>
    </div>
  );
}

function ShoppingListSections({ list, canEdit, actions }: Pick<ShoppingListPageProps, "list" | "canEdit" | "actions">) {
  const row = { canEdit, onRemove: actions.remove, onSwapForCheaper: actions.swapForCheaper };
  return (
    <>
      {list.retailers.map((retailer) => (
        <ShoppingListSection key={retailer.id} sectionId={retailer.id} title={retailer.name} lines={retailer.lines} subtotal={retailer.subtotal} {...row} />
      ))}
      {list.checkoutHere ? (
        <ShoppingListSection sectionId="here" title="Checkout here" lines={list.checkoutHere.lines} subtotal={list.checkoutHere.subtotal} {...row} />
      ) : null}
      {list.unavailable.length ? (
        <ShoppingListSection sectionId="unavailable" title="Not sold online yet" lines={list.unavailable} aside={<span className="text-[13px] font-normal text-neutral-600">No buy link yet</span>} {...row} />
      ) : null}
    </>
  );
}

/**
 * Shop, as in the Shop mockups (audit findings FU7, FU8): one page over the canvas at every width,
 * with the design's products by shop, one total, and one way to buy at each shop. Removing a product
 * keeps focus on the page: the next product's Remove, the one before it, or the heading.
 */
export function ShoppingListPage({ list, surfaces = [], canEdit, busy, notice, buyList, swapAll = null, actions }: ShoppingListPageProps) {
  const empty = list.productCount === 0;
  const wide = useMediaQuery("(min-width: 64rem)");
  const pageRef = useRef<HTMLElement | null>(null);
  const { remove, swapForCheaper } = useShoppingListFocus(list, actions, pageRef);
  const rowActions = { ...actions, remove, swapForCheaper };
  return (
    <section ref={pageRef} data-testid="shopping-list-page" aria-labelledby={SHOPPING_LIST_TITLE_ID} className="mx-auto flex w-full max-w-[1132px] flex-col gap-4 px-4 pt-5 lg:flex-row lg:items-start lg:gap-8 lg:px-8 lg:pb-8 lg:pt-7">
      <div className="flex min-w-0 flex-1 flex-col gap-4 pb-2">
        <div className="flex flex-col gap-1">
          <h1 id={SHOPPING_LIST_TITLE_ID} tabIndex={-1} className="rounded text-[22px] font-bold leading-7 text-neutral-900 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 lg:text-[26px] lg:leading-8">Shopping list</h1>
          <p className="text-sm text-neutral-600 lg:text-[15px]">Everything in this design, in one place. You pay on the retailer&apos;s website.</p>
        </div>
        {swapAll && !empty && !wide ? <ShoppingSwapAll {...swapAll} /> : null}
        {notice && !buyList.retailer ? <ShoppingNoticeBar notice={notice} onDismiss={actions.dismissNotice} /> : null}
        {empty ? <ShoppingListEmpty onGoFurnish={actions.goFurnish} /> : <ShoppingListSections list={list} canEdit={canEdit} actions={rowActions} />}
        <ShoppingSurfacesSection surfaces={surfaces} />
      </div>
      {empty ? null : (
        <ShoppingSummary list={list} hasSurfaces={surfaces.length > 0} busy={busy} onBuyAtRetailer={actions.buyAtRetailer} onCheckoutHere={actions.checkoutHere} swapAll={wide ? swapAll : null} />
      )}
      <ShoppingBuyListPortal buyList={buyList} notice={notice} busy={busy} actions={actions} />
    </section>
  );
}

/**
 * The buy list is a modal over the whole editor, so it goes to the page body: the Shop page is a
 * layer of its own (z-40), which would keep the bar above the dialog's backdrop. It stays mounted
 * while closed, so closing it returns focus to its Buy button.
 */
function ShoppingBuyListPortal({ buyList, notice, busy, actions }: Pick<ShoppingListPageProps, "buyList" | "notice" | "busy" | "actions">) {
  const hydrated = useClientHydrated();
  if (!hydrated) return null;
  return createPortal(
    <ShoppingBuyListDialog
      retailer={buyList.retailer}
      openedIds={buyList.openedIds}
      notice={notice}
      busy={busy}
      onOpenLine={actions.openLine}
      onClose={actions.closeBuyList}
    />,
    document.body
  );
}
