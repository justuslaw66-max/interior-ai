import type { PlanSymbolKind } from "./plan-symbol-types";

/** Catalogue and editor categories that map straight to a symbol. */
const CATEGORY_SYMBOLS: Record<string, PlanSymbolKind> = {
  sofa: "sofa",
  sectional_sofa: "sectional_sofa",
  armchair: "armchair",
  accent_chair: "armchair",
  chair: "dining_chair",
  dining_chair: "dining_chair",
  ottoman: "ottoman",
  coffee_table: "coffee_table",
  side_table: "side_table",
  tv_console: "tv_console",
  rug: "rug",
  floor_lamp: "floor_lamp",
  table_lamp: "table_lamp",
  pendant_light: "pendant_light",
  ceiling_fan: "ceiling_fan",
  plant: "plant",
  dining_table: "dining_table",
  dining_set: "dining_set",
  dining_bench: "dining_bench",
  bed: "bed",
  nightstand: "nightstand",
  wardrobe: "wardrobe",
  dresser: "dresser",
  desk: "desk",
  office_chair: "office_chair",
  sideboard: "sideboard",
  storage: "storage",
  cabinet: "storage",
  bookshelf: "bookshelf",
  shelving: "bookshelf",
  shoe_cabinet: "shoe_cabinet",
};

/** Words in a product's name that say what it is, checked in order. */
const NAME_SYMBOLS: Array<[RegExp, PlanSymbolKind]> = [
  [/\b(sectional|l-shaped|corner sofa|chaise)\b/, "sectional_sofa"],
  [/\b(sofa|couch|loveseat|settee)\b/, "sofa"],
  [/\bdining set\b/, "dining_set"],
  [/\b(toilet|wc|water closet)\b/, "toilet"],
  [/\b(wardrobe|closet)\b/, "wardrobe"],
  [/\b(fridge|refrigerator)\b/, "fridge"],
  [/\b(washing machine|washer)\b/, "washing_machine"],
  [/\bdryer\b/, "dryer"],
  [/\bvanity\b/, "vanity"],
  [/\b(basin|lavatory)\b/, "basin"],
  [/\bsink\b/, "kitchen_sink"],
  [/\b(hob|cooktop|stove)\b/, "hob"],
  [/\b(hood|chimney)\b/, "range_hood"],
  [/\bmicrowave\b/, "microwave"],
  [/\bshower\b/, "shower"],
  [/\b(bathtub|bath tub)\b/, "bathtub"],
  [/\bceiling fan\b/, "ceiling_fan"],
  [/\bshoe\b/, "shoe_cabinet"],
  [/\b(bedside|nightstand)\b/, "nightstand"],
  [/\bbed\b/, "bed"],
  [/\bdesk\b/, "desk"],
  [/\b(dresser|chest of drawers)\b/, "dresser"],
  [/\b(plant|tree)\b/, "plant"],
  [/\b(rug|carpet)\b/, "rug"],
];

/**
 * The symbol for a product, from its category and then its name.
 * Returns null for things a plan doesn't draw (wall art, accessories) or doesn't know yet.
 */
export function resolvePlanSymbolKind(category: string, name = ""): PlanSymbolKind | null {
  const lowerName = name.toLowerCase();
  const fromCategory = CATEGORY_SYMBOLS[category.trim().toLowerCase()];
  if (fromCategory === "dining_table" && /\bset\b/.test(lowerName)) return "dining_set";
  if (fromCategory) return fromCategory;
  for (const [pattern, kind] of NAME_SYMBOLS) {
    if (pattern.test(lowerName)) return kind;
  }
  return null;
}
