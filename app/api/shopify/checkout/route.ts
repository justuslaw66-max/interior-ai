import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";
import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { assertStrictVariantResolution } from "@/lib/catalog/variant-resolver";

type CheckoutLineInput = {
  merchandiseId: string;
  quantity: number;
  productId: string;
  variantId: string;
};

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || process.env.SHOPIFY_STOREFRONT_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2026-01";

async function shopifyFetch(query: string, variables: unknown) {
  const res = await fetch(`https://${domain}/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token!,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (!res.ok || json.errors) {
    console.error("Shopify error:", json.errors || json);
    throw new Error("Shopify request failed");
  }
  return json.data;
}

export async function POST(req: Request) {
  const body = await req.json();
  const { lines } = body ?? {};

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "No lines" }, { status: 400 });
  }

  const parsedLines: CheckoutLineInput[] = [];
  for (const line of lines) {
    if (
      !line ||
      typeof line !== "object" ||
      typeof line.merchandiseId !== "string" ||
      typeof line.productId !== "string" ||
      typeof line.variantId !== "string" ||
      typeof line.quantity !== "number" ||
      !Number.isFinite(line.quantity) ||
      line.quantity < 1
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid checkout line. Each line must include merchandiseId, productId, variantId, and quantity >= 1.",
        },
        { status: 400 }
      );
    }
    parsedLines.push({
      merchandiseId: line.merchandiseId,
      productId: line.productId,
      variantId: line.variantId,
      quantity: Math.floor(line.quantity),
    });
  }

  for (const line of parsedLines) {
    const item = CATALOG_ITEMS_MAP.get(line.productId);
    if (!item) {
      void logAppEvent({
        eventType: "checkout_variant_validation_failed",
        meta: { reason: "unknown_catalog_item", productId: line.productId, variantId: line.variantId },
      });
      return NextResponse.json({ error: `Unknown variant: ${line.productId}` }, { status: 400 });
    }

    const strict = assertStrictVariantResolution(item, line.variantId);
    if (!strict.ok) {
      void logAppEvent({
        eventType: "checkout_variant_validation_failed",
        meta: { reason: "strict_resolution_failed", productId: line.productId, variantId: line.variantId, error: strict.error },
      });
      return NextResponse.json({ error: strict.error }, { status: 400 });
    }

    const resolved = strict.resolved;
    if (resolved.commerce.type !== "shopify") {
      void logAppEvent({
        eventType: "checkout_variant_validation_failed",
        meta: { reason: "non_shopify_variant", productId: line.productId, variantId: line.variantId },
      });
      return NextResponse.json(
        { error: `Variant ${line.variantId} for ${line.productId} is not buyable on Shopify` },
        { status: 400 }
      );
    }
    if (!resolved.commerce.variantId) {
      void logAppEvent({
        eventType: "checkout_variant_validation_failed",
        meta: { reason: "missing_shopify_mapping", productId: line.productId, variantId: line.variantId },
      });
      return NextResponse.json(
        { error: `Missing Shopify variant mapping for ${line.productId}/${line.variantId}` },
        { status: 400 }
      );
    }
    if (!resolved.commerce.available) {
      void logAppEvent({
        eventType: "checkout_variant_validation_failed",
        meta: { reason: "variant_marked_unavailable", productId: line.productId, variantId: line.variantId },
      });
      return NextResponse.json(
        { error: `Variant is marked unavailable: ${line.productId}/${line.variantId}` },
        { status: 400 }
      );
    }
    if (resolved.commerce.variantId !== line.merchandiseId) {
      void logAppEvent({
        eventType: "checkout_variant_validation_failed",
        meta: {
          reason: "merchandise_id_mismatch",
          productId: line.productId,
          variantId: line.variantId,
          expectedMerchandiseId: resolved.commerce.variantId,
          receivedMerchandiseId: line.merchandiseId,
        },
      });
      return NextResponse.json(
        {
          error: `Variant mismatch for ${line.productId}/${line.variantId}. Expected ${resolved.commerce.variantId}.`,
        },
        { status: 400 }
      );
    }
  }

  const ids = parsedLines.map((line) => line.merchandiseId);
  const availabilityQuery = `
    query Check($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          availableForSale
          price {
            amount
            currencyCode
          }
          product { title }
          title
        }
      }
    }
  `;

  if (!config.features.checkoutEnabled) {
    return NextResponse.json({ error: "Checkout is disabled" }, { status: 503 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  const rl = rateLimit(`shopify:${ip}`, 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many Shopify checkout requests" }, { status: 429 });
  }

  if (!domain || !token) {
    return NextResponse.json({ error: "Shopify is not configured" }, { status: 503 });
  }

  const check = await shopifyFetch(availabilityQuery, { ids });
  const unavailable = (check?.nodes ?? [])
    .filter((node: { availableForSale?: boolean } | null) => node && node.availableForSale === false)
    .map((node: { id: string; product?: { title?: string }; title?: string }) => ({
      id: node.id,
      title: node.product?.title,
      variant: node.title,
    }));

  if (unavailable.length > 0) {
    void logAppEvent({
      eventType: "checkout_variant_validation_failed",
      meta: { reason: "shopify_availability_failed", unavailable },
    });
    return NextResponse.json(
      { error: "Some items are out of stock", unavailable },
      { status: 400 }
    );
  }

  const missingPrice = (check?.nodes ?? [])
    .filter(
      (
        node:
          | {
              id: string;
              price?: { amount?: string };
            }
          | null
      ) => {
        if (!node) return false;
        const amount = Number(node.price?.amount ?? NaN);
        return !Number.isFinite(amount) || amount <= 0;
      }
    )
    .map((node: { id: string }) => node.id);

  if (missingPrice.length > 0) {
    void logAppEvent({
      eventType: "checkout_variant_validation_failed",
      meta: { reason: "missing_price", invalidPriceVariantIds: missingPrice },
    });
    return NextResponse.json(
      {
        error: "Some variants are missing valid price data",
        invalidPriceVariantIds: missingPrice,
      },
      { status: 400 }
    );
  }

  const mutation = `
    mutation cartCreate($input: CartInput!) {
      cartCreate(input: $input) {
        cart {
          id
          checkoutUrl
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const data = await shopifyFetch(mutation, {
    input: {
      lines: parsedLines.map((line) => ({
        merchandiseId: line.merchandiseId,
        quantity: line.quantity,
      })),
    },
  });

  const errors = data?.cartCreate?.userErrors ?? [];
  if (errors.length) {
    return NextResponse.json({ error: errors[0].message, errors }, { status: 400 });
  }

  const checkoutUrl = data.cartCreate.cart.checkoutUrl;
  const cartId = data.cartCreate.cart.id;

  // Server-side PostHog tracking for checkout initiation (critical conversion event)
  const session = await auth();
  const posthog = getPostHogClient();
  posthog.capture({
    distinctId: session?.user?.id ?? "anonymous",
    event: "checkout_initiated",
    properties: {
      cart_id: cartId,
      items_count: parsedLines.length,
      total_quantity: parsedLines.reduce((sum: number, l) => sum + l.quantity, 0),
    },
  });

  void logAppEvent({
    eventType: "checkout_started",
    userId: session?.user?.id ?? null,
    meta: { provider: "shopify", cartId },
  });

  return NextResponse.json({ checkoutUrl });
}
