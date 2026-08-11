import { useState } from "react";
import { createRoot } from "react-dom/client";

import CartSidebar, {
  type CartSidebarPlacedItem,
} from "@/components/CartSidebar";
import { EditorDialog } from "@/components/editor/design-system/EditorDialog";
import { CATALOG_ITEMS } from "@/lib/catalog";

const ALPHA_PRODUCT_ID = "ch0015g-alpha-product";
const ALPHA_VARIANT_ID = "ch0015g-alpha-variant";
const BETA_PRODUCT_ID = "ch0015g-beta-product";
const BETA_VARIANT_ID = "ch0015g-beta-variant";
const MISSING_PRODUCT_ID = "ch0015g-missing-product";
const MISSING_VARIANT_ID = "ch0015g-missing-variant";
const params = new URLSearchParams(window.location.search);
const scenario = params.get("retailer-scenario") ?? "ordinary";
const requestedTabs = Number(params.get("retailer-tabs") ?? "4");
const userKind = params.get("retailer-user") ?? "consumer";
const template = Object.values(CATALOG_ITEMS)[0];
if (!template) throw new Error("Retailer fixture requires a catalog template");
const templateVariant = template.variants[0];
if (!templateVariant) throw new Error("Retailer fixture requires a catalog variant");

function registerAffiliateProduct(
  productId: string,
  variantId: string,
  retailer: string,
  url: string,
  available = true
) {
  CATALOG_ITEMS[productId] = {
    ...template,
    id: productId,
    slug: productId,
    title: `${retailer} synthetic item`,
    defaultVariantId: variantId,
    variants: [{
      ...templateVariant,
      id: variantId,
      label: "Synthetic affiliate variant",
      affiliateUrl: url || undefined,
      available,
    }],
    commerce: {
      type: "affiliate",
      data: { retailer, url, priceHint: 42 },
    },
  };
}

registerAffiliateProduct(
  ALPHA_PRODUCT_ID,
  ALPHA_VARIANT_ID,
  "Safe Retailer",
  "http://127.0.0.1:3000/synthetic-retailer/alpha",
  scenario !== "unavailable"
);
registerAffiliateProduct(
  BETA_PRODUCT_ID,
  BETA_VARIANT_ID,
  "Second Safe Retailer",
  "http://127.0.0.1:3000/synthetic-retailer/beta"
);
registerAffiliateProduct(
  MISSING_PRODUCT_ID,
  MISSING_VARIANT_ID,
  "Missing Link Retailer",
  ""
);

function initialItems(): CartSidebarPlacedItem[] {
  if (scenario === "zero") return [];
  if (scenario === "duplicate") {
    return ["duplicate-a", "duplicate-b"].map((instanceId) => ({
      instanceId,
      productId: ALPHA_PRODUCT_ID,
      variantId: ALPHA_VARIANT_ID,
      qty: 2,
      includeInCheckout: true,
    }));
  }
  if (scenario === "mixed-groups") {
    return [
      {
        instanceId: "alpha-line",
        productId: ALPHA_PRODUCT_ID,
        variantId: ALPHA_VARIANT_ID,
        qty: requestedTabs,
        includeInCheckout: true,
      },
      {
        instanceId: "beta-line",
        productId: BETA_PRODUCT_ID,
        variantId: BETA_VARIANT_ID,
        qty: 1,
        includeInCheckout: true,
      },
    ];
  }
  const missingLink = scenario === "missing-link";
  return [{
    instanceId: "alpha-line",
    productId: missingLink ? MISSING_PRODUCT_ID : ALPHA_PRODUCT_ID,
    variantId: missingLink ? MISSING_VARIANT_ID : ALPHA_VARIANT_ID,
    qty: requestedTabs,
    includeInCheckout: scenario !== "excluded",
    bundleQuantity: scenario === "bundle" ? requestedTabs : undefined,
  }];
}

function RetailerConfirmationHarness() {
  const [items, setItems] = useState(initialItems);
  const [cartMounted, setCartMounted] = useState(true);
  const [newerDialogOpen, setNewerDialogOpen] = useState(false);
  const isPro = userKind === "pro";

  return (
    <main
      data-testid="retailer-confirmation-harness"
      data-retailer-user={userKind}
      className="min-h-screen bg-neutral-100 p-6"
    >
      <div data-testid="retailer-fixture-controls" className="mb-4 flex gap-2">
        <button
          data-testid="retailer-fixture-scope-change"
          type="button"
          onClick={() => setItems((current) => current.map((item) => ({
            ...item,
            qty: (item.qty ?? 1) + 1,
          })))}
        >
          Change cart scope
        </button>
        <button
          data-testid="retailer-fixture-unmount"
          type="button"
          onClick={() => setCartMounted(false)}
        >
          Unmount cart
        </button>
        <button
          id="retailer-fixture-newer-opener"
          data-testid="retailer-fixture-newer-opener"
          type="button"
          onClick={() => setNewerDialogOpen(true)}
        >
          Open newer dialog
        </button>
      </div>
      {cartMounted ? (
        <CartSidebar
          items={items}
          designId="ch0015g-synthetic-design"
          plan={isPro ? "pro" : "free"}
          onRemove={(instanceId) => setItems((current) =>
            current.filter((item) => item.instanceId !== instanceId))}
          onSetQty={(instanceId, qty) => setItems((current) =>
            current.map((item) => item.instanceId === instanceId
              ? { ...item, qty }
              : item))}
          onSetInclude={(instanceId, includeInCheckout) => setItems((current) =>
            current.map((item) => item.instanceId === instanceId
              ? { ...item, includeInCheckout }
              : item))}
          onBulkSwap={() => undefined}
          onShowUpgrade={() => undefined}
          isGuest={userKind === "guest"}
          theme={isPro ? "designer" : "default"}
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
createRoot(root).render(<RetailerConfirmationHarness />);
