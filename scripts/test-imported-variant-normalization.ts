import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { normalizeImportedVariants } from "../lib/catalog/imported-variant-normalization";

type UpholsteryOption = {
  upholstery_code?: string;
  upholstery_label?: string;
  collection_type?: string;
  fabric_family?: string;
  fabric_label?: string;
  color_label?: string;
  texture_type?: string;
  swatch_group?: string;
  render_assets?: {
    normal_map?: string;
    tile_scale?: { x?: number; y?: number };
  };
};

type CatalogEntry = {
  assets?: { asset_id?: string; thumbnail_url?: string };
  file_path?: string;
  variants?: Array<Record<string, unknown>>;
  upholstery_options?: UpholsteryOption[];
  upholstery_library_ref?: string;
};

type UpholsteryLibrary = {
  library_key?: string;
  upholstery_options?: UpholsteryOption[];
  family_upholstery_map?: {
    supported_upholstery_codes?: string[];
  };
};

function findCatalogFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCatalogFiles(fullPath));
      continue;
    }
    if (entry.name === "catalog.yaml") files.push(fullPath);
  }
  return files.sort();
}

function loadUpholsteryLibraries() {
  const libraries = new Map<string, UpholsteryLibrary>();
  const libDir = path.join(process.cwd(), "catalog", "furniture", "_upholstery_libraries");
  if (!fs.existsSync(libDir)) return libraries;

  for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) continue;
    const raw = fs.readFileSync(path.join(libDir, entry.name), "utf8");
    const parsed = parse(raw) as UpholsteryLibrary;
    if (parsed?.library_key) libraries.set(parsed.library_key, parsed);
  }

  return libraries;
}

function resolveUpholsteryOptions(entry: CatalogEntry, libraries: Map<string, UpholsteryLibrary>) {
  if (Array.isArray(entry.upholstery_options) && entry.upholstery_options.length > 0) {
    return entry.upholstery_options;
  }
  if (!entry.upholstery_library_ref) return [];
  const library = libraries.get(entry.upholstery_library_ref);
  if (!library?.upholstery_options) return [];
  const supported = library.family_upholstery_map?.supported_upholstery_codes;
  if (!supported?.length) return library.upholstery_options;
  return library.upholstery_options.filter((option) =>
    typeof option.upholstery_code === "string" && supported.includes(option.upholstery_code)
  );
}

function loadCatalogEntries(): CatalogEntry[] {
  const catalogDir = path.join(process.cwd(), "catalog", "furniture");
  const libraries = loadUpholsteryLibraries();
  return findCatalogFiles(catalogDir).map((filePath) => {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parse(raw) as CatalogEntry;
    return {
      ...parsed,
      file_path: filePath,
      upholstery_options: resolveUpholsteryOptions(parsed, libraries),
    };
  });
}

function main() {
  const entries = loadCatalogEntries();
  const failures: string[] = [];
  let scanned = 0;

  for (const entry of entries) {
    const variants = Array.isArray(entry.variants) ? entry.variants : [];
    if (variants.length === 0) continue;

    scanned += 1;
    const productId = entry.assets?.asset_id ?? entry.file_path ?? `entry-${scanned}`;
    const normalized = normalizeImportedVariants({
      productId,
      variantEntries: variants,
      sharedUpholsteryOptions: Array.isArray(entry.upholstery_options) ? entry.upholstery_options : [],
      fallbackThumbnailUrl:
        entry.assets?.thumbnail_url ??
        `/assets/thumbs/${String(productId).replace(/[^a-z0-9_-]+/gi, "-")}.png`,
    });

    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const variant of normalized) {
      if (!variant.id.trim()) failures.push(`${productId}: normalized variant missing id`);
      if (!variant.label.trim()) failures.push(`${productId}: normalized variant ${variant.id} missing label`);
      if (!variant.finishCode?.trim()) failures.push(`${productId}: normalized variant ${variant.id} missing finishCode`);
      if (!variant.finishLabel?.trim()) failures.push(`${productId}: normalized variant ${variant.id} missing finishLabel`);
      if (!variant.materialType) failures.push(`${productId}: normalized variant ${variant.id} missing materialType`);
      if (!variant.thumbnailUrl?.trim()) failures.push(`${productId}: normalized variant ${variant.id} missing thumbnailUrl`);
      if (variant.collectionType && !["stocked", "custom"].includes(variant.collectionType)) {
        failures.push(`${productId}: normalized variant ${variant.id} has invalid collectionType ${variant.collectionType}`);
      }
      if (ids.has(variant.id)) failures.push(`${productId}: duplicate normalized variant id ${variant.id}`);
      if (labels.has(variant.label)) failures.push(`${productId}: duplicate normalized shopper label ${variant.label}`);
      ids.add(variant.id);
      labels.add(variant.label);
    }
  }

  console.log("Imported variant normalization audit summary");
  console.log(`- entries scanned: ${scanned}`);
  console.log(`- failures: ${failures.length}`);

  if (failures.length > 0) {
    failures.forEach((failure) => console.log(`FAIL: ${failure}`));
    throw new Error("Imported variant normalization audit failed");
  }

  console.log("Imported variant normalization audit passed");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}