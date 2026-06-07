import type { CatalogItemSchema, ProductVariant } from "@/lib/catalog-schema";
import type { ImportedModelCatalog } from "@/lib/catalog/imported-model-assembly";
import type { DesignItem } from "@/lib/room-types";

export type ProductInfoRow = { label: string; value: string };

export type ProductInfoSections = {
  material: ProductInfoRow[];
  deliveryWarranty: ProductInfoRow[];
};

type CatalogVariantLike = NonNullable<ImportedModelCatalog["variants"]>[number];

const MATERIAL_KEY_LABELS: Record<string, string> = {
  body: "Body",
  base: "Base",
  frame: "Frame",
  handle: "Handle",
  leg: "Leg",
  legs: "Legs",
  tabletop: "Tabletop",
  table_top: "Tabletop",
  upholstery: "Upholstery",
  cushion: "Cushion",
  top: "Top",
  shelf: "Shelf",
  door: "Door",
  drawer: "Drawer",
  material_family: "Material",
  material_mix: "Material mix",
};

const FINISH_KEY_LABELS: Record<string, string> = {
  color_finish: "Colour",
  finish_color: "Colour",
  surface_finish: "Surface finish",
  hardware_finish: "Hardware finish",
  protective_coating: "Protective coating",
  finish_system: "Finish",
  label: "Finish",
};

const SHIPPING_KEY_LABELS: Record<string, string> = {
  cancellation: "Cancellation",
  warranty: "Warranty",
  return_policy: "Return policy",
  returns_window_days: "Return policy",
  assembly: "Assembly",
  free_delivery_threshold_sgd: "Free delivery",
};

const MATERIAL_PART_ORDER = [
  "tabletop",
  "table_top",
  "top",
  "body",
  "base",
  "frame",
  "legs",
  "leg",
  "upholstery",
  "cushion",
  "shelf",
  "door",
  "drawer",
  "handle",
];

const FINISH_PART_ORDER = [
  "label",
  "color_finish",
  "finish_color",
  "surface_finish",
  "protective_coating",
  "finish_system",
  "hardware_finish",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function uniqueRows(rows: ProductInfoRow[]): ProductInfoRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const label = row.label.trim();
    const value = row.value.trim();
    if (!label || !value) return false;
    const key = `${label.toLowerCase()}::${value.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function humanizeKey(key: string, labels: Record<string, string> = {}): string {
  const normalized = key.trim();
  const mapped = labels[normalized] ?? labels[normalized.toLowerCase()];
  if (mapped) return mapped;
  const words = normalized.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Detail";
}

function humanizeToken(value: string): string {
  const normalized = value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (/[A-Z]/.test(normalized.slice(1))) return normalized;
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatScalar(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value !== "string") return "";
  return humanizeToken(value);
}

function formatRecordValue(value: Record<string, unknown>): string {
  const preferredKeys = [
    "material",
    "structure",
    "surface",
    "composition",
    "finish",
    "color_finish",
    "finish_color",
    "surface_finish",
    "protective_coating",
    "finish_system",
    "hardware_finish",
    "label",
  ];

  const values = preferredKeys
    .map((key) => formatValue(value[key]))
    .filter(Boolean);

  if (values.length) return Array.from(new Set(values)).join(", ");

  return Object.entries(value)
    .map(([key, entry]) => {
      const formatted = formatValue(entry);
      return formatted ? `${humanizeKey(key)}: ${formatted}` : "";
    })
    .filter(Boolean)
    .join(", ");
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((entry) => formatValue(entry)).filter(Boolean).join(", ");
  }
  if (isRecord(value)) return formatRecordValue(value);
  return formatScalar(value);
}

function orderedEntries(record: Record<string, unknown>, order: string[]) {
  const keys = Object.keys(record);
  return [
    ...order.filter((key) => keys.includes(key)),
    ...keys.filter((key) => !order.includes(key)).sort((a, b) => a.localeCompare(b)),
  ].map((key) => [key, record[key]] as const);
}

function findCatalogVariant(
  catalog: ImportedModelCatalog | null,
  activeVariant: ProductVariant | null
): CatalogVariantLike | null {
  const variants = Array.isArray(catalog?.variants) ? catalog.variants : [];
  if (!variants.length || !activeVariant) return variants[0] ?? null;

  const activeFinishCode = String(activeVariant.finishCode ?? "").trim().toLowerCase();
  const activeFinishLabel = String(activeVariant.finishLabel ?? activeVariant.label ?? "").trim().toLowerCase();
  const activeVariantLabel = String(activeVariant.label ?? "").trim().toLowerCase();

  return (
    variants.find((entry) => {
      const code = String(entry.finish_code ?? "").trim().toLowerCase();
      return Boolean(activeFinishCode && code && code === activeFinishCode);
    }) ??
    variants.find((entry) => {
      const label = String(entry.finish_label ?? "").trim().toLowerCase();
      return Boolean(activeFinishLabel && label && label === activeFinishLabel);
    }) ??
    variants.find((entry) => {
      const variantLabel = String(entry.variant ?? "").trim().toLowerCase();
      return Boolean(activeVariantLabel && variantLabel && variantLabel.includes(activeVariantLabel));
    }) ??
    variants[0] ??
    null
  );
}

function buildMaterialRows(args: {
  selectedProduct: CatalogItemSchema;
  activeVariant: ProductVariant | null;
  catalog: ImportedModelCatalog | null;
  catalogVariant: CatalogVariantLike | null;
}): ProductInfoRow[] {
  const { selectedProduct, activeVariant, catalog, catalogVariant } = args;
  const rows: ProductInfoRow[] = [];
  const materials =
    (isRecord(catalogVariant?.materials) ? catalogVariant.materials : null) ??
    (isRecord(catalog?.materials) ? catalog.materials : null);

  if (materials) {
    for (const [key, value] of orderedEntries(materials, MATERIAL_PART_ORDER)) {
      const formatted = formatValue(value);
      if (formatted) {
        rows.push({ label: humanizeKey(key, MATERIAL_KEY_LABELS), value: formatted });
      }
    }
  }

  const finish =
    (isRecord(catalogVariant?.finish) ? catalogVariant.finish : null) ??
    (isRecord(catalog?.finish) ? catalog.finish : null);

  if (finish) {
    for (const [key, value] of orderedEntries(finish, FINISH_PART_ORDER)) {
      const formatted = formatValue(value);
      if (formatted) {
        rows.push({ label: humanizeKey(key, FINISH_KEY_LABELS), value: formatted });
      }
    }
  }

  const finishLabel = activeVariant?.finishLabel ?? activeVariant?.label;
  if (finishLabel && !rows.some((row) => row.label === "Colour" || row.label === "Finish")) {
    rows.push({ label: "Colour", value: finishLabel });
  }

  const materialFamily = formatValue(catalog?.materialFamily);
  if (materialFamily && !rows.some((row) => row.label === "Material")) {
    rows.push({ label: "Material", value: materialFamily });
  }

  const materialMix = formatValue(catalog?.material_mix);
  if (materialMix && !rows.some((row) => row.value.toLowerCase() === materialMix.toLowerCase())) {
    rows.push({ label: "Material mix", value: materialMix });
  }

  if (!rows.length && selectedProduct.metadata?.materialFamily) {
    rows.push({ label: "Material", value: formatValue(selectedProduct.metadata.materialFamily) });
  }

  return uniqueRows(rows).slice(0, 10);
}

function buildDeliveryWarrantyRows(catalog: ImportedModelCatalog | null): ProductInfoRow[] {
  const shipping = isRecord(catalog?.shipping_and_warranty) ? catalog.shipping_and_warranty : null;
  if (!shipping) return [];

  const rows: ProductInfoRow[] = [];
  for (const [key, value] of orderedEntries(shipping, [
    "cancellation",
    "warranty",
    "return_policy",
    "returns_window_days",
    "assembly",
    "free_delivery_threshold_sgd",
  ])) {
    if (key === "returns_window_days") {
      const days = Number(value);
      if (Number.isFinite(days) && days > 0 && !rows.some((row) => row.label === "Return policy")) {
        rows.push({ label: "Return policy", value: `${days}-day returns` });
      }
      continue;
    }

    if (key === "free_delivery_threshold_sgd") {
      const amount = Number(value);
      if (Number.isFinite(amount) && amount > 0) {
        rows.push({ label: "Free delivery", value: `Orders over SGD ${amount}` });
      }
      continue;
    }

    const formatted = formatValue(value);
    if (formatted) {
      rows.push({ label: humanizeKey(key, SHIPPING_KEY_LABELS), value: formatted });
    }
  }

  return uniqueRows(rows);
}

export function buildProductInfoSections(args: {
  selectedProduct: CatalogItemSchema | null;
  selectedItem: DesignItem | null;
  selectedImportedCatalog: ImportedModelCatalog | null;
  override?: Partial<ProductInfoSections> | null;
}): ProductInfoSections | null {
  const { selectedProduct, selectedItem, selectedImportedCatalog, override } = args;
  if (!selectedProduct) return null;

  const activeVariant =
    selectedProduct.variants.find((variant) => variant.id === selectedItem?.variantId) ??
    selectedProduct.variants[0] ??
    null;
  const catalogVariant = findCatalogVariant(selectedImportedCatalog, activeVariant);

  const material = override?.material?.length
    ? override.material
    : buildMaterialRows({
        selectedProduct,
        activeVariant,
        catalog: selectedImportedCatalog,
        catalogVariant,
      });

  const deliveryWarranty = override?.deliveryWarranty?.length
    ? override.deliveryWarranty
    : buildDeliveryWarrantyRows(selectedImportedCatalog);

  return {
    material,
    deliveryWarranty,
  };
}
