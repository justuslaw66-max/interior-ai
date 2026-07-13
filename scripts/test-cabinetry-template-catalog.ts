import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CABINET_HARDWARE } from "../features/cabinetry/catalog/hardware";
import { CABINET_MATERIALS } from "../features/cabinetry/catalog/materials";
import {
  CABINET_PRESET_OPTIONS,
  cabinetPresetMatchesCatalogFilters,
  createCabinetPreset,
  getCabinetPresetSearchText,
  type CabinetPresetId,
  type CabinetTemplateCategory,
} from "../features/cabinetry/presets";
import { validateCabinetDefinition } from "../features/cabinetry/validation";

const EXPECTED_PRESET_IDS: readonly CabinetPresetId[] = [
  "base",
  "wall",
  "tall",
  "wardrobe",
  "vanity",
  "tv_console",
  "cabinet_run",
  "closet_system",
  "media_wall",
  "mudroom_storage",
  "laundry_room",
  "home_office_built_in",
  "library_wall",
  "window_seat",
  "banquette",
  "murphy_bed",
  "fold_down_desk",
  "platform_storage_bed",
  "under_stair_storage",
  "room_divider_storage",
  "home_bar",
  "kitchen_island",
  "pantry_system",
  "wine_storage",
  "pet_built_in",
  "kids_storage",
  "hobby_storage",
  "wall_paneling",
  "slat_wall",
  "ceiling_beams",
  "coffered_ceiling",
  "fireplace_surround",
  "trim_package",
];

const allowedDifficulties = new Set(["Quick", "Guided", "Advanced"]);
const allowedHosts = new Set(["Floor", "Wall", "Ceiling", "Flexible"]);
const allowedSafetyClassifications = new Set([
  "standard",
  "anchoring_required",
  "operational_clearance_required",
  "structural_review_required",
  "specialist_installation_required",
]);
const materialIds = new Set(CABINET_MATERIALS.map((material) => material.id));
const hardwareIds = new Set(CABINET_HARDWARE.map((hardware) => hardware.id));
const specialtyThumbnailKinds: Partial<
  Record<CabinetPresetId, (typeof CABINET_PRESET_OPTIONS)[number]["visualThumbnail"]["kind"]>
> = {
  murphy_bed: "wall_bed",
  fold_down_desk: "fold_down_desk",
  platform_storage_bed: "platform_bed",
  under_stair_storage: "under_stair",
  room_divider_storage: "room_divider",
  wall_paneling: "wall_paneling",
  slat_wall: "slat_wall",
  ceiling_beams: "ceiling_beams",
  coffered_ceiling: "coffered_ceiling",
  fireplace_surround: "fireplace_surround",
  trim_package: "trim_package",
};

assert.equal(CABINET_PRESET_OPTIONS.length, 33, "the released catalog must retain all 33 templates");
assert.deepEqual(
  CABINET_PRESET_OPTIONS.map((option) => option.id),
  EXPECTED_PRESET_IDS,
  "the released template IDs and their stable order must not drift",
);
assert.equal(
  new Set(CABINET_PRESET_OPTIONS.map((option) => option.name)).size,
  CABINET_PRESET_OPTIONS.length,
  "template names must be unique",
);

for (const option of CABINET_PRESET_OPTIONS) {
  const definition = createCabinetPreset(option.id, `template-catalog-${option.id}`);
  const validation = validateCabinetDefinition(definition);

  assert(option.name.trim().length > 0, `${option.id} must have a name`);
  assert.equal(option.name, option.label, `${option.id} name and card label must agree`);
  assert.deepEqual(
    option.visualThumbnail,
    { kind: specialtyThumbnailKinds[option.id] ?? "casework", presetId: option.id },
    `${option.id} must declare its generated visual thumbnail`,
  );
  assert(
    option.description.length >= 24 && option.description.length <= 160,
    `${option.id} must have a concise, useful description`,
  );
  assert.deepEqual(
    option.defaultDimensions,
    {
      widthMm: definition.totalWidth,
      heightMm: definition.height,
      depthMm: definition.depth,
    },
    `${option.id} catalog dimensions must match the generated default`,
  );
  assert(
    Object.values(option.defaultDimensions).every(
      (dimension) => Number.isFinite(dimension) && dimension > 0,
    ),
    `${option.id} dimensions must be finite and positive`,
  );
  assert.equal(
    option.defaultModuleLayout.length,
    definition.modules.length,
    `${option.id} must expose its complete default module layout`,
  );
  assert.deepEqual(
    option.defaultModuleLayout,
    definition.modules.map((module) => ({
      type: module.type,
      width: module.width,
      height: module.height,
      depth: module.depth,
      frontType: module.frontType,
      doorStyle: module.doorStyle,
      doorCount: module.doorCount,
      drawerCount: module.drawerCount,
      shelfCount: module.shelfCount,
      materialId: module.materialId,
      frontMaterialId: module.frontMaterialId,
      hardwareId: module.hardwareId ?? "none",
    })),
    `${option.id} catalog layout must match every generated default module`,
  );
  assert(option.defaultMaterialIds.length > 0, `${option.id} must declare a default material`);
  assert(
    option.defaultMaterialIds.every((materialId) => materialIds.has(materialId)),
    `${option.id} default materials must resolve in the material catalog`,
  );
  assert(option.defaultHardwareIds.length > 0, `${option.id} must declare default hardware`);
  assert(
    option.defaultHardwareIds.every((hardwareId) => hardwareIds.has(hardwareId)),
    `${option.id} default hardware must resolve in the hardware catalog`,
  );
  assert(
    option.supportedCustomizationOptions.length > 0 &&
      new Set(option.supportedCustomizationOptions).size ===
        option.supportedCustomizationOptions.length,
    `${option.id} must declare unique supported customization options`,
  );
  assert(
    option.applicableRoomTypes.length > 0 &&
      new Set(option.applicableRoomTypes).size === option.applicableRoomTypes.length,
    `${option.id} must declare unique applicable room types`,
  );
  assert.equal(option.requiredHostType, option.host, `${option.id} host metadata must agree`);
  assert.equal(
    definition.requiredHostType,
    option.requiredHostType,
    `${option.id} generated definition must preserve its required host`,
  );
  assert(allowedHosts.has(option.requiredHostType), `${option.id} must have a recognized host type`);
  assert(
    allowedSafetyClassifications.has(option.safetyClassification),
    `${option.id} must have a recognized safety classification`,
  );
  assert(allowedDifficulties.has(option.difficulty), `${option.id} must have a difficulty level`);
  assert(
    Number.isInteger(option.estimatedMinutes) &&
      option.estimatedMinutes > 0 &&
      option.estimatedMinutes <= 30,
    `${option.id} must have a reasonable estimated configuration time`,
  );
  assert(validation.valid, `${option.id} must produce a validator-safe default design`);

  const searchText = getCabinetPresetSearchText(option);
  for (const requiredTerm of [
    option.id,
    option.name,
    option.category,
    option.difficulty,
    option.requiredHostType,
    option.safetyClassification,
    option.applicableRoomTypes[0],
    option.supportedCustomizationOptions[0],
    option.defaultMaterialIds[0],
    option.defaultHardwareIds[0],
  ]) {
    assert(
      cabinetPresetMatchesCatalogFilters(option, String(requiredTerm), "All"),
      `${option.id} must be searchable by ${requiredTerm}; index was ${searchText}`,
    );
  }
}

const categories = [
  ...new Set(CABINET_PRESET_OPTIONS.map((option) => option.category)),
] as CabinetTemplateCategory[];
assert.deepEqual(
  [...categories].sort(),
  [
    "Architectural woodwork",
    "Bathroom",
    "Bedroom",
    "Home office",
    "Kitchen",
    "Laundry",
    "Living room",
    "Mudroom & entry",
    "Small-space systems",
    "Wardrobes & closets",
  ],
  "the filter must expose every §40.5 template category",
);
for (const category of categories) {
  const matches = CABINET_PRESET_OPTIONS.filter((option) =>
    cabinetPresetMatchesCatalogFilters(option, "", category),
  );
  assert(matches.length > 0, `${category} filter must return templates`);
  assert(
    matches.every((option) => option.category === category),
    `${category} filter must not leak another category`,
  );
}

const featuredMatches = CABINET_PRESET_OPTIONS.filter((option) =>
  cabinetPresetMatchesCatalogFilters(option, "", "Featured"),
);
assert.deepEqual(
  featuredMatches.map((option) => option.id),
  CABINET_PRESET_OPTIONS.filter((option) => option.featured).map((option) => option.id),
  "the Recommended filter must use the curated featured set",
);
assert(
  cabinetPresetMatchesCatalogFilters(
    CABINET_PRESET_OPTIONS.find((option) => option.id === "coffered_ceiling")!,
    "coffer grid specialist installation",
    "Featured",
  ),
  "search from the default Recommended view must still discover a non-featured metadata match",
);
assert(
  cabinetPresetMatchesCatalogFilters(
    CABINET_PRESET_OPTIONS.find((option) => option.id === "vanity")!,
    "bathroom sink plumbing",
    "Bathroom",
  ),
  "multi-term metadata search must compose with an explicit category filter",
);
assert(
  !cabinetPresetMatchesCatalogFilters(
    CABINET_PRESET_OPTIONS.find((option) => option.id === "vanity")!,
    "bathroom sink plumbing",
    "Kitchen",
  ),
  "an explicit category filter must remain effective while searching",
);
assert(
  cabinetPresetMatchesCatalogFilters(
    CABINET_PRESET_OPTIONS.find((option) => option.id === "slat_wall")!,
    "walnut-veneer wall",
    "All",
  ),
  "material names and punctuation-normalized phrases must be searchable",
);

const studioSource = readFileSync(
  join(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8",
);
for (const requiredWiring of [
  "cabinetPresetMatchesCatalogFilters(preset, query, templateCategory)",
  "getCabinetPresetSearchText(preset)",
  "thumbnailKind={preset.visualThumbnail.kind}",
  "testId={`cabinet-template-thumbnail-${preset.id}`}",
  "data-testid=\"cabinet-template-search\"",
  "aria-label=\"Template categories\"",
]) {
  assert(
    studioSource.includes(requiredWiring),
    `Studio must render and consume catalog metadata: ${requiredWiring}`,
  );
}
for (const thumbnailKind of new Set(
  CABINET_PRESET_OPTIONS.map((option) => option.visualThumbnail.kind),
)) {
  assert(
    studioSource.includes(`case "${thumbnailKind}"`) || thumbnailKind === "casework",
    `Studio must render the ${thumbnailKind} visual thumbnail kind`,
  );
}

console.log("Cabinetry §40.5 template catalog checks passed (33/33 templates)");
