import specialPieces from "./surface-material-abk-data/plein-air-special-pieces.json";

/**
 * What ABK's Plein Air catalogue (published January 2026) and technical sheet say about laying, using and buying Plein Air, the
 * 20 mm R11 outdoor range of Gardenia&Ariana, as data. J, 14 Oct 2026: "Yes download all of them for my webapp and the ai to be
 * smarter to have the knowledge to design". The catalogue's words are kept close; page numbers are the catalogue's own. The
 * catalogue fields built from it (laying and uses of every outdoor floor) are in lib/surface-material-outdoor.ts and
 * docs/architecture/surface-material-abk-documents.md.
 */

export type PleinAirDocument = { title: string; file: string; bytes: number; sha256: string; url: string; read_on: string };

export const PLEIN_AIR_DOCUMENTS: Readonly<Record<"catalogue" | "datasheet", PleinAirDocument>> = {
  catalogue: {
    title: "Plein Air, surface designed for outdoor living (ABK Group catalogue, published January 2026)",
    file: "PLEIN AIR - Catalogue.pdf",
    bytes: 8921051,
    sha256: "a63cf0811ff35bc51827e49651add1c7cbc368b960be5d990244d1b6e4109c1f",
    url: "https://www.abkgroup.it/en/gardeniaariana/download-area/dl/collection/catalogue/plein-air/download/",
    read_on: "2026-10-14",
  },
  datasheet: {
    title: "Plein Air technical characteristics and packing (ABK Group)",
    file: "PLEIN AIR - Datasheet.pdf",
    bytes: 211641,
    sha256: "900fba540a11e2efd3d78d2b0ece03d11da88cc4a162ef14292e24e1b48aad67",
    url: "https://www.abkgroup.it/en/gardeniaariana/download-area/dl/collection/datasheet/plein-air/download/",
    read_on: "2026-10-14",
  },
};

/** The range (catalogue pp. 2-3 and the effect pages). */
export const PLEIN_AIR_RANGE = {
  variants: 67,
  variants_by_effect: { stone: 41, concrete: 17, wood: 9 },
  thickness_mm: 20,
  finish: "R11",
  sizes: ["60x60", "60x90", "60x120", "80x80", "30x120"],
  ranges_by_effect: {
    stone_and_marble: [
      "Anima",
      "Travertine",
      "Belgian Stone",
      "Falaise",
      "Dorica",
      "Concept Stone",
      "La Geoteca",
      "Mineral",
      "Pietra Viva",
      "Nimbus",
      "Storm",
      "Salento",
    ],
    concrete: ["Livingstone", "Camouflage", "Make", "Warehouse", "Urban", "Native"],
    wood: ["Tabulae", "Hermione", "Rayé", "Legend"],
  },
  says:
    "A complete range inspired by the most used materials in architecture to provide designers and landscape architects with " +
    "the tools to design outdoor spaces that are comfortable and contemporary.",
} as const;

/** "A system designed for any external space" (pp. 4-5), with the catalogue's `outdoor_use` for each, where it has one. */
export const PLEIN_AIR_SPACES: readonly { name: string; outdoor_use: string | null }[] = [
  { name: "Driveways and parking areas", outdoor_use: "driveway" },
  { name: "Japanese stepping stones and lawn walkways", outdoor_use: "path" },
  { name: "Courtyards and outdoor living areas", outdoor_use: "patio" },
  { name: "Terraces with a raised laying system", outdoor_use: "terrace" },
  { name: "Street furniture and planters", outdoor_use: null },
  { name: "Pool areas", outdoor_use: "pool_edge" },
  { name: "Steps", outdoor_use: "steps" },
];

/**
 * "Antislip surfaces also designed for wellness locations" (pp. 6-7). The photo pairs La Geoteca Limestone 60x120 R11 floors and
 * grilles with Dorica Travertino Greige 120x280 walls.
 */
export const PLEIN_AIR_WELLNESS: readonly { name: string; outdoor_use: string | null }[] = [
  { name: "Outdoor pools", outdoor_use: "pool_edge" },
  { name: "External showers", outdoor_use: "outdoor_shower" },
  { name: "Indoor pool walkway", outdoor_use: null },
  { name: "Outdoor pool walkway", outdoor_use: "pool_edge" },
];

/** "Multiple laying systems" (pp. 58-59), with the `installation_method` value for each. All are drawn with the 20 mm tile. */
export const PLEIN_AIR_LAYING: readonly { method: string; name: string; says: string }[] = [
  { method: "direct_stick", name: "Traditional installation", says: "Ideal for floorings that will be driven over by vehicles." },
  {
    method: "dry_lay_on_grass",
    name: "Dry installation on grass",
    says: "Enables the creation of paths and walkways that blend in perfectly with the surroundings.",
  },
  { method: "dry_lay_on_gravel_or_sand", name: "Dry installation on gravel", says: "Enables perfect drainage of rainwater." },
  {
    method: "dry_lay_on_gravel_or_sand",
    name: "Dry installation on sand",
    says: "Ideal for creating paths and walkways on beaches and beach bars.",
  },
  {
    method: "raised_installation",
    name: "Outdoor raised installation",
    says:
      "Fixed or adjustable self-levelling pedestals, paved surfaces 25 to 270 mm above the ground. The paving is not rigidly " +
      "connected to its pedestals, so settling is absorbed; no concrete screed, less weight on the substrate; open joints let " +
      "rainwater run off; the cavity improves aeration and thermal insulation and houses utility pipes, easy to inspect.",
  },
];

/** Pedestals per square metre for the three raised systems the catalogue draws (p. 59), labels as printed. */
export const PLEIN_AIR_PEDESTALS: readonly { system: string; pieces_per_sqm: string }[] = [
  { system: "Raised TiL<2", pieces_per_sqm: "3-4" },
  { system: "Raised 2-10cm", pieces_per_sqm: "6-7" },
  { system: "Raised Pedestal System (30x120)", pieces_per_sqm: "5-6" },
];

/** "Technical plus" (pp. 56-57): "Greater thickness, higher performance." */
export const PLEIN_AIR_TECHNICAL_PLUS: readonly string[] = [
  "Resistant to thermal shock",
  "Resistant to loads",
  "Resistant to scratches",
  "Resistant to stains",
  "Resistant to acids",
  "Resistant to salt",
  "Frostproof",
  "Resistant to water",
  "Resistant to fading",
  "Anti-slip",
  "Easy to install",
  "Easy to clean",
  "Easy to remove and replace",
  "Indoor-outdoor continuity",
  "Fireproof",
];

export type PleinAirPacking = {
  size: string;
  /** The tile's real size (rectified), mm. */
  work_size_mm: readonly [number, number];
  pieces_per_box: number;
  sqm_per_box: number;
  kg_per_sqm: number;
  kg_per_box: number;
  boxes_per_pallet: number;
};

/** Packing (technical sheet and catalogue p. 66). Every size is rectified, 20 mm. */
export const PLEIN_AIR_PACKING: readonly PleinAirPacking[] = [
  {
    size: "60x60",
    work_size_mm: [596, 596],
    pieces_per_box: 2,
    sqm_per_box: 0.72,
    kg_per_sqm: 45.3,
    kg_per_box: 32.6,
    boxes_per_pallet: 30,
  },
  {
    size: "60x90",
    work_size_mm: [596, 895],
    pieces_per_box: 1,
    sqm_per_box: 0.54,
    kg_per_sqm: 45.3,
    kg_per_box: 24.5,
    boxes_per_pallet: 32,
  },
  {
    size: "60x120",
    work_size_mm: [596, 1194],
    pieces_per_box: 1,
    sqm_per_box: 0.72,
    kg_per_sqm: 45.3,
    kg_per_box: 32.6,
    boxes_per_pallet: 30,
  },
  {
    size: "80x80",
    work_size_mm: [797.25, 797.25],
    pieces_per_box: 1,
    sqm_per_box: 0.64,
    kg_per_sqm: 45.3,
    kg_per_box: 28.9,
    boxes_per_pallet: 35,
  },
  {
    size: "30x120",
    work_size_mm: [296, 1195.5],
    pieces_per_box: 2,
    sqm_per_box: 0.72,
    kg_per_sqm: 45.3,
    kg_per_box: 32.6,
    boxes_per_pallet: 30,
  },
];

/** The packing of a Plein Air size ("60x120" or "120x60"), or null. */
export function getPleinAirPacking(size: string): PleinAirPacking | null {
  const [a, b] = size.toLowerCase().split("x");
  return PLEIN_AIR_PACKING.find((packing) => packing.size === `${a}x${b}` || packing.size === `${b}x${a}`) ?? null;
}

export type PleinAirSpecialPieceKind =
  | "grille"
  | "corner_grille_right"
  | "corner_grille_left"
  | "bullnose"
  | "l_element"
  | "l_element_grip"
  | "step_edge"
  | "curve";

/**
 * The special pieces (pp. 60-65): "steps and corner elements for platforms and stairs or grilles for pool sides that create style
 * continuity with no compromises". `shape` is what the catalogue's drawing shows.
 */
export const PLEIN_AIR_SPECIAL_PIECE_KINDS: Readonly<
  Record<PleinAirSpecialPieceKind, { name: string; shape: string; sizes: readonly string[]; pieces_per_box: string }>
> = {
  grille: {
    name: "Grille",
    shape: "a strip with slots, for pool sides",
    sizes: ["15x60", "15x80", "15x120"],
    pieces_per_box: "4",
  },
  corner_grille_right: {
    name: "Right corner grille",
    shape: "the grille mitred for a corner",
    sizes: ["15x60", "15x80", "15x120"],
    pieces_per_box: "4",
  },
  corner_grille_left: {
    name: "Left corner grille",
    shape: "the grille mitred for a corner",
    sizes: ["15x60", "15x80", "15x120"],
    pieces_per_box: "4",
  },
  bullnose: {
    name: "Bullnose",
    shape: "a tile with a rounded edge",
    sizes: ["30x60", "30x80", "30x120"],
    pieces_per_box: "1",
  },
  l_element: {
    name: "Element L",
    shape: "a tile with a downturned lip, for steps and platform edges",
    sizes: ["15x80x5", "15x60x5", "15x120x5"],
    pieces_per_box: "2",
  },
  l_element_grip: {
    name: "Element L Grip",
    shape: "the L element with a grip finish",
    sizes: ["15x80x5", "15x60x5", "15x120x5", "30x120x5"],
    pieces_per_box: "2 (30x120x5: 1)",
  },
  step_edge: {
    name: "Step edge",
    shape: "a tile with a rounded front edge, for steps",
    sizes: ["30x80", "30x60", "30x120"],
    pieces_per_box: "1",
  },
  curve: {
    name: "Curve",
    shape: "a tile with a concave quarter-circle cut",
    sizes: ["60x60", "80x80"],
    pieces_per_box: "1",
  },
};

export type PleinAirSpecialPieceColour = {
  /** The range as the catalogue's table names it (Travertine, Dorica, Rayé). */
  range: string;
  colour: string;
  /** The catalogue card the colour's outdoor floors are on; null for Concept Stone, which the catalogue leaves out. */
  card: string | null;
  /** "<kind> <size>" -> ABK item code, as printed. */
  pieces: Readonly<Record<string, string>>;
};

export const PLEIN_AIR_SPECIAL_PIECES: readonly PleinAirSpecialPieceColour[] = specialPieces.colours.map((colour) => ({
  range: colour.range,
  colour: colour.colour,
  card: colour.card ?? null,
  pieces: Object.fromEntries(
    Object.entries(colour.pieces).filter((piece): piece is [string, string] => typeof piece[1] === "string")
  ),
}));

/**
 * Codes the table prints twice, for two different pieces (probably misprints; check with ABK before ordering): 0010503 (Dorica
 * Crema and La Geoteca Ceppo di gre, Element L Grip 15x60x5), 0015741 (Legend Havana and Hermione Noisette, Element L 15x120x5),
 * 0015675 (Legend Havana and Hermione Noisette, Step edge 30x120), 0015879 (Anima Beige and Pietra Viva Camargue Ivory, Step
 * edge 30x120).
 */
export const PLEIN_AIR_SPECIAL_PIECE_CODES_PRINTED_TWICE = ["0010503", "0015741", "0015675", "0015879"] as const;

function isPleinAirSpecialPieceKind(word: string): word is PleinAirSpecialPieceKind {
  return Object.hasOwn(PLEIN_AIR_SPECIAL_PIECE_KINDS, word);
}

/** The special pieces for a catalogue card ("Anima Fango"), with what each is; empty when the catalogue lists none. */
export function getPleinAirSpecialPieces(card: string) {
  const colour = PLEIN_AIR_SPECIAL_PIECES.find((entry) => entry.card === card);
  return Object.entries(colour?.pieces ?? {}).map(([key, code]) => {
    const [kind, size] = key.split(" ");
    if (!isPleinAirSpecialPieceKind(kind)) throw new Error(`Unknown special piece "${key}".`);
    return { kind, name: PLEIN_AIR_SPECIAL_PIECE_KINDS[kind].name, size, code };
  });
}
