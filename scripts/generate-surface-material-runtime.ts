import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { auditSurfaceMaterialEntry } from "../lib/surface-material-audit";
import type { SurfaceMaterial } from "../lib/surface-material-schema";
import type {
  SurfaceMaterialCatalogMetadata,
  SurfaceMaterialRenderRecord,
  SurfaceMaterialRenderTuple,
} from "../lib/surface-material-runtime-types";

const GENERATED_RENDER_PATH = path.join(
  process.cwd(),
  "lib",
  "generated",
  "surface-material-render.generated.ts"
);
const GENERATED_CATALOG_PATH = path.join(
  process.cwd(),
  "lib",
  "generated",
  "surface-material-catalog.generated.ts"
);
const GENERATED_TEST_FIXTURE_PATH = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "surface-material-runtime.generated.ts"
);
const LEGACY_GENERATED_PATH = path.join(
  process.cwd(),
  "lib",
  "generated",
  "surface-material-runtime.generated.ts"
);
const PRODUCTION_ROOT = path.join(process.cwd(), "catalog", "surface-materials");
const TEST_FIXTURE_ROOT = path.join(process.cwd(), "tests", "fixtures", "surface-materials");
const CHECK_MODE = process.argv.includes("--check");

type SurfaceMaterialYamlEntry = SurfaceMaterial & {
  file_path: string;
};

function findCatalogFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCatalogFiles(fullPath));
      continue;
    }
    if (entry.name === "catalog.yaml") files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function readSurfaceMaterial(filePath: string): SurfaceMaterialYamlEntry {
  const entry = parse(fs.readFileSync(filePath, "utf8")) as SurfaceMaterial;
  const audit = auditSurfaceMaterialEntry(entry, filePath);
  if (audit.failures.length > 0) {
    throw new Error(
      `Invalid surface material ${path.relative(process.cwd(), filePath)}:\n${audit.failures.join("\n")}`
    );
  }
  return { ...entry, file_path: filePath };
}

function sortMaterials(entries: SurfaceMaterialYamlEntry[]): SurfaceMaterialYamlEntry[] {
  return [...entries].sort((a, b) =>
    a.surface_material.material_id.localeCompare(b.surface_material.material_id)
  );
}

function assertUnique(entries: SurfaceMaterialYamlEntry[], label: string): void {
  const materialIds = new Set<string>();
  const slugs = new Set<string>();
  for (const entry of entries) {
    const { material_id: materialId, slug } = entry.surface_material;
    if (materialIds.has(materialId)) throw new Error(`Duplicate ${label} material_id: ${materialId}`);
    if (slugs.has(slug)) throw new Error(`Duplicate ${label} slug: ${slug}`);
    materialIds.add(materialId);
    slugs.add(slug);
  }
}

function toRenderTuple(entry: SurfaceMaterialYamlEntry): SurfaceMaterialRenderTuple {
  return [
    entry.surface_material.supplier,
    entry.surface_material.brand ?? null,
    entry.surface_material.material_id,
    entry.surface_material.slug,
    entry.surface_material.product_name,
    entry.surface_material.surface_category,
    entry.surface_material.material_family,
    entry.classification.design_effect,
    entry.classification.color_family,
    entry.physical_specs.plank_width_mm ?? null,
    entry.physical_specs.plank_length_mm ?? null,
    entry.physical_specs.tile_width_mm ?? null,
    entry.physical_specs.tile_length_mm ?? null,
    entry.texture_assets.swatch_url ?? null,
    entry.texture_assets.base_color_url ?? null,
    entry.texture_assets.texture_repeat_size_cm ?? null,
    entry.texture_assets.normal_url ?? null,
    entry.texture_assets.roughness_url ?? null,
    entry.texture_assets.ao_url ?? null,
    entry.texture_assets.preview_room_url ?? null,
    entry.texture_assets.tileable,
    entry.rendering.default_rotation_deg,
    entry.rendering.roughness,
    entry.rendering.metalness,
    entry.rendering.normal_strength ?? null,
    entry.rendering.scale_mode,
    entry.rendering.seam_strategy,
    entry.rendering.source_pattern_ids ?? null,
    entry.rendering.available_pattern_layouts ?? null,
    entry.import_governance.publish_status,
    entry.import_governance.publish_blockers,
  ];
}

function toRenderRecord(entry: SurfaceMaterialYamlEntry): SurfaceMaterialRenderRecord {
  const tuple = toRenderTuple(entry);
  return {
    surface_material: {
      supplier: tuple[0],
      brand: tuple[1],
      material_id: tuple[2],
      slug: tuple[3],
      product_name: tuple[4],
      surface_category: tuple[5],
      material_family: tuple[6],
    },
    classification: { design_effect: tuple[7], color_family: tuple[8] },
    physical_specs: {
      plank_width_mm: tuple[9],
      plank_length_mm: tuple[10],
      tile_width_mm: tuple[11],
      tile_length_mm: tuple[12],
    },
    texture_assets: {
      swatch_url: tuple[13],
      base_color_url: tuple[14],
      texture_repeat_size_cm: tuple[15],
      normal_url: tuple[16],
      roughness_url: tuple[17],
      ao_url: tuple[18],
      preview_room_url: tuple[19],
      tileable: tuple[20],
    },
    rendering: {
      default_rotation_deg: tuple[21],
      roughness: tuple[22],
      metalness: tuple[23],
      normal_strength: tuple[24] ?? undefined,
      scale_mode: tuple[25],
      seam_strategy: tuple[26],
      source_pattern_ids: tuple[27] ?? undefined,
      available_pattern_layouts: tuple[28] ?? undefined,
    },
    import_governance: { publish_status: tuple[29], publish_blockers: tuple[30] },
  };
}

function toCatalogMetadata(entry: SurfaceMaterialYamlEntry): SurfaceMaterialCatalogMetadata {
  return {
    material_id: entry.surface_material.material_id,
    source: {
      source_url: entry.source.source_url,
      sample_request_url: entry.source.sample_request_url ?? null,
      license_status: entry.source.license_status,
    },
    classification: {
      tone: entry.classification.tone,
      style_cluster: entry.classification.style_cluster,
      room_suitability: entry.classification.room_suitability,
    },
    physical_specs: {
      total_thickness_mm: entry.physical_specs.total_thickness_mm ?? null,
      wear_layer_mm: entry.physical_specs.wear_layer_mm ?? null,
      waterproof: entry.physical_specs.waterproof ?? null,
      suitable_for_outdoor: entry.physical_specs.suitable_for_outdoor ?? null,
      commercial_grade: entry.physical_specs.commercial_grade ?? null,
    },
    commerce: {
      purchase_mode: entry.commerce.purchase_mode,
      sample_available: entry.commerce.sample_available,
      sample_request_url: entry.commerce.sample_request_url ?? null,
    },
  };
}

function generatedHeader(sourceRoot = "catalog/surface-materials"): string[] {
  return [
    "// This file is generated by scripts/generate-surface-material-runtime.ts.",
    `// Do not edit manually. Update ${sourceRoot} YAML and rerun generation.`,
    "",
  ];
}

function buildRenderFile(entries: SurfaceMaterialYamlEntry[]): string {
  const tuples = sortMaterials(entries).map(toRenderTuple);
  return `${[
    ...generatedHeader(),
    'import type { SurfaceMaterialRenderTuple } from "../surface-material-runtime-types";',
    "",
    'export const SURFACE_MATERIAL_RENDER_GENERATED_MARKER = "surface_render_registry_v1";',
    `export const PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES: readonly SurfaceMaterialRenderTuple[] = ${JSON.stringify(tuples)};`,
  ].join("\n")}\n`;
}

function buildCatalogFile(entries: SurfaceMaterialYamlEntry[]): string {
  const metadata = sortMaterials(entries).map(toCatalogMetadata);
  return `${[
    ...generatedHeader(),
    'import type { SurfaceMaterialCatalogMetadata } from "../surface-material-runtime-types";',
    "",
    'export const SURFACE_MATERIAL_CATALOG_GENERATED_MARKER = "surface_catalog_metadata_v1";',
    `export const PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA: readonly SurfaceMaterialCatalogMetadata[] = ${JSON.stringify(metadata)};`,
  ].join("\n")}\n`;
}

function buildTestFixtureFile(entries: SurfaceMaterialYamlEntry[]): string {
  const records = sortMaterials(entries).map(toRenderRecord);
  return `${[
    ...generatedHeader("tests/fixtures/surface-materials"),
    'import type { SurfaceMaterialRenderRecord } from "../../lib/surface-material-runtime-types";',
    "",
    `export const TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY: readonly SurfaceMaterialRenderRecord[] = ${JSON.stringify(records)};`,
  ].join("\n")}\n`;
}

function writeOrCheck(filePath: string, contents: string): boolean {
  const current = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";
  if (CHECK_MODE) return current === contents;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
  console.log(`Generated ${path.relative(process.cwd(), filePath)}.`);
  return true;
}

const productionEntries = findCatalogFiles(PRODUCTION_ROOT).map(readSurfaceMaterial);
const testFixtureEntries = findCatalogFiles(TEST_FIXTURE_ROOT).map(readSurfaceMaterial);
assertUnique(productionEntries, "production");
assertUnique(testFixtureEntries, "test fixture");

const outputs = [
  [GENERATED_RENDER_PATH, buildRenderFile(productionEntries)],
  [GENERATED_CATALOG_PATH, buildCatalogFile(productionEntries)],
  [GENERATED_TEST_FIXTURE_PATH, buildTestFixtureFile(testFixtureEntries)],
] as const;
const staleOutputs = outputs
  .filter(([filePath, contents]) => !writeOrCheck(filePath, contents))
  .map(([filePath]) => path.relative(process.cwd(), filePath));

if (CHECK_MODE && (staleOutputs.length > 0 || fs.existsSync(LEGACY_GENERATED_PATH))) {
  if (staleOutputs.length > 0) console.error(`Stale generated outputs: ${staleOutputs.join(", ")}`);
  if (fs.existsSync(LEGACY_GENERATED_PATH)) {
    console.error(`Legacy generated output must be removed: ${path.relative(process.cwd(), LEGACY_GENERATED_PATH)}`);
  }
  console.error("Run npm run generate:surface-material-runtime.");
  process.exit(1);
}

if (CHECK_MODE) console.log("Surface material render, catalog, and test-fixture outputs are up to date.");
