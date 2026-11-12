import type {
  PlanSymbol,
  PlanSymbolBuilder,
  PlanSymbolKind,
  PlanSymbolOptions,
} from "./plan-symbol-types";
import {
  armchairSymbol,
  ceilingFanSymbol,
  coffeeTableSymbol,
  floorLampSymbol,
  ottomanSymbol,
  pendantLightSymbol,
  plantSymbol,
  rugSymbol,
  sectionalSofaSymbol,
  sideTableSymbol,
  sofaSymbol,
  tableLampSymbol,
  tvConsoleSymbol,
} from "./plan-symbols-living";
import {
  bedSymbol,
  bookshelfSymbol,
  deskSymbol,
  diningBenchSymbol,
  diningChairSymbol,
  diningSetSymbol,
  diningTableSymbol,
  dresserSymbol,
  nightstandSymbol,
  officeChairSymbol,
  roundDiningSetSymbol,
  shoeCabinetSymbol,
  sideboardSymbol,
  storageSymbol,
  wardrobeSymbol,
} from "./plan-symbols-dining-bedroom";
import {
  basinSymbol,
  bathtubSymbol,
  dryerSymbol,
  fridgeSymbol,
  hobSymbol,
  kitchenCounterSymbol,
  kitchenSinkSymbol,
  microwaveSymbol,
  rangeHoodSymbol,
  showerSymbol,
  toiletSymbol,
  vanitySymbol,
  washingMachineSymbol,
} from "./plan-symbols-kitchen-bath";
import {
  airconSymbol,
  barStoolSymbol,
  bayWindowSeatSymbol,
  chaiseLoungeSymbol,
  consoleTableSymbol,
  outdoorSetSymbol,
  pianoSymbol,
  planterBoxSymbol,
  reclinerSymbol,
  sofaBedSymbol,
  uShapedSofaSymbol,
  wallTvSymbol,
} from "./plan-symbols-living-more";
import {
  altarCabinetSymbol,
  bunkBedSymbol,
  coatRackSymbol,
  cotSymbol,
  dressingTableSymbol,
  shoeBenchSymbol,
  studyTableSymbol,
  tallCabinetSymbol,
} from "./plan-symbols-bedroom-storage-more";
import {
  dishwasherSymbol,
  dryingRackSymbol,
  fridgeHousingSymbol,
  kitchenIslandSymbol,
  mirrorCabinetSymbol,
  ovenSymbol,
  showerScreenSymbol,
  towelRailSymbol,
  wallCabinetSymbol,
  waterHeaterSymbol,
} from "./plan-symbols-kitchen-bath-more";

export type PlanSymbolGroup = "Living" | "Dining" | "Bedroom & study" | "Storage" | "Kitchen & laundry" | "Bathroom" | "Balcony & window";

type PlanSymbolEntry = {
  label: string;
  group: PlanSymbolGroup;
  /** A typical Singapore size in metres, used when a product gives none. */
  typical: { width: number; depth: number };
  build: PlanSymbolBuilder;
};

/** Every symbol, in the order a symbol sheet shows them. */
export const PLAN_SYMBOLS: Record<PlanSymbolKind, PlanSymbolEntry> = {
  sofa: { label: "Sofa", group: "Living", typical: { width: 2.1, depth: 0.92 }, build: sofaSymbol },
  sectional_sofa: { label: "Sectional sofa", group: "Living", typical: { width: 2.8, depth: 1.6 }, build: sectionalSofaSymbol },
  armchair: { label: "Armchair", group: "Living", typical: { width: 0.8, depth: 0.82 }, build: armchairSymbol },
  ottoman: { label: "Ottoman", group: "Living", typical: { width: 0.6, depth: 0.6 }, build: ottomanSymbol },
  coffee_table: { label: "Coffee table", group: "Living", typical: { width: 1.2, depth: 0.6 }, build: coffeeTableSymbol },
  side_table: { label: "Side table", group: "Living", typical: { width: 0.45, depth: 0.45 }, build: sideTableSymbol },
  tv_console: { label: "TV console", group: "Living", typical: { width: 1.8, depth: 0.42 }, build: tvConsoleSymbol },
  rug: { label: "Rug", group: "Living", typical: { width: 2.0, depth: 1.4 }, build: rugSymbol },
  floor_lamp: { label: "Floor lamp", group: "Living", typical: { width: 0.4, depth: 0.4 }, build: floorLampSymbol },
  table_lamp: { label: "Table lamp", group: "Living", typical: { width: 0.3, depth: 0.3 }, build: tableLampSymbol },
  pendant_light: { label: "Pendant light", group: "Living", typical: { width: 0.45, depth: 0.45 }, build: pendantLightSymbol },
  ceiling_fan: { label: "Ceiling fan", group: "Living", typical: { width: 1.32, depth: 1.32 }, build: ceilingFanSymbol },
  plant: { label: "Plant", group: "Living", typical: { width: 0.5, depth: 0.5 }, build: plantSymbol },
  u_shaped_sofa: { label: "U-shaped sofa", group: "Living", typical: { width: 3.2, depth: 2.2 }, build: uShapedSofaSymbol },
  sofa_bed: { label: "Sofa bed", group: "Living", typical: { width: 2.0, depth: 0.95 }, build: sofaBedSymbol },
  chaise_lounge: { label: "Daybed / chaise longue", group: "Living", typical: { width: 1.7, depth: 0.75 }, build: chaiseLoungeSymbol },
  recliner: { label: "Recliner", group: "Living", typical: { width: 0.9, depth: 1.0 }, build: reclinerSymbol },
  console_table: { label: "Console table", group: "Living", typical: { width: 1.2, depth: 0.35 }, build: consoleTableSymbol },
  bar_stool: { label: "Bar stool", group: "Living", typical: { width: 0.4, depth: 0.4 }, build: barStoolSymbol },
  wall_tv: { label: "Wall TV", group: "Living", typical: { width: 1.45, depth: 0.08 }, build: wallTvSymbol },
  piano: { label: "Piano", group: "Living", typical: { width: 1.5, depth: 0.6 }, build: pianoSymbol },
  aircon: { label: "Aircon fan-coil", group: "Living", typical: { width: 0.9, depth: 0.25 }, build: airconSymbol },
  dining_table: { label: "Dining table", group: "Dining", typical: { width: 1.6, depth: 0.9 }, build: diningTableSymbol },
  dining_set: { label: "Dining set", group: "Dining", typical: { width: 2.6, depth: 1.75 }, build: diningSetSymbol },
  round_dining_set: { label: "Round dining set", group: "Dining", typical: { width: 1.9, depth: 1.9 }, build: roundDiningSetSymbol },
  dining_chair: { label: "Dining chair", group: "Dining", typical: { width: 0.45, depth: 0.5 }, build: diningChairSymbol },
  dining_bench: { label: "Dining bench", group: "Dining", typical: { width: 1.4, depth: 0.38 }, build: diningBenchSymbol },
  bed: { label: "Bed", group: "Bedroom & study", typical: { width: 1.6, depth: 2.1 }, build: bedSymbol },
  nightstand: { label: "Bedside table", group: "Bedroom & study", typical: { width: 0.45, depth: 0.4 }, build: nightstandSymbol },
  wardrobe: { label: "Wardrobe", group: "Bedroom & study", typical: { width: 1.8, depth: 0.6 }, build: wardrobeSymbol },
  dresser: { label: "Dresser", group: "Bedroom & study", typical: { width: 1.2, depth: 0.45 }, build: dresserSymbol },
  desk: { label: "Desk", group: "Bedroom & study", typical: { width: 1.2, depth: 0.6 }, build: deskSymbol },
  office_chair: { label: "Office chair", group: "Bedroom & study", typical: { width: 0.62, depth: 0.62 }, build: officeChairSymbol },
  bunk_bed: { label: "Bunk bed", group: "Bedroom & study", typical: { width: 1.0, depth: 2.05 }, build: bunkBedSymbol },
  cot: { label: "Cot", group: "Bedroom & study", typical: { width: 0.65, depth: 1.25 }, build: cotSymbol },
  dressing_table: { label: "Dressing table", group: "Bedroom & study", typical: { width: 1.0, depth: 0.75 }, build: dressingTableSymbol },
  study_table: { label: "Study table", group: "Bedroom & study", typical: { width: 1.4, depth: 0.6 }, build: studyTableSymbol },
  sideboard: { label: "Sideboard", group: "Storage", typical: { width: 1.6, depth: 0.45 }, build: sideboardSymbol },
  storage: { label: "Storage cabinet", group: "Storage", typical: { width: 0.9, depth: 0.45 }, build: storageSymbol },
  bookshelf: { label: "Bookshelf", group: "Storage", typical: { width: 1.6, depth: 0.35 }, build: bookshelfSymbol },
  shoe_cabinet: { label: "Shoe cabinet", group: "Storage", typical: { width: 1.0, depth: 0.35 }, build: shoeCabinetSymbol },
  tall_cabinet: { label: "Tall cabinet", group: "Storage", typical: { width: 0.6, depth: 0.6 }, build: tallCabinetSymbol },
  shoe_bench: { label: "Shoe bench", group: "Storage", typical: { width: 1.0, depth: 0.38 }, build: shoeBenchSymbol },
  coat_rack: { label: "Coat rack", group: "Storage", typical: { width: 0.5, depth: 0.5 }, build: coatRackSymbol },
  altar_cabinet: { label: "Altar cabinet", group: "Storage", typical: { width: 1.2, depth: 0.5 }, build: altarCabinetSymbol },
  kitchen_counter: { label: "Kitchen counter", group: "Kitchen & laundry", typical: { width: 2.4, depth: 0.6 }, build: kitchenCounterSymbol },
  hob: { label: "Hob", group: "Kitchen & laundry", typical: { width: 0.75, depth: 0.45 }, build: hobSymbol },
  kitchen_sink: { label: "Kitchen sink", group: "Kitchen & laundry", typical: { width: 0.86, depth: 0.48 }, build: kitchenSinkSymbol },
  fridge: { label: "Fridge", group: "Kitchen & laundry", typical: { width: 0.7, depth: 0.7 }, build: fridgeSymbol },
  washing_machine: { label: "Washing machine", group: "Kitchen & laundry", typical: { width: 0.6, depth: 0.6 }, build: washingMachineSymbol },
  dryer: { label: "Dryer", group: "Kitchen & laundry", typical: { width: 0.6, depth: 0.6 }, build: dryerSymbol },
  microwave: { label: "Microwave", group: "Kitchen & laundry", typical: { width: 0.5, depth: 0.38 }, build: microwaveSymbol },
  range_hood: { label: "Cooker hood", group: "Kitchen & laundry", typical: { width: 0.9, depth: 0.5 }, build: rangeHoodSymbol },
  kitchen_island: { label: "Kitchen island", group: "Kitchen & laundry", typical: { width: 1.8, depth: 0.9 }, build: kitchenIslandSymbol },
  oven: { label: "Built-in oven", group: "Kitchen & laundry", typical: { width: 0.6, depth: 0.57 }, build: ovenSymbol },
  dishwasher: { label: "Dishwasher", group: "Kitchen & laundry", typical: { width: 0.6, depth: 0.6 }, build: dishwasherSymbol },
  wall_cabinet: { label: "Wall cabinets", group: "Kitchen & laundry", typical: { width: 2.4, depth: 0.35 }, build: wallCabinetSymbol },
  fridge_housing: { label: "Fridge housing", group: "Kitchen & laundry", typical: { width: 0.9, depth: 0.7 }, build: fridgeHousingSymbol },
  drying_rack: { label: "Ceiling drying rack", group: "Kitchen & laundry", typical: { width: 2.0, depth: 0.6 }, build: dryingRackSymbol },
  toilet: { label: "Toilet", group: "Bathroom", typical: { width: 0.4, depth: 0.68 }, build: toiletSymbol },
  basin: { label: "Basin", group: "Bathroom", typical: { width: 0.5, depth: 0.4 }, build: basinSymbol },
  vanity: { label: "Vanity", group: "Bathroom", typical: { width: 0.8, depth: 0.48 }, build: vanitySymbol },
  shower: { label: "Shower", group: "Bathroom", typical: { width: 0.9, depth: 0.9 }, build: showerSymbol },
  bathtub: { label: "Bathtub", group: "Bathroom", typical: { width: 1.6, depth: 0.75 }, build: bathtubSymbol },
  water_heater: { label: "Water heater", group: "Bathroom", typical: { width: 0.5, depth: 0.5 }, build: waterHeaterSymbol },
  shower_screen: { label: "Shower screen", group: "Bathroom", typical: { width: 1.0, depth: 0.08 }, build: showerScreenSymbol },
  towel_rail: { label: "Towel rail", group: "Bathroom", typical: { width: 0.6, depth: 0.1 }, build: towelRailSymbol },
  mirror_cabinet: { label: "Mirror cabinet", group: "Bathroom", typical: { width: 0.8, depth: 0.15 }, build: mirrorCabinetSymbol },
  outdoor_set: { label: "Balcony set", group: "Balcony & window", typical: { width: 1.4, depth: 0.8 }, build: outdoorSetSymbol },
  planter_box: { label: "Planter box", group: "Balcony & window", typical: { width: 1.0, depth: 0.4 }, build: planterBoxSymbol },
  bay_window_seat: { label: "Bay-window seat", group: "Balcony & window", typical: { width: 1.8, depth: 0.5 }, build: bayWindowSeatSymbol },
};

export const PLAN_SYMBOL_KINDS = Object.keys(PLAN_SYMBOLS) as PlanSymbolKind[];

const MIN_SIZE = 0.05;

/** Draws a symbol at a product's footprint (metres). Sizes below 5 cm are raised to 5 cm. */
export function buildPlanSymbol(
  kind: PlanSymbolKind,
  width: number,
  depth: number,
  options: PlanSymbolOptions = {}
): PlanSymbol {
  const safeWidth = Number.isFinite(width) ? Math.max(MIN_SIZE, width) : PLAN_SYMBOLS[kind].typical.width;
  const safeDepth = Number.isFinite(depth) ? Math.max(MIN_SIZE, depth) : PLAN_SYMBOLS[kind].typical.depth;
  return {
    kind,
    width: safeWidth,
    depth: safeDepth,
    shapes: PLAN_SYMBOLS[kind].build(safeWidth, safeDepth, options),
  };
}
