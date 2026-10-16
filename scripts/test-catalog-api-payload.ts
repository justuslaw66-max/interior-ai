import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildCatalogApiPayload, summarizeSurfaceMaterialForCatalogApi } from "../lib/catalog-api-payload";
import { getCatalogRegistry, getSurfaceMaterials } from "../lib/catalog-registry";
import { getAllCatalogYamlEntries } from "../lib/catalog-yaml";

// The open /api/catalog route lists surface materials as short summaries, not full records (16 Oct 2026: with Gardenia's
// 1,314 published entries the full records came to about 14 MB of JSON, as the list appeared twice).

const SUMMARY_KEYS = [
  "brand",
  "collection",
  "material_family",
  "material_id",
  "product_name",
  "publish_status",
  "purchase_mode",
  "size_mm",
  "slug",
  "supplier",
  "surface_category",
  "swatch_url",
].sort();
const MAX_SUMMARY_BYTES = 1000;
const MAX_PAYLOAD_BYTES = 6 * 1024 * 1024;

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

function main() {
  // The route runs in production, where only published materials are listed.
  Object.assign(process.env, { NODE_ENV: "production" });
  const registry = getCatalogRegistry({ includeDrafts: false });
  const items = getAllCatalogYamlEntries();
  const payload = buildCatalogApiPayload({ items, products: registry.products, surfaceMaterials: registry.surfaceMaterials });

  const published = getSurfaceMaterials({ includeDrafts: true }).filter(
    (material) => material.import_governance.publish_status === "published"
  );
  assert.ok(published.length > 0, "the catalogue should have published surface materials to list");
  assert.deepEqual(
    payload.surfaceMaterials.map((summary) => summary.material_id),
    published.map((material) => material.surface_material.material_id),
    "/api/catalog must list every published surface material, in catalogue order, and no draft"
  );
  assert.deepEqual(payload.registry.surfaceMaterials, payload.surfaceMaterials, "registry.surfaceMaterials must be the same summaries");

  const extraKeys = payload.surfaceMaterials.filter((summary) => Object.keys(summary).sort().join() !== SUMMARY_KEYS.join());
  assert.deepEqual(extraKeys.map((summary) => summary.material_id), [], "each surface material summary has exactly the summary fields");

  const summaryBytes = byteLength(payload.surfaceMaterials);
  assert.ok(
    summaryBytes <= MAX_SUMMARY_BYTES * payload.surfaceMaterials.length,
    `surface material summaries average ${Math.round(summaryBytes / payload.surfaceMaterials.length)} bytes, over ${MAX_SUMMARY_BYTES}`
  );
  // Control: the full records would not fit the budget, so the budget does guard against them coming back.
  assert.ok(
    byteLength(registry.surfaceMaterials) > MAX_SUMMARY_BYTES * registry.surfaceMaterials.length,
    "control: full surface material records should exceed the summary budget"
  );
  const payloadBytes = byteLength(payload);
  assert.ok(payloadBytes <= MAX_PAYLOAD_BYTES, `/api/catalog payload is ${payloadBytes} bytes, over ${MAX_PAYLOAD_BYTES}`);

  const doricaId = "gardenia-flooring-dorica-crema-0010148-60x120-r11";
  const dorica = published.find((material) => material.surface_material.material_id === doricaId);
  assert.ok(dorica, `${doricaId} should be published`);
  assert.deepEqual(summarizeSurfaceMaterialForCatalogApi(dorica), {
    material_id: doricaId,
    slug: dorica.surface_material.slug,
    product_name: dorica.surface_material.product_name,
    supplier: dorica.surface_material.supplier,
    brand: dorica.surface_material.brand ?? null,
    collection: dorica.surface_material.collection ?? null,
    surface_category: "flooring",
    material_family: dorica.surface_material.material_family,
    size_mm: { width: 1200, length: 600 }, // as the record gives it: tile_width_mm 1200, tile_length_mm 600
    swatch_url: dorica.texture_assets.swatch_url,
    purchase_mode: "quote_or_sample",
    publish_status: "published",
  });

  assert.equal(payload.items, items, "furniture items are listed as before");
  assert.equal(payload.total, items.length);
  assert.equal(payload.products, registry.products);
  assert.deepEqual(payload.statusCounts, payload.publication.statusCounts);

  const routeSource = fs.readFileSync(path.join(process.cwd(), "app/api/catalog/route.ts"), "utf8");
  assert.match(routeSource, /buildCatalogApiPayload\(/, "/api/catalog must build its response with buildCatalogApiPayload");
  assert.doesNotMatch(routeSource, /surfaceMaterials: registry\.surfaceMaterials,\s*\}\);/, "the route must not return full records");

  console.log("Catalog API payload test passed.");
  console.log(`- surface material summaries: ${payload.surfaceMaterials.length} (${Math.round(summaryBytes / 1024)} KB)`);
  console.log(`- full records would be: ${Math.round(byteLength(registry.surfaceMaterials) / 1024)} KB`);
  console.log(`- payload: ${Math.round(payloadBytes / 1024)} KB`);
}

main();
