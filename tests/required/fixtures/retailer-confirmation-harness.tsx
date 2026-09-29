import { useState } from "react";
import { createRoot } from "react-dom/client";

import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { ShopStep } from "@/components/editor/shop/ShopStep";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignItem } from "@/lib/room-types";
import type { ShoppingListRoom } from "@/lib/shopping-list";
import { SHOPPING_FALLBACK_FOCUS_ID } from "@/lib/shopping-list-buy";

// CH-0015G's Retailer gate, re-pinned in UX phase 3c-2: buying at a retailer from the Shopping list
// (audit finding FU8; J's answer to Q2, 27 Sep). The design's products are synthetic and sold by
// synthetic shops on reserved `.test` hosts, so no merchant is ever contacted.

const SCENARIOS = ["ordinary", "single", "zero", "missing-link", "quantities", "two-shops"] as const;
const USER_KINDS = ["guest", "consumer", "pro"] as const;
export type RetailerFixtureInputs = {
  scenario: typeof SCENARIOS[number];
  userKind: typeof USER_KINDS[number];
};

declare global {
  interface Window {
    __retailerResetFixture: (inputs: RetailerFixtureInputs) => number;
  }
}

type SyntheticProduct = {
  key: string;
  title: string;
  retailer: string;
  url: string;
  price: number;
  /** A "Set of 2" purchase option, bought as one. */
  set?: { url: string; price: number };
};

const PRODUCTS = {
  alpha: { key: "alpha", title: "Alpha Armchair", retailer: "Safe Retailer", url: "https://safe-retailer.test/alpha", price: 420 },
  // The same shop, spelt with its country and on its www host: one shop on the list.
  beta: {
    key: "beta", title: "Beta Side Table", retailer: "Safe Retailer Singapore", url: "https://www.safe-retailer.test/beta", price: 180,
    set: { url: "https://safe-retailer.test/beta-set-of-2", price: 320 },
  },
  gamma: { key: "gamma", title: "Gamma Floor Lamp", retailer: "Safe Retailer", url: "https://safe-retailer.test/gamma", price: 90 },
  delta: { key: "delta", title: "Delta Rug", retailer: "Second Retailer", url: "https://second-retailer.test/delta", price: 260 },
  missing: { key: "missing", title: "Missing Link Stool", retailer: "Missing Link Retailer", url: "", price: 75 },
} satisfies Record<string, SyntheticProduct>;

const DESIGN_ID = "ch0015g-synthetic-design";
const productId = (product: SyntheticProduct) => `ch0015g-${product.key}-product`;
const variantId = (product: SyntheticProduct) => `ch0015g-${product.key}-variant`;
const setOptionId = (product: SyntheticProduct) => `ch0015g-${product.key}-set-of-2`;

const params = new URLSearchParams(window.location.search);
const template = Object.values(CATALOG_ITEMS)[0];
if (!template) throw new Error("Retailer fixture requires a catalog template");
const templateVariant = template.variants[0];
if (!templateVariant) throw new Error("Retailer fixture requires a catalog variant");

function registerProduct(product: SyntheticProduct) {
  CATALOG_ITEMS[productId(product)] = {
    ...template,
    id: productId(product),
    slug: productId(product),
    title: product.title,
    defaultVariantId: variantId(product),
    variants: [{
      ...templateVariant,
      id: variantId(product),
      label: "Synthetic finish",
      affiliateUrl: product.url || undefined,
      priceHint: product.price,
      available: true,
      purchaseOptions: product.set
        ? [{ id: setOptionId(product), label: "Set of 2", quantity: 2, affiliateUrl: product.set.url, priceHint: product.set.price }]
        : undefined,
    }],
    commerce: { type: "affiliate", data: { retailer: product.retailer, url: product.url, priceHint: product.price } },
  };
}

const placed = (product: SyntheticProduct, extra: Partial<DesignItem> = {}): DesignItem => ({
  instanceId: `${product.key}-line`,
  productId: productId(product),
  variantId: variantId(product),
  position: [0, 0, 0],
  rotationY: 0,
  ...extra,
});

function initialRooms(scenario: RetailerFixtureInputs["scenario"]): ShoppingListRoom[] {
  const { alpha, beta, gamma, delta, missing } = PRODUCTS;
  const living = (items: DesignItem[]) => ({ id: "ch0015g-living", name: "Living Room", items });
  if (scenario === "zero") return [living([])];
  if (scenario === "single") return [living([placed(alpha)])];
  if (scenario === "missing-link") return [living([placed(missing), placed(alpha)])];
  if (scenario === "quantities") {
    return [living([placed(alpha, { qty: 3 }), placed(beta, { purchaseOptionId: setOptionId(beta) }), placed(gamma)])];
  }
  if (scenario === "two-shops") return [living([placed(alpha), placed(delta), placed(gamma)])];
  // One shop's products in two rooms, under two spellings of its name.
  return [living([placed(alpha), placed(beta)]), { id: "ch0015g-bedroom", name: "Bedroom", items: [placed(gamma)] }];
}

const withoutItems = (rooms: ShoppingListRoom[], remove: (item: DesignItem) => boolean) =>
  rooms.map((room) => ({ ...room, items: room.items.filter((item) => !remove(item)) }));

function FixtureControls({ onRemoveOne, onRemoveShop, onUnmount, onOpenNewer }: Record<
  "onRemoveOne" | "onRemoveShop" | "onUnmount" | "onOpenNewer",
  () => void
>) {
  return (
    <div data-testid="retailer-fixture-controls" className="flex flex-wrap gap-2 p-2">
      {/* Stands in for the bar's current step, where focus goes when a Buy button has gone. */}
      <button id={SHOPPING_FALLBACK_FOCUS_ID} type="button">Shop</button>
      <button data-testid="retailer-fixture-remove-one" type="button" onClick={onRemoveOne}>
        Remove the lamp from the design
      </button>
      <button data-testid="retailer-fixture-scope-change" type="button" onClick={onRemoveShop}>
        Remove the first shop&apos;s products
      </button>
      <button data-testid="retailer-fixture-unmount" type="button" onClick={onUnmount}>Leave Shop</button>
      <button id="retailer-fixture-newer-opener" data-testid="retailer-fixture-newer-opener" type="button" onClick={onOpenNewer}>
        Open newer dialog
      </button>
    </div>
  );
}

function RetailerConfirmationHarness({ fixture, generation }: { fixture: RetailerFixtureInputs; generation: number }) {
  const { scenario, userKind } = fixture;
  const [rooms, setRooms] = useState(() => initialRooms(scenario));
  const [shopMounted, setShopMounted] = useState(true);
  const [newerDialogOpen, setNewerDialogOpen] = useState(false);
  const [furnishRequests, setFurnishRequests] = useState(0);
  const firstShopIds = new Set([PRODUCTS.alpha, PRODUCTS.beta, PRODUCTS.gamma].map(productId));

  return (
    <main
      data-testid="retailer-confirmation-harness"
      data-retailer-user={userKind}
      data-retailer-scenario={scenario}
      data-retailer-generation={generation}
      data-retailer-furnish-requests={furnishRequests}
      className="min-h-screen bg-[#fafaf9]"
    >
      <FixtureControls
        onRemoveOne={() => setRooms((current) => withoutItems(current, (item) => item.productId === productId(PRODUCTS.gamma)))}
        onRemoveShop={() => setRooms((current) => withoutItems(current, (item) => firstShopIds.has(item.productId)))}
        onUnmount={() => setShopMounted(false)}
        onOpenNewer={() => setNewerDialogOpen(true)}
      />
      {shopMounted ? (
        <ShopStep
          rooms={rooms}
          style="modern"
          designId={DESIGN_ID}
          isGuest={userKind === "guest"}
          canEdit
          actions={{
            commitItemsToRoom: (roomId, updater) => setRooms((current) =>
              current.map((room) => (room.id === roomId ? { ...room, items: updater(room.items) } : room))),
            openGuestPrompt: () => undefined,
            goFurnish: () => setFurnishRequests((count) => count + 1),
          }}
        />
      ) : null}
      <EditorDialog
        open={newerDialogOpen}
        title="Newer synthetic dialog"
        onClose={() => setNewerDialogOpen(false)}
        closeButtonTestId="retailer-fixture-newer-close"
        returnFocusId="retailer-fixture-newer-opener"
        cancelFocusRestorationOnUnmount
        manageBackground
        forceLight
        testId="retailer-fixture-newer-dialog"
      >
        Newer dialog content
      </EditorDialog>
    </main>
  );
}

document.body.innerHTML = '<div id="retailer-confirmation-harness-root"></div>';
const root = document.getElementById("retailer-confirmation-harness-root");
if (!root) throw new Error("Retailer confirmation fixture root is missing");
const fixtureRoot = createRoot(root);
let fixtureGeneration = 0;
function renderFixture(input: { scenario: string; userKind: string }) {
  const scenario = SCENARIOS.find((value) => value === input.scenario);
  const userKind = USER_KINDS.find((value) => value === input.userKind);
  if (!scenario || !userKind) throw new Error("Unsupported retailer fixture inputs.");
  Object.values(PRODUCTS).forEach(registerProduct);
  const generation = ++fixtureGeneration;
  // Remount the entire fixture so every scenario starts with a fresh Shopping list.
  fixtureRoot.render(
    <RetailerConfirmationHarness key={generation} fixture={{ scenario, userKind }} generation={generation} />
  );
  return generation;
}
window.__retailerResetFixture = renderFixture;
renderFixture({
  scenario: params.get("retailer-scenario") ?? "ordinary",
  userKind: params.get("retailer-user") ?? "consumer",
});
