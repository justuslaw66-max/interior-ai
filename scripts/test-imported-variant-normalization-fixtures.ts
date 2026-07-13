import assert from "node:assert/strict";
import { normalizeImportedVariants } from "../lib/catalog/imported-variant-normalization";
import {
  isLikelyFrontShotImage,
  selectPreferredCatalogThumbnail,
} from "../lib/catalog/media-policy";
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

runFixture("Castlery collection_type suffixes normalize to stocked/custom groups", () => {
  const normalized = normalizeImportedVariants({
    productId: "armchair-real-castlery-solange-performance-boucle-chair-white-wash-legs",
    variantEntries: [
      {
        upholstery_code: "chalk_boucle",
        upholstery_label: "Chalk Boucle",
        collection_type: "stocked_fabric",
        leg_finish_code: "white_wash",
        leg_finish_label: "White Wash Wood",
      },
      {
        upholstery_code: "infinity_boucle_cream",
        upholstery_label: "Performance Infinity Boucle, Cream",
        collection_type: "custom_fabric",
        leg_finish_code: "black",
        leg_finish_label: "Black Wood",
      },
    ],
    fallbackThumbnailUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1/example.jpg",
  });

  assert.equal(normalized.length, 2);
  assert.deepEqual(
    normalized.map((variant) => variant.collectionType),
    ["stocked", "custom"],
  );
  assert.deepEqual(
    normalized.map((variant) => variant.legFinishCode),
    ["white-wash", "black"],
  );
  assert.equal(shouldShowCollectionGrouping(normalized.map((variant) => variant.collectionType)), true);
});

runFixture("Fabric labels stay separate from imported wood leg finishes", () => {
  const normalized = normalizeImportedVariants({
    productId: "armchair-real-castlery-mori-performance-fabric-armchair-natural-wood",
    variantEntries: [
      {
        variant: "Performance Fabric Armchair / Performance Creamy White / Natural Wood / Removable Cover",
        finish_code: "natural_wood",
        finish_label: "Natural Wood",
        upholstery_code: "performance_creamy_white",
        upholstery_label: "Performance Creamy White",
        leg_finish_code: "natural_wood",
        leg_finish_label: "Natural Wood",
        swatch_group: "upholstery_option",
      },
      {
        variant: "Performance Fabric Armchair / Performance Creamy White / Walnut Wood / Removable Cover",
        finish_code: "walnut_wood",
        finish_label: "Walnut Wood",
        upholstery_code: "performance_creamy_white",
        upholstery_label: "Performance Creamy White",
        leg_finish_code: "walnut_wood",
        leg_finish_label: "Walnut Wood",
        swatch_group: "upholstery_option",
      },
    ],
    sharedUpholsteryOptions: [
      {
        upholstery_code: "performance_creamy_white",
        upholstery_label: "Performance Creamy White",
        color_label: "Creamy White",
        collection_type: "custom_fabric",
        swatch_group: "upholstery_option",
        material_type: "performance_fabric",
      },
    ],
    fallbackThumbnailUrl: "/assets/thumbs/mori.png",
  });

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]?.label, "Creamy White (Natural Wood)");
  assert.equal(normalized[0]?.finishLabel, "Performance Creamy White");
  assert.equal(normalized[0]?.legFinishLabel, "Natural Wood");
  assert.equal(normalized[0]?.materialType, "Fabric");
  assert.equal(normalized[1]?.label, "Creamy White (Walnut Wood)");
  assert.equal(normalized[1]?.finishLabel, "Performance Creamy White");
  assert.equal(normalized[1]?.legFinishLabel, "Walnut Wood");
  assert.equal(normalized[1]?.materialType, "Fabric");
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

runFixture("Upholstery swatch group keeps leather separate from fabric", () => {
  const normalized = normalizeImportedVariants({
    productId: "armchair-real-castlery-arden-performance-swivel-armchair",
    variantEntries: [
      {
        variant: "Arden Performance Fabric Swivel Armchair / Alpine",
        upholstery_code: "performance_alpine",
        upholstery_label: "Performance Linen Weave (Genova), Alpine",
        swatch_group: "upholstery_option",
      },
      {
        variant: "Arden Leather Swivel Armchair / Cocoa",
        upholstery_code: "cocoa_leather",
        upholstery_label: "Semi-Aniline Leather, Cocoa",
        swatch_group: "upholstery_option",
      },
    ],
    fallbackThumbnailUrl: "/assets/thumbs/armchair-real-castlery-arden-performance-swivel-armchair.png",
  });

  assert.equal(normalized.length, 2);
  assert.equal(normalized[0]?.materialType, "Fabric");
  assert.equal(normalized[1]?.materialType, "Leather");
});

runFixture("Variant media presentation is preserved from authored YAML", () => {
  const normalized = normalizeImportedVariants({
    productId: "armchair-real-castlery-jaron-recliner-armchair-wide-arm",
    variantEntries: [
      {
        variant: "Wide Arm / Marche Ivory",
        upholstery_code: "marche_ivory",
        upholstery_label: "Marche Leather, Ivory",
        thumbnail_url:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1000/v1/example.png",
        gallery_images: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1/example.jpg",
        ],
        media_presentation: "studio",
      },
    ],
    fallbackThumbnailUrl: "/assets/thumbs/armchair-real-castlery-jaron-recliner-armchair-wide-arm.png",
  });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.mediaPresentationMode, "studio");
});

runFixture("Future imports prioritize front shots over authored angle thumbnails", () => {
  const angleUrl = "https://cdn.example.com/products/Example-Table-Angle.jpg";
  const lifestyleUrl = "https://cdn.example.com/products/Example-Table-Lifestyle.jpg";
  const frontUrl = "https://cdn.example.com/products/Example-Table-Front-View.jpg";
  const normalized = normalizeImportedVariants({
    productId: "dining-example-table",
    variantEntries: [
      {
        variant: "180 Oak",
        finish_code: "oak",
        finish_label: "Oak",
        thumbnail_url: angleUrl,
        gallery_images: [lifestyleUrl, frontUrl],
      },
    ],
    fallbackThumbnailUrl: angleUrl,
  });

  assert.equal(normalized[0]?.thumbnailUrl, frontUrl);
  assert.equal(isLikelyFrontShotImage(frontUrl), true);
  assert.equal(isLikelyFrontShotImage("https://cdn.example.com/item.jpg?view=front"), true);
});

runFixture("Thumbnail selection preserves the authored image when no front shot exists", () => {
  const angleUrl = "https://cdn.example.com/products/Example-Table-Angle.jpg";
  assert.equal(
    selectPreferredCatalogThumbnail({
      thumbnailUrl: angleUrl,
      galleryImages: ["https://cdn.example.com/products/Example-Table-Lifestyle.jpg"],
    }),
    angleUrl,
  );
});

runFixture("Local public swatch textures are preserved", () => {
  const normalized = normalizeImportedVariants({
    productId: "armchair-real-castlery-hamilton-round-swivel-armchair",
    variantEntries: [
      {
        variant: "Round Swivel Armchair / Performance Marcel, Brilliant White",
        swatch_group: "upholstery_option",
      },
    ],
    sharedUpholsteryOptions: [
      {
        upholstery_code: "marcel_brilliant_white",
        upholstery_label: "Performance Textured Plain Weave (Marcel), Cream (Brilliant White)",
        color_label: "Cream (Brilliant White)",
        collection_type: "stocked_fabric",
        swatch_group: "upholstery_option",
        swatch_image_url: "/swatches/dawson/marcel-brilliant-white.jpg",
      },
    ],
    fallbackThumbnailUrl: "/assets/thumbs/armchair-real-castlery-hamilton-round-swivel-armchair.png",
  });

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0]?.swatchTextureUrl, "/swatches/dawson/marcel-brilliant-white.jpg");
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
