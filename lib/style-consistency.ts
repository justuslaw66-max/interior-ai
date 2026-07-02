import type { CatalogItemSchema, ProductVariant } from "@/lib/catalog-schema";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";

export type StyleConsistencyStatus = "solo" | "cohesive" | "mixed" | "clashing";

export interface StyleConsistencyFinding {
  kind: "style" | "tone" | "finish" | "material";
  severity: "info" | "warning" | "critical";
  label: string;
  message: string;
}
export interface StyleConsistencyAlternative {
  productId: string;
  title: string;
  reason: string;
  score: number;
}

export interface StyleConsistencyReport {
  status: StyleConsistencyStatus;
  score: number;
  summary: string;
  findings: StyleConsistencyFinding[];
  dominantStyles: string[];
  dominantTones: string[];
  dominantFinishFamilies: string[];
  alternatives: StyleConsistencyAlternative[];
}

type CatalogMap = Record<string, CatalogItemSchema>;

function normalizeToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function overlapCount(first: readonly string[], second: readonly string[]): number {
  const firstSet = new Set(first.map(normalizeToken).filter(Boolean));
  let count = 0;
  for (const value of second.map(normalizeToken)) {
    if (firstSet.has(value)) count += 1;
  }
  return count;
}

function getVariant(item: DesignItem, product: CatalogItemSchema): ProductVariant | null {
  return (
    product.variants.find((variant) => variant.id === item.variantId) ??
    product.variants.find((variant) => variant.id === product.defaultVariantId) ??
    product.variants[0] ??
    null
  );
}

function getFinishFamily(variant: ProductVariant | null): string | null {
  if (!variant) return null;
  const text = [
    variant.finishCode,
    variant.finishLabel,
    variant.label,
    variant.materialType,
    variant.swatchGroup,
  ]
    .map(normalizeToken)
    .filter(Boolean)
    .join("_");

  if (!text) return null;
  if (/moss|olive|sage|green/.test(text)) return "earth_green";
  if (/walnut|chestnut|oak|wood|natural|caramel|cumin|ginger|rust/.test(text)) return "warm_wood";
  if (/black|espresso|charcoal|slate|graphite/.test(text)) return "dark";
  if (/grey|gray|silver|stone|dove/.test(text)) return "cool_neutral";
  if (/cream|ivory|white|beige|sand|oat|pearl|linen/.test(text)) return "soft_neutral";
  if (/leather/.test(text)) return "leather";
  return text.split("_").slice(0, 2).join("_");
}

function dominantValues(values: string[], minimumCount = 2): string[] {
  const counts = new Map<string, number>();
  for (const value of values.map(normalizeToken).filter(Boolean)) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const topCount = Math.max(0, ...counts.values());
  if (topCount < minimumCount) return [];

  return [...counts.entries()]
    .filter(([, count]) => count === topCount)
    .map(([value]) => value)
    .slice(0, 3);
}

function labelToken(value: string): string {
  return value.replace(/_/g, " ");
}

function scoreAlternative(
  candidate: CatalogItemSchema,
  selectedProduct: CatalogItemSchema,
  roomStyles: string[],
  roomTones: string[],
  roomFinishFamilies: string[]
): { score: number; reasons: string[] } {
  if (candidate.id === selectedProduct.id || candidate.category !== selectedProduct.category) {
    return { score: -1, reasons: [] };
  }

  let score = 0;
  const reasons: string[] = [];
  const styleOverlap = overlapCount(candidate.styleTags, roomStyles);
  const toneOverlap = overlapCount(candidate.toneTags, roomTones);
  const candidateFinishFamilies = candidate.variants
    .map(getFinishFamily)
    .filter((value): value is string => Boolean(value));
  const finishOverlap = overlapCount(candidateFinishFamilies, roomFinishFamilies);

  if (styleOverlap > 0) {
    score += styleOverlap * 5;
    reasons.push(`matches ${labelToken(roomStyles[0])}`);
  }
  if (toneOverlap > 0) {
    score += toneOverlap * 3;
    reasons.push(`shares ${labelToken(roomTones[0])} tones`);
  }
  if (finishOverlap > 0) {
    score += finishOverlap * 3;
    reasons.push(`coordinates with ${labelToken(roomFinishFamilies[0])}`);
  }
  if (candidate.metadata?.brand && candidate.metadata.brand === selectedProduct.metadata?.brand) {
    score += 1;
  }

  return { score, reasons };
}

export function evaluateStyleConsistency({
  room,
  selectedItem,
  catalogItems,
  limit = 3,
}: {
  room: RoomSnapshot;
  selectedItem: DesignItem;
  catalogItems: CatalogMap;
  limit?: number;
}): StyleConsistencyReport | null {
  const selectedProduct = catalogItems[selectedItem.productId];
  if (!selectedProduct) return null;

  const selectedVariant = getVariant(selectedItem, selectedProduct);
  const comparisonItems = room.items.filter((item) => item.instanceId !== selectedItem.instanceId);
  const comparisonProducts = comparisonItems
    .map((item) => {
      const product = catalogItems[item.productId];
      if (!product) return null;
      return { item, product, variant: getVariant(item, product) };
    })
    .filter((entry): entry is { item: DesignItem; product: CatalogItemSchema; variant: ProductVariant | null } =>
      Boolean(entry)
    );

  if (comparisonProducts.length < 2) {
    return {
      status: "solo",
      score: 100,
      summary: "Add more pieces to check room consistency.",
      findings: [],
      dominantStyles: [],
      dominantTones: [],
      dominantFinishFamilies: [],
      alternatives: [],
    };
  }

  const dominantStyles = dominantValues(comparisonProducts.flatMap((entry) => entry.product.styleTags));
  const dominantTones = dominantValues(comparisonProducts.flatMap((entry) => entry.product.toneTags));
  const dominantFinishFamilies = dominantValues(
    comparisonProducts
      .map((entry) => getFinishFamily(entry.variant))
      .filter((value): value is string => Boolean(value))
  );
  const findings: StyleConsistencyFinding[] = [];
  let score = 100;

  if (dominantStyles.length > 0 && overlapCount(selectedProduct.styleTags, dominantStyles) === 0) {
    score -= 35;
    findings.push({
      kind: "style",
      severity: "critical",
      label: "Style mismatch",
      message: `Most room pieces lean ${dominantStyles.map(labelToken).join(", ")}.`,
    });
  }

  if (dominantTones.length > 0 && overlapCount(selectedProduct.toneTags, dominantTones) === 0) {
    score -= 20;
    findings.push({
      kind: "tone",
      severity: "warning",
      label: "Tone shift",
      message: `Room tones are mostly ${dominantTones.map(labelToken).join(", ")}.`,
    });
  }

  const selectedFinishFamily = getFinishFamily(selectedVariant);
  if (
    selectedFinishFamily &&
    dominantFinishFamilies.length > 0 &&
    !dominantFinishFamilies.includes(selectedFinishFamily)
  ) {
    score -= 15;
    findings.push({
      kind: "finish",
      severity: "warning",
      label: "Finish outlier",
      message: `Existing finishes lean ${dominantFinishFamilies.map(labelToken).join(", ")}.`,
    });
  }

  const status: StyleConsistencyStatus =
    findings.some((finding) => finding.severity === "critical")
      ? "clashing"
      : findings.length > 0
        ? "mixed"
        : "cohesive";

  const alternatives = Object.values(catalogItems)
    .map((candidate) => {
      const { score: alternativeScore, reasons } = scoreAlternative(
        candidate,
        selectedProduct,
        dominantStyles,
        dominantTones,
        dominantFinishFamilies
      );
      return {
        productId: candidate.id,
        title: candidate.title,
        reason: reasons[0] ?? "closer room match",
        score: alternativeScore,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit);

  return {
    status,
    score: Math.max(0, Math.min(100, score)),
    summary:
      status === "cohesive"
        ? "This piece fits the room direction."
        : status === "mixed"
          ? "This piece can work, but check the mix."
          : "This piece clashes with the room direction.",
    findings,
    dominantStyles,
    dominantTones,
    dominantFinishFamilies,
    alternatives,
  };
}
