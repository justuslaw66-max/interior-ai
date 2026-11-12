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
  console_table: "console_table",
  bar_stool: "bar_stool",
  stool: "bar_stool",
  daybed: "chaise_lounge",
  recliner: "recliner",
  piano: "piano",
  bunk_bed: "bunk_bed",
  cot: "cot",
  crib: "cot",
  dressing_table: "dressing_table",
  kitchen_island: "kitchen_island",
  dishwasher: "dishwasher",
  oven: "oven",
  planter: "planter_box",
};

/**
 * Names that say a product is a particular kind of a broader category (a sofa bed among sofas,
 * an altar cabinet among storage), checked before the category.
 */
const NAME_REFINEMENTS: Array<[RegExp, PlanSymbolKind]> = [
  [/\b(u-shaped|u shaped|u-shape) (sofa|sectional)\b/, "u_shaped_sofa"],
  [/\b(sofa bed|sofabed|sleeper sofa)\b/, "sofa_bed"],
  [/\b(daybed|day bed|chaise longue|chaise lounge)\b/, "chaise_lounge"],
  [/\brecliner\b/, "recliner"],
  [/(?<!tv )\bconsole table\b/, "console_table"],
  [/\b(bar|counter) stool\b/, "bar_stool"],
  [/\bpiano\b/, "piano"],
  [/\bbunk\b/, "bunk_bed"],
  [/\b(cot|crib)\b/, "cot"],
  [/\b(dressing table|makeup table|vanity table)\b/, "dressing_table"],
  [/\b(study table|study desk)\b/, "study_table"],
  [/\b(tall cabinet|pantry|larder|utility cabinet)\b/, "tall_cabinet"],
  [/\bshoe bench\b/, "shoe_bench"],
  [/\baltar\b/, "altar_cabinet"],
  [/\b(wall cabinet|upper cabinet|top cabinet|overhead cabinet)s?\b/, "wall_cabinet"],
  [/\b(fridge|refrigerator) housing\b/, "fridge_housing"],
  [/\bmirror cabinet\b/, "mirror_cabinet"],
];

/** Words in a product's name that say what it is, checked in order when the category says nothing. */
const NAME_SYMBOLS: Array<[RegExp, PlanSymbolKind]> = [
  [/\b(sectional|l-shaped|corner sofa|chaise)\b/, "sectional_sofa"],
  [/\btv (console|cabinet|stand|unit)\b/, "tv_console"],
  [/\b(tv|television)\b/, "wall_tv"],
  [/\b(aircon|air-con|air con|air conditioner|fan coil|fan-coil)\b/, "aircon"],
  [/\b(bistro|patio|balcony|outdoor) set\b/, "outdoor_set"],
  [/\bplanter\b/, "planter_box"],
  [/\b(bay window|window seat)\b/, "bay_window_seat"],
  [/\b(coat rack|coat stand|hat stand)\b/, "coat_rack"],
  [/\b(kitchen )?island\b/, "kitchen_island"],
  [/\b(water heater|storage heater|instant heater)\b/, "water_heater"],
  [/\b(drying rack|laundry rack|clothes rack|ceiling rack)\b/, "drying_rack"],
  [/\b(shower screen|shower glass|glass panel)\b/, "shower_screen"],
  [/\b(towel rail|towel bar|towel rack)\b/, "towel_rail"],
  [/\bdishwasher\b/, "dishwasher"],
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
  [/\boven\b/, "oven"],
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
  for (const [pattern, kind] of NAME_REFINEMENTS) {
    if (pattern.test(lowerName)) return kind;
  }
  const fromCategory = CATEGORY_SYMBOLS[category.trim().toLowerCase()];
  if (fromCategory === "dining_table" && /\bset\b/.test(lowerName)) return "dining_set";
  if (fromCategory) return fromCategory;
  for (const [pattern, kind] of NAME_SYMBOLS) {
    if (pattern.test(lowerName)) return kind;
  }
  return null;
}
