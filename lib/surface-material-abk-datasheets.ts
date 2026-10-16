import datasheets from "./surface-material-abk-data/datasheets.json";

/**
 * ABK Group's technical sheets for the Gardenia&Ariana collections, as data. J, 14 Oct 2026: "Yes download all of them for my
 * webapp and the ai to be smarter to have the knowledge to design", then chose the technical sheets. One record per sheet, in the
 * sheet's own terms: what it covers (thickness, size, finish), its slip classes, shade variation, water absorption and frost
 * resistance. The PDFs, with these sha256s, are in J's masters (material-masters/gardenia/abk-documents/). The records are in
 * surface-material-abk-data/datasheets.json; lib/surface-material-abk-datasheet-lookup.ts finds the sheet line for a catalogue
 * entry; docs/architecture/surface-material-abk-documents.md describes it all.
 *
 * Finish words: nat (Natural, Nat. P.Tech, "rett."), grip, r11 (R11 and X20), antique_3d, lux, soft, glossy, satin, and Bon Ton's
 * nat_3d, lux_3d, soft_3d. A size of "*" means the sheet gives its values by thickness only.
 */

const ABK_FINISHES = [
  "nat",
  "grip",
  "r11",
  "antique_3d",
  "lux",
  "soft",
  "glossy",
  "satin",
  "nat_3d",
  "lux_3d",
  "soft_3d",
  "unstated",
] as const;

export type AbkFinish = (typeof ABK_FINISHES)[number];

const SHADE_VARIATIONS = ["V1", "V2", "V3", "V4"] as const;

export type AbkSlipByFinish = Readonly<Partial<Record<AbkFinish, string>>>;

export type AbkDatasheetSheet = {
  /** What the sheet covers, as it lists it: "<thickness> mm: <size> <finish>, <finish> | <size> <finish>". */
  formats: readonly string[];
  /** DIN 51130 / DIN EN 16165 Annex B (shod foot, ramp test), by finish; null when the sheet gives no slip class. */
  shod_slip: AbkSlipByFinish | null;
  /** DIN 51097 / DIN EN 16165 Annex A (bare foot), by finish, as the sheet writes it (A, A+B, A+B+C, B, C). */
  barefoot_slip?: AbkSlipByFinish;
  shade_variation?: (typeof SHADE_VARIATIONS)[number];
  notes?: readonly string[];
};

export type AbkDatasheet = {
  /** The catalogue's collection name. */
  collection: string;
  file: string;
  bytes: number;
  sha256: string;
  /** The sheet's description of the product. */
  body: string;
  /** UNI EN 14411 (ISO 13006) group, as the sheet gives it. */
  en14411_group?: string;
  water_absorption: string;
  frost_resistant: boolean | null;
  fire_reaction?: string;
  sheets: readonly AbkDatasheetSheet[];
};

export const ABK_DATASHEETS_READ_ON = "2026-10-14";

/** The download page of a collection's sheet; `slug` is ABK's URL name (epoque-20, plein-air). */
export function getAbkDatasheetUrl(slug: string): string {
  return `https://www.abkgroup.it/en/gardeniaariana/download-area/dl/collection/datasheet/${slug}/download/`;
}

export type AbkDatasheetRecord = AbkDatasheet & {
  /** ABK's URL name for the collection (epoque-20, plein-air). */
  slug: string;
};

/** A sheet's finish word, checked: the data file may only use the words above. */
export function toAbkFinish(word: string): AbkFinish {
  const finish = ABK_FINISHES.find((known) => known === word);
  if (!finish) throw new Error(`Unknown datasheet finish "${word}".`);
  return finish;
}

type RawSlip = Readonly<Record<string, string | undefined>>;

type RawSheet = {
  formats: readonly string[];
  shod_slip: RawSlip | null;
  barefoot_slip?: RawSlip;
  shade_variation?: string;
  notes?: readonly string[];
};

function toSlipByFinish(slip: RawSlip): AbkSlipByFinish {
  return Object.fromEntries(
    Object.entries(slip).flatMap(([finish, value]) => (value === undefined ? [] : [[toAbkFinish(finish), value]]))
  );
}

function readSheet(sheet: RawSheet): AbkDatasheetSheet {
  const shade = SHADE_VARIATIONS.find((known) => known === sheet.shade_variation);
  if (sheet.shade_variation && !shade) throw new Error(`Unknown shade variation "${sheet.shade_variation}".`);
  return {
    formats: sheet.formats,
    shod_slip: sheet.shod_slip ? toSlipByFinish(sheet.shod_slip) : null,
    ...(sheet.barefoot_slip ? { barefoot_slip: toSlipByFinish(sheet.barefoot_slip) } : {}),
    ...(shade ? { shade_variation: shade } : {}),
    ...(sheet.notes ? { notes: sheet.notes } : {}),
  };
}

const rawDatasheets: readonly (Omit<AbkDatasheetRecord, "sheets"> & { sheets: readonly RawSheet[] })[] = datasheets;

/** The 21 sheets ABK's download area lists (Technical Sheets, 14 Oct 2026); Block and Eterea have none. */
export const ABK_DATASHEETS: readonly AbkDatasheetRecord[] = rawDatasheets.map((record) => ({
  ...record,
  sheets: record.sheets.map(readSheet),
}));
