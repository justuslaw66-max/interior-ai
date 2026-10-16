import {
  ABK_DATASHEETS,
  toAbkFinish,
  type AbkDatasheetRecord,
  type AbkDatasheetSheet,
  type AbkFinish,
} from "./surface-material-abk-datasheets";

// Finds what ABK's technical sheet says about a catalogue entry: the sheet lines (thickness, size, finish) its name and thickness
// fit, and the slip classes and thickness they agree on. scripts/test-surface-material-physical-scale.ts checks every Gardenia
// entry against it, so the catalogue's slip ratings and thicknesses can't drift from the sheets.

export type AbkDatasheetFormat = { thickness_mm: number; size: string; finishes: readonly AbkFinish[] };

export type AbkDatasheetEntry = {
  collection?: string | null;
  product_name: string;
  total_thickness_mm?: number | null;
};

export type AbkDatasheetMatch = {
  datasheet: AbkDatasheetRecord;
  /** The sheet lines the entry fits: one per thickness and finish. */
  lines: readonly { sheet: AbkDatasheetSheet; format: AbkDatasheetFormat; finish: AbkFinish }[];
  /** Set when every line has the same thickness. */
  thickness_mm: number | null;
  /** DIN 51130 class, set when every line gives the same one. */
  shod_slip: string | null;
  /** DIN 51097 class, set when every line gives the same one. */
  barefoot_slip: string | null;
};

const CATALOGUE_FINISHES: Readonly<Record<string, AbkFinish>> = {
  nat: "nat",
  "nat p.tech": "nat",
  natural: "nat",
  r11: "r11",
  grip: "grip",
  lux: "lux",
  soft: "soft",
  "antique 3d": "antique_3d",
  "nat 3d": "nat_3d",
};

/** "8.5 mm: 120x120 nat | 60x60 nat, grip" -> one format per size. */
export function parseAbkDatasheetFormats(line: string): AbkDatasheetFormat[] {
  const match = /^(\d+(?:\.\d+)?) mm: (.+)$/.exec(line);
  if (!match) throw new Error(`Unreadable datasheet format line: ${line}`);
  const thickness_mm = Number(match[1]);
  return match[2].split("|").map((item) => {
    const [size, ...words] = item.trim().split(" ");
    const finishes = words
      .join(" ")
      .split(",")
      .map((word) => word.trim())
      .filter(Boolean)
      .map(toAbkFinish);
    return { thickness_mm, size, finishes };
  });
}

/** A catalogue name's size and the words after it: "Gardenia Anima Beige 60x120 R11" -> 60x120, "R11". */
export function splitCatalogueSize(productName: string): { size: string; finishWords: string } | null {
  const match = /\s(\d+(?:[.,]\d+)?x\d+(?:[.,]\d+)?)(?:\s(.*))?$/i.exec(productName);
  return match ? { size: match[1].toLowerCase(), finishWords: (match[2] ?? "").trim() } : null;
}

/** The catalogue's finish words as a sheet finish: null when there are none, "other" for a finish no sheet lists (Lappato). */
export function getCatalogueFinish(finishWords: string): AbkFinish | "other" | null {
  if (!finishWords) return null;
  return CATALOGUE_FINISHES[finishWords.toLowerCase()] ?? "other";
}

function sameSize(sheetSize: string, catalogueSize: string): boolean {
  const toParts = (size: string) => size.replace(/,/g, ".").split("x").map(Number);
  const [a, b] = toParts(sheetSize);
  const [c, d] = toParts(catalogueSize);
  return (a === c && b === d) || (a === d && b === c);
}

function onlyValue<T>(values: readonly T[]): T | null {
  return values.length > 0 && values.every((value) => value === values[0]) ? values[0] : null;
}

/**
 * The sheet lines an entry fits. A line fits when its size is the entry's (a "*" size only when the entry names its finish), its
 * thickness is the entry's (any, when the entry has none) and its finish is the entry's; an entry without a finish word fits every
 * finish but R11 (the catalogue names every R11 item).
 */
function findLines(datasheet: AbkDatasheetRecord, entry: AbkDatasheetEntry): AbkDatasheetMatch["lines"] {
  const name = splitCatalogueSize(entry.product_name);
  const finish = name ? getCatalogueFinish(name.finishWords) : "other";
  if (!name || finish === "other") return [];
  const thickness = entry.total_thickness_mm ?? null;
  return datasheet.sheets.flatMap((sheet) =>
    sheet.formats
      .flatMap(parseAbkDatasheetFormats)
      .filter((format) => (format.size === "*" ? finish !== null : sameSize(format.size, name.size)))
      .filter((format) => thickness === null || format.thickness_mm === thickness)
      .flatMap((format) =>
        format.finishes
          .filter((sheetFinish) => (finish ? sheetFinish === finish : sheetFinish !== "r11"))
          .map((sheetFinish) => ({ sheet, format, finish: sheetFinish }))
      )
  );
}

/** What the collection's sheet says about the entry, or null when no sheet line fits it. */
export function findAbkDatasheetMatch(entry: AbkDatasheetEntry): AbkDatasheetMatch | null {
  const datasheet = ABK_DATASHEETS.find((sheet) => sheet.collection === entry.collection);
  const lines = datasheet ? findLines(datasheet, entry) : [];
  if (!datasheet || lines.length === 0) return null;
  return {
    datasheet,
    lines,
    thickness_mm: onlyValue(lines.map((line) => line.format.thickness_mm)),
    shod_slip: onlyValue(lines.map((line) => line.sheet.shod_slip?.[line.finish] ?? null)),
    barefoot_slip: onlyValue(lines.map((line) => line.sheet.barefoot_slip?.[line.finish] ?? null)),
  };
}
