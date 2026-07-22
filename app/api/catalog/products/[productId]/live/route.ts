import { NextResponse } from "next/server";

import { CATALOG_ITEMS } from "@/lib/catalog";
import { buildCanonicalProductContract } from "@/lib/canonical-product-contract";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  const { productId } = await params;
  if (!/^[a-z0-9][a-z0-9_-]{0,159}$/i.test(productId)) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const product = CATALOG_ITEMS[productId];
  if (!product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const contract = buildCanonicalProductContract(product);
  return NextResponse.json(
    {
      productId: contract.productId,
      merchantId: contract.merchantId,
      variants: contract.variants.map((variant) => ({
        variantId: variant.variantId,
        finish: variant.finish,
        images: variant.images,
      })),
      ...contract.liveCommerce,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
