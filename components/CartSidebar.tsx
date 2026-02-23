"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { track } from "@/lib/analytics";
import { createCommerceEvent } from "@/lib/commerce-helpers";

type PlacedItem = {
  instanceId: string;
  productId: string;
  variantId: string;
  qty?: number;
  includeInCheckout?: boolean;
  locked?: boolean;
};

function getItemPrice(product: CatalogItemSchema, variantId: string) {
  const v = product.variants.find((variant) => variant.id === variantId);
  const basePrice = product.commerce.type === 'shopify' || product.commerce.type === 'affiliate' 
    ? (product.commerce.data as any).priceHint ?? 0 
    : 0;
  // Note: priceDelta removed from ProductVariant schema
  return basePrice;
}

async function trackAndOpen({
  designId,
  productId,
  price,
  retailer,
  buyUrl,
}: {
  designId?: string | null;
  productId: string;
  price: number;
  retailer: string | null;
  buyUrl: string;
}) {
  let urlToOpen = buyUrl;

  try {
    const res = await fetch("/api/track/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        designId: designId ?? null,
        productId,
        price,
        retailer,
        buyUrl,
      }),
    });

    const data = await res.json().catch(() => ({}));
    const clickKey = data?.clickKey as string | undefined;

    const u = new URL(urlToOpen);
    if (clickKey) u.searchParams.set("clickKey", clickKey);
    u.searchParams.set("utm_source", "interior-ai");
    u.searchParams.set("utm_medium", "affiliate");
    urlToOpen = u.toString();
    
    // Step 9: Track commerce event for affiliate link click
    const catalogItem = CATALOG_ITEMS[productId];
    if (catalogItem) {
      track(
        "commerce_event",
        createCommerceEvent("affiliate_link_clicked", catalogItem)
      );
    }
  } catch {
    // tracking failed: still open original
  }

  return urlToOpen;
}

export default function CartSidebar({
  items,
  designId,
  plan,
  onRemove,
  onSetQty,
  onSetInclude,
  onBulkSwap,
  onShowUpgrade,
  isGuest = false,
  onGuestCapture,
  theme = "default",
}: {
  items: PlacedItem[];
  designId?: string | null;
  plan: "free" | "pro";
  onRemove: (instanceId: string) => void;
  onSetQty: (instanceId: string, qty: number) => void;
  onSetInclude: (instanceId: string, include: boolean) => void;
  onBulkSwap: (direction: "cheaper" | "premium") => void;
  onShowUpgrade: () => void;
  isGuest?: boolean;
  onGuestCapture?: (reason: string, onContinue: () => void) => void;
  theme?: "default" | "designer";
}) {
  const isDesignerTheme = theme === "designer";
  const [busy, setBusy] = useState(false);
  const [openInSameTab, setOpenInSameTab] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const cartOpenedRef = useRef(false);
  const autoFillPulseRef = useRef(false);
  const [autoFillPulse, setAutoFillPulse] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState<null | {
    title: string;
    tabs: number;
    lines: typeof cartLines;
  }>(null);

  const cartLines = useMemo(() => {
    return items
      .map((it) => {
        const product = CATALOG_ITEMS[it.productId];
        if (!product) return null;

        const variant = product.variants.find((v) => v.id === it.variantId);
        const unitPrice = getItemPrice(product, it.variantId);
        const qty = Math.max(1, Math.min(99, it.qty ?? 1));
        const linePrice = unitPrice * qty;

        return {
          instanceId: it.instanceId,
          productId: product.id,
          name: product.title,
          category: product.category,
          variantName: variant?.label ?? it.variantId,
          unitPrice,
          qty,
          linePrice,
          includeInCheckout: it.includeInCheckout ?? true,
          locked: Boolean(it.locked),
          purchaseMode: product.commerce.type === 'shopify' ? 'shopify' : product.commerce.type === 'affiliate' ? 'affiliate' : 'not_buyable',
          retailer: product.commerce.type === 'affiliate' ? product.commerce.data.retailer : product.commerce.type === 'shopify' ? 'Shopify' : 'Unknown',
          buyUrl: product.commerce.type === 'affiliate' ? product.commerce.data.url : null,
          shopifyVariantId:
            product.commerce.type === 'shopify' ? product.commerce.data.variantId : null,
        };
      })
      .filter(Boolean) as Array<{
      instanceId: string;
      productId: string;
      name: string;
      category: string;
      variantName: string;
      unitPrice: number;
      qty: number;
      linePrice: number;
      includeInCheckout: boolean;
      locked: boolean;
      purchaseMode: "shopify" | "affiliate";
      retailer: string;
      buyUrl: string | null;
      shopifyVariantId: string | null;
    }>;
  }, [items]);

  const includedLines = useMemo(
    () => cartLines.filter((x) => x.includeInCheckout ?? true),
    [cartLines]
  );

  const showEmptyCart = cartLines.length === 0 || includedLines.length === 0;
  const eligibleLines = useMemo(
    () =>
      cartLines.filter((x) =>
        x.purchaseMode === "shopify" ? Boolean(x.shopifyVariantId) : Boolean(x.buyUrl)
      ),
    [cartLines]
  );

  const shopifyAll = useMemo(
    () => cartLines.filter((x) => x.purchaseMode === "shopify"),
    [cartLines]
  );
  const affiliateAll = useMemo(
    () => cartLines.filter((x) => x.purchaseMode === "affiliate"),
    [cartLines]
  );

  const shopifyItems = useMemo(
    () => includedLines.filter((x) => x.purchaseMode === "shopify"),
    [includedLines]
  );
  const affiliateItems = useMemo(
    () => includedLines.filter((x) => x.purchaseMode === "affiliate"),
    [includedLines]
  );

  const totals = useMemo(() => {
    const total = includedLines.reduce((sum, x) => sum + x.linePrice, 0);
    const affiliateBuyable = affiliateItems.filter((x) => x.buyUrl).length;
    const totalQty = includedLines.reduce((sum, x) => sum + x.qty, 0);
    return { total, affiliateBuyable, totalQty };
  }, [affiliateItems, includedLines]);

  useEffect(() => {
    if (cartOpenedRef.current) return;
    if (isCollapsed) return;
    track("cart_opened", {
      design_id: designId ?? null,
      cart_items_shopify: shopifyItems.length,
      cart_items_affiliate: affiliateItems.length,
    });
    cartOpenedRef.current = true;
  }, [isCollapsed, designId, shopifyItems.length, affiliateItems.length]);

  useEffect(() => {
    if (!showEmptyCart || autoFillPulseRef.current) return;
    setAutoFillPulse(true);
    autoFillPulseRef.current = true;
    const t = window.setTimeout(() => setAutoFillPulse(false), 900);
    return () => window.clearTimeout(t);
  }, [showEmptyCart]);

  const autoFillFromRoom = () => {
    setAutoFillPulse(false);
    track("cart_empty_autofill_clicked", { design_id: designId ?? null });
    const targets = eligibleLines.length ? eligibleLines : cartLines;
    if (targets.length === 0) {
      alert("No shoppable items found yet.");
      return;
    }
    targets.forEach((x) => onSetInclude(x.instanceId, true));
  };

  const addItemsIndividually = () => {
    setAutoFillPulse(false);
    track("cart_empty_add_items_clicked", { design_id: designId ?? null });
  };

  const groups = useMemo(() => {
    const map = new Map<
      string,
      { lines: typeof affiliateAll; includedLines: typeof affiliateAll }
    >();
    for (const line of affiliateAll) {
      const key = line.retailer || "Unknown";
      const entry = map.get(key) ?? { lines: [], includedLines: [] };
      entry.lines.push(line);
      if (line.includeInCheckout ?? true) {
        entry.includedLines.push(line);
      }
      map.set(key, entry);
    }
    return Array.from(map.entries()).map(([retailer, entry]) => ({
      retailer,
      lines: entry.lines,
      includedLines: entry.includedLines,
      subtotal: entry.includedLines.reduce((s, x) => s + x.linePrice, 0),
      buyableCount: entry.includedLines.filter((x) => x.buyUrl).length,
    }));
  }, [affiliateAll]);

  const countTabs = (lines: typeof cartLines) =>
    lines
      .filter((x) => x.buyUrl)
      .reduce((sum, x) => sum + (x.qty ?? 1), 0);

  const openUrl = async (url: string) => {
    if (openInSameTab) {
      window.location.href = url;
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const doBuyLines = async (lines: typeof cartLines) => {
    const purchasable = lines.filter((x) => x.buyUrl);
    if (purchasable.length === 0) {
      alert("No items in this group have buy links yet.");
      return;
    }

    setBusy(true);
    try {
      for (const line of purchasable) {
        for (let i = 0; i < (line.qty ?? 1); i++) {
          const urlToOpen = await trackAndOpen({
            designId,
            productId: line.productId,
            price: line.unitPrice,
            retailer: line.retailer,
            buyUrl: line.buyUrl!,
          });
          await openUrl(urlToOpen);

          if (openInSameTab) return;

          await new Promise((r) => setTimeout(r, 350));
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const requestBuy = (title: string, lines: typeof cartLines) => {
    const tabs = countTabs(lines);

    if (tabs <= 3) {
      doBuyLines(lines);
      return;
    }

    setConfirmOpen({ title, tabs, lines });
  };

  const startShopifyCheckoutInternal = async () => {
    const lines = shopifyItems
      .filter((x) => x.shopifyVariantId)
      .map((x) => ({
        merchandiseId: x.shopifyVariantId as string,
        quantity: x.qty ?? 1,
      }));

    if (lines.length === 0) {
      alert("No Shopify items have variant IDs yet.");
      return;
    }

    track("shopify_checkout_started", {
      design_id: designId ?? null,
      cart_items_shopify: shopifyItems.length,
      cart_items_affiliate: affiliateItems.length,
    });

    setBusy(true);
    try {
      const res = await fetch("/api/shopify/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lines }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          data?.unavailable?.length
            ? `Out of stock:\n${data.unavailable
                .map((u: { title?: string; variant?: string }) =>
                  `- ${u.title ?? "Item"} (${u.variant ?? "Variant"})`
                )
                .join("\n")}`
            : data?.error ?? "Checkout failed";
        alert(msg);
        return;
      }

      const u = new URL(data.checkoutUrl as string);
      if (designId) u.searchParams.set("designId", designId);
      window.location.href = u.toString();
    } finally {
      setBusy(false);
    }
  };

  const startShopifyCheckout = async () => {
    if (isGuest && onGuestCapture) {
      onGuestCapture("checkout", () => {
        void startShopifyCheckoutInternal();
      });
      return;
    }
    await startShopifyCheckoutInternal();
  };

  return (
    <aside
      data-testid="cart-panel"
      className={
        isDesignerTheme
          ? "designer-panel w-[340px] max-h-[60vh] overflow-auto rounded-2xl p-4"
          : "w-[340px] max-h-[60vh] overflow-auto rounded-2xl bg-white p-4 shadow"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-neutral-900">Cart</div>
          <div className="text-xs text-neutral-500">
            {cartLines.length} items • {" "}
            {shopifyItems.length} buy here • {" "}
            {affiliateItems.length} external
          </div>
          <div className="mt-2">
            <div className="text-[11px] uppercase tracking-wide text-neutral-500">
              Total
            </div>
            <div className="text-xl font-semibold text-neutral-900">
              ${totals.total.toFixed(0)}
            </div>
          </div>
        </div>

        <button
          className="rounded-lg border px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-50"
          onClick={() => setIsCollapsed((v) => !v)}
          aria-expanded={!isCollapsed}
          aria-controls="cart-body"
          type="button"
        >
          {isCollapsed ? "Expand" : "Collapse"}
        </button>
      </div>

      {!isCollapsed && (
        <div id="cart-body">
          <button
            data-testid="checkout-shopify"
            className={`mt-3 w-full rounded-xl px-3 py-2 text-sm text-white ${
              shopifyItems.length === 0 || busy ? "bg-neutral-300" : "bg-neutral-900"
            }`}
            onClick={startShopifyCheckout}
            disabled={shopifyItems.length === 0 || busy}
          >
            Checkout ({shopifyItems.length} buy here item{shopifyItems.length === 1 ? "" : "s"})
          </button>

          <button
            data-testid="checkout-affiliate"
            className={`mt-2 w-full rounded-xl border px-3 py-2 text-sm ${
              affiliateItems.length === 0 || busy ? "text-neutral-400" : "text-neutral-900"
            }`}
            disabled={affiliateItems.length === 0 || busy}
            onClick={() => requestBuy("Buy external items", affiliateItems)}
          >
            Buy external ({affiliateItems.length} item{affiliateItems.length === 1 ? "" : "s"})
          </button>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className="rounded-xl border px-3 py-2 text-sm"
              disabled={busy}
              onClick={() => {
                if (plan !== "pro") return onShowUpgrade();
                onBulkSwap("cheaper");
              }}
            >
              Make room cheaper
            </button>

            <button
              className="rounded-xl border px-3 py-2 text-sm"
              disabled={busy}
              onClick={() => {
                if (plan !== "pro") return onShowUpgrade();
                onBulkSwap("premium");
              }}
            >
              Upgrade room
            </button>
          </div>

          <div className="mt-2 text-[11px] text-neutral-500">
            Tip: checkout “Buy here” items first, then purchase external items.
          </div>

          <div className="mt-3 max-h-[55vh] overflow-auto space-y-3">
            {showEmptyCart ? (
              <div className="rounded-xl border p-4 text-sm text-neutral-700">
                <div className="text-sm font-semibold">Your room can shop for you</div>
                <div className="mt-1 text-xs text-neutral-500">
                  We will add buyable items from your room to checkout.
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    className={`rounded-lg px-3 py-2 text-sm text-white ${
                      autoFillPulse ? "pulse-once" : ""
                    } ${busy ? "bg-neutral-300" : "bg-neutral-900"}`}
                    disabled={busy}
                    onClick={autoFillFromRoom}
                  >
                    Auto-fill cart from room
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2 text-sm text-neutral-700"
                    onClick={addItemsIndividually}
                  >
                    Add items individually
                  </button>
                </div>
              </div>
            ) : (
              <>
                {shopifyAll.length > 0 && (
                  <div className="rounded-xl border">
                    <div className="flex items-center justify-between gap-2 border-b bg-neutral-50 px-3 py-2">
                      <div>
                        <div className="text-sm font-semibold">Buy here</div>
                        <div className="text-xs text-neutral-500">
                          {shopifyItems.length} included • Subtotal ${shopifyItems
                            .reduce((sum, x) => sum + x.linePrice, 0)
                            .toFixed(0)}
                        </div>
                      </div>
                    </div>

                    <ul className="divide-y">
                      {shopifyAll.map((x) => (
                        <li key={x.instanceId} data-testid="cart-item" className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold">
                                {x.name}
                                {x.locked && (
                                  <span className="ml-2 text-xs text-neutral-400">
                                    🔒
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-neutral-500">
                                {x.variantName} • {x.category}
                              </div>
                              <span className="mt-1 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] text-green-700">
                                Checkout here
                              </span>
                              <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                                <input
                                  type="checkbox"
                                  checked={x.includeInCheckout ?? true}
                                  onChange={(e) => {
                                    onSetInclude(x.instanceId, e.target.checked);
                                    // Step 9: Track when items are added/removed from checkout
                                    const catalogItem = CATALOG_ITEMS[x.productId];
                                    if (catalogItem) {
                                      track("commerce_event", createCommerceEvent(
                                        e.target.checked ? "item_added_to_cart" : "cart_item_removed",
                                        catalogItem
                                      ));
                                    }
                                  }}
                                />
                                Include in checkout
                              </label>
                            </div>

                            <div className="text-right">
                              <div className="text-sm font-semibold">${x.linePrice}</div>
                              <div className="text-[11px] text-neutral-500">${x.unitPrice} ea</div>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                className="h-7 w-7 rounded-lg border text-sm"
                                onClick={() => onSetQty(x.instanceId, Math.max(1, x.qty - 1))}
                                data-testid="cart-quantity-decrease"
                              >
                                -
                              </button>
                              <div className="w-8 text-center text-sm" data-testid="cart-quantity">{x.qty}</div>
                              <button
                                className="h-7 w-7 rounded-lg border text-sm"
                                onClick={() => onSetQty(x.instanceId, Math.min(99, x.qty + 1))}
                                data-testid="cart-quantity-increase"
                              >
                                +
                              </button>
                            </div>

                            <button
                              className="rounded-lg px-2 py-1 text-xs text-red-600"
                              onClick={() => onRemove(x.instanceId)}
                              data-testid="cart-item-remove"
                            >
                              Remove
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {affiliateAll.length === 0 ? (
                  <div className="rounded-xl border p-4 text-sm text-neutral-600">
                    No external retailer items in the cart right now.
                  </div>
                ) : (
                  groups.map((g) => (
                    <div key={g.retailer} className="rounded-xl border">
                      <div className="flex items-center justify-between gap-2 border-b bg-neutral-50 px-3 py-2">
                        <div>
                          <div className="text-sm font-semibold">{g.retailer}</div>
                          <div className="text-xs text-neutral-500">
                            {g.lines.length} items • {g.buyableCount} included • Subtotal ${g.subtotal.toFixed(0)}
                          </div>
                        </div>

                        <button
                          className={`rounded-lg px-3 py-1 text-xs text-white ${
                            busy || g.includedLines.length === 0
                              ? "bg-neutral-400"
                              : "bg-neutral-900"
                          }`}
                          disabled={busy || g.includedLines.length === 0}
                          onClick={() =>
                            requestBuy(`Buy from ${g.retailer}`, g.includedLines)
                          }
                        >
                          Buy retailer
                        </button>
                      </div>

                      <ul className="divide-y">
                        {g.lines.map((x) => (
                          <li key={x.instanceId} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold">
                                  {x.name}
                                  {x.locked && (
                                    <span className="ml-2 text-xs text-neutral-400">
                                      🔒
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-neutral-500">
                                  {x.variantName} • {x.category}
                                </div>
                                <span className="mt-1 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] text-blue-700">
                                  External retailer
                                </span>

                                <label className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                                  <input
                                    type="checkbox"
                                    checked={x.includeInCheckout ?? true}
                                    onChange={(e) => {
                                      onSetInclude(x.instanceId, e.target.checked);
                                      // Step 9: Track when affiliate items are added/removed from checkout
                                      const catalogItem = CATALOG_ITEMS[x.productId];
                                      if (catalogItem) {
                                        track("commerce_event", createCommerceEvent(
                                          e.target.checked ? "item_added_to_cart" : "cart_item_removed",
                                          catalogItem
                                        ));
                                      }
                                    }}
                                  />
                                  Include in checkout
                                </label>

                                {!x.buyUrl && (
                                  <div className="mt-1 text-xs text-neutral-400">
                                    Buy link coming soon
                                  </div>
                                )}
                              </div>

                              <div className="text-right">
                                <div className="text-sm font-semibold">${x.linePrice}</div>
                                <div className="text-[11px] text-neutral-500">${x.unitPrice} ea</div>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <button
                                  className="h-7 w-7 rounded-lg border text-sm"
                                  onClick={() => onSetQty(x.instanceId, Math.max(1, x.qty - 1))}
                                >
                                  -
                                </button>
                                <div className="w-8 text-center text-sm">{x.qty}</div>
                                <button
                                  className="h-7 w-7 rounded-lg border text-sm"
                                  onClick={() => onSetQty(x.instanceId, Math.min(99, x.qty + 1))}
                                >
                                  +
                                </button>

                                <button
                                  className={`ml-2 rounded-lg px-3 py-1 text-xs ${
                                    x.buyUrl
                                      ? "bg-green-600 text-white"
                                      : "bg-neutral-200 text-neutral-600"
                                  }`}
                                  disabled={!x.buyUrl || busy}
                                  onClick={() => doBuyLines([x])}
                                >
                                  Buy
                                </button>
                              </div>

                              <button
                                className="rounded-lg px-2 py-1 text-xs text-red-600"
                                onClick={() => onRemove(x.instanceId)}
                              >
                                Remove
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </>
            )}
          </div>

          <div className="mt-2 text-[11px] text-neutral-500">
            Tracking happens per opened retailer tab. Quantity opens multiple tabs (V1).
          </div>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className={
              isDesignerTheme
                ? "designer-panel designer-panel-strong w-full max-w-md rounded-2xl p-5"
                : "w-full max-w-md rounded-2xl bg-white p-5 shadow-lg"
            }
          >
            <div className="text-lg font-semibold">{confirmOpen.title}</div>
            <div className="mt-1 text-sm text-neutral-600">
              {openInSameTab ? (
                <>
                  This will open the first link in the{" "}
                  <span className="font-semibold">same tab</span>.
                </>
              ) : (
                <>
                  This will open <span className="font-semibold">{confirmOpen.tabs}</span>{" "}
                  tab{confirmOpen.tabs === 1 ? "" : "s"} to retailer pages.
                </>
              )}
            </div>

            <div className="mt-4 max-h-48 overflow-auto rounded-xl border">
              <ul className="divide-y text-sm">
                {confirmOpen.lines
                  .filter((x) => x.buyUrl)
                  .map((x) => (
                    <li key={x.instanceId} className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{x.name}</div>
                          <div className="text-xs text-neutral-500">
                            {x.retailer} • qty {x.qty}
                          </div>
                        </div>
                        <div className="text-xs text-neutral-500">
                          {x.qty} tab{x.qty === 1 ? "" : "s"}
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl border bg-neutral-50 px-3 py-2">
              <div>
                <div className="text-sm font-semibold">Open in same tab</div>
                <div className="text-xs text-neutral-500">
                  Safer for popup blockers. Opens the first link and leaves this page.
                </div>
              </div>

              <button
                className={`rounded-lg px-3 py-1 text-sm ${
                  openInSameTab ? "bg-neutral-900 text-white" : "bg-white border"
                }`}
                onClick={() => setOpenInSameTab((v) => !v)}
                type="button"
              >
                {openInSameTab ? "On" : "Off"}
              </button>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-xl bg-neutral-200 px-4 py-2 text-sm"
                onClick={() => setConfirmOpen(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                className="rounded-xl bg-neutral-900 px-4 py-2 text-sm text-white"
                onClick={() => {
                  const payload = confirmOpen;
                  setConfirmOpen(null);
                  doBuyLines(payload.lines);
                }}
                disabled={busy}
              >
                Continue
              </button>
            </div>

            <div className="mt-2 text-[11px] text-neutral-500">
              Tip: reduce quantity to open fewer tabs.
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
