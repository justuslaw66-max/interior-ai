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
const onAbkFaces = [isAnima, isDorica, isOxide, isFalaise, isMake];
assert.ok(
  physicalMaterials.every(
    (material) => material.surface_material.supplier === "florim" || onAbkFaces.some((filter) => filter(material))
  ),
  "only the Florim materials and Gardenia Anima, Dorica, Oxide, Falaise and Make declare physical-scale data"
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
  // are dropped); no size has fewer.
  assert.ok(sources.length >= 3, `${id} has at least three faces`);
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
// Three of Oxide Aluminum's 80x80 pictures are its 120x120 graphic and are declared 1200x1200 mm.
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
      /-(?:dorica|oxide|falaise|make)-([a-z-]+?)-(?:g|\d)/.exec(material.surface_material.material_id)?.[1],
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
  ["alluminum", "800x800", 6, "1200x1200+800x800", "g69330_01.webp"],
  ["brass", "1200x1200", 6, "1200x1200", "g69314_01.webp"],
  ["brass", "1200x600", 10, "600x1200", "g69324_01.webp"],
  ["brass", "2800x1200", 3, "1200x2800", "g69304_01.webp"],
  ["brass", "800x800", 7, "800x800", "g69334_01.webp"],
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

// Floor entries share pictures only where declared above; every wall entry uses the faces of the
// floor entry with the same item code (Falaise Art Beige and Art Grey are wall-only).
const sharedFaces = new Map([
  ["0010147", "0010008"], ["0010148", "0010009"], ["g69332", "g69312"],
  ["0017583", "0017200"], ["0017586", "0017526"], ["0017716", "0017199"],
  ["0017717", "0017196"], ["0017767", "0017755"], ["0017768", "0017756"],
]);
const wallOnly = new Set(["0010804", "0017607"]);
// Make's ids carry ABK's zero-padded code (g0073022); its faces drop the zeros (g73022_nn).
const itemCode = (id: string) => (/-((?:g|pf)?\d{5,7})-\d+x\d+/.exec(id)?.[1] ?? "?").replace(/^g0+/, "g");
const collectionById = new Map(
  physicalMaterials
    .filter((material) => [isDorica, isOxide, isFalaise, isMake].some((filter) => filter(material)))
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
for (const code of wallOnly) {
  const entries = [...collectionById.values()].filter((material) => itemCode(material.surface_material.material_id) === code);
  assert.deepEqual(
    entries.map((material) => [material.surface_material.surface_category, material.texture_assets.faces?.length]),
    [["wall_tile", 8]],
    `${code} is a wall-only Falaise Art item with eight faces`
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
