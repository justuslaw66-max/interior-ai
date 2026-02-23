import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";

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

  const body = await req.json();
  const { lines } = body ?? {};

  if (!Array.isArray(lines) || lines.length === 0) {
    return NextResponse.json({ error: "No lines" }, { status: 400 });
  }

  const ids = lines.map((line: { merchandiseId: string }) => line.merchandiseId);
  const availabilityQuery = `
    query Check($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          availableForSale
          product { title }
          title
        }
      }
    }
  `;

  const check = await shopifyFetch(availabilityQuery, { ids });
  const unavailable = (check?.nodes ?? [])
    .filter((node: { availableForSale?: boolean } | null) => node && node.availableForSale === false)
    .map((node: { id: string; product?: { title?: string }; title?: string }) => ({
      id: node.id,
      title: node.product?.title,
      variant: node.title,
    }));

  if (unavailable.length > 0) {
    return NextResponse.json(
      { error: "Some items are out of stock", unavailable },
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
      lines: lines.map((line: { merchandiseId: string; quantity: number }) => ({
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
      items_count: lines.length,
      total_quantity: lines.reduce((sum: number, l: { quantity: number }) => sum + l.quantity, 0),
    },
  });

  await logAppEvent({
    eventType: "checkout_started",
    userId: session?.user?.id ?? null,
    meta: { provider: "shopify", cartId },
  });

  return NextResponse.json({ checkoutUrl });
}
