import { prisma } from "@/lib/prisma";
import ShareViewer from "@/components/ShareViewer";
import ShareTracking from "./ShareTracking";
import { ShareFooterCTA } from "@/components/ShareFooterCTA";
import SharePageActions from "@/components/SharePageActions";
import { legacyApiToSnapshot } from "@/lib/room-persistence";
import {
  buildCheckoutReadinessRows,
  buildShoppingCsvRows,
} from "@/lib/share-shopping-csv";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { buildShareExportFidelitySummary } from "@/lib/share-export-fidelity";
import { buildRoomHealthSummary } from "@/lib/room-health-summary";
import {
  resolveRoomShoppingItems,
  summarizeShoppingRooms,
  summarizeWholeHomeShopping,
  type ActiveRoomShoppingItem,
} from "@/lib/room-shopping";
import type { DesignItem, DesignSnapshot, SavedView, ZoneMin } from "@/lib/room-types";
import LazyImage from "@/components/common/LazyImage";
import ShopLink from "./export/ShopLink";
import ShoppingCsvDownload from "./export/ShoppingCsvDownload";

export const metadata = {
  robots: { index: false, follow: false },
};

type ShareShoppingPreviewItem = ActiveRoomShoppingItem & {
  roomId: string;
  roomName: string;
};

type SharePresentationViewItem = {
  id: string;
  name: string;
  roomName: string;
  floorLabel: string;
};

function formatMeters(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatCategory(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function SharePage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  const design = await prisma.design.findFirst({
    where: { shareToken, shareEnabled: true },
    select: {
      id: true,
      title: true,
      roomWidth: true,
      roomDepth: true,
      items: true,
      snapshot: true,
      zones: true,
      savedViews: true,
      style: true,
      budget: true,
    },
  });

  if (!design) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-xl border bg-white p-6">
          <div className="text-lg font-semibold">Link not available</div>
          <div className="text-sm text-neutral-600">
            This share link is disabled or invalid.
          </div>
        </div>
      </main>
    );
  }

  // Convert legacy format to v3
  const designSnapshot: DesignSnapshot = legacyApiToSnapshot({
    id: design.id,
    title: design.title,
    roomWidth: design.roomWidth,
    roomDepth: design.roomDepth,
    items: design.items as unknown as DesignItem[],
    snapshot: design.snapshot as Parameters<typeof legacyApiToSnapshot>[0]["snapshot"],
    zones: (design.zones as unknown as ZoneMin[]) || [],
    savedViews: (design.savedViews as unknown as SavedView[]) || [],
  });
  const shoppingRooms = summarizeShoppingRooms(
    designSnapshot.rooms,
    designSnapshot.activeRoomId
  );
  const shoppingRoomById = new Map(shoppingRooms.map((room) => [room.roomId, room]));
  const planOpenings = designSnapshot.floorPlan?.openings ?? [];
  const roomHealthById = new Map(
    designSnapshot.rooms.map((room) => {
      const shoppingRoom = shoppingRoomById.get(room.id);
      return [
        room.id,
        buildRoomHealthSummary({
          room,
          catalogItems: CATALOG_ITEMS,
          openings: planOpenings,
          shoppingNeedsReviewCount: shoppingRoom?.needsReviewCount ?? 0,
        }),
      ];
    })
  );
  const shoppingSummary = summarizeWholeHomeShopping(shoppingRooms);
  const shoppingPreviewItems: ShareShoppingPreviewItem[] = designSnapshot.rooms.flatMap((room) =>
    resolveRoomShoppingItems({ items: room.items }).map((item) => ({
      ...item,
      roomId: room.id,
      roomName: room.name,
    }))
  );
  const checkoutReadinessRows = buildCheckoutReadinessRows(designSnapshot.rooms);
  const shoppingCsvRows = buildShoppingCsvRows(checkoutReadinessRows);
  const checkoutReadyRows = checkoutReadinessRows.filter(
    (item) => item.hasValidCommerce && item.commerceMode === "shopify" && item.includeInCheckout
  );
  const retailerLinkRows = checkoutReadinessRows.filter(
    (item) => item.hasValidCommerce && item.commerceMode === "affiliate"
  );
  const needsReviewRows = checkoutReadinessRows.filter((item) => !item.hasValidCommerce);
  const notInCartRows = checkoutReadinessRows.filter(
    (item) => item.hasValidCommerce && item.commerceMode === "shopify" && !item.includeInCheckout
  );
  const checkoutReadyTotal = checkoutReadyRows.reduce((sum, item) => sum + item.linePrice, 0);
  const retailerLinkTotal = retailerLinkRows.reduce((sum, item) => sum + item.linePrice, 0);
  const visibleShoppingItems = [...shoppingPreviewItems]
    .sort((a, b) => {
      if (a.hasValidCommerce !== b.hasValidCommerce) return a.hasValidCommerce ? -1 : 1;
      return b.linePrice - a.linePrice;
    })
    .slice(0, 6);
  const remainingShoppingCount = Math.max(0, shoppingPreviewItems.length - visibleShoppingItems.length);
  const roomListItems = designSnapshot.rooms.map((room) => {
    const shoppingRoom = shoppingRoomById.get(room.id);
    const health = roomHealthById.get(room.id);
    const areaSqm = room.geometry.width * room.geometry.depth;
    return {
      id: room.id,
      name: room.name,
      floorLabel: room.floorLabel ?? `Floor ${room.floorLevel ?? 1}`,
      roomType: formatCategory(room.roomType),
      dimensionsLabel: `${formatMeters(room.geometry.width)} x ${formatMeters(room.geometry.depth)} m`,
      areaLabel: `${Math.round(areaSqm)} sq m`,
      itemCount: shoppingRoom?.itemCount ?? room.items.length,
      shoppableCount: shoppingRoom?.shoppableCount ?? 0,
      subtotal: shoppingRoom?.subtotal ?? 0,
      healthLabel: health?.level === "ready" ? "Ready" : health?.level === "review" ? "Review" : "Blocked",
      healthScore: health?.placementScore ?? 0,
      healthNextAction: health?.nextAction ?? "Review room readiness.",
    };
  });
  const presentationViewItems: SharePresentationViewItem[] = designSnapshot.rooms.flatMap((room) =>
    (room.savedViews ?? []).map((view, index) => ({
      id: typeof view.id === "string" && view.id ? view.id : `${room.id}-view-${index}`,
      name: typeof view.name === "string" && view.name ? view.name : `View ${index + 1}`,
      roomName: room.name,
      floorLabel: room.floorLabel ?? `Floor ${room.floorLevel ?? 1}`,
    }))
  );
  const measuredRoomCount = designSnapshot.rooms.filter(
    (room) => room.geometry.width > 0 && room.geometry.depth > 0
  ).length;
  const totalOpenings = designSnapshot.floorPlan?.openings?.length ?? 0;
  const readyShoppingCount = checkoutReadyRows.length + retailerLinkRows.length;
  const reviewShoppingCount = needsReviewRows.length + notInCartRows.length;
  const practicalChecks = [
    {
      label: "Measurements",
      value: `${measuredRoomCount} room${measuredRoomCount === 1 ? "" : "s"} measured`,
      detail:
        measuredRoomCount === designSnapshot.rooms.length
          ? "Room dimensions are ready for review."
          : `${designSnapshot.rooms.length - measuredRoomCount} room${designSnapshot.rooms.length - measuredRoomCount === 1 ? "" : "s"} still need dimensions.`,
      tone: measuredRoomCount === designSnapshot.rooms.length ? "ready" : "review",
    },
    {
      label: "Openings",
      value:
        totalOpenings > 0
          ? `${totalOpenings} opening${totalOpenings === 1 ? "" : "s"} included`
          : "No openings traced",
      detail:
        totalOpenings > 0
          ? "Doors and windows are included in the saved plan."
          : "Trace doors or windows for stronger install notes.",
      tone: totalOpenings > 0 ? "ready" : "review",
    },
    {
      label: "Shopping",
      value: `${readyShoppingCount} of ${shoppingSummary.itemCount} ready`,
      detail:
        reviewShoppingCount === 0
          ? "Every planned item has a buying path."
          : `${reviewShoppingCount} item${reviewShoppingCount === 1 ? "" : "s"} need checkout review.`,
      tone: reviewShoppingCount === 0 ? "ready" : "review",
    },
    {
      label: "Presentation",
      value: `${presentationViewItems.length} saved view${presentationViewItems.length === 1 ? "" : "s"}`,
      detail:
        presentationViewItems.length > 0
          ? "Curated camera angles are ready for walkthrough."
          : "Save a camera view in the editor for cleaner handoff.",
      tone: presentationViewItems.length > 0 ? "ready" : "info",
    },
  ];
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  const handoffFidelitySummary = buildShareExportFidelitySummary(designSnapshot, CATALOG_ITEMS);
  const qaFidelitySummary = handoffFidelitySummary;
  const handoffReady =
    handoffFidelitySummary.missingCommerceCount === 0 &&
    handoffFidelitySummary.itemCount === shoppingSummary.itemCount;

  return (
    <main className="min-h-screen bg-neutral-100">
      {qaFidelitySummary ? (
        <div
          data-testid="qa-share-snapshot-fingerprint"
          data-fingerprint={qaFidelitySummary.fingerprint}
          data-room-count={String(qaFidelitySummary.roomCount)}
          data-item-count={String(qaFidelitySummary.itemCount)}
          data-opening-count={String(qaFidelitySummary.openingCount)}
          data-saved-view-count={String(qaFidelitySummary.savedViewCount)}
          data-checkout-ready-count={String(qaFidelitySummary.checkoutReadyCount)}
          data-retailer-ready-count={String(qaFidelitySummary.retailerReadyCount)}
          data-missing-commerce-count={String(qaFidelitySummary.missingCommerceCount)}
          hidden
        />
      ) : null}
      <ShareTracking shareToken={shareToken} designId={design.id} />
      <header className="mx-auto max-w-6xl px-6 pt-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">{design.title}</h1>
            <div className="text-sm text-neutral-600">
              Read-only • {design.style ?? "Style"} • {design.budget ?? "Budget"}
            </div>
            <div className="mt-2 text-xs text-neutral-500">
              Best on desktop • Orbit to look around • No editing in share view
            </div>
            <div
              data-testid="share-handoff-id"
              className="mt-1 text-xs font-medium text-neutral-500"
            >
              Handoff ID {handoffFidelitySummary.fingerprint}
            </div>
          </div>

          <SharePageActions shareToken={shareToken} title={design.title} />
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-4">
        <div className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm sm:grid-cols-5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Rooms</div>
            <div className="mt-1 text-lg font-semibold text-neutral-950">{designSnapshot.rooms.length}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Items</div>
            <div className="mt-1 text-lg font-semibold text-neutral-950">{shoppingSummary.itemCount}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Shoppable</div>
            <div className="mt-1 text-lg font-semibold text-neutral-950">{shoppingSummary.shoppableCount}</div>
          </div>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Estimated total</div>
            <div className="mt-1 text-lg font-semibold text-neutral-950">{formatCurrency(shoppingSummary.subtotal)}</div>
          </div>
          <div data-testid="share-handoff-integrity">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Handoff</div>
            <div className={handoffReady ? "mt-1 text-lg font-semibold text-emerald-700" : "mt-1 text-lg font-semibold text-amber-700"}>
              {handoffReady ? "Ready" : "Review"}
            </div>
            <div className="mt-1 text-xs text-neutral-500">
              {handoffFidelitySummary.checkoutReadyCount + handoffFidelitySummary.retailerReadyCount} ready · {handoffFidelitySummary.missingCommerceCount} review
            </div>
          </div>
        </div>
        {shoppingRooms.length > 0 ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {shoppingRooms.map((room) => (
              <div key={room.roomId} className="min-w-[190px] rounded-lg border bg-white px-3 py-2 text-xs shadow-sm">
                <div className="font-semibold text-neutral-900">{room.roomName}</div>
                <div className="mt-1 text-neutral-500">
                  {room.itemCount} items • {formatCurrency(room.subtotal)}
                </div>
                {room.previewNames.length > 0 ? (
                  <div className="mt-1 truncate text-neutral-500">{room.previewNames.join(", ")}</div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="mx-auto max-w-6xl px-6 py-6">
        <ShareViewer initialSnapshot={designSnapshot} />
      </div>

      {presentationViewItems.length > 0 ? (
        <section className="border-t bg-white">
          <div className="mx-auto max-w-6xl px-6 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-neutral-950">Presentation Views</h2>
                <div className="mt-1 text-sm text-neutral-600">
                  Curated camera angles saved with this design.
                </div>
              </div>
              <div className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700">
                {presentationViewItems.length} view{presentationViewItems.length === 1 ? "" : "s"}
              </div>
            </div>
            <div
              className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3"
              data-testid="share-presentation-views"
            >
              {presentationViewItems.map((view) => (
                <div
                  key={`${view.roomName}-${view.id}`}
                  className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2"
                >
                  <div className="text-sm font-semibold text-neutral-950">{view.name}</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {view.roomName} • {view.floorLabel}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Room List</h2>
              <div className="mt-1 text-sm text-neutral-600">
                Dimensions, room types, and shopping totals from the saved design.
              </div>
            </div>
            <a
              href={`/share/${shareToken}/export`}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
            >
              Open export pack
            </a>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200" data-testid="share-room-list">
            <table className="min-w-full divide-y divide-neutral-200 text-sm">
              <thead className="bg-neutral-50 text-left text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Size</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2">Health</th>
                  <th className="px-3 py-2 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 bg-white">
                {roomListItems.map((room) => (
                  <tr key={room.id}>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-neutral-950">{room.name}</div>
                      <div className="text-xs text-neutral-500">{room.floorLabel}</div>
                    </td>
                    <td className="px-3 py-3 text-neutral-700">{room.roomType}</td>
                    <td className="px-3 py-3 text-neutral-700">
                      <div>{room.dimensionsLabel}</div>
                      <div className="text-xs text-neutral-500">{room.areaLabel}</div>
                    </td>
                    <td className="px-3 py-3 text-neutral-700">
                      {room.itemCount} item{room.itemCount === 1 ? "" : "s"}
                      <div className="text-xs text-neutral-500">
                        {room.shoppableCount} shoppable
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div
                        data-testid="share-room-health"
                        className={
                          room.healthLabel === "Ready"
                            ? "font-semibold text-emerald-700"
                            : room.healthLabel === "Review"
                              ? "font-semibold text-amber-700"
                              : "font-semibold text-red-700"
                        }
                      >
                        {room.healthLabel} {room.healthScore}
                      </div>
                      <div className="max-w-52 truncate text-xs text-neutral-500" title={room.healthNextAction}>
                        {room.healthNextAction}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-neutral-950">
                      {formatCurrency(room.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Checkout Readiness</h2>
              <div className="mt-1 text-sm text-neutral-600">
                Clear buying paths for cart-ready products, retailer links, and items that need review.
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold text-neutral-950">
                {checkoutReadyRows.length + retailerLinkRows.length} ready
              </div>
              <div className="text-xs text-neutral-500">
                {needsReviewRows.length + notInCartRows.length} to review
              </div>
            </div>
          </div>

          <div
            className="mt-4 grid gap-3 md:grid-cols-4"
            data-testid="share-checkout-readiness"
          >
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                Cart-ready
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-950">
                {checkoutReadyRows.length}
              </div>
              <div className="text-xs text-neutral-600">
                {formatCurrency(checkoutReadyTotal)}
              </div>
            </div>
            <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                Retailer links
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-950">
                {retailerLinkRows.length}
              </div>
              <div className="text-xs text-neutral-600">
                {formatCurrency(retailerLinkTotal)}
              </div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                Needs review
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-950">
                {needsReviewRows.length}
              </div>
              <div className="text-xs text-neutral-600">
                Missing commerce mapping
              </div>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                Not in cart
              </div>
              <div className="mt-1 text-lg font-semibold text-neutral-950">
                {notInCartRows.length}
              </div>
              <div className="text-xs text-neutral-600">
                Valid but excluded
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Practical Checks</h2>
              <div className="mt-1 text-sm text-neutral-600">
                Quick handoff status for measurements, openings, shopping, and presentation review.
              </div>
            </div>
            <a
              href={`/share/${shareToken}/export`}
              className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
            >
              Open full checklist
            </a>
          </div>

          <div
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
            data-testid="share-practical-checks"
          >
            {practicalChecks.map((check) => (
              <div
                key={check.label}
                className={
                  check.tone === "ready"
                    ? "rounded-xl border border-emerald-100 bg-emerald-50 p-3"
                    : check.tone === "review"
                      ? "rounded-xl border border-amber-100 bg-amber-50 p-3"
                      : "rounded-xl border border-sky-100 bg-sky-50 p-3"
                }
              >
                <div
                  className={
                    check.tone === "ready"
                      ? "text-[11px] font-semibold uppercase tracking-wide text-emerald-700"
                      : check.tone === "review"
                        ? "text-[11px] font-semibold uppercase tracking-wide text-amber-700"
                        : "text-[11px] font-semibold uppercase tracking-wide text-sky-700"
                  }
                >
                  {check.label}
                </div>
                <div className="mt-1 text-base font-semibold text-neutral-950">{check.value}</div>
                <div className="mt-1 text-xs text-neutral-600">{check.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="shopping-preview" className="scroll-mt-6 border-y bg-white">
        <div className="mx-auto max-w-6xl px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-neutral-950">Shopping Preview</h2>
              <div className="mt-1 text-sm text-neutral-600">
                {shoppingSummary.itemCount > 0
                  ? `${shoppingSummary.shoppableCount} shoppable of ${shoppingSummary.itemCount} planned item${shoppingSummary.itemCount === 1 ? "" : "s"}`
                  : "No products added to this shared design yet"}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="font-semibold text-neutral-950">{formatCurrency(shoppingSummary.subtotal)}</div>
              <div className="text-xs text-neutral-500">Estimated total</div>
            </div>
          </div>

          {visibleShoppingItems.length > 0 ? (
            <>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {visibleShoppingItems.map((item) => (
                  <div
                    key={`${item.roomId}-${item.instanceId}`}
                    className="flex min-w-0 gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                  >
                    <LazyImage
                      src={item.imageUrl ?? undefined}
                      fallbackSrc={item.fallbackImageUrl ?? undefined}
                      alt={item.title}
                      className="h-20 w-20 shrink-0 rounded-md"
                      imageClassName="object-contain object-center"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-neutral-950">{item.title}</div>
                          <div className="mt-0.5 truncate text-xs text-neutral-500">{item.variantLabel}</div>
                          <div className="mt-1 text-xs text-neutral-500">
                            {item.roomName} • {formatCategory(item.category)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-semibold text-neutral-950">
                          {formatCurrency(item.linePrice)}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full bg-white px-2 py-1 text-neutral-700 ring-1 ring-neutral-200">
                            Qty {item.quantity}
                          </span>
                          <span
                            className={
                              item.hasValidCommerce
                                ? "rounded-full bg-emerald-50 px-2 py-1 text-emerald-700 ring-1 ring-emerald-100"
                                : "rounded-full bg-amber-50 px-2 py-1 text-amber-700 ring-1 ring-amber-100"
                            }
                          >
                            {item.cartStatusLabel}
                          </span>
                        </div>
                        {item.retailerUrl ? (
                          <ShopLink
                            url={item.retailerUrl}
                            retailer={item.retailerLabel}
                            itemId={item.productId}
                            type={item.commerceMode === "shopify" ? "shopify" : "affiliate"}
                          >
                            Shop
                          </ShopLink>
                        ) : (
                          <span className="text-xs font-medium text-neutral-400">Review</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3 text-sm">
                <div className="text-neutral-600">
                  {remainingShoppingCount > 0
                    ? `${remainingShoppingCount} more item${remainingShoppingCount === 1 ? "" : "s"} in the full export pack`
                    : "Full item details are ready in the export pack"}
                </div>
                <a
                  href={`/share/${shareToken}/export`}
                  className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-50"
                >
                  View full shopping list
                </a>
                <ShoppingCsvDownload
                  rows={shoppingCsvRows}
                  title={design.title}
                  shareToken={shareToken}
                />
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-4 text-sm text-neutral-600">
              Add catalog products in the editor to turn this shared design into a shopping-ready preview.
            </div>
          )}
        </div>
      </section>

      <ShareFooterCTA shareToken={shareToken} />
    </main>
  );
}
