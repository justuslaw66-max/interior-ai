import { track, trackProductEvent } from "@/lib/analytics";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { createCommerceEvent } from "@/lib/commerce-helpers";
import type { ShoppingListLine } from "@/lib/shopping-list";

/** Buying from the Shopping list (audit finding FU8, J's answers to Q2 and Q5 of 27 Sep). */

export const SHOPPING_BUY_LIST_DIALOG_ID = "shopping-buy-list-dialog";
/** The current step's tab, which the bar keeps; focus goes there when a Buy button has gone. */
export const SHOPPING_FALLBACK_FOCUS_ID = "editor-command-workspace-action";

export function shoppingBuyOpenerId(retailerId: string) {
  return `shopping-buy-${encodeURIComponent(retailerId)}`;
}

export function shoppingBuyListReturnFocusIds(retailerId: string) {
  return [shoppingBuyOpenerId(retailerId), SHOPPING_FALLBACK_FOCUS_ID] as const;
}

type TrackedLine = Pick<ShoppingListLine, "productId" | "variantId"> & { buyUrl: string };

/**
 * The retailer's address with this click's key and the campaign tags. If recording the click fails,
 * the bare address still opens (fail-open), as before.
 */
export async function trackedRetailerUrl(line: TrackedLine, designId: string | null | undefined) {
  try {
    const response = await fetch("/api/track/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ designId: designId ?? null, productId: line.productId, variantId: line.variantId }),
    });
    const data = await response.json().catch(() => ({}));
    const url = new URL(line.buyUrl);
    if (typeof data?.clickKey === "string" && data.clickKey) url.searchParams.set("clickKey", data.clickKey);
    url.searchParams.set("utm_source", "interior-ai");
    url.searchParams.set("utm_medium", "affiliate");
    const product = CATALOG_ITEMS[line.productId];
    if (product) track("commerce_event", createCommerceEvent("affiliate_link_clicked", product));
    return url.toString();
  } catch {
    return line.buyUrl;
  }
}

/**
 * One click opens one tab. The tab opens straight away, while the click still counts as the
 * person's, so no pop-up blocker stops it, and then goes to the tracked address. Returns false
 * when the browser blocked the tab anyway; a blocked tab records no retailer click.
 */
export async function openRetailerLine(line: ShoppingListLine, designId: string | null | undefined) {
  if (!line.buyUrl) return false;
  const tab = window.open("", "_blank");
  const category = CATALOG_ITEMS[line.productId]?.category ?? "unknown";
  if (!tab) {
    trackProductEvent("product_purchase_clicked", { source: "affiliate", category, result: "blocked" });
    return false;
  }
  tab.opener = null;
  const url = await trackedRetailerUrl({ ...line, buyUrl: line.buyUrl }, designId);
  trackProductEvent("product_purchase_clicked", { source: "affiliate", category, result: "success" });
  tab.location.href = url;
  return true;
}

export type ShopifyCheckoutResult = { ok: true; checkoutUrl: string } | { ok: false; message: string };

function checkoutFailureMessage(data: { unavailable?: Array<{ title?: string; variant?: string }> }) {
  if (!data?.unavailable?.length) return "Checkout failed. Try again in a moment.";
  const names = data.unavailable.map((entry) => `${entry.title ?? "A product"} (${entry.variant ?? "its variant"})`);
  return `Out of stock: ${names.join(", ")}.`;
}

/** Starts a Shopify checkout for the products sold here; the page then goes to Shopify. */
export async function requestShopifyCheckout(
  lines: readonly ShoppingListLine[],
  designId: string | null | undefined
): Promise<ShopifyCheckoutResult> {
  const checkoutLines = lines
    .filter((line) => line.shopifyVariantId)
    .map((line) => ({ merchandiseId: line.shopifyVariantId as string, quantity: line.addCount, productId: line.productId, variantId: line.variantId }));
  if (checkoutLines.length === 0) return { ok: false, message: "Nothing here can be checked out yet." };
  track("shopify_checkout_started", { design_id: designId ?? null, cart_items_shopify: checkoutLines.length });
  trackProductEvent("product_purchase_clicked", { source: "shopify_checkout", itemCount: checkoutLines.length, result: "success" });
  const response = await fetch("/api/shopify/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lines: checkoutLines }),
  }).catch(() => null);
  if (!response) return { ok: false, message: checkoutFailureMessage({}) };
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data?.checkoutUrl !== "string") return { ok: false, message: checkoutFailureMessage(data) };
  const url = new URL(data.checkoutUrl);
  if (designId) url.searchParams.set("designId", designId);
  return { ok: true, checkoutUrl: url.toString() };
}
