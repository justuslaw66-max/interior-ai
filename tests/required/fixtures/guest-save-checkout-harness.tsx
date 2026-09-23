import { createRoot } from "react-dom/client";

import CartSidebar from "@/components/CartSidebar";
import { GuestSavePromptDialog } from "@/components/editor/design-page/GuestSavePromptDialog";
import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  GUEST_PROMPT_WORKFLOW_FALLBACK_ID,
} from "@/lib/guest-save-prompt";
import { useGuestSavePromptController } from "@/lib/useGuestSavePromptController";

const fixtureProductId = "ch0015f-shopify-product";
const fixtureVariantId = "ch0015f-shopify-variant";
const fixtureMerchandiseId =
  "gid://shopify/ProductVariant/ch0015f-shopify-merchandise";
const authenticatedCheckout = new URLSearchParams(window.location.search).get(
  "guest-checkout-auth"
) === "1";
const template = Object.values(CATALOG_ITEMS)[0];
if (!template) throw new Error("Guest checkout fixture requires a catalog template");
const templateVariant = template.variants[0];
if (!templateVariant) throw new Error("Guest checkout fixture requires a catalog variant");

CATALOG_ITEMS[fixtureProductId] = {
  ...template,
  id: fixtureProductId,
  slug: fixtureProductId,
  title: "CH-0015F Shopify fixture",
  defaultVariantId: fixtureVariantId,
  variants: [
    {
      ...templateVariant,
      id: fixtureVariantId,
      label: "Synthetic eligible variant",
      shopifyVariantId: fixtureMerchandiseId,
      available: true,
    },
  ],
  commerce: {
    type: "shopify",
    data: {
      productId: fixtureProductId,
      variantId: fixtureMerchandiseId,
      available: true,
    },
  },
};

function GuestSaveCheckoutHarness() {
  const guestPrompt = useGuestSavePromptController({
    scopeKey: "checkout-harness|guest",
    claimGuestDesign: async () => undefined,
    requestSignIn: () => undefined,
  });
  const session = guestPrompt.snapshot.session;

  return (
    <main data-testid="guest-checkout-harness" className="min-h-screen bg-white p-6">
      <button
        id={GUEST_PROMPT_WORKFLOW_FALLBACK_ID}
        type="button"
        className="rounded-lg border px-3 py-2"
      >
        Workspace
      </button>
      <CartSidebar
        items={[
          {
            instanceId: "ch0015f-shopify-line",
            productId: fixtureProductId,
            variantId: fixtureVariantId,
            qty: 2,
            includeInCheckout: true,
          },
        ]}
        designId="ch0015f-checkout-design"
        plan="free"
        onRemove={() => undefined}
        onSetQty={() => undefined}
        onSetInclude={() => undefined}
        onBulkSwap={() => undefined}
        onShowUpgrade={() => undefined}
        isGuest={!authenticatedCheckout}
        onGuestCapture={guestPrompt.open}
      />
      <GuestSavePromptDialog
        reason={session?.reason ?? null}
        busy={guestPrompt.snapshot.primaryBusy}
        lifecycleScopeKey="checkout-harness|guest"
        onCancel={() => { if (session) guestPrompt.cancel(session); }}
        onContinueWithoutSaving={() => {
          if (session) guestPrompt.continueWithoutSaving(session);
        }}
        onSaveAndContinue={() => session
          ? guestPrompt.saveAndContinue(session)
          : undefined}
      />
    </main>
  );
}

document.body.innerHTML = '<div id="guest-save-checkout-harness-root"></div>';
const root = document.getElementById("guest-save-checkout-harness-root");
if (!root) throw new Error("Guest checkout fixture root is missing");
createRoot(root).render(<GuestSaveCheckoutHarness />);
