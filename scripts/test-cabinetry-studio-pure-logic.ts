import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  getCabinetPresetMillworkAssemblyType,
  CABINET_PRESET_OPTIONS,
  createCabinetPreset,
} from "../features/cabinetry/presets";
import type {
  CabinetDefinition,
  CabinetFrontType,
  CabinetModuleDefinition,
} from "../features/cabinetry/types";
import {
  resizeCabinetDefinition,
  roundToIncrement,
} from "../features/cabinetry/components/CabinetryStudio.calculations";
import { formatCabinetLabel } from "../features/cabinetry/formatCabinetLabel";
import {
  CABINET_RESIZE_MINIMUM_MODULE_DEPTH_MM,
  CABINET_RESIZE_MINIMUM_MODULE_HEIGHT_MM,
} from "../features/cabinetry/components/CabinetryStudio.config";
import {
  cabinetPresetIdFromDefinition,
  cabinetShelfLayoutParameterPath,
  getSpecialtyNumberFields,
  getSpecialtyNumberValue,
  guidedFrontPatch,
} from "../features/cabinetry/components/CabinetryStudio.selectors";
import type { SpecialtyNumberFieldDefinition } from "../features/cabinetry/components/CabinetryStudio.types";

assert.equal(roundToIncrement(104), 100);
assert.equal(roundToIncrement(105), 110);
assert.equal(roundToIncrement(127, 25), 125);
assert.equal(roundToIncrement(-15), -10, "preserve Math.round behavior for ties");
assert.equal(formatCabinetLabel("matching_edge_band"), "Matching Edge Band");
assert.equal(formatCabinetLabel("cabinet"), "Cabinet");
assert.equal(CABINET_RESIZE_MINIMUM_MODULE_HEIGHT_MM, 200);
assert.equal(CABINET_RESIZE_MINIMUM_MODULE_DEPTH_MM, 120);

const baseDefinition = createCabinetPreset("base", "pure-logic-base");
const twoModuleDefinition: CabinetDefinition = {
  ...baseDefinition,
  modules: [
    { ...baseDefinition.modules[0], id: "module-tall", height: 720, depth: 560 },
    { ...baseDefinition.modules[0], id: "module-short", height: 360, depth: 280 },
  ],
};

const resizedHeight = resizeCabinetDefinition(
  twoModuleDefinition,
  "height",
  900
);
assert.deepEqual(
  resizedHeight.modules.map((module) => module.height),
  [900, 450],
  "height resizing must preserve the tallest module as the exact requested run height"
);
assert.deepEqual(
  twoModuleDefinition.modules.map((module) => module.height),
  [720, 360],
  "height resizing must not mutate the source definition"
);

const resizedDepth = resizeCabinetDefinition(twoModuleDefinition, "depth", 700);
assert.deepEqual(
  resizedDepth.modules.map((module) => module.depth),
  [700, 350],
  "depth resizing must preserve the deepest module as the exact requested run depth"
);

assert.deepEqual(
  resizeCabinetDefinition(twoModuleDefinition, "height", 50).modules.map(
    (module) => module.height
  ),
  [200, 200],
  "height resizing must retain the existing 200 mm module floor"
);
assert.deepEqual(
  resizeCabinetDefinition(twoModuleDefinition, "depth", 50).modules.map(
    (module) => module.depth
  ),
  [120, 120],
  "depth resizing must retain the existing 120 mm module floor"
);
assert.equal(
  resizeCabinetDefinition(twoModuleDefinition, "height", Number.NaN),
  twoModuleDefinition,
  "non-finite requests must return the original definition reference"
);
const emptyDefinition: CabinetDefinition = { ...baseDefinition, modules: [] };
assert.equal(
  resizeCabinetDefinition(emptyDefinition, "depth", 500),
  emptyDefinition,
  "empty definitions must return the original reference"
);

assert.equal(cabinetPresetIdFromDefinition(undefined), null);
assert.equal(cabinetPresetIdFromDefinition(baseDefinition), "base");
assert.equal(
  cabinetPresetIdFromDefinition({
    ...baseDefinition,
    sourcePresetId: undefined,
    name: "  WALL CABINET  ",
  }),
  "wall",
  "legacy names must continue to match case-insensitively"
);
assert.equal(
  cabinetPresetIdFromDefinition({
    ...baseDefinition,
    sourcePresetId: undefined,
    name: "Legacy media installation",
    millworkAssemblyType: "media_wall",
  }),
  "media_wall",
  "a unique legacy assembly type must continue to recover its preset"
);
assert.equal(
  cabinetPresetIdFromDefinition({
    ...baseDefinition,
    sourcePresetId: undefined,
    name: "Unknown legacy cabinet",
    millworkAssemblyType: undefined,
  }),
  null
);
for (const preset of CABINET_PRESET_OPTIONS) {
  assert.equal(
    getCabinetPresetMillworkAssemblyType(preset.id),
    createCabinetPreset(preset.id, "assembly-compatibility").millworkAssemblyType,
    `${preset.id} must preserve its legacy assembly matching value`
  );
}

assert.deepEqual(
  getSpecialtyNumberFields("ceiling_beam_array").map((field) => field.field),
  ["ceilingBeamCount", "ceilingBeamWidth", "ceilingBeamDepth"]
);
assert.deepEqual(
  getSpecialtyNumberFields("coffered_ceiling_grid").map((field) => field.field),
  [
    "ceilingBeamWidth",
    "ceilingBeamDepth",
    "ceilingGridColumnCount",
    "ceilingGridRowCount",
  ]
);
assert.deepEqual(
  getSpecialtyNumberFields("trim_run").map((field) => field.field),
  [
    "trimMemberCount",
    "trimProfileWidth",
    "trimProfileDepth",
    "trimSetoutHeight",
    "trimReturnDepth",
    "trimMiterAngle",
  ]
);
assert.deepEqual(
  getSpecialtyNumberFields("fireplace_surround_frame").map((field) => field.field),
  [
    "fireplaceOpeningWidth",
    "fireplaceOpeningHeight",
    "fireplaceLegWidth",
    "fireplaceHeaderHeight",
    "fireplaceMantelHeight",
    "fireplaceMantelDepth",
  ]
);
assert.deepEqual(
  getSpecialtyNumberFields("wall_bed_panel").map((field) => field.field),
  [
    "convertiblePanelThickness",
    "convertiblePanelHeight",
    "convertibleOpenDepth",
    "convertibleHingeHeight",
    "convertibleSupportLegCount",
    "convertibleSupportLegWidth",
    "convertibleSupportLegDepth",
  ]
);

const specialtyModule: CabinetModuleDefinition = {
  ...baseDefinition.modules[0],
  ceilingBeamCount: 7,
  ceilingBeamWidth: 91,
  ceilingBeamDepth: 143,
  ceilingGridColumnCount: 4,
  ceilingGridRowCount: 5,
  trimMemberCount: 8,
  trimProfileWidth: 67,
  trimProfileDepth: 22,
  trimSetoutHeight: 312,
  trimReturnDepth: 45,
  trimMiterAngle: 37,
  fireplaceOpeningWidth: 1_111,
  fireplaceOpeningHeight: 777,
  fireplaceLegWidth: 188,
  fireplaceHeaderHeight: 199,
  fireplaceMantelHeight: 1_234,
  fireplaceMantelDepth: 255,
  convertiblePanelThickness: 31,
  convertiblePanelHeight: 888,
  convertibleOpenDepth: 999,
  convertibleHingeHeight: 333,
  convertibleSupportLegCount: 3,
  convertibleSupportLegWidth: 44,
  convertibleSupportLegDepth: 55,
};
const ceilingBeamModule: CabinetModuleDefinition = {
  ...specialtyModule,
  millworkComponentType: "ceiling_beam_array",
};
const ceilingGridModule: CabinetModuleDefinition = {
  ...specialtyModule,
  millworkComponentType: "coffered_ceiling_grid",
};
const trimModule: CabinetModuleDefinition = {
  ...specialtyModule,
  millworkComponentType: "trim_run",
};
const fireplaceModule: CabinetModuleDefinition = {
  ...specialtyModule,
  millworkComponentType: "fireplace_surround_frame",
};
const convertibleModule: CabinetModuleDefinition = {
  ...specialtyModule,
  millworkComponentType: "wall_bed_panel",
};
const specialtyValueCases: Array<
  [SpecialtyNumberFieldDefinition["field"], number, CabinetModuleDefinition]
> = [
  ["ceilingBeamCount", 7, ceilingBeamModule],
  ["ceilingBeamWidth", 91, ceilingBeamModule],
  ["ceilingBeamDepth", 143, ceilingBeamModule],
  ["ceilingGridColumnCount", 4, ceilingGridModule],
  ["ceilingGridRowCount", 5, ceilingGridModule],
  ["trimMemberCount", 8, trimModule],
  ["trimProfileWidth", 67, trimModule],
  ["trimProfileDepth", 22, trimModule],
  ["trimSetoutHeight", 312, trimModule],
  ["trimReturnDepth", 45, trimModule],
  ["trimMiterAngle", 37, trimModule],
  ["fireplaceOpeningWidth", 1_111, fireplaceModule],
  ["fireplaceOpeningHeight", 777, fireplaceModule],
  ["fireplaceLegWidth", 188, fireplaceModule],
  ["fireplaceHeaderHeight", 199, fireplaceModule],
  ["fireplaceMantelHeight", 1_234, fireplaceModule],
  ["fireplaceMantelDepth", 255, fireplaceModule],
  ["convertiblePanelThickness", 31, convertibleModule],
  ["convertiblePanelHeight", 888, convertibleModule],
  ["convertibleOpenDepth", 999, convertibleModule],
  ["convertibleHingeHeight", 333, convertibleModule],
  ["convertibleSupportLegCount", 3, convertibleModule],
  ["convertibleSupportLegWidth", 44, convertibleModule],
  ["convertibleSupportLegDepth", 55, convertibleModule],
];
for (const [field, expected, module] of specialtyValueCases) {
  assert.equal(getSpecialtyNumberValue(module, field), expected, field);
}

assert.equal(
  cabinetShelfLayoutParameterPath("module-17"),
  "modules.module-17.shelfLayout"
);
const frontExpectations: Record<
  CabinetFrontType,
  Pick<CabinetModuleDefinition, "doorCount" | "drawerCount"> & {
    hingeSide?: CabinetModuleDefinition["hingeSide"];
  }
> = {
  open: { doorCount: 0, drawerCount: 0 },
  single_door: { doorCount: 1, drawerCount: 0, hingeSide: "left" },
  double_door: { doorCount: 2, drawerCount: 0, hingeSide: "double" },
  drawer_stack: { doorCount: 0, drawerCount: 3 },
  door_and_drawer: { doorCount: 2, drawerCount: 1, hingeSide: "double" },
  slab_panel: { doorCount: 1, drawerCount: 0 },
};
const frontTypes: CabinetFrontType[] = [
  "open",
  "single_door",
  "double_door",
  "drawer_stack",
  "door_and_drawer",
  "slab_panel",
];
for (const frontType of frontTypes) {
  const patch = guidedFrontPatch(frontType);
  assert.equal(patch.frontType, frontType);
  assert.equal(patch.doorCount, frontExpectations[frontType].doorCount);
  assert.equal(patch.drawerCount, frontExpectations[frontType].drawerCount);
  assert.equal(patch.hingeSide, frontExpectations[frontType].hingeSide);
  assert.equal(patch.doorLayoutMode, "recommended");
  assert.equal(patch.drawerHeightMode, "recommended");
  assert.equal(patch.drawerHeightProportions, undefined);
}

const studioSource = readFileSync(
  "features/cabinetry/components/CabinetryStudio.tsx",
  "utf8"
);
for (const movedFunction of [
  "cabinetPresetIdFromDefinition",
  "getSpecialtyNumberFields",
  "getSpecialtyNumberValue",
  "cabinetShelfLayoutParameterPath",
  "roundToIncrement",
  "resizeCabinetDefinition",
  "guidedFrontPatch",
]) {
  assert.doesNotMatch(
    studioSource,
    new RegExp(`^function ${movedFunction}\\b`, "m"),
    `${movedFunction} must remain outside the Studio composition root.`
  );
}

console.log("Cabinetry Studio pure calculation and selector tests passed.");
