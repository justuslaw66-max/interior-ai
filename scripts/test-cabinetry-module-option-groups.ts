import assert from "node:assert/strict";

import type { MillworkAssemblyType } from "../features/millwork/types";
import {
  CABINET_MODULE_OPTION_GROUP_BY_CONTROL_TEST_ID,
  CABINET_MODULE_OPTION_GROUP_IDS,
  CABINET_MODULE_OPTION_GROUP_REGISTRY,
  getCabinetModuleOptionGroupIdForControlTestId,
  getVisibleCabinetModuleOptionGroupIds,
  type CabinetModuleOptionGroupId,
} from "../features/cabinetry/moduleOptionGroups";
import {
  CABINET_PRESET_OPTIONS,
  createCabinetPreset,
} from "../features/cabinetry/presets";
import {
  CABINET_PROPERTY_REGISTRY,
  filterCabinetProperties,
} from "../features/cabinetry/propertyRegistry";

const BASE_CABINET_GROUPS = [
  "installation_cleat",
  "shelf_pins",
  "lighting",
] as const satisfies readonly CabinetModuleOptionGroupId[];

const ASSEMBLY_GROUPS: Readonly<
  Record<MillworkAssemblyType, readonly CabinetModuleOptionGroupId[]>
> = {
  base: [],
  wall: [],
  tall: [],
  vanity: ["sink"],
  tv_console: [],
  wardrobe: ["hanging_rods", "hamper"],
  cabinet_run: [],
  closet_system: ["hanging_rods", "hamper"],
  murphy_bed: [],
  fold_down_desk: [],
  platform_storage_bed: ["platform_bed"],
  media_wall: ["media"],
  mudroom_storage: ["mudroom"],
  home_office_built_in: ["office"],
  library_wall: ["library"],
  laundry_room_cabinetry: ["hamper", "laundry"],
  window_seat: ["seating"],
  banquette: ["seating"],
  home_bar: ["wine"],
  kitchen_island: [],
  pantry_system: ["pantry"],
  wine_storage: ["wine"],
  pet_built_in: ["lifestyle"],
  kids_storage: ["lifestyle"],
  hobby_storage: ["lifestyle"],
  wall_paneling: ["panel"],
  slat_wall: ["slat"],
  ceiling_beams: [],
  coffered_ceiling: [],
  fireplace_surround: [],
  trim_package: [],
  under_stair_storage: ["stair"],
  room_divider_storage: ["room_divider"],
};

const COMPONENT_GROUPS = {
  ceiling_beam_array: "ceiling",
  coffered_ceiling_grid: "ceiling",
  trim_run: "trim",
  fireplace_surround_frame: "fireplace",
  wall_bed_panel: "convertible",
  fold_down_worksurface: "convertible",
} as const satisfies Partial<
  Record<string, CabinetModuleOptionGroupId>
>;

const FEATURE_STATE_GROUPS = [
  ["antiTipAnchorEnabled", "anti_tip"],
  ["hamperPullOutEnabled", "hamper"],
  ["pantryPullOutTrayEnabled", "pantry"],
  ["stemwareRackEnabled", "wine"],
  ["sinkCutoutEnabled", "sink"],
  ["laundryApplianceBayEnabled", "laundry"],
  ["officeWorksurfaceEnabled", "office"],
  ["mediaWallEnabled", "media"],
  ["libraryLadderRailEnabled", "library"],
] as const;

const CORE_HIDDEN_CONTEXTUAL_GROUPS = [
  "slat",
  "panel",
  "ceiling",
  "trim",
  "fireplace",
  "convertible",
  "platform_bed",
  "stair",
  "room_divider",
  "lifestyle",
  "pantry",
  "wine",
  "seating",
  "mudroom",
  "sink",
  "laundry",
  "office",
  "media",
  "library",
] as const satisfies readonly CabinetModuleOptionGroupId[];

assert.equal(
  CABINET_PRESET_OPTIONS.length,
  33,
  "the option-group audit must cover the complete preset catalog"
);

for (const preset of CABINET_PRESET_OPTIONS) {
  const definition = createCabinetPreset(
    preset.id,
    `module-option-groups-${preset.id}`
  );

  for (const presetModule of definition.modules) {
    const componentType = presetModule.millworkComponentType ?? "cabinet";
    const expected = new Set<CabinetModuleOptionGroupId>();
    if (componentType === "cabinet") {
      BASE_CABINET_GROUPS.forEach((groupId) => expected.add(groupId));
      if (definition.millworkAssemblyType) {
        ASSEMBLY_GROUPS[definition.millworkAssemblyType].forEach((groupId) =>
          expected.add(groupId)
        );
      }
      if (presetModule.type === "tall" || presetModule.type === "wardrobe") {
        expected.add("anti_tip");
      }
      if ((presetModule.hangingRodCount ?? 0) > 0) expected.add("hanging_rods");
      if ((presetModule.wineRackColumnCount ?? 0) > 0) expected.add("wine");
      for (const [field, groupId] of FEATURE_STATE_GROUPS) {
        if (presetModule[field] === true) expected.add(groupId);
      }
    } else {
      const componentGroup = COMPONENT_GROUPS[componentType];
      if (componentGroup) expected.add(componentGroup);
    }

    const actual = getVisibleCabinetModuleOptionGroupIds({
      assemblyType: definition.millworkAssemblyType,
      module: presetModule,
    });
    assert.deepEqual(
      [...actual].sort(),
      [...expected].sort(),
      `${preset.id}/${presetModule.id} should expose only contextually relevant option groups`
    );
  }
}

const coreCasework = createCabinetPreset("base", "module-option-core-casework");
const coreContext = {
  assemblyType: coreCasework.millworkAssemblyType,
  module: coreCasework.modules[0],
};
const coreGroups = getVisibleCabinetModuleOptionGroupIds(coreContext);
for (const hiddenGroup of CORE_HIDDEN_CONTEXTUAL_GROUPS) {
  assert(
    !coreGroups.includes(hiddenGroup),
    `ordinary base casework must not leak the ${hiddenGroup} group`
  );
  assert(
    CABINET_PROPERTY_REGISTRY.some(
      (property) =>
        getCabinetModuleOptionGroupIdForControlTestId(property.controlTestId) ===
        hiddenGroup
    ),
    `${hiddenGroup} needs a property-search control that can reveal it explicitly`
  );
}

const explicitlyRevealed = getVisibleCabinetModuleOptionGroupIds(
  coreContext,
  "slat"
);
assert(
  explicitlyRevealed.includes("slat"),
  "property search should be able to reveal one otherwise hidden group"
);
assert(
  !getVisibleCabinetModuleOptionGroupIds(coreContext).includes("slat"),
  "an explicit reveal must not mutate persistent applicability"
);

const baseSlatSearch = filterCabinetProperties(
  "slat width",
  coreContext,
  { includeInapplicable: true }
);
const slatProperty = baseSlatSearch.find(
  (property) => property.field === "slatWidth"
);
assert(slatProperty, "explicit advanced search should find a hidden slat property");
assert.equal(
  getCabinetModuleOptionGroupIdForControlTestId(slatProperty.controlTestId),
  "slat",
  "a searched control must identify the group to mount before focus"
);
assert.equal(
  filterCabinetProperties("slat width", coreContext).length,
  0,
  "contextual domain search should remain strict unless the UI requests an advanced reveal"
);

const mappedControlIds = Object.entries(
  CABINET_MODULE_OPTION_GROUP_REGISTRY
).flatMap(([groupId, group]) =>
  group.controlTestIds.map((controlTestId) => [controlTestId, groupId] as const)
);
assert.equal(
  new Set(mappedControlIds.map(([controlTestId]) => controlTestId)).size,
  mappedControlIds.length,
  "each advanced control test ID must map to exactly one option group"
);
for (const [controlTestId, groupId] of mappedControlIds) {
  assert.equal(
    CABINET_MODULE_OPTION_GROUP_BY_CONTROL_TEST_ID[controlTestId],
    groupId,
    `${controlTestId} should map back to ${groupId}`
  );
}
assert.equal(
  CABINET_MODULE_OPTION_GROUP_IDS.length,
  Object.keys(CABINET_MODULE_OPTION_GROUP_REGISTRY).length,
  "the keyed registry must exhaust every declared group ID"
);
const convertedBase = createCabinetPreset(
  "base",
  "module-option-feature-state"
);
convertedBase.modules[0].mediaWallEnabled = true;
assert(
  getVisibleCabinetModuleOptionGroupIds({
    assemblyType: convertedBase.millworkAssemblyType,
    module: convertedBase.modules[0],
  }).includes("media"),
  "an imported active optional feature must remain editable after assembly conversion"
);

console.log(
  "Cabinetry module option-group checks passed (33/33 presets, mappings, search reveal)"
);
