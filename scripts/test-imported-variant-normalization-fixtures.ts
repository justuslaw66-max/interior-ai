import assert from "node:assert/strict";
import { normalizeImportedVariants } from "../lib/catalog/imported-variant-normalization";
import { shouldShowCollectionGrouping } from "../lib/catalog/variant-normalization";

function runFixture(name: string, assertion: () => void) {
  try {
    assertion();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

runFixture("Dawson keeps stocked/custom split and material inference", () => {
  const normalized = normalizeImportedVariants({
    productId: "sofa-real-castlery-dawson-3s",
    variantEntries: [
      {
        upholstery_code: "beach_linen",
        upholstery_label: "Slub Linen Weave (Navagio), Cream (Beach Linen)",
      },
      {
        upholstery_code: "peyton_moss",
        upholstery_label: "Performance Fleece (Peyton), Moss",
      },
      {
        upholstery_code: "cocoa_leather",
        upholstery_label: "Cocoa (Leather)",
      },
    ],
    sharedUpholsteryOptions: [
      {
        upholstery_code: "beach_linen",
        upholstery_label: "Slub Linen Weave (Navagio), Cream (Beach Linen)",
        color_label: "Cream (Beach Linen)",
        collection_type: "stocked",
        fabric_family: "linen_slub_weave",
        fabric_label: "Navagio",
        texture_type: "slub_weave",
      },
      {
        upholstery_code: "peyton_moss",
        upholstery_label: "Performance Fleece (Peyton), Moss",
        color_label: "Moss",
        collection_type: "custom",
        fabric_family: "performance_fleece",
        fabric_label: "Peyton",
        texture_type: "velvet_like_fleece",
      },
      {
        upholstery_code: "cocoa_leather",
        upholstery_label: "Cocoa (Leather)",
        color_label: "Cocoa",
        collection_type: "custom",
        fabric_family: "top_grain_leather",
        fabric_label: "Leather",
        texture_type: "smooth_leather",
      },
    ],
    fallbackThumbnailUrl: "/assets/thumbs/sofa-real-castlery-dawson-3s.png",
  });

  assert.equal(normalized.length, 3);
  assert.deepEqual(
    normalized.map((variant) => variant.collectionType),
    ["stocked", "custom", "custom"],
  );
  assert.equal(normalized[0]?.materialType, "Fabric");
  assert.equal(normalized[2]?.materialType, "Leather");
  assert.equal(shouldShowCollectionGrouping(normalized.map((variant) => variant.collectionType)), true);
});

runFixture("Madison stays unlabeled when collection metadata is absent", () => {
  const normalized = normalizeImportedVariants({
    productId: "sofa-real-castlery-madison-3s",
    variantEntries: [
      {
        variant: "Bisque (Fabric)",
        finish_code: "bisque_fabric",
        finish_label: "Bisque",
        materials: {
          upholstery: {
            structure: "fabric",
            surface: "woven_fabric",
          },
        },
        finish: {
          color_finish: "bisque",
          finish_color: "bisque_fabric",
        },
      },
      {
        variant: "Caramel (Leather)",
        finish_code: "caramel_leather",
        finish_label: "Caramel",
        materials: {
          upholstery: {
            structure: "leather",
            surface: "top_grain_leather",
          },
        },
        finish: {
          color_finish: "caramel",
          finish_color: "caramel_leather",
        },
      },
    ],
    fallbackThumbnailUrl: "/assets/thumbs/sofa-real-castlery-madison-3s.png",
  });

  assert.equal(normalized.length, 2);
  assert.ok(normalized.every((variant) => variant.collectionType === undefined));
  assert.equal(normalized[0]?.materialType, "Fabric");
  assert.equal(normalized[1]?.materialType, "Leather");
  assert.equal(shouldShowCollectionGrouping(normalized.map((variant) => variant.collectionType)), false);
});

runFixture("Sloane dedupes colliding normalized ids", () => {
  const normalized = normalizeImportedVariants({
    productId: "dining-real-castlery-sloane-travertine-220",
    variantEntries: [
      {
        variant: "180 Grey Oak",
        size_label: "180",
        finish_code: "grey_oak",
        finish_label: "Grey Oak",
        finish: {
          tabletop_finish: "travertine",
          base_finish: "grey_oak",
          finish_color: "travertine_grey_oak",
        },
      },
      {
        variant: "225 Grey Oak",
        size_label: "225",
        finish_code: "grey_oak",
        finish_label: "Grey Oak",
        finish: {
          tabletop_finish: "travertine",
          base_finish: "grey_oak",
          finish_color: "travertine_grey_oak",
        },
      },
    ],
    fallbackThumbnailUrl: "/assets/thumbs/dining-real-castlery-sloane-travertine-220.png",
  });

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]?.id, "imported-dining-real-castlery-sloane-travertine-220-grey-oak");
  assert.equal(normalized[1]?.id, "imported-dining-real-castlery-sloane-travertine-220-grey-oak--2");
  assert.equal(new Set(normalized.map((variant) => variant.id)).size, 2);
  assert.equal(new Set(normalized.map((variant) => variant.label)).size, 2);
});

console.log("Imported variant normalization fixtures passed");
console.log("IMPORT_NORMALIZATION_FIXTURES_OK");