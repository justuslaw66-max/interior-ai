"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { track } from "@/lib/analytics";
import { createCommerceEvent } from "@/lib/commerce-helpers";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { trackVariantIssues } from "@/lib/catalog/variant-observability";

export type CartSidebarPlacedItem = {
  instanceId: string;
  productId: string;
  variantId: string;
  qty?: number;
  includeInCheckout?: boolean;
  purchaseOptionId?: string;
  bundleGroupId?: string;
  bundleRole?: "primary" | "component";
  bundleQuantity?: number;
  locked?: boolean;
};

type CartNotice = {
  message: string;
  tone: "info" | "warning" | "error";
};

function getItemPrice(product: CatalogItemSchema) {
  const basePrice = product.commerce.type === "affiliate"
    ? product.commerce.data.priceHint ?? 0
    : 0;
  // Note: priceDelta removed from ProductVariant schema
  return basePrice;
}

async function trackAndOpen({
  designId,
  productId,
  variantId,
  buyUrl,
}: {
  designId?: string | null;
  productId: string;
  variantId: string;
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
        variantId,
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

export type CartSidebarProps = {
  items: CartSidebarPlacedItem[];
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
};

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
}: CartSidebarProps) {
  const isDesignerTheme = theme === "designer";
  const [busy, setBusy] = useState(false);
  const [openInSameTab, setOpenInSameTab] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const cartOpenedRef = useRef(false);
  const autoFillPulseRef = useRef(false);
  const noticeTimerRef = useRef<number | null>(null);
  const [autoFillPulse, setAutoFillPulse] = useState(false);
  const [notice, setNotice] = useState<CartNotice | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<null | {
    title: string;
    tabs: number;
    lines: typeof cartLines;
  }>(null);

  const showCartNotice = (message: string, tone: CartNotice["tone"] = "info") => {
    setNotice({ message, tone });
    if (noticeTimerRef.current) {
      window.clearTimeout(noticeTimerRef.current);
    }
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, tone === "error" ? 5000 : 3200);
  };

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) {
        window.clearTimeout(noticeTimerRef.current);
      }
    };
  }, []);

  const cartLines = useMemo(() => {
    return items
      .map((it) => {
        if (it.bundleRole === "component") return null;
        const product = CATALOG_ITEMS[it.productId];
        if (!product) return null;

        const resolved = resolveCatalogVariant(product, it.variantId);
        const purchaseOption = it.purchaseOptionId
          ? resolved.variant.purchaseOptions?.find((option) => option.id === it.purchaseOptionId) ?? null
          : null;
        const optionQuantity = purchaseOption?.quantity ?? it.bundleQuantity ?? null;
        const isBundleLine = Boolean(optionQuantity && optionQuantity > 1);
        const unitPrice =
          resolved.commerce.type === "affiliate" ? resolved.commerce.priceHint ?? 0 : getItemPrice(product);
        const qty = Math.max(1, Math.min(99, optionQuantity ?? it.qty ?? 1));
        const linePrice = purchaseOption?.priceHint ?? unitPrice * qty;

        return {
          instanceId: it.instanceId,
          productId: product.id,
          variantId: resolved.variantId,
          name: product.title,
          category: product.category,
          variantName: purchaseOption ? `${resolved.variant.label} · ${purchaseOption.label}` : resolved.variant.label,
          purchaseOptionLabel: purchaseOption?.label ?? null,
          isBundleLine,
          unitPrice: purchaseOption?.priceHint ?? unitPrice,
          qty,
          linePrice,
          linkOpenCount: isBundleLine ? 1 : qty,
          compareAtPrice: purchaseOption?.compareAtPriceHint ?? null,
          savings: purchaseOption?.savingsHint ?? null,
          includeInCheckout: it.includeInCheckout ?? true,
          locked: Boolean(it.locked),
          purchaseMode: resolved.commerce.type,
          retailer:
            resolved.commerce.type === "affiliate"
              ? resolved.commerce.retailer ?? "Unknown"
              : resolved.commerce.type === "shopify"
              ? "Shopify"
              : "Unknown",
          buyUrl: purchaseOption?.affiliateUrl ?? (resolved.commerce.type === "affiliate" ? resolved.commerce.url : null),
          shopifyVariantId: resolved.commerce.type === "shopify" ? resolved.commerce.variantId : null,
          shopifyAvailable: resolved.commerce.type === "shopify" ? resolved.commerce.available : false,
        };
      })
      .filter(Boolean) as Array<{
      instanceId: string;
      productId: string;
      variantId: string;
      name: string;
      category: string;
      variantName: string;
      unitPrice: number;
      qty: number;
      linePrice: number;
      includeInCheckout: boolean;
      locked: boolean;
      purchaseMode: "shopify" | "affiliate" | "not_buyable";
      purchaseOptionLabel: string | null;
      isBundleLine: boolean;
      linkOpenCount: number;
      compareAtPrice: number | null;
      savings: number | null;
      retailer: string;
      buyUrl: string | null;
      shopifyVariantId: string | null;
      shopifyAvailable: boolean;
    }>;
  }, [items]);

  useEffect(() => {
    for (const item of items) {
      const product = CATALOG_ITEMS[item.productId];
      if (!product) continue;
      trackVariantIssues(resolveCatalogVariant(product, item.variantId), {
        surface: "cart_sidebar",
        requestedVariantId: item.variantId,
      });
    }
  }, [items]);

  const includedLines = useMemo(
    () => cartLines.filter((x) => x.includeInCheckout ?? true),
    [cartLines]
  );

  const showEmptyCart = cartLines.length === 0 || includedLines.length === 0;
  const eligibleLines = useMemo(
    () =>
      cartLines.filter((x) =>
        x.purchaseMode === "shopify"
          ? Boolean(x.shopifyVariantId && x.shopifyAvailable)
          : x.purchaseMode === "affiliate"
          ? Boolean(x.buyUrl)
          : false
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
  const readyShopifyItems = useMemo(
    () => shopifyItems.filter((x) => Boolean(x.shopifyVariantId && x.shopifyAvailable)),
    [shopifyItems]
  );
  const unavailableShopifyItems = useMemo(
    () => shopifyItems.filter((x) => !x.shopifyVariantId || !x.shopifyAvailable),
    [shopifyItems]
  );
  const readyAffiliateItems = useMemo(
    () => affiliateItems.filter((x) => Boolean(x.buyUrl)),
    [affiliateItems]
  );
  const missingAffiliateItems = useMemo(
    () => affiliateItems.filter((x) => !x.buyUrl),
    [affiliateItems]
  );
  const excludedLineCount = cartLines.filter((x) => !(x.includeInCheckout ?? true)).length;
  const checkoutReadyCount = readyShopifyItems.length + readyAffiliateItems.length;
  const needsReviewCount = unavailableShopifyItems.length + missingAffiliateItems.length;

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
      showCartNotice("No shoppable items found yet.", "warning");
      return;
    }
    targets.forEach((x) => onSetInclude(x.instanceId, true));
    showCartNotice(`${targets.length} item${targets.length === 1 ? "" : "s"} included in checkout.`);
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
      .reduce((sum, x) => sum + (x.linkOpenCount ?? x.qty ?? 1), 0);

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
      showCartNotice("No items in this group have buy links yet.", "warning");
      return;
    }

    setBusy(true);
    showCartNotice(
      openInSameTab
        ? "Opening the first retailer link in this tab."
        : `Opening ${countTabs(purchasable)} retailer tab${countTabs(purchasable) === 1 ? "" : "s"}.`
    );
    try {
      for (const line of purchasable) {
        for (let i = 0; i < (line.linkOpenCount ?? line.qty ?? 1); i++) {
          const urlToOpen = await trackAndOpen({
            designId,
            productId: line.productId,
            variantId: line.variantId,
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
    const invalidShopify = shopifyItems.filter(
      (line) => !line.shopifyVariantId || !line.shopifyAvailable
    );
    if (invalidShopify.length > 0) {
      showCartNotice(
        `Some selected variants are unavailable for checkout:\n${invalidShopify
          .map((line) => `- ${line.name} (${line.variantName})`)
          .join("\n")}`,
        "error"
      );
      return;
    }

    const lines = shopifyItems
      .filter((x) => x.shopifyVariantId)
      .map((x) => ({
        merchandiseId: x.shopifyVariantId as string,
        quantity: x.qty ?? 1,
        productId: x.productId,
        variantId: x.variantId,
      }));

    if (lines.length === 0) {
      showCartNotice("No Shopify items have variant IDs yet.", "warning");
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
        showCartNotice(msg, "error");
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

  const panelClass = isDesignerTheme
    ? "designer-panel w-85 max-h-[60vh] overflow-auto rounded-2xl p-4"
    : "w-85 max-h-[60vh] overflow-auto rounded-2xl border border-neutral-200 bg-white p-4 shadow";
  const textClass = isDesignerTheme ? "text-neutral-100" : "text-neutral-900";
  const mutedTextClass = isDesignerTheme ? "text-neutral-400" : "text-neutral-500";
  const softCardClass = isDesignerTheme
    ? "rounded-2xl border border-white/10 bg-black/10 p-3"
    : "rounded-2xl border border-neutral-200 bg-neutral-50 p-3";
  const groupClass = isDesignerTheme
    ? "overflow-hidden rounded-2xl border border-white/10 bg-[#151820]"
    : "overflow-hidden rounded-2xl border border-neutral-200 bg-white";
  const groupHeaderClass = isDesignerTheme
    ? "flex items-center justify-between gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2"
    : "flex items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 py-2";
  const secondaryButtonClass = isDesignerTheme
    ? "rounded-xl border border-white/10 px-3 py-2 text-sm text-neutral-200 transition hover:bg-white/5 disabled:text-neutral-500"
    : "rounded-xl border border-neutral-200 px-3 py-2 text-sm text-neutral-800 transition hover:bg-neutral-50 disabled:text-neutral-400";
  const noticeClass =
    notice?.tone === "error"
      ? isDesignerTheme
        ? "border-red-400/30 bg-red-500/10 text-red-100"
        : "border-red-200 bg-red-50 text-red-800"
      : notice?.tone === "warning"
        ? isDesignerTheme
          ? "border-amber-400/30 bg-amber-500/10 text-amber-100"
          : "border-amber-200 bg-amber-50 text-amber-800"
        : isDesignerTheme
          ? "border-sky-400/30 bg-sky-500/10 text-sky-100"
          : "border-sky-200 bg-sky-50 text-sky-800";

  return (
    <aside
      data-testid="cart-panel"
      className={panelClass}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={`text-sm font-semibold ${textClass}`}>Shopping list</div>
          <div className={`text-xs ${mutedTextClass}`}>
            {totals.totalQty} selected item{totals.totalQty === 1 ? "" : "s"} from your design
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className={softCardClass}>
              <div className={`text-[11px] uppercase tracking-wide ${mutedTextClass}`}>
                Total
              </div>
              <div className={`mt-1 text-lg font-semibold ${textClass}`}>
                ${totals.total.toFixed(0)}
              </div>
            </div>
            <div className={softCardClass}>
              <div className={`text-[11px] uppercase tracking-wide ${mutedTextClass}`}>
                Checkout
              </div>
              <div className={`mt-1 text-lg font-semibold ${textClass}`}>
                {shopifyItems.length}
              </div>
            </div>
            <div className={softCardClass}>
              <div className={`text-[11px] uppercase tracking-wide ${mutedTextClass}`}>
                Retailer
              </div>
              <div className={`mt-1 text-lg font-semibold ${textClass}`}>
                {affiliateItems.length}
              </div>
            </div>
          </div>
        </div>

        <button
          className={secondaryButtonClass}
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
          <div
            className={
              isDesignerTheme
                ? "mt-3 rounded-2xl border border-white/10 bg-black/10 p-3"
                : "mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3"
            }
            data-testid="cart-checkout-readiness"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`text-sm font-semibold ${textClass}`}>Checkout readiness</div>
                <div className={`mt-1 text-xs ${mutedTextClass}`}>
                  {checkoutReadyCount > 0
                    ? `${checkoutReadyCount} included line${checkoutReadyCount === 1 ? "" : "s"} can be purchased now.`
                    : "No checkout-ready items are included yet."}
                </div>
              </div>
              <span
                className={
                  needsReviewCount > 0
                    ? isDesignerTheme
                      ? "rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-100"
                      : "rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800"
                    : isDesignerTheme
                      ? "rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                      : "rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"
                }
              >
                {needsReviewCount > 0 ? "Review needed" : "Ready"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className={isDesignerTheme ? "rounded-xl bg-white/5 p-2" : "rounded-xl bg-white p-2"}>
                <div className={`text-sm font-semibold ${textClass}`}>{readyShopifyItems.length}</div>
                <div className={`text-[10px] ${mutedTextClass}`}>Cart-ready</div>
              </div>
              <div className={isDesignerTheme ? "rounded-xl bg-white/5 p-2" : "rounded-xl bg-white p-2"}>
                <div className={`text-sm font-semibold ${textClass}`}>{readyAffiliateItems.length}</div>
                <div className={`text-[10px] ${mutedTextClass}`}>Retailer links</div>
              </div>
              <div className={isDesignerTheme ? "rounded-xl bg-white/5 p-2" : "rounded-xl bg-white p-2"}>
                <div className={`text-sm font-semibold ${textClass}`}>{needsReviewCount}</div>
                <div className={`text-[10px] ${mutedTextClass}`}>Needs review</div>
              </div>
            </div>
            {excludedLineCount > 0 ? (
              <div className={`mt-2 text-[11px] ${mutedTextClass}`}>
                {excludedLineCount} line{excludedLineCount === 1 ? "" : "s"} excluded from checkout.
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid gap-2">
            <button
              data-testid="checkout-shopify"
              className={`w-full rounded-xl px-3 py-2 text-sm font-semibold text-white transition ${
                shopifyItems.length === 0 || busy ? "bg-neutral-300" : "bg-neutral-900 hover:bg-neutral-800"
              }`}
              onClick={startShopifyCheckout}
              disabled={shopifyItems.length === 0 || busy}
            >
              Checkout here ({shopifyItems.length})
            </button>

            <button
              data-testid="checkout-affiliate"
              className={`${secondaryButtonClass} w-full ${
                affiliateItems.length === 0 || busy ? "opacity-60" : ""
              }`}
              disabled={affiliateItems.length === 0 || busy}
              onClick={() => requestBuy("Buy external items", affiliateItems)}
            >
              Open retailer links ({affiliateItems.length})
            </button>
          </div>

          {notice && (
            <div
              data-testid="cart-notice"
              role={notice.tone === "error" ? "alert" : "status"}
              className={`mt-3 whitespace-pre-line rounded-xl border px-3 py-2 text-sm ${noticeClass}`}
            >
              {notice.message}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => {
                if (plan !== "pro") return onShowUpgrade();
                onBulkSwap("cheaper");
              }}
            >
              Make room cheaper
            </button>

            <button
              className={secondaryButtonClass}
              disabled={busy}
              onClick={() => {
                if (plan !== "pro") return onShowUpgrade();
                onBulkSwap("premium");
              }}
            >
              Upgrade room
            </button>
          </div>

          <div className={`mt-2 text-[11px] ${mutedTextClass}`}>
            Checkout items you can buy here first, then open retailer links for external items.
          </div>

          <div className="mt-3 max-h-[55vh] overflow-auto space-y-3">
            {showEmptyCart ? (
              <div className={softCardClass}>
                <div className={`text-sm font-semibold ${textClass}`}>Your room can shop for you</div>
                <div className={`mt-1 text-xs ${mutedTextClass}`}>
                  Include the buyable items already placed in your rooms.
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    className={`rounded-xl px-3 py-2 text-sm font-semibold text-white ${
                      autoFillPulse ? "pulse-once" : ""
                    } ${busy ? "bg-neutral-300" : "bg-neutral-900"}`}
                    disabled={busy}
                    onClick={autoFillFromRoom}
                  >
                    Auto-fill cart from room
                  </button>
                  <button
                    className={secondaryButtonClass}
                    onClick={addItemsIndividually}
                  >
                    Add items individually
                  </button>
                </div>
              </div>
            ) : (
              <>
                {shopifyAll.length > 0 && (
                  <div className={groupClass}>
                    <div className={groupHeaderClass}>
                      <div>
                        <div className={`text-sm font-semibold ${textClass}`}>Checkout here</div>
                        <div className={`text-xs ${mutedTextClass}`}>
                          {shopifyItems.length} included • Subtotal ${shopifyItems
                            .reduce((sum, x) => sum + x.linePrice, 0)
                            .toFixed(0)}
                        </div>
                      </div>
                    </div>

                    <ul className={isDesignerTheme ? "divide-y divide-white/10" : "divide-y divide-neutral-100"}>
                      {shopifyAll.map((x) => (
                        <li key={x.instanceId} data-testid="cart-item" className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className={`truncate text-sm font-semibold ${textClass}`}>
                                {x.name}
                                {x.locked && (
                                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${isDesignerTheme ? "bg-white/10 text-neutral-300" : "bg-neutral-100 text-neutral-500"}`}>
                                    Locked
                                  </span>
                                )}
                              </div>
                              <div className={`text-xs ${mutedTextClass}`}>
                                <span data-testid="cart-item-variant-label">
                                {x.variantName} • {x.category}
                                </span>
                              </div>
                              <span
                                className={
                                  x.shopifyVariantId && x.shopifyAvailable
                                    ? "mt-2 inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700"
                                    : "mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                                }
                              >
                                {x.shopifyVariantId && x.shopifyAvailable ? "Checkout here" : "Needs Shopify review"}
                              </span>
                              <label className={`mt-2 flex items-center gap-2 text-xs ${isDesignerTheme ? "text-neutral-300" : "text-neutral-600"}`}>
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
                              <div className={`text-sm font-semibold ${textClass}`}>${x.linePrice}</div>
                              <div className={`text-[11px] ${mutedTextClass}`}>
                                {x.isBundleLine ? (
                                  <>
                                    Set price
                                    {x.compareAtPrice ? (
                                      <span className="ml-1 line-through">${x.compareAtPrice}</span>
                                    ) : null}
                                  </>
                                ) : (
                                  <>${x.unitPrice} ea</>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between">
                            {x.isBundleLine ? (
                              <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isDesignerTheme ? "bg-white/10 text-neutral-200" : "bg-emerald-50 text-emerald-700"}`}>
                                Set includes {x.qty}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  className={isDesignerTheme ? "h-7 w-7 rounded-lg border border-white/10 text-sm text-neutral-200" : "h-7 w-7 rounded-lg border border-neutral-200 text-sm"}
                                  onClick={() => onSetQty(x.instanceId, Math.max(1, x.qty - 1))}
                                  data-testid="cart-quantity-decrease"
                                >
                                  -
                                </button>
                                <div className={`w-8 text-center text-sm ${textClass}`} data-testid="cart-quantity">{x.qty}</div>
                                <button
                                  className={isDesignerTheme ? "h-7 w-7 rounded-lg border border-white/10 text-sm text-neutral-200" : "h-7 w-7 rounded-lg border border-neutral-200 text-sm"}
                                  onClick={() => onSetQty(x.instanceId, Math.min(99, x.qty + 1))}
                                  data-testid="cart-quantity-increase"
                                >
                                  +
                                </button>
                              </div>
                            )}

                            <button
                              className="rounded-lg px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
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
                  <div className={isDesignerTheme ? "rounded-2xl border border-white/10 p-4 text-sm text-neutral-300" : "rounded-2xl border border-neutral-200 p-4 text-sm text-neutral-600"}>
                    No external retailer items in the cart right now.
                  </div>
                ) : (
                  groups.map((g) => (
                    <div key={g.retailer} className={groupClass}>
                      <div className={groupHeaderClass}>
                        <div>
                          <div className={`text-sm font-semibold ${textClass}`}>{g.retailer}</div>
                          <div className={`text-xs ${mutedTextClass}`}>
                            {g.lines.length} items • {g.buyableCount} included • Subtotal ${g.subtotal.toFixed(0)}
                          </div>
                        </div>

                        <button
                          className={`rounded-lg px-3 py-1 text-xs font-semibold text-white ${
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

                      <ul className={isDesignerTheme ? "divide-y divide-white/10" : "divide-y divide-neutral-100"}>
                        {g.lines.map((x) => (
                          <li key={x.instanceId} className="p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className={`truncate text-sm font-semibold ${textClass}`}>
                                  {x.name}
                                  {x.locked && (
                                    <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] ${isDesignerTheme ? "bg-white/10 text-neutral-300" : "bg-neutral-100 text-neutral-500"}`}>
                                      Locked
                                    </span>
                                  )}
                                </div>
                                <div className={`text-xs ${mutedTextClass}`}>
                                  <span data-testid="cart-item-variant-label">
                                  {x.variantName} • {x.category}
                                  </span>
                                </div>
                                <span
                                  className={
                                    x.buyUrl
                                      ? "mt-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700"
                                      : "mt-2 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800"
                                  }
                                >
                                  {x.buyUrl ? "Retailer link ready" : "Needs retailer link"}
                                </span>

                                <label className={`mt-2 flex items-center gap-2 text-xs ${isDesignerTheme ? "text-neutral-300" : "text-neutral-600"}`}>
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
                                  <div className={isDesignerTheme ? "mt-1 text-xs text-amber-100" : "mt-1 text-xs text-amber-700"}>
                                    Add a retailer URL before sharing this as checkout-ready.
                                  </div>
                                )}
                              </div>

                              <div className="text-right">
                                <div className={`text-sm font-semibold ${textClass}`}>${x.linePrice}</div>
                                <div className={`text-[11px] ${mutedTextClass}`}>
                                  {x.isBundleLine ? (
                                    <>
                                      Set price
                                      {x.compareAtPrice ? (
                                        <span className="ml-1 line-through">${x.compareAtPrice}</span>
                                      ) : null}
                                    </>
                                  ) : (
                                    <>${x.unitPrice} ea</>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {x.isBundleLine ? (
                                  <div className={`rounded-full px-2.5 py-1 text-xs font-semibold ${isDesignerTheme ? "bg-white/10 text-neutral-200" : "bg-emerald-50 text-emerald-700"}`}>
                                    Set includes {x.qty}
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      className={isDesignerTheme ? "h-7 w-7 rounded-lg border border-white/10 text-sm text-neutral-200" : "h-7 w-7 rounded-lg border border-neutral-200 text-sm"}
                                      onClick={() => onSetQty(x.instanceId, Math.max(1, x.qty - 1))}
                                    >
                                      -
                                    </button>
                                    <div className={`w-8 text-center text-sm ${textClass}`}>{x.qty}</div>
                                    <button
                                      className={isDesignerTheme ? "h-7 w-7 rounded-lg border border-white/10 text-sm text-neutral-200" : "h-7 w-7 rounded-lg border border-neutral-200 text-sm"}
                                      onClick={() => onSetQty(x.instanceId, Math.min(99, x.qty + 1))}
                                    >
                                      +
                                    </button>
                                  </>
                                )}

                                <button
                                  className={`ml-2 rounded-lg px-3 py-1 text-xs ${
                                    x.buyUrl
                                      ? "bg-green-600 text-white"
                                      : "bg-neutral-200 text-neutral-600"
                                  }`}
                                  disabled={!x.buyUrl || busy}
                                  onClick={() => doBuyLines([x])}
                                >
                                  {x.buyUrl ? "Open" : "Review"}
                                </button>
                              </div>

                              <button
                                className="rounded-lg px-2 py-1 text-xs text-red-600 transition hover:bg-red-50"
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

          <div className={`mt-2 text-[11px] ${mutedTextClass}`}>
            External retailer links open separately so customers can review each item before buying.
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
                            {x.retailer} • {x.isBundleLine ? `set of ${x.qty}` : `qty ${x.qty}`}
                          </div>
                        </div>
                        <div className="text-xs text-neutral-500">
                          {x.linkOpenCount} tab{x.linkOpenCount === 1 ? "" : "s"}
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
