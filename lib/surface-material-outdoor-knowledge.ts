/**
 * What the manufacturer says about outdoor tiles, kept as data so the app (and, later, its AI) can read it. Every fact names its
 * sources and says, in short, what they say; quotes are their own words. Web pages read on 13 Oct 2026 (J: "look at on their
 * website on the use case for outdoor tiles and teach it into the system"), ABK's Plein Air catalogue and technical sheet on 14 Oct
 * (J: "Yes download all of them for my webapp and the ai to be smarter to have the knowledge to design"; their details are in
 * lib/surface-material-plein-air-system.ts). The catalogue fields that carry it are described in
 * docs/architecture/surface-material-outdoor-tiles.md; lib/surface-material-outdoor.ts builds them and keeps their words
 * (SURFACE_OUTDOOR_USE_LABELS, SURFACE_OUTDOOR_LAYING_LABELS), which the Surfaces search reads. Nothing in the app reads this
 * file yet.
 */

export type SurfaceOutdoorSourceId =
  | "abk-plein-air"
  | "abk-room-filter"
  | "gardenia-outdoor-collections"
  | "gardenia-outdoor-everything"
  | "gardenia-outdoor-choosing"
  | "abk-plein-air-catalogue"
  | "abk-plein-air-datasheet";

export type SurfaceOutdoorSource = { title: string; url: string; read_on: string };

export const SURFACE_OUTDOOR_SOURCES: Readonly<Record<SurfaceOutdoorSourceId, SurfaceOutdoorSource>> = {
  "abk-plein-air": {
    title: "Plein Air, Gardenia&Ariana floor and wall tiles (ABK Group)",
    url: "https://www.abkgroup.it/en/gardeniaariana/floor-and-wall-tiles/plein-air/",
    read_on: "2026-10-13",
  },
  "abk-room-filter": {
    title: "Gardenia&Ariana advanced search, Rooms filter (ABK Group)",
    url: "https://www.abkgroup.it/en/gardeniaariana/floor-and-wall-tiles/api/advanced-search/?ambiences__settings=outdoor",
    read_on: "2026-10-13",
  },
  "gardenia-outdoor-collections": {
    title: "Outdoor tiles: here are the Gardenia collections (Gardenia blog)",
    url: "https://blog.gardenia.it/en/outdoor-tiles-here-are-the-gardenia-collections",
    read_on: "2026-10-13",
  },
  "gardenia-outdoor-everything": {
    title: "Outdoor tiles: everything you need to know (Gardenia blog)",
    url: "https://blog.gardenia.it/en/outdoor-tiles-everything-you-need-to-know",
    read_on: "2026-10-13",
  },
  "gardenia-outdoor-choosing": {
    title: "How to choose the right outdoor tiles (Gardenia blog)",
    url: "https://blog.gardenia.it/en/how-to-choose-the-right-outdoor-tiles-style-color-materials-and-dimensions",
    read_on: "2026-10-13",
  },
  "abk-plein-air-catalogue": {
    title: "Plein Air catalogue (ABK Group, published January 2026)",
    url: "https://www.abkgroup.it/en/gardeniaariana/download-area/dl/collection/catalogue/plein-air/download/",
    read_on: "2026-10-14",
  },
  "abk-plein-air-datasheet": {
    title: "Plein Air technical sheet (ABK Group)",
    url: "https://www.abkgroup.it/en/gardeniaariana/download-area/dl/collection/datasheet/plein-air/download/",
    read_on: "2026-10-14",
  },
};

export type SurfaceOutdoorFact = { topic: string; says: string; sources: readonly SurfaceOutdoorSourceId[] };

/** What the sources say, in short. The quotes are the sources' own words. */
export const SURFACE_OUTDOOR_FACTS: readonly SurfaceOutdoorFact[] = [
  {
    topic: "what_an_outdoor_tile_is",
    says:
      "Plein Air is Gardenia&Ariana's outdoor range: porcelain stoneware, 20 mm thick, finish R11 (anti-slip), in 80x80, 60x120, " +
      "60x90, 60x60 and 30x120. It \"transfers the material sensations of Gardenia&Ariana’s main ceramic tile collections to " +
      "exterior spaces\": many of its colours carry the name of an indoor colour (Dorica Avorio, Pietra Viva Aude Beige).",
    sources: ["abk-plein-air"],
  },
  {
    topic: "not_every_tile_goes_outside",
    says:
      "Not every porcelain stoneware tile can be laid outdoors. An outdoor floor takes a tile made for it; in this catalogue, the " +
      "ones with suitable_for_outdoor (Plein Air's 20 mm R11 items).",
    sources: ["gardenia-outdoor-choosing", "abk-plein-air"],
  },
  {
    topic: "where_they_go",
    says:
      "Outdoor tiles go \"from the terrace to the balconies, from the paths to the gardens, from the patio to the pool\". Where " +
      "the floor is (a covered patio, a pool edge, a sloping ramp, a balcony, a terrace) is one of the things that decide the tile.",
    sources: ["gardenia-outdoor-collections", "gardenia-outdoor-everything"],
  },
  {
    topic: "slip_resistance",
    says:
      "Slip resistance matters outside: a surface that feels smooth probably grips too little. Tiles are tested for it: DIN 51130 " +
      "(shod foot), DIN 51097 (bare foot), ANSI A137.1.2012, ASTM C1028, BCRA.",
    sources: ["gardenia-outdoor-everything"],
  },
  {
    topic: "weather",
    says:
      "Porcelain stoneware does not absorb water and copes with low temperatures, hail, snow and ice. An outdoor floor is laid " +
      "with a slope for rainwater and with elastic joints.",
    sources: ["gardenia-outdoor-everything"],
  },
  {
    topic: "laying",
    says:
      "Every 20 mm Plein Air tile can be laid five ways: glued (\"ideal for floorings that will be driven over by vehicles\"), dry " +
      "on grass (paths that blend in), dry on gravel (drains rainwater), dry on sand (beaches and beach bars), and raised on " +
      "pedestals 25 to 270 mm high (no screed, open joints drain rain, the cavity houses pipes). Gardenia's blog names four of them " +
      "for Native.",
    sources: ["abk-plein-air-catalogue", "gardenia-outdoor-collections"],
  },
  {
    topic: "spaces",
    says:
      "The range is \"a system designed for any external space\": driveways and parking areas, Japanese stepping stones and lawn " +
      "walkways, courtyards and outdoor living areas, terraces with a raised laying system, street furniture and planters, pool " +
      "areas and steps; and, as anti-slip surfaces for wellness, outdoor pools, external showers and indoor and outdoor pool " +
      "walkways.",
    sources: ["abk-plein-air-catalogue"],
  },
  {
    topic: "special_pieces",
    says:
      "Most colours have special pieces in the same surface: pool-side grilles and corner grilles, bullnoses, L elements and step " +
      "edges for steps and platforms, and curves. PLEIN_AIR_SPECIAL_PIECES lists them by colour, with ABK's item codes.",
    sources: ["abk-plein-air-catalogue"],
  },
  {
    topic: "weight_and_packing",
    says:
      "A 20 mm tile weighs 45.3 kg/m². Boxes hold 0.72 m² (60x60: 2 tiles, 60x120: 1, 30x120: 2), 0.54 m² (60x90: 1) or 0.64 m² " +
      "(80x80: 1); real sizes are a few millimetres under the nominal ones (60x120 is 596x1194 mm).",
    sources: ["abk-plein-air-datasheet"],
  },
  {
    topic: "colour",
    says:
      "Neutral colours (sand, brick, burnished) sit well in the natural surroundings; white near a pool brings out the blue of the " +
      "water; very bright or artificial colours are best avoided outdoors. Stone or stone-effect tiles suit a garden.",
    sources: ["gardenia-outdoor-choosing"],
  },
  {
    topic: "size",
    says: "A small outdoor area looks wider with large formats; a large one can combine large and smaller sizes.",
    sources: ["gardenia-outdoor-choosing"],
  },
  {
    topic: "indoor_outdoor_continuity",
    says:
      "The outdoor floor should suit the whole house. Some of ABK's Plein Air photos show an indoor tile too: the same colour " +
      "(Anima Grigio, La Geoteca Bourgogne Beige), the collection's other colour (Dorica), or another collection (Hermione Miel " +
      "with Gioia Palma, Tabulae Genuine Havana with Orosei Cream). See SURFACE_OUTDOOR_PAIRINGS.",
    sources: ["gardenia-outdoor-choosing", "abk-plein-air"],
  },
];

/**
 * ABK's Rooms filter, with the room this catalogue's vocabulary uses for each (balcony is its only outdoor room). The filter
 * lists the tiles in ABK's photos of that room, so "outdoor" also lists indoor tiles seen next to the Plein Air one (Dorica Crema
 * Antique 3D, La Geoteca Bourgogne Beige 120x280): a tile's thickness and finish, not this filter, say whether it goes outside.
 */
export const ABK_ROOM_FILTER_TO_SURFACE_ROOM: Readonly<Record<string, string>> = {
  bathroom: "bathroom",
  bedroom: "bedroom",
  "commercial-spaces": "commercial",
  "hotel-spa": "hospitality",
  kitchen: "kitchen",
  livingroom: "living_room",
  outdoor: "balcony",
  restaurants: "hospitality",
};

export type SurfaceOutdoorPairingItem = {
  collection: string;
  colour: string;
  finish: string;
  size: string;
  thickness_mm: number;
  /** The catalogue's card for the colour, as the Surfaces browser names it (the configurator's names, where they differ). */
  card: string;
};

/** ABK's Plein Air photos whose captions name an outdoor tile and an indoor one ("Products in this image"). */
export const SURFACE_OUTDOOR_PAIRINGS: readonly {
  outdoor: SurfaceOutdoorPairingItem;
  indoor: readonly SurfaceOutdoorPairingItem[];
}[] = [
  {
    outdoor: { collection: "Dorica", colour: "Avorio", finish: "R11", size: "60x120", thickness_mm: 20, card: "Dorica Avorio" },
    indoor: [
      { collection: "Dorica", colour: "Crema", finish: "Antique 3D", size: "60x120", thickness_mm: 8.5, card: "Dorica Crema" },
    ],
  },
  {
    outdoor: {
      collection: "La Geoteca",
      colour: "Bourgogne Beige",
      finish: "R11",
      size: "80x80",
      thickness_mm: 20,
      card: "La Geoteca Bourgogne Beige",
    },
    indoor: [
      {
        collection: "La Geoteca",
        colour: "Bourgogne Beige",
        finish: "Nat P.tech",
        size: "120x280",
        thickness_mm: 6,
        card: "La Geoteca Bourgogne Beige",
      },
      {
        collection: "La Geoteca",
        colour: "Bourgogne Beige",
        finish: "Nat P.tech",
        size: "120x120",
        thickness_mm: 6,
        card: "La Geoteca Bourgogne Beige",
      },
    ],
  },
  {
    outdoor: { collection: "Anima", colour: "Grigio", finish: "R11", size: "60x120", thickness_mm: 20, card: "Anima Grigio" },
    indoor: [
      { collection: "Anima", colour: "Grigio", finish: "Nat P.tech", size: "60x120", thickness_mm: 8.5, card: "Anima Grigio" },
    ],
  },
  {
    outdoor: { collection: "Hermione", colour: "Miel", finish: "R11", size: "30x120", thickness_mm: 20, card: "Hermione Miel" },
    indoor: [{ collection: "Gioia", colour: "Palma", finish: "Natural", size: "60x120", thickness_mm: 8.5, card: "Gioia Palma" }],
  },
  {
    outdoor: {
      collection: "Tabulae",
      colour: "Genuine Havana",
      finish: "R11",
      size: "30x120",
      thickness_mm: 20,
      card: "Tabulae Genuine Hav",
    },
    indoor: [{ collection: "Orosei", colour: "Cream", finish: "Natural", size: "120x280", thickness_mm: 6, card: "Orosei Cream" }],
  },
];
