import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPostHogClient } from "@/lib/posthog-server";
import { config } from "@/lib/config";
import { rateLimit } from "@/lib/rateLimit";
import { logAppEvent } from "@/lib/app-events";
import { CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { assertStrictVariantResolution } from "@/lib/catalog/variant-resolver";
import {
  buildCheckoutBoundaryResponsePayload,
  resolveCheckoutBoundaryDiagnostics,
} from "@/lib/beta-checkout-boundary";
import {
  ApiBoundaryError,
  apiErrorResponse,
  apiSuccessHeaders,
  createOperationId,
  readJsonRequest,
} from "@/lib/api-boundary";
import { logOperationalEvent } from "@/lib/observability";

type CheckoutLineInput = {
  merchandiseId: string;
  quantity: number;
  productId: string;
  variantId: string;
};

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const token = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || process.env.SHOPIFY_STOREFRONT_TOKEN;
const version = process.env.SHOPIFY_API_VERSION || "2026-01";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function shopifyFetch(query: string, variables: unknown): Promise<Record<string, unknown>> {
  if (
    !domain ||
    !token ||
    !/^[a-z0-9][a-z0-9.-]+$/i.test(domain) ||
    !/^\d{4}-\d{2}$/.test(version)
  ) {
    throw new ApiBoundaryError(503, "INTERNAL_ERROR", "Shopify checkout is unavailable.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`https://${domain}/api/${version}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": token!,
    },
    body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  if (new TextEncoder().encode(text).byteLength > 1024 * 1024) {
    throw new ApiBoundaryError(502, "INTERNAL_ERROR", "Shopify returned an invalid response.");
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch {
    throw new ApiBoundaryError(502, "INTERNAL_ERROR", "Shopify returned an invalid response.");
  }
  if (!res.ok || !isRecord(json) || Array.isArray(json.errors) || !isRecord(json.data)) {
    console.error("Shopify provider request failed", { status: res.status });
    throw new ApiBoundaryError(502, "INTERNAL_ERROR", "Shopify checkout is temporarily unavailable.");
  }
  return json.data;
}

export async function POST(req: Request) {
  const operation = "shopify.checkout_create";
  const operationId = createOperationId();
  const startedAt = Date.now();
  try {
  const body = await readJsonRequest(req, 32 * 1024);
  const payload = isRecord(body) ? body : {};
  const { lines } = payload;

  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 50) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Checkout requires between 1 and 50 lines.");
  }

  const parsedLines: CheckoutLineInput[] = [];
  for (const line of lines) {
    if (
      !line ||
      typeof line !== "object" ||
      typeof line.merchandiseId !== "string" ||
      typeof line.productId !== "string" ||
      typeof line.variantId !== "string" ||
      line.merchandiseId.length > 512 ||
      line.productId.length > 128 ||
      line.variantId.length > 128 ||
      typeof line.quantity !== "number" ||
      !Number.isFinite(line.quantity) ||
      line.quantity < 1 ||
      line.quantity > 20
    ) {
      throw new ApiBoundaryError(
        400,
        "BAD_REQUEST",
        "Each checkout line must identify a catalog variant and use a quantity from 1 to 20."
      );
    }
    parsedLines.push({
      merchandiseId: line.merchandiseId,
      productId: line.productId,
      variantId: line.variantId,
      quantity: Math.floor(line.quantity),
    });
  }
  if (parsedLines.reduce((sum, line) => sum + line.quantity, 0) > 100) {
    throw new ApiBoundaryError(400, "BAD_REQUEST", "Checkout quantity is too large.");
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

  const boundary = resolveCheckoutBoundaryDiagnostics();
  if (!boundary.checkoutSafe) {
    return NextResponse.json(buildCheckoutBoundaryResponsePayload(boundary), { status: 503 });
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
  if (!Array.isArray(check.nodes) || check.nodes.length !== ids.length) {
    throw new ApiBoundaryError(502, "INTERNAL_ERROR", "Shopify returned incomplete availability data.");
  }
  const checkedNodes = check.nodes.map((node) => {
    if (
      !isRecord(node) ||
      typeof node.id !== "string" ||
      typeof node.availableForSale !== "boolean" ||
      !isRecord(node.price) ||
      typeof node.price.amount !== "string" ||
      typeof node.price.currencyCode !== "string"
    ) {
      throw new ApiBoundaryError(502, "INTERNAL_ERROR", "Shopify returned invalid variant data.");
    }
    return node;
  });
  const returnedIds = new Set(checkedNodes.map((node) => node.id));
  if (ids.some((id) => !returnedIds.has(id))) {
    throw new ApiBoundaryError(502, "INTERNAL_ERROR", "Shopify returned incomplete variant data.");
  }
  const unavailable = checkedNodes
    .filter((node) => node.availableForSale === false)
    .map((node) => ({ id: node.id }));

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

  const missingPrice = checkedNodes
    .filter((node) => {
        const amount = Number((node.price as Record<string, unknown>).amount ?? NaN);
        return !Number.isFinite(amount) || amount <= 0;
      })
    .map((node) => node.id as string);

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

  const cartCreate = isRecord(data.cartCreate) ? data.cartCreate : null;
  const errors = cartCreate && Array.isArray(cartCreate.userErrors) ? cartCreate.userErrors : [];
  if (errors.length) {
    return NextResponse.json(
      { error: "Shopify could not create this cart. Review item availability and try again." },
      { status: 400, headers: apiSuccessHeaders(operationId) }
    );
  }

  const cart = cartCreate && isRecord(cartCreate.cart) ? cartCreate.cart : null;
  const checkoutUrl = cart && typeof cart.checkoutUrl === "string" ? cart.checkoutUrl : "";
  const cartId = cart && typeof cart.id === "string" ? cart.id : "";
  let safeCheckoutUrl: string;
  try {
    const checkout = new URL(checkoutUrl);
    if (checkout.protocol !== "https:" || !cartId || cartId.length > 512) throw new Error();
    safeCheckoutUrl = checkout.toString();
  } catch {
    throw new ApiBoundaryError(502, "INTERNAL_ERROR", "Shopify returned an invalid checkout link.");
  }

  // Server-side PostHog tracking for checkout initiation (critical conversion event)
  const session = await auth();
  try {
    const posthog = getPostHogClient();
    posthog.capture({
    distinctId: session?.user?.id ?? "anonymous",
    event: "checkout_initiated",
    properties: {
      provider_reference_present: true,
      items_count: parsedLines.length,
      total_quantity: parsedLines.reduce((sum: number, l) => sum + l.quantity, 0),
    },
    });
  } catch {
    // Analytics is non-blocking.
  }

  void logAppEvent({
    eventType: "checkout_started",
    userId: session?.user?.id ?? null,
    meta: { provider: "shopify", providerReferencePresent: true },
  });

  logOperationalEvent({
    operation,
    operationId,
    outcome: "succeeded",
    durationMs: Date.now() - startedAt,
    status: 200,
    meta: { lineCount: parsedLines.length },
  });
  return NextResponse.json(
    { checkoutUrl: safeCheckoutUrl },
    { headers: apiSuccessHeaders(operationId) }
  );
  } catch (error) {
    return apiErrorResponse(error, { operation, operationId, startedAt });
  }
}
