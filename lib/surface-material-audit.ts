import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import {
  SURFACE_MATERIAL_VOCABULARY,
  type SurfaceMaterial,
} from "./surface-material-schema";
import {
  getAllSurfaceMaterialFiles,
  getSurfaceMaterialCatalogRoot,
  readSurfaceMaterialYamlFile,
} from "./surface-material-yaml";

export type SurfaceMaterialFileAudit = {
  filePath: string;
  failures: string[];
  warnings: string[];
};

export type SurfaceMaterialAuditResult = {
  files: string[];
  audits: SurfaceMaterialFileAudit[];
  parseErrorFiles: string[];
  duplicateMaterialIds: Map<string, string[]>;
  duplicateSlugs: Map<string, string[]>;
  failureCount: number;
  warningCount: number;
  draftCount: number;
  publishedCount: number;
  hasFailures: boolean;
};

export type SurfaceMaterialAdminAuditSummary = {
  filePath: string;
  materialId: string;
  slug: string;
  productName: string;
  supplier: string;
  brand?: string | null;
  materialFamily: string;
  surfaceCategory: string;
  publishStatus: string;
  licenseStatus: string;
  sampleAvailable: boolean | "unknown";
  sampleRequestUrl: string | null;
  sourceUrl: string | null;
  missingAssets: string[];
  missingSpecs: string[];
  blockers: string[];
  failures: string[];
  warnings: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function pushRequiredString(failures: string[], label: string, value: unknown) {
  if (!hasNonEmptyString(value)) failures.push(`${label} is required.`);
}

function pushRequiredObject(failures: string[], label: string, value: unknown) {
  if (!isPlainObject(value)) failures.push(`${label} must be an object.`);
}

function pushEnumFailure(
  failures: string[],
  label: string,
  value: unknown,
  allowed: readonly string[]
) {
  if (!hasNonEmptyString(value)) {
    failures.push(`${label} is required.`);
    return;
  }
  if (!allowed.includes(value)) {
    failures.push(`${label} has invalid value "${value}".`);
  }
}

function auditStringArray(
  failures: string[],
  label: string,
  value: unknown,
  allowed: readonly string[]
) {
  if (!Array.isArray(value) || value.length === 0) {
    failures.push(`${label} must be a non-empty array.`);
    return;
  }

  value.forEach((entry, index) => {
    if (!hasNonEmptyString(entry)) {
      failures.push(`${label}[${index}] must be a non-empty string.`);
      return;
    }
    if (!allowed.includes(entry)) {
      failures.push(`${label}[${index}] has invalid value "${entry}".`);
    }
  });
}

function auditNullableUrl(warnings: string[], label: string, value: unknown) {
  if (value === null || value === undefined || value === "") return;
  if (!isHttpUrl(value) && !(typeof value === "string" && value.startsWith("/"))) {
    warnings.push(`${label} should be an http(s) or local asset URL when present.`);
  }
}

function isAssetUrl(value: unknown): value is string {
  return isHttpUrl(value) || (typeof value === "string" && value.startsWith("/"));
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasBlocker(entry: SurfaceMaterial, blocker: string): boolean {
  return Boolean(entry.import_governance?.publish_blockers?.includes(blocker));
}

function hasSampleRequestUrl(entry: SurfaceMaterial): boolean {
  return isHttpUrl(entry.source?.sample_request_url) || isHttpUrl(entry.commerce?.sample_request_url);
}

function hasTextureRepeatSize(entry: SurfaceMaterial): boolean {
  const repeatSize = entry.texture_assets?.texture_repeat_size_cm;
  return isPositiveNumber(repeatSize?.width) && isPositiveNumber(repeatSize?.height);
}

export function getMissingSurfaceMaterialAssetLabels(entry: SurfaceMaterial): string[] {
  const missing: string[] = [];

  if (!isAssetUrl(entry.texture_assets?.swatch_url)) {
    missing.push("swatch_url");
  }
  if (!isAssetUrl(entry.texture_assets?.base_color_url)) {
    missing.push("base_color_url");
  }
  if (entry.texture_assets?.tileable === "needs_confirmation") {
    missing.push("known_tileability");
  }
  if (!hasTextureRepeatSize(entry)) {
    missing.push("texture_repeat_size_cm");
  }

  return missing;
}

export function getMissingSurfaceMaterialSpecLabels(entry: SurfaceMaterial): string[] {
  const specs = entry.physical_specs;
  const missing: string[] = [];

  if (!specs?.plank_or_tile_format || specs.plank_or_tile_format === "unknown") {
    missing.push("plank_or_tile_format");
  }
  if (!isPositiveNumber(specs?.total_thickness_mm)) {
    missing.push("total_thickness_mm");
  }

  if (
    ["luxury_vinyl_tile", "spc", "vinyl_sheet", "laminate", "carpet_tile"].includes(
      entry.surface_material?.material_family ?? ""
    ) &&
    !isPositiveNumber(specs?.wear_layer_mm)
  ) {
    missing.push("wear_layer_mm");
  }

  if (specs?.plank_or_tile_format === "plank" || specs?.plank_or_tile_format === "decking_board") {
    if (!isPositiveNumber(specs.plank_width_mm)) missing.push("plank_width_mm");
    if (!isPositiveNumber(specs.plank_length_mm)) missing.push("plank_length_mm");
  }

  if (specs?.plank_or_tile_format === "tile") {
    if (!isPositiveNumber(specs.tile_width_mm)) missing.push("tile_width_mm");
    if (!isPositiveNumber(specs.tile_length_mm)) missing.push("tile_length_mm");
  }

  return missing;
}

function hasMissingPhysicalDimensions(entry: SurfaceMaterial): boolean {
  return getMissingSurfaceMaterialSpecLabels(entry).length > 0;
}

function hasDraftOrGuessedProductSignals(entry: SurfaceMaterial): boolean {
  const productName = entry.surface_material?.product_name?.toLowerCase() ?? "";
  const notes = entry.source?.notes?.join(" ").toLowerCase() ?? "";
  return (
    productName.includes("draft") ||
    productName.includes("tbc") ||
    notes.includes("draft") ||
    notes.includes("not publish") ||
    notes.includes("not confirmed") ||
    notes.includes("research")
  );
}

function auditDraftBlockers(entry: SurfaceMaterial, failures: string[]) {
  if (entry.import_governance?.publish_status !== "draft") return;

  const blockers = entry.import_governance.publish_blockers ?? [];
  if (blockers.length === 0) {
    failures.push("draft surface materials must include publish blockers.");
    return;
  }

  if (!entry.texture_assets?.swatch_url && !hasBlocker(entry, "add_swatch_asset")) {
    failures.push("draft materials missing swatch_url must include add_swatch_asset blocker.");
  }
  if (!entry.texture_assets?.base_color_url && !hasBlocker(entry, "add_tileable_base_color_texture")) {
    failures.push("draft materials missing base_color_url must include add_tileable_base_color_texture blocker.");
  }
  if (entry.source?.license_status !== "confirmed" && !hasBlocker(entry, "confirm_supplier_image_usage_rights")) {
    failures.push("draft materials without confirmed image rights must include confirm_supplier_image_usage_rights blocker.");
  }
  if (entry.texture_assets?.tileable === "needs_confirmation" && !hasBlocker(entry, "confirm_texture_tileability")) {
    failures.push("draft materials with unconfirmed tileability must include confirm_texture_tileability blocker.");
  }
  if (hasMissingPhysicalDimensions(entry) && !hasBlocker(entry, "confirm_physical_dimensions")) {
    failures.push("draft materials missing physical dimensions must include confirm_physical_dimensions blocker.");
  }
  if (hasDraftOrGuessedProductSignals(entry) && !hasBlocker(entry, "confirm_exact_goodrich_product_code")) {
    failures.push("draft or guessed product/spec data must include confirm_exact_goodrich_product_code blocker.");
  }
}

function auditPublishedReadiness(entry: SurfaceMaterial, failures: string[]) {
  if (entry.import_governance?.publish_status !== "published") return;

  if (!isAssetUrl(entry.texture_assets?.swatch_url)) {
    failures.push("published surface materials require texture_assets.swatch_url.");
  }
  if (!isAssetUrl(entry.texture_assets?.base_color_url)) {
    failures.push("published surface materials require texture_assets.base_color_url.");
  }
  if (entry.texture_assets?.tileable === "needs_confirmation") {
    failures.push("published surface materials require known texture tileability.");
  }
  if (!hasTextureRepeatSize(entry)) {
    failures.push("published surface materials require texture_assets.texture_repeat_size_cm width and height.");
  }
  if (hasMissingPhysicalDimensions(entry)) {
    failures.push("published surface materials require physical dimensions relevant to the flooring format.");
  }
  if ((entry.import_governance?.publish_blockers?.length ?? 0) > 0) {
    failures.push("published surface materials must not have unresolved publish blockers.");
  }
  if (entry.source?.license_status !== "confirmed") {
    failures.push("published surface materials require confirmed source.license_status.");
  }
}

export function auditSurfaceMaterialEntry(
  entry: SurfaceMaterial,
  filePath = "<surface-material>"
): SurfaceMaterialFileAudit {
  const audit: SurfaceMaterialFileAudit = { filePath, failures: [], warnings: [] };

  if (entry.schema_version !== 1) {
    audit.failures.push("schema_version must be 1.");
  }

  pushRequiredObject(audit.failures, "surface_material", entry.surface_material);
  pushRequiredObject(audit.failures, "source", entry.source);
  pushRequiredObject(audit.failures, "classification", entry.classification);
  pushRequiredObject(audit.failures, "physical_specs", entry.physical_specs);
  pushRequiredObject(audit.failures, "texture_assets", entry.texture_assets);
  pushRequiredObject(audit.failures, "rendering", entry.rendering);
  pushRequiredObject(audit.failures, "commerce", entry.commerce);
  pushRequiredObject(audit.failures, "import_governance", entry.import_governance);

  pushRequiredString(audit.failures, "surface_material.supplier", entry.surface_material?.supplier);
  pushRequiredString(audit.failures, "surface_material.material_id", entry.surface_material?.material_id);
  pushRequiredString(audit.failures, "surface_material.product_name", entry.surface_material?.product_name);
  pushRequiredString(audit.failures, "surface_material.slug", entry.surface_material?.slug);
  pushEnumFailure(
    audit.failures,
    "surface_material.surface_category",
    entry.surface_material?.surface_category,
    SURFACE_MATERIAL_VOCABULARY.surface_category
  );
  pushEnumFailure(
    audit.failures,
    "surface_material.material_family",
    entry.surface_material?.material_family,
    SURFACE_MATERIAL_VOCABULARY.material_family
  );

  pushEnumFailure(
    audit.failures,
    "source.license_status",
    entry.source?.license_status,
    SURFACE_MATERIAL_VOCABULARY.license_status
  );
  if (!isHttpUrl(entry.source?.source_url)) {
    audit.failures.push("source.source_url must be an http(s) URL.");
  }
  auditNullableUrl(audit.warnings, "source.sample_request_url", entry.source?.sample_request_url);
  if (entry.commerce?.sample_available === true && !hasSampleRequestUrl(entry)) {
    audit.failures.push("sample_request_url is required when commerce.sample_available is true.");
  }
  if (entry.commerce?.purchase_mode === "quote_or_sample" && !hasSampleRequestUrl(entry)) {
    audit.failures.push("quote_or_sample surface materials require a sample or quote request URL.");
  }

  pushEnumFailure(
    audit.failures,
    "classification.flooring_type",
    entry.classification?.flooring_type,
    SURFACE_MATERIAL_VOCABULARY.flooring_type
  );
  pushEnumFailure(
    audit.failures,
    "classification.design_effect",
    entry.classification?.design_effect,
    SURFACE_MATERIAL_VOCABULARY.design_effect
  );
  pushEnumFailure(
    audit.failures,
    "classification.color_family",
    entry.classification?.color_family,
    SURFACE_MATERIAL_VOCABULARY.color_family
  );
  auditStringArray(audit.failures, "classification.tone", entry.classification?.tone, SURFACE_MATERIAL_VOCABULARY.tone);
  auditStringArray(
    audit.failures,
    "classification.style_cluster",
    entry.classification?.style_cluster,
    SURFACE_MATERIAL_VOCABULARY.style_cluster
  );
  auditStringArray(
    audit.failures,
    "classification.room_suitability",
    entry.classification?.room_suitability,
    SURFACE_MATERIAL_VOCABULARY.room_suitability
  );
  auditStringArray(
    audit.failures,
    "physical_specs.installation_method",
    entry.physical_specs?.installation_method,
    SURFACE_MATERIAL_VOCABULARY.installation_method
  );

  auditNullableUrl(audit.warnings, "texture_assets.swatch_url", entry.texture_assets?.swatch_url);
  auditNullableUrl(audit.warnings, "texture_assets.base_color_url", entry.texture_assets?.base_color_url);
  if (entry.texture_assets?.tileable !== true && entry.texture_assets?.tileable !== false && entry.texture_assets?.tileable !== "needs_confirmation") {
    audit.failures.push("texture_assets.tileable must be boolean or needs_confirmation.");
  }
  if (
    entry.texture_assets?.texture_repeat_size_cm !== null &&
    entry.texture_assets?.texture_repeat_size_cm !== undefined &&
    !hasTextureRepeatSize(entry)
  ) {
    audit.failures.push("texture_assets.texture_repeat_size_cm must include positive width and height when present.");
  }

  pushEnumFailure(
    audit.failures,
    "rendering.scale_mode",
    entry.rendering?.scale_mode,
    ["physical_repeat", "visual_repeat", "swatch_only"]
  );
  pushEnumFailure(
    audit.failures,
    "rendering.seam_strategy",
    entry.rendering?.seam_strategy,
    ["repeat_texture", "single_swatch", "non_tileable_preview"]
  );
  pushEnumFailure(
    audit.failures,
    "commerce.purchase_mode",
    entry.commerce?.purchase_mode,
    SURFACE_MATERIAL_VOCABULARY.purchase_mode
  );
  pushEnumFailure(
    audit.failures,
    "import_governance.publish_status",
    entry.import_governance?.publish_status,
    SURFACE_MATERIAL_VOCABULARY.publish_status
  );

  if (!Array.isArray(entry.import_governance?.publish_blockers)) {
    audit.failures.push("import_governance.publish_blockers must be an array.");
  }
  auditDraftBlockers(entry, audit.failures);
  auditPublishedReadiness(entry, audit.failures);

  return audit;
}

function auditFile(filePath: string): SurfaceMaterialFileAudit {
  return auditSurfaceMaterialEntry(readSurfaceMaterialYamlFile(filePath), filePath);
}

export function buildSurfaceMaterialAdminAuditSummaries(
  rootDir = getSurfaceMaterialCatalogRoot()
): SurfaceMaterialAdminAuditSummary[] {
  return getAllSurfaceMaterialFiles(rootDir).flatMap((filePath) => {
    try {
      const entry = readSurfaceMaterialYamlFile(filePath);
      const audit = auditSurfaceMaterialEntry(entry, filePath);
      return [
        {
          filePath,
          materialId: entry.surface_material?.material_id ?? "",
          slug: entry.surface_material?.slug ?? "",
          productName: entry.surface_material?.product_name ?? "",
          supplier: entry.surface_material?.supplier ?? "",
          brand: entry.surface_material?.brand ?? null,
          materialFamily: entry.surface_material?.material_family ?? "",
          surfaceCategory: entry.surface_material?.surface_category ?? "",
          publishStatus: entry.import_governance?.publish_status ?? "",
          licenseStatus: entry.source?.license_status ?? "",
          sampleAvailable: entry.commerce?.sample_available ?? "unknown",
          sampleRequestUrl: entry.commerce?.sample_request_url ?? entry.source?.sample_request_url ?? null,
          sourceUrl: entry.source?.source_url ?? null,
          missingAssets: getMissingSurfaceMaterialAssetLabels(entry),
          missingSpecs: getMissingSurfaceMaterialSpecLabels(entry),
          blockers: entry.import_governance?.publish_blockers ?? [],
          failures: audit.failures,
          warnings: audit.warnings,
        },
      ];
    } catch {
      return [];
    }
  });
}

function collectDuplicates(
  files: string[],
  readValue: (entry: SurfaceMaterial) => string | undefined
): Map<string, string[]> {
  const origins = new Map<string, string[]>();

  for (const filePath of files) {
    try {
      const entry = parse(fs.readFileSync(filePath, "utf8")) as SurfaceMaterial;
      const value = readValue(entry)?.trim();
      if (!value) continue;
      origins.set(value, [...(origins.get(value) ?? []), filePath]);
    } catch {
      // Parse errors are reported separately.
    }
  }

  return new Map(Array.from(origins.entries()).filter(([, filePaths]) => filePaths.length > 1));
}

export function getRelativeSurfaceMaterialPath(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}

export function runSurfaceMaterialAudit(rootDir = getSurfaceMaterialCatalogRoot()): SurfaceMaterialAuditResult {
  const files = getAllSurfaceMaterialFiles(rootDir);
  const parseErrorFiles: string[] = [];
  const audits: SurfaceMaterialFileAudit[] = [];

  for (const filePath of files) {
    try {
      audits.push(auditFile(filePath));
    } catch {
      parseErrorFiles.push(filePath);
    }
  }

  const duplicateMaterialIds = collectDuplicates(files, (entry) => entry.surface_material?.material_id);
  const duplicateSlugs = collectDuplicates(files, (entry) => entry.surface_material?.slug);
  const failureCount = audits.reduce((sum, audit) => sum + audit.failures.length, 0) + parseErrorFiles.length;
  const warningCount = audits.reduce((sum, audit) => sum + audit.warnings.length, 0);
  const draftCount = audits.filter((audit) => {
    const entry = readSurfaceMaterialYamlFile(audit.filePath);
    return entry.import_governance?.publish_status === "draft";
  }).length;
  const publishedCount = audits.filter((audit) => {
    const entry = readSurfaceMaterialYamlFile(audit.filePath);
    return entry.import_governance?.publish_status === "published";
  }).length;

  return {
    files,
    audits,
    parseErrorFiles,
    duplicateMaterialIds,
    duplicateSlugs,
    failureCount,
    warningCount,
    draftCount,
    publishedCount,
    hasFailures:
      failureCount > 0 ||
      duplicateMaterialIds.size > 0 ||
      duplicateSlugs.size > 0,
  };
}
