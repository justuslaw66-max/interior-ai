import assert from "node:assert/strict";
import {
  hasMultipleDistinctVariantColors,
  normalizeVariantColorHex,
  shouldApplyVariantColorTint,
  type VariantTintProductInput,
} from "@/lib/catalog-variant-color";

type VariantInput = VariantTintProductInput["variants"][number];

function variant(colorHex: string, overrides: Partial<VariantInput> = {}): VariantInput {
  return {
    colorHex,
    ...overrides,
  };
}

function product(variants: VariantInput[]): VariantTintProductInput {
  return { variants };
}

assert.equal(normalizeVariantColorHex("#D8CEC0"), "#d8cec0");
assert.equal(normalizeVariantColorHex("not-a-color"), null);
assert.equal(normalizeVariantColorHex("#fff"), null);

const singleColorLamp = product([variant("#d8cec0")]);
assert.equal(hasMultipleDistinctVariantColors(singleColorLamp), false);
assert.equal(shouldApplyVariantColorTint(singleColorLamp, singleColorLamp.variants[0]), false);

const sizeVariantsSameColor = product([
  variant("#d8cec0"),
  variant("#D8CEC0", { swatchHex: "#d8cec0" }),
]);
assert.equal(hasMultipleDistinctVariantColors(sizeVariantsSameColor), false);
assert.equal(shouldApplyVariantColorTint(sizeVariantsSameColor, sizeVariantsSameColor.variants[1]), false);

const multiColorSharedModel = product([
  variant("#f3eee2", { swatchHex: "#f3eee2" }),
  variant("#2d2822", { swatchHex: "#2d2822" }),
]);
assert.equal(hasMultipleDistinctVariantColors(multiColorSharedModel), true);
assert.equal(shouldApplyVariantColorTint(multiColorSharedModel, multiColorSharedModel.variants[0]), true);

const multiColorSharedModelUrl = product([
  variant("#efede8", { modelUrl: "/assets/models/hamilton-3-seater.glb" }),
  variant("#8f9296", { modelUrl: "/assets/models/hamilton-3-seater.glb" }),
  variant("#b8794a", { modelUrl: "/assets/models/hamilton-3-seater.glb" }),
]);
assert.equal(hasMultipleDistinctVariantColors(multiColorSharedModelUrl), true);
assert.equal(
  shouldApplyVariantColorTint(multiColorSharedModelUrl, multiColorSharedModelUrl.variants[2]),
  true,
);

const multiColorBakedVariantModels = product([
  variant("#f3eee2", { modelUrl: "/assets/models/lamp-cream.glb" }),
  variant("#2d2822", { modelUrl: "/assets/models/lamp-black.glb" }),
]);
assert.equal(hasMultipleDistinctVariantColors(multiColorBakedVariantModels), true);
assert.equal(
  shouldApplyVariantColorTint(multiColorBakedVariantModels, multiColorBakedVariantModels.variants[0]),
  false,
);

const invalidColorMetadata = product([
  variant("cream"),
  variant("black", { swatchHex: "black" }),
]);
assert.equal(hasMultipleDistinctVariantColors(invalidColorMetadata), false);
assert.equal(shouldApplyVariantColorTint(invalidColorMetadata, invalidColorMetadata.variants[0]), false);

console.log("Catalog variant color tint tests passed");
