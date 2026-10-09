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
const onAbkFaces = [isAnima, isDorica, isOxide, isFalaise, isMake, isTabulae, isBonTon, isPietraViva, isLaGeoteca];
assert.ok(
  physicalMaterials.every(
    (material) => material.surface_material.supplier === "florim" || onAbkFaces.some((filter) => filter(material))
  ),
  "only the Florim materials and Gardenia Anima, Dorica, Oxide, Falaise, Make, Tabulae, Bon Ton, Pietra Viva and La Geoteca " +
    "declare physical-scale data"
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
  // Octagon, Tricot) and La Geoteca's Plissè decors have a single face.
  const minimumFaces = /-bon-ton-(network|octagon|tricot)-|-la-geoteca-dec-/.test(id)
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
      /-(?:dorica|oxide|falaise|make|tabulae|bon-ton|pietra-viva|la-geoteca)-([a-z-]+?)-(?:g\d|pf|\d)/.exec(
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
]);
const wallOnly = new Map([
  ["0010804", 8], ["0017607", 8],
  ["0020757", 3], ["0020758", 3], ["0020759", 3], ["0020760", 3], ["0020765", 3], ["0020767", 3], ["0020768", 3],
  // Pietra Viva's Nat P.tech 80x80 and Camargue 60x120 items are wall-only; their floor entries are R11.
  ["0012265", 8], ["0012262", 8], ["0014186", 18], ["0014185", 18], ["0014669", 16], ["0014668", 16], ["0012331", 12],
]);
// Make's ids carry ABK's zero-padded code (g0073022), its faces drop the zeros (g73022_nn); Tabulae's
// and Bon Ton's carry pf6 before the code (pf60021141 -> 0021141_nn), and 23,4 is written 23-4.
const itemCode = (id: string) =>
  (/-((?:g|pf)?\d{5,10})-\d+(?:-\d+)?x\d+/.exec(id)?.[1] ?? "?").replace(/^g0+/, "g").replace(/^pf6/, "");
const collectionById = new Map(
  physicalMaterials
    .filter((material) =>
      [isDorica, isOxide, isFalaise, isMake, isTabulae, isBonTon, isPietraViva, isLaGeoteca].some((filter) => filter(material))
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
