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
assert.ok(
  physicalMaterials.every((material) => material.surface_material.supplier === "florim" || isAnima(material)),
  "only the Florim materials and Gardenia Anima declare physical-scale data"
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
  assert.ok(sources.length >= 4, `${id} has at least four faces`);
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
assert.equal(runTuples.length, yamlFaces.length, "every catalogue face list is written as a run");
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
