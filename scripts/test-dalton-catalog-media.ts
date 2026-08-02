import assert from "node:assert/strict";
import { CATALOG_ITEMS_MAP } from "../lib/catalog";
import { getFreshCatalogYamlMap } from "../lib/catalog-yaml";
import { buildCatalogCardView, buildCatalogDetailView } from "../lib/catalog/view-builders";

const DALTON_ID = "bed-real-castlery-dalton";
const APPROVED_DALTON_HERO_URL =
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888284/crusader/variants/50440789-NG4001/Dalton-Queen-Size-Bed-Front-1676888282.jpg";

const EXPECTED_THUMB_BY_VARIANT_ID: Record<string, string> = {
  standard_queen_beach_linen: APPROVED_DALTON_HERO_URL,
  standard_king_beach_linen:
    "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888370/crusader/variants/50440790-NG4001/Dalton-King-Size-Bed-Front-1676888367.jpg",
  storage_single_beach_linen:
    "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452433/crusader/variants/50440980-NG4001/Dalton-Single-Storage-Bed-Front-1740452431.jpg",
  storage_super_single_beach_linen:
    "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452711/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Front-1740452709.jpg",
  storage_queen_beach_linen:
    "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414459/crusader/variants/T50441115-NG4001/Dalton-Storage-Queen-Size-Bed-Front_1-1678414456.jpg",
  storage_king_beach_linen:
    "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414766/crusader/variants/T50441116-NG4001/Dalton-Storage-King-Size-Bed-Front_1-1678414764.jpg",
};

function run(): void {
  const item = CATALOG_ITEMS_MAP.get(DALTON_ID);
  assert(item, "Expected the Dalton bed in the runtime catalog");
  assert.equal(item.assets.thumbUrl, APPROVED_DALTON_HERO_URL);
  assert.equal(item.variants.length, Object.keys(EXPECTED_THUMB_BY_VARIANT_ID).length);

  const card = buildCatalogCardView(item);
  assert.equal(card.thumbUrl, APPROVED_DALTON_HERO_URL, "Dalton card must use the approved Front hero");

  for (const variant of item.variants) {
    const expectedThumb = EXPECTED_THUMB_BY_VARIANT_ID[variant.id];
    assert(expectedThumb, `Unexpected Dalton variant: ${variant.id}`);
    assert.equal(variant.thumbnailUrl, expectedThumb, `${variant.id} must use its Front image`);

    const gallery = variant.galleryImages ?? [];
    assert.equal(gallery[0], expectedThumb, `${variant.id} gallery must start with its thumbnail`);
    assert(
      gallery.length >= 13,
      `${variant.id} must expose the full official photo gallery and dimensions image`,
    );
    assert.equal(
      new Set(gallery).size,
      gallery.length,
      `${variant.id} gallery must not contain duplicate URLs`,
    );

    const detail = buildCatalogDetailView(item, variant.id);
    assert.equal(detail.images[0], expectedThumb, `${variant.id} preview must open on its Front image`);
    assert.deepEqual(
      detail.images,
      gallery,
      `${variant.id} preview must not mix in media from another Dalton size`,
    );
  }

  const yamlEntry = getFreshCatalogYamlMap().get(DALTON_ID);
  assert(yamlEntry, "Expected the Dalton YAML catalog mirror");
  assert.equal(yamlEntry.assets?.thumbnail_url, APPROVED_DALTON_HERO_URL);
  assert.deepEqual(yamlEntry.assets?.gallery_images, item.variants[0]?.galleryImages);
  assert.equal(yamlEntry.variants?.length, item.variants.length);

  yamlEntry.variants?.forEach((yamlVariant, index) => {
    const runtimeVariant = item.variants[index];
    assert(runtimeVariant, `Missing runtime Dalton variant at index ${index}`);
    assert.equal(yamlVariant.thumbnail_url, runtimeVariant.thumbnailUrl);
    assert.deepEqual(yamlVariant.gallery_images, runtimeVariant.galleryImages);
  });

  console.log("Dalton catalog media checks passed");
}

run();
