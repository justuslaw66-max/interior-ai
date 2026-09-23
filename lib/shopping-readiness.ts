import type { ActiveRoomShoppingItem } from "@/lib/room-shopping";

export type ShoppingReadinessFilter =
  | "all"
  | "missing-link"
  | "missing-price"
  | "not-in-cart"
  | "ready";

export type ShoppingReadinessBlocker = {
  id: "missing-checkout-links" | "missing-prices" | "not-in-cart";
  filter: Exclude<ShoppingReadinessFilter, "all" | "ready">;
  label: string;
  count: number;
};

export type ShoppingReadinessBadge = {
  id: "missing-price" | "missing-link" | "not-in-cart" | "ready";
  label: string;
  tone: "warning" | "neutral" | "success";
};

export function getShoppingReadinessFlags(item: ActiveRoomShoppingItem) {
  const missingPrice = item.linePrice <= 0;
  const missingLink = !item.hasValidCommerce;
  const notInCart = item.commerceMode === "shopify" && item.hasValidCommerce && !item.includeInCheckout;
  const ready = !missingPrice && !missingLink && !notInCart;

  return {
    missingPrice,
    missingLink,
    notInCart,
    ready,
  };
}

export function getShoppingReadinessBadges(item: ActiveRoomShoppingItem): ShoppingReadinessBadge[] {
  const flags = getShoppingReadinessFlags(item);
  const badges: ShoppingReadinessBadge[] = [];

  if (flags.missingLink) {
    badges.push({ id: "missing-link", label: "Missing link", tone: "warning" });
  }
  if (flags.missingPrice) {
    badges.push({ id: "missing-price", label: "Missing price", tone: "warning" });
  }
  if (flags.notInCart) {
    badges.push({ id: "not-in-cart", label: "Not in cart", tone: "neutral" });
  }
  if (flags.ready) {
    badges.push({ id: "ready", label: "Ready", tone: "success" });
  }

  return badges;
}

export function matchesShoppingReadinessFilter(
  item: ActiveRoomShoppingItem,
  filter: ShoppingReadinessFilter
) {
  if (filter === "all") return true;
  const flags = getShoppingReadinessFlags(item);
  if (filter === "missing-link") return flags.missingLink;
  if (filter === "missing-price") return flags.missingPrice;
  if (filter === "not-in-cart") return flags.notInCart;
  return flags.ready;
}

export function summarizeShoppingReadinessItems(items: ActiveRoomShoppingItem[]) {
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const missingPriceCount = items.reduce(
    (sum, item) => sum + (getShoppingReadinessFlags(item).missingPrice ? item.quantity : 0),
    0
  );
  const missingCheckoutLinkCount = items.reduce(
    (sum, item) => sum + (getShoppingReadinessFlags(item).missingLink ? item.quantity : 0),
    0
  );
  const notInCartCount = items.reduce(
    (sum, item) => sum + (getShoppingReadinessFlags(item).notInCart ? item.quantity : 0),
    0
  );
  const ready = itemCount > 0 && missingPriceCount === 0 && missingCheckoutLinkCount === 0 && notInCartCount === 0;
  const blockers: ShoppingReadinessBlocker[] = [
    missingCheckoutLinkCount > 0
      ? {
          id: "missing-checkout-links",
          filter: "missing-link",
          label: `${missingCheckoutLinkCount} missing checkout/retailer link${missingCheckoutLinkCount === 1 ? "" : "s"}`,
          count: missingCheckoutLinkCount,
        }
      : null,
    missingPriceCount > 0
      ? {
          id: "missing-prices",
          filter: "missing-price",
          label: `${missingPriceCount} missing price${missingPriceCount === 1 ? "" : "s"}`,
          count: missingPriceCount,
        }
      : null,
    notInCartCount > 0
      ? {
          id: "not-in-cart",
          filter: "not-in-cart",
          label: `${notInCartCount} cart-ready item${notInCartCount === 1 ? "" : "s"} not in cart`,
          count: notInCartCount,
        }
      : null,
  ].filter((entry): entry is ShoppingReadinessBlocker => Boolean(entry));
  const detail =
    itemCount === 0
      ? "Add catalog items to build a checkout-ready room."
      : ready
        ? "Prices, checkout links, and cart inclusion are ready."
        : blockers.map((blocker) => blocker.label).join(" · ");

  return {
    itemCount,
    missingPriceCount,
    missingCheckoutLinkCount,
    notInCartCount,
    ready,
    blockers,
    detail,
  };
}
