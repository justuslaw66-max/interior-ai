import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

type ParsedCatalogYaml = {
  category?: unknown;
  assets?: {
    asset_id?: unknown;
  };
};

// Helper to find all catalog YAML files
function findCatalogFiles(dir: string): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCatalogFiles(fullPath));
    } else if (entry.name === "catalog.yaml") {
      files.push(fullPath);
    }
  }
  return files;
}

// Helper to parse YAML entries
function parseYamlEntries(): Array<{ asset_id: string; category: string; source_file: string }> {
  const catalogDir = path.join(process.cwd(), "catalog");
  const files = findCatalogFiles(catalogDir);
  const entries: Array<{ asset_id: string; category: string; source_file: string }> = [];

  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const yaml = parse(content) as ParsedCatalogYaml;

      const assetId = typeof yaml.assets?.asset_id === "string" ? yaml.assets.asset_id : undefined;
      const category = typeof yaml.category === "string" ? yaml.category : undefined;

      if (assetId && category) {
        entries.push({
          asset_id: assetId,
          category,
          source_file: path.relative(process.cwd(), filePath),
        });
      }
    } catch (error) {
      console.warn(`Warning: Failed to parse ${filePath}:`, error);
    }
  }

  return entries;
}

type RegistrySyncResult = {
  yamlEntries: number;
  catalogEntries: number;
  missingInRegistry: Array<{ id: string; category: string; yamlFile: string }>;
  categoryMismatches: Array<{ id: string; yamlCategory: string; registryCategory: string }>;
  invalidCategories: Array<{ id: string; category: string; yamlFile: string }>;
  hasFailures: boolean;
};

const VALID_CATEGORIES = new Set([
  "sofa",
  "ottoman",
  "coffee_table",
  "dining_table",
  "dining_bench",
  "rug",
  "tv_console",
  "sideboard",
  "accent_chair",
  "floor_lamp",
]);

const CATEGORY_ALIASES: Record<string, string> = {
  sectional_sofa: "sofa",
  armchair: "accent_chair",
};

// Extract product IDs and categories from lib/catalog.ts
function extractCatalogEntries(): Record<string, { category: string }> {
  const catalogPath = path.join(process.cwd(), "lib/catalog.ts");
  const content = fs.readFileSync(catalogPath, "utf-8");

  const entries: Record<string, { category: string }> = {};

  // Look for pattern: "product-id": { ... category: "sofa" ... }
  // This regex extracts the product ID and captures the category value
  const productPattern = /["']([a-zA-Z0-9\-_]+)["']\s*:\s*\{\s*[^}]*category\s*:\s*["']([a-z_]+)["']/g;
  let match;

  while ((match = productPattern.exec(content)) !== null) {
    const [, id, category] = match;
    entries[id] = { category };
  }

  return entries;
}

function extractConstObjectBody(content: string, constName: string): string {
  const marker = `const ${constName}:`;
  const markerIndex = content.indexOf(marker);
  if (markerIndex < 0) return "";

  const objectStart = content.indexOf("{", markerIndex);
  if (objectStart < 0) return "";

  let depth = 0;
  for (let i = objectStart; i < content.length; i += 1) {
    const char = content[i];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return content.slice(objectStart + 1, i);
      }
    }
  }

  return "";
}

function extractLegacyRegistryIds(): Set<string> {
  const catalogPath = path.join(process.cwd(), "lib/catalog.ts");
  const content = fs.readFileSync(catalogPath, "utf-8");

  const legacyThumbBody = extractConstObjectBody(content, "LEGACY_THUMB_URL_OVERRIDES");
  const legacyAssetBody = extractConstObjectBody(content, "LEGACY_ASSET_ID_OVERRIDES");

  const ids = new Set<string>();

  const thumbKeyPattern = /\n\s*"([^"]+)"\s*:/g;
  let thumbMatch: RegExpExecArray | null;
  while ((thumbMatch = thumbKeyPattern.exec(legacyThumbBody)) !== null) {
    ids.add(thumbMatch[1]);
  }

  const assetValuePattern = /:\s*"([^"]+)"/g;
  let assetMatch: RegExpExecArray | null;
  while ((assetMatch = assetValuePattern.exec(legacyAssetBody)) !== null) {
    ids.add(assetMatch[1]);
  }

  return ids;
}

function runRegistrySyncAudit(): RegistrySyncResult {
  console.log("\n=== Catalog Registry Sync Audit ===\n");

  // Get all YAML entries
  const yamlEntries = parseYamlEntries();
  console.log(`Found ${yamlEntries.length} YAML catalog entries`);

  // Load catalog registry
  const catalogEntries = extractCatalogEntries();
  const catalogIds = new Set(Object.keys(catalogEntries));
  const legacyRegistryIds = extractLegacyRegistryIds();
  const knownRegistryIds = new Set([...catalogIds, ...legacyRegistryIds]);
  console.log(`Found ${catalogIds.size} entries in lib/catalog.ts registry\n`);

  const result: RegistrySyncResult = {
    yamlEntries: yamlEntries.length,
    catalogEntries: catalogIds.size,
    missingInRegistry: [],
    categoryMismatches: [],
    invalidCategories: [],
    hasFailures: false,
  };

  // Check each YAML entry
  for (const entry of yamlEntries) {
    const assetId = entry.asset_id;
    const category = CATEGORY_ALIASES[entry.category] ?? entry.category;
    const yamlFile = entry.source_file || "unknown";

    // Check if category is valid
    if (!VALID_CATEGORIES.has(category)) {
      result.invalidCategories.push({
        id: assetId,
        category,
        yamlFile,
      });
      result.hasFailures = true;
      continue;
    }

    // Check if asset_id exists in registry
    if (!knownRegistryIds.has(assetId)) {
      result.missingInRegistry.push({
        id: assetId,
        category,
        yamlFile,
      });
      result.hasFailures = true;
      continue;
    }

    // Check category consistency
    const registryEntry = catalogEntries[assetId];
    const registryCategory = CATEGORY_ALIASES[registryEntry?.category] ?? registryEntry?.category;
    if (registryEntry && registryCategory !== category) {
      result.categoryMismatches.push({
        id: assetId,
        yamlCategory: category,
        registryCategory: registryCategory,
      });
      result.hasFailures = true;
    }
  }

  // Print results
  if (result.invalidCategories.length > 0) {
    console.log("❌ FAILURES: Invalid category values in YAML files:");
    for (const item of result.invalidCategories) {
      console.log(`   - ${item.id}`);
      console.log(`     Category: "${item.category}" (valid values: ${Array.from(VALID_CATEGORIES).join(", ")})`);
      console.log(`     File: ${item.yamlFile}`);
    }
    console.log();
  }

  if (result.missingInRegistry.length > 0) {
    console.log("❌ FAILURES: YAML entries missing from lib/catalog.ts registry:");
    for (const item of result.missingInRegistry) {
      console.log(`   - ${item.id}`);
      console.log(`     Category: ${item.category}`);
      console.log(`     YAML File: ${item.yamlFile}`);
      console.log(`     ACTION: Add this entry to CATALOG object in lib/catalog.ts`);
    }
    console.log();
  }

  if (result.categoryMismatches.length > 0) {
    console.log("❌ FAILURES: Category mismatches between YAML and registry:");
    for (const item of result.categoryMismatches) {
      console.log(`   - ${item.id}`);
      console.log(`     YAML category: ${item.yamlCategory}`);
      console.log(`     Registry category: ${item.registryCategory}`);
      console.log(`     ACTION: Update registry entry in lib/catalog.ts to match YAML category`);
    }
    console.log();
  }

  if (!result.hasFailures) {
    console.log("✅ All YAML entries are properly registered with correct categories");
  }

  console.log("\nRegistry Sync Summary:");
  console.log(`- Total YAML entries: ${result.yamlEntries}`);
  console.log(`- Registered in lib/catalog.ts: ${result.catalogEntries}`);
  console.log(`- Missing from registry: ${result.missingInRegistry.length}`);
  console.log(`- Category mismatches: ${result.categoryMismatches.length}`);
  console.log(`- Invalid categories: ${result.invalidCategories.length}`);

  return result;
}

try {
  const result = runRegistrySyncAudit();
  if (result.hasFailures) {
    process.exitCode = 1;
    console.error("\n❌ Catalog registry sync validation failed");
    process.exit(1);
  }
  console.log("\n✅ Catalog registry sync validation passed\n");
} catch (error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error("\n❌ Error during registry sync audit:", errorMessage);
  process.exit(1);
}
