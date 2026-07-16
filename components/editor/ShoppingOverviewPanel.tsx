"use client";

import LazyImage from "@/components/common/LazyImage";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type {
  ActiveRoomShoppingItem,
  ShoppingHomeSummary,
  ShoppingRoomSummary,
} from "@/lib/room-shopping";
import {
  buildShoppingReplacementSuggestions,
  type ShoppingReplacementSuggestion,
} from "@/lib/shopping-replacements";
import {
  getShoppingReadinessBadges,
  getShoppingReadinessFlags,
  matchesShoppingReadinessFilter,
  summarizeShoppingReadinessItems,
  type ShoppingReadinessBadge,
  type ShoppingReadinessFilter,
} from "@/lib/shopping-readiness";

export type ShoppingOverviewPanelProps = {
  dark?: boolean;
  activeRoom: ShoppingRoomSummary | null;
  activeRoomItems?: ActiveRoomShoppingItem[];
  catalogItems?: CatalogItemSchema[];
  rooms: ShoppingRoomSummary[];
  wholeHome: ShoppingHomeSummary;
  activeFilter?: ShoppingReadinessFilter;
  onSelectRoom: (roomId: string) => void;
  onGoFurnish: () => void;
  onAddActiveRoomCartReadyItems?: () => void;
  onSetItemInclude?: (instanceId: string, includeInCheckout: boolean) => void;
  onSwapShoppingItem?: (
    instanceId: string,
    replacement: Pick<ShoppingReplacementSuggestion, "productId" | "variantId" | "purchaseOptionId">
  ) => void;
  onPreviewReplacement?: (
    productId: string,
    variantId: string,
    purchaseOptionId?: string
  ) => void;
  onFilterChange?: (filter: ShoppingReadinessFilter) => void;
};

function formatMoney(value: number) {
  return `$${Math.round(value)}`;
}

function sumLinePrices(items: ActiveRoomShoppingItem[]) {
  return items.reduce((sum, item) => sum + item.linePrice, 0);
}

export default function ShoppingOverviewPanel({
  dark = false,
  activeRoom,
  activeRoomItems = [],
  catalogItems = [],
  rooms,
  wholeHome,
  activeFilter = "all",
  onSelectRoom,
  onGoFurnish,
  onAddActiveRoomCartReadyItems,
  onSetItemInclude,
  onSwapShoppingItem,
  onPreviewReplacement,
  onFilterChange,
}: ShoppingOverviewPanelProps) {
  const panelClass = dark
    ? "designer-dock rounded-2xl p-4"
    : "rounded-2xl border border-neutral-200 bg-white p-4 shadow";
  const mutedClass = dark ? "text-neutral-400" : "text-neutral-500";
  const cardClass = dark
    ? "designer-recessed rounded-xl p-3"
    : "rounded-xl border border-neutral-200 bg-neutral-50 p-3";
  const metricClass = dark ? "designer-raised rounded-lg p-2" : "rounded-lg bg-white p-2";
  const primaryButtonClass = dark
    ? "designer-control-active rounded-xl border px-3 py-2 text-sm font-semibold transition"
    : "rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-neutral-800";
  const readyRooms = rooms.filter((room) => room.itemCount > 0 && room.needsReviewCount === 0);
  const reviewRooms = rooms.filter((room) => room.needsReviewCount > 0);
  const emptyRooms = rooms.filter((room) => room.itemCount === 0);
  const activeRoomCartReadyItems = activeRoomItems.filter(
    (item) => item.commerceMode === "shopify" && item.hasValidCommerce
  );
  const activeRoomCartReadyIncludedCount = activeRoomCartReadyItems.filter(
    (item) => item.includeInCheckout
  ).length;
  const activeRoomRetailerLinkCount = activeRoomItems.filter(
    (item) => item.commerceMode === "affiliate" && item.hasValidCommerce
  ).length;
  const activeRoomMissingCommerceCount = activeRoomItems.filter((item) => !item.hasValidCommerce).length;
  const activeRoomCheckoutReadyItems = activeRoomCartReadyItems.filter((item) => item.includeInCheckout);
  const activeRoomRetailerLinkItems = activeRoomItems.filter(
    (item) => item.commerceMode === "affiliate" && item.hasValidCommerce
  );
  const activeRoomNeedsReviewItems = activeRoomItems.filter((item) => !item.hasValidCommerce);
  const shoppingReadiness = summarizeShoppingReadinessItems(activeRoomItems);
  const filteredActiveRoomItems = activeRoomItems.filter((item) =>
    matchesShoppingReadinessFilter(item, activeFilter)
  );
  const filterOptions: Array<{ id: ShoppingReadinessFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: activeRoomItems.length },
    { id: "missing-link", label: "Missing link", count: shoppingReadiness.missingCheckoutLinkCount },
    { id: "missing-price", label: "Missing price", count: shoppingReadiness.missingPriceCount },
    { id: "not-in-cart", label: "Not in cart", count: shoppingReadiness.notInCartCount },
    {
      id: "ready",
      label: "Ready",
      count: activeRoomItems.reduce(
        (sum, item) => sum + (getShoppingReadinessFlags(item).ready ? item.quantity : 0),
        0
      ),
    },
  ];
  const checkoutReadySpend = sumLinePrices(activeRoomCheckoutReadyItems);
  const retailerLinkSpend = sumLinePrices(activeRoomRetailerLinkItems);
  const needsReviewSpend = sumLinePrices(activeRoomNeedsReviewItems);
  const activeRoomReadinessLabel =
    activeRoomItems.length === 0
      ? "Not started"
      : activeRoomNeedsReviewItems.length > 0
        ? "Needs review"
        : activeRoomCheckoutReadyItems.length + activeRoomRetailerLinkItems.length === activeRoomItems.length
          ? "Ready to shop"
          : "Cart review";
  const activeRoomReadinessDetail =
    activeRoomItems.length === 0
      ? "Add catalog products to create a room shopping list."
      : activeRoomNeedsReviewItems.length > 0
        ? "Fix missing commerce mappings before sending this room to checkout."
        : activeRoomRetailerLinkItems.length > 0
          ? "Cart-ready items can be added now; retailer-link items open externally."
          : "All valid checkout items can be included in the cart.";
  const cartReadyActionDisabled =
    activeRoomCartReadyItems.length === 0 ||
    activeRoomCartReadyIncludedCount === activeRoomCartReadyItems.length;
  const cartReadyActionLabel =
    activeRoomCartReadyItems.length === 0
      ? "No cart-ready items"
      : activeRoomCartReadyIncludedCount === activeRoomCartReadyItems.length
        ? "Cart-ready added"
        : "Add all cart-ready";
  const getCommercePillClass = (item: ActiveRoomShoppingItem) => {
    if (!item.hasValidCommerce) {
      return dark ? "bg-amber-500/10 text-amber-100" : "bg-amber-50 text-amber-800";
    }
    if (item.commerceMode === "shopify") {
      return item.includeInCheckout
        ? dark ? "bg-emerald-500/10 text-emerald-100" : "bg-emerald-50 text-emerald-700"
        : dark ? "bg-white/10 text-neutral-300" : "bg-neutral-100 text-neutral-600";
    }
    return dark ? "bg-sky-500/10 text-sky-100" : "bg-sky-50 text-sky-700";
  };
  const getReadinessBadgeClass = (badge: ShoppingReadinessBadge) => {
    if (badge.tone === "success") {
      return dark ? "bg-emerald-500/10 text-emerald-100" : "bg-emerald-50 text-emerald-700";
    }
    if (badge.tone === "warning") {
      return dark ? "bg-amber-500/10 text-amber-100" : "bg-amber-50 text-amber-800";
    }
    return dark ? "bg-white/10 text-neutral-300" : "bg-neutral-100 text-neutral-600";
  };
  const getReplacementSuggestions = (item: ActiveRoomShoppingItem) =>
    buildShoppingReplacementSuggestions({
      item,
      catalogItems,
      roomType: activeRoom?.roomType,
      limit: 3,
    });
  const renderRoomButton = (room: ShoppingRoomSummary) => (
    <button
      key={room.roomId}
      type="button"
      onClick={() => onSelectRoom(room.roomId)}
      className={
        dark
          ? `w-full rounded-xl border px-3 py-2 text-left ${room.isActive ? "designer-status-ready" : "designer-control"}`
          : `w-full rounded-xl border px-3 py-2 text-left ${room.isActive ? "border-emerald-300 bg-emerald-50" : "border-neutral-200 bg-white"}`
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className={dark ? "truncate text-sm font-semibold text-neutral-100" : "truncate text-sm font-semibold text-neutral-900"}>
            {room.roomName}
          </div>
          <div className={`truncate text-xs ${mutedClass}`}>
            {room.previewNames.length ? room.previewNames.join(", ") : "No furniture yet"}
          </div>
        </div>
        <div className={dark ? "shrink-0 text-right text-xs text-neutral-300" : "shrink-0 text-right text-xs text-neutral-600"}>
          <div>{room.itemCount} item{room.itemCount === 1 ? "" : "s"}</div>
          <div>{formatMoney(room.subtotal)}</div>
        </div>
      </div>
    </button>
  );
  const checkoutReadinessCard = (
    <div
      className={dark ? "designer-raised mt-3 rounded-xl p-3" : "mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3"}
      data-testid="shopping-checkout-readiness"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
            Checkout readiness
          </div>
          <div className={`mt-1 text-[11px] ${mutedClass}`}>
            {activeRoomReadinessDetail}
          </div>
        </div>
        <span
          className={
            activeRoomNeedsReviewItems.length > 0
              ? dark
                ? "shrink-0 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-100"
                : "shrink-0 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800"
              : dark
                ? "shrink-0 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-100"
                : "shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"
          }
        >
          {activeRoomReadinessLabel}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className={dark ? "designer-recessed rounded-lg p-2" : "rounded-lg bg-white p-2"}>
          <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
            {formatMoney(checkoutReadySpend)}
          </div>
          <div className={`text-[10px] ${mutedClass}`}>Cart-ready spend</div>
        </div>
        <div className={dark ? "designer-recessed rounded-lg p-2" : "rounded-lg bg-white p-2"}>
          <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
            {formatMoney(retailerLinkSpend)}
          </div>
          <div className={`text-[10px] ${mutedClass}`}>Retailer-link spend</div>
        </div>
        <div className={dark ? "designer-recessed rounded-lg p-2" : "rounded-lg bg-white p-2"}>
          <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
            {formatMoney(needsReviewSpend)}
          </div>
          <div className={`text-[10px] ${mutedClass}`}>Needs review</div>
        </div>
      </div>
    </div>
  );

  return (
    <section className={panelClass} data-testid="shopping-overview-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
            Shopping overview
          </div>
          <div className={`mt-1 text-xs ${mutedClass}`}>
            Room-aware list for placed purchasable furniture.
          </div>
        </div>
        {wholeHome.itemCount > 0 && (
          <div className={dark ? "text-right text-sm font-semibold text-neutral-100" : "text-right text-sm font-semibold text-neutral-900"}>
            {formatMoney(wholeHome.subtotal)}
          </div>
        )}
      </div>
      {checkoutReadinessCard}

      {wholeHome.itemCount === 0 ? (
        <div className={dark ? "mt-3 rounded-xl border border-white/10 p-3 text-sm text-neutral-300" : "mt-3 rounded-xl border border-neutral-200 p-3 text-sm text-neutral-600"}>
          <div className={dark ? "font-semibold text-neutral-100" : "font-semibold text-neutral-900"}>
            No furniture in the shopping list yet
          </div>
          <div className={`mt-1 text-xs ${mutedClass}`}>
            Add real catalog items to a room first, then this panel becomes your bill of materials.
          </div>
          <button type="button" className={`mt-3 ${primaryButtonClass}`} onClick={onGoFurnish}>
            Add furniture
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <div className={cardClass}>
            <div className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
              Current room
            </div>
            <div className={dark ? "mt-1 text-sm font-semibold text-neutral-100" : "mt-1 text-sm font-semibold text-neutral-900"}>
              {activeRoom?.roomName ?? "Room"}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-center">
              <div className={metricClass}>
                <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                  {activeRoom?.itemCount ?? 0}
                </div>
                <div className={`text-[11px] ${mutedClass}`}>Items</div>
              </div>
              <div className={metricClass}>
                <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                  {activeRoom?.shoppableCount ?? 0}
                </div>
                <div className={`text-[11px] ${mutedClass}`}>Shoppable</div>
              </div>
              <div className={metricClass}>
                <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                  {formatMoney(activeRoom?.subtotal ?? 0)}
                </div>
                <div className={`text-[11px] ${mutedClass}`}>Room total</div>
              </div>
            </div>
            <div className={dark ? "designer-recessed mt-3 rounded-xl p-3" : "mt-3 rounded-xl border border-neutral-200 bg-white p-3"}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
                    Room bill of materials
                  </div>
                  <div className={`mt-1 text-[11px] ${mutedClass}`}>
                    {activeRoomCartReadyItems.length} cart-ready · {activeRoomRetailerLinkCount} retailer link{activeRoomRetailerLinkCount === 1 ? "" : "s"} · {activeRoomMissingCommerceCount} warning{activeRoomMissingCommerceCount === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  data-testid="shopping-add-cart-ready-items"
                  onClick={onAddActiveRoomCartReadyItems}
                  disabled={cartReadyActionDisabled || !onAddActiveRoomCartReadyItems}
                  className={
                    dark
                      ? "shrink-0 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                      : "shrink-0 rounded-lg bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  }
                >
                  {cartReadyActionLabel}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5" data-testid="shopping-readiness-filters">
                {filterOptions.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    data-testid={`shopping-filter-${filter.id}`}
                    aria-pressed={activeFilter === filter.id}
                    onClick={() => onFilterChange?.(filter.id)}
                    className={
                      activeFilter === filter.id
                        ? dark
                          ? "rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-950"
                          : "rounded-full bg-neutral-950 px-2.5 py-1 text-[10px] font-semibold text-white"
                        : dark
                          ? "rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-semibold text-neutral-300 hover:bg-white/15"
                          : "rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-600 hover:bg-neutral-100"
                    }
                  >
                    {filter.label}
                    <span className="ml-1 opacity-70">{filter.count}</span>
                  </button>
                ))}
              </div>
              {activeRoomItems.length > 0 ? (
                <div className="mt-3 space-y-2" data-testid="shopping-room-bom-list">
                  {filteredActiveRoomItems.length > 0 ? (
                    filteredActiveRoomItems.map((item) => {
                      const flags = getShoppingReadinessFlags(item);
                      const badges = getShoppingReadinessBadges(item);
                      const replacementSuggestions =
                        flags.missingLink || flags.missingPrice ? getReplacementSuggestions(item) : [];
                      return (
                        <div
                          key={item.instanceId}
                          data-testid="shopping-room-bom-item"
                          className={dark ? "designer-raised rounded-xl p-2.5" : "rounded-xl border border-neutral-200 bg-neutral-50 p-2.5"}
                        >
                          <div className="flex gap-2.5">
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-white">
                              {item.imageUrl ? (
                                <LazyImage
                                  src={item.imageUrl}
                                  fallbackSrc={item.fallbackImageUrl ?? undefined}
                                  alt={item.title}
                                  className="h-full w-full"
                                  imageClassName="object-contain object-center"
                                />
                              ) : (
                                <div className={dark ? "flex h-full w-full items-center justify-center text-[10px] text-neutral-500" : "flex h-full w-full items-center justify-center text-[10px] text-neutral-400"}>
                                  No image
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className={dark ? "truncate text-xs font-semibold text-neutral-100" : "truncate text-xs font-semibold text-neutral-900"}>
                                {item.title}
                              </div>
                              <div className={`mt-0.5 truncate text-[11px] ${mutedClass}`}>
                                {item.variantLabel}
                                {item.purchaseOptionLabel ? ` · ${item.purchaseOptionLabel}` : ""}
                                {item.isBundle ? ` · Set includes ${item.quantity}` : ` · Qty ${item.quantity}`}
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {badges.map((badge) => (
                                  <span
                                    key={badge.id}
                                    data-testid={`shopping-readiness-badge-${badge.id}`}
                                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getReadinessBadgeClass(badge)}`}
                                  >
                                    {badge.label}
                                  </span>
                                ))}
                                {item.isBundle ? (
                                  <span className={dark ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-100" : "rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"}>
                                    Official set
                                  </span>
                                ) : null}
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${getCommercePillClass(item)}`}>
                                  {item.retailerStatusLabel}
                                </span>
                              </div>
                              {item.warningLabel ? (
                                <div className={dark ? "mt-1 text-[11px] text-amber-100" : "mt-1 text-[11px] text-amber-700"}>
                                  {item.warningLabel}
                                </div>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {flags.notInCart && onSetItemInclude ? (
                                  <button
                                    type="button"
                                    data-testid="shopping-item-add-to-cart"
                                    className={dark ? "rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-neutral-950" : "rounded-lg bg-neutral-950 px-2 py-1 text-[11px] font-semibold text-white"}
                                    onClick={() => onSetItemInclude(item.instanceId, true)}
                                  >
                                    Add to cart
                                  </button>
                                ) : null}
                                {item.commerceMode === "shopify" && item.includeInCheckout && onSetItemInclude ? (
                                  <button
                                    type="button"
                                    data-testid="shopping-item-exclude"
                                    className={dark ? "rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold text-neutral-200" : "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700"}
                                    onClick={() => onSetItemInclude(item.instanceId, false)}
                                  >
                                    Exclude from shopping
                                  </button>
                                ) : null}
                                {(flags.missingLink || flags.missingPrice) ? (
                                  <button
                                    type="button"
                                    data-testid="shopping-item-find-shoppable"
                                    className={dark ? "rounded-lg border border-white/15 px-2 py-1 text-[11px] font-semibold text-neutral-200" : "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700"}
                                    onClick={onGoFurnish}
                                  >
                                    Replace with shoppable
                                  </button>
                                ) : null}
                              </div>
                              {replacementSuggestions.length > 0 ? (
                                <div
                                  data-testid="shopping-item-replacements"
                                  className={dark ? "designer-recessed mt-2 rounded-lg p-2" : "mt-2 rounded-lg border border-neutral-200 bg-white p-2"}
                                >
                                  <div className={dark ? "text-[11px] font-semibold text-neutral-200" : "text-[11px] font-semibold text-neutral-800"}>
                                    Shoppable replacements
                                  </div>
                                  <div className="mt-2 space-y-1.5">
                                    {replacementSuggestions.map((replacement) => (
                                      <div
                                        key={`${replacement.productId}:${replacement.variantId}:${replacement.purchaseOptionId ?? "default"}`}
                                        data-testid="shopping-item-replacement"
                                        className={dark ? "designer-raised rounded-lg p-2" : "rounded-lg bg-neutral-50 p-2"}
                                      >
                                        <div className="flex items-start gap-2">
                                          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-md border border-neutral-200 bg-white">
                                            {replacement.imageUrl ? (
                                              <LazyImage
                                                src={replacement.imageUrl}
                                                alt={replacement.title}
                                                className="h-full w-full"
                                                imageClassName="object-contain object-center"
                                              />
                                            ) : (
                                              <div className="flex h-full w-full items-center justify-center text-[9px] text-neutral-400">
                                                No image
                                              </div>
                                            )}
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <div className={dark ? "truncate text-[11px] font-semibold text-neutral-100" : "truncate text-[11px] font-semibold text-neutral-900"}>
                                              {replacement.title}
                                            </div>
                                            <div className={`truncate text-[10px] ${mutedClass}`}>
                                              {replacement.variantLabel} · {replacement.priceLabel}
                                            </div>
                                            <div className={dark ? "mt-0.5 text-[10px] text-emerald-100" : "mt-0.5 text-[10px] text-emerald-700"}>
                                              {replacement.reason}
                                            </div>
                                          </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {onSwapShoppingItem ? (
                                            <button
                                              type="button"
                                              data-testid="shopping-replacement-swap"
                                              className={dark ? "rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-neutral-950" : "rounded-lg bg-neutral-950 px-2 py-1 text-[10px] font-semibold text-white"}
                                              onClick={() => onSwapShoppingItem(item.instanceId, replacement)}
                                            >
                                              Swap in
                                            </button>
                                          ) : null}
                                          {onPreviewReplacement ? (
                                            <button
                                              type="button"
                                              data-testid="shopping-replacement-preview"
                                              className={dark ? "rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold text-neutral-200" : "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-neutral-700"}
                                              onClick={() =>
                                                onPreviewReplacement(
                                                  replacement.productId,
                                                  replacement.variantId,
                                                  replacement.purchaseOptionId
                                                )
                                              }
                                            >
                                              Preview placement
                                            </button>
                                          ) : null}
                                          {replacement.retailerUrl ? (
                                            <a
                                              href={replacement.retailerUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              data-testid="shopping-replacement-open-product"
                                              className={dark ? "rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold text-sky-200" : "rounded-lg border border-neutral-200 bg-white px-2 py-1 text-[10px] font-semibold text-sky-700"}
                                            >
                                              Open product
                                            </a>
                                          ) : null}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : flags.missingLink || flags.missingPrice ? (
                                <div className={dark ? "designer-recessed mt-2 rounded-lg px-2 py-1.5 text-[11px] text-neutral-400" : "mt-2 rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-[11px] text-neutral-500"}>
                                  No same-category shoppable replacements found yet.
                                </div>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className={dark ? "text-xs font-semibold text-neutral-100" : "text-xs font-semibold text-neutral-900"}>
                                {item.linePrice > 0 ? formatMoney(item.linePrice) : item.priceLabel}
                              </div>
                              {item.compareAtPrice ? (
                                <div className={dark ? "text-[10px] text-neutral-500 line-through" : "text-[10px] text-neutral-400 line-through"}>
                                  {formatMoney(item.compareAtPrice)}
                                </div>
                              ) : null}
                              {item.savings ? (
                                <div className={dark ? "text-[10px] font-semibold text-emerald-200" : "text-[10px] font-semibold text-emerald-700"}>
                                  Save {formatMoney(item.savings)}
                                </div>
                              ) : null}
                              {item.retailerUrl ? (
                                <a
                                  href={item.retailerUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Open retailer page for ${item.title}`}
                                  className={dark ? "mt-1 block text-[11px] font-semibold text-sky-200" : "mt-1 block text-[11px] font-semibold text-sky-700"}
                                >
                                  Open product
                                </a>
                              ) : !item.hasValidCommerce ? (
                                <div className={dark ? "mt-1 text-[11px] font-semibold text-amber-100" : "mt-1 text-[11px] font-semibold text-amber-700"}>
                                  Review item
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className={`rounded-lg px-3 py-2 text-xs ${dark ? "designer-recessed text-neutral-400" : "bg-neutral-50 text-neutral-500"}`}>
                      No items match this shopping-readiness filter.
                    </div>
                  )}
                </div>
              ) : (
                <div className={`mt-3 rounded-lg px-3 py-2 text-xs ${dark ? "designer-recessed text-neutral-400" : "bg-neutral-50 text-neutral-500"}`}>
                  Add furniture to this room to build its shopping list.
                </div>
              )}
            </div>
          </div>

          <div className={dark ? "rounded-xl border border-white/10 p-3" : "rounded-xl border border-neutral-200 p-3"}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Whole home
                </div>
                <div className={dark ? "mt-1 text-sm text-neutral-200" : "mt-1 text-sm text-neutral-700"}>
                  {wholeHome.itemCount} items across {rooms.length} room{rooms.length === 1 ? "" : "s"}
                </div>
              </div>
              <div className={dark ? "text-right text-sm font-semibold text-neutral-100" : "text-right text-sm font-semibold text-neutral-900"}>
                {formatMoney(wholeHome.subtotal)}
              </div>
            </div>
            {wholeHome.needsReviewCount > 0 && (
              <div className={dark ? "mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-xs text-amber-100" : "mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800"}>
                {wholeHome.needsReviewCount} item{wholeHome.needsReviewCount === 1 ? "" : "s"} need commerce review before checkout.
              </div>
            )}
          </div>

          <div className="space-y-3" data-testid="shopping-room-list">
            {readyRooms.length > 0 && (
              <div data-testid="shopping-ready-rooms">
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Ready to buy
                </div>
                <div className="space-y-2">{readyRooms.map(renderRoomButton)}</div>
              </div>
            )}
            {reviewRooms.length > 0 && (
              <div data-testid="shopping-review-rooms">
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Needs review
                </div>
                <div className="space-y-2">{reviewRooms.map(renderRoomButton)}</div>
              </div>
            )}
            {emptyRooms.length > 0 && (
              <div data-testid="shopping-empty-rooms">
                <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${mutedClass}`}>
                  Not furnished yet
                </div>
                <div className="space-y-2">{emptyRooms.map(renderRoomButton)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
