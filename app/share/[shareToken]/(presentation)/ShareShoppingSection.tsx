import type { ReactNode } from "react";
import LazyImage from "@/components/common/LazyImage";
import ShareShoppingCheckout from "@/components/ShareShoppingCheckout";
import { formatSgd } from "@/lib/money-format";
import type { ShareCheckoutLine } from "@/lib/share-shopping-csv";
import { productCountLabel, type ShoppingList, type ShoppingListLine } from "@/lib/shopping-list";
import ShopLink from "../export/ShopLink";

/**
 * The shared design's Shopping list (UX audit SX7, phase 4e), grouped as the editor's Shop groups
 * it: each shop with its subtotal, then Checkout here, then what isn't sold online yet. The
 * checkout-readiness tiles and the six-item preview are gone.
 */

type ShopGroupProps = {
  title: string;
  detail?: string;
  subtotal?: number;
  lines: readonly ShoppingListLine[];
  linkType: "shopify" | "affiliate" | null;
  action?: ReactNode;
};

function ShopLine({ line, shop, linkType }: { line: ShoppingListLine; shop: string; linkType: ShopGroupProps["linkType"] }) {
  return (
    <li className="flex min-w-0 items-center gap-3 px-4 py-3">
      <LazyImage
        src={line.imageUrl ?? undefined}
        fallbackSrc={line.fallbackImageUrl ?? undefined}
        alt={line.title}
        className="h-16 w-16 shrink-0 rounded-md"
        imageClassName="object-contain object-center"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-neutral-950">{line.title}</div>
        <div className="truncate text-xs text-neutral-600">
          {line.detail} · {line.roomName}
          {line.addCount > 1 ? ` · Qty ${line.addCount}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right text-sm">
        <div className="font-semibold text-neutral-950">{line.priceLabel}</div>
        {line.buyUrl && linkType ? (
          <ShopLink url={line.buyUrl} retailer={shop} itemId={line.productId} type={linkType}>
            View product<span className="sr-only">: {line.title}, {shop}</span>
          </ShopLink>
        ) : null}
      </div>
    </li>
  );
}

function ShopGroup({ title, detail, subtotal, lines, linkType, action }: ShopGroupProps) {
  return (
    <section className="rounded-xl border border-neutral-200" aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-neutral-950">{title}</h3>
          <div className="text-xs text-neutral-600">
            {productCountLabel(lines.length)}
            {detail ? ` · ${detail}` : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {subtotal !== undefined ? (
            <span className="text-sm font-semibold text-neutral-950">{formatSgd(subtotal)}</span>
          ) : null}
          {action}
        </div>
      </div>
      <ul className="divide-y divide-neutral-100">
        {lines.map((line) => (
          <ShopLine key={line.instanceId} line={line} shop={title} linkType={linkType} />
        ))}
      </ul>
    </section>
  );
}

function ShopGroups({ list, checkoutLines }: { list: ShoppingList; checkoutLines: ShareCheckoutLine[] }) {
  return (
    // One column that may shrink (grid-cols-1 is minmax(0, 1fr)): an auto column grows to the
    // widest product name, which the lines truncate, and pushed a phone's page 153px wide.
    <div className="mt-4 grid grid-cols-1 gap-4" data-testid="share-checkout-readiness">
      <p className="text-xs text-neutral-600" data-testid="share-availability-warning">
        Prices are estimates. Each shop confirms stock, delivery and the final price.
      </p>
      {list.retailers.map((retailer) => (
        <ShopGroup
          key={retailer.id}
          title={retailer.name}
          detail={retailer.id}
          subtotal={retailer.subtotal}
          lines={retailer.lines}
          linkType="affiliate"
        />
      ))}
      {list.retailers.length > 0 ? (
        <p className="text-xs text-neutral-600">Products sold by other shops open on their own websites.</p>
      ) : null}
      {list.checkoutHere ? (
        <ShopGroup
          title="Checkout here"
          subtotal={list.checkoutHere.subtotal}
          lines={list.checkoutHere.lines}
          linkType="shopify"
          action={<ShareShoppingCheckout lines={checkoutLines} />}
        />
      ) : null}
      {list.unavailable.length > 0 ? (
        <ShopGroup title="Not sold online yet" lines={list.unavailable} linkType={null} />
      ) : null}
    </div>
  );
}

export function ShareShoppingSection({ list, checkoutLines }: { list: ShoppingList; checkoutLines: ShareCheckoutLine[] }) {
  return (
    <section id="shopping-preview" className="scroll-mt-6 border-t bg-white" aria-labelledby="share-shopping-heading">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="share-shopping-heading" className="text-lg font-semibold text-neutral-950">
            Shopping list
          </h2>
          {list.productCount > 0 ? (
            <div className="text-sm text-neutral-700">
              <span className="font-semibold text-neutral-950">{formatSgd(list.total)}</span> ·{" "}
              {productCountLabel(list.productCount)}
            </div>
          ) : null}
        </div>
        {list.productCount > 0 ? (
          <ShopGroups list={list} checkoutLines={checkoutLines} />
        ) : (
          <p className="mt-2 text-sm text-neutral-600">No products added to this shared design yet</p>
        )}
      </div>
    </section>
  );
}
