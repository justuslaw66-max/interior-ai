import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { parse, stringify } from "yaml";
import { auth } from "@/lib/auth";
import {
  hasOwn,
  isPlainObject,
  isStringArray,
  normalizeStringArray,
  pickDefinedFields,
} from "@/lib/admin-api/update-validation";
import { isAdminEmail } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  applyPresetDefaults,
  buildPresetAutoMetadata,
  getCatalogPreset,
  validateCatalogAgainstPreset,
} from "@/lib/catalog-presets";
import { getFreshCatalogYamlMap, invalidateCatalogYamlCache } from "@/lib/catalog-yaml";

type CatalogItemRow = {
  id: string;
  assetId: string;
  title: string;
  slug: string;
  description: string | null;
  category: string;
  defaultVariantId: string | null;
  tags: string[];
  styleTags: string[];
  toneTags: string[];
  roomTags: string[];
  variantsJson: unknown;
  asset: {
    approved: boolean;
  };
};

const EDITABLE_DB_FIELDS = [
  "title",
  "slug",
  "description",
  "category",
  "defaultVariantId",
  "tags",
  "styleTags",
  "toneTags",
  "roomTags",
  "variantsJson",
] as const;

const EDITABLE_YAML_FIELDS = [
  "brand",
  "category",
  "product_family",
  "product_name",
  "variant",
  "price_usd",
  "price_band",
  "brand_tier",
  "design_zone",
  "anchor_role",
  "dimensions",
  "seat_capacity",
  "size_class",
  "shape",
  "base_type",
  "material_family",
  "material_mix",
  "materials",
  "finish",
  "color_family",
  "tone",
  "style_cluster",
  "style_secondary",
  "design_era",
  "visual_attributes",
  "spatial_attributes",
  "room_compatibility",
  "placement_rules",
  "design_pairings",
  "compatibility",
  "bundle_metadata",
  "ai_flags",
  "variants",
] as const;

const VALID_DB_CATEGORIES = [
  "sofa",
  "coffee_table",
  "rug",
  "tv_console",
  "accent_chair",
  "floor_lamp",
] as const;

type EditableDbField = (typeof EDITABLE_DB_FIELDS)[number];
type EditableYamlField = (typeof EDITABLE_YAML_FIELDS)[number];
type CatalogPatchBody = {
  db?: Record<string, unknown>;
  yaml?: Record<string, unknown> | null;
};
type RawCatalogDbUpdateData = Partial<Record<EditableDbField, unknown>>;
type CatalogDbUpdateData = {
  title?: string;
  slug?: string;
  description?: string | null;
  category?: string;
  defaultVariantId?: string | null;
  tags?: string[];
  styleTags?: string[];
  toneTags?: string[];
  roomTags?: string[];
  variantsJson?: unknown;
};
type CatalogYamlUpdateData = Partial<Record<EditableYamlField, unknown>>;

function normalizeDbUpdateData(data: RawCatalogDbUpdateData) {
  const next: CatalogDbUpdateData = {};

  if (hasOwn(data as Record<string, unknown>, "title")) next.title = data.title as string;
  if (hasOwn(data as Record<string, unknown>, "slug")) next.slug = data.slug as string;
  if (hasOwn(data as Record<string, unknown>, "description")) {
    next.description = data.description as string | null;
  }
  if (hasOwn(data as Record<string, unknown>, "category")) next.category = data.category as string;
  if (hasOwn(data as Record<string, unknown>, "defaultVariantId")) {
    next.defaultVariantId = data.defaultVariantId as string | null;
  }
  if (hasOwn(data as Record<string, unknown>, "tags")) next.tags = data.tags as string[];
  if (hasOwn(data as Record<string, unknown>, "styleTags")) next.styleTags = data.styleTags as string[];
  if (hasOwn(data as Record<string, unknown>, "toneTags")) next.toneTags = data.toneTags as string[];
  if (hasOwn(data as Record<string, unknown>, "roomTags")) next.roomTags = data.roomTags as string[];
  if (hasOwn(data as Record<string, unknown>, "variantsJson")) next.variantsJson = data.variantsJson;

  if (typeof next.title === "string") next.title = next.title.trim();
  if (typeof next.slug === "string") next.slug = next.slug.trim();
  if (typeof next.category === "string") next.category = next.category.trim();
  if (typeof next.defaultVariantId === "string") {
    const trimmed = next.defaultVariantId.trim();
    next.defaultVariantId = trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(next.tags) && next.tags.every((entry) => typeof entry === "string")) {
    next.tags = normalizeStringArray(next.tags as string[]);
  }
  if (Array.isArray(next.styleTags) && next.styleTags.every((entry) => typeof entry === "string")) {
    next.styleTags = normalizeStringArray(next.styleTags as string[]);
  }
  if (Array.isArray(next.toneTags) && next.toneTags.every((entry) => typeof entry === "string")) {
    next.toneTags = normalizeStringArray(next.toneTags as string[]);
  }
  if (Array.isArray(next.roomTags) && next.roomTags.every((entry) => typeof entry === "string")) {
    next.roomTags = normalizeStringArray(next.roomTags as string[]);
  }

  return next;
}

function normalizeYamlUpdateData(data: CatalogYamlUpdateData) {
  const next: CatalogYamlUpdateData = { ...data };

  const trimStringField = (field: EditableYamlField) => {
    if (typeof next[field] === "string") {
      next[field] = next[field].trim();
    }
  };

  trimStringField("brand");
  trimStringField("category");
  trimStringField("product_family");
  trimStringField("product_name");
  trimStringField("variant");
  trimStringField("price_band");
  trimStringField("brand_tier");
  trimStringField("design_zone");
  trimStringField("anchor_role");
  trimStringField("size_class");
  trimStringField("shape");
  trimStringField("base_type");
  trimStringField("material_family");
  trimStringField("material_mix");
  trimStringField("color_family");
  trimStringField("tone");
  trimStringField("style_cluster");
  trimStringField("style_secondary");
  trimStringField("design_era");

  if (
    Array.isArray(next.room_compatibility) &&
    next.room_compatibility.every((entry) => typeof entry === "string")
  ) {
    next.room_compatibility = normalizeStringArray(next.room_compatibility as string[]);
  }
  if (
    Array.isArray(next.design_pairings) &&
    next.design_pairings.every((entry) => typeof entry === "string")
  ) {
    next.design_pairings = normalizeStringArray(next.design_pairings as string[]);
  }

  return next;
}

function isValidDbCategory(category: unknown): category is (typeof VALID_DB_CATEGORIES)[number] {
  return typeof category === "string" && VALID_DB_CATEGORIES.includes(category as (typeof VALID_DB_CATEGORIES)[number]);
}

function isVariantRecord(value: unknown): value is { id: string; title: string } {
  return (
    isPlainObject(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.title === "string"
  );
}

function isValidVariantsJson(value: unknown): boolean {
  return value === null || (Array.isArray(value) && value.every((entry) => isVariantRecord(entry)));
}

function validateDbUpdateData(data: CatalogDbUpdateData) {
  if (hasOwn(data as Record<string, unknown>, "title")) {
    if (typeof data.title !== "string" || data.title.trim().length === 0) {
      return "Title must be a non-empty string.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "slug")) {
    if (typeof data.slug !== "string" || data.slug.trim().length === 0) {
      return "Slug must be a non-empty string.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "description")) {
    if (!(typeof data.description === "string" || data.description === null)) {
      return "Description must be a string or null.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "category") && !isValidDbCategory(data.category)) {
    return "Invalid category.";
  }

  if (hasOwn(data as Record<string, unknown>, "defaultVariantId")) {
    if (!(typeof data.defaultVariantId === "string" || data.defaultVariantId === null)) {
      return "Default variant id must be a string or null.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "tags") && !isStringArray(data.tags)) {
    return "Tags must be an array of strings.";
  }

  if (hasOwn(data as Record<string, unknown>, "styleTags") && !isStringArray(data.styleTags)) {
    return "Style tags must be an array of strings.";
  }

  if (hasOwn(data as Record<string, unknown>, "toneTags") && !isStringArray(data.toneTags)) {
    return "Tone tags must be an array of strings.";
  }

  if (hasOwn(data as Record<string, unknown>, "roomTags") && !isStringArray(data.roomTags)) {
    return "Room tags must be an array of strings.";
  }

  if (hasOwn(data as Record<string, unknown>, "variantsJson") && !isValidVariantsJson(data.variantsJson)) {
    return "variantsJson must be an array of variant objects or null.";
  }

  return null;
}

function validateYamlUpdateData(data: CatalogYamlUpdateData) {
  const stringFields: EditableYamlField[] = [
    "brand",
    "category",
    "product_family",
    "product_name",
    "variant",
    "price_band",
    "brand_tier",
    "design_zone",
    "anchor_role",
    "size_class",
    "shape",
    "base_type",
    "material_family",
    "material_mix",
    "color_family",
    "tone",
    "style_cluster",
    "style_secondary",
    "design_era",
  ];

  for (const field of stringFields) {
    if (!hasOwn(data as Record<string, unknown>, field)) continue;
    const value = data[field];
    if (value !== null && typeof value !== "string") {
      return `${field} must be a string or null.`;
    }
  }

  if (hasOwn(data as Record<string, unknown>, "category")) {
    if (typeof data.category !== "string" || data.category.trim().length === 0) {
      return "YAML category must be a non-empty string.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "price_usd")) {
    if (!(typeof data.price_usd === "number" || data.price_usd === null)) {
      return "price_usd must be a number or null.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "seat_capacity")) {
    if (!(typeof data.seat_capacity === "number" || data.seat_capacity === null)) {
      return "seat_capacity must be a number or null.";
    }
  }

  const objectFields: EditableYamlField[] = [
    "dimensions",
    "materials",
    "finish",
    "visual_attributes",
    "spatial_attributes",
    "placement_rules",
    "compatibility",
    "bundle_metadata",
    "ai_flags",
  ];

  for (const field of objectFields) {
    if (!hasOwn(data as Record<string, unknown>, field)) continue;
    const value = data[field];
    if (!(value === null || isPlainObject(value))) {
      return `${field} must be an object or null.`;
    }
  }

  if (hasOwn(data as Record<string, unknown>, "room_compatibility")) {
    if (!(data.room_compatibility === null || isStringArray(data.room_compatibility))) {
      return "room_compatibility must be an array of strings or null.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "design_pairings")) {
    if (!(data.design_pairings === null || isStringArray(data.design_pairings))) {
      return "design_pairings must be an array of strings or null.";
    }
  }

  if (hasOwn(data as Record<string, unknown>, "variants")) {
    if (!(data.variants === null || Array.isArray(data.variants))) {
      return "variants must be an array or null.";
    }
  }

  return null;
}

function getVariantIds(value: unknown) {
  if (!Array.isArray(value)) return null;
  if (!value.every((entry) => isVariantRecord(entry))) return null;
  return value.map((entry) => entry.id);
}

function validateDefaultVariantSelection(item: CatalogItemRow, data: CatalogDbUpdateData) {
  const nextDefaultVariantId = hasOwn(data as Record<string, unknown>, "defaultVariantId")
    ? ((data.defaultVariantId as string | null | undefined) ?? null)
    : item.defaultVariantId;
  const nextVariantsJson = hasOwn(data as Record<string, unknown>, "variantsJson")
    ? data.variantsJson
    : item.variantsJson;

  if (!nextDefaultVariantId) {
    return null;
  }

  const variantIds = getVariantIds(nextVariantsJson);
  if (!variantIds) {
    return "defaultVariantId requires variantsJson to be an array of variants.";
  }

  if (!variantIds.includes(nextDefaultVariantId)) {
    return "defaultVariantId must match one of the configured variants.";
  }

  return null;
}

function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>) {
  const next = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    if (Array.isArray(value) || value === null || typeof value !== "object") {
      next[key] = value;
      continue;
    }
    const current = next[key];
    if (typeof current === "object" && current !== null && !Array.isArray(current)) {
      next[key] = deepMerge(current as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      next[key] = deepMerge({}, value as Record<string, unknown>);
    }
  }
  return next;
}

function stripDerivedYamlFields(value: Record<string, unknown>) {
  const next = { ...value };
  delete next.auto_metadata;
  delete next.preset_validation;
  delete next.preset_label;
  delete next.file_path;
  return next;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ catalogItemId: string }> }
) {
  const session = await auth();
  if (!session?.user?.email || !isAdminEmail(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { catalogItemId } = await params;
  let parsedBody: unknown;

  try {
    parsedBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid PATCH body." }, { status: 400 });
  }

  if (!isPlainObject(parsedBody)) {
    return NextResponse.json({ error: "Invalid PATCH body." }, { status: 400 });
  }

  const body = parsedBody as CatalogPatchBody;

  if (body.db !== undefined && !isPlainObject(body.db)) {
    return NextResponse.json({ error: "db must be an object." }, { status: 400 });
  }

  if (body.yaml !== undefined && body.yaml !== null && !isPlainObject(body.yaml)) {
    return NextResponse.json({ error: "yaml must be an object or null." }, { status: 400 });
  }

  const dbData = body.db ? normalizeDbUpdateData(pickDefinedFields(body.db, EDITABLE_DB_FIELDS)) : {};
  const yamlData = body.yaml
    ? normalizeYamlUpdateData(pickDefinedFields(stripDerivedYamlFields(body.yaml), EDITABLE_YAML_FIELDS))
    : {};

  const hasDbUpdate = Object.keys(dbData).length > 0;
  const hasYamlUpdate = Object.keys(yamlData).length > 0;

  if (!hasDbUpdate && !hasYamlUpdate) {
    return NextResponse.json(
      { error: "No valid updatable fields provided." },
      { status: 400 }
    );
  }

  const prismaCompat = prisma as unknown as {
    catalogItem: {
      findUnique: (args: {
        where: { id: string };
        select: {
          id: true;
          assetId: true;
          title: true;
          slug: true;
          description: true;
          category: true;
          defaultVariantId: true;
          tags: true;
          styleTags: true;
          toneTags: true;
          roomTags: true;
          variantsJson: true;
          asset: {
            select: {
              approved: true;
            };
          };
        };
      }) => Promise<CatalogItemRow | null>;
      update: (args: {
        where: { id: string };
        data: {
          title?: string;
          slug?: string;
          description?: string | null;
          category?: string;
          defaultVariantId?: string | null;
          tags?: string[];
          styleTags?: string[];
          toneTags?: string[];
          roomTags?: string[];
          variantsJson?: unknown;
        };
      }) => Promise<unknown>;
    };
  };

  const item = await prismaCompat.catalogItem.findUnique({
    where: { id: catalogItemId },
    select: {
      id: true,
      assetId: true,
      title: true,
      slug: true,
      description: true,
      category: true,
      defaultVariantId: true,
      tags: true,
      styleTags: true,
      toneTags: true,
      roomTags: true,
      variantsJson: true,
      asset: {
        select: {
          approved: true,
        },
      },
    },
  });

  if (!item) {
    return NextResponse.json({ error: "Catalog item not found" }, { status: 404 });
  }

  const dbError = validateDbUpdateData(dbData);
  if (dbError) {
    return NextResponse.json({ error: dbError }, { status: 400 });
  }

  const defaultVariantError = validateDefaultVariantSelection(item, dbData);
  if (defaultVariantError) {
    return NextResponse.json({ error: defaultVariantError }, { status: 400 });
  }

  const yamlError = validateYamlUpdateData(yamlData);
  if (yamlError) {
    return NextResponse.json({ error: yamlError }, { status: 400 });
  }

  const linkedYaml = getFreshCatalogYamlMap().get(item.assetId) ?? null;
  let nextYaml: Record<string, unknown> | null = linkedYaml as unknown as Record<string, unknown> | null;
  let validation = linkedYaml?.preset_validation ?? null;
  let preset = getCatalogPreset(linkedYaml?.category);
  let yamlWrite:
    | {
        filePath: string;
        contents: string;
        responseYaml: Record<string, unknown>;
        preset: ReturnType<typeof getCatalogPreset>;
        validation: typeof validation;
      }
    | null = null;

  if (hasYamlUpdate) {
    if (!linkedYaml?.file_path) {
      return NextResponse.json(
        { error: "No linked catalog YAML is available for this item." },
        { status: 400 }
      );
    }

    const raw = await fs.readFile(linkedYaml.file_path, "utf8");
    const parsed = parse(raw);
    if (!isPlainObject(parsed)) {
      return NextResponse.json(
        { error: "Linked catalog YAML is malformed." },
        { status: 400 }
      );
    }

    const merged = deepMerge(parsed, yamlData);
    const nextCategory = typeof merged.category === "string" ? merged.category : linkedYaml.category;
    preset = getCatalogPreset(nextCategory);

    if (hasOwn(yamlData as Record<string, unknown>, "category") && !preset) {
      return NextResponse.json({ error: "Invalid preset category." }, { status: 400 });
    }

    const withDefaults = preset ? applyPresetDefaults(merged, preset) : merged;
    validation = preset ? validateCatalogAgainstPreset(withDefaults, preset, "publish") : null;
    const autoMetadata = preset ? buildPresetAutoMetadata(withDefaults, preset) : undefined;

    if (item.asset.approved && validation && !validation.publishable) {
      return NextResponse.json(
        {
          error: "Cannot update an approved asset to a non-publishable catalog state.",
          validation,
          preset,
        },
        { status: 400 }
      );
    }

    yamlWrite = {
      filePath: linkedYaml.file_path,
      contents: stringify(withDefaults),
      responseYaml: {
        ...withDefaults,
        file_path: linkedYaml.file_path,
        preset_label: preset?.label ?? null,
        auto_metadata: autoMetadata,
        preset_validation: validation,
      },
      preset,
      validation,
    };
  }

  if (hasDbUpdate) {
    await prismaCompat.catalogItem.update({
      where: { id: catalogItemId },
      data: dbData,
    });
  }

  if (yamlWrite) {
    await fs.writeFile(yamlWrite.filePath, yamlWrite.contents, "utf8");
    invalidateCatalogYamlCache();
    nextYaml = yamlWrite.responseYaml;
    preset = yamlWrite.preset;
    validation = yamlWrite.validation;
  }

  return NextResponse.json({
    ok: true,
    yaml: nextYaml,
    preset,
    validation,
  });
}