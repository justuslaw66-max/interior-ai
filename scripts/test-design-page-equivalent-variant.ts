import assert from "node:assert/strict";
import type { CatalogItemSchema, ProductVariant } from "@/lib/catalog-schema";
import {
  EQUIVALENT_VARIANT_RULE_ORDERS,
  resolveEquivalentVariant,
  type EquivalentVariantRuleOrder,
} from "@/lib/design-page-equivalent-variant";

function makeVariant(
  id: string,
  overrides: Partial<ProductVariant> = {},
): ProductVariant {
  return {
    id,
    label: id,
    colorHex: "#000000",
    thumbnailUrl: `/fixtures/${id}.webp`,
    ...overrides,
  };
}

function makeProduct(...variants: ProductVariant[]): Pick<CatalogItemSchema, "variants"> {
  return { variants };
}

function resolve(
  sourceProduct: Pick<CatalogItemSchema, "variants">,
  sourceVariantId: string | null | undefined,
  targetProduct: Pick<CatalogItemSchema, "variants">,
  ruleOrder: EquivalentVariantRuleOrder,
) {
  return resolveEquivalentVariant({
    sourceProduct,
    sourceVariantId,
    targetProduct,
    ruleOrder,
  });
}

const source = makeProduct(
  makeVariant("source", {
    finishCode: " Walnut ",
    legFinishCode: " Black ",
    materialType: "Fabric",
    finishLabel: "Warm Walnut",
    label: "Shared label",
  }),
);

assert.equal(
  resolve(
    source,
    "source",
    makeProduct(
      makeVariant("source", { finishCode: "oak", legFinishCode: "brass" }),
      makeVariant("metadata-match", { finishCode: "walnut", legFinishCode: "black" }),
    ),
    EQUIVALENT_VARIANT_RULE_ORDERS.modelWithLeg,
  )?.id,
  "source",
  "Model-with-leg matching should prefer an exact variant ID.",
);

assert.equal(
  resolve(
    source,
    "source",
    makeProduct(
      makeVariant("finish-only", { finishCode: "walnut", legFinishCode: "brass" }),
      makeVariant("finish-and-leg", { finishCode: "WALNUT", legFinishCode: "BLACK" }),
    ),
    EQUIVALENT_VARIANT_RULE_ORDERS.modelWithLeg,
  )?.id,
  "finish-and-leg",
  "Model-with-leg matching should prefer finish and leg over finish alone.",
);

assert.equal(
  resolve(
    source,
    "source",
    makeProduct(
      makeVariant("source", { finishCode: "oak", legFinishCode: "brass" }),
      makeVariant("orientation-match", { finishCode: "walnut", legFinishCode: "black" }),
    ),
    EQUIVALENT_VARIANT_RULE_ORDERS.orientation,
  )?.id,
  "orientation-match",
  "Orientation matching should ignore an exact variant ID and preserve finish and leg.",
);

assert.equal(
  resolve(
    source,
    "source",
    makeProduct(
      makeVariant("label-match", { label: "Shared label", materialType: "Wood" }),
      makeVariant("material-match", { label: "Different", materialType: "Fabric" }),
    ),
    EQUIVALENT_VARIANT_RULE_ORDERS.family,
  )?.id,
  "material-match",
  "Family matching should prefer material type over the variant label.",
);

assert.equal(
  resolve(
    source,
    "source",
    makeProduct(
      makeVariant("other", { finishLabel: "Cool Oak" }),
      makeVariant("finish-label-match", { finishLabel: " warm walnut " }),
    ),
    EQUIVALENT_VARIANT_RULE_ORDERS.model,
  )?.id,
  "finish-label-match",
  "Model matching should use the finish label after ID and finish-code misses.",
);

assert.equal(
  resolve(
    source,
    "stale-shared-id",
    makeProduct(
      makeVariant("first"),
      makeVariant("stale-shared-id"),
    ),
    EQUIVALENT_VARIANT_RULE_ORDERS.model,
  )?.id,
  "stale-shared-id",
  "An explicitly requested stale ID should retain the existing direct-ID behavior.",
);

assert.equal(
  resolve(
    source,
    "source",
    makeProduct(
      makeVariant("source", { finishCode: "oak", label: "Shared label" }),
      makeVariant("finish-match", { finishCode: "walnut", label: "Different" }),
    ),
    EQUIVALENT_VARIANT_RULE_ORDERS.finishOnly,
  )?.id,
  "finish-match",
  "Finish-only matching should ignore ID and label matches.",
);

assert.equal(
  resolve(
    makeProduct(makeVariant("blank-source")),
    "blank-source",
    makeProduct(makeVariant("first"), makeVariant("second")),
    EQUIVALENT_VARIANT_RULE_ORDERS.model,
  )?.id,
  "first",
  "A strategy miss should retain the first-variant fallback.",
);

assert.equal(
  resolve(
    source,
    "source",
    makeProduct(),
    EQUIVALENT_VARIANT_RULE_ORDERS.family,
  ),
  undefined,
  "An empty target product should resolve to undefined.",
);

console.log("Design-page equivalent-variant fixtures passed.");
