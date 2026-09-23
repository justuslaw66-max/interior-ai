import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { CABINET_HARDWARE } from "../features/cabinetry/catalog/hardware";
import { CABINET_MATERIALS } from "../features/cabinetry/catalog/materials";
import { CABINET_PRESET_OPTIONS } from "../features/cabinetry/presets";
import {
  CABINET_CONSTRUCTION_RESET_FIELDS,
  CABINET_GUIDED_DIMENSION_INCREMENT_MM,
  CABINET_SHELF_LAYOUT_FIELDS,
  GUIDED_HARDWARE,
  GUIDED_MATERIALS,
  GUIDED_TEMPLATE_CATEGORIES,
  componentTypes,
  doorStyles,
  edgeTreatmentOptions,
  exposedFaceOptions,
  frontTypes,
  grainDirectionOptions,
  hingeSides,
  laundryApplianceKinds,
  lifestyleInsertKinds,
  stairScribeDirections,
  trimEndTreatments,
  trimPlacements,
  unitTypes,
} from "../features/cabinetry/components/CabinetryStudio.config";

assert.equal(CABINET_GUIDED_DIMENSION_INCREMENT_MM, 10);

assert.deepEqual(frontTypes, [
  "open",
  "single_door",
  "double_door",
  "drawer_stack",
  "door_and_drawer",
  "slab_panel",
]);
assert.deepEqual(doorStyles, ["flat_slab", "shaker", "glass", "fluted"]);
assert.deepEqual(grainDirectionOptions.map((option) => option.value), [
  "automatic",
  "vertical",
  "horizontal",
  "none",
]);
assert.deepEqual(edgeTreatmentOptions.map((option) => option.value), [
  "automatic",
  "matching_edge_band",
  "contrasting_edge_band",
  "solid_lipping",
  "painted_edge",
  "none",
]);
assert.deepEqual(exposedFaceOptions.map((option) => option.value), [
  "front",
  "back",
  "left",
  "right",
  "top",
  "bottom",
]);
assert.deepEqual(unitTypes, [
  "base",
  "wall",
  "tall",
  "vanity",
  "tv_console",
  "wardrobe",
]);
assert.deepEqual(componentTypes, [
  "cabinet",
  "ceiling_beam_array",
  "coffered_ceiling_grid",
  "trim_run",
  "fireplace_surround_frame",
  "wall_bed_panel",
  "fold_down_worksurface",
]);
assert.deepEqual(hingeSides, ["left", "right", "double"]);
assert.deepEqual(stairScribeDirections, ["rises_left", "rises_right"]);
assert.deepEqual(lifestyleInsertKinds, ["pet_bed", "toy_bin", "hobby_tray"]);
assert.deepEqual(laundryApplianceKinds, [
  "washer",
  "dryer",
  "washer_dryer",
  "stacked_washer_dryer",
]);
assert.deepEqual(trimPlacements, [
  "baseboard",
  "crown_moulding",
  "casing",
  "chair_rail",
  "picture_rail",
  "generic_trim",
]);
assert.deepEqual(trimEndTreatments, ["butt", "mitered_return", "coped", "scribed"]);

assert.equal(
  new Set(CABINET_CONSTRUCTION_RESET_FIELDS).size,
  CABINET_CONSTRUCTION_RESET_FIELDS.length,
  "construction reset fields must remain unique"
);
assert.deepEqual(CABINET_SHELF_LAYOUT_FIELDS, [
  "shelfCount",
  "shelfSpacingMode",
  "shelfPositionsMm",
  "shelfPinRowsEnabled",
  "shelfPinRowPairCount",
  "shelfPinHoleCount",
  "shelfPinHoleSpacing",
  "shelfPinInsetFromFront",
  "shelfPinStartHeight",
]);
assert.deepEqual(
  GUIDED_TEMPLATE_CATEGORIES,
  Array.from(new Set(CABINET_PRESET_OPTIONS.map((preset) => preset.category)))
);
assert.deepEqual(
  GUIDED_MATERIALS.map((material) => material.id),
  CABINET_MATERIALS.filter(
    (material) =>
      !["service_zone_marker", "upholstery_neutral", "glass"].includes(material.id)
  ).map((material) => material.id)
);
assert.deepEqual(
  GUIDED_HARDWARE.map((hardware) => hardware.id),
  CABINET_HARDWARE.filter((hardware) =>
    [
      "none",
      "brushed_steel_bar_pull",
      "black_bar_pull",
      "round_knob",
      "edge_pull",
      "push_to_open",
    ].includes(hardware.id)
  ).map((hardware) => hardware.id)
);

const studioSource = readFileSync(
  "features/cabinetry/components/CabinetryStudio.tsx",
  "utf8"
);
assert.match(studioSource, /from "\.\/CabinetryStudio\.config"/);
assert.match(studioSource, /import type \{[\s\S]*?from "\.\/CabinetryStudio\.types"/);
for (const movedDeclaration of [
  "frontTypes",
  "CABINET_CONSTRUCTION_RESET_FIELDS",
  "CABINET_SHELF_LAYOUT_FIELDS",
  "GUIDED_TEMPLATE_CATEGORIES",
  "CabinetHistoryEntry",
  "SpecialtyNumberFieldDefinition",
]) {
  assert.doesNotMatch(
    studioSource,
    new RegExp(`^(?:const|type|interface) ${movedDeclaration}\\b`, "m"),
    `${movedDeclaration} must remain outside the Studio composition root.`
  );
}

const studioTypesSource = readFileSync(
  "features/cabinetry/components/CabinetryStudio.types.ts",
  "utf8"
);
assert.doesNotMatch(studioTypesSource, /^import\s+(?!type\b)/m);

console.log("Cabinetry Studio static configuration and type boundaries passed.");
