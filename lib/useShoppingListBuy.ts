"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { trackProductEvent } from "@/lib/analytics";
import type { GuestPromptReason } from "@/lib/guest-save-prompt";
import type { ShoppingList, ShoppingListLine } from "@/lib/shopping-list";
import { openRetailerLine, requestShopifyCheckout } from "@/lib/shopping-list-buy";
import { useShopifyCheckoutLock } from "@/lib/useShopifyCheckoutLock";

export type ShoppingNotice = { message: string; tone: "info" | "warning" | "error" };

export type UseShoppingListBuyInput = {
  list: ShoppingList;
  designId: string | null | undefined;
  isGuest: boolean;
  openGuestPrompt: (reason: GuestPromptReason, onContinue: () => void) => void;
};

type SetNotice = Dispatch<SetStateAction<ShoppingNotice | null>>;

const BLOCKED_TAB = "Your browser blocked the new tab. Allow pop-ups for this site, then open the product again.";

function useShoppingListOpenedEvent(productCount: number) {
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current) return;
    tracked.current = true;
    trackProductEvent("shopping_list_opened", { source: "shop_step", itemCount: productCount });
  }, [productCount]);
}

/**
 * Buy at a shop: one product opens at once; several open the buy list, one tab per click. Opened
 * products stay ticked while Shop is open, so reopening the list keeps the person's place.
 */
function useRetailerBuyList(list: ShoppingList, designId: string | null | undefined, setNotice: SetNotice) {
  const [retailerId, setRetailerId] = useState<string | null>(null);
  const [openedIds, setOpenedIds] = useState<ReadonlySet<string>>(() => new Set());

  const openLine = useCallback(async (line: ShoppingListLine) => {
    if (!(await openRetailerLine(line, designId))) {
      setNotice({ message: BLOCKED_TAB, tone: "warning" });
      return;
    }
    setNotice((current) => (current?.message === BLOCKED_TAB ? null : current));
    setOpenedIds((previous) => new Set(previous).add(line.instanceId));
  }, [designId, setNotice]);

  const buyAtRetailer = useCallback((id: string) => {
    const retailer = list.retailers.find((entry) => entry.id === id);
    if (!retailer) return;
    if (retailer.lines.length === 1) {
      void openLine(retailer.lines[0]);
      return;
    }
    setRetailerId(id);
  }, [list.retailers, openLine]);

  const retailer = retailerId ? list.retailers.find((entry) => entry.id === retailerId) ?? null : null;
  return {
    buyList: { retailer, openedIds },
    actions: {
      openLine: (line: ShoppingListLine) => void openLine(line),
      buyAtRetailer,
      closeBuyList: () => setRetailerId(null),
    },
  };
}

/** Checkout here, through Shopify: guests are asked to sign in first, and one checkout runs at a time. */
function useCheckoutHere({ list, designId, isGuest, openGuestPrompt, busy, setBusy, setNotice }: UseShoppingListBuyInput & {
  busy: boolean;
  setBusy: Dispatch<SetStateAction<boolean>>;
  setNotice: SetNotice;
}) {
  const checkoutLock = useShopifyCheckoutLock(setBusy);
  const startCheckout = useCallback(async () => {
    if (checkoutLock.active() || !list.checkoutHere) return;
    const lines = list.checkoutHere.lines;
    await checkoutLock.run(async () => {
      const result = await requestShopifyCheckout(lines, designId);
      if (result.ok) window.location.href = result.checkoutUrl;
      else setNotice({ message: result.message, tone: "error" });
    });
  }, [checkoutLock, designId, list.checkoutHere, setNotice]);

  return useCallback(() => {
    if (busy || checkoutLock.active()) return;
    if (isGuest) {
      openGuestPrompt("checkout", () => void startCheckout());
      return;
    }
    void startCheckout();
  }, [busy, checkoutLock, isGuest, openGuestPrompt, startCheckout]);
}

/** Buying from the Shopping list: Buy at each shop, and Checkout here for Shopify products. */
export function useShoppingListBuy(input: UseShoppingListBuyInput) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ShoppingNotice | null>(null);
  useShoppingListOpenedEvent(input.list.productCount);
  const retailer = useRetailerBuyList(input.list, input.designId, setNotice);
  const checkoutHere = useCheckoutHere({ ...input, busy, setBusy, setNotice });
  return {
    busy,
    notice,
    buyList: retailer.buyList,
    actions: { ...retailer.actions, checkoutHere, dismissNotice: () => setNotice(null) },
  };
}
