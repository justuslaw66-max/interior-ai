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
  brand?: string;
  category?: string;
  product_family?: string;
  product_name?: string;
  source_url?: string;
  status?: string;
  publication_state?: string;
  assets?: {
    asset_id?: string;
    thumbnail_url?: string;
    gallery_images?: string[];
    media_presentation?: string;
    mediaPresentation?: string;
  };
  media_presentation?: string;
  mediaPresentation?: string;
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

const LEGACY_LOCAL_RETAILER_MEDIA_ALLOWLIST = new Set([
  "sofa-real-castlery-dawson-wide-chaise-sectional-left",
]);

function isLocalThumbUrl(value: unknown): boolean {
  return typeof value === "string" && /^\/assets\/thumbs\/.+\.(png|jpe?g|webp)$/i.test(value.trim());
}

function isRetailerHostedCastleryUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim();
  return /^https:\/\/res\.cloudinary\.com\/castlery\/image\//i.test(normalized);
}

function isCastlerySeatingImport(entry: CatalogEntry): boolean {
  const source = `${entry.brand ?? ""} ${entry.source_url ?? ""}`.toLowerCase();
  if (!source.includes("castlery")) return false;

  const seatingSignal = [
    entry.category,
    entry.product_family,
    entry.product_name,
    entry.assets?.asset_id,
    entry.file_path,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return /\b(sofa|sectional|armchair|recliner|ottoman|accent[_ -]?chair)\b/.test(seatingSignal);
}

function collectDisplayMediaUrls(entry: CatalogEntry): Array<{ label: string; url: unknown }> {
  const urls: Array<{ label: string; url: unknown }> = [];
  urls.push({ label: "assets.thumbnail_url", url: entry.assets?.thumbnail_url });
  for (const [index, url] of (entry.assets?.gallery_images ?? []).entries()) {
    urls.push({ label: `assets.gallery_images[${index}]`, url });
  }

  for (const [variantIndex, variant] of (entry.variants ?? []).entries()) {
    urls.push({ label: `variants[${variantIndex}].thumbnail_url`, url: variant.thumbnail_url });
    const gallery = Array.isArray(variant.gallery_images) ? variant.gallery_images : [];
    for (const [galleryIndex, url] of gallery.entries()) {
      urls.push({ label: `variants[${variantIndex}].gallery_images[${galleryIndex}]`, url });
    }

    const purchaseOptions = Array.isArray(variant.purchase_options) ? variant.purchase_options : [];
    for (const [optionIndex, option] of purchaseOptions.entries()) {
      if (!option || typeof option !== "object") continue;
      urls.push({
        label: `variants[${variantIndex}].purchase_options[${optionIndex}].image_url`,
        url: (option as { image_url?: unknown }).image_url,
      });
    }
  }

  return urls.filter((entry) => typeof entry.url === "string" && String(entry.url).trim().length > 0);
}

function validateRetailerMediaPolicy(entry: CatalogEntry, failures: string[]) {
  if (!isCastlerySeatingImport(entry)) return;

  const productId = entry.assets?.asset_id ?? entry.file_path ?? "unknown-castlery-seating-entry";
  if (LEGACY_LOCAL_RETAILER_MEDIA_ALLOWLIST.has(productId)) return;

  const displayUrls = collectDisplayMediaUrls(entry);
  for (const { label, url } of displayUrls) {
    if (isLocalThumbUrl(url)) {
      failures.push(
        `${productId}: ${label} uses local generated thumbnail ${url}; Castlery seating imports must use retailer-hosted product media`
      );
      continue;
    }
    if (!isRetailerHostedCastleryUrl(url)) {
      failures.push(
        `${productId}: ${label} must be a Castlery Cloudinary product image, got ${url}`
      );
    }
  }
}

function isValidMediaPresentationMode(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return true;
  return ["studio", "lifestyle", "transparent", "swatch"].includes(String(value).trim().toLowerCase());
}

function validateMediaPresentationModes(entry: CatalogEntry, failures: string[]) {
  const productId = entry.assets?.asset_id ?? entry.file_path ?? "unknown-catalog-entry";
  for (const [label, value] of [
    ["media_presentation", entry.media_presentation ?? entry.mediaPresentation],
    ["assets.media_presentation", entry.assets?.media_presentation ?? entry.assets?.mediaPresentation],
  ] as const) {
    if (!isValidMediaPresentationMode(value)) {
      failures.push(`${productId}: ${label} has invalid media presentation mode ${String(value)}`);
    }
  }

  for (const [variantIndex, variant] of (entry.variants ?? []).entries()) {
    const value = variant.media_presentation ?? variant.mediaPresentation;
    if (!isValidMediaPresentationMode(value)) {
      failures.push(
        `${productId}: variants[${variantIndex}].media_presentation has invalid media presentation mode ${String(value)}`
      );
    }
  }
}

function assertRetailerMediaPolicyFixtures() {
  const badFailures: string[] = [];
  validateRetailerMediaPolicy(
    {
      brand: "Castlery",
      source_url: "https://www.castlery.com/sg/products/example-armchair",
      category: "armchair",
      product_name: "Example Armchair",
      assets: {
        asset_id: "armchair-real-castlery-example-armchair",
        thumbnail_url: "/assets/thumbs/armchair-real-castlery-example-armchair.png",
      },
      variants: [
        {
          thumbnail_url: "/assets/thumbs/armchair-real-castlery-example-armchair.png",
          gallery_images: ["/assets/thumbs/armchair-real-castlery-example-armchair.png"],
          purchase_options: [
            {
              id: "set_of_2",
              image_url: "/assets/thumbs/armchair-real-castlery-example-armchair.png",
            },
          ],
        },
      ],
    },
    badFailures,
  );

  if (badFailures.length === 0) {
    throw new Error("Retailer media policy fixture failed to reject local generated Castlery seating thumbnails");
  }

  const goodFailures: string[] = [];
  validateRetailerMediaPolicy(
    {
      brand: "Castlery",
      source_url: "https://www.castlery.com/sg/products/example-armchair",
      category: "armchair",
      product_name: "Example Armchair",
      assets: {
        asset_id: "armchair-real-castlery-example-armchair",
        thumbnail_url:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1/crusader/variants/example/Example-Armchair-Angle.jpg",
      },
      variants: [
        {
          thumbnail_url:
            "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1/crusader/variants/example/Example-Armchair-Angle.jpg",
          gallery_images: [
            "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1/crusader/variants/example/Example-Armchair-Angle.jpg",
          ],
          purchase_options: [
            {
              id: "set_of_2",
              image_url:
                "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1/crusader/variants/example/Example-Armchair-Set-of-2.jpg",
            },
          ],
        },
      ],
    },
    goodFailures,
  );

  if (goodFailures.length > 0) {
    throw new Error(`Retailer media policy fixture rejected valid Castlery media: ${goodFailures.join("; ")}`);
  }
}

function main() {
  assertRetailerMediaPolicyFixtures();

  const entries = loadCatalogEntries();
  const failures: string[] = [];
  let scanned = 0;

  for (const entry of entries) {
    validateRetailerMediaPolicy(entry, failures);
    validateMediaPresentationModes(entry, failures);

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
