import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  auditSurfaceMaterialEntry,
  buildSurfaceMaterialAdminAuditSummaries,
  getRelativeSurfaceMaterialPath,
  runSurfaceMaterialAudit,
} from "../lib/surface-material-audit";
import { getAllSurfaceMaterialYamlEntries } from "../lib/surface-material-yaml";
import {
  getAllSurfaceMaterialSourceEntries,
  getLaminateWallPanelSourceEntries,
} from "../lib/surface-material-sources";
import { SURFACE_MATERIAL_VOCABULARY, type SurfaceMaterial } from "../lib/surface-material-schema";
import {
  getDraftFlooringMaterialsForAdmin,
  getFlooringMaterials,
  getPublishedFlooringMaterials,
  getSurfaceMaterialById,
} from "../lib/catalog-registry";
import {
  buildCheckoutReadinessRows,
  buildSurfaceMaterialCsvRows,
} from "../lib/share-shopping-csv";
import { buildRoomSurfaceMaterialBomRows } from "../lib/surface-material-bom";
import {
  buildSurfaceRoomSummaries,
  buildSurfaceSummaryRows,
  getActiveSurfaceRoomFloorAreaSqm,
} from "../components/editor/design-controls-plan/surfaceSummaryRows";
import { mapPlanOpeningsToRoomRenderer } from "../lib/design-page-plan-overlays";
import { buildOpeningWallSurfacePanels } from "../components/editor/renderers/house-plan-3d/openingWallSurfacePanels";
import { getContinuousWallPanelId } from "../components/editor/renderers/house-plan-3d/continuousWallSelection";
import {
  buildWallSurfacePanels,
  getWallInteriorSurfaceSide,
  getWallOpenings,
  getWallSegments,
  joinedLegacyWallSurfacePart,
} from "../components/editor/renderers/house-plan-3d/geometry";
import { getWallSurfacePartStartAlongFace } from "../components/editor/renderers/house-plan-3d/wallSurfaceLayout";
import { wallSurfaceLayout } from "../components/editor/renderers/canonical-floor-plan/geometry";
import {
  SURFACE_MATERIAL_RENDER_REGISTRY,
  getRuntimeSurfaceMaterialById,
} from "../lib/surface-material-runtime";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "../lib/floor-materials";
import {
  DEFAULT_FLOOR_JOINT_COLOR,
  DEFAULT_FLOOR_JOINT_SIZE_MM,
  DEFAULT_FLOOR_PATTERN_OFFSET,
  getFloorPatternLabel,
  getWallFaceSurfaceSettings,
  getWallPanelSurfaceSettings,
  normalizeFloorPattern,
  normalizeFloorSurfaceSettings,
  replaceAllWallSurfaceSettings,
} from "../lib/surface-settings";
import {
  getCompatibleFloorPatternForMaterial,
  getDefaultWallJoint,
  getFlooringInspectorPatternOptions,
  getSurfaceJointLabel,
  surfaceMaterialHasJoints,
} from "../lib/design-page-surface-inspector";
import { CABINET_LAMINATE_COLLECTIONS } from "../lib/generated/cabinet-laminates.generated";
import { getLaminateFlatPictureUrl } from "../lib/laminate-flat-pictures";
import { getLaminateCollectionSourcePath } from "../lib/laminate-wall-panel-materials";
import {
  buildFlatColourPng,
  buildLaminateFlatPictures,
  LAMINATE_FLAT_PICTURE_DIRECTORY,
} from "./generate-laminate-flat-pictures";
import { LAMINATE_SURFACE_BY_CATEGORY } from "../lib/laminate-surface-finish";
import { getSurfacePhysicalAssetFailures } from "../lib/surface-material-physical-sampling";
import { getSurfaceTileColumns, getSurfaceTileRows } from "../components/editor/renderers/surfaceTileRows";
import {
  NIPPON_WALL_PAINT_COLOUR_COUNT,
  WALL_PAINT_SWATCHES,
  createNipponWallPaintSwatches,
  getWallPaintDisplayName,
  getWallPaintSwatchById,
  getWallPaintSwatchLabel,
  getWallPaintSwatchSearchText,
  normalizeWallPaintColorHex,
} from "../lib/wall-paint";
import { NIPPON_PAINT_COLOURS } from "../lib/nippon-paint-colours";
import {
  PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA,
} from "../lib/generated/surface-material-catalog.generated";
import {
  TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY,
} from "../tests/fixtures/surface-material-runtime.generated";
import type { DesignSnapshot, RoomSnapshot } from "../lib/room-types";
import {
  sanitizeStoredDesign,
  snapshotToStored,
  storedToSnapshot,
} from "../lib/room-persistence";
import { resolveSurfaceTextureRepeat } from "../lib/surface-material-texture-repeat";
import { buildHousePlan2D } from "../lib/design-page-house-plan";
import {
  getHerringboneBasisVectorsForTest,
  getHerringbonePlankSizeForTest,
  getHerringboneTileLocalForTest,
  getHerringbonePlankVariationSeedForTest,
} from "../components/editor/renderers/surfaceHerringbonePainter";
import {
  getChevronFaceIndex,
  getChevronLayout,
  getChevronPieceLocal,
  getSurfaceMaterialChevronFailures,
  paintChevronPixels,
} from "../lib/surface-chevron-layout";
import {
  getContinuousPatternRepeatSizeForTest,
  getContinuousPatternSourceRectForTest,
  getSurfaceJointSizePxForTest,
  getSurfacePatternColumnOffsetForTest,
  getSurfacePatternRowOffsetForTest,
  shouldUseContinuousPatternSourceForTest,
  shouldRotateTileSourceQuarterTurnForTest,
} from "../components/editor/renderers/useSurfaceMaterialTexture";
import { getWallInteriorSurfaceSideForTest } from "../components/editor/renderers/HousePlanRenderer3D";

const result = runSurfaceMaterialAudit();
const entries = getAllSurfaceMaterialYamlEntries();
const adminSummaries = buildSurfaceMaterialAdminAuditSummaries();

function cloneSurfaceMaterial(entry: SurfaceMaterial): SurfaceMaterial {
  return JSON.parse(JSON.stringify(entry)) as SurfaceMaterial;
}

function buildValidPublishedFixture(source: SurfaceMaterial): SurfaceMaterial {
  const entry = cloneSurfaceMaterial(source);
  entry.surface_material.material_id = "test-published-flooring";
  entry.surface_material.slug = "test-published-flooring";
  entry.surface_material.product_name = "Test Published Flooring";
  entry.source.license_status = "confirmed";
  entry.source.notes = [];
  entry.source.sample_request_url = "https://example.com/request-sample";
  entry.texture_assets.swatch_url = "/assets/test/surface-materials/test-swatch.png";
  entry.texture_assets.base_color_url = "/assets/test/surface-materials/test-base-color.png";
  entry.texture_assets.tileable = true;
  entry.texture_assets.texture_repeat_size_cm = { width: 100, height: 100 };
  entry.physical_specs.plank_or_tile_format = "plank";
  entry.physical_specs.plank_width_mm = 180;
  entry.physical_specs.plank_length_mm = 1200;
  entry.physical_specs.total_thickness_mm = 5;
  entry.physical_specs.wear_layer_mm = 0.3;
  entry.commerce.sample_available = true;
  entry.commerce.sample_request_url = "https://example.com/request-sample";
  entry.import_governance.publish_status = "published";
  entry.import_governance.publish_blockers = [];
  return entry;
}

function findRuntimeMaterialFixture(materialId: string) {
  const material = SURFACE_MATERIAL_RENDER_REGISTRY.find(
    (entry) => entry.surface_material.material_id === materialId
  );
  assert.ok(material, `expected runtime surface material ${materialId}`);
  return material;
}

function assertClose(actual: number, expected: number, message: string): void {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${message}: expected ${expected}, got ${actual}`);
}

assert.equal(
  getSurfacePatternRowOffsetForTest({ pattern: "straight", row: 3, tileWidthPx: 120 }),
  0,
  "straight tile rows must align without random sliver offsets"
);
assert.equal(
  getSurfacePatternRowOffsetForTest({ pattern: "grid", row: 3, tileWidthPx: 120 }),
  0,
  "grid tile rows must align without random sliver offsets"
);
assert.equal(
  getSurfacePatternRowOffsetForTest({ pattern: "checker", row: 3, tileWidthPx: 120 }),
  0,
  "checker tile rows must align without random sliver offsets"
);
assert.equal(
  getSurfacePatternRowOffsetForTest({ pattern: "brick", row: 1, tileWidthPx: 120 }),
  60,
  "brick tile rows should use a predictable half-tile offset"
);
assert.equal(
  getSurfacePatternRowOffsetForTest({ pattern: "random_stagger", row: 1, tileWidthPx: 100 }),
  42,
  "random stagger rows should use a deterministic non-half offset"
);
assert.equal(
  getSurfacePatternRowOffsetForTest({ pattern: "random_stagger", row: 2, tileWidthPx: 100 }),
  18,
  "random stagger rows should vary between rows without changing on every render"
);
assert.equal(
  getSurfacePatternColumnOffsetForTest({ pattern: "vertical_brick", column: 1, tileHeightPx: 120 }),
  60,
  "vertical brick tile columns should use a predictable half-tile offset"
);
assert.deepEqual(
  getHerringbonePlankSizeForTest({ tileWidthPx: 120, tileHeightPx: 120 }),
  { width: 60, length: 120 },
  "square herringbone tiles should render as 1:2 planks instead of diagonal square slabs"
);
assert.deepEqual(
  getHerringbonePlankSizeForTest({ tileWidthPx: 60, tileHeightPx: 120 }),
  { width: 60, length: 120 },
  "rectangular herringbone tiles should keep their physical 1:2 format"
);
assert.deepEqual(
  getHerringbonePlankSizeForTest({ tileWidthPx: 120, tileHeightPx: 20 }),
  { width: 20, length: 120 },
  "Gardenia 20x120 herringbone tiles should keep their physical 1:6 format"
);
assert.deepEqual(
  getHerringboneBasisVectorsForTest({ plankWidthPx: 20, plankLengthPx: 120 }),
  {
    x: { x: 20, y: -120 },
    y: { x: 20, y: 120 },
  },
  "Gardenia Spina_01 herringbone should use diagonal basis vectors instead of row stepping"
);
assert.deepEqual(
  getHerringboneTileLocalForTest({ xPx: 10, yPx: 10, plankWidthPx: 20, plankLengthPx: 120 }),
  { localX: 10, localY: 10, orientation: "horizontal", aspectRatio: 6 },
  "Gardenia 20x120 herringbone should start as a horizontal 1:6 plank"
);
assert.deepEqual(
  getHerringboneTileLocalForTest({ xPx: 130, yPx: 10, plankWidthPx: 20, plankLengthPx: 120 }),
  { localX: 110, localY: 10, orientation: "vertical", aspectRatio: 6 },
  "Gardenia 20x120 herringbone should turn into a vertical plank at the herringbone corner"
);
assert.deepEqual(
  getHerringboneTileLocalForTest({ xPx: 130, yPx: 30, plankWidthPx: 20, plankLengthPx: 120 }),
  { localX: 110, localY: 10, orientation: "horizontal", aspectRatio: 6 },
  "Gardenia 20x120 herringbone should step diagonally between horizontal and vertical planks"
);
assert.equal(
  getHerringbonePlankVariationSeedForTest({
    xPx: 10,
    yPx: 10,
    plankWidthPx: 20,
    plankLengthPx: 120,
    seedBase: 123,
  }),
  getHerringbonePlankVariationSeedForTest({
    xPx: 90,
    yPx: 10,
    plankWidthPx: 20,
    plankLengthPx: 120,
    seedBase: 123,
  }),
  "Gardenia herringbone should keep one stable texture crop within a single plank"
);
assert.notEqual(
  getHerringbonePlankVariationSeedForTest({
    xPx: 10,
    yPx: 10,
    plankWidthPx: 20,
    plankLengthPx: 120,
    seedBase: 123,
  }),
  getHerringbonePlankVariationSeedForTest({
    xPx: 130,
    yPx: 10,
    plankWidthPx: 20,
    plankLengthPx: 120,
    seedBase: 123,
  }),
  "Gardenia herringbone should vary texture crops between neighboring planks"
);

// Chevron (16 Oct 2026, Tabulae's 15x85 pieces): parallelogram pieces with slanted end cuts, laid in bands that lean
// alternately and meet end to end on straight band lines. Units are millimetres here.
const tabulaeChevron = getChevronLayout({ pieceWidth: 150, pieceLength: 850, endOffset: 70.7 });
assert.ok(tabulaeChevron, "Tabulae's piece makes a chevron layout");
assert.deepEqual(
  [Math.round(tabulaeChevron.bandHeight * 10) / 10, Math.round(tabulaeChevron.pitch * 10) / 10, Math.round(Math.atan(tabulaeChevron.lean) * 1800 / Math.PI) / 10],
  [704.9, 165.8, 25.2],
  "Tabulae's chevron: bands 705 mm apart, pieces 166 mm apart along a band line, leaning 25 degrees"
);
assert.equal(getChevronLayout({ pieceWidth: 150, pieceLength: 850, endOffset: 0 }), null, "a chevron needs slanted ends");
assert.equal(getChevronLayout({ pieceWidth: 150, pieceLength: 60, endOffset: 70.7 }), null, "the end cuts must fit the piece");
const roundLocal = (x: number, y: number) => {
  const local = getChevronPieceLocal(tabulaeChevron, x, y);
  return [local.band, local.piece, Math.round(local.across * 10) / 10, Math.round(local.along * 10) / 10, Math.round(local.edgeDistance * 10) / 10];
};
const chevronShift = tabulaeChevron.bandHeight * tabulaeChevron.lean;
const tiny = 1e-6;
assert.deepEqual(roundLocal(tiny, tiny), [0, 0, 150, 0, 0], "a band line's piece corner is the face's top-right corner");
assert.deepEqual(
  roundLocal(tabulaeChevron.pitch - tiny, tiny).slice(0, 4),
  [0, 0, 0, 70.7],
  "along the band line the cut runs to the face's left edge, 70.7 mm down"
);
assert.deepEqual(
  roundLocal(chevronShift + tiny, tabulaeChevron.bandHeight - tiny).slice(0, 4),
  [0, 0, 150, 779.3],
  "the far band line meets the face's long right edge at its end"
);
assert.deepEqual(
  roundLocal(chevronShift + tabulaeChevron.pitch - tiny, tabulaeChevron.bandHeight - tiny).slice(0, 4),
  [0, 0, 0, 850],
  "and the far tip"
);
assert.deepEqual(
  [roundLocal(400, 704.8).slice(0, 2), roundLocal(400, 705.0).slice(0, 2)],
  [[0, 0], [1, 0]],
  "neighbouring bands meet end to end: the same piece number on both sides of the band line"
);
assert.equal(getChevronPieceLocal(tabulaeChevron, 400, 704.8).along > 779, true, "piece ends meet at the band line");
assert.equal(getChevronPieceLocal(tabulaeChevron, 400, 705.0).along > 779, true, "from both bands");
assert.deepEqual(roundLocal(80, 300)[4], Math.round(Math.min(roundLocal(80, 300)[2], 150 - roundLocal(80, 300)[2], 300, 404.9) * 10) / 10, "edge distance");
const chevronFacesAlongBand = Array.from({ length: 30 }, (_, piece) => getChevronFaceIndex({ seed: 9, band: 2, piece, faceCount: 30 }));
assert.equal(new Set(chevronFacesAlongBand).size, 30, "a band runs through every face before repeating one");
assert.equal(getChevronFaceIndex({ seed: 9, band: 2, piece: 31, faceCount: 30 }), chevronFacesAlongBand[1], "then repeats its order");
assert.notDeepEqual(
  chevronFacesAlongBand,
  Array.from({ length: 30 }, (_, piece) => getChevronFaceIndex({ seed: 9, band: 3, piece, faceCount: 30 })),
  "each band has its own order"
);
{
  // Two faces, red and blue, painted 10 px per piece width with a 1 px joint each side: every piece shows one face,
  // the joint colour runs along every edge, and the band line's both sides are pieces, not gaps.
  const layout = getChevronLayout({ pieceWidth: 10, pieceLength: 56.7, endOffset: 4.71 })!;
  const face = (rgb: [number, number, number]) => ({ data: new Uint8ClampedArray(Array.from({ length: 4 * 4 }, (_, i) => (i % 4 === 3 ? 255 : rgb[i % 4]))), width: 2, height: 2 });
  const output = new Uint8ClampedArray(120 * 100 * 4);
  paintChevronPixels({ output, width: 120, height: 100, layout, faces: [face([255, 0, 0]), face([0, 0, 255])], jointInset: 1, jointRgb: [9, 9, 9], seed: 1 });
  const colours = new Map<string, number>();
  for (let index = 0; index < output.length; index += 4) {
    const key = `${output[index]},${output[index + 1]},${output[index + 2]}`;
    colours.set(key, (colours.get(key) ?? 0) + 1);
  }
  assert.deepEqual([...colours.keys()].sort(), ["0,0,255", "255,0,0", "9,9,9"], "pixels are a face's or the joint's");
  assert.ok((colours.get("9,9,9") ?? 0) / (120 * 100) < 0.3, "joints stay thin");
  const pixelAt = (x: number, y: number) => {
    const local = getChevronPieceLocal(layout, x + 0.5, y + 0.5);
    const index = (y * 120 + x) * 4;
    return { inJoint: local.edgeDistance < 1, rgb: [output[index], output[index + 1], output[index + 2]].join() };
  };
  for (let y = 0; y < 100; y += 7) {
    for (let x = 0; x < 120; x += 5) {
      const pixel = pixelAt(x, y);
      assert.equal(pixel.rgb === "9,9,9", pixel.inJoint, `chevron pixel ${x},${y} is a joint exactly where it is near an edge`);
    }
  }
}
assert.deepEqual(
  getSurfaceMaterialChevronFailures({
    surface_material: { material_id: "x" } as SurfaceMaterial["surface_material"],
    physical_specs: { tile_width_mm: 150, tile_length_mm: 850, chevron_end_offset_mm: 70.7 },
    rendering: { available_pattern_layouts: ["chevron"] } as SurfaceMaterial["rendering"],
  }),
  [],
  "a chevron with its end offset is valid"
);
assert.equal(
  getSurfaceMaterialChevronFailures({
    surface_material: { material_id: "x" } as SurfaceMaterial["surface_material"],
    physical_specs: { tile_width_mm: 150, tile_length_mm: 850 },
    rendering: { available_pattern_layouts: ["chevron"] } as SurfaceMaterial["rendering"],
  }).length,
  1,
  "a chevron without its end offset fails"
);
assert.equal(
  getSurfaceMaterialChevronFailures({
    surface_material: { material_id: "x" } as SurfaceMaterial["surface_material"],
    physical_specs: { tile_width_mm: 150, tile_length_mm: 850, chevron_end_offset_mm: 70.7 },
    rendering: { available_pattern_layouts: ["straight"] } as SurfaceMaterial["rendering"],
  }).length,
  1,
  "an end offset without the chevron layout fails"
);
assert.deepEqual(
  getFlooringInspectorPatternOptions(
    SURFACE_MATERIAL_RENDER_REGISTRY.find((material) => material.rendering.available_pattern_layouts?.includes("chevron")) ?? null
  ),
  [{ id: "chevron", label: "Chevron" }],
  "a chevron material offers only the chevron layout"
);
assert.equal(normalizeFloorPattern("chevron"), "chevron", "chevron is a known pattern");
assert.equal(getFloorPatternLabel("chevron"), "Chevron");
assert.equal(
  getCompatibleFloorPatternForMaterial(
    SURFACE_MATERIAL_RENDER_REGISTRY.find((material) => material.rendering.available_pattern_layouts?.includes("chevron")) ?? null,
    "straight"
  ),
  "chevron",
  "walls lay a chevron-only material as a chevron (they ask for straight, which it can't be)"
);
assert.equal(
  shouldRotateTileSourceQuarterTurnForTest({
    supplier: "gardenia_orchidea",
    tileWidthPx: 120,
    tileHeightPx: 20,
  }),
  true,
  "Gardenia 20x120 landscape tiles should rotate portrait source grain into the horizontal long axis"
);
assert.equal(
  shouldRotateTileSourceQuarterTurnForTest({
    supplier: "gardenia_orchidea",
    tileWidthPx: 120,
    tileHeightPx: 120,
  }),
  false,
  "Gardenia square tiles should not rotate their source swatch"
);
assert.equal(
  shouldRotateTileSourceQuarterTurnForTest({
    supplier: "goodrich_global",
    tileWidthPx: 120,
    tileHeightPx: 20,
  }),
  false,
  "non-Gardenia landscape materials should keep their existing source orientation"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-wall-tile-bon-ton-octagon-pf60020783-60x120-196256-0",
    productName: "Gardenia Bon Ton Octagon 60x120",
  }),
  true,
  "Gardenia Bon Ton Octagon must render as one aligned decorative motif sheet across 60x120 seams"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-wall-tile-bon-ton-network-pf60020782-60x120-196255-0",
    productName: "Gardenia Bon Ton Network 60x120",
  }),
  true,
  "Gardenia Bon Ton Network must keep its geometric motif phase across tile seams"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-wall-tile-bon-ton-tricot-pf60020784-60x120-196257-0",
    productName: "Gardenia Bon Ton Tricot 60x120",
  }),
  true,
  "Gardenia Bon Ton Tricot must keep its geometric motif phase across tile seams"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-tabulae-refined-marble-3d-pf60021154-60x120-nat-92265-0",
    productName: "Gardenia Tabulae Refined Marble 3D 60x120 Nat",
  }),
  true,
  "Gardenia Tabulae Refined Marble 3D must render as an aligned decorative sheet"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-tabulae-refined-mesh-3d-pf60021152-60x60-nat-92263-0",
    productName: "Gardenia Tabulae Refined Mesh 3D 60x60 Nat",
  }),
  true,
  "Gardenia Tabulae Refined Mesh 3D must keep the diagonal printed motif aligned"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-gioia-majorelle-00202274-60x120-139925-0",
    productName: "Gardenia Gioia Majorelle 60x120",
  }),
  true,
  "Gardenia Gioia printed panels must keep their motif phase across tile seams"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-dorica-degrade-0010087-60x120-196274-0",
    productName: "Gardenia Dorica Degrade' 60x120",
  }),
  true,
  "Gardenia Dorica Degrade decorative 3D panels must render as full-tile artwork instead of zoomed random crops"
);
const additionalGardeniaAlignedDecorFixtures = [
  {
    materialId: "gardenia-flooring-la-geoteca-dec-plis-bou-bei-pf60016141-60x120-nat-90447-0",
    productName: "Gardenia La Geoteca Dec Plis Bou Bei 60x120 Nat",
  },
  {
    materialId: "gardenia-flooring-la-geoteca-dec-plisse-limes-pf60016140-60x120-nat-90446-0",
    productName: "Gardenia La Geoteca Dec Plissè Limes 60x120 Nat",
  },
  {
    materialId: "gardenia-flooring-la-marmoteca-sand-flower-0012068-60x120-nat-139944-0",
    productName: "Gardenia La Marmoteca Sand Flower 60x120 Nat",
  },
  {
    materialId: "gardenia-wall-tile-falaise-art-beige-0010804-60x120-196284-0",
    productName: "Gardenia Falaise Art Beige 60x120",
  },
];
for (const fixture of additionalGardeniaAlignedDecorFixtures) {
  assert.equal(
    shouldUseContinuousPatternSourceForTest({
      supplier: "gardenia_orchidea",
      materialId: fixture.materialId,
      productName: fixture.productName,
    }),
    true,
    `${fixture.productName} must render as an aligned full-tile source instead of a zoomed random crop`
  );
}
const remainingGardeniaDecorativeAlignmentMisses = entries
  .filter((entry) => entry.surface_material.supplier === "gardenia_orchidea")
  .filter((entry) => {
    const materialText = `${entry.surface_material.material_id} ${entry.surface_material.product_name}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[._-]+/g, " ");
    return /\b(dec|plis|pliss|plisse|flower|art)\b/.test(materialText);
  })
  .filter(
    (entry) =>
      !shouldUseContinuousPatternSourceForTest({
        supplier: entry.surface_material.supplier,
        materialId: entry.surface_material.material_id,
        productName: entry.surface_material.product_name,
      })
  )
  .map((entry) => entry.surface_material.material_id);
assert.deepEqual(
  remainingGardeniaDecorativeAlignmentMisses,
  [],
  "Gardenia decorative-name families must use the continuous renderer so printed motifs stay aligned"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-i-pigmenti-mos-confet-cream-pf60017602-29-3x33-3-nat-90365-0",
    productName: "Gardenia I Pigmenti Mos Confet Cream 29,3x33,3 Nat",
  }),
  true,
  "Gardenia I Pigmenti Mos Confet sheets must keep their dot grid aligned"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-i-pigmenti-crocini-pf60014514-60x120-nat-90359-0",
    productName: "Gardenia I Pigmenti Crocini 60x120 Nat",
  }),
  true,
  "Gardenia I Pigmenti Crocini sheets must keep their small square motif aligned"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-i-pigmenti-pillole-pf60014511-60x120-nat-90357-0",
    productName: "Gardenia I Pigmenti Pillole 60x120 Nat",
  }),
  true,
  "Gardenia I Pigmenti Pillole sheets must keep their motif aligned"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-i-pigmenti-rattan-pf60014512-60x120-nat-90358-0",
    productName: "Gardenia I Pigmenti Rattan 60x120 Nat",
  }),
  true,
  "Gardenia I Pigmenti Rattan sheets must keep their motif aligned"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-make-mos-t36-nero-cor-g0073253-33-3x33-3-90814-0",
    productName: "Gardenia Make Mos.t36 Nero Cor 33,3x33,3",
  }),
  true,
  "Gardenia Make Mos.t36 mosaic sheets must keep their small grid aligned"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-dorica-crema-0010519-20x120-nat-196278-0",
    productName: "Gardenia Dorica Crema 20x120 Nat",
  }),
  false,
  "Gardenia natural stone and wood-effect products should keep per-tile crop variation"
);
assert.equal(
  shouldUseContinuousPatternSourceForTest({
    supplier: "gardenia_orchidea",
    materialId: "gardenia-flooring-tabulae-refined-miele-nat-pf60021143-20x120-nat-92255-0",
    productName: "Gardenia Tabulae Refined Miele Nat 20x120 Nat",
  }),
  false,
  "Gardenia Tabulae plank products should not use the aligned decor-sheet renderer"
);
for (const hasPhysicalFaces of [false, true]) {
  // A decor drawn from one preview keeps the aligned decor-sheet path; once it has whole-tile faces,
  // the physical tile painter draws them (turned to the tile, at real size, varied per tile).
  assert.equal(
    shouldUseContinuousPatternSourceForTest({
      supplier: "gardenia_orchidea",
      materialId: "gardenia-flooring-tabulae-genuine-sticks-3d-pf60021153-60x120-nat-92264-0",
      productName: "Gardenia Tabulae Genuine Sticks 3D 60x120 Nat",
      hasPhysicalFaces,
    }),
    !hasPhysicalFaces,
    `Gardenia Tabulae Sticks ${hasPhysicalFaces ? "on whole-tile faces uses the physical tile painter" : "from a preview uses the decor-sheet renderer"}`
  );
}
assert.deepEqual(
  getContinuousPatternRepeatSizeForTest({
    tileWidthPx: 240,
    tileHeightPx: 120,
  }),
  { width: 240, height: 120 },
  "Gardenia decor swatches must repeat at the physical tile size so source seams stay under grout lines"
);
assert.deepEqual(
  getContinuousPatternRepeatSizeForTest({
    tileWidthPx: 120,
    tileHeightPx: 120,
  }),
  { width: 120, height: 120 },
  "Gardenia square decor swatches must keep the square physical tile repeat"
);
assert.deepEqual(
  getContinuousPatternSourceRectForTest({
    sourceWidthPx: 300,
    sourceHeightPx: 300,
  }),
  { x: 0, y: 0, width: 300, height: 300 },
  "Gardenia continuous decor sheets must preserve source edges so partial motifs align across repeats"
);
assert.deepEqual(
  getContinuousPatternSourceRectForTest({
    materialId: "gardenia-flooring-i-pigmenti-mos-confet-cotto-pf60017603-29-3x33-3-nat-90366-0",
    productName: "Gardenia I Pigmenti Mos Confet Cotto 29,3x33,3 Nat",
    sourceWidthPx: 300,
    sourceHeightPx: 300,
  }),
  { x: 0, y: 0, width: 289, height: 300 },
  "Gardenia Mos Confet swatches must trim the non-periodic right edge before repeating"
);
const mosConfetRepeatSize = getContinuousPatternRepeatSizeForTest({
  tileWidthPx: 333,
  tileHeightPx: 293,
  materialId: "gardenia-flooring-i-pigmenti-mos-confet-cotto-pf60017603-29-3x33-3-nat-90366-0",
  productName: "Gardenia I Pigmenti Mos Confet Cotto 29,3x33,3 Nat",
  sourceWidthPx: 300,
  sourceHeightPx: 300,
});
assertClose(
  mosConfetRepeatSize.width,
  282.25666666666666,
  "Gardenia Mos Confet motif repeat width must preserve the seamless source crop aspect"
);
assertClose(
  mosConfetRepeatSize.height,
  293,
  "Gardenia Mos Confet motif repeat height should stay anchored to the physical sheet height"
);
assertClose(
  getSurfaceJointSizePxForTest({ jointSizeMm: 5, surfaceWidthMeters: 4, canvasWidthPx: 1040 }),
  1.3,
  "grout preview width must stay physically accurate to the room scale"
);
assertClose(
  getSurfaceJointSizePxForTest({ jointSizeMm: 1, surfaceWidthMeters: 4, canvasWidthPx: 1040 }),
  0.26,
  "1 mm grout preview width must stay physically accurate to the room scale"
);
const wallSideTestRoom = {
  id: "wall_side_test_room",
  name: "Wall Side Test Room",
  roomType: "bedroom" as const,
  shape: "rectangle" as const,
  x: 0,
  z: 0,
  w: 4,
  d: 3,
};
assert.equal(
  getWallInteriorSurfaceSideForTest(wallSideTestRoom, { wall: "north", x: 0, z: -1.5, rotationY: 0 }),
  1,
  "north wall finishes should render only on the room-facing side"
);
assert.equal(
  getWallInteriorSurfaceSideForTest(wallSideTestRoom, { wall: "east", x: 2, z: 0, rotationY: -Math.PI / 2 }),
  1,
  "east wall finishes should render only on the room-facing side"
);
assert.equal(
  getWallInteriorSurfaceSideForTest(wallSideTestRoom, { wall: "south", x: 0, z: 1.5, rotationY: 0 }),
  -1,
  "south wall finishes should render only on the room-facing side"
);
assert.equal(
  getWallInteriorSurfaceSideForTest(wallSideTestRoom, { wall: "west", x: -2, z: 0, rotationY: -Math.PI / 2 }),
  -1,
  "west wall finishes should render only on the room-facing side"
);
// A drawn outline's walls take the room's side from the outline's winding, either way round (29 Oct 2026). The direction to
// the room's centre, used before, put the finish outside a wall whose line runs through the centre, and outside the walls a
// concave notch puts past it.
const isInsideOutline = (polygon: Array<{ x: number; z: number }>, x: number, z: number) =>
  polygon.reduce((inside, a, index) => {
    const b = polygon[(index + polygon.length - 1) % polygon.length];
    return (a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x ? !inside : inside;
  }, false);
const drawnOutlines: Array<[string, Array<{ x: number; z: number }>]> = [
  ["a rectangle drawn one way", [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }]],
  ["a rectangle drawn the other way", [{ x: -2, z: -1.5 }, { x: -2, z: 1.5 }, { x: 2, z: 1.5 }, { x: 2, z: -1.5 }]],
  ["an L whose notch corner is the centre", [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 }]],
  ["the same L drawn the other way", [{ x: -2, z: 2 }, { x: 0, z: 2 }, { x: 0, z: 0 }, { x: 2, z: 0 }, { x: 2, z: -2 }, { x: -2, z: -2 }]],
  ["a U whose notch holds the centre", [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: 1, z: 2 }, { x: 1, z: -1 }, { x: -1, z: -1 }, { x: -1, z: 2 }, { x: -2, z: 2 }]],
];
for (const [label, polygon] of drawnOutlines) {
  const drawnRoom = { ...wallSideTestRoom, id: "drawn", shape: "custom_polygon" as const, polygon };
  getWallSegments(drawnRoom).forEach((segment, index) => {
    const side = getWallInteriorSurfaceSide(segment);
    const step = { x: Math.sin(segment.rotationY) * side * 0.01, z: Math.cos(segment.rotationY) * side * 0.01 };
    assert.ok(isInsideOutline(polygon, segment.x + step.x, segment.z + step.z), `${label}: wall-${index}'s finish faces the room`);
  });
}

const doricaCrema120Runtime = findRuntimeMaterialFixture(
  "gardenia-flooring-dorica-crema-0010006-120x120-nat-196270-0"
);
assert.deepEqual(
  doricaCrema120Runtime.rendering.source_pattern_ids,
  ["pieno_01", "pieno_02", "pieno_05"],
  "Gardenia Dorica 120x120 must keep the exact official configurator pattern IDs"
);
assert.deepEqual(
  doricaCrema120Runtime.rendering.available_pattern_layouts,
  ["straight", "brick", "vertical_brick"],
  "Gardenia Dorica 120x120 must expose only the three official layouts"
);
const doricaCrema20x120Runtime = findRuntimeMaterialFixture(
  "gardenia-flooring-dorica-crema-0010519-20x120-nat-196278-0"
);
assert.deepEqual(
  doricaCrema20x120Runtime.rendering.source_pattern_ids,
  ["Spina_01", "Sfals_random_1", "pieno_01", "pieno_02", "pieno_05"],
  "Gardenia Dorica 20x120 must keep the exact five official configurator pattern IDs"
);
assert.deepEqual(
  doricaCrema20x120Runtime.rendering.available_pattern_layouts,
  ["herringbone", "random_stagger", "straight", "brick", "vertical_brick"],
  "Gardenia Dorica 20x120 must expose all five official layouts in Gardenia order"
);

assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("luxury_vinyl_tile"),
  "surface material vocabulary must include LVT"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("spc"),
  "surface material vocabulary must include SPC"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("vinyl_sheet"),
  "surface material vocabulary must include vinyl sheet"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("engineered_timber"),
  "surface material vocabulary must include engineered timber"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("wpc_decking"),
  "surface material vocabulary must include WPC decking"
);
assert.ok(
  SURFACE_MATERIAL_VOCABULARY.material_family.includes("carpet_tile"),
  "surface material vocabulary must include carpet tile"
);

const REQUIRED_ROOM_SUITABILITY_VALUES = [
  "living_room",
  "bedroom",
  "dining_room",
  "study",
  "hallway",
  "kitchen",
  "bathroom",
  "balcony",
  "commercial",
  "hospitality",
  "education",
] as const;

for (const required of REQUIRED_ROOM_SUITABILITY_VALUES) {
  assert.ok(
    SURFACE_MATERIAL_VOCABULARY.room_suitability.includes(required),
    `surface material vocabulary must include room suitability ${required}`
  );
}

assert.equal(result.hasFailures, false, [
  "Surface material audit failed.",
  ...result.parseErrorFiles.map((filePath) => `PARSE: ${getRelativeSurfaceMaterialPath(filePath)}`),
  ...Array.from(result.duplicateMaterialIds.entries()).map(
    ([materialId, filePaths]) => `DUPLICATE material_id ${materialId}: ${filePaths.map(getRelativeSurfaceMaterialPath).join(", ")}`
  ),
  ...Array.from(result.duplicateSlugs.entries()).map(
    ([slug, filePaths]) => `DUPLICATE slug ${slug}: ${filePaths.map(getRelativeSurfaceMaterialPath).join(", ")}`
  ),
  ...result.audits.flatMap((audit) =>
    audit.failures.map((failure) => `${getRelativeSurfaceMaterialPath(audit.filePath)}: ${failure}`)
  ),
].join("\n"));

const goodrichEntries = entries.filter((entry) => entry.surface_material.supplier === "goodrich_global");
const productionRuntimeIds = SURFACE_MATERIAL_RENDER_REGISTRY.map(
  (entry) => entry.surface_material.material_id
);
const productionCatalogIds = PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA.map(
  (entry) => entry.material_id
);
const testFixtureRuntimeIds = TEST_FIXTURE_SURFACE_MATERIAL_RENDER_REGISTRY.map(
  (entry) => entry.surface_material.material_id
);
assert.ok(goodrichEntries.length >= 4, "expected at least four draft Goodrich surface material fixtures");
assert.equal(result.duplicateMaterialIds.size, 0, "surface material material_id values must be unique");
assert.equal(result.duplicateSlugs.size, 0, "surface material slug values must be unique");
const publishedFloors = getPublishedFlooringMaterials();
assert.ok(
  publishedFloors.every((material) => material.surface_material.supplier !== "goodrich_global"),
  "draft Goodrich fixtures must not publish to consumer flooring registry"
);
// J, 15 Oct 2026: "put quote on request for now and publish": Gardenia's entries on ABK's faces are the published floors.
assert.ok(
  publishedFloors.length > 0 && publishedFloors.every((material) => material.surface_material.supplier === "gardenia_orchidea"),
  "the consumer flooring registry holds Gardenia's published quote-on-request entries only"
);
// Since 25 Oct 2026 the laminate catalogue's wall panels are surface materials too, read from catalog/laminates with no YAML
// copy (lib/surface-material-sources.ts). Every other record comes from one YAML file.
const laminatePanelEntries = getLaminateWallPanelSourceEntries();
const sourceEntries = getAllSurfaceMaterialSourceEntries();
assert.equal(sourceEntries.length, entries.length + laminatePanelEntries.length);
assert.equal(
  productionRuntimeIds.length,
  entries.length + laminatePanelEntries.length,
  "every production YAML record must contribute exactly one render-registry record, and so must each laminate wall panel"
);
assert.ok(
  sourceEntries.every((entry) => productionRuntimeIds.includes(entry.surface_material.material_id)),
  "every YAML record and laminate wall panel is in the render registry"
);
assert.ok(
  goodrichEntries.every((entry) => productionRuntimeIds.includes(entry.surface_material.material_id)),
  "production runtime registry must be generated from Goodrich YAML entries"
);
assert.ok(
  !productionRuntimeIds.includes("test-only-published-flooring"),
  "test-only published flooring fixture must not be in production runtime data"
);
assert.deepEqual(
  productionCatalogIds,
  productionRuntimeIds,
  "generated render and lazy catalog projections must preserve identical IDs and ordering"
);
const sourceByMaterialId = new Map(
  sourceEntries.map((entry) => [entry.surface_material.material_id, entry] as const)
);
for (const runtimeMaterial of SURFACE_MATERIAL_RENDER_REGISTRY) {
  const sourceMaterial = sourceByMaterialId.get(runtimeMaterial.surface_material.material_id);
  assert.ok(
    sourceMaterial,
    `${runtimeMaterial.surface_material.material_id} render record must retain a canonical YAML source (or the laminate catalogue)`
  );
  assert.deepEqual(
    runtimeMaterial.texture_assets,
    {
      swatch_url: sourceMaterial.texture_assets.swatch_url ?? null,
      base_color_url: sourceMaterial.texture_assets.base_color_url ?? null,
      texture_repeat_size_cm: sourceMaterial.texture_assets.texture_repeat_size_cm ?? null,
      normal_url: sourceMaterial.texture_assets.normal_url ?? null,
      roughness_url: sourceMaterial.texture_assets.roughness_url ?? null,
      ao_url: sourceMaterial.texture_assets.ao_url ?? null,
      preview_room_url: sourceMaterial.texture_assets.preview_room_url ?? null,
      tileable: sourceMaterial.texture_assets.tileable,
      ...(sourceMaterial.texture_assets.image_physical_size_mm
        ? { image_physical_size_mm: sourceMaterial.texture_assets.image_physical_size_mm }
        : {}),
      ...(sourceMaterial.texture_assets.faces ? { faces: sourceMaterial.texture_assets.faces } : {}),
    },
    `${runtimeMaterial.surface_material.material_id} texture-map identities must match canonical YAML (or the laminate catalogue)`
  );
}

// Greenlam's laminates as wall panels (J, 25 and 27 Oct 2026): one published record per design, with the cabinets' id and
// sheet size, audited like the YAML (lib/laminate-wall-panel-materials.ts). A patterned design draws the cabinets' picture at
// the size it covers; a flat colour draws a one-colour picture of its catalogue colour over the whole sheet.
const laminateCollectionById = new Map(CABINET_LAMINATE_COLLECTIONS.map((collection) => [collection.id, collection]));
const laminatesOf = (collectionId: string) => laminateCollectionById.get(collectionId)?.laminates ?? [];
assert.deepEqual(
  ["hpl-1220x2440", "hpl-1300x3050"].map((id) => [laminatesOf(id).length, laminatesOf(id).filter((laminate) => laminate[5] === null).length]),
  [[342, 108], [33, 12]],
  "the 4'x8' collection's 342 designs, 108 of them flat colours; the 4.25'x10' collection's 33, 12 of them flat"
);
assert.equal(laminatePanelEntries.length, 374, "every design is a wall panel but 5338 Steamed Bouchle");
// The panels' file_path is a label relative to the repository. Joined to process.cwd() with a computed name, it made Next's
// file tracer copy the whole repository, tests included, into /api/catalog's server build, which the production artifact
// check refuses (PR #207's first CI run, 25 Oct 2026).
assert.doesNotMatch(
  fs.readFileSync("lib/surface-material-sources.ts", "utf8"),
  /(join|resolve)\(\s*process\.cwd\(\)/,
  "the laminate wall panels' sources never build a path from process.cwd()"
);
assert.ok(
  !sourceByMaterialId.has("greenlam-woodgrains-5338"),
  "5338 Steamed Bouchle's picture covers 1220x2115 mm of its 4'x8' sheet, so it would repeat on every sheet"
);
const flatPictures = buildLaminateFlatPictures();
for (const panel of laminatePanelEntries) {
  const id = panel.surface_material.material_id;
  const collection = CABINET_LAMINATE_COLLECTIONS.find((candidate) => candidate.laminates.some((design) => design[0] === id));
  const laminate = collection?.laminates.find((design) => design[0] === id);
  assert.ok(collection && laminate, `${id} is a cabinet laminate`);
  assert.equal(panel.file_path, getLaminateCollectionSourcePath(collection), `${id} names its catalogue by its path in the repository`);
  assert.deepEqual(
    [...auditSurfaceMaterialEntry(panel, panel.file_path).failures, ...getSurfacePhysicalAssetFailures(panel)],
    [],
    `${id}: a laminate wall panel passes the surface audit`
  );
  assert.deepEqual(
    [panel.surface_material.surface_category, panel.import_governance.publish_status, panel.source.license_status],
    ["wall_panel", "published", "confirmed"],
    `${id} is a published wall panel`
  );
  assert.equal(panel.surface_material.product_name, `Greenlam ${laminate[2]} ${laminate[1]}`, `${id} is named, then numbered`);
  assert.deepEqual(
    [panel.physical_specs.tile_width_mm, panel.physical_specs.tile_length_mm, panel.physical_specs.total_thickness_mm],
    [collection.sheetMm.width, collection.sheetMm.height, collection.sheetMm.thickness],
    `${id} is its collection's sheet`
  );
  const flatUrl = getLaminateFlatPictureUrl(laminate[4]);
  assert.deepEqual(
    [panel.texture_assets.base_color_url, panel.texture_assets.swatch_url, panel.texture_assets.image_physical_size_mm],
    laminate[5] === null
      ? [flatUrl, flatUrl, { width: collection.sheetMm.width, height: collection.sheetMm.height }]
      : [laminate[5], laminate[6], { width: laminate[7], height: laminate[8] }],
    `${id} draws the cabinets' picture at the size it covers, or its flat colour over the whole sheet`
  );
  if (laminate[5] === null) {
    const file = path.join("public", flatUrl);
    assert.ok(fs.readFileSync(file).equals(buildFlatColourPng(laminate[4])), `${id}: ${file} is one colour, ${laminate[4]}`);
  }
  assert.deepEqual(panel.rendering.available_pattern_layouts, ["straight"], `${id} is laid straight`);
  assert.deepEqual(
    [panel.rendering.roughness, panel.rendering.metalness],
    [LAMINATE_SURFACE_BY_CATEGORY[laminate[3]].roughness, LAMINATE_SURFACE_BY_CATEGORY[laminate[3]].metalness],
    `${id} takes the light as the cabinets' laminate does`
  );
  assert.ok(
    !panel.classification.room_suitability.some((room) => room === "bathroom" || room === "balcony"),
    `${id}: thin HPL is for dry walls`
  );
}
assert.deepEqual(
  [...flatPictures.keys()].sort(),
  fs.readdirSync(LAMINATE_FLAT_PICTURE_DIRECTORY).filter((name) => name.endsWith(".png"))
    .map((name) => path.join(LAMINATE_FLAT_PICTURE_DIRECTORY, name)).sort(),
  "one flat picture per flat colour (116 colours for 120 designs), and no others"
);
assert.equal(flatPictures.size, 116);
assert.deepEqual(
  laminatePanelEntries
    .filter((panel) => panel.physical_specs.tile_length_mm === 3050 && panel.texture_assets.base_color_url?.endsWith(".webp"))
    .map((panel) => panel.texture_assets.image_physical_size_mm?.height)
    .reduce<Record<string, number>>((counts, height) => ({ ...counts, [String(height)]: (counts[String(height)] ?? 0) + 1 }), {}),
  { 1299: 1, 2600: 19, 2816: 1 },
  "the 10' pictures are shorter than their 3050 mm sheet, so they are drawn from its foot (wallPanelSheetPainter.ts)"
);
assert.equal(
  getSurfaceMaterialById("greenlam-woodgrains-5394")?.surface_material.surface_category,
  "wall_panel",
  "the server registry serves the laminate wall panels"
);
assert.equal(getSurfaceMaterialById("greenlam-solids-112")?.physical_specs.tile_length_mm, 3050, "and the 10' sheets");
const panelEffectCounts = laminatePanelEntries.reduce<Record<string, number>>((counts, panel) => {
  counts[panel.classification.design_effect] = (counts[panel.classification.design_effect] ?? 0) + 1;
  return counts;
}, {});
assert.deepEqual(
  panelEffectCounts,
  { wood: 167, woven: 7, pattern: 38, marble: 7, stone: 6, concrete: 1, metallic: 20, plain: 128 },
  "wood for woodgrains, plain for solids and Unicore, metallic for metals and pearlescents, and an abstract's effect from its name"
);
assert.equal(sourceByMaterialId.get("greenlam-abstracts-5571")?.classification.design_effect, "marble", "Creme Marquina");
assert.equal(sourceByMaterialId.get("greenlam-abstracts-5641")?.classification.design_effect, "pattern", "Kimono");
assert.deepEqual(
  ["greenlam-abstracts-5794", "greenlam-abstracts-5865"].map((id) => [sourceByMaterialId.get(id)?.surface_material.product_name, sourceByMaterialId.get(id)?.classification.design_effect]),
  [["Greenlam Grey Onyx 5794", "stone"], ["Greenlam Dune Pietra 5865", "stone"]],
  "onyx and pietra (Italian for stone) name stones"
);

// Wall panels are laid from the floor up, so the cut sheet is at the top of a 2.7 m wall, and the parts of a wall around a
// door or window, each painted on its own canvas, share one set of joints. Tiles keep their rows from the canvas top.
const nordicAcaciaPanel = getRuntimeSurfaceMaterialById("greenlam-woodgrains-5394");
const someWallTile = SURFACE_MATERIAL_RENDER_REGISTRY.find((material) => material.surface_material.surface_category === "wall_tile");
assert.ok(nordicAcaciaPanel && someWallTile);
const panelRows = (canvasHeightPx: number, bottomAboveFloorMeters: number | null) =>
  getSurfaceTileRows({
    material: nordicAcaciaPanel,
    canvasHeightPx,
    surfaceHeightMeters: canvasHeightPx / 1000,
    tileHeightPx: 2440,
    bottomAboveFloorMeters,
  });
const fullHeightRows = panelRows(2700, 0);
assert.equal(fullHeightRows.top(0), 260, "the first sheet stands on the floor; its top joint is 2440 mm up, 260 mm below the top");
assert.ok(fullHeightRows.first <= 0 && fullHeightRows.end >= 2, "the first sheet and the cut one above it are painted");
assert.equal(panelRows(600, 2.1).top(0), 260, "above a 2.1 m door head, the joint is at the same height as beside the door");
assert.equal(panelRows(900, 0).top(0), 900 - 2440, "below a 0.9 m window sill, the part is all the first sheet");
assert.deepEqual(
  [panelRows(2700, null).first, panelRows(2700, null).end, panelRows(2700, null).top(1)],
  [-2, 5, 2440],
  "a panel with no floor height is laid from the canvas top, as before"
);
const wallTileRows = getSurfaceTileRows({
  material: someWallTile,
  canvasHeightPx: 2700,
  surfaceHeightMeters: 2.7,
  tileHeightPx: 600,
  bottomAboveFloorMeters: 0,
});
assert.deepEqual([wallTileRows.first, wallTileRows.end, wallTileRows.top(1)], [-2, 8, 600], "wall tiles keep their rows from the top");
// Columns: a part's canvas says how far along the wall face it starts, so the sheet edges carry on across the parts around a
// door. A part starting 1.0 m along the face, 1 px per mm: the sheet edge at 1220 mm is 220 px into it, and it is sheet 1.
const panelColumns = (canvasWidthPx: number, startAlongFaceMeters: number | null) =>
  getSurfaceTileColumns({
    material: nordicAcaciaPanel,
    canvasWidthPx,
    surfaceWidthMeters: canvasWidthPx / 1000,
    tileWidthPx: 1220,
    startAlongFaceMeters,
  });
const aboveDoorColumns = panelColumns(900, 1);
assert.equal(aboveDoorColumns.left(1, 0), 220, "the sheet edge 1220 mm along the face falls 220 mm into a part starting at 1 m");
assert.ok(aboveDoorColumns.first <= 0 && aboveDoorColumns.end >= 2, "sheets 0 and 1, the ones the part crosses, are painted");
assert.equal(panelColumns(1000, 0).left(0, 0), 0, "the first sheet meets the face's start");
assert.equal(panelColumns(900, -1.9).left(-1, 0), 680, "a reversed face counts back from its start, so the edges are the same");
assert.deepEqual(
  [panelColumns(900, null).first, panelColumns(900, null).end, panelColumns(900, null).left(1, 0)],
  [0, 4, 0],
  "a panel with no face start starts its columns at the canvas's edge, as before"
);
const wallTileColumns = getSurfaceTileColumns({
  material: someWallTile,
  canvasWidthPx: 900,
  surfaceWidthMeters: 0.9,
  tileWidthPx: 600,
  startAlongFaceMeters: 1,
});
assert.deepEqual([wallTileColumns.first, wallTileColumns.end, wallTileColumns.left(0, 0)], [0, 5, -600], "wall tiles keep their columns");

// A wall panel's joints: 3 mm (Greenlam's least, 28 Oct 2026) and dark, called joints; tiles keep their grout.
assert.equal(surfaceMaterialHasJoints(nordicAcaciaPanel), true);
assert.equal(surfaceMaterialHasJoints(someWallTile), true);
assert.equal(surfaceMaterialHasJoints(null), false);
assert.equal(getSurfaceJointLabel(nordicAcaciaPanel), "Joints");
assert.equal(getSurfaceJointLabel(someWallTile), "Grout");
assert.deepEqual(getDefaultWallJoint(nordicAcaciaPanel), { jointSizeMm: 3, jointColor: "#444442" }, "Greenlam's least joint (28 Oct 2026)");
assert.deepEqual(getDefaultWallJoint(someWallTile), { jointSizeMm: 2, jointColor: "#dad7cf" });

const grandMarble = findRuntimeMaterialFixture("goodrich-geff-novaclick-gnv-018-grand-marble");
assert.equal(grandMarble.physical_specs?.tile_width_mm, 457.2);
assert.equal(grandMarble.physical_specs?.tile_length_mm, 914.4);
assert.deepEqual(grandMarble.texture_assets.texture_repeat_size_cm, {
  width: 365.76,
  height: 365.76,
});
const pewterOak = findRuntimeMaterialFixture("goodrich-geff-novaclick-gnv-013-pewter-oak");
assert.equal(pewterOak.physical_specs?.plank_width_mm, 177.8);
assert.equal(pewterOak.physical_specs?.plank_length_mm, 1219.2);
assert.deepEqual(pewterOak.texture_assets.texture_repeat_size_cm, {
  width: 365.76,
  height: 365.76,
});

const expectedGeffRepeatPerMeter = 100 / 365.76;
const grandMarbleSmallRoomRepeat = resolveSurfaceTextureRepeat({
  roomWidthMeters: 3,
  roomDepthMeters: 2.5,
  floorScale: 1,
  repeatSizeCm: grandMarble.texture_assets.texture_repeat_size_cm,
  useSingleSwatch: false,
});
const grandMarbleLargeRoomRepeat = resolveSurfaceTextureRepeat({
  roomWidthMeters: 7,
  roomDepthMeters: 5,
  floorScale: 1,
  repeatSizeCm: grandMarble.texture_assets.texture_repeat_size_cm,
  useSingleSwatch: false,
});
assertClose(
  grandMarbleSmallRoomRepeat.repeatX,
  expectedGeffRepeatPerMeter,
  "GNV-018 physical repeat X should be based on catalogue sheet size"
);
assertClose(
  grandMarbleSmallRoomRepeat.repeatY,
  expectedGeffRepeatPerMeter,
  "GNV-018 physical repeat Y should be based on catalogue sheet size"
);
assert.deepEqual(
  grandMarbleLargeRoomRepeat,
  grandMarbleSmallRoomRepeat,
  "GNV-018 physical repeat must not change between different room sizes"
);

const pewterOakRepeat = resolveSurfaceTextureRepeat({
  roomWidthMeters: 7,
  roomDepthMeters: 5,
  floorScale: 1,
  repeatSizeCm: pewterOak.texture_assets.texture_repeat_size_cm,
  useSingleSwatch: false,
});
assertClose(
  pewterOakRepeat.repeatX,
  expectedGeffRepeatPerMeter,
  "GNV-013 physical repeat X should be based on catalogue sheet size"
);
assertClose(
  pewterOakRepeat.repeatY,
  expectedGeffRepeatPerMeter,
  "GNV-013 physical repeat Y should be based on catalogue sheet size"
);

const scaledGrandMarbleRepeat = resolveSurfaceTextureRepeat({
  roomWidthMeters: 7,
  roomDepthMeters: 5,
  floorScale: 2,
  repeatSizeCm: grandMarble.texture_assets.texture_repeat_size_cm,
  useSingleSwatch: false,
});
assertClose(
  scaledGrandMarbleRepeat.repeatX,
  expectedGeffRepeatPerMeter / 2,
  "floorScale 2 should intentionally double physical material size"
);

const singleSwatchSmallRoomRepeat = resolveSurfaceTextureRepeat({
  roomWidthMeters: 3,
  roomDepthMeters: 2.5,
  floorScale: 1,
  repeatSizeCm: null,
  useSingleSwatch: true,
});
const singleSwatchLargeRoomRepeat = resolveSurfaceTextureRepeat({
  roomWidthMeters: 7,
  roomDepthMeters: 5,
  floorScale: 1,
  repeatSizeCm: null,
  useSingleSwatch: true,
});
assertClose(singleSwatchSmallRoomRepeat.repeatX, 1 / 3, "single-swatch X repeat should map to room width");
assertClose(singleSwatchSmallRoomRepeat.repeatY, 1 / 2.5, "single-swatch Y repeat should map to room depth");
assert.notDeepEqual(
  singleSwatchLargeRoomRepeat,
  singleSwatchSmallRoomRepeat,
  "single-swatch fallback may remain room-relative"
);
assert.ok(
  testFixtureRuntimeIds.includes("test-only-published-flooring"),
  "test runtime fixture registry must include the test-only published flooring"
);
assert.equal(
  getRuntimeSurfaceMaterialById("test-only-published-flooring"),
  null,
  "default runtime must exclude test-only published flooring unless fixture gate is enabled"
);
assert.doesNotMatch(
  fs.readFileSync("lib/surface-material-runtime.ts", "utf8"),
  /surface-material-runtime\.generated|TEST_FIXTURE_SURFACE_MATERIAL/,
  "production runtime must not import test-only generated fixtures"
);
assert.ok(
  getDraftFlooringMaterialsForAdmin().length >= goodrichEntries.length,
  "admin flooring registry must expose draft surface materials"
);
assert.equal(
  getFlooringMaterials({ includeDrafts: true }).length,
  getDraftFlooringMaterialsForAdmin().length + getPublishedFlooringMaterials().length,
  "flooring registry should include drafts only when requested/dev-visible"
);
assert.ok(
  getSurfaceMaterialById("goodrich-geff-novaclick-gnv-001-ivory-oak"),
  "surface material lookup should resolve by material_id"
);
const goodrichAdminSummary = adminSummaries.find(
  (entry) => entry.materialId === "goodrich-geff-novaclick-gnv-001-ivory-oak"
);
assert.ok(goodrichAdminSummary, "admin audit summary should include Goodrich GEFF draft");
assert.equal(goodrichAdminSummary.supplier, "goodrich_global");
assert.equal(goodrichAdminSummary.brand, "Goodrich Global");
assert.equal(goodrichAdminSummary.materialFamily, "luxury_vinyl_tile");
assert.equal(goodrichAdminSummary.publishStatus, "draft");
assert.equal(goodrichAdminSummary.licenseStatus, "needs_permission");
assert.equal(
  goodrichAdminSummary.sourceUrl,
  "https://issuu.com/goodrichglobal/docs/geff_novaclick_flooring_2025?fr=sNzFlYTgzODQ3MDc"
);
assert.equal(
  goodrichAdminSummary.sampleRequestUrl,
  "https://www.goodrichglobal.com/singapore/contact-us/request-samples/"
);
assert.ok(!goodrichAdminSummary.missingAssets.includes("swatch_url"));
assert.ok(goodrichAdminSummary.missingAssets.includes("base_color_url"));
assert.ok(goodrichAdminSummary.missingAssets.includes("known_tileability"));
assert.ok(!goodrichAdminSummary.missingAssets.includes("texture_repeat_size_cm"));
assert.ok(!goodrichAdminSummary.missingSpecs.includes("plank_width_mm"));
assert.ok(!goodrichAdminSummary.missingSpecs.includes("plank_length_mm"));
assert.ok(!goodrichAdminSummary.missingSpecs.includes("total_thickness_mm"));
assert.ok(!goodrichAdminSummary.missingSpecs.includes("wear_layer_mm"));
assert.ok(goodrichAdminSummary.blockers.includes("confirm_supplier_image_usage_rights"));

for (const entry of goodrichEntries) {
  const qaFlags = entry.import_governance.qa_flags ?? [];
  const hasCatalogueConfirmedProductCode = qaFlags.includes("exact_product_code_from_2025_issuu_catalogue");
  const hasCatalogueConfirmedDimensions = qaFlags.includes("physical_dimensions_from_2025_issuu_catalogue");
  const hasSourceCatalogueSwatch = qaFlags.includes("source_catalogue_swatch_reference");

  assert.equal(entry.import_governance.publish_status, "draft");
  assert.equal(entry.source.license_status, "needs_permission");
  if (hasSourceCatalogueSwatch) {
    assert.match(
      entry.texture_assets.swatch_url ?? "",
      /^\/assets\/catalog\/surface-materials\/flooring\/goodrich\/geff-nova(?:click|-dryback)\/.+-swatch\.jpg$/,
      `${entry.surface_material.material_id} source catalogue swatch must use the Goodrich draft asset path`
    );
  } else {
    assert.equal(entry.texture_assets.swatch_url, null);
  }
  assert.equal(entry.texture_assets.base_color_url, null);
  assert.ok(
    getRuntimeSurfaceMaterialById(entry.surface_material.material_id),
    `${entry.surface_material.material_id} must be available to client-side floor rendering`
  );
  if (!hasCatalogueConfirmedProductCode) {
    assert.ok(
      entry.import_governance.publish_blockers.includes("confirm_exact_goodrich_product_code"),
      `${entry.surface_material.material_id} must block publish until exact product code is confirmed`
    );
  }
  assert.ok(
    entry.import_governance.publish_blockers.includes("confirm_supplier_image_usage_rights"),
    `${entry.surface_material.material_id} must block publish until image rights are confirmed`
  );
  assert.ok(
    entry.import_governance.publish_blockers.includes("confirm_texture_tileability"),
    `${entry.surface_material.material_id} must block publish until texture tileability is confirmed`
  );
  if (!hasCatalogueConfirmedDimensions) {
    assert.ok(
      entry.import_governance.publish_blockers.includes("confirm_physical_dimensions"),
      `${entry.surface_material.material_id} must block publish until physical dimensions are confirmed`
    );
  }
}

const roomWithSurfaceMaterial: RoomSnapshot = {
  id: "room_surface_test",
  name: "Surface Test Room",
  roomType: "living",
  geometry: { width: 4, depth: 3 },
  surfaces: {
    floorMaterialId: "goodrich-geff-novaclick-gnv-001-ivory-oak",
    floorRotationDeg: 47,
    floorPattern: "brick",
    floorScale: 1.25,
    floorPatternOffset: { x: 0.15, y: -0.1 },
    floorJointSizeMm: 3.5,
    floorJointColor: "#c8c0b2",
    wallMaterialId: "goodrich-geff-novaclick-gnv-002-silver-oak",
    walls: {
      default: {
        materialId: "goodrich-geff-novaclick-gnv-002-silver-oak",
        pattern: "grid",
        rotationDeg: 90,
        scale: 1,
        offset: { x: 0, y: 0 },
        jointSizeMm: 2,
        jointColor: "#dad7cf",
      },
      faces: {
        east: {
          materialId: "goodrich-geff-novaclick-gnv-003-ash-oak",
          pattern: "checker",
          rotationDeg: 135,
          scale: 0.9,
          offset: { x: 0.2, y: 0.1 },
          jointSizeMm: 1.5,
          jointColor: "#eeeeee",
        },
      },
    },
  },
  items: [],
  zones: [],
  savedViews: [],
};
assert.equal(normalizeFloorRotationDeg(47), 45, "floor rotation must snap to the nearest 45-degree increment");
assert.equal(normalizeFloorRotationDeg(92), 90, "floor rotation must keep 90-degree compatibility");
assert.deepEqual(
  normalizeFloorSurfaceSettings(undefined, normalizeFloorRotationDeg, clampFloorPatternScale),
  {
    floorPattern: "straight",
    floorRotationDeg: 0,
    floorScale: 1,
    floorPatternOffset: DEFAULT_FLOOR_PATTERN_OFFSET,
    floorJointSizeMm: DEFAULT_FLOOR_JOINT_SIZE_MM,
    floorJointColor: DEFAULT_FLOOR_JOINT_COLOR,
  },
  "missing floor surface settings must normalize to backward-compatible defaults"
);
const checkoutRows = buildCheckoutReadinessRows([roomWithSurfaceMaterial]);
assert.equal(checkoutRows.length, 0, "room surface flooring must not create furniture checkout rows");
assert.equal(
  roomWithSurfaceMaterial.surfaces?.floorMaterialId,
  "goodrich-geff-novaclick-gnv-001-ivory-oak",
  "room state must store selected floorMaterialId on surfaces"
);
assert.equal(
  getRuntimeSurfaceMaterialById(roomWithSurfaceMaterial.surfaces?.floorMaterialId)?.surface_material.material_id,
  "goodrich-geff-novaclick-gnv-001-ivory-oak",
  "client floor material resolver must return the selected surface material"
);
const surfacePersistenceSnapshot: DesignSnapshot = {
  version: 3,
  rooms: [roomWithSurfaceMaterial],
  activeRoomId: roomWithSurfaceMaterial.id,
};
const storedSurfaceDesign = snapshotToStored(surfacePersistenceSnapshot);
const sanitizedStoredSurfaceDesign = sanitizeStoredDesign(
  JSON.parse(JSON.stringify(storedSurfaceDesign))
);
assert.ok(
  sanitizedStoredSurfaceDesign,
  "surface assignments must remain valid through the application storage sanitizer"
);
const reloadedRoomWithSurfaceMaterial = storedToSnapshot(
  sanitizedStoredSurfaceDesign
).rooms[0];
assert.deepEqual(
  reloadedRoomWithSurfaceMaterial.surfaces,
  roomWithSurfaceMaterial.surfaces,
  "surface assignments and rendering settings must survive the application save/sanitize/reload boundary"
);
assert.deepEqual(
  reloadedRoomWithSurfaceMaterial.surfaceFinishes,
  roomWithSurfaceMaterial.surfaces,
  "surface compatibility assignments must survive the application save/sanitize/reload boundary"
);
const bomRows = buildRoomSurfaceMaterialBomRows([roomWithSurfaceMaterial]);
assert.equal(bomRows.length, 3, "room floor plus wall surfaces must create BOM rows");
const floorBomRow = bomRows.find((row) => row.surface === "floor");
assert.ok(floorBomRow, "room surface flooring must create one floor BOM row");
assert.equal(floorBomRow.roomAreaSqm, 12);
assert.equal(floorBomRow.orderAreaSqm, 13.2);
assert.equal(floorBomRow.wasteFactor, 0.1);
assert.equal(floorBomRow.floorPattern, "brick");
assert.equal(floorBomRow.floorRotationDeg, 45);
assert.equal(floorBomRow.floorScale, 1.25);
assert.deepEqual(floorBomRow.floorPatternOffset, { x: 0.15, y: -0.1 });
assert.equal(floorBomRow.floorJointSizeMm, 3.5);
assert.equal(floorBomRow.floorJointColor, "#c8c0b2");
const wallBomRow = bomRows.find((row) => row.surface === "walls");
assert.ok(wallBomRow, "default wall finish must create a wall BOM row");
assert.equal(wallBomRow.surfaceLabel, "Remaining walls");
assert.equal(wallBomRow.pattern, "grid");
const selectedWallBomRow = bomRows.find((row) => row.surface === "selected_wall");
assert.ok(selectedWallBomRow, "selected wall finish must create a selected-wall BOM row");
assert.equal(selectedWallBomRow.wallFaceId, "east");
assert.equal(selectedWallBomRow.pattern, "checker");
assert.equal(selectedWallBomRow.rotationDeg, 135);
assert.equal(
  getWallFaceSurfaceSettings(roomWithSurfaceMaterial.surfaces, "east", normalizeFloorRotationDeg, clampFloorPatternScale).materialId,
  "goodrich-geff-novaclick-gnv-003-ash-oak",
  "selected wall face must resolve its override material"
);
const surfaceCsvRows = buildSurfaceMaterialCsvRows([roomWithSurfaceMaterial]);
assert.equal(surfaceCsvRows.length, 3, "room surface finishes must create area-based BOM CSV rows");
assert.equal(surfaceCsvRows[0].category, "Flooring Material");
assert.equal(surfaceCsvRows[0].productId, "goodrich-geff-novaclick-gnv-001-ivory-oak");
assert.equal(surfaceCsvRows[0].quantity, 13.2);
assert.ok(
  surfaceCsvRows.some((row) => row.category === "Wall Surface Material" && row.variantLabel.includes("East wall")),
  "surface BOM CSV rows must include selected wall metadata"
);
assert.match(
  surfaceCsvRows[0].reviewNote ?? "",
  /Pattern brick; rotation 45 deg; scale 1\.25; joint 3\.5 mm #c8c0b2\./,
  "surface BOM CSV rows must include floor pattern, rotation, and joint metadata"
);

const canonicalBomPanelId =
  "wall-panel:v2:1:bom_panel_room:north:segment-start:opening-bom-door-start:interior";
const roomWithCanonicalPanelFinish: RoomSnapshot = {
  id: "bom_panel_room",
  name: "Panel BOM room",
  roomType: "living",
  geometry: { width: 4, depth: 3, height: 2.5 },
  planPosition: { x: 0, z: 0 },
  surfaces: {
    walls: {
      default: {
        materialId: "goodrich-geff-novaclick-gnv-002-silver-oak",
      },
      panels: {
        [canonicalBomPanelId]: {
          materialId: "goodrich-geff-novaclick-gnv-003-ash-oak",
        },
      },
    },
  },
  items: [],
  zones: [],
  savedViews: [],
};
const canonicalPanelBomRows = buildRoomSurfaceMaterialBomRows(
  [roomWithCanonicalPanelFinish],
  [
    {
      id: "bom-door",
      roomId: roomWithCanonicalPanelFinish.id,
      wall: "north",
      offsetMm: 0,
      widthMm: 1000,
      heightMm: 2100,
      bottomMm: 0,
      kind: "door",
    },
  ]
);
const canonicalPanelBomRow = canonicalPanelBomRows.find(
  (row) => row.wallPanelId === canonicalBomPanelId
);
assert.ok(
  canonicalPanelBomRow,
  "A canonical panel override must create its own material BOM row."
);
assert.equal(
  canonicalPanelBomRow.surfaceAreaSqm,
  3.75,
  "A canonical panel BOM row must use panel width × wall height."
);
const canonicalInheritedWallRow = canonicalPanelBomRows.find(
  (row) => row.surface === "walls"
);
assert.ok(canonicalInheritedWallRow);
assert.equal(
  canonicalInheritedWallRow.surfaceAreaSqm,
  29.15,
  "The overridden panel area must be subtracted from the inherited wall material."
);
assert.equal(
  canonicalPanelBomRows.reduce(
    (sum, row) =>
      row.surface === "walls" || row.surface === "selected_wall"
        ? sum + row.surfaceAreaSqm
        : sum,
    0
  ),
  32.9,
  "Wall BOM rows must cover the solid wall area exactly once after subtracting the doorway."
);

const bomWindow = {
  id: "bom-window", roomId: roomWithCanonicalPanelFinish.id, kind: "window" as const,
  wall: "north" as const, widthMm: 1400, offsetMm: 0, heightMm: 1200, bottomMm: 900,
};
const bomTopology = buildHousePlan2D([roomWithCanonicalPanelFinish], 4, 3).rooms;
const bomSegment = getWallSegments(bomTopology[0]).find((segment) => segment.wall === "north");
assert.ok(bomSegment);
const bomWindowPanels = buildOpeningWallSurfacePanels(bomTopology[0], bomTopology, bomSegment,
  getWallOpenings(bomTopology[0], bomSegment, bomTopology, mapPlanOpeningsToRoomRenderer([bomWindow], bomTopology)), 2.5);
const sillPanel = bomWindowPanels.find((panel) => panel.role === "interior" && panel.part.key.endsWith("-sill"));
assert.ok(sillPanel);
const windowPanelRoom: RoomSnapshot = {
  ...roomWithCanonicalPanelFinish,
  surfaces: { walls: {
    default: { materialId: "goodrich-geff-novaclick-gnv-002-silver-oak" },
    panels: { [sillPanel.panelId]: { materialId: "goodrich-geff-novaclick-gnv-003-ash-oak" } },
  } },
};
const windowBomRows = buildRoomSurfaceMaterialBomRows([windowPanelRoom], [bomWindow]);
assert.equal(windowBomRows.find((row) => row.wallPanelId === sillPanel.panelId)?.surfaceAreaSqm, 1.26,
  "A saved fragment material must retain its area until the continuous wall is repainted.");
assert.equal(Math.round(windowBomRows.reduce((sum, row) => sum + row.surfaceAreaSqm, 0) * 100), 3332,
  "The window aperture must be excluded and its lintel/sill areas counted exactly once.");
const continuousPanelId = getContinuousWallPanelId(bomTopology[0], bomSegment,
  getWallOpenings(bomTopology[0], bomSegment, bomTopology, mapPlanOpeningsToRoomRenderer([bomWindow], bomTopology)), "interior");
assert.ok(continuousPanelId);
windowPanelRoom.surfaces!.walls!.panels![continuousPanelId] = { materialId: "goodrich-geff-novaclick-gnv-003-ash-oak" };
const continuousBomRows = buildRoomSurfaceMaterialBomRows([windowPanelRoom], [bomWindow]);
const continuousRows = continuousBomRows.filter((row) => row.wallPanelId === continuousPanelId);
assert.equal(continuousRows.length, 1, "One selected wall must produce one material quantity row.");
assert.equal(continuousRows[0].surfaceAreaSqm, 8.32, "A continuous wall finish includes all solid sections minus the window.");

// Where each part of a wall finish starts along its face (wallSurfaceLayout.ts): the parts beside and above and below a
// window follow on from each other, from the face's corner, the way each side's picture runs.
const startAlongFaceRows = [
  ...buildWallSurfacePanels(bomTopology[0], bomSegment, getWallOpenings(bomTopology[0], bomSegment, bomTopology,
    mapPlanOpeningsToRoomRenderer([bomWindow], bomTopology))),
  ...bomWindowPanels.filter((panel) => panel.role === "interior"),
].map((panel) => {
  const endJoin = { squareStart: false, squareEnd: false };
  const surface = joinedLegacyWallSurfacePart(bomTopology[0], bomSegment, panel.part, panel.side, 0.1, endJoin);
  const start = getWallSurfacePartStartAlongFace({
    room: bomTopology[0], segment: bomSegment, part: panel.part, side: panel.side, wallThickness: 0.1, ...endJoin,
  });
  return [panel.part.key.split("-").slice(-2).join("-"), Math.round(start * 1000), Math.round((start + surface.length) * 1000)];
});
assert.deepEqual(
  startAlongFaceRows,
  [["part-0", 0, 1250], ["part-1", 2650, 3900], ["window-lintel", 1250, 2650], ["window-sill", 1250, 2650]],
  "a 1.4 m window in a 4 m wall's 3.9 m room face: the parts run on from the corner without a gap or an overlap"
);
const southSegment = getWallSegments(bomTopology[0]).find((segment) => segment.wall === "south");
assert.ok(southSegment);
const southPanels = buildWallSurfacePanels(bomTopology[0], southSegment, []);
assert.deepEqual(
  southPanels.map((panel) => [panel.side, Math.round(getWallSurfacePartStartAlongFace({
    room: bomTopology[0], segment: southSegment, part: panel.part, side: panel.side, wallThickness: 0.1,
    squareStart: false, squareEnd: false,
  }) * 1000)]),
  [[-1, 0]],
  "a room face on side -1 starts at its corner too"
);

// The same for an imported plan's wall slices (canonical-floor-plan/geometry.ts): a 3 m wall, 100 mm thick, between two
// corners, its room face on the left (inside the corners, 50 mm in) and its outer face on the right (50 mm out), with a door
// from 1.0 to 1.9 m. Each face is measured from its own corner, the way its picture runs.
const importedSlice = (startOffsetMm: number, endOffsetMm: number, bottomMm: number, topMm: number) => ({
  id: `slice-${startOffsetMm}-${bottomMm}`,
  wallId: "imported-wall",
  start: { xMm: startOffsetMm, zMm: 0 },
  end: { xMm: endOffsetMm, zMm: 0 },
  startOffsetMm,
  endOffsetMm,
  bottomMm,
  topMm,
  footprint: {
    startLeft: { xMm: startOffsetMm === 0 ? 50 : startOffsetMm, zMm: 50 },
    endLeft: { xMm: endOffsetMm === 3000 ? 2950 : endOffsetMm, zMm: 50 },
    endRight: { xMm: endOffsetMm === 3000 ? 3050 : endOffsetMm, zMm: -50 },
    startRight: { xMm: startOffsetMm === 0 ? -50 : startOffsetMm, zMm: -50 },
  },
});
const importedSlices = [
  importedSlice(0, 1000, 0, 2700),
  importedSlice(1000, 1900, 2100, 2700),
  importedSlice(1900, 3000, 0, 2700),
];
const importedLayout = (side: 1 | -1) =>
  importedSlices.map((slice) => {
    const layout = wallSurfaceLayout(slice, side, importedSlices);
    return [Math.round(layout.startAlongFaceMeters * 1000), Math.round(layout.bottomAboveFloorMeters * 1000)];
  });
assert.deepEqual(
  importedLayout(1),
  [[0, 0], [950, 2100], [1850, 0]],
  "an imported wall's room face starts at its corner, and the slice above the door at the door's head"
);
assert.deepEqual(
  importedLayout(-1),
  [[2050, 0], [1150, 2100], [0, 0]],
  "its outer face starts at its own corner, at the wall's end, so no strip is left at an outside corner"
);
assert.equal(continuousBomRows.some((row) => row.wallPanelId === sillPanel.panelId), false,
  "A whole wall assignment must supersede old fragment assignments without double counting.");

const roundSummaryArea = (areaSqm: number | undefined) =>
  areaSqm === undefined ? undefined : Math.round(areaSqm * 100) / 100;
const noSampleUrl = () => null;
const panelSummaryRows = buildSurfaceSummaryRows(
  buildSurfaceRoomSummaries([windowPanelRoom], [bomWindow]),
  noSampleUrl
);
const panelSummaryRow = panelSummaryRows.find(
  (row) => row.id === `${windowPanelRoom.id}-wall-panel-${continuousPanelId}`
);
assert.ok(panelSummaryRow, "A finish applied to a selected wall must appear in the Surface Summary.");
assert.deepEqual(
  [panelSummaryRow.target, panelSummaryRow.surfaceLabel, panelSummaryRow.materialName],
  ["selected_wall", continuousRows[0].surfaceLabel, continuousRows[0].materialName],
  "The Surface Summary panel row must name the same wall and material as the export BOM."
);
assert.equal(roundSummaryArea(panelSummaryRow.areaSqm), continuousRows[0].surfaceAreaSqm,
  "The Surface Summary panel area must match the export BOM, excluding the window aperture.");
assert.equal(
  panelSummaryRows.filter((row) => row.id.includes("-wall-panel-")).length,
  continuousBomRows.filter((row) => row.wallPanelId).length,
  "Superseded fragment finishes must not add Surface Summary rows the export BOM does not have."
);
assert.equal(
  roundSummaryArea(panelSummaryRows.find((row) => row.target === "walls")?.areaSqm),
  continuousBomRows.find((row) => row.surface === "walls")?.surfaceAreaSqm,
  "The Surface Summary remaining-wall area must match the export BOM after the panel override."
);
const undonePanelSummaryRows = buildSurfaceSummaryRows(
  buildSurfaceRoomSummaries([roomWithCanonicalPanelFinish].map((room) => ({
    ...room,
    surfaces: { walls: { default: { materialId: "goodrich-geff-novaclick-gnv-002-silver-oak" } } },
  })), [bomWindow]),
  noSampleUrl
);
assert.equal(undonePanelSummaryRows.some((row) => row.id.includes("-wall-panel-")), false,
  "Removing the panel finish must remove its Surface Summary row.");
const paintedPanelSummaryRow = buildSurfaceSummaryRows(
  buildSurfaceRoomSummaries([{
    ...windowPanelRoom,
    surfaces: { walls: { panels: { [continuousPanelId]: { paintColorHex: "#F5F1E8", paintName: "Soft Gallery White" } } } },
  }], [bomWindow]),
  noSampleUrl
).find((row) => row.id.endsWith(continuousPanelId));
assert.deepEqual(
  [paintedPanelSummaryRow?.materialName, roundSummaryArea(paintedPanelSummaryRow?.areaSqm)],
  ["Soft Gallery White", 8.32],
  "A painted selected wall must appear in the Surface Summary with its aperture-free area."
);
// 4 m × 4 m bounds, minus a 2 m × 2 m notch and a 1 m × 1 m courtyard hole = 11 m².
const notchedPolygonRoom: RoomSnapshot = {
  id: "notched_polygon_room",
  name: "Notched polygon room",
  roomType: "custom",
  geometry: { width: 4, depth: 4, height: 2.5 },
  planPosition: { x: 0, z: 0 },
  planShape: "custom_polygon",
  planPolygon: [
    { x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 },
    { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 },
  ],
  planHoles: [[{ x: -1.5, z: -1.5 }, { x: -0.5, z: -1.5 }, { x: -0.5, z: -0.5 }, { x: -1.5, z: -0.5 }]],
  surfaces: { floorMaterialId: "goodrich-geff-novaclick-gnv-001-ivory-oak" },
  items: [],
  zones: [],
  savedViews: [],
};
const notchedFloorBomRow = buildRoomSurfaceMaterialBomRows([notchedPolygonRoom]).find((row) => row.surface === "floor");
assert.deepEqual([notchedFloorBomRow?.surfaceAreaSqm, notchedFloorBomRow?.roomAreaSqm], [11, 11],
  "The BOM floor must use the custom polygon minus its hole, not width × depth.");
const notchedSummaryRows = buildSurfaceSummaryRows(buildSurfaceRoomSummaries([notchedPolygonRoom], []), noSampleUrl);
assert.deepEqual(
  (["floor", "ceiling"] as const).map((target) =>
    roundSummaryArea(notchedSummaryRows.find((row) => row.target === target)?.areaSqm)),
  [11, 11],
  "Surface Summary floor and ceiling areas must match the BOM floor area for a notched room with a hole."
);
assert.doesNotMatch(fs.readFileSync("lib/surface-material-bom.ts", "utf8"), /function getRoomAreaSqm/,
  "The BOM must read floor area from lib/room-floor-area.ts instead of a private copy.");
assert.match(
  fs.readFileSync("components/editor/design-controls-plan/surfaceSummaryRows.ts", "utf8"),
  /export function buildSurfaceRoomSummaries\([\s\S]*?floorAreaSqm: getRoomSnapshotFloorAreaSqm\(room\),/,
  "Surface Summary floor and ceiling rows must read the room floor area from lib/room-floor-area.ts."
);
const notchedSurfaceRooms = buildSurfaceRoomSummaries(
  [{ ...notchedPolygonRoom, id: "plain_room", planShape: "rectangle", planHoles: undefined }, notchedPolygonRoom], []);
assert.deepEqual(
  [
    getActiveSurfaceRoomFloorAreaSqm(notchedSurfaceRooms, "notched_polygon_room"),
    getActiveSurfaceRoomFloorAreaSqm(notchedSurfaceRooms, "missing_room"),
    getActiveSurfaceRoomFloorAreaSqm([], "notched_polygon_room"),
  ],
  [11, 16, 0],
  "The active-room area readout must use the summary floor area and fall back to the first room like getActiveRoom."
);
// 5 m × 4 m L-shape minus the drawn 2.1 m × 1.68 m notch = 16.472 m²; its walls keep the 18 m bounding perimeter.
const lShapeRoom: RoomSnapshot = {
  ...notchedPolygonRoom,
  id: "l_shape_room",
  geometry: { width: 5, depth: 4, height: 2.5 },
  planShape: "l_shape",
  planHoles: undefined,
  surfaces: {
    floorMaterialId: "goodrich-geff-novaclick-gnv-001-ivory-oak",
    walls: { default: { materialId: "goodrich-geff-novaclick-gnv-002-silver-oak" } },
  },
};
const lShapeBomRows = buildRoomSurfaceMaterialBomRows([lShapeRoom]);
const lShapeFloorBomRow = lShapeBomRows.find((row) => row.surface === "floor");
assert.deepEqual([lShapeFloorBomRow?.surfaceAreaSqm, lShapeFloorBomRow?.roomAreaSqm], [16.47, 16.47],
  "The BOM floor must exclude the L-shape notch, not bill width × depth.");
assert.equal(lShapeBomRows.find((row) => row.surface === "walls")?.surfaceAreaSqm, 45,
  "L-shape walls must follow the drawn outline, whose perimeter equals its bounding rectangle's.");
const lShapeSurfaceRooms = buildSurfaceRoomSummaries([lShapeRoom], []);
const lShapeSummaryRows = buildSurfaceSummaryRows(lShapeSurfaceRooms, noSampleUrl);
assert.deepEqual(
  [
    lShapeSurfaceRooms[0].floorAreaSqm,
    ...(["floor", "ceiling"] as const).map((target) =>
      lShapeSummaryRows.find((row) => row.target === target)?.areaSqm),
  ],
  [16.472, 16.472, 16.472],
  "Surface Summary floor and ceiling areas must exclude the L-shape notch like the BOM."
);

assert.equal(normalizeWallPaintColorHex("f5f1e8"), "#F5F1E8", "wall paint colors should normalize to uppercase hex");
assert.equal(normalizeWallPaintColorHex("#xyz123"), null, "invalid wall paint colors should be rejected");
assert.equal(getWallPaintDisplayName("#F5F1E8", "  "), "Soft Gallery White", "known paint swatches should resolve display labels");
assert.equal(NIPPON_WALL_PAINT_COLOUR_COUNT, 2484, "Nippon Paint live colour import count should stay pinned");
assert.equal(
  NIPPON_PAINT_COLOURS.length,
  NIPPON_WALL_PAINT_COLOUR_COUNT,
  "all imported Nippon Paint colours must remain available to the lazy catalog"
);
assert.equal(
  WALL_PAINT_SWATCHES.length,
  12,
  "only curated wall paint defaults should remain in the eager registry"
);
const nipponWallPaintSwatches = createNipponWallPaintSwatches(NIPPON_PAINT_COLOURS);
const nipponAngelPink = getWallPaintSwatchById(
  "nippon-1162-angel-pink",
  nipponWallPaintSwatches
);
assert.ok(nipponAngelPink, "expected Nippon Paint Angel Pink swatch");
assert.equal(nipponAngelPink.hex, "#FBF1F2", "Nippon Paint swatch hex should be imported");
assert.equal(getWallPaintSwatchLabel(nipponAngelPink), "Angel Pink (1162)", "Nippon Paint labels should include codes");
assert.ok(
  getWallPaintSwatchSearchText(nipponAngelPink).includes("nippon paint") &&
    getWallPaintSwatchSearchText(nipponAngelPink).includes("1162"),
  "Nippon Paint swatches should be searchable by brand and code"
);
assert.equal(
  getWallPaintDisplayName("#FBF1F2", null, nipponWallPaintSwatches),
  "Angel Pink (1162)",
  "known Nippon Paint swatches should resolve display labels"
);

const roomWithPaintedWalls: RoomSnapshot = {
  id: "room_paint_test",
  name: "Paint Test Room",
  roomType: "bedroom",
  geometry: { width: 3, depth: 3.5, height: 2.7 },
  surfaces: {
    walls: {
      default: {
        materialId: null,
        paintColorHex: "#d7b8af",
        paintName: "Rose Plaster",
      },
      faces: {
        north: {
          materialId: null,
          paintColorHex: "#2f3b46",
          paintName: "Deep Ink",
        },
      },
      panels: {
        "room_paint_test-north-part-1": {
          materialId: null,
          paintColorHex: "#8b725e",
          paintName: "Centre Panel",
        },
      },
    },
  },
  items: [],
  zones: [],
  savedViews: [],
};
const mergedPanelAliasPlan = buildHousePlan2D(
  [
    {
      ...roomWithPaintedWalls,
      surfaces: {
        walls: {
          default: { paintName: "Current default" },
          faces: {
            north: { paintName: "Current face" },
          },
          panels: {
            "wall-panel:v2:1:room_paint_test:north:a:b:interior": {
              paintName: "Canonical panel",
            },
          },
        },
      },
      surfaceFinishes: {
        walls: {
          default: { paintColorHex: "#AABBCC" },
          faces: {
            north: { paintColorHex: "#112233" },
          },
          panels: {
            "room_paint_test-north-part-1": {
              paintColorHex: "#8B725E",
              paintName: "Legacy panel",
            },
          },
        },
      },
    },
  ],
  3,
  3.5
);
assert.deepEqual(
  mergedPanelAliasPlan.rooms[0]?.surfaces?.walls?.default,
  {
    paintColorHex: "#AABBCC",
    paintName: "Current default",
  },
  "surface aliases must deeply merge wall defaults instead of dropping compatibility fields",
);
assert.deepEqual(
  mergedPanelAliasPlan.rooms[0]?.surfaces?.walls?.faces?.north,
  {
    paintColorHex: "#112233",
    paintName: "Current face",
  },
  "surface aliases must deeply merge wall-face overrides",
);
assert.deepEqual(
  Object.keys(mergedPanelAliasPlan.rooms[0]?.surfaces?.walls?.panels ?? {}).sort(),
  [
    "room_paint_test-north-part-1",
    "wall-panel:v2:1:room_paint_test:north:a:b:interior",
  ],
  "surface aliases must deeply merge canonical and legacy panel collections",
);
const defaultPaintSettings = getWallFaceSurfaceSettings(
  roomWithPaintedWalls.surfaces,
  "east",
  normalizeFloorRotationDeg,
  clampFloorPatternScale
);
assert.equal(defaultPaintSettings.materialId, null, "painted walls should not resolve to a material id");
assert.equal(defaultPaintSettings.paintColorHex, "#D7B8AF", "default wall paint color must normalize");
assert.equal(defaultPaintSettings.paintName, "Rose Plaster", "default wall paint name must persist");
const accentPaintSettings = getWallFaceSurfaceSettings(
  roomWithPaintedWalls.surfaces,
  "north",
  normalizeFloorRotationDeg,
  clampFloorPatternScale
);
assert.equal(accentPaintSettings.paintColorHex, "#2F3B46", "selected wall paint color must override the default");
assert.equal(accentPaintSettings.paintName, "Deep Ink", "selected wall paint name must override the default");
const panelPaintSettings = getWallPanelSurfaceSettings(
  roomWithPaintedWalls.surfaces,
  "north",
  "room_paint_test-north-part-1",
  normalizeFloorRotationDeg,
  clampFloorPatternScale
);
assert.equal(
  panelPaintSettings.paintColorHex,
  "#8B725E",
  "a selected wall panel must override its parent wall face finish",
);
assert.equal(
  getWallPanelSurfaceSettings(
    roomWithPaintedWalls.surfaces,
    "north",
    "room_paint_test-north-part-1-shared-split-0-selectable-face",
    normalizeFloorRotationDeg,
    clampFloorPatternScale,
    [
      "room_paint_test-north-part-1-shared-split-0",
      "room_paint_test-north-part-1",
    ],
  ).paintColorHex,
  "#8B725E",
  "a newly split room-boundary panel must retain its former parent-panel finish",
);
assert.equal(
  getWallPanelSurfaceSettings(
    {
      ...roomWithPaintedWalls.surfaces,
      walls: {
        ...roomWithPaintedWalls.surfaces!.walls,
        panels: {
          ...roomWithPaintedWalls.surfaces!.walls?.panels,
          "room_paint_test-north-part-1-shared-split-0-selectable-face": {
            materialId: null,
            paintColorHex: "#557766",
            paintName: "Exact Split Panel",
          },
        },
      },
    },
    "north",
    "room_paint_test-north-part-1-shared-split-0-selectable-face",
    normalizeFloorRotationDeg,
    clampFloorPatternScale,
    [
      "room_paint_test-north-part-1-shared-split-0",
      "room_paint_test-north-part-1",
    ],
  ).paintColorHex,
  "#557766",
  "an exact split-panel finish must take priority over the compatibility fallback",
);
const sideSpecificPanelSettings = {
  ...roomWithPaintedWalls.surfaces,
  walls: {
    ...roomWithPaintedWalls.surfaces!.walls,
    panels: {
      ...roomWithPaintedWalls.surfaces!.walls?.panels,
      "room_paint_test-north-part-1-shared-split-0-selectable-face-side-positive": {
        materialId: null,
        paintColorHex: "#446688",
        paintName: "Positive Physical Side",
      },
      "room_paint_test-north-part-1-shared-split-0-selectable-face-side-negative": {
        materialId: null,
        paintColorHex: "#884466",
        paintName: "Negative Physical Side",
      },
    },
  },
};
assert.equal(
  getWallPanelSurfaceSettings(
    sideSpecificPanelSettings,
    "north",
    "room_paint_test-north-part-1-shared-split-0-selectable-face-side-positive",
    normalizeFloorRotationDeg,
    clampFloorPatternScale,
    [
      "room_paint_test-north-part-1-shared-split-0-selectable-face",
      "room_paint_test-north-part-1-shared-split-0",
      "room_paint_test-north-part-1",
    ],
  ).paintColorHex,
  "#446688",
  "the selected physical side must resolve its own finish",
);
assert.equal(
  getWallPanelSurfaceSettings(
    sideSpecificPanelSettings,
    "north",
    "room_paint_test-north-part-1-shared-split-0-selectable-face-side-negative",
    normalizeFloorRotationDeg,
    clampFloorPatternScale,
    [
      "room_paint_test-north-part-1-shared-split-0-selectable-face",
      "room_paint_test-north-part-1-shared-split-0",
      "room_paint_test-north-part-1",
    ],
  ).paintColorHex,
  "#884466",
  "the opposite physical side must not inherit the selected side's finish",
);
assert.equal(
  getWallPanelSurfaceSettings(
    roomWithPaintedWalls.surfaces,
    "north",
    "room_paint_test-north-part-0",
    normalizeFloorRotationDeg,
    clampFloorPatternScale,
  ).paintColorHex,
  "#2F3B46",
  "a wall panel without an override must inherit its parent wall face finish",
);
const allWallsPaintedSettings = replaceAllWallSurfaceSettings(
  roomWithPaintedWalls.surfaces,
  {
    materialId: null,
    paintColorHex: "#D77C8E",
    paintName: "Dutchess Pink (9072)",
  },
  null,
);
assert.deepEqual(
  allWallsPaintedSettings.walls?.faces,
  {},
  "applying a finish to all walls must clear stale selected-wall overrides",
);
assert.deepEqual(
  allWallsPaintedSettings.walls?.panels,
  {},
  "applying a finish to all walls must clear stale wall-panel overrides",
);
const replacedAccentPaintSettings = getWallFaceSurfaceSettings(
  allWallsPaintedSettings,
  "north",
  normalizeFloorRotationDeg,
  clampFloorPatternScale,
);
assert.equal(
  replacedAccentPaintSettings.paintColorHex,
  "#D77C8E",
  "applying paint to all walls must make every face inherit the selected paint",
);
assert.equal(
  replacedAccentPaintSettings.paintName,
  "Dutchess Pink (9072)",
  "applying paint to all walls must preserve the selected swatch name",
);

const roomWithPaintOverWallMaterial: RoomSnapshot = {
  id: "room_paint_over_material_test",
  name: "Paint Over Material Test Room",
  roomType: "bedroom",
  geometry: { width: 3, depth: 3.5, height: 2.7 },
  surfaces: {
    wallMaterialId: "goodrich-geff-novaclick-gnv-002-silver-oak",
    walls: {
      default: {
        materialId: "goodrich-geff-novaclick-gnv-002-silver-oak",
      },
      faces: {
        east: {
          materialId: null,
          paintColorHex: "#b9826e",
          paintName: "Terracotta Mist",
        },
      },
    },
  },
  items: [],
  zones: [],
  savedViews: [],
};
const paintOverMaterialSettings = getWallFaceSurfaceSettings(
  roomWithPaintOverWallMaterial.surfaces,
  "east",
  normalizeFloorRotationDeg,
  clampFloorPatternScale
);
assert.equal(
  paintOverMaterialSettings.materialId,
  null,
  "selected wall paint must clear inherited default wall material"
);
assert.equal(
  paintOverMaterialSettings.paintColorHex,
  "#B9826E",
  "selected wall paint must render as paint instead of inherited wall material"
);
assert.equal(
  buildRoomSurfaceMaterialBomRows([roomWithPaintOverWallMaterial]).some((row) => row.surface === "selected_wall"),
  false,
  "selected wall paint over a material must not create a selected-wall material BOM row"
);
assert.equal(
  buildRoomSurfaceMaterialBomRows([roomWithPaintedWalls]).length,
  0,
  "custom wall paint must not create shoppable surface material BOM rows"
);
assert.equal(
  buildCheckoutReadinessRows([roomWithPaintedWalls]).length,
  0,
  "custom wall paint must not create furniture checkout readiness rows"
);

const fixtureSource = goodrichEntries.find(
  (entry) => entry.surface_material.material_id === "goodrich-geff-novaclick-gnv-001-ivory-oak"
);
assert.ok(fixtureSource, "expected a Goodrich fixture source for negative audit cases");
const validPublishedFixture = buildValidPublishedFixture(fixtureSource);
assert.deepEqual(
  auditSurfaceMaterialEntry(validPublishedFixture).failures,
  [],
  "fully specified published flooring fixture should pass surface audit"
);

const invalidVocabFixture = cloneSurfaceMaterial(validPublishedFixture);
invalidVocabFixture.surface_material.material_family = "invalid_family" as SurfaceMaterial["surface_material"]["material_family"];
invalidVocabFixture.classification.tone = ["warm", "not_approved"];
const invalidVocabFailures = auditSurfaceMaterialEntry(invalidVocabFixture).failures.join("\n");
assert.match(invalidVocabFailures, /surface_material\.material_family has invalid value/);
assert.match(invalidVocabFailures, /classification\.tone\[1\] has invalid value/);

const missingPublishedTextureFixture = cloneSurfaceMaterial(validPublishedFixture);
missingPublishedTextureFixture.texture_assets.swatch_url = null;
missingPublishedTextureFixture.texture_assets.base_color_url = null;
missingPublishedTextureFixture.texture_assets.tileable = "needs_confirmation";
missingPublishedTextureFixture.texture_assets.texture_repeat_size_cm = null;
missingPublishedTextureFixture.physical_specs.plank_width_mm = null;
missingPublishedTextureFixture.import_governance.publish_blockers = ["add_swatch_asset"];
const missingPublishedTextureFailures = auditSurfaceMaterialEntry(missingPublishedTextureFixture).failures.join("\n");
assert.match(missingPublishedTextureFailures, /published surface materials require texture_assets\.swatch_url/);
assert.match(missingPublishedTextureFailures, /published surface materials require texture_assets\.base_color_url/);
assert.match(missingPublishedTextureFailures, /published surface materials require known texture tileability/);
assert.match(missingPublishedTextureFailures, /published surface materials require texture_assets\.texture_repeat_size_cm/);
assert.match(missingPublishedTextureFailures, /published surface materials require physical dimensions/);
assert.match(
  missingPublishedTextureFailures,
  /published surface materials must not have unresolved publish blockers/,
  "published surface materials must not have unresolved publish blockers"
);

const missingDraftBlockerFixture = cloneSurfaceMaterial(fixtureSource);
missingDraftBlockerFixture.texture_assets.swatch_url = null;
missingDraftBlockerFixture.texture_assets.texture_repeat_size_cm = null;
missingDraftBlockerFixture.physical_specs.plank_width_mm = null;
missingDraftBlockerFixture.physical_specs.plank_length_mm = null;
missingDraftBlockerFixture.import_governance.publish_blockers = ["confirm_exact_goodrich_product_code"];
const missingDraftBlockerFailures = auditSurfaceMaterialEntry(missingDraftBlockerFixture).failures.join("\n");
assert.match(missingDraftBlockerFailures, /add_swatch_asset blocker/);
assert.match(missingDraftBlockerFailures, /add_tileable_base_color_texture blocker/);
assert.match(missingDraftBlockerFailures, /confirm_supplier_image_usage_rights blocker/);
assert.match(missingDraftBlockerFailures, /confirm_texture_tileability blocker/);
assert.match(missingDraftBlockerFailures, /confirm_physical_dimensions blocker/);

const missingSamplePathFixture = cloneSurfaceMaterial(validPublishedFixture);
missingSamplePathFixture.source.sample_request_url = null;
missingSamplePathFixture.commerce.sample_request_url = null;
const missingSamplePathFailures = auditSurfaceMaterialEntry(missingSamplePathFixture).failures.join("\n");
assert.match(missingSamplePathFailures, /sample_request_url is required/);
assert.match(missingSamplePathFailures, /quote_or_sample surface materials require/);

console.log("Surface material schema audit passed.");
console.log(`- files scanned: ${result.files.length}`);
console.log(`- Goodrich draft fixtures: ${goodrichEntries.length}`);
