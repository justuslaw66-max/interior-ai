import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  SURFACE_PHYSICAL_SIZE_TOLERANCE,
  getSurfacePhysicalAssetFailures,
  getSurfacePhysicalImageSources,
  getSurfacePhysicalSourceKey,
  pickSurfaceFaceIndex,
  resolveSurfacePhysicalTileSample,
} from "../lib/surface-material-physical-sampling";
import {
  SURFACE_MATERIAL_RENDER_REGISTRY,
  decodeSurfaceMaterialRenderTuple,
  getRuntimeSurfaceMaterialById,
} from "../lib/surface-material-runtime";
import {
  compactSurfaceTextureFaces,
  expandSurfaceTextureFaces,
} from "../lib/surface-texture-face-run";
import { PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES } from "../lib/generated/surface-material-render.generated";
import {
  buildSurfaceMaterialProductGroups,
  getSurfaceMaterialGroupSizeLabels,
  getSurfaceMaterialProductDisplayName,
  getSurfaceMaterialSizeOptionLabel,
} from "../components/editor/design-controls-plan/surfaceCatalog";
import { getAllSurfaceMaterialYamlEntries } from "../lib/surface-material-yaml";
import { collectNoOwnPictures } from "../lib/surface-material-picture-source";
import type { SurfaceMaterial } from "../lib/surface-material-schema";
import type { SurfaceMaterialRenderTuple } from "../lib/surface-material-runtime-types";
import { findGardeniaEntriesAWriteRunWouldLose } from "./gardenia-import-guard";

function assertClose(actual: number, expected: number, message: string, tolerance = 0.000001): void {
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: expected ${expected}, got ${actual}`);
}

// A 1200 x 2400 mm slab picture, the pixel size of a real supplier face.
const slab = { sourceWidthPx: 1134, sourceHeightPx: 2229, sourceWidthMm: 1200, sourceHeightMm: 2400 };
const slabMmPerPx = { x: 1200 / 1134, y: 2400 / 2229 };

const wholeSlab = resolveSurfacePhysicalTileSample({ ...slab, tileWidthMm: 1200, tileHeightMm: 2400, seed: 7 });
assert.equal(wholeSlab.mode, "whole_face", "a tile the size of the picture shows the whole picture");
assert.deepEqual(wholeSlab.rect, { x: 0, y: 0, width: 1134, height: 2229 });
assert.equal(wholeSlab.quarterTurn, false);

// Every smaller format cut from the same picture keeps the picture's millimetres per pixel.
const cutFormats = [
  { tileWidthMm: 1200, tileHeightMm: 1200 },
  { tileWidthMm: 600, tileHeightMm: 1200 },
  { tileWidthMm: 600, tileHeightMm: 600 },
  { tileWidthMm: 300, tileHeightMm: 600 },
];
for (const format of cutFormats) {
  for (const seed of [1, 2, 3, 101, 313, 9001]) {
    const sample = resolveSurfacePhysicalTileSample({ ...slab, ...format, seed });
    const label = `${format.tileWidthMm}x${format.tileHeightMm} seed ${seed}`;
    assert.equal(sample.mode, "window", `${label} is cut from the larger picture`);
    assertClose(sample.needWidthMm / sample.rect.width, slabMmPerPx.x, `${label} keeps mm per pixel across`);
    assertClose(sample.needHeightMm / sample.rect.height, slabMmPerPx.y, `${label} keeps mm per pixel along`);
    assert.ok(sample.rect.x >= 0 && sample.rect.x + sample.rect.width <= slab.sourceWidthPx + 1e-9, `${label} stays inside`);
    assert.ok(sample.rect.y >= 0 && sample.rect.y + sample.rect.height <= slab.sourceHeightPx + 1e-9, `${label} stays inside`);
  }
}

// A tile laid landscape turns the picture so its long side follows the tile's long side.
const landscape = resolveSurfacePhysicalTileSample({ ...slab, tileWidthMm: 1200, tileHeightMm: 600, seed: 3 });
assert.equal(landscape.quarterTurn, true, "landscape tile from a portrait picture is turned a quarter turn");
assert.equal(landscape.mode, "window");
assertClose(landscape.needWidthMm / landscape.rect.width, slabMmPerPx.x, "turned tile keeps mm per pixel");
const landscapeFace = resolveSurfacePhysicalTileSample({
  sourceWidthPx: 354,
  sourceHeightPx: 718,
  sourceWidthMm: 600,
  sourceHeightMm: 1200,
  tileWidthMm: 1200,
  tileHeightMm: 600,
  seed: 3,
});
assert.equal(landscapeFace.mode, "whole_face", "a face turned to match the tile is still a whole face");
assert.equal(landscapeFace.quarterTurn, true);
assert.equal(
  resolveSurfacePhysicalTileSample({ ...slab, tileWidthMm: 1200, tileHeightMm: 600, seed: 3, allowQuarterTurn: false })
    .quarterTurn,
  false
);

// Supplier pictures are a few percent off the nominal proportion; that is still the whole face.
const offProportion = resolveSurfacePhysicalTileSample({
  sourceWidthPx: 354,
  sourceHeightPx: 718,
  sourceWidthMm: 600 * (1 + SURFACE_PHYSICAL_SIZE_TOLERANCE * 0.9),
  sourceHeightMm: 1200,
  tileWidthMm: 600,
  tileHeightMm: 1200,
  seed: 1,
});
assert.equal(offProportion.mode, "whole_face");

// A picture smaller than the tile is reported, never silently stretched.
const undersized = resolveSurfacePhysicalTileSample({
  sourceWidthPx: 300,
  sourceHeightPx: 300,
  sourceWidthMm: 600,
  sourceHeightMm: 600,
  tileWidthMm: 1200,
  tileHeightMm: 1200,
  seed: 1,
});
assert.equal(undersized.mode, "undersized");
assert.deepEqual(undersized.pxPerMm, { x: 0.5, y: 0.5 }, "the picture's own scale is kept for the fallback fill");

// Faces: neighbours never repeat, and the choice is deterministic. Neighbours are
// listed most important first (left, above, then the two diagonals above).
const NEIGHBOUR_OFFSETS = [[0, -1], [-1, 0], [-1, 1], [-1, -1]];
function layFaces(faceCount: number): Map<string, number> {
  const laid = new Map<string, number>();
  for (let row = 0; row < 14; row += 1) {
    for (let col = 0; col < 14; col += 1) {
      const neighbourFaceIndexes = NEIGHBOUR_OFFSETS
        .map(([rowOffset, colOffset]) => laid.get(`${row + rowOffset}:${col + colOffset}`))
        .filter((value): value is number => value !== undefined);
      const seed = 42 + row * 101 + col * 313;
      const faceIndex = pickSurfaceFaceIndex({ seed, faceCount, neighbourFaceIndexes });
      assert.ok(faceIndex >= 0 && faceIndex < faceCount);
      assert.equal(faceIndex, pickSurfaceFaceIndex({ seed, faceCount, neighbourFaceIndexes }));
      laid.set(`${row}:${col}`, faceIndex);
    }
  }
  return laid;
}
function assertNoRepeat(laid: Map<string, number>, offsets: number[][], label: string): void {
  for (const [key, faceIndex] of laid) {
    const [row, col] = key.split(":").map(Number);
    for (const [rowOffset, colOffset] of offsets) {
      assert.notEqual(
        laid.get(`${row + rowOffset}:${col + colOffset}`),
        faceIndex,
        `${label}: tile ${key} repeats the face at offset ${rowOffset},${colOffset}`
      );
    }
  }
}
const sixFaces = layFaces(6);
assertNoRepeat(sixFaces, NEIGHBOUR_OFFSETS, "six faces");
assert.equal(new Set(sixFaces.values()).size, 6, "every face is used");
// Four faces cannot always avoid four neighbours, but never repeat across a shared edge.
assertNoRepeat(layFaces(4), NEIGHBOUR_OFFSETS.slice(0, 2), "four faces");
assertNoRepeat(layFaces(3), NEIGHBOUR_OFFSETS.slice(0, 2), "three faces");
assert.equal(pickSurfaceFaceIndex({ seed: 5, faceCount: 1, neighbourFaceIndexes: [0] }), 0);

// Sources: faces win, then a base image with a declared size, otherwise nothing (legacy rendering).
const faces = [
  { url: "/assets/a_01.webp", width_mm: 600, height_mm: 1200 },
  { url: "/assets/a_02.webp", width_mm: 600, height_mm: 1200 },
];
assert.deepEqual(
  getSurfacePhysicalImageSources({
    base_color_url: "/assets/base.webp",
    swatch_url: null,
    image_physical_size_mm: { width: 1200, height: 2400 },
    faces,
  }).map((source) => source.url),
  ["/assets/a_01.webp", "/assets/a_02.webp"]
);
assert.deepEqual(
  getSurfacePhysicalImageSources({
    base_color_url: "/assets/base.webp",
    swatch_url: null,
    image_physical_size_mm: { width: 1200, height: 2400 },
  }),
  [{ url: "/assets/base.webp", widthMm: 1200, heightMm: 2400 }]
);
assert.deepEqual(getSurfacePhysicalImageSources({ base_color_url: "/assets/base.webp", swatch_url: null }), []);
assert.equal(getSurfacePhysicalSourceKey(null), "");

// Only materials that declare physical-scale data use the new sampling; the rest render as before.
const physicalMaterials = SURFACE_MATERIAL_RENDER_REGISTRY.filter(
  (material) => getSurfacePhysicalImageSources(material.texture_assets).length > 0
);
// Plein Air's outdoor sizes of catalogued collections (13 Oct 2026) join their colours' cards as R11 sizes. The collection blocks
// below check each collection as it was imported; the outdoor entries have a block of their own, after Eterea's.
const pleinAirOutdoorIds = new Set(
  getAllSurfaceMaterialYamlEntries()
    .filter((entry) => entry.import_governance.qa_flags.includes("gardenia_plein_air_outdoor_size"))
    .map((entry) => entry.surface_material.material_id)
);
const isPleinAirOutdoor = (material: { surface_material: { material_id: string } }) =>
  pleinAirOutdoorIds.has(material.surface_material.material_id);
const isAnima = (material: { surface_material: { material_id: string } }) =>
  /^gardenia-(flooring|wall-tile)-anima-/.test(material.surface_material.material_id) && !isPleinAirOutdoor(material);
const isGardeniaCollection = (collection: string) => (material: { surface_material: { material_id: string } }) =>
  new RegExp(`^gardenia-(flooring|wall-tile)-${collection}-`).test(material.surface_material.material_id) &&
  !isPleinAirOutdoor(material);
const isDorica = isGardeniaCollection("dorica");
const isOxide = isGardeniaCollection("oxide");
const isFalaise = isGardeniaCollection("falaise");
const isMake = isGardeniaCollection("make");
const isTabulae = isGardeniaCollection("tabulae");
const isBonTon = isGardeniaCollection("bon-ton");
const isPietraViva = isGardeniaCollection("pietra-viva");
const isLaGeoteca = isGardeniaCollection("la-geoteca");
const isOrosei = isGardeniaCollection("orosei");
const isGioia = isGardeniaCollection("gioia");
const isIPigmenti = isGardeniaCollection("i-pigmenti");
const isLaMarmoteca = isGardeniaCollection("la-marmoteca");
const isHermione = isGardeniaCollection("hermione");
const isConcreaPlain = isGardeniaCollection("concrea-plain");
const isJustNature = isGardeniaCollection("just-nature");
const isLuce = isGardeniaCollection("luce");
const isStorm = isGardeniaCollection("storm");
const isEpoque = isGardeniaCollection("epoque-20");
const isCamouflage = isGardeniaCollection("camouflage");
const isBlock = isGardeniaCollection("block");
const isEterea = isGardeniaCollection("eterea");
const isPleinAir = isGardeniaCollection("plein-air");
const onAbkFaces = [
  isAnima, isDorica, isOxide, isFalaise, isMake, isTabulae, isBonTon, isPietraViva, isLaGeoteca, isOrosei, isGioia, isIPigmenti,
  isLaMarmoteca, isHermione, isConcreaPlain, isJustNature, isLuce, isStorm, isEpoque, isCamouflage, isBlock, isEterea,
  isPleinAirOutdoor, isPleinAir,
];
assert.ok(
  physicalMaterials.every(
    (material) => material.surface_material.supplier === "florim" || onAbkFaces.some((filter) => filter(material))
  ),
  "only the Florim materials and Gardenia Anima, Dorica, Oxide, Falaise, Make, Tabulae, Bon Ton, Pietra Viva, La Geoteca, " +
    "Orosei, Gioia, I Pigmenti, La Marmoteca, Hermione, Concrea Plain, Just Nature, Luce, Storm, Epoque 2.0, Camouflage, Block, Eterea " +
    "(with Plein Air's outdoor sizes of them) and Plein Air declare physical-scale data"
);
assert.equal(
  physicalMaterials.filter(isAnima).length,
  SURFACE_MATERIAL_RENDER_REGISTRY.filter(isAnima).length,
  "every Anima entry is on real faces"
);
assert.equal(physicalMaterials.filter(isAnima).length, 38, "Anima: six colours, 19 floor and 19 wall entries");
for (const material of physicalMaterials) {
  const id = material.surface_material.material_id;
  const sources = getSurfacePhysicalImageSources(material.texture_assets);
  const tileWidthMm = material.physical_specs.tile_width_mm as number;
  const tileHeightMm = material.physical_specs.tile_length_mm as number;
  // ABK supplies three faces for some sizes (Oxide's 120x280 slabs, a few Make sizes once repeats
  // are dropped) and two for most Pietra Viva and La Geoteca 120x280 slabs and Concrea Plain's and Luce's; Bon Ton's decors (Network,
  // Octagon, Tricot), La Geoteca's Plissè decors, every Gioia colour, and I Pigmenti's 120x280 slabs and
  // decors (Crocini, Pillole, Rattan), and Block's and Eterea's Righe decors have a single face; Camouflage's 120x280 slabs, and Plein
  // Air's Raye planks and Warehouse Tan, have two.
  const singleFace = /-bon-ton-(network|octagon|tricot)-|-la-geoteca-dec-|-gioia-|-i-pigmenti-(crocini|pillole|rattan|.+-120x280)-|-(block|eterea)-righe-/;
  const minimumFaces = singleFace.test(id)
    ? 1
    : /-(pietra-viva|la-geoteca|concrea-plain|luce|camouflage)-.+-120x280-|-plein-air-(raye|warehouse-tan)-/.test(id)
      ? 2
      : 3;
  assert.ok(sources.length >= minimumFaces, `${id} has at least ${minimumFaces} faces`);
  for (const source of sources) {
    // Pixel size does not matter here: the mode depends only on millimetres.
    const sample = resolveSurfacePhysicalTileSample({
      sourceWidthPx: source.widthMm,
      sourceHeightPx: source.heightMm,
      sourceWidthMm: source.widthMm,
      sourceHeightMm: source.heightMm,
      tileWidthMm,
      tileHeightMm,
      seed: 1,
    });
    assert.notEqual(sample.mode, "undersized", `${id} pictures must cover the tile`);
    assertClose(sample.needWidthMm / sample.rect.width, 1, `${id} is drawn at the picture's scale`);
  }
}
const cutFromSlab = physicalMaterials.find((material) => material.surface_material.material_id.includes("757828"));
assert.ok(cutFromSlab, "the 60x120 cut from 120x240 pictures is in the catalogue");
assert.deepEqual(cutFromSlab.texture_assets.image_physical_size_mm, { width: 1200, height: 2400 });
assert.equal(cutFromSlab.physical_specs.tile_width_mm, 600);

// The browser shows one card per product, with its sizes inside: the product
// name must end in the size and finish so the sizes group together.
const florimFloorGroups = buildSurfaceMaterialProductGroups(
  physicalMaterials.filter(
    (material) =>
      material.surface_material.supplier === "florim" && material.surface_material.surface_category === "flooring"
  ) as never
);
assert.deepEqual(
  florimFloorGroups.map((group) => [
    getSurfaceMaterialProductDisplayName(group.primary),
    getSurfaceMaterialGroupSizeLabels(group),
  ]),
  [
    ["Ardoise Blanc 6mm", ["120x240 Matt", "120x120 Matt", "60x120 Matt"]],
    ["Ardoise Blanc 9mm", ["60x120 Matt", "80x80 Grip", "80x80 Matt", "40x80 Grip", "40x80 Matt"]],
  ]
);

// Gardenia Anima is on real faces: one card per colour with its sizes, and each size has its own
// whole-tile pictures instead of one 60x60 preview stretched over all of them.
for (const category of ["flooring", "wall_tile"]) {
  const animaGroups = buildSurfaceMaterialProductGroups(
    physicalMaterials.filter(
      (material) => isAnima(material) && material.surface_material.surface_category === category
    ) as never
  );
  assert.deepEqual(
    animaGroups.map((group) => [
      getSurfaceMaterialProductDisplayName(group.primary),
      getSurfaceMaterialGroupSizeLabels(group),
    ]),
    [
      ["Anima Beige", ["120x120", "60x120", "80x80", "60x60"]],
      ["Anima Fango", ["60x120", "60x60"]],
      ["Anima Fumo", ["120x120", "60x120", "80x80", "60x60"]],
      ["Anima Ghiaia Beige", ["60x120", "60x60"]],
      ["Anima Ghiaia Grigio", ["60x120", "60x60"]],
      ["Anima Grigio", ["120x280 Nat", "120x120", "60x120", "80x80", "60x60"]],
    ],
    `Anima ${category} cards`
  );
}
const animaFloor = physicalMaterials.filter(
  (material) => isAnima(material) && material.surface_material.surface_category === "flooring"
);
const animaColour = (material: { surface_material: { material_id: string } }) =>
  /-anima-([a-z-]+?)-\d{7}-/.exec(material.surface_material.material_id)?.[1] ?? "?";
const faceRows = (materials: typeof animaFloor) =>
  materials
    .map((material) => [
      animaColour(material),
      `${material.physical_specs.tile_width_mm}x${material.physical_specs.tile_length_mm}`,
      material.texture_assets.faces?.length,
      `${material.texture_assets.faces?.[0]?.width_mm}x${material.texture_assets.faces?.[0]?.height_mm}`,
    ])
    .sort();
const fourSizes = (colour: string) => [
  [colour, "1200x1200", 7, "1200x1200"],
  [colour, "1200x600", 14, "600x1200"],
  [colour, "600x600", 14, "600x600"],
  [colour, "800x800", 7, "800x800"],
];
assert.deepEqual(
  faceRows(animaFloor),
  [
    ...fourSizes("beige"),
    ["fango", "1200x600", 14, "600x1200"],
    ["fango", "600x600", 14, "600x600"],
    ...fourSizes("fumo"),
    ["ghiaia-beige", "1200x600", 4, "600x1200"],
    ["ghiaia-beige", "600x600", 8, "600x600"],
    ["ghiaia-grigio", "1200x600", 4, "600x1200"],
    ["ghiaia-grigio", "600x600", 8, "600x600"],
    ...fourSizes("grigio").slice(0, 2),
    ["grigio", "2800x1200", 4, "1200x2800"],
    ...fourSizes("grigio").slice(2),
  ].sort()
);
assert.equal(
  new Set(animaFloor.map((material) => material.texture_assets.base_color_url)).size,
  animaFloor.length,
  "no two Anima floor entries share a picture"
);
// The wall entries use the same faces as the floor entry of the same item, and the two
// wall-only codes (0007195, 0007196) are the same tiles as 0006049 and 0006050.
const animaById = new Map(
  physicalMaterials.filter(isAnima).map((material) => [material.surface_material.material_id, material])
);
const faceUrls = (id: string) => animaById.get(id)?.texture_assets.faces?.map((face) => face.url);
for (const material of animaById.values()) {
  const id = material.surface_material.material_id;
  if (material.surface_material.surface_category !== "wall_tile") continue;
  const floorId = id
    .replace("-wall-tile-", "-flooring-")
    .replace("-0007195-60x120-196229-", "-0006049-60x120-196218-")
    .replace("-0007196-60x120-196230-", "-0006050-60x120-196219-");
  assert.ok(faceUrls(floorId), `${id} has a floor counterpart ${floorId}`);
  assert.deepEqual(faceUrls(id), faceUrls(floorId), `${id} uses the floor entry's faces`);
}

// Gardenia Dorica and Oxide are on real faces too (downloaded 6 Oct 2026). Some entries use another
// item's pictures, found by image matching (see the colour manifests):
//  - Dorica 20x120 planks use the 120x120 faces turned a quarter (veins along the plank), stored as
//    0010518_nn / 0010519_nn: ABK's plank pictures are that graphic at 0.75 scale;
//  - Dorica 0010147 / 0010148 use 0010008's / 0010009's faces (the same visible variant as R11);
//  - Oxide Iron 80x80 uses the 120x120 faces: its 80x80 pictures are the 120x120 pictures.
// Oxide Aluminum's and Brass's 80x80 pictures are their 120x120 graphic squeezed to 800 mm and are
// declared 1200x1200 mm (re-checked 8 Oct 2026; 6 Oct had found three of Aluminum's).
const collectionCards = (filter: (material: { surface_material: { material_id: string } }) => boolean, category: string) =>
  buildSurfaceMaterialProductGroups(
    physicalMaterials.filter((material) => filter(material) && material.surface_material.surface_category === category) as never
  ).map((group) => [getSurfaceMaterialProductDisplayName(group.primary), getSurfaceMaterialGroupSizeLabels(group)]);
for (const [filter, label, count] of [[isDorica, "Dorica", 24], [isOxide, "Oxide", 38]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, count, `every ${label} entry is on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
const doricaSizes = ["120x280 Nat", "120x120 Nat", "60x120 Nat", "20x120 Nat"];
assert.deepEqual(collectionCards(isDorica, "flooring"), [
  ["Dorica Avorio", ["120x280 Nat", "120x120 Nat", "60x120", "60x120 Nat", "20x120 Nat"]],
  ["Dorica Crema", ["120x280 Nat", "120x120 Nat", "60x120", "60x120 Nat", "20x120 Nat"]],
  ["Dorica Degrade'", ["60x120"]],
  ["Dorica Greige", ["120x120 Nat", "60x120 Nat"]],
]);
assert.deepEqual(collectionCards(isDorica, "wall_tile"), [
  ["Dorica Avorio", doricaSizes],
  ["Dorica Crema", doricaSizes],
  ["Dorica Degrade'", ["60x120"]],
  ["Dorica Greige", ["120x120 Nat", "60x120 Nat"]],
]);
const oxideSizes = ["120x280", "120x120", "60x120", "80x80"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(collectionCards(isOxide, category), [
    ["Oxide Alluminum", oxideSizes],
    ["Oxide Brass", oxideSizes],
    ["Oxide Green", oxideSizes],
    ["Oxide Iron", oxideSizes],
    ["Oxide Steel", ["120x120", "60x120", "80x80"]],
  ]);
}
const collectionFaceRows = (filter: (material: { surface_material: { material_id: string } }) => boolean) =>
  physicalMaterials
    .filter((material) => filter(material) && material.surface_material.surface_category === "flooring")
    .map((material) => [
      /-(?:dorica|oxide|falaise|make|tabulae|bon-ton|pietra-viva|la-geoteca|orosei|gioia|i-pigmenti|la-marmoteca|hermione|concrea-plain|just-nature|luce|storm|epoque-20|camouflage|block|eterea|plein-air)-([a-z-]+?)-(?:g\d|pf|\d)/.exec(
        material.surface_material.material_id
      )?.[1],
      `${material.physical_specs.tile_width_mm}x${material.physical_specs.tile_length_mm}`,
      material.texture_assets.faces?.length,
      [...new Set(material.texture_assets.faces?.map((face) => `${face.width_mm}x${face.height_mm}`))].join("+"),
      material.texture_assets.base_color_url?.split("/").pop(),
    ])
    .sort();
assert.deepEqual(collectionFaceRows(isDorica), [
  ["avorio", "1200x1200", 8, "1200x1200", "0010005_01.webp"],
  ["avorio", "1200x200", 8, "1200x1200", "0010518_01.webp"],
  ["avorio", "1200x600", 16, "600x1200", "0010008_01.webp"],
  ["avorio", "1200x600", 16, "600x1200", "0010008_01.webp"],
  ["avorio", "2800x1200", 4, "1200x2800", "0009999_01.webp"],
  ["crema", "1200x1200", 8, "1200x1200", "0010006_01.webp"],
  ["crema", "1200x200", 8, "1200x1200", "0010519_01.webp"],
  ["crema", "1200x600", 16, "600x1200", "0010009_01.webp"],
  ["crema", "1200x600", 16, "600x1200", "0010009_01.webp"],
  ["crema", "2800x1200", 4, "1200x2800", "0010000_01.webp"],
  ["degrade", "1200x600", 4, "600x1200", "0010087_01.webp"],
  ["greige", "1200x1200", 8, "1200x1200", "0010004_01.webp"],
  ["greige", "1200x600", 16, "600x1200", "0010007_01.webp"],
]);
assert.deepEqual(collectionFaceRows(isOxide), [
  ["alluminum", "1200x1200", 7, "1200x1200", "g69310_01.webp"],
  ["alluminum", "1200x600", 14, "600x1200", "g69320_01.webp"],
  ["alluminum", "2800x1200", 3, "1200x2800", "g69300_01.webp"],
  ["alluminum", "800x800", 6, "1200x1200", "g69330_01.webp"],
  ["brass", "1200x1200", 6, "1200x1200", "g69314_01.webp"],
  ["brass", "1200x600", 10, "600x1200", "g69324_01.webp"],
  ["brass", "2800x1200", 3, "1200x2800", "g69304_01.webp"],
  ["brass", "800x800", 7, "1200x1200", "g69334_01.webp"],
  ["green", "1200x1200", 6, "1200x1200", "g69313_01.webp"],
  ["green", "1200x600", 12, "600x1200", "g69323_01.webp"],
  ["green", "2800x1200", 3, "1200x2800", "g69303_01.webp"],
  ["green", "800x800", 14, "800x800", "g69333_01.webp"],
  ["iron", "1200x1200", 6, "1200x1200", "g69312_01.webp"],
  ["iron", "1200x600", 7, "600x1200", "g69322_01.webp"],
  ["iron", "2800x1200", 3, "1200x2800", "g69302_01.webp"],
  ["iron", "800x800", 6, "1200x1200", "g69312_01.webp"],
  ["steel", "1200x1200", 5, "1200x1200", "g69311_01.webp"],
  ["steel", "1200x600", 10, "600x1200", "g69321_01.webp"],
  ["steel", "800x800", 14, "800x800", "g69331_01.webp"],
]);
// Gardenia Falaise and Make (downloaded 8 Oct 2026). Falaise's R11 items show byte-identical copies
// of the Natural item's pictures (some on ABK's Plein Air pages), so they use the Natural item's faces.
// Make's 80x80 pictures are a 1000x1000 mm graphic squeezed to 800 mm (image matching against the
// colour's other sizes) and are declared 1000x1000 mm; the renderer cuts true-scale 800x800 windows.
// Make's T36 mosaics have no pictures in the download area and keep their previews.
for (const [filter, label, faced, count] of [[isFalaise, "Falaise", 44, 44], [isMake, "Make", 48, 60]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, faced, `${label} entries on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
assert.ok(
  SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => isMake(material) && !physicalMaterials.includes(material)).every(
    (material) => material.surface_material.material_id.includes("-mos-t36-")
  ),
  "only Make's mosaics keep their previews"
);
assert.deepEqual(collectionCards(isFalaise, "flooring"), [
  ["Falaise Beige", ["120x120 Nat", "60x120", "60x120 Nat", "80x80 Nat", "60x60", "60x60 Nat"]],
  ["Falaise Grey", ["120x120 Nat", "60x120 Nat", "80x80 Nat", "60x60 Nat"]],
  ["Falaise Mint", ["120x120 Nat", "60x120", "60x120 Nat", "80x80 Nat", "60x60", "60x60 Nat"]],
  ["Falaise White", ["120x280 Nat", "120x120", "120x120 Nat", "60x120", "60x120 Nat", "80x80 Nat", "60x60 Nat"]],
]);
const falaiseNat = ["120x120 Nat", "60x120 Nat", "80x80 Nat", "60x60 Nat"];
assert.deepEqual(collectionCards(isFalaise, "wall_tile"), [
  ["Falaise Art Beige", ["60x120"]],
  ["Falaise Art Grey", ["60x120"]],
  ["Falaise Beige", falaiseNat],
  ["Falaise Grey", falaiseNat],
  ["Falaise Mint", falaiseNat],
  ["Falaise White", ["120x280 Nat", "120x120", "120x120 Nat", "60x120", "60x120 Nat", "80x80 Nat", "60x60 Nat"]],
]);
const makeColours = ["Antr Corten", "Ash", "Bianco", "Corda", "Grigio Corten", "Nero Corten"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(
    collectionCards(isMake, category),
    makeColours.map((colour) => [`Make ${colour}`, ["100x100", "60x120", "80x80", "60x60"]])
  );
}
assert.deepEqual(collectionFaceRows(isFalaise), [
  ["beige", "1200x1200", 9, "1200x1200", "0017197_01.webp"],
  ["beige", "1200x600", 18, "600x1200", "0017200_01.webp"],
  ["beige", "1200x600", 18, "600x1200", "0017200_01.webp"],
  ["beige", "600x600", 34, "600x600", "0017526_01.webp"],
  ["beige", "600x600", 34, "600x600", "0017526_01.webp"],
  ["beige", "800x800", 9, "800x800", "0017203_01.webp"],
  ["grey", "1200x1200", 9, "1200x1200", "0017198_01.webp"],
  ["grey", "1200x600", 18, "600x1200", "0017201_01.webp"],
  ["grey", "600x600", 36, "600x600", "0017527_01.webp"],
  ["grey", "800x800", 9, "800x800", "0017204_01.webp"],
  ["mint", "1200x1200", 9, "1200x1200", "0017754_01.webp"],
  ["mint", "1200x600", 18, "600x1200", "0017755_01.webp"],
  ["mint", "1200x600", 18, "600x1200", "0017755_01.webp"],
  ["mint", "600x600", 36, "600x600", "0017756_01.webp"],
  ["mint", "600x600", 36, "600x600", "0017756_01.webp"],
  ["mint", "800x800", 9, "800x800", "0017758_01.webp"],
  ["white", "1200x1200", 9, "1200x1200", "0017196_01.webp"],
  ["white", "1200x1200", 9, "1200x1200", "0017196_01.webp"],
  ["white", "1200x600", 18, "600x1200", "0017199_01.webp"],
  ["white", "1200x600", 18, "600x1200", "0017199_01.webp"],
  ["white", "2800x1200", 3, "1200x2800", "0017338_01.webp"],
  ["white", "600x600", 36, "600x600", "0017525_01.webp"],
  ["white", "800x800", 9, "800x800", "0017202_01.webp"],
]);
assert.deepEqual(collectionFaceRows(isMake), [
  ["antr-corten", "1000x1000", 4, "1000x1000", "g73044_01.webp"],
  ["antr-corten", "1200x600", 4, "600x1200", "g73224_01.webp"],
  ["antr-corten", "600x600", 4, "600x600", "g73214_01.webp"],
  ["antr-corten", "800x800", 4, "1000x1000", "g73024_01.webp"],
  ["ash", "1000x1000", 4, "1000x1000", "g73042_01.webp"],
  ["ash", "1200x600", 4, "600x1200", "g73222_01.webp"],
  ["ash", "600x600", 4, "600x600", "g73212_01.webp"],
  ["ash", "800x800", 4, "1000x1000", "g73022_01.webp"],
  ["bianco", "1000x1000", 3, "1000x1000", "g73040_01.webp"],
  ["bianco", "1200x600", 4, "600x1200", "g73220_01.webp"],
  ["bianco", "600x600", 4, "600x600", "g73210_01.webp"],
  ["bianco", "800x800", 4, "1000x1000", "g73020_01.webp"],
  ["corda", "1000x1000", 4, "1000x1000", "g73041_01.webp"],
  ["corda", "1200x600", 3, "600x1200", "g73221_01.webp"],
  ["corda", "600x600", 3, "600x600", "g73211_01.webp"],
  ["corda", "800x800", 4, "1000x1000", "g73021_01.webp"],
  ["grigio-corten", "1000x1000", 4, "1000x1000", "g73045_01.webp"],
  ["grigio-corten", "1200x600", 3, "600x1200", "g73225_01.webp"],
  ["grigio-corten", "600x600", 4, "600x600", "g73215_01.webp"],
  ["grigio-corten", "800x800", 4, "1000x1000", "g73025_01.webp"],
  ["nero-corten", "1000x1000", 4, "1000x1000", "g73043_01.webp"],
  ["nero-corten", "1200x600", 4, "600x1200", "g73223_01.webp"],
  ["nero-corten", "600x600", 4, "600x600", "g73213_01.webp"],
  ["nero-corten", "800x800", 4, "1000x1000", "g73023_01.webp"],
]);
const makeSqueezed = physicalMaterials
  .filter((material) => isMake(material) && material.surface_material.surface_category === "flooring")
  .flatMap((material) => material.texture_assets.faces ?? [])
  .filter((face) => /\/g7302\d_/.test(face.url) && face.width_mm === 1000);
assert.equal(makeSqueezed.length, 24, "all 24 of Make's 80x80 pictures are declared 1000x1000 mm");

// Gardenia Tabulae and Bon Ton (downloaded 9 Oct 2026). Every size is true to its label (image
// matching between sizes); the single-size decors are taken as labelled, and Tabulae Sticks'
// pictures, 4% narrower than 600x1200 mm, are drawn at the tile's width. Tabulae's chevrons are
// single slanted pieces that need a chevron layout, so they keep their previews. Byte-identical
// pictures: Tabulae 20x120 R11 = Natural, Bon Ton 120x280 Soft = Lux (all but Carrara), Carrara and
// Perlino 120x120 Antique = Nat; those entries use the other item's faces.
for (const [filter, label, faced, count] of [[isTabulae, "Tabulae", 46, 54], [isBonTon, "Bon Ton", 53, 53]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, faced, `${label} entries on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
assert.ok(
  SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => isTabulae(material) && !physicalMaterials.includes(material)).every(
    (material) => material.surface_material.material_id.includes("-chevron-")
  ),
  "only Tabulae's chevrons keep their previews"
);
// The 30x120 R11 planks (on ABK's Plein Air pages) are floor-only.
const tabulaeCards = (r11: string[]) => {
  const genuine = ["23,4x148 Nat", "20x120", "20x120 Nat", "10x60 Nat"];
  const refined = [...genuine, "5x120 Nat"];
  return [
    ["Tabulae Genuine Combo 3D", ["60x60 Nat"]],
    ["Tabulae Genuine Hav", [...r11, ...genuine]],
    ["Tabulae Genuine Sab Nat", genuine],
    ["Tabulae Genuine Sticks 3D", ["60x120 Nat"]],
    ["Tabulae Refined Fieno", refined],
    ["Tabulae Refined Marble 3D", ["60x120 Nat"]],
    ["Tabulae Refined Mesh 3D", ["60x60 Nat"]],
    ["Tabulae Refined Miele Nat", [...r11, ...refined]],
  ];
};
assert.deepEqual(collectionCards(isTabulae, "flooring"), tabulaeCards(["30x120"]));
assert.deepEqual(collectionCards(isTabulae, "wall_tile"), tabulaeCards([]));
const bonTonMarble = ["120x120", "120x120 Nat", "60x120", "60x120 Nat", "5x120"];
const bonTonDecors = [["Bon Ton Network", ["60x120"]], ["Bon Ton Octagon", ["60x120"]]];
assert.deepEqual(collectionCards(isBonTon, "flooring"), [
  ["Bon Ton Biancone", bonTonMarble], ["Bon Ton Botticino", bonTonMarble], ["Bon Ton Carrara", bonTonMarble],
  ...bonTonDecors, ["Bon Ton Perlino", bonTonMarble], ["Bon Ton Tricot", ["60x120"]],
]);
const bonTonSlabs = ["120x280 Lux", "120x280 Soft"];
assert.deepEqual(collectionCards(isBonTon, "wall_tile"), [
  ["Bon Ton Biancone", [...bonTonSlabs, ...bonTonMarble]], ["Bon Ton Botticino", [...bonTonSlabs, ...bonTonMarble]],
  ["Bon Ton Carrara", ["120x280 Soft", ...bonTonMarble]], ...bonTonDecors,
  ["Bon Ton Perlino", [...bonTonSlabs, ...bonTonMarble]], ["Bon Ton Tricot", ["60x120"]],
]);
assert.deepEqual(collectionFaceRows(isTabulae), [
  ["genuine-combo", "600x600", 6, "600x600", "0021151_01.webp"],
  ["genuine-hav", "1200x200", 30, "200x1200", "0021141_01.webp"],
  ["genuine-hav", "1200x200", 30, "200x1200", "0021141_01.webp"],
  ["genuine-hav", "1200x300", 20, "300x1200", "0021253_01.webp"],
  ["genuine-hav", "1480x234", 20, "234x1480", "0021107_01.webp"],
  ["genuine-hav", "600x100", 15, "100x600", "0021145_01.webp"],
  ["genuine-sab-nat", "1200x200", 29, "200x1200", "0021140_01.webp"],
  ["genuine-sab-nat", "1200x200", 29, "200x1200", "0021140_01.webp"],
  ["genuine-sab-nat", "1480x234", 20, "234x1480", "0021106_01.webp"],
  ["genuine-sab-nat", "600x100", 10, "100x600", "0021144_01.webp"],
  ["genuine-sticks", "1200x600", 6, "600x1200", "0021153_01.webp"],
  ["refined-fieno", "1200x200", 30, "200x1200", "0021142_01.webp"],
  ["refined-fieno", "1200x200", 30, "200x1200", "0021142_01.webp"],
  ["refined-fieno", "1200x50", 15, "50x1200", "0021148_01.webp"],
  ["refined-fieno", "1480x234", 20, "234x1480", "0021108_01.webp"],
  ["refined-fieno", "600x100", 15, "100x600", "0021146_01.webp"],
  ["refined-marble", "1200x600", 4, "600x1200", "0021154_01.webp"],
  ["refined-mesh", "600x600", 6, "600x600", "0021152_01.webp"],
  ["refined-miele-nat", "1200x200", 30, "200x1200", "0021143_01.webp"],
  ["refined-miele-nat", "1200x200", 30, "200x1200", "0021143_01.webp"],
  ["refined-miele-nat", "1200x300", 20, "300x1200", "0021254_01.webp"],
  ["refined-miele-nat", "1200x50", 10, "50x1200", "0021149_01.webp"],
  ["refined-miele-nat", "1480x234", 20, "234x1480", "0021109_01.webp"],
  ["refined-miele-nat", "600x100", 10, "100x600", "0021147_01.webp"],
]);
const bonTonRows = (colour: string, codes: [string, string, string, string, string], strips: number) => [
  [colour, "1200x1200", 9, "1200x1200", `${codes[0]}_01.webp`],
  [colour, "1200x1200", 9, "1200x1200", `${codes[1]}_01.webp`],
  [colour, "1200x50", strips, "50x1200", `${codes[2]}_01.webp`],
  [colour, "1200x600", 18, "600x1200", `${codes[3]}_01.webp`],
  [colour, "1200x600", 18, "600x1200", `${codes[4]}_01.webp`],
];
assert.deepEqual(collectionFaceRows(isBonTon), [
  ...bonTonRows("biancone", ["0020776", "0020800", "0020848", "0020780", "0020804"], 17),
  ...bonTonRows("botticino", ["0020774", "0020798", "0020846", "0020778", "0020802"], 18),
  ...bonTonRows("carrara", ["0020799", "0020799", "0020847", "0020779", "0020803"], 18),
  ["network", "1200x600", 1, "600x1200", "0020782_01.webp"],
  ["octagon", "1200x600", 1, "600x1200", "0020783_01.webp"],
  ...bonTonRows("perlino", ["0020801", "0020801", "0020849", "0020781", "0020805"], 18),
  ["tricot", "1200x600", 1, "600x1200", "0020784_01.webp"],
].sort());

// Gardenia Pietra Viva and La Geoteca (downloaded 9 Oct 2026). Antique 3D and R11 items show the Nat
// P.tech item's pictures byte for byte and use its faces. Stand-ins for items with no pictures of
// their own (J, 9 Oct): the same colour and size in the other finish, or the same product under the
// code ABK lists it with (La Geoteca's Limestone and Travertino, on Dorica's pages). Pietra Viva's Aude
// 80x80 and La Geoteca's Ceppo di Gre 80x80 R11 pictures are a 1200 mm graphic squeezed to 800 mm;
// three of Limoges White's 120x120 pictures cover 1390 mm (image matching). Negresco 120x280 and 80x80
// have no pictures and keep their previews. Ceppo di Gre 120x280 leaves out six FUTURA CENERE pictures.
for (const [filter, label, faced, count] of [
  [isPietraViva, "Pietra Viva", 86, 86],
  [isLaGeoteca, "La Geoteca", 88, 92],
] as const) {
  assert.equal(physicalMaterials.filter(filter).length, faced, `${label} entries on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
assert.ok(
  SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => isLaGeoteca(material) && !physicalMaterials.includes(material)).every(
    (material) => /-negresco-pf6001(1723|2155)-/.test(material.surface_material.material_id)
  ),
  "only La Geoteca Negresco's 120x280 and 80x80 keep their previews"
);
const audeSizes = (slab: string[]) => [...slab, "120x120", "120x120 Nat", "60x120", "60x120 Nat", "80x80 Nat"];
const camargueLimoges = (slab: string[]) => [...slab, "120x120", "120x120 Nat", "80x160 Nat", "60x120", "60x120 Nat", "80x80 Nat"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(collectionCards(isPietraViva, category), [
    ["Pietra Viva Aude Beige", audeSizes(["120x280"])],
    ["Pietra Viva Aude Grey", audeSizes([])],
    ["Pietra Viva Aude Ivory", audeSizes(["120x280"])],
    ["Pietra Viva Camargue Beige", camargueLimoges([])],
    ["Pietra Viva Camargue Ivory", camargueLimoges(["120x280 Nat"])],
    ["Pietra Viva Limoges Sand", camargueLimoges([])],
    ["Pietra Viva Limoges White", camargueLimoges(["120x280 Nat"])],
  ]);
}
// The 80x80 R11 entries (no "Nat") are floor-only, as is Ceppo di Gre's 80x80.
const geoteca = (floor: boolean, r11: boolean, nat80 = true) =>
  ["120x280 Nat", "120x120 Nat", "60x120 Nat", ...(r11 && floor ? ["80x80"] : []), ...(nat80 ? ["80x80 Nat"] : [])];
for (const [category, floor] of [["flooring", true], ["wall_tile", false]] as const) {
  assert.deepEqual(collectionCards(isLaGeoteca, category), [
    ["La Geoteca Bourgogne Beige", ["120x280 Nat", "120x120 Nat", "60x120 Nat", "80x80", "80x80 Nat"]],
    ["La Geoteca Bourgogne Silver", ["120x280 Nat", "120x120 Nat", "60x120 Nat", "80x80", "80x80 Nat"]],
    ["La Geoteca Brennero", geoteca(floor, true)],
    ["La Geoteca Ceppo Di Gre'", geoteca(floor, true, false)],
    ["La Geoteca Dec Plis Bou Bei", ["60x120 Nat"]],
    ["La Geoteca Dec Pliss Serena", ["60x120 Nat"]],
    ["La Geoteca Dec Plissè Limes", ["60x120 Nat"]],
    ["La Geoteca Limestone", geoteca(floor, true)],
    ["La Geoteca Marfil", geoteca(floor, false)],
    ["La Geoteca Negresco", ["120x120 Nat", "60x120 Nat"]],
    ["La Geoteca Serena", geoteca(floor, true)],
    ["La Geoteca Trav Ivory Cross", ["120x280 Nat", "120x120 Nat", "60x120 Nat", "80x80", "80x80 Nat"]],
    ["La Geoteca Trav Ivory Vein", ["120x280 Nat", "120x120 Nat", "60x120 Nat"]],
  ]);
}
assert.deepEqual(collectionFaceRows(isPietraViva), [
  ["aude-beige", "1200x1200", 4, "1200x1200", "0012911_01.webp"],
  ["aude-beige", "1200x1200", 4, "1200x1200", "0012911_01.webp"],
  ["aude-beige", "1200x600", 8, "600x1200", "0012915_01.webp"],
  ["aude-beige", "1200x600", 8, "600x1200", "0012915_01.webp"],
  ["aude-beige", "2800x1200", 2, "1200x2800", "0014862_01.webp"],
  ["aude-beige", "800x800", 8, "1200x1200", "0012265_01.webp"],
  ["aude-grey", "1200x1200", 4, "1200x1200", "0012908_01.webp"],
  ["aude-grey", "1200x1200", 4, "1200x1200", "0012908_01.webp"],
  ["aude-grey", "1200x600", 8, "600x1200", "0011118_01.webp"],
  ["aude-grey", "1200x600", 8, "600x1200", "0011118_01.webp"],
  ["aude-grey", "800x800", 8, "1200x1200", "0012262_01.webp"],
  ["aude-ivory", "1200x1200", 4, "1200x1200", "0012910_01.webp"],
  ["aude-ivory", "1200x1200", 4, "1200x1200", "0012910_01.webp"],
  ["aude-ivory", "1200x600", 8, "600x1200", "0012914_01.webp"],
  ["aude-ivory", "1200x600", 8, "600x1200", "0012914_01.webp"],
  ["aude-ivory", "2800x1200", 2, "1200x2800", "0014863_01.webp"],
  ["aude-ivory", "800x800", 8, "1200x1200", "0012264_01.webp"],
  ["camargue-beige", "1200x1200", 9, "1200x1200", "0014182_01.webp"],
  ["camargue-beige", "1200x1200", 9, "1200x1200", "0014182_01.webp"],
  ["camargue-beige", "1200x600", 18, "600x1200", "0014186_01.webp"],
  ["camargue-beige", "1200x600", 18, "600x1200", "0014186_01.webp"],
  ["camargue-beige", "1600x800", 8, "800x1600", "0014671_01.webp"],
  ["camargue-beige", "800x800", 16, "800x800", "0014669_01.webp"],
  ["camargue-ivory", "1200x1200", 9, "1200x1200", "0014181_01.webp"],
  ["camargue-ivory", "1200x1200", 9, "1200x1200", "0014181_01.webp"],
  ["camargue-ivory", "1200x600", 18, "600x1200", "0014185_01.webp"],
  ["camargue-ivory", "1200x600", 18, "600x1200", "0014185_01.webp"],
  ["camargue-ivory", "1600x800", 8, "800x1600", "0014670_01.webp"],
  ["camargue-ivory", "2800x1200", 2, "1200x2800", "0014180_01.webp"],
  ["camargue-ivory", "800x800", 16, "800x800", "0014668_01.webp"],
  ["limoges-sand", "1200x1200", 6, "1200x1200", "0012921_01.webp"],
  ["limoges-sand", "1200x1200", 6, "1200x1200", "0012921_01.webp"],
  ["limoges-sand", "1200x600", 6, "600x1200", "0012926_01.webp"],
  ["limoges-sand", "1200x600", 6, "600x1200", "0012926_01.webp"],
  ["limoges-sand", "1600x800", 8, "800x1600", "0014672_01.webp"],
  ["limoges-sand", "800x800", 12, "800x800", "0012331_01.webp"],
  ["limoges-white", "1200x1200", 6, "1200x1200+1390x1390", "0012922_01.webp"],
  ["limoges-white", "1200x1200", 6, "1200x1200+1390x1390", "0012922_01.webp"],
  ["limoges-white", "1200x600", 10, "600x1200", "0012927_01.webp"],
  ["limoges-white", "1200x600", 10, "600x1200", "0012927_01.webp"],
  ["limoges-white", "1600x800", 8, "800x1600", "0014673_01.webp"],
  ["limoges-white", "2800x1200", 2, "1200x2800", "0012329_01.webp"],
  ["limoges-white", "800x800", 6, "1200x1200+1390x1390", "0012922_01.webp"],
]);
assert.deepEqual(collectionFaceRows(isLaGeoteca), [
  ["bourgogne-beige", "1200x1200", 6, "1200x1200", "0016057_01.webp"],
  ["bourgogne-beige", "1200x600", 11, "600x1200", "0016059_01.webp"],
  ["bourgogne-beige", "2800x1200", 2, "1200x2800", "0016055_01.webp"],
  ["bourgogne-beige", "800x800", 8, "800x800", "0016061_01.webp"],
  ["bourgogne-beige", "800x800", 8, "800x800", "0016061_01.webp"],
  ["bourgogne-silver", "1200x1200", 6, "1200x1200", "0016058_01.webp"],
  ["bourgogne-silver", "1200x600", 12, "600x1200", "0016060_01.webp"],
  ["bourgogne-silver", "2800x1200", 2, "1200x2800", "0016056_01.webp"],
  ["bourgogne-silver", "800x800", 8, "800x800", "0016062_01.webp"],
  ["bourgogne-silver", "800x800", 8, "800x800", "0016062_01.webp"],
  ["brennero", "1200x1200", 8, "1200x1200", "0011729_01.webp"],
  ["brennero", "1200x600", 12, "600x1200", "0014522_01.webp"],
  ["brennero", "2800x1200", 3, "1200x2800", "0011721_01.webp"],
  ["brennero", "800x800", 9, "800x800", "0012079_01.webp"],
  ["brennero", "800x800", 9, "800x800", "0012079_01.webp"],
  ["ceppo-di-gre", "1200x1200", 10, "1200x1200", "0013116_01.webp"],
  ["ceppo-di-gre", "1200x600", 10, "600x1200", "0013117_01.webp"],
  ["ceppo-di-gre", "2800x1200", 6, "1200x2800", "0008674_01.webp"],
  ["ceppo-di-gre", "800x800", 12, "1200x1200", "0013072_01.webp"],
  ["dec-plis-bou-bei", "1200x600", 1, "600x1200", "0016141_01.webp"],
  ["dec-pliss-serena", "1200x600", 1, "600x1200", "0016634_01.webp"],
  ["dec-plisse-limes", "1200x600", 1, "600x1200", "0016140_01.webp"],
  ["limestone", "1200x1200", 6, "1200x1200", "0010537_01.webp"],
  ["limestone", "1200x600", 7, "600x1200", "0010539_01.webp"],
  ["limestone", "2800x1200", 2, "1200x2800", "0011763_01.webp"],
  ["limestone", "800x800", 6, "800x800", "0012080_01.webp"],
  ["limestone", "800x800", 6, "800x800", "0012080_01.webp"],
  ["marfil", "1200x1200", 9, "1200x1200", "0011732_01.webp"],
  ["marfil", "1200x600", 12, "600x1200", "0011741_01.webp"],
  ["marfil", "2800x1200", 3, "1200x2800", "0011724_01.webp"],
  ["marfil", "800x800", 9, "800x800", "0012156_01.webp"],
  ["negresco", "1200x1200", 12, "1200x1200", "0011731_01.webp"],
  ["negresco", "1200x600", 12, "600x1200", "0011740_01.webp"],
  ["serena", "1200x1200", 6, "1200x1200", "0011726_01.webp"],
  ["serena", "1200x600", 12, "600x1200", "0014520_01.webp"],
  ["serena", "2800x1200", 3, "1200x2800", "0011718_01.webp"],
  ["serena", "800x800", 9, "800x800", "0012077_01.webp"],
  ["serena", "800x800", 9, "800x800", "0012077_01.webp"],
  ["trav-ivory-cross", "1200x1200", 6, "1200x1200", "0017438_01.webp"],
  ["trav-ivory-cross", "1200x600", 12, "600x1200", "0017439_01.webp"],
  ["trav-ivory-cross", "2800x1200", 3, "1200x2800", "0016135_01.webp"],
  ["trav-ivory-cross", "800x800", 5, "800x800", "0016144_01.webp"],
  ["trav-ivory-cross", "800x800", 6, "800x800", "0016183_01.webp"],
  ["trav-ivory-vein", "1200x1200", 5, "1200x1200", "0012723_01.webp"],
  ["trav-ivory-vein", "1200x600", 10, "600x1200", "0012726_01.webp"],
  ["trav-ivory-vein", "2800x1200", 3, "1200x2800", "0012720_01.webp"],
]);
const facesOf = (code: string) =>
  physicalMaterials
    .flatMap((material) => material.texture_assets.faces ?? [])
    .filter((face) => face.url.includes(`/${code}_`));
assert.ok(
  ["0012265", "0012262", "0012264", "0013072"].every(
    (code) => facesOf(code).length > 0 && facesOf(code).every((face) => face.width_mm === 1200 && face.height_mm === 1200)
  ),
  "Aude's 80x80 and Ceppo di Gre's 80x80 R11 pictures are declared 1200x1200 mm"
);
const limogesWhite = physicalMaterials.find((material) => material.surface_material.material_id.includes("-0012922-"));
assert.deepEqual(
  limogesWhite?.texture_assets.faces?.map((face) => face.width_mm),
  [1200, 1200, 1200, 1390, 1390, 1390],
  "three of Limoges White's 120x120 pictures cover 1390 mm"
);

// Gardenia Orosei and Gioia (downloaded 9 Oct 2026). Orosei's Antique 3D items show the Natural item's
// pictures byte for byte and use its faces. 42 of Orosei's 45 60x60 pictures are the 120x120 graphic
// squeezed to 600 mm (image matching), so they are declared 1200x1200 mm; Bone's pictures 1 and 2 and
// Vanilla's picture 2 are true 600 mm pictures. Each Gioia colour is one picture of the whole 60x120
// tile. Six of the seven decors stand upright with the long side horizontal, as Gioia is laid;
// Primavera's picture stands upright with the long side vertical, so that entry lays the tile
// 600 mm wide and 1200 mm tall (J, 9 Oct 2026).
for (const [filter, label, count] of [[isOrosei, "Orosei", 78], [isGioia, "Gioia", 21]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, count, `every ${label} entry is on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
const oroseiSizes = ["120x280 Nat", "120x120", "120x120 Nat", "60x120", "60x120 Nat", "80x80 Nat", "60x60 Nat"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(collectionCards(isOrosei, category), [
    ["Orosei Bone", oroseiSizes],
    ["Orosei Cream", oroseiSizes],
    ["Orosei Ecru", oroseiSizes],
    ["Orosei Ecru Tessera", ["120x120", "60x120"]],
    ["Orosei Rope", oroseiSizes],
    ["Orosei Vanilla", oroseiSizes],
    ["Orosei Vanilla Tessera", ["120x120", "60x120"]],
  ]);
}
const gioiaDecors = ["Majorelle", "Ombrelle", "Palma", "Papilio", "Rossignol"];
assert.deepEqual(collectionCards(isGioia, "flooring"), gioiaDecors.map((name) => [`Gioia ${name}`, ["60x120"]]));
assert.deepEqual(
  collectionCards(isGioia, "wall_tile"),
  [
    "Beige", "Bosco", "Cenere", "Cielo", "Cipria", "Corteccia", "Latte", "Majorelle", "Martinica", "Oceano", "Ombrelle",
    "Palma", "Papilio", "Primavera", "Rossignol", "Salvia",
  ].map((name) => [`Gioia ${name}`, ["60x120"]])
);
// One colour's rows: its 120x120 and 60x120 Natural items (the Antique 3D entries draw the same faces),
// the 120x280 slab, the 60x60 item with its face sizes, and the 80x80 item.
const oroseiRows = (colour: string, [square, plank, slab, sixty, eighty]: string[], faces60: string) => [
  [colour, "1200x1200", 9, "1200x1200", `${square}_01.webp`],
  [colour, "1200x1200", 9, "1200x1200", `${square}_01.webp`],
  [colour, "1200x600", 9, "600x1200", `${plank}_01.webp`],
  [colour, "1200x600", 9, "600x1200", `${plank}_01.webp`],
  [colour, "2800x1200", 3, "1200x2800", `${slab}_01.webp`],
  [colour, "600x600", 9, faces60, `${sixty}_01.webp`],
  [colour, "800x800", 9, "800x800", `${eighty}_01.webp`],
];
assert.deepEqual(collectionFaceRows(isOrosei), [
  ...oroseiRows("bone", ["0021733", "0021738", "0021723", "0030223", "0030228"], "600x600+1200x1200"),
  ...oroseiRows("cream", ["0021735", "0021740", "0021725", "0030225", "0030231"], "1200x1200"),
  ...oroseiRows("ecru", ["0021737", "0021742", "0021727", "0030227", "0030233"], "1200x1200"),
  ["ecru-tessera", "1200x1200", 9, "1200x1200", "0021698_01.webp"],
  ["ecru-tessera", "1200x600", 18, "600x1200", "0030241_01.webp"],
  ...oroseiRows("rope", ["0021736", "0021741", "0021726", "0030226", "0030232"], "1200x1200"),
  ...oroseiRows("vanilla", ["0021734", "0021739", "0021724", "0030224", "0030230"], "1200x1200+600x600"),
  ["vanilla-tessera", "1200x1200", 9, "1200x1200", "0021697_01.webp"],
  ["vanilla-tessera", "1200x600", 17, "600x1200", "0030240_01.webp"],
]);
assert.deepEqual(
  ["0030223", "0030224", "0030225"].map((code) => facesOf(code).slice(0, 9).map((face) => face.width_mm)),
  [
    [600, 600, 1200, 1200, 1200, 1200, 1200, 1200, 1200],
    [1200, 600, 1200, 1200, 1200, 1200, 1200, 1200, 1200],
    [1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200, 1200],
  ],
  "Orosei's 60x60 pictures are declared 1200x1200 mm, but for three true 600 mm pictures"
);
const gioiaTiles = physicalMaterials
  .filter(isGioia)
  .map((material) => [
    /-gioia-([a-z]+)-/.exec(material.surface_material.material_id)?.[1],
    material.surface_material.surface_category,
    `${material.physical_specs.tile_width_mm}x${material.physical_specs.tile_length_mm}`,
    material.texture_assets.faces?.map((face) => `${face.width_mm}x${face.height_mm}`).join(","),
  ]);
assert.ok(
  gioiaTiles.every(([name, , tile, faces]) => faces === "600x1200" && tile === (name === "primavera" ? "600x1200" : "1200x600")),
  "every Gioia entry has one 600x1200 mm face; only Primavera is laid with the long side vertical"
);

// Gardenia I Pigmenti (downloaded 9 Oct 2026). Each of the ten colours comes in seven sizes, and every
// size matches the colour's other sizes at its labelled scale (image matching). Crocini, Pillole and
// Rattan are one picture of the whole 60x120 tile. Ash 60x120's tenth picture is its first again,
// re-exported 2 px lower, and is used once, like the byte-identical repeats on Milk's and Mou's 10x60
// pages. ABK has no pictures of the Mos Confet mosaics, so they keep their previews (J, 9 Oct 2026).
assert.equal(physicalMaterials.filter(isIPigmenti).length, 146, "I Pigmenti entries on real faces");
assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(isIPigmenti).length, 166, "I Pigmenti entries in the catalogue");
assert.ok(
  SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => isIPigmenti(material) && !physicalMaterials.includes(material)).every(
    (material) => material.surface_material.material_id.includes("-mos-confet-")
  ),
  "only I Pigmenti's mosaics keep their previews"
);
const pigmentiDecors = ["Crocini", "Pillole", "Rattan"];
const pigmentiSizes = ["120x280 Nat", "120x120 Nat", "60x120 Nat", "60x60 Nat", "20x120 Nat", "30x30 Nat", "10x60 Nat"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(
    collectionCards(isIPigmenti, category),
    ["Ash", "Bark", "Clay", "Concrete", "Cotto", "Cream", "Crocini", "Milk", "Mou", "Mud", "Pillole", "Rattan", "Sand"].map(
      (name) => [`I Pigmenti ${name}`, pigmentiDecors.includes(name) ? ["60x120 Nat"] : pigmentiSizes]
    )
  );
}
// One colour's rows: 120x120, 20x120, 60x120, the 120x280 slab (one face), 30x30, 10x60 and 60x60.
const pigmentiRows = (colour: string, codes: string[], plankFaces = 10, thinFaces = 10) =>
  (
    [
      ["1200x1200", 5, "1200x1200"],
      ["1200x200", 10, "200x1200"],
      ["1200x600", plankFaces, "600x1200"],
      ["2800x1200", 1, "1200x2800"],
      ["300x300", 10, "300x300"],
      ["600x100", thinFaces, "100x600"],
      ["600x600", 10, "600x600"],
    ] as const
  ).map(([tile, count, face], index) => [colour, tile, count, face, `${codes[index]}_01.webp`]);
const pigmentiDecor = (decor: string, code: string) => [decor, "1200x600", 1, "600x1200", `${code}_01.webp`];
assert.deepEqual(collectionFaceRows(isIPigmenti), [
  ...pigmentiRows("ash", ["0016961", "0016439", "0016429", "0016997", "0016605", "0016459", "0016449"], 9),
  ...pigmentiRows("bark", ["0016970", "0016442", "0016432", "0016998", "0016608", "0016462", "0016452"]),
  ...pigmentiRows("clay", ["0016964", "0016441", "0016431", "0016999", "0016607", "0016461", "0016451"]),
  ...pigmentiRows("concrete", ["0016974", "0016447", "0016437", "0017000", "0016613", "0016467", "0016457"]),
  ...pigmentiRows("cotto", ["0016969", "0016444", "0016434", "0017001", "0016610", "0016464", "0016454"]),
  ...pigmentiRows("cream", ["0016975", "0016443", "0016433", "0017002", "0016609", "0016463", "0016453"]),
  pigmentiDecor("crocini", "0014514"),
  ...pigmentiRows("milk", ["0016962", "0016438", "0016428", "0017003", "0016604", "0016458", "0016448"], 10, 9),
  ...pigmentiRows("mou", ["0016973", "0016445", "0016435", "0017004", "0016611", "0016465", "0016455"], 10, 9),
  ...pigmentiRows("mud", ["0016972", "0016446", "0016436", "0017005", "0016612", "0016466", "0016456"]),
  pigmentiDecor("pillole", "0014511"),
  pigmentiDecor("rattan", "0014512"),
  ...pigmentiRows("sand", ["0016963", "0016440", "0016430", "0017006", "0016606", "0016460", "0016450"]),
]);

// Gardenia La Marmoteca (downloaded 10 Oct 2026). ABK shows the same pictures for every finish of a colour and size,
// byte for byte, so each colour and size draws one set of faces, the Lux item's; for Grey Stone and Statuario
// Premium, whose pages also show the faces under sister collections' names and colours, the pictures named
// MARMOTECA_. Entries whose code has no page on ABK's site use the same colour, size and finish under ABK's code,
// Soft 120x120 and 60x120 entries the Lux pictures, and the 40x120 entries the 60x120 faces (J, 10 Oct 2026).
// The book-matched A+B pairs have no pictures and keep their previews.
assert.equal(physicalMaterials.filter(isLaMarmoteca).length, 193, "La Marmoteca entries on real faces");
assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(isLaMarmoteca).length, 201, "La Marmoteca entries in the catalogue");
assert.ok(
  SURFACE_MATERIAL_RENDER_REGISTRY.filter((material) => isLaMarmoteca(material) && !physicalMaterials.includes(material)).every(
    (material) => material.surface_material.material_id.includes("-a-b-")
  ),
  "only La Marmoteca's book-matched pairs keep their previews"
);
const marmotecaThree = ["120x280 Lux", "120x120 Lux", "60x120 Lux"];
const marmotecaSoft = ["120x280 Lux", "120x280 Soft", "120x120 Lux", "120x120 Soft", "60x120 Lux", "60x120 Soft"];
const marmotecaNat = ["120x280 Lux", "120x280 Soft", "120x120 Lux", "120x120 Nat", "60x120 Lux", "60x120 Nat"];
const marmotecaCards = (sandFlower60: string[]) =>
  (
    [
      ["Anti Brown", marmotecaSoft],
      ["Blue Denim", marmotecaThree],
      ["Calacat Elegance", [...marmotecaNat, "40x120 Lux"]],
      ["Calacatta", marmotecaNat],
      ["Cosmic Ivory", marmotecaThree],
      ["Emerald Green", marmotecaThree],
      ["Frozen", marmotecaSoft],
      ["Gold Carbon", marmotecaSoft],
      ["Grey Stone", marmotecaNat],
      ["Grey Wonder", marmotecaSoft],
      ["Marquinia Black", ["120x280 Lux", "120x280 Soft", "120x120 Nat", "60x120 Lux", "60x120 Nat"]],
      ["Montblanc", ["120x280 Lux", "120x280 Soft", "120x120", "120x120 Lux", "60x120", "60x120 Lux"]],
      ["Patagoni Emerald", marmotecaThree],
      ["Port Noir", marmotecaNat],
      ["Pure Onyx", marmotecaSoft],
      ["Sahara White", marmotecaSoft],
      ["Sand Flower", ["120x280 Lux", "120x280 Soft", "120x120 Lux", "120x120 Nat", ...sandFlower60]],
      ["Statuari Premium", [...marmotecaNat, "40x120 Lux"]],
    ] as const
  ).map(([name, sizes]) => [`La Marmoteca ${name}`, [...sizes]]);
assert.deepEqual(collectionCards(isLaMarmoteca, "flooring"), marmotecaCards(["60x120 Nat"]));
assert.deepEqual(collectionCards(isLaMarmoteca, "wall_tile"), marmotecaCards(["60x120 Lux", "60x120 Nat"]));
// One colour's floor rows: per tile size, how many entries (finishes) draw it, its face count and its faces' prefix.
const marmotecaFace = { "1200x1200": "1200x1200", "1200x400": "600x1200", "1200x600": "600x1200", "2800x1200": "1200x2800" };
const marmotecaRows = (colour: string, sizes: [keyof typeof marmotecaFace, number, number, string][]) =>
  sizes.flatMap(([tile, entries, count, code]) =>
    Array.from({ length: entries }, () => [colour, tile, count, marmotecaFace[tile], `${code}_01.webp`])
  );
assert.deepEqual(collectionFaceRows(isLaMarmoteca), [
  ...marmotecaRows("anti-brown", [["1200x1200", 2, 8, "g27050"], ["1200x600", 2, 16, "g27060"], ["2800x1200", 2, 4, "0009718"]]),
  ...marmotecaRows("blue-denim", [["1200x1200", 1, 9, "g27012"], ["1200x600", 1, 16, "g27022"], ["2800x1200", 1, 4, "g27002"]]),
  ...marmotecaRows("calacat-elegance", [
    ["1200x1200", 2, 8, "g27051"], ["1200x400", 1, 16, "g27061"], ["1200x600", 2, 16, "g27061"], ["2800x1200", 2, 4, "0010597"],
  ]),
  ...marmotecaRows("calacatta", [["1200x1200", 2, 9, "0009112"], ["1200x600", 2, 18, "0009118"], ["2800x1200", 2, 4, "0008839"]]),
  ...marmotecaRows("cosmic-ivory", [["1200x1200", 1, 9, "g27011"], ["1200x600", 1, 16, "g27021"], ["2800x1200", 1, 4, "g27001"]]),
  ...marmotecaRows("emerald-green", [["1200x1200", 1, 6, "0005359"], ["1200x600", 1, 12, "0005362"], ["2800x1200", 1, 5, "0008685"]]),
  ...marmotecaRows("frozen", [["1200x1200", 2, 6, "0017771"], ["1200x600", 2, 12, "0017775"], ["2800x1200", 2, 3, "0014453"]]),
  ...marmotecaRows("gold-carbon", [["1200x1200", 2, 9, "g27010"], ["1200x600", 2, 18, "g27020"], ["2800x1200", 2, 4, "g27000"]]),
  ...marmotecaRows("grey-stone", [["1200x1200", 2, 9, "0006319"], ["1200x600", 2, 16, "0006322"], ["2800x1200", 2, 6, "0008688"]]),
  ...marmotecaRows("grey-wonder", [["1200x1200", 2, 9, "0014677"], ["1200x600", 2, 18, "0014681"], ["2800x1200", 2, 3, "0014675"]]),
  ...marmotecaRows("marquinia-black", [["1200x1200", 1, 12, "0010672"], ["1200x600", 2, 24, "g27063"], ["2800x1200", 2, 6, "0009721"]]),
  ...marmotecaRows("montblanc", [["1200x1200", 2, 8, "0006899"], ["1200x600", 2, 10, "0006900"], ["2800x1200", 2, 6, "0008689"]]),
  ...marmotecaRows("patagoni-emerald", [["1200x1200", 1, 9, "0012777"], ["1200x600", 1, 11, "0012778"], ["2800x1200", 1, 3, "0012774"]]),
  ...marmotecaRows("port-noir", [["1200x1200", 2, 6, "0011496"], ["1200x600", 2, 10, "0011003"], ["2800x1200", 2, 3, "0010994"]]),
  ...marmotecaRows("pure-onyx", [["1200x1200", 2, 8, "0017502"], ["1200x600", 2, 16, "0017504"], ["2800x1200", 2, 4, "0014454"]]),
  ...marmotecaRows("sahara-white", [["1200x1200", 2, 8, "0017769"], ["1200x600", 2, 16, "0017765"], ["2800x1200", 2, 4, "0009717"]]),
  ...marmotecaRows("sand-flower", [["1200x1200", 2, 9, "0012190"], ["1200x600", 1, 12, "0012069"], ["2800x1200", 2, 3, "0012246"]]),
  ...marmotecaRows("statuari-premium", [
    ["1200x1200", 2, 8, "0010392"], ["1200x400", 1, 16, "0010397"], ["1200x600", 2, 16, "0010397"], ["2800x1200", 2, 4, "0010598"],
  ]),
]);

// Gardenia Hermione and Concrea Plain (downloaded 10 Oct 2026), the first collections Gardenia's configurator never
// had: their entries come from ABK's own pages, each born with its faces, every size listed for floor and wall and
// laid like similar tiles (J, 10 Oct 2026). Hermione has 33 different plank faces per colour. Concrea Plain Bone's
// pages list each picture twice (as CONCREA PLAIN and LAB325 BASE SAND, byte for byte), and two of Silver's and
// White's 80x80 pictures are earlier ones exported anew: each is used once. Its 120x280 pictures are copies
// stretched across, drawn at the tile's width.
for (const [filter, label, count] of [[isHermione, "Hermione", 6], [isConcreaPlain, "Concrea Plain", 22]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, count, `every ${label} entry is on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
const concreaSizes = ["120x280 Nat", "120x120 Nat", "60x120 Nat", "80x80 Nat"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(
    collectionCards(isHermione, category),
    ["Beige", "Miel", "Noisette"].map((name) => [`Hermione ${name}`, ["20x120 Nat"]])
  );
  assert.deepEqual(collectionCards(isConcreaPlain, category), [
    ["Concrea Plain Bone", concreaSizes.slice(1)],
    ["Concrea Plain Silver", concreaSizes],
    ["Concrea Plain White", concreaSizes],
  ]);
}
assert.deepEqual(collectionFaceRows(isHermione), [
  ["beige", "1200x200", 33, "200x1200", "0202265_01.webp"],
  ["miel", "1200x200", 33, "200x1200", "0202266_01.webp"],
  ["noisette", "1200x200", 33, "200x1200", "0202267_01.webp"],
]);
// One colour's rows: 120x120, 60x120, the 120x280 slab and 80x80.
const concreaRows = (colour: string, counts: (number | null)[], codes: (string | null)[]) =>
  (
    [
      ["1200x1200", "1200x1200"],
      ["1200x600", "600x1200"],
      ["2800x1200", "1200x2800"],
      ["800x800", "800x800"],
    ] as const
  ).flatMap(([tile, face], index) => (codes[index] ? [[colour, tile, counts[index], face, `${codes[index]}_01.webp`]] : []));
assert.deepEqual(collectionFaceRows(isConcreaPlain), [
  ...concreaRows("bone", [4, 8, null, 12], ["0000256", "0007986", null, "0000240"]),
  ...concreaRows("silver", [10, 15, 2, 18], ["0003060", "0002608", "0008653", "0003064"]),
  ...concreaRows("white", [10, 8, 2, 18], ["0003059", "0002607", "0008652", "0003063"]),
]);
// What the entries take from ABK's pages: thickness per format (6 mm slabs, 8.5 mm otherwise), no configurator
// pattern ids, the layouts J chose (planks for the wood collections), and no blocker but the price.
const isFromAbkPages = (entry: { surface_material: { material_id: string } }) =>
  [isHermione, isConcreaPlain, isJustNature, isLuce, isStorm, isEpoque, isCamouflage, isBlock, isEterea].some((filter) => filter(entry));
const isWoodPlank = (entry: { surface_material: { material_id: string } }) => isHermione(entry) || isJustNature(entry);
const abkSiteEntries = getAllSurfaceMaterialYamlEntries().filter(isFromAbkPages);
assert.equal(
  abkSiteEntries.length,
  316,
  "Hermione 3, Concrea Plain 11, Just Nature 11, Luce 14, Storm 16, Epoque 2.0 21, Camouflage 23, Block 27 and Eterea 32 items, each for floor and wall"
);
for (const entry of abkSiteEntries) {
  const id = entry.surface_material.material_id;
  assert.ok(entry.import_governance.qa_flags.includes("gardenia_abk_site_import"), `${id} is imported from ABK's pages`);
  assert.equal(
    entry.physical_specs.total_thickness_mm,
    id.includes("-120x280-") ? 6 : id.includes("-camouflage-plisse-") ? 8 : 8.5,
    `${id} thickness`
  );
  assert.equal(entry.rendering.source_pattern_ids, undefined, `${id} has no configurator pattern ids`);
  assert.deepEqual(
    entry.rendering.available_pattern_layouts,
    isWoodPlank(entry) ? ["random_stagger", "straight", "herringbone"] : ["straight", "brick", "vertical_brick"],
    `${id} layouts`
  );
  assert.deepEqual(entry.import_governance.publish_blockers, ["confirm_price_per_sqm_or_quote_mode"], `${id} blockers`);
}
// The July importer would reset every entry on faces and delete the collections it never had: a write run refuses.
const lostToImport = findGardeniaEntriesAWriteRunWouldLose(path.join(process.cwd(), "catalog"));
assert.equal(
  [...lostToImport.values()].reduce((sum, count) => sum + count, 0),
  physicalMaterials.filter((material) => material.surface_material.supplier === "gardenia_orchidea").length,
  "the import guard finds every Gardenia entry on faces"
);
assert.deepEqual(
  ["hermione", "concrea-plain", "just-nature", "luce", "storm", "epoque-20", "camouflage", "block", "eterea", "plein-air"].map(
    (collection) => lostToImport.get(collection)
  ),
  // Hermione, Storm and Camouflage with their outdoor sizes (3, 4 and 4 floor entries, 13 Oct 2026); Plein Air's own 50 floor entries.
  [9, 22, 22, 28, 36, 42, 50, 54, 64, 50]
);

// Gardenia Just Nature and Luce (downloaded 10 Oct 2026), from ABK's pages like Hermione and Concrea Plain, with
// each colour's family and Luce's look as ABK describes them (J, 10 Oct 2026: Luce per colour, as ABK). Just Nature
// has six plank faces per size; its 20x120 planks are found in the colour's 30x120 pictures at the same scale, so the
// 20x120 entries also draw the 30x120 faces, cut to the plank (J, 10 Oct 2026). Beige Scuro has no 30x120 entry: ABK
// shows Beige Medio's pictures for it. Sbiancato's 30x120 page lists one picture twice. Luce's 120x280 pictures come
// out about 5% larger than its other sizes (noted in the entries).
for (const [filter, label, count] of [[isJustNature, "Just Nature", 22], [isLuce, "Luce", 28]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, count, `every ${label} entry is on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
const lucePlain = ["120x120 Nat", "60x120 Nat", "80x80 Nat"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(
    collectionCards(isJustNature, category),
    (
      [
        ["Beige Chiaro", ["30x120 Nat", "20x120 Nat"]],
        ["Beige Medio", ["30x120 Nat", "20x120 Nat"]],
        ["Beige Scuro", ["20x120 Nat"]],
        ["Grigio", ["30x120 Nat", "20x120 Nat"]],
        ["Noce Scuro", ["30x120 Nat", "20x120 Nat"]],
        ["Sbiancato", ["30x120 Nat", "20x120 Nat"]],
      ] as const
    ).map(([name, sizes]) => [`Just Nature ${name}`, [...sizes]])
  );
  assert.deepEqual(
    collectionCards(isLuce, category),
    (
      [
        ["Acciaio", lucePlain],
        ["Peltro", lucePlain.slice(1)],
        ["Perla", ["120x280 Nat", ...lucePlain]],
        ["Piombo", lucePlain.slice(0, 2)],
        ["Verderame", ["120x280 Nat", ...lucePlain.slice(0, 2)]],
      ] as const
    ).map(([name, sizes]) => [`Luce ${name}`, [...sizes]])
  );
}
// One Just Nature colour's rows: the 20x120 plank on its own faces and the 30x120 faces cut to it, then the 30x120.
const justNatureRows = (colour: string, plank: string, wide: string, wideFaces = 6) => [
  [colour, "1200x200", 6 + wideFaces, "200x1200+300x1200", `${plank}_01.webp`],
  [colour, "1200x300", wideFaces, "300x1200", `${wide}_01.webp`],
];
assert.deepEqual(collectionFaceRows(isJustNature), [
  ...justNatureRows("beige-chiaro", "g52012", "g52002"),
  ...justNatureRows("beige-medio", "g52016", "g52006"),
  ["beige-scuro", "1200x200", 6, "200x1200", "g52013_01.webp"],
  ...justNatureRows("grigio", "g52011", "g52001"),
  ...justNatureRows("noce-scuro", "g52015", "g52005"),
  ...justNatureRows("sbiancato", "g52010", "g52000", 5),
]);
const luceRow = (colour: string, tile: "120x120" | "60x120" | "80x80" | "120x280", code: string) =>
  ({
    "120x120": [colour, "1200x1200", 6, "1200x1200", `${code}_01.webp`],
    "60x120": [colour, "1200x600", 12, "600x1200", `${code}_01.webp`],
    "80x80": [colour, "800x800", 12, "800x800", `${code}_01.webp`],
    "120x280": [colour, "2800x1200", 2, "1200x2800", `${code}_01.webp`],
  })[tile];
assert.deepEqual(collectionFaceRows(isLuce), [
  luceRow("acciaio", "120x120", "0006083"), luceRow("acciaio", "60x120", "0006087"), luceRow("acciaio", "80x80", "0006546"),
  luceRow("peltro", "60x120", "0006088"), luceRow("peltro", "80x80", "0006547"),
  luceRow("perla", "120x120", "0006540"), luceRow("perla", "60x120", "0006541"), luceRow("perla", "120x280", "0008183"),
  luceRow("perla", "80x80", "0006549"),
  luceRow("piombo", "120x120", "0006085"), luceRow("piombo", "60x120", "0006089"),
  luceRow("verderame", "120x120", "0006159"), luceRow("verderame", "60x120", "0006161"), luceRow("verderame", "120x280", "0008182"),
]);
// Colour and look as ABK describes them.
assert.deepEqual(
  [...new Set(physicalMaterials.filter((material) => isJustNature(material) || isLuce(material)).map((material) =>
    `${/-(just-nature|luce)-([a-z-]+?)-(?:g\d|\d)/.exec(material.surface_material.material_id)?.slice(1).join(" ")}: ` +
    `${material.classification?.design_effect} ${material.classification?.color_family}`
  ))].sort(),
  [
    "just-nature beige-chiaro: wood beige", "just-nature beige-medio: wood beige", "just-nature beige-scuro: wood beige",
    "just-nature grigio: wood grey", "just-nature noce-scuro: wood brown", "just-nature sbiancato: wood white",
    "luce acciaio: plain grey", "luce peltro: plain grey", "luce perla: plain white", "luce piombo: concrete grey",
    "luce verderame: concrete mixed",
  ]
);

// Gardenia Storm and Epoque 2.0 (downloaded 11 Oct 2026), from ABK's pages like the four above, each colour's family
// from ABK's colour words. Storm's four sizes are true to their labels (80x80 is its own graphic, at the same grain).
// Epoque 2.0's Lappato pages list the Natural pages' pictures, so both finishes of a colour and size draw the Natural
// faces (J, 11 Oct 2026: both, sharing faces); Grey 60x60 comes only in Lappato. Its six Antique 3D colours come in 60x120
// (J, 11 Oct 2026: include all six). Abstract's 60x60 pictures are its 60x120 pictures cut in two; pictures 3 and 4 are cut
// 80 mm off-centre, so faces 03 and 04 are 60x120 picture 3 cut at its middle (J, 11 Oct 2026: recut 3 and 4).
for (const [filter, label, count] of [[isStorm, "Storm", 32], [isEpoque, "Epoque 2.0", 42]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, count, `every ${label} entry is on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
const stormSizes = ["120x120 Nat", "60x120 Nat", "80x80 Nat", "60x60 Nat"];
const epoqueBoth = ["60x120 Lappato", "60x120 Nat", "60x60 Lappato", "60x60 Nat"];
const antique = ["60x120 Antique 3D"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(
    collectionCards(isStorm, category),
    ["Grey", "Mud", "Sand", "White"].map((name) => [`Storm ${name}`, stormSizes])
  );
  assert.deepEqual(
    collectionCards(isEpoque, category),
    (
      [
        ["Abstract", ["60x120 Nat", "60x60 Nat"]], ["Arabescato", antique], ["Black", epoqueBoth],
        ["Calacatta Bamboo", antique], ["Grey", epoqueBoth.slice(0, 3)], ["Grigio Etrusco", antique], ["Ivory", epoqueBoth],
        ["Lilac White", antique], ["Tesserae", antique], ["Veria Green", antique], ["White", epoqueBoth.slice(0, 2)],
      ] as const
    ).map(([name, sizes]) => [`Epoque 2.0 ${name}`, [...sizes]])
  );
}
const stormRows = (colour: string, [big, long, medium, small]: readonly [string, string, string, string]) => [
  [colour, "1200x1200", 9, "1200x1200", `${big}_01.webp`],
  [colour, "1200x600", 18, "600x1200", `${long}_01.webp`],
  [colour, "600x600", 12, "600x600", `${small}_01.webp`],
  [colour, "800x800", 9, "800x800", `${medium}_01.webp`],
];
assert.deepEqual(collectionFaceRows(isStorm), [
  ...stormRows("grey", ["0003805", "0003977", "0003997", "0004005"]),
  ...stormRows("mud", ["0003807", "0003979", "0003999", "0004007"]),
  ...stormRows("sand", ["0003806", "0003978", "0003998", "0004006"]),
  ...stormRows("white", ["0003821", "0003980", "0004000", "0004008"]),
]);
// One row per finish of a colour and size; a Lappato row draws the Natural item's faces.
const epoqueRow = (colour: string, tile: "60x120" | "60x60", faces: number, code: string) =>
  tile === "60x120"
    ? [colour, "1200x600", faces, "600x1200", `${code}_01.webp`]
    : [colour, "600x600", faces, "600x600", `${code}_01.webp`];
assert.deepEqual(collectionFaceRows(isEpoque), [
  epoqueRow("abstract", "60x120", 4, "0005104"), epoqueRow("abstract", "60x60", 8, "0005105"),
  epoqueRow("arabescato", "60x120", 18, "0009341"),
  epoqueRow("black", "60x120", 8, "0004295"), epoqueRow("black", "60x120", 8, "0004295"),
  epoqueRow("black", "60x60", 12, "0004307"), epoqueRow("black", "60x60", 12, "0004307"),
  epoqueRow("calacatta-bamboo", "60x120", 16, "0009344"),
  epoqueRow("grey", "60x120", 8, "0004297"), epoqueRow("grey", "60x120", 8, "0004297"), epoqueRow("grey", "60x60", 12, "0004313"),
  epoqueRow("grigio-etrusco", "60x120", 20, "0009342"),
  epoqueRow("ivory", "60x120", 7, "0004294"), epoqueRow("ivory", "60x120", 7, "0004294"),
  epoqueRow("ivory", "60x60", 12, "0004306"), epoqueRow("ivory", "60x60", 12, "0004306"),
  epoqueRow("lilac-white", "60x120", 18, "0009343"), epoqueRow("tesserae", "60x120", 4, "0009385"),
  epoqueRow("veria-green", "60x120", 18, "0009345"),
  epoqueRow("white", "60x120", 8, "0004296"), epoqueRow("white", "60x120", 8, "0004296"),
]);
// Abstract 60x60's faces 03 and 04 come from 60x120 picture 3, cut at its middle (its manifest says so).
const abstractManifest = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "catalog/surface-materials/flooring/gardenia/epoque-20/gardenia-epoque-20-abstract-faces.manifest.json"),
    "utf8"
  )
) as { formats: { item_code: string; faces: { face: number; source_sha256: string; recut?: string }[] }[] };
const abstractFaces = (code: string) => abstractManifest.formats.find((format) => format.item_code === code)?.faces ?? [];
assert.deepEqual(
  abstractFaces("0005105").filter((face) => face.recut).map((face) => [face.face, face.source_sha256]),
  [[3, abstractFaces("0005104")[2]?.source_sha256], [4, abstractFaces("0005104")[2]?.source_sha256]],
  "Abstract 60x60 faces 03 and 04 are 60x120 picture 3's halves"
);
// Colour and look as ABK describes them: Storm stone, Epoque 2.0 marble; Mud black; Abstract, Tesserae and Veria Green mixed.
assert.deepEqual(
  [...new Set(physicalMaterials.filter((material) => isStorm(material) || isEpoque(material)).map((material) =>
    `${/-(storm|epoque-20)-([a-z-]+?)-\d/.exec(material.surface_material.material_id)?.slice(1).join(" ")}: ` +
    `${material.classification?.design_effect} ${material.classification?.color_family}`
  ))].sort(),
  [
    "epoque-20 abstract: marble mixed", "epoque-20 arabescato: marble white", "epoque-20 black: marble black",
    "epoque-20 calacatta-bamboo: marble white", "epoque-20 grey: marble grey", "epoque-20 grigio-etrusco: marble grey",
    "epoque-20 ivory: marble beige", "epoque-20 lilac-white: marble white", "epoque-20 tesserae: marble mixed",
    "epoque-20 veria-green: marble mixed", "epoque-20 white: marble white",
    "storm grey: stone grey", "storm mud: stone black", "storm sand: stone beige", "storm white: stone white",
  ]
);

// Make's ids carry ABK's zero-padded code (g0073022), its faces drop the zeros (g73022_nn); Tabulae's
// and Bon Ton's carry pf6 before the code (pf60021141 -> 0021141_nn), and 23,4 is written 23-4.
// Gioia's decors carry an eight-digit code (00202274 -> 0202274_nn).
const itemCode = (id: string) =>
  (/-((?:g|pf)?\d{5,10})-\d+(?:-\d+)?x\d+/.exec(id)?.[1] ?? "?")
    .replace(/^g0+/, "g")
    .replace(/^pf6/, "")
    .replace(/^0(\d{7})$/, "$1");
// Block items with no picture on ABK's download area, and the item whose faces each draws (J, 12 Oct 2026: cut from 120x120).
const blockStandIns = [
  ...["0031186", "0031406"].map((code) => [code, "0031174"] as const),
  ...["0031177", "0031185", "0031405"].map((code) => [code, "0031173"] as const),
  ...["0031179", "0031187", "0031407"].map((code) => [code, "0031175"] as const),
  ...["0031180", "0031188", "0031408"].map((code) => [code, "0031176"] as const),
];
// Gardenia Camouflage and Block (downloaded 12 Oct 2026), from ABK's pages like the six above. Camouflage's sizes are true to
// their labels; every page but the 60x60 ones lists each face twice, tagged sRGB and with no profile, and each face is used
// once, from its sRGB copy. Block's R11 120x120 pages list the Nat 3D pictures, so both finishes draw the Nat 3D faces (J,
// 12 Oct 2026: both, sharing faces). Eleven Block items have no picture on ABK's download area and draw the colour's 120x120
// Nat 3D faces, cut to the tile at true scale (J, 12 Oct 2026: cut from 120x120); their entries carry the qa flag
// stand_in_faces. Tabacco 120x280 has no picture and is left out. The Righe decors are one picture each.
for (const [filter, label, count] of [[isCamouflage, "Camouflage", 46], [isBlock, "Block", 54]] as const) {
  assert.equal(physicalMaterials.filter(filter).length, count, `every ${label} entry is on real faces`);
  assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(filter).length, count, `${label} entries in the catalogue`);
}
const camouflageSizes = ["120x280 Nat", "120x120 Nat", "60x120 Nat", "80x80 Nat", "60x60 Nat"];
const blockSizes = ["120x280 Nat 3D", "120x120 Nat 3D", "120x120 R11", "60x120 Nat 3D", "60x60 Nat 3D", "60x60 R11"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(
    collectionCards(isCamouflage, category),
    (
      [
        ["Ecru Beton", camouflageSizes], ["Plisse White Beton", ["60x120 Nat"]], ["Silver Beton", camouflageSizes],
        ["Taupe Beton", camouflageSizes.slice(1)], ["Vernis Gold", camouflageSizes.slice(1, 3)],
        ["Vernis Green", camouflageSizes.slice(1, 3)], ["White Beton", camouflageSizes.slice(1)],
      ] as const
    ).map(([name, sizes]) => [`Camouflage ${name}`, [...sizes]])
  );
  assert.deepEqual(
    collectionCards(isBlock, category),
    (
      [
        ["Argilla", blockSizes], ["Burro", blockSizes], ["Creta", blockSizes], ["Righe Argilla", ["60x120 Nat"]],
        ["Righe Burro", ["60x120 Nat"]], ["Righe Creta", ["60x120 Nat"]], ["Righe Tabacco", ["60x120 Nat"]],
        ["Tabacco", blockSizes.slice(1)],
      ] as const
    ).map(([name, sizes]) => [`Block ${name}`, [...sizes]])
  );
}
const camouflageRows = (colour: string, [big, long, slab, small, medium]: readonly (string | null)[], [bigN, longN] = [6, 12]) =>
  (
    [
      [big, "1200x1200", bigN, "1200x1200"],
      [long, "1200x600", longN, "600x1200"],
      [slab, "2800x1200", 2, "1200x2800"],
      [small, "600x600", 24, "600x600"],
      [medium, "800x800", 12, "800x800"],
    ] as const
  ).flatMap(([code, tile, faces, face]) => (code ? [[colour, tile, faces, face, `${code}_01.webp`]] : []));
assert.deepEqual(collectionFaceRows(isCamouflage), [
  ...camouflageRows("ecru-beton", ["0016239", "0016237", "0016235", "0018160", "0016241"]),
  ...camouflageRows("plisse-white-beton", [null, "0016636", null, null, null], [0, 6]),
  ...camouflageRows("silver-beton", ["0016238", "0016236", "0016234", "0018159", "0016240"]),
  ...camouflageRows("taupe-beton", ["0014261", "0014255", null, "0018158", "0014398"]),
  ...camouflageRows("vernis-gold", ["0014263", "0014257", null, null, null], [5, 10]),
  ...camouflageRows("vernis-green", ["0014264", "0014258", null, null, null], [5, 10]),
  ...camouflageRows("white-beton", ["0014259", "0014253", null, "0018157", "0014395"]),
]);
// Each Block colour: 120x120 Nat 3D and R11 on the Nat 3D faces; the 120x280 slab on its own; 60x120 on its own (Argilla) or
// on the 120x120 faces; 60x60 Nat 3D and R11 on the 120x120 faces.
const blockRows = (colour: string, big: string, faces: number, slab: string | null, long: string | null) => [
  [colour, "1200x1200", faces, "1200x1200", `${big}_01.webp`],
  [colour, "1200x1200", faces, "1200x1200", `${big}_01.webp`],
  long ? [colour, "1200x600", 5, "600x1200", `${long}_01.webp`] : [colour, "1200x600", faces, "1200x1200", `${big}_01.webp`],
  ...(slab ? [[colour, "2800x1200", 3, "1200x2800", `${slab}_01.webp`]] : []),
  [colour, "600x600", faces, "1200x1200", `${big}_01.webp`],
  [colour, "600x600", faces, "1200x1200", `${big}_01.webp`],
];
assert.deepEqual(collectionFaceRows(isBlock), [
  ...blockRows("argilla", "0031174", 9, "0031145", "0031178"),
  ...blockRows("burro", "0031173", 8, "0031144", null),
  ...blockRows("creta", "0031175", 9, "0031146", null),
  ["righe-argilla", "1200x600", 1, "600x1200", "0031182_01.webp"],
  ["righe-burro", "1200x600", 1, "600x1200", "0031181_01.webp"],
  ["righe-creta", "1200x600", 1, "600x1200", "0031183_01.webp"],
  ["righe-tabacco", "1200x600", 1, "600x1200", "0031184_01.webp"],
  ...blockRows("tabacco", "0031176", 8, null, null),
]);
// The entries with no picture of their own are flagged, for the admin audit page (J, 12 Oct 2026).
const flaggedStandIns = getAllSurfaceMaterialYamlEntries().filter(
  (entry) => isBlock(entry) && entry.import_governance.qa_flags.includes("stand_in_faces")
);
assert.deepEqual(
  [...new Set(flaggedStandIns.map((entry) => itemCode(entry.surface_material.material_id)))].sort(),
  blockStandIns.map(([code]) => code).sort(),
  "Block's stand-ins carry stand_in_faces"
);
assert.equal(flaggedStandIns.length, 22, "11 stand-in items, floor and wall");
// Camouflage: every face that ABK lists twice is used once, from its sRGB copy (the manifests name the copy left out).
for (const colour of ["ecru-beton", "plisse-white-beton", "silver-beton", "taupe-beton", "vernis-gold", "vernis-green", "white-beton"]) {
  const manifest = JSON.parse(
    readFileSync(
      path.join(process.cwd(), `catalog/surface-materials/flooring/gardenia/camouflage/gardenia-camouflage-${colour}-faces.manifest.json`),
      "utf8"
    )
  ) as { formats: { format: string; faces: unknown[]; duplicates_dropped_site_positions?: number[]; duplicates_note?: string }[] };
  for (const format of manifest.formats) {
    const listedTwice = format.format !== "60x60";
    assert.equal(
      format.duplicates_dropped_site_positions?.length ?? 0,
      listedTwice ? format.faces.length : 0,
      `Camouflage ${colour} ${format.format}: each face is listed twice but on the 60x60 pages`
    );
    if (listedTwice) assert.match(format.duplicates_note ?? "", /from its sRGB copy/, `Camouflage ${colour} ${format.format}`);
  }
}
// Colour and look as ABK describes them: Camouflage concrete, Block stone and its Righe decors plain; Vernis Green mixed.
assert.deepEqual(
  [...new Set(physicalMaterials.filter((material) => isCamouflage(material) || isBlock(material)).map((material) =>
    `${/-(camouflage|block)-([a-z-]+?)-\d/.exec(material.surface_material.material_id)?.slice(1).join(" ")}: ` +
    `${material.classification?.design_effect} ${material.classification?.color_family}`
  ))].sort(),
  [
    "block argilla: stone beige", "block burro: stone white", "block creta: stone beige", "block righe-argilla: plain beige",
    "block righe-burro: plain white", "block righe-creta: plain beige", "block righe-tabacco: plain beige",
    "block tabacco: stone beige",
    "camouflage ecru-beton: concrete beige", "camouflage plisse-white-beton: concrete white",
    "camouflage silver-beton: concrete grey", "camouflage taupe-beton: concrete beige", "camouflage vernis-gold: concrete beige",
    "camouflage vernis-green: concrete mixed", "camouflage white-beton: concrete white",
  ]
);

// Gardenia Eterea (downloaded 12 Oct 2026), from ABK's pages like the eight above. Ice, Jade, Powder and Sand come in Lux at
// 120x120 and in Lux and Soft at 120x280 and 60x120; ABK's Soft pages list the Lux pictures, so both finishes draw the Lux faces
// (J, 12 Oct 2026: both, sharing faces). Ice Raw, Jade Raw, Powder Raw and Sand Raw (Natural, 120x120 and 60x120) are colours of
// their own with pictures of their own (J, 12 Oct 2026: as ABK), and the four Righe are a fluted 60x120 decor with one picture
// each (J, 12 Oct 2026: include them). Every size is true to its label. Ice's 60x120 page lists each picture twice and Jade's one
// picture twice, byte for byte; each face is used once.
assert.equal(physicalMaterials.filter(isEterea).length, 64, "every Eterea entry is on real faces");
assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(isEterea).length, 64, "Eterea entries in the catalogue");
const etereaLux = ["120x280 Lux", "120x280 Soft", "120x120 Lux", "60x120 Lux", "60x120 Soft"];
const etereaRaw = ["120x120 Nat", "60x120 Nat"];
for (const category of ["flooring", "wall_tile"]) {
  assert.deepEqual(
    collectionCards(isEterea, category),
    ["Ice", "Jade", "Powder", "Righe", "Sand"].flatMap((name) =>
      name === "Righe"
        ? ["Ambra", "Blu Pavone", "Borgogna", "Gesso"].map((colour) => [`Eterea Righe ${colour}`, ["60x120 Nat"]])
        : [[`Eterea ${name}`, etereaLux], [`Eterea ${name} Raw`, etereaRaw]]
    )
  );
}
// Each Lux colour: 120x120 on its own faces; 120x280 and 60x120 Lux and Soft on the Lux item's faces. Each Raw colour: 120x120
// and 60x120 on their own faces.
const etereaRows = (colour: string, [big, slab, long]: readonly string[], [bigN, longN]: readonly number[]) => [
  [colour, "1200x1200", bigN, "1200x1200", `${big}_01.webp`],
  [colour, "1200x600", longN, "600x1200", `${long}_01.webp`],
  [colour, "1200x600", longN, "600x1200", `${long}_01.webp`],
  [colour, "2800x1200", 3, "1200x2800", `${slab}_01.webp`],
  [colour, "2800x1200", 3, "1200x2800", `${slab}_01.webp`],
];
const etereaRawRows = (colour: string, big: string, long: string) => [
  [colour, "1200x1200", 9, "1200x1200", `${big}_01.webp`],
  [colour, "1200x600", 18, "600x1200", `${long}_01.webp`],
];
assert.deepEqual(collectionFaceRows(isEterea), [
  ...etereaRows("ice", ["0030732", "0030726", "0030738"], [8, 18]),
  ...etereaRawRows("ice-raw", "0030751", "0030757"),
  ...etereaRows("jade", ["0030737", "0030731", "0030743"], [9, 17]),
  ...etereaRawRows("jade-raw", "0030756", "0030762"),
  ...etereaRows("powder", ["0030735", "0030729", "0030741"], [9, 18]),
  ...etereaRawRows("powder-raw", "0030754", "0030760"),
  ["righe-ambra", "1200x600", 1, "600x1200", "0030967_01.webp"],
  ["righe-blu-pavone", "1200x600", 1, "600x1200", "0030969_01.webp"],
  ["righe-borgogna", "1200x600", 1, "600x1200", "0030968_01.webp"],
  ["righe-gesso", "1200x600", 1, "600x1200", "0030966_01.webp"],
  ...etereaRows("sand", ["0030733", "0030727", "0030739"], [9, 18]),
  ...etereaRawRows("sand-raw", "0030752", "0030758"),
]);
// Ice's 60x120 page lists its 18 pictures twice, byte for byte, and Jade's lists one picture twice: the manifests name the
// repeats left out.
for (const [colour, dropped] of [["ice", [19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]], ["jade", [17]]] as const) {
  const manifest = JSON.parse(
    readFileSync(
      path.join(process.cwd(), `catalog/surface-materials/flooring/gardenia/eterea/gardenia-eterea-${colour}-faces.manifest.json`),
      "utf8"
    )
  ) as { formats: { format: string; duplicates_dropped_site_positions?: number[] }[] };
  assert.deepEqual(
    manifest.formats.find((format) => format.format === "60x120")?.duplicates_dropped_site_positions,
    [...dropped],
    `Eterea ${colour} 60x120 repeats`
  );
}
// Colour and look as ABK describes them: every colour marble-effect, the Righe decors too; Jade green, Powder pink, Righe
// Borgogna red and Blu Pavone blue are "mixed", as the July importer files green, red and blue.
assert.deepEqual(
  [...new Set(physicalMaterials.filter(isEterea).map((material) =>
    `${/-eterea-([a-z-]+?)-\d/.exec(material.surface_material.material_id)?.[1]}: ` +
    `${material.classification?.design_effect} ${material.classification?.color_family}`
  ))].sort(),
  [
    "ice-raw: marble white", "ice: marble white", "jade-raw: marble mixed", "jade: marble mixed", "powder-raw: marble mixed",
    "powder: marble mixed", "righe-ambra: marble beige", "righe-blu-pavone: marble mixed", "righe-borgogna: marble mixed",
    "righe-gesso: marble white", "sand-raw: marble beige", "sand: marble beige",
  ]
);

// Gardenia Plein Air's outdoor sizes (downloaded 13 Oct 2026). Plein Air is ABK's outdoor range, the 20 mm R11 versions of its
// collections; its sizes of collections the catalogue has join their colour's card as R11 sizes, for floors only (J, 13 Oct 2026:
// split, floor only). Most of these R11 pages show pictures the colour's other items already have, byte for byte, so those entries
// draw that item's faces. Anima Fango 80x80, Hermione 30x120, La Geoteca Antracite (a colour La Geoteca doesn't otherwise have),
// Travertino Ivory Vein 80x80, Make 80x80 and Storm have pictures of their own; Make's are its Natural 80x80 faces exported again,
// the same 1000 mm graphic. Pietra Viva Aude Beige and Grey 60x60 have no pictures and draw the colour's 120x120 Nat P.tech faces
// (J, 13 Oct 2026: cut from 120x120). Left out: Ceppo di Gre's second 60x120 R11 item (0002933, the CENERE export) and
// Hermione Beige and Miel 60x60 (pictures far lighter and pinker than the colour's planks; J, 13 Oct 2026: both left out).
const outdoor = physicalMaterials.filter(isPleinAirOutdoor);
assert.equal(pleinAirOutdoorIds.size, 34, "34 outdoor sizes of catalogued collections");
assert.equal(outdoor.length, 34, "every outdoor entry is on real faces");
const outdoorRow = (material: (typeof outdoor)[number]) => {
  const [, collection, colour] =
    /^gardenia-flooring-(anima|camouflage|hermione|la-geoteca|make|orosei|pietra-viva|storm)-([a-z-]+?)-g?\d/.exec(
      material.surface_material.material_id
    ) ?? [];
  return [
    collection,
    colour,
    itemCode(material.surface_material.material_id),
    `${material.physical_specs.tile_width_mm}x${material.physical_specs.tile_length_mm}`,
    material.texture_assets.faces?.length,
    [...new Set(material.texture_assets.faces?.map((face) => `${face.width_mm}x${face.height_mm}`))].join("+"),
    material.texture_assets.faces?.[0]?.url.split("/").pop(),
  ];
};
assert.deepEqual(outdoor.map(outdoorRow).sort(), [
  ["anima", "beige", "0006354", "1200x600", 14, "600x1200", "0006048_01.webp"],
  ["anima", "beige", "0012159", "800x800", 7, "800x800", "0007809_01.webp"],
  ["anima", "fango", "0006355", "1200x600", 14, "600x1200", "0006049_01.webp"],
  ["anima", "fango", "0012097", "800x800", 7, "800x800", "0012097_01.webp"],
  ["anima", "grigio", "0006356", "1200x600", 14, "600x1200", "0006050_01.webp"],
  ["anima", "grigio", "0012098", "800x800", 7, "800x800", "0007811_01.webp"],
  ["camouflage", "ecru-beton", "0016317", "1200x600", 12, "600x1200", "0016237_01.webp"],
  ["camouflage", "ecru-beton", "0016318", "600x600", 24, "600x600", "0018160_01.webp"],
  ["camouflage", "taupe-beton", "0014333", "1200x600", 12, "600x1200", "0014255_01.webp"],
  ["camouflage", "taupe-beton", "0014883", "600x600", 24, "600x600", "0018158_01.webp"],
  ["hermione", "beige", "0202268", "1200x300", 22, "300x1200", "0202268_01.webp"],
  ["hermione", "miel", "0202269", "1200x300", 22, "300x1200", "0202269_01.webp"],
  ["hermione", "noisette", "0202270", "1200x300", 22, "300x1200", "0202270_01.webp"],
  ["la-geoteca", "antracite", "0002934", "1200x600", 8, "600x1200", "0002934_01.webp"],
  ["la-geoteca", "brennero", "0014522", "1200x600", 12, "600x1200", "0014522_01.webp"],
  ["la-geoteca", "ceppo-di-gre", "0014525", "1200x600", 10, "600x1200", "0013117_01.webp"],
  ["la-geoteca", "limestone", "0014523", "1200x600", 7, "600x1200", "0010539_01.webp"],
  ["la-geoteca", "serena", "0014520", "1200x600", 12, "600x1200", "0014520_01.webp"],
  ["la-geoteca", "trav-ivory-vein", "0016184", "800x800", 6, "800x800", "0016184_01.webp"],
  ["make", "antr-corten", "g73054", "800x800", 4, "1000x1000", "g73054_01.webp"],
  ["make", "ash", "g73052", "800x800", 4, "1000x1000", "g73052_01.webp"],
  ["make", "grigio-corten", "g73055", "800x800", 4, "1000x1000", "g73055_01.webp"],
  ["orosei", "cream", "0030260", "600x600", 9, "1200x1200", "0030225_01.webp"],
  ["orosei", "cream", "0030271", "800x800", 9, "800x800", "0030231_01.webp"],
  ["orosei", "rope", "0030261", "600x600", 9, "1200x1200", "0030226_01.webp"],
  ["orosei", "rope", "0030272", "800x800", 9, "800x800", "0030232_01.webp"],
  ["orosei", "vanilla", "0030259", "600x600", 9, "1200x1200+600x600", "0030224_01.webp"],
  ["orosei", "vanilla", "0030270", "800x800", 9, "800x800", "0030230_01.webp"],
  ["pietra-viva", "aude-beige", "0014519", "600x600", 4, "1200x1200", "0012911_01.webp"],
  ["pietra-viva", "aude-grey", "0014518", "600x600", 4, "1200x1200", "0012908_01.webp"],
  ["storm", "grey", "0004280", "1200x600", 6, "600x1200", "0004280_01.webp"],
  ["storm", "grey", "0012102", "600x600", 12, "600x600", "0012102_01.webp"],
  ["storm", "sand", "0004281", "1200x600", 6, "600x1200", "0004281_01.webp"],
  ["storm", "sand", "0012101", "600x600", 12, "600x600", "0012101_01.webp"],
]);
// Each joins its colour's floor card as an R11 size (the card groups by name, look and colour family), but La Geoteca Antracite,
// a card of its own.
const outdoorCards = buildSurfaceMaterialProductGroups(
  physicalMaterials.filter(
    (material) =>
      material.surface_material.supplier === "gardenia_orchidea" && material.surface_material.surface_category === "flooring"
  ) as never
)
  .filter((group) => group.variants.some(isPleinAirOutdoor))
  .map((group) => [
    getSurfaceMaterialProductDisplayName(group.primary),
    group.variants.filter(isPleinAirOutdoor).map(getSurfaceMaterialSizeOptionLabel),
    group.variants.filter((variant) => !isPleinAirOutdoor(variant)).length,
  ]);
assert.deepEqual(outdoorCards, [
  ["Anima Beige", ["60x120 R11", "80x80 R11"], 4],
  ["Anima Fango", ["60x120 R11", "80x80 R11"], 2],
  ["Anima Grigio", ["60x120 R11", "80x80 R11"], 5],
  ["Camouflage Ecru Beton", ["60x120 R11", "60x60 R11"], 5],
  ["Camouflage Taupe Beton", ["60x120 R11", "60x60 R11"], 4],
  ["Hermione Beige", ["30x120 R11"], 1],
  ["Hermione Miel", ["30x120 R11"], 1],
  ["Hermione Noisette", ["30x120 R11"], 1],
  ["La Geoteca Antracite", ["60x120 R11"], 0],
  ["La Geoteca Brennero", ["60x120 R11"], 5],
  ["La Geoteca Ceppo Di Gre'", ["60x120 R11"], 4],
  ["La Geoteca Limestone", ["60x120 R11"], 5],
  ["La Geoteca Serena", ["60x120 R11"], 5],
  ["La Geoteca Trav Ivory Vein", ["80x80 R11"], 3],
  ["Make Antr Corten", ["80x80 R11"], 4],
  ["Make Ash", ["80x80 R11"], 4],
  ["Make Grigio Corten", ["80x80 R11"], 4],
  ["Orosei Cream", ["80x80 R11", "60x60 R11"], 7],
  ["Orosei Rope", ["80x80 R11", "60x60 R11"], 7],
  ["Orosei Vanilla", ["80x80 R11", "60x60 R11"], 7],
  ["Pietra Viva Aude Beige", ["60x60 R11"], 6],
  ["Pietra Viva Aude Grey", ["60x60 R11"], 5],
  ["Storm Grey", ["60x120 R11", "60x60 R11"], 4],
  ["Storm Sand", ["60x120 R11", "60x60 R11"], 4],
]);
// What the outdoor entries take from ABK's Plein Air pages: floor only, 20 mm, R11, outdoor; no configurator pattern ids; the layouts
// of the colour's (for Antracite, the collection's) other tiles or planks; no blocker but the price.
const configuratorLayouts = new Set(["la-geoteca", "make", "pietra-viva"]);
for (const entry of getAllSurfaceMaterialYamlEntries().filter(isPleinAirOutdoor)) {
  const id = entry.surface_material.material_id;
  const collection = outdoorRow(entry as never)[0] as string;
  assert.equal(entry.surface_material.surface_category, "flooring", `${id} is for floors`);
  assert.deepEqual(
    [entry.physical_specs.total_thickness_mm, entry.physical_specs.slip_rating, entry.physical_specs.suitable_for_outdoor],
    [20, "R11", true],
    `${id}: 20 mm, R11, outdoor`
  );
  assert.ok(entry.import_governance.qa_flags.includes("gardenia_abk_site_import"), `${id} is imported from ABK's pages`);
  assert.equal(entry.rendering.source_pattern_ids, undefined, `${id} has no configurator pattern ids`);
  assert.deepEqual(
    entry.rendering.available_pattern_layouts,
    collection === "hermione"
      ? ["random_stagger", "straight", "herringbone"]
      : configuratorLayouts.has(collection)
        ? ["straight", "vertical_brick"]
        : ["straight", "brick", "vertical_brick"],
    `${id} layouts`
  );
  assert.deepEqual(entry.import_governance.publish_blockers, ["confirm_price_per_sqm_or_quote_mode"], `${id} blockers`);
}
const pleinAirStandIns = [["0014519", "0012911"], ["0014518", "0012908"]] as const;

// Gardenia Plein Air (downloaded 13 Oct 2026): the outdoor range's eleven ranges of its own, a collection of their own (J, 13 Oct
// 2026: split, floor only), from ABK's pages like the collections above: 50 floor entries, 20 mm, R11, outdoor. Concept Stone, the
// twelfth range, has no pictures and is left out. Every size that can be checked is true to its label (crop test) but Urban Sand
// 60x60, whose pictures are the colour's 800x800 mm graphic squeezed to 600 mm (declared 800x800). Mineral's pages show each face
// again as another range's export (OUT.20 MONOLITH) and Greige's a lower-resolution cut (GREIGE): only the FUSION pictures are used.
// Repeats are used once: Salento's pages list each picture three times, Urban's 60x60 twice, byte for byte; Travertine Honey Vein's
// 60x90 picture 6 (NAVONA) is picture 7 exported again.
assert.equal(physicalMaterials.filter(isPleinAir).length, 50, "every Plein Air entry is on real faces");
assert.equal(SURFACE_MATERIAL_RENDER_REGISTRY.filter(isPleinAir).length, 50, "Plein Air entries in the catalogue");
assert.deepEqual(collectionCards(isPleinAir, "wall_tile"), [], "Plein Air is for floors only");
assert.deepEqual(
  collectionCards(isPleinAir, "flooring"),
  [
    ...["Belgian Stone Black", "Belgian Stone Grey", "Belgian Stone Sand"].map((c) => [c, ["80x80 R11", "60x60 R11"]]),
    ...["Legend Havana", "Legend Sand"].map((c) => [c, ["30x120 R11"]]),
    ...["Livingstone Cream", "Livingstone Light Grey", "Livingstone Sand"].map((c) => [c, ["80x80 R11"]]),
    ["Mineral Fog", ["60x120 R11", "60x60 R11"]],
    ["Mineral Graphite", ["60x120 R11"]],
    ...["Mineral Greige", "Mineral Sand"].map((c) => [c, ["60x120 R11", "60x60 R11"]]),
    ["Native Concrete", ["80x80 R11"]],
    ...["Native Mud", "Native Sand", "Native Silver"].map((c) => [c, ["80x80 R11", "60x60 R11"]]),
    ...["Nimbus Fog", "Nimbus Rope"].map((c) => [c, ["60x90 R11"]]),
    ...["Raye Honey", "Raye Sand"].map((c) => [c, ["30x120 R11"]]),
    ...["Salento Gris", "Salento Ivoire", "Salento Ocre"].map((c) => [c, ["60x120 R11", "80x80 R11", "60x60 R11"]]),
    ["Travertine Honey Cross", ["80x80 R11", "60x90 R11", "60x60 R11"]],
    ["Travertine Honey Vein", ["60x90 R11", "60x60 R11"]],
    ...["Urban Ash", "Urban Sand"].map((c) => [c, ["80x80 R11", "60x60 R11"]]),
    ...["Warehouse Ash", "Warehouse Graphite", "Warehouse Tan"].map((c) => [c, ["80x80 R11"]]),
  ].map(([colour, sizes]) => [`Plein Air ${colour}`, sizes])
);
const pleinAirRow = (colour: string, tile: string, n: number, code: string, face = tile) => {
  const [w, h] = tile.split("x").map(Number);
  return [colour, w >= h ? tile : `${h}x${w}`, n, face, `${code}_01.webp`];
};
assert.deepEqual(collectionFaceRows(isPleinAir), [
  pleinAirRow("belgian-stone-black", "600x600", 7, "0015169"),
  pleinAirRow("belgian-stone-black", "800x800", 7, "0012112"),
  pleinAirRow("belgian-stone-grey", "600x600", 7, "0014528"),
  pleinAirRow("belgian-stone-grey", "800x800", 7, "0012111"),
  pleinAirRow("belgian-stone-sand", "600x600", 7, "0014527"),
  pleinAirRow("belgian-stone-sand", "800x800", 7, "0012110"),
  pleinAirRow("legend-havana", "300x1200", 12, "0003691"),
  pleinAirRow("legend-sand", "300x1200", 12, "0003690"),
  pleinAirRow("livingstone-cream", "800x800", 5, "0020645"),
  pleinAirRow("livingstone-light-grey", "800x800", 5, "0020646"),
  pleinAirRow("livingstone-sand", "800x800", 5, "0020647"),
  pleinAirRow("mineral-fog", "600x1200", 6, "0001821"),
  pleinAirRow("mineral-fog", "600x600", 11, "0013511"),
  pleinAirRow("mineral-graphite", "600x1200", 6, "0001822"),
  pleinAirRow("mineral-greige", "600x1200", 6, "0001820"),
  pleinAirRow("mineral-greige", "600x600", 12, "0013512"),
  pleinAirRow("mineral-sand", "600x1200", 6, "0013514"),
  pleinAirRow("mineral-sand", "600x600", 12, "0013513"),
  pleinAirRow("native-concrete", "800x800", 3, "g56793"),
  pleinAirRow("native-mud", "600x600", 4, "0013509"),
  pleinAirRow("native-mud", "800x800", 4, "g56792"),
  pleinAirRow("native-sand", "600x600", 4, "0013508"),
  pleinAirRow("native-sand", "800x800", 4, "g56790"),
  pleinAirRow("native-silver", "600x600", 4, "0013507"),
  pleinAirRow("native-silver", "800x800", 4, "g56791"),
  pleinAirRow("nimbus-fog", "600x900", 9, "0007178"),
  pleinAirRow("nimbus-rope", "600x900", 9, "0007177"),
  pleinAirRow("raye-honey", "300x1200", 2, "0014949"),
  pleinAirRow("raye-sand", "300x1200", 2, "0014329"),
  pleinAirRow("salento-gris", "600x1200", 16, "0202335"),
  pleinAirRow("salento-gris", "600x600", 16, "0202323"),
  pleinAirRow("salento-gris", "800x800", 8, "0202326"),
  pleinAirRow("salento-ivoire", "600x1200", 16, "0202333"),
  pleinAirRow("salento-ivoire", "600x600", 16, "0202321"),
  pleinAirRow("salento-ivoire", "800x800", 8, "0202324"),
  pleinAirRow("salento-ocre", "600x1200", 15, "0202334"),
  pleinAirRow("salento-ocre", "600x600", 15, "0202322"),
  pleinAirRow("salento-ocre", "800x800", 8, "0202325"),
  pleinAirRow("travertine-honey-cross", "600x600", 9, "0012103"),
  pleinAirRow("travertine-honey-cross", "800x800", 6, "0012106"),
  pleinAirRow("travertine-honey-cross", "600x900", 9, "0007181"),
  pleinAirRow("travertine-honey-vein", "600x600", 8, "0012104"),
  pleinAirRow("travertine-honey-vein", "600x900", 9, "0007180"),
  pleinAirRow("urban-ash", "600x600", 12, "0012163"),
  pleinAirRow("urban-ash", "800x800", 8, "0012161"),
  pleinAirRow("urban-sand", "600x600", 12, "0012164", "800x800"),
  pleinAirRow("urban-sand", "800x800", 12, "0012162"),
  pleinAirRow("warehouse-ash", "800x800", 7, "0012107"),
  pleinAirRow("warehouse-graphite", "800x800", 7, "0012109"),
  pleinAirRow("warehouse-tan", "800x800", 2, "0012108"),
]);
// The repeats left out, as the manifests record them: Salento's pages list each picture three times (Ocre 60x120 one picture a
// fourth time too), Urban's 60x60 pages twice, Native Concrete's and Mineral Fog's 60x60 one picture twice, byte for byte; Travertine
// Honey Vein's 60x90 picture 6 is picture 7 exported again.
const pleinAirManifest = (colour: string) =>
  JSON.parse(
    readFileSync(
      path.join(process.cwd(), `catalog/surface-materials/flooring/gardenia/plein-air/gardenia-plein-air-${colour}-faces.manifest.json`),
      "utf8"
    )
  ) as { formats: { format: string; duplicates_dropped_site_positions?: number[]; duplicates_note?: string }[] };
const pleinAirDropped = (colour: string, format: string) =>
  pleinAirManifest(colour).formats.find((entry) => entry.format === format)?.duplicates_dropped_site_positions?.length ?? 0;
assert.deepEqual(
  [
    ["salento-gris", "60x120"], ["salento-gris", "80x80"], ["salento-ivoire", "60x120"], ["salento-ivoire", "80x80"],
    ["salento-ocre", "60x120"], ["salento-ocre", "60x60"], ["salento-ocre", "80x80"], ["urban-ash", "60x60"], ["urban-sand", "60x60"],
    ["native-concrete", "80x80"], ["mineral-fog", "60x60"], ["travertine-honey-vein", "60x90"],
  ].map(([colour, format]) => pleinAirDropped(colour, format)),
  [16, 16, 32, 16, 33, 1, 16, 12, 12, 1, 2, 1]
);
assert.match(
  pleinAirManifest("travertine-honey-vein").formats.find((entry) => entry.format === "60x90")?.duplicates_note ?? "",
  /picture 6 \(NAVONA\) is picture 7/
);
// Colour and look as ABK describes them; Mineral Sand (white and beige) and Native Mud (grey and beige) are filed by their pictures.
assert.deepEqual(
  [...new Set(physicalMaterials.filter(isPleinAir).map((material) =>
    `${/-plein-air-([a-z-]+?)-g?\d/.exec(material.surface_material.material_id)?.[1]}: ` +
    `${material.classification?.design_effect} ${material.classification?.color_family}`
  ))].sort(),
  [
    "belgian-stone-black: stone black", "belgian-stone-grey: stone grey", "belgian-stone-sand: stone beige",
    "legend-havana: wood beige", "legend-sand: wood beige",
    "livingstone-cream: stone beige", "livingstone-light-grey: stone grey", "livingstone-sand: stone beige",
    "mineral-fog: stone grey", "mineral-graphite: stone grey", "mineral-greige: stone grey", "mineral-sand: stone beige",
    "native-concrete: concrete grey", "native-mud: concrete grey", "native-sand: concrete beige", "native-silver: concrete grey",
    "nimbus-fog: stone grey", "nimbus-rope: stone beige", "raye-honey: wood beige", "raye-sand: wood beige",
    "salento-gris: stone grey", "salento-ivoire: stone white", "salento-ocre: stone beige",
    "travertine-honey-cross: stone beige", "travertine-honey-vein: stone beige",
    "urban-ash: concrete beige", "urban-sand: concrete beige",
    "warehouse-ash: concrete beige", "warehouse-graphite: concrete grey", "warehouse-tan: concrete beige",
  ]
);
// What the entries take from ABK's Plein Air pages: floor only, 20 mm, R11, outdoor (balcony among the rooms); no configurator pattern
// ids; planks for the wood ranges (Legend, Raye), tiles otherwise; no blocker but the price.
for (const entry of getAllSurfaceMaterialYamlEntries().filter(isPleinAir)) {
  const id = entry.surface_material.material_id;
  assert.equal(entry.surface_material.surface_category, "flooring", `${id} is for floors`);
  assert.deepEqual(
    [entry.physical_specs.total_thickness_mm, entry.physical_specs.slip_rating, entry.physical_specs.suitable_for_outdoor],
    [20, "R11", true],
    `${id}: 20 mm, R11, outdoor`
  );
  assert.ok(entry.classification.room_suitability.includes("balcony"), `${id} suits a balcony`);
  assert.ok(entry.import_governance.qa_flags.includes("gardenia_abk_site_import"), `${id} is imported from ABK's pages`);
  assert.ok(!entry.import_governance.qa_flags.includes("gardenia_plein_air_outdoor_size"), `${id} is not an outdoor size of another collection`);
  assert.equal(entry.rendering.source_pattern_ids, undefined, `${id} has no configurator pattern ids`);
  assert.deepEqual(
    entry.rendering.available_pattern_layouts,
    /-plein-air-(legend|raye)-/.test(id) ? ["random_stagger", "straight", "herringbone"] : ["straight", "brick", "vertical_brick"],
    `${id} layouts`
  );
  assert.deepEqual(entry.import_governance.publish_blockers, ["confirm_price_per_sqm_or_quote_mode"], `${id} blockers`);
}

// Floor entries share pictures only where declared above; every wall entry uses the faces of the
// floor entry with the same item code (Falaise Art Beige and Art Grey, and Bon Ton's 120x280 slabs,
// are wall-only).
const sharedFaces = new Map([
  ["0010147", "0010008"], ["0010148", "0010009"], ["g69332", "g69312"],
  ["0017583", "0017200"], ["0017586", "0017526"], ["0017716", "0017199"],
  ["0017717", "0017196"], ["0017767", "0017755"], ["0017768", "0017756"],
  ["0021155", "0021140"], ["0021156", "0021141"], ["0021157", "0021142"], ["0021158", "0021143"],
  ["0020765", "0020757"], ["0020767", "0020759"], ["0020768", "0020760"],
  ["0020775", "0020799"], ["0020777", "0020801"],
  // Pietra Viva: Antique 3D and R11 items on the Nat P.tech item's faces, and the stand-ins.
  ["0011974", "0012915"], ["0011973", "0012914"], ["0012254", "0012908"], ["0012258", "0012910"],
  ["0014184", "0014182"], ["0014183", "0014181"], ["0014188", "0014186"], ["0014187", "0014185"],
  ["0012322", "0012921"], ["0012318", "0012926"], ["0012324", "0012922"], ["0012319", "0012927"],
  ["0014325", "0014186"], ["0016099", "0014185"], ["0016100", "0014669"], ["0016102", "0014668"],
  ["0012293", "0012331"], ["0012332", "0012922"], ["0012260", "0012911"], ["0012267", "0012265"],
  ["0012266", "0012262"], ["0012912", "0011118"],
  // La Geoteca: R11 items on the Nat P.tech item's faces, and the stand-ins.
  ["0016026", "0016061"], ["0016027", "0016062"], ["0012085", "0012079"], ["0012086", "0012080"],
  ["0012083", "0012077"], ["0011775", "0010537"], ["0011776", "0010539"], ["0016136", "0017438"],
  ["0016138", "0017439"], ["0016137", "0012723"], ["0016139", "0012726"], ["0011738", "0014522"],
  ["0011735", "0014520"],
  // La Marmoteca: one set of faces per colour and size (above), and the stand-ins.
  ["0006902", "0006899"], ["0006903", "0006900"], ["0008677", "0008688"], ["0008678", "0008689"],
  ["0009158", "0008839"], ["0009167", "0009112"], ["0009170", "0009118"], ["0009722", "0009721"],
  ["0009725", "0009717"], ["0009726", "0009718"], ["0010391", "g27051"], ["0010396", "g27061"],
  ["0010601", "0010597"], ["0010602", "0010598"], ["0010673", "g27063"], ["0010674", "0017769"],
  ["0010675", "0017765"], ["0010680", "g27050"], ["0010681", "g27060"], ["0010684", "g27000"], ["0010687", "g27010"],
  ["0010690", "g27020"], ["0010995", "0010994"], ["0011000", "0011003"], ["0011497", "0011496"],
  ["0012068", "0012069"], ["0012245", "0012246"], ["0012247", "0012190"], ["0014457", "0014454"],
  ["0014463", "0017771"], ["0014464", "0017502"], ["0014467", "0017502"], ["0014471", "0017775"],
  ["0014472", "0017504"], ["0014475", "0017504"], ["0014616", "0014675"], ["0014678", "0014677"],
  ["0014679", "0014681"], ["0014711", "0014453"], ["0014712", "0017771"], ["0014713", "0017775"],
  ["g27052", "0006319"], ["g27055", "0010392"], ["g27057", "0017769"], ["g27062", "0006322"], ["g27065", "0010397"],
  ["g27067", "0017765"], ["g27071", "g27061"], ["g27075", "0010397"],
  // Orosei: Antique 3D items on the Natural item's faces.
  ["0021692", "0021733"], ["0021699", "0021738"], ["0021694", "0021735"], ["0021701", "0021740"],
  ["0021696", "0021737"], ["0021703", "0021742"], ["0021695", "0021736"], ["0021702", "0021741"],
  ["0021693", "0021734"], ["0021700", "0021739"],
  // Epoque 2.0: Lappato items on the Natural item's faces.
  ["0004299", "0004295"], ["0004311", "0004307"], ["0004301", "0004297"], ["0004298", "0004294"],
  ["0004310", "0004306"], ["0004300", "0004296"],
  // Block: R11 items on the Nat 3D item's faces, and the stand-ins on the colour's 120x120 Nat 3D faces.
  ["0031402", "0031174"], ["0031401", "0031173"], ["0031403", "0031175"], ["0031404", "0031176"],
  ...blockStandIns,
  // Eterea: Soft items on the Lux item's faces.
  ["0031333", "0030726"], ["0031341", "0030738"], ["0031336", "0030731"], ["0031344", "0030743"],
  ["0031335", "0030729"], ["0031343", "0030741"], ["0031334", "0030727"], ["0031342", "0030739"],
  // Pietra Viva Aude's outdoor 60x60 (Plein Air): the stand-ins on the colour's 120x120 Nat P.tech faces.
  ...pleinAirStandIns,
]);
const wallOnly = new Map([
  ["0010804", 8], ["0017607", 8],
  ["0020757", 3], ["0020758", 3], ["0020759", 3], ["0020760", 3], ["0020765", 3], ["0020767", 3], ["0020768", 3],
  // Pietra Viva's Nat P.tech 80x80 and Camargue 60x120 items are wall-only; their floor entries are R11.
  ["0012265", 8], ["0012262", 8], ["0014186", 18], ["0014185", 18], ["0014669", 16], ["0014668", 16], ["0012331", 12],
  // Gioia's plain colours, Martinica and Primavera are wall-only.
  ...["0008228", "0008230", "0008232", "0008233", "0008234", "0008235", "0009646", "0009647", "0009648", "0009655", "0010527"].map(
    (code) => [code, 1] as const
  ),
  // La Marmoteca Sand Flower 60x120 Lux is wall-only; its floor entry is the Nat P.tech one, on the same faces.
  ["0012069", 12],
]);
const collectionById = new Map(
  physicalMaterials
    .filter((material) =>
      [
        isDorica, isOxide, isFalaise, isMake, isTabulae, isBonTon, isPietraViva, isLaGeoteca, isOrosei, isGioia, isIPigmenti,
        isLaMarmoteca, isHermione, isConcreaPlain, isJustNature, isLuce, isStorm, isEpoque, isCamouflage, isBlock, isEterea,
        isPleinAir,
      ].some((filter) => filter(material))
    )
    .map((material) => [material.surface_material.material_id, material])
);
for (const material of collectionById.values()) {
  const id = material.surface_material.material_id;
  const code = itemCode(id);
  const firstFace = material.texture_assets.faces?.[0]?.url.split("/").pop() ?? "";
  assert.ok(firstFace.startsWith(`${sharedFaces.get(code) ?? code}_`), `${id} draws ${sharedFaces.get(code) ?? code}'s faces`);
  if (material.surface_material.surface_category !== "wall_tile" || wallOnly.has(code)) continue;
  const floor = [...collectionById.values()].find(
    (other) => other.surface_material.surface_category === "flooring" && itemCode(other.surface_material.material_id) === code
  );
  assert.ok(floor, `${id} has a floor entry with item ${code}`);
  assert.deepEqual(material.texture_assets.faces, floor.texture_assets.faces, `${id} uses the floor entry's faces`);
}
for (const [code, faceCount] of wallOnly) {
  const entries = [...collectionById.values()].filter((material) => itemCode(material.surface_material.material_id) === code);
  assert.deepEqual(
    entries.map((material) => [material.surface_material.surface_category, material.texture_assets.faces?.length]),
    [["wall_tile", faceCount]],
    `${code} is a wall-only item with ${faceCount} faces`
  );
}

// Entries with no picture of their own on ABK's download area, as the admin audit page lists them (J, 12 Oct 2026): each
// stand-in carries the qa flag stand_in_faces and draws the faces named above; the others keep the configurator's preview.
// docs/architecture/surface-material-tile-faces.md keeps the same record, with the sizes left out of the catalogue.
const earlierStandIns = [
  // La Marmoteca: Soft at 120x120 and 60x120, Grey Wonder 120x120 Soft 3D, and the two 40x120 sizes.
  "0010680", "0010681", "0014712", "0014713", "0010687", "0010690", "0014467", "0014475", "0010674", "0010675", "0014678",
  "g27071", "g27075",
  // Pietra Viva and La Geoteca.
  "0012260", "0012267", "0012266", "0012912", "0011738", "0011735",
];
const noOwnPictures = [...collectNoOwnPictures(getAllSurfaceMaterialYamlEntries())].map(([filePath, noOwnPicture]) => ({
  code: itemCode(path.basename(path.dirname(filePath))),
  ...noOwnPicture,
}));
const listedStandIns = noOwnPictures.filter((entry) => entry.source === "stand_in");
assert.deepEqual(
  [...new Set(listedStandIns.map((entry) => entry.code))].sort(),
  [...earlierStandIns, ...blockStandIns.map(([code]) => code), ...pleinAirStandIns.map(([code]) => code)].sort(),
  "every stand-in carries stand_in_faces"
);
for (const entry of listedStandIns) {
  assert.equal(entry.facesOf, sharedFaces.get(entry.code), `stand-in ${entry.code} names the item whose faces it draws`);
}
assert.deepEqual(
  [listedStandIns.length, noOwnPictures.filter((entry) => entry.source === "configurator_preview").length],
  [60, 52],
  "29 stand-in items for floor and wall, Aude's two outdoor 60x60 for floors, and 26 items on the configurator's preview"
);

// Runtime tuples: the trailing fields round-trip, and tuples without them decode without the keys.
const baseTuple = PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES.find((tuple) => tuple.length === 31);
assert.ok(baseTuple);
assert.equal(baseTuple.length, 31, "existing tuples must not gain trailing fields");
const decodedBase = decodeSurfaceMaterialRenderTuple(baseTuple);
assert.ok(!("faces" in decodedBase.texture_assets));
assert.ok(!("image_physical_size_mm" in decodedBase.texture_assets));
const tupleWithFaces = [...baseTuple, { width: 1200, height: 2400 }, faces] as unknown as SurfaceMaterialRenderTuple;
const decodedWithFaces = decodeSurfaceMaterialRenderTuple(tupleWithFaces);
assert.deepEqual(decodedWithFaces.texture_assets.faces, faces);
assert.deepEqual(decodedWithFaces.texture_assets.image_physical_size_mm, { width: 1200, height: 2400 });

// Render data: numbered faces of one size are written as a run, and every run expands to
// exactly the faces its catalogue YAML declares (same pictures, order and sizes).
const decodedRun = decodeSurfaceMaterialRenderTuple([
  ...baseTuple,
  { width: 600, height: 1200 },
  ["/assets/a_", 2, 600, 1200],
] as unknown as SurfaceMaterialRenderTuple);
assert.deepEqual(decodedRun.texture_assets.faces, faces, "a run decodes to the full face list");
assert.deepEqual(compactSurfaceTextureFaces(faces), ["/assets/a_", 2, 600, 1200]);
assert.deepEqual(expandSurfaceTextureFaces(faces), faces, "a full list passes through unchanged");
const notRuns = [
  [{ url: "/assets/a_02.webp", width_mm: 600, height_mm: 1200 }],
  [faces[0], { url: "/assets/a_03.webp", width_mm: 600, height_mm: 1200 }],
  [faces[0], { url: "/assets/b_02.webp", width_mm: 600, height_mm: 1200 }],
  [faces[0], { ...faces[1], width_mm: 1200 }],
  [faces[0], { url: "/assets/a_02.jpg", width_mm: 600, height_mm: 1200 }],
  [{ ...faces[0], extra: true } as (typeof faces)[number]],
  [],
];
for (const list of notRuns) {
  assert.equal(compactSurfaceTextureFaces(list), null, `not a run: ${JSON.stringify(list)}`);
}
const yamlFaces = getAllSurfaceMaterialYamlEntries().filter((entry) => entry.texture_assets.faces?.length);
const runTuples = PRODUCTION_SURFACE_MATERIAL_RENDER_TUPLES.filter(
  (tuple) => tuple[32] && typeof tuple[32][0] === "string"
);
const runnableFaces = yamlFaces.filter((entry) => compactSurfaceTextureFaces(entry.texture_assets.faces ?? []));
assert.equal(runTuples.length, runnableFaces.length, "every numbered face list of one size is written as a run");
assert.ok(runnableFaces.length > 0, "the catalogue has face lists written as runs");
for (const entry of yamlFaces) {
  const id = entry.surface_material.material_id;
  assert.deepEqual(
    getRuntimeSurfaceMaterialById(id)?.texture_assets.faces,
    entry.texture_assets.faces,
    `${id} decodes to its YAML faces`
  );
}

// Import gate: a face smaller than the tile it is sold as fails.
const templateSource = getAllSurfaceMaterialYamlEntries().find((entry) => entry.surface_material.supplier !== "florim");
const template = JSON.parse(JSON.stringify(templateSource)) as SurfaceMaterial;
template.physical_specs.plank_or_tile_format = "tile";
template.physical_specs.tile_width_mm = 600;
template.physical_specs.tile_length_mm = 1200;
template.texture_assets.faces = faces;
assert.deepEqual(getSurfacePhysicalAssetFailures(template), []);
template.physical_specs.tile_width_mm = 1200;
template.physical_specs.tile_length_mm = 600;
assert.deepEqual(getSurfacePhysicalAssetFailures(template), [], "a face may be turned to cover the tile");
template.physical_specs.tile_width_mm = 1200;
template.physical_specs.tile_length_mm = 2400;
assert.equal(getSurfacePhysicalAssetFailures(template).length, 2, "both faces are smaller than a 1200x2400 tile");
template.texture_assets.faces = [];
assert.equal(getSurfacePhysicalAssetFailures(template).length, 1);
template.texture_assets.faces = null;
template.texture_assets.image_physical_size_mm = { width: 0, height: 600 };
assert.equal(getSurfacePhysicalAssetFailures(template).length, 1);

console.log("Surface material physical-scale sampling passed.");
