import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  auditSurfaceMaterialEntry,
  buildSurfaceMaterialAdminAuditSummaries,
  getRelativeSurfaceMaterialPath,
  runSurfaceMaterialAudit,
} from "../lib/surface-material-audit";
import { getAllSurfaceMaterialYamlEntries } from "../lib/surface-material-yaml";
import { SURFACE_MATERIAL_VOCABULARY, type SurfaceMaterial } from "../lib/surface-material-schema";
import {
  getDraftFlooringMaterialsForAdmin,
  getFlooringMaterials,
  getPublishedFlooringMaterials,
  getSurfaceMaterialById,
} from "../lib/catalog-registry";
import {
  buildCheckoutReadinessRows,
  buildSurfaceMaterialCsvRows,
} from "../lib/share-shopping-csv";
import { buildRoomSurfaceMaterialBomRows } from "../lib/surface-material-bom";
import { getRuntimeSurfaceMaterialById } from "../lib/surface-material-runtime";
import {
  PRODUCTION_SURFACE_MATERIAL_RENDER_REGISTRY,
  TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY,
} from "../lib/generated/surface-material-runtime.generated";
import type { RoomSnapshot } from "../lib/room-types";

const result = runSurfaceMaterialAudit();
const entries = getAllSurfaceMaterialYamlEntries();
const adminSummaries = buildSurfaceMaterialAdminAuditSummaries();

function cloneSurfaceMaterial(entry: SurfaceMaterial): SurfaceMaterial {
  return JSON.parse(JSON.stringify(entry)) as SurfaceMaterial;
}

function buildValidPublishedFixture(source: SurfaceMaterial): SurfaceMaterial {
  const entry = cloneSurfaceMaterial(source);
  entry.surface_material.material_id = "test-published-flooring";
  entry.surface_material.slug = "test-published-flooring";
  entry.surface_material.product_name = "Test Published Flooring";
  entry.source.license_status = "confirmed";
  entry.source.notes = [];
  entry.source.sample_request_url = "https://example.com/request-sample";
  entry.texture_assets.swatch_url = "/assets/test/surface-materials/test-swatch.png";
  entry.texture_assets.base_color_url = "/assets/test/surface-materials/test-base-color.png";
  entry.texture_assets.tileable = true;
  entry.texture_assets.texture_repeat_size_cm = { width: 100, height: 100 };
  entry.physical_specs.plank_or_tile_format = "plank";
  entry.physical_specs.plank_width_mm = 180;
  entry.physical_specs.plank_length_mm = 1200;
  entry.physical_specs.total_thickness_mm = 5;
  entry.physical_specs.wear_layer_mm = 0.3;
  entry.commerce.sample_available = true;
  entry.commerce.sample_request_url = "https://example.com/request-sample";
  entry.import_governance.publish_status = "published";
  entry.import_governance.publish_blockers = [];
  return entry;
}

assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("luxury_vinyl_tile"),
  "surface material vocabulary must include LVT"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("spc"),
  "surface material vocabulary must include SPC"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("vinyl_sheet"),
  "surface material vocabulary must include vinyl sheet"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("engineered_timber"),
  "surface material vocabulary must include engineered timber"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("wpc_decking"),
  "surface material vocabulary must include WPC decking"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("carpet_tile"),
  "surface material vocabulary must include carpet tile"
);

const REQUIRED_ROOM_SUITABILITY_VALUES = [
  "living_room",
  "bedroom",
  "dining_room",
  "study",
  "hallway",
  "kitchen",
  "bathroom",
  "balcony",
  "commercial",
  "hospitality",
  "education",
] as const;

for (const required of REQUIRED_ROOM_SUITABILITY_VALUES) {
  assert.ok(
    SURFACE_MATERIAL_VOCABULARY.room_suitability.includes(required),
    `surface material vocabulary must include room suitability ${required}`
  );
}

assert.equal(result.hasFailures, false, [
  "Surface material audit failed.",
  ...result.parseErrorFiles.map((filePath) => `PARSE: ${getRelativeSurfaceMaterialPath(filePath)}`),
  ...Array.from(result.duplicateMaterialIds.entries()).map(
    ([materialId, filePaths]) => `DUPLICATE material_id ${materialId}: ${filePaths.map(getRelativeSurfaceMaterialPath).join(", ")}`
  ),
  ...Array.from(result.duplicateSlugs.entries()).map(
    ([slug, filePaths]) => `DUPLICATE slug ${slug}: ${filePaths.map(getRelativeSurfaceMaterialPath).join(", ")}`
  ),
  ...result.audits.flatMap((audit) =>
    audit.failures.map((failure) => `${getRelativeSurfaceMaterialPath(audit.filePath)}: ${failure}`)
  ),
].join("\n"));

const goodrichEntries = entries.filter((entry) => entry.surface_material.supplier === "goodrich_global");
const productionRuntimeIds = PRODUCTION_SURFACE_MATERIAL_RENDER_REGISTRY.map(
  (entry) => entry.surface_material.material_id
);
const testFixtureRuntimeIds = TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY.map(
  (entry) => entry.surface_material.material_id
);
assert.ok(goodrichEntries.length >= 4, "expected at least four draft Goodrich surface material fixtures");
assert.equal(result.duplicateMaterialIds.size, 0, "surface material material_id values must be unique");
assert.equal(result.duplicateSlugs.size, 0, "surface material slug values must be unique");
assert.equal(getPublishedFlooringMaterials().length, 0, "draft Goodrich fixtures must not publish to consumer flooring registry");
assert.ok(
  goodrichEntries.every((entry) => productionRuntimeIds.includes(entry.surface_material.material_id)),
  "production runtime registry must be generated from Goodrich YAML entries"
);
assert.ok(
  !productionRuntimeIds.includes("test-only-published-flooring"),
  "test-only published flooring fixture must not be in production runtime data"
);
assert.ok(
  testFixtureRuntimeIds.includes("test-only-published-flooring"),
  "test runtime fixture registry must include the test-only published flooring"
);
assert.equal(
  getRuntimeSurfaceMaterialById("test-only-published-flooring"),
  null,
  "default runtime must exclude test-only published flooring unless fixture gate is enabled"
);
execFileSync(
  process.execPath,
  [
    "-r",
    "ts-node/register/transpile-only",
    "-r",
    "tsconfig-paths/register",
    "-e",
    [
      "process.env.NODE_ENV='test';",
      "const { getRuntimeSurfaceMaterialById } = require('./lib/surface-material-runtime');",
      "const fixture = getRuntimeSurfaceMaterialById('test-only-published-flooring');",
      "if (!fixture || fixture.import_governance.publish_status !== 'published') process.exit(1);",
    ].join(" "),
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TS_NODE_COMPILER_OPTIONS: '{"module":"CommonJS","moduleResolution":"node"}',
    },
    stdio: "pipe",
  }
);
assert.ok(
  getDraftFlooringMaterialsForAdmin().length >= goodrichEntries.length,
  "admin flooring registry must expose draft surface materials"
);
assert.equal(
  getFlooringMaterials({ includeDrafts: true }).length,
  getDraftFlooringMaterialsForAdmin().length + getPublishedFlooringMaterials().length,
  "flooring registry should include drafts only when requested/dev-visible"
);
assert.ok(
  getSurfaceMaterialById("goodrich-lvt-wood-look-draft"),
  "surface material lookup should resolve by material_id"
);
const goodrichAdminSummary = adminSummaries.find(
  (entry) => entry.materialId === "goodrich-lvt-wood-look-draft"
);
assert.ok(goodrichAdminSummary, "admin audit summary should include Goodrich LVT draft");
assert.equal(goodrichAdminSummary.supplier, "goodrich_global");
assert.equal(goodrichAdminSummary.brand, "Goodrich Global");
assert.equal(goodrichAdminSummary.materialFamily, "luxury_vinyl_tile");
assert.equal(goodrichAdminSummary.publishStatus, "draft");
assert.equal(goodrichAdminSummary.licenseStatus, "needs_permission");
assert.equal(
  goodrichAdminSummary.sourceUrl,
  "https://www.goodrichglobal.com/singapore/product-category/flooring/"
);
assert.equal(
  goodrichAdminSummary.sampleRequestUrl,
  "https://www.goodrichglobal.com/singapore/contact-us/request-samples/"
);
assert.ok(goodrichAdminSummary.missingAssets.includes("swatch_url"));
assert.ok(goodrichAdminSummary.missingAssets.includes("base_color_url"));
assert.ok(goodrichAdminSummary.missingAssets.includes("known_tileability"));
assert.ok(goodrichAdminSummary.missingAssets.includes("texture_repeat_size_cm"));
assert.ok(goodrichAdminSummary.missingSpecs.includes("plank_width_mm"));
assert.ok(goodrichAdminSummary.missingSpecs.includes("plank_length_mm"));
assert.ok(goodrichAdminSummary.missingSpecs.includes("total_thickness_mm"));
assert.ok(goodrichAdminSummary.missingSpecs.includes("wear_layer_mm"));
assert.ok(goodrichAdminSummary.blockers.includes("confirm_supplier_image_usage_rights"));

for (const entry of goodrichEntries) {
  assert.equal(entry.import_governance.publish_status, "draft");
  assert.equal(entry.source.license_status, "needs_permission");
  assert.equal(entry.texture_assets.swatch_url, null);
  assert.equal(entry.texture_assets.base_color_url, null);
  assert.ok(
    getRuntimeSurfaceMaterialById(entry.surface_material.material_id),
    `${entry.surface_material.material_id} must be available to client-side floor rendering`
  );
  assert.ok(
    entry.import_governance.publish_blockers.includes("confirm_exact_goodrich_product_code"),
    `${entry.surface_material.material_id} must block publish until exact product code is confirmed`
  );
  assert.ok(
    entry.import_governance.publish_blockers.includes("confirm_supplier_image_usage_rights"),
    `${entry.surface_material.material_id} must block publish until image rights are confirmed`
  );
  assert.ok(
    entry.import_governance.publish_blockers.includes("confirm_texture_tileability"),
    `${entry.surface_material.material_id} must block publish until texture tileability is confirmed`
  );
}

const roomWithSurfaceMaterial: RoomSnapshot = {
  id: "room_surface_test",
  name: "Surface Test Room",
  roomType: "living",
  geometry: { width: 4, depth: 3 },
  surfaces: {
    floorMaterialId: "goodrich-lvt-wood-look-draft",
    floorRotationDeg: 0,
    floorPattern: "straight",
    floorScale: 1,
  },
  items: [],
  zones: [],
  savedViews: [],
};
const checkoutRows = buildCheckoutReadinessRows([roomWithSurfaceMaterial]);
assert.equal(checkoutRows.length, 0, "room surface flooring must not create furniture checkout rows");
assert.equal(
  roomWithSurfaceMaterial.surfaces?.floorMaterialId,
  "goodrich-lvt-wood-look-draft",
  "room state must store selected floorMaterialId on surfaces"
);
assert.equal(
  getRuntimeSurfaceMaterialById(roomWithSurfaceMaterial.surfaces?.floorMaterialId)?.surface_material.material_id,
  "goodrich-lvt-wood-look-draft",
  "client floor material resolver must return the selected surface material"
);
const bomRows = buildRoomSurfaceMaterialBomRows([roomWithSurfaceMaterial]);
assert.equal(bomRows.length, 1, "room surface flooring must create one BOM row");
assert.equal(bomRows[0].roomAreaSqm, 12);
assert.equal(bomRows[0].orderAreaSqm, 13.2);
assert.equal(bomRows[0].wasteFactor, 0.1);
const surfaceCsvRows = buildSurfaceMaterialCsvRows([roomWithSurfaceMaterial]);
assert.equal(surfaceCsvRows.length, 1, "room surface flooring must create one area-based BOM CSV row");
assert.equal(surfaceCsvRows[0].category, "Flooring Material");
assert.equal(surfaceCsvRows[0].productId, "goodrich-lvt-wood-look-draft");
assert.equal(surfaceCsvRows[0].quantity, 13.2);

const fixtureSource = goodrichEntries[0];
assert.ok(fixtureSource, "expected a Goodrich fixture source for negative audit cases");
const validPublishedFixture = buildValidPublishedFixture(fixtureSource);
assert.deepEqual(
  auditSurfaceMaterialEntry(validPublishedFixture).failures,
  [],
  "fully specified published flooring fixture should pass surface audit"
);

const invalidVocabFixture = cloneSurfaceMaterial(validPublishedFixture);
invalidVocabFixture.surface_material.material_family = "invalid_family" as SurfaceMaterial["surface_material"]["material_family"];
invalidVocabFixture.classification.tone = ["warm", "not_approved"];
const invalidVocabFailures = auditSurfaceMaterialEntry(invalidVocabFixture).failures.join("\n");
assert.match(invalidVocabFailures, /surface_material\.material_family has invalid value/);
assert.match(invalidVocabFailures, /classification\.tone\[1\] has invalid value/);

const missingPublishedTextureFixture = cloneSurfaceMaterial(validPublishedFixture);
missingPublishedTextureFixture.texture_assets.swatch_url = null;
missingPublishedTextureFixture.texture_assets.base_color_url = null;
missingPublishedTextureFixture.texture_assets.tileable = "needs_confirmation";
missingPublishedTextureFixture.texture_assets.texture_repeat_size_cm = null;
missingPublishedTextureFixture.physical_specs.plank_width_mm = null;
missingPublishedTextureFixture.import_governance.publish_blockers = ["add_swatch_asset"];
const missingPublishedTextureFailures = auditSurfaceMaterialEntry(missingPublishedTextureFixture).failures.join("\n");
assert.match(missingPublishedTextureFailures, /published surface materials require texture_assets\.swatch_url/);
assert.match(missingPublishedTextureFailures, /published surface materials require texture_assets\.base_color_url/);
assert.match(missingPublishedTextureFailures, /published surface materials require known texture tileability/);
assert.match(missingPublishedTextureFailures, /published surface materials require texture_assets\.texture_repeat_size_cm/);
assert.match(missingPublishedTextureFailures, /published surface materials require physical dimensions/);
assert.match(missingPublishedTextureFailures, /published surface materials must not have unresolved publish blockers/);

const missingDraftBlockerFixture = cloneSurfaceMaterial(fixtureSource);
missingDraftBlockerFixture.import_governance.publish_blockers = ["confirm_exact_goodrich_product_code"];
const missingDraftBlockerFailures = auditSurfaceMaterialEntry(missingDraftBlockerFixture).failures.join("\n");
assert.match(missingDraftBlockerFailures, /add_swatch_asset blocker/);
assert.match(missingDraftBlockerFailures, /add_tileable_base_color_texture blocker/);
assert.match(missingDraftBlockerFailures, /confirm_supplier_image_usage_rights blocker/);
assert.match(missingDraftBlockerFailures, /confirm_texture_tileability blocker/);
assert.match(missingDraftBlockerFailures, /confirm_physical_dimensions blocker/);

const missingSamplePathFixture = cloneSurfaceMaterial(validPublishedFixture);
missingSamplePathFixture.source.sample_request_url = null;
missingSamplePathFixture.commerce.sample_request_url = null;
const missingSamplePathFailures = auditSurfaceMaterialEntry(missingSamplePathFixture).failures.join("\n");
assert.match(missingSamplePathFailures, /sample_request_url is required/);
assert.match(missingSamplePathFailures, /quote_or_sample surface materials require/);

console.log("Surface material schema audit passed.");
console.log(`- files scanned: ${result.files.length}`);
console.log(`- Goodrich draft fixtures: ${goodrichEntries.length}`);
