import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { prisma } from "./prisma";
import { applyPresetDefaults, getCatalogPreset, validateCatalogAgainstPreset } from "./catalog-presets";

export type CatalogVariant = Record<string, unknown>;

export type CatalogEntry = Record<string, unknown> & {
  category?: string;
  design_zone?: string;
  anchor_role?: string;
  design_pairings?: unknown;
  room_compatibility?: unknown;
  style_cluster?: string;
  shape?: string;
  material_family?: string;
  tone?: string;
  price_band?: string;
  brand_tier?: string;
  assets?: {
    asset_id?: string;
    model_url?: string;
    thumbnail_url?: string;
  };
  compatibility?: {
    related_products?: Array<{
      relationship?: string;
      strength?: string;
    }>;
  };
  bundle_metadata?: {
    bundle_role?: string;
  };
  variants?: CatalogVariant[];
};

export type ControlledVocab = {
  categories?: string[];
  legacy_categories?: string[];
  design_zones?: string[];
  anchor_roles?: string[];
  style_clusters?: string[];
  shapes?: string[];
  material_families?: string[];
  tones?: string[];
  price_bands?: string[];
  brand_tiers?: string[];
  relationship_types?: string[];
  relationship_strengths?: string[];
  swatch_groups?: string[];
  bundle_roles?: string[];
  room_compatibility?: string[];
};

export type FileAudit = {
  filePath: string;
  failures: string[];
  warnings: string[];
};

type ApprovedAsset = {
  id: string;
  modelUrl: string;
};

export type CatalogQualityAuditResult = {
  files: string[];
  audits: FileAudit[];
  duplicates: Map<string, string[]>;
  failureCount: number;
  warningCount: number;
  failingFiles: FileAudit[];
  warningFiles: FileAudit[];
  hasFailures: boolean;
};

export type CatalogGovernanceAuditResult = {
  files: string[];
  approvedAssets: ApprovedAsset[];
  approvedImportedAssets: ApprovedAsset[];
  missingCatalog: ApprovedAsset[];
  duplicateIds: Map<string, string[]>;
  parseErrorFiles: string[];
  missingAssetIdFiles: string[];
  orphanCatalogIds: string[];
  catalogIds: Set<string>;
  hasFailures: boolean;
};

export function findCatalogFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCatalogFiles(fullPath));
      continue;
    }
    if (entry.name === "catalog.yaml") {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasPositiveNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function getValueAtPath(obj: unknown, pathValue: string): unknown {
  return pathValue.split(".").reduce<unknown>((current, key) => {
    if (!isPlainObject(current)) return undefined;
    return current[key];
  }, obj);
}

function pushInvalidEnum(
  failures: string[],
  label: string,
  value: unknown,
  allowed: string[] | undefined,
  allowLegacy = false,
  legacyValues: string[] = []
) {
  if (!hasNonEmptyString(value)) return;
  if (allowed?.includes(value)) return;
  if (allowLegacy && legacyValues.includes(value)) return;
  failures.push(`${label} has invalid value "${value}".`);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function pushBySeverity(audit: FileAudit, severity: "error" | "warning" | "advisory", message: string) {
  if (severity === "error") {
    audit.failures.push(message);
    return;
  }
  if (severity === "advisory") {
    audit.warnings.push(`advisory: ${message}`);
    return;
  }
  audit.warnings.push(message);
}

function auditVariant(
  variant: CatalogVariant,
  index: number,
  requiresSwatchGroup: boolean,
  vocab: ControlledVocab,
  audit: FileAudit
) {
  const prefix = `variant ${index + 1}`;

  if (!hasNonEmptyString(variant.variant)) {
    audit.failures.push(`${prefix} is missing variant label.`);
  }

  if (!hasPositiveNumber(variant.price_usd)) {
    audit.failures.push(`${prefix} is missing positive price_usd.`);
  }

  if (!hasPositiveNumber(getValueAtPath(variant, "dimensions.width_cm"))) {
    audit.failures.push(`${prefix} is missing positive dimensions.width_cm.`);
  }
  if (!hasPositiveNumber(getValueAtPath(variant, "dimensions.depth_cm"))) {
    audit.failures.push(`${prefix} is missing positive dimensions.depth_cm.`);
  }
  if (!hasPositiveNumber(getValueAtPath(variant, "dimensions.height_cm"))) {
    audit.failures.push(`${prefix} is missing positive dimensions.height_cm.`);
  }

  const hasFinishCode = hasNonEmptyString(variant.finish_code);
  const hasFinishLabel = hasNonEmptyString(variant.finish_label);
  if (hasFinishCode !== hasFinishLabel) {
    audit.failures.push(`${prefix} must include both finish_code and finish_label together.`);
  }

  const hasUpholsteryCode = hasNonEmptyString(variant.upholstery_code);
  const hasUpholsteryLabel = hasNonEmptyString(variant.upholstery_label);
  if (hasUpholsteryCode !== hasUpholsteryLabel) {
    audit.failures.push(`${prefix} must include both upholstery_code and upholstery_label together.`);
  }

  if (requiresSwatchGroup && !hasNonEmptyString(variant.swatch_group)) {
    audit.failures.push(`${prefix} is missing swatch_group for a multi-variant swatchable item.`);
  }

  pushInvalidEnum(audit.failures, `${prefix} swatch_group`, variant.swatch_group, vocab.swatch_groups);
  pushInvalidEnum(audit.failures, `${prefix} price_band`, variant.price_band, vocab.price_bands);
  pushInvalidEnum(audit.failures, `${prefix} brand_tier`, variant.brand_tier, vocab.brand_tiers);
  pushInvalidEnum(audit.failures, `${prefix} tone`, variant.tone, vocab.tones);

  if (variant.materials !== undefined && !isPlainObject(variant.materials)) {
    audit.failures.push(`${prefix} materials must be structured object data.`);
  }
  if (variant.finish !== undefined && !isPlainObject(variant.finish)) {
    audit.failures.push(`${prefix} finish must be structured object data.`);
  }

  if (variant.materials === undefined) {
    audit.failures.push(`${prefix} is missing structured materials data.`);
  }
  if (variant.finish === undefined) {
    audit.failures.push(`${prefix} is missing structured finish data.`);
  }
}

function auditFile(filePath: string, vocab: ControlledVocab): FileAudit {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = parse(raw) as CatalogEntry;
  const audit: FileAudit = { filePath, failures: [], warnings: [] };

  if (!isPlainObject(parsed)) {
    audit.failures.push("catalog.yaml root must be an object.");
    return audit;
  }

  pushInvalidEnum(audit.failures, "category", parsed.category, vocab.categories, true, vocab.legacy_categories ?? []);
  pushInvalidEnum(audit.failures, "design_zone", parsed.design_zone, vocab.design_zones);
  pushInvalidEnum(audit.failures, "anchor_role", parsed.anchor_role, vocab.anchor_roles);
  pushInvalidEnum(audit.failures, "style_cluster", parsed.style_cluster, vocab.style_clusters);
  pushInvalidEnum(audit.failures, "shape", parsed.shape, vocab.shapes);
  pushInvalidEnum(audit.failures, "material_family", parsed.material_family, vocab.material_families);
  pushInvalidEnum(audit.failures, "tone", parsed.tone, vocab.tones);
  pushInvalidEnum(audit.failures, "price_band", parsed.price_band, vocab.price_bands);
  pushInvalidEnum(audit.failures, "brand_tier", parsed.brand_tier, vocab.brand_tiers);

  if ((vocab.legacy_categories ?? []).includes(String(parsed.category ?? ""))) {
    audit.warnings.push(`category uses legacy taxonomy value "${parsed.category}".`);
  }

  if (!Array.isArray(parsed.room_compatibility) || parsed.room_compatibility.length === 0) {
    audit.failures.push("room_compatibility must be present and non-empty.");
  } else {
    parsed.room_compatibility.forEach((entry, index) => {
      pushInvalidEnum(audit.failures, `room_compatibility[${index}]`, entry, vocab.room_compatibility);
    });
  }

  if (!hasNonEmptyString(parsed.design_zone)) {
    audit.failures.push("design_zone is required.");
  }
  if (!hasNonEmptyString(parsed.anchor_role)) {
    audit.failures.push("anchor_role is required.");
  }

  const preset = getCatalogPreset(parsed.category ?? null);
  if (!preset) {
    audit.failures.push(`no catalog preset exists for category "${parsed.category ?? "unknown"}".`);
    return audit;
  }

  const pairingRule = preset.validationRules?.designPairingRules;
  const expectedPairings = pairingRule?.expectedTokens?.length
    ? pairingRule.expectedTokens
    : (preset.defaults.design_pairings ?? []);

  if (expectedPairings.length > 0) {
    const severity = pairingRule?.severity ?? "error";
    const minMatches = Math.max(pairingRule?.minMatches ?? 1, 1);
    const rawPairings = Array.isArray(parsed.design_pairings)
      ? parsed.design_pairings.filter((entry): entry is string => hasNonEmptyString(entry))
      : [];

    // Advisory categories keep pairings optional and only flag low-signal token choices.
    if (!(severity === "advisory" && rawPairings.length === 0)) {
      if (rawPairings.length === 0) {
        pushBySeverity(
          audit,
          severity,
          `design_pairings must include at least ${minMatches} expected token(s) for category "${preset.category}".`
        );
      } else {
        const actualTokenSet = new Set(rawPairings.map(normalizeToken));
        const normalizedExpected = expectedPairings.map(normalizeToken);
        const matchedExpected = normalizedExpected.filter((token) => actualTokenSet.has(token));

        if (matchedExpected.length < minMatches) {
          const missingAll = matchedExpected.length === 0;
          const message = missingAll
            ? `design_pairings for category "${preset.category}" is missing all expected tokens; expected one or more of [${expectedPairings.join(
                ", "
              )}].`
            : `design_pairings for category "${preset.category}" matched ${matchedExpected.length}/${minMatches} required token(s); expected tokens include [${expectedPairings.join(
                ", "
              )}].`;
          pushBySeverity(audit, severity, message);
        }
      }
    }
  }

  const relatedProducts = parsed.compatibility?.related_products;
  if (Array.isArray(relatedProducts)) {
    relatedProducts.forEach((entry, index) => {
      pushInvalidEnum(
        audit.failures,
        `related_products[${index}].relationship`,
        entry.relationship,
        vocab.relationship_types
      );
      pushInvalidEnum(
        audit.failures,
        `related_products[${index}].strength`,
        entry.strength,
        vocab.relationship_strengths
      );
    });
  }

  pushInvalidEnum(audit.failures, "bundle_metadata.bundle_role", parsed.bundle_metadata?.bundle_role, vocab.bundle_roles);

  const variants = Array.isArray(parsed.variants) ? parsed.variants : [];
  if (variants.length === 0 && parsed.category === "dining_table") {
    audit.failures.push("dining_table entries must include at least one variant.");
  } else if (variants.length === 0) {
    audit.warnings.push("catalog has no variants array; publish flow is more robust when at least one variant is present.");
  }

  const distinctFinishCodes = new Set(
    variants
      .map((variant) => (isPlainObject(variant) && hasNonEmptyString(variant.finish_code) ? variant.finish_code : null))
      .filter((value): value is string => value !== null)
  );
  const distinctUpholsteryCodes = new Set(
    variants
      .map((variant) => (isPlainObject(variant) && hasNonEmptyString(variant.upholstery_code) ? variant.upholstery_code : null))
      .filter((value): value is string => value !== null)
  );
  const requiresSwatchGroup = distinctFinishCodes.size > 1 || distinctUpholsteryCodes.size > 1;

  variants.forEach((variant, index) => {
    if (!isPlainObject(variant)) {
      audit.failures.push(`variant ${index + 1} must be an object.`);
      return;
    }
    auditVariant(variant, index, requiresSwatchGroup, vocab, audit);
  });

  const withDefaults = applyPresetDefaults(parsed, preset);
  const validation = validateCatalogAgainstPreset(withDefaults, preset, "publish");
  if (!validation.publishable) {
    audit.failures.push(...validation.errors.map((entry) => `preset validation: ${entry}`));
  }

  if (!hasNonEmptyString(parsed.assets?.model_url)) {
    audit.failures.push("assets.model_url is required for publish readiness.");
  }
  if (!hasNonEmptyString(parsed.assets?.thumbnail_url)) {
    audit.failures.push("assets.thumbnail_url is required for publish readiness.");
  }

  return audit;
}

function loadControlledVocabulary(): ControlledVocab {
  const vocabPath = path.join(process.cwd(), "catalog", "furniture", "_templates", "controlled_vocabularies.yaml");
  return parse(fs.readFileSync(vocabPath, "utf8")) as ControlledVocab;
}

function collectDuplicateAssetIds(files: string[]): Map<string, string[]> {
  const origins = new Map<string, string[]>();

  for (const filePath of files) {
    try {
      const parsed = parse(fs.readFileSync(filePath, "utf8")) as CatalogEntry;
      const assetId = parsed?.assets?.asset_id;
      if (!hasNonEmptyString(assetId)) continue;
      origins.set(assetId, [...(origins.get(assetId) ?? []), filePath]);
    } catch {
      // Governance audit reports parse failures separately.
    }
  }

  return new Map(Array.from(origins.entries()).filter(([, values]) => values.length > 1));
}

function loadCatalogAssetIds(rootDir: string): {
  files: string[];
  ids: Set<string>;
  duplicateIds: Map<string, string[]>;
  parseErrorFiles: string[];
  missingAssetIdFiles: string[];
} {
  const files = findCatalogFiles(rootDir);
  const ids = new Set<string>();
  const origins = new Map<string, string[]>();
  const parseErrorFiles: string[] = [];
  const missingAssetIdFiles: string[] = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parse(raw) as CatalogEntry;
      const assetId = parsed?.assets?.asset_id;
      if (typeof assetId !== "string" || !assetId.trim()) {
        missingAssetIdFiles.push(filePath);
        continue;
      }

      const normalizedId = assetId.trim();
      ids.add(normalizedId);

      const existingOrigins = origins.get(normalizedId) ?? [];
      existingOrigins.push(filePath);
      origins.set(normalizedId, existingOrigins);
    } catch {
      parseErrorFiles.push(filePath);
    }
  }

  const duplicateIds = new Map<string, string[]>();
  for (const [assetId, filesForId] of origins.entries()) {
    if (filesForId.length > 1) {
      duplicateIds.set(assetId, filesForId);
    }
  }

  return { files, ids, duplicateIds, parseErrorFiles, missingAssetIdFiles };
}

function isImportedAsset(asset: ApprovedAsset): boolean {
  return asset.id.includes("-real-") || asset.modelUrl.includes("/assets/models/");
}

export function getRelativeCatalogPath(filePath: string): string {
  return path.relative(process.cwd(), filePath);
}

export function runCatalogQualityAudit(rootDir = path.join(process.cwd(), "catalog", "furniture")): CatalogQualityAuditResult {
  const vocab = loadControlledVocabulary();
  const files = findCatalogFiles(rootDir);
  const audits = files.map((filePath) => auditFile(filePath, vocab));
  const duplicates = collectDuplicateAssetIds(files);

  const failureCount = audits.reduce((sum, audit) => sum + audit.failures.length, 0);
  const warningCount = audits.reduce((sum, audit) => sum + audit.warnings.length, 0);
  const failingFiles = audits.filter((audit) => audit.failures.length > 0);
  const warningFiles = audits.filter((audit) => audit.warnings.length > 0);

  return {
    files,
    audits,
    duplicates,
    failureCount,
    warningCount,
    failingFiles,
    warningFiles,
    hasFailures: duplicates.size > 0 || failureCount > 0,
  };
}

export async function runCatalogGovernanceAudit(
  rootDir = path.join(process.cwd(), "catalog", "furniture")
): Promise<CatalogGovernanceAuditResult> {
  const { files, ids: catalogIds, duplicateIds, parseErrorFiles, missingAssetIdFiles } = loadCatalogAssetIds(rootDir);

  const approvedAssets = (await prisma.modelAsset.findMany({
    where: { approved: true },
    select: {
      id: true,
      modelUrl: true,
    },
    orderBy: { id: "asc" },
  })) as ApprovedAsset[];

  const approvedImportedAssets = approvedAssets.filter(isImportedAsset);
  const missingCatalog = approvedImportedAssets.filter((asset) => !catalogIds.has(asset.id));

  const orphanCatalogIds = Array.from(catalogIds)
    .filter((assetId) => !approvedAssets.some((asset) => asset.id === assetId))
    .sort();

  return {
    files,
    approvedAssets,
    approvedImportedAssets,
    missingCatalog,
    duplicateIds,
    parseErrorFiles,
    missingAssetIdFiles,
    orphanCatalogIds,
    catalogIds,
    hasFailures: missingCatalog.length > 0 || duplicateIds.size > 0 || parseErrorFiles.length > 0,
  };
}