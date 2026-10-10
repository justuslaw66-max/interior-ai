import assert from "node:assert/strict";
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
} from "../components/editor/design-controls-plan/surfaceCatalog";
import { getAllSurfaceMaterialYamlEntries } from "../lib/surface-material-yaml";
import type { SurfaceMaterial } from "../lib/surface-material-schema";
import type { SurfaceMaterialRenderTuple } from "../lib/surface-material-runtime-types";

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
const isAnima = (material: { surface_material: { material_id: string } }) =>
  /^gardenia-(flooring|wall-tile)-anima-/.test(material.surface_material.material_id);
const isGardeniaCollection = (collection: string) => (material: { surface_material: { material_id: string } }) =>
  new RegExp(`^gardenia-(flooring|wall-tile)-${collection}-`).test(material.surface_material.material_id);
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
const onAbkFaces = [
  isAnima, isDorica, isOxide, isFalaise, isMake, isTabulae, isBonTon, isPietraViva, isLaGeoteca, isOrosei, isGioia, isIPigmenti,
  isLaMarmoteca,
];
assert.ok(
  physicalMaterials.every(
    (material) => material.surface_material.supplier === "florim" || onAbkFaces.some((filter) => filter(material))
  ),
  "only the Florim materials and Gardenia Anima, Dorica, Oxide, Falaise, Make, Tabulae, Bon Ton, Pietra Viva, La Geoteca, " +
    "Orosei, Gioia, I Pigmenti and La Marmoteca declare physical-scale data"
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
  // are dropped) and two for most Pietra Viva and La Geoteca 120x280 slabs; Bon Ton's decors (Network,
  // Octagon, Tricot), La Geoteca's Plissè decors, every Gioia colour, and I Pigmenti's 120x280 slabs and
  // decors (Crocini, Pillole, Rattan) have a single face.
  const singleFace = /-bon-ton-(network|octagon|tricot)-|-la-geoteca-dec-|-gioia-|-i-pigmenti-(crocini|pillole|rattan|.+-120x280)-/;
  const minimumFaces = singleFace.test(id)
    ? 1
    : /-(pietra-viva|la-geoteca)-.+-120x280-/.test(id)
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
      /-(?:dorica|oxide|falaise|make|tabulae|bon-ton|pietra-viva|la-geoteca|orosei|gioia|i-pigmenti|la-marmoteca)-([a-z-]+?)-(?:g\d|pf|\d)/.exec(
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
// Make's ids carry ABK's zero-padded code (g0073022), its faces drop the zeros (g73022_nn); Tabulae's
// and Bon Ton's carry pf6 before the code (pf60021141 -> 0021141_nn), and 23,4 is written 23-4.
// Gioia's decors carry an eight-digit code (00202274 -> 0202274_nn).
const itemCode = (id: string) =>
  (/-((?:g|pf)?\d{5,10})-\d+(?:-\d+)?x\d+/.exec(id)?.[1] ?? "?")
    .replace(/^g0+/, "g")
    .replace(/^pf6/, "")
    .replace(/^0(\d{7})$/, "$1");
const collectionById = new Map(
  physicalMaterials
    .filter((material) =>
      [
        isDorica, isOxide, isFalaise, isMake, isTabulae, isBonTon, isPietraViva, isLaGeoteca, isOrosei, isGioia, isIPigmenti,
        isLaMarmoteca,
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
