import assert from "node:assert/strict";

import {
  cabinetModuleParameterPath,
  getCabinetParameterState,
  setCabinetParameterLocked,
} from "@/features/cabinetry/automation";
import { generateCabinetBOM } from "@/features/cabinetry/generateCabinetBOM";
import { parseCabinetSourceDefinitionJson } from "@/features/cabinetry/generateCabinetDocumentation";
import { generateCabinetParts } from "@/features/cabinetry/generateCabinetParts";
import { createCabinetPreset } from "@/features/cabinetry/presets";
import type {
  CabinetDefinition,
  CabinetPart,
} from "@/features/cabinetry/types";
import { validateCabinetDefinition } from "@/features/cabinetry/validation";
import {
  applyCabinetWardrobeArrangement,
  CABINET_WARDROBE_ARRANGEMENTS,
  getMatchingCabinetWardrobeArrangementId,
  type CabinetWardrobeArrangementId,
} from "@/features/cabinetry/wardrobeArrangements";

const MODULE_ID = "module-1";

function moduleParts(definition: CabinetDefinition): CabinetPart[] {
  return generateCabinetParts(definition).filter(
    (part) => part.moduleId === MODULE_ID
  );
}

function partCount(parts: readonly CabinetPart[], type: CabinetPart["type"]): number {
  return parts.filter((part) => part.type === type).length;
}

function assertValid(definition: CabinetDefinition, context: string): void {
  const validation = validateCabinetDefinition(definition);
  const errors = validation.issues.filter((issue) => issue.severity === "error");
  assert.equal(
    validation.valid,
    true,
    `${context}: ${errors.map((issue) => `${issue.field ?? issue.code}: ${issue.message}`).join(" | ")}`
  );
}

function apply(
  definition: CabinetDefinition,
  arrangementId: CabinetWardrobeArrangementId
): CabinetDefinition {
  const beforeJson = JSON.stringify(definition);
  const moduleIds = definition.modules.map((module) => module.id);
  const untouchedModuleJson = JSON.stringify(definition.modules[1]);
  const result = applyCabinetWardrobeArrangement(
    definition,
    MODULE_ID,
    arrangementId,
    { updatedAt: `2026-07-10T00:00:0${CABINET_WARDROBE_ARRANGEMENTS.findIndex((item) => item.id === arrangementId)}.000Z` }
  );

  assert.equal(result.ok, true, `${arrangementId}: ${result.issues[0]?.message ?? "unexpected refusal"}`);
  assert.equal(result.issues.length, 0);
  assert.ok(result.affectedPaths.length > 0);
  assert.equal(JSON.stringify(definition), beforeJson, "the semantic operation must not mutate its input");
  assert.deepEqual(result.definition.modules.map((module) => module.id), moduleIds, "module IDs must remain stable");
  assert.equal(JSON.stringify(result.definition.modules[1]), untouchedModuleJson, "the unselected module must remain byte-for-byte unchanged");
  assert.equal(result.definition.totalWidth, 3000);
  assert.equal(result.definition.modules[0].width, 1500);
  assert.equal(result.definition.modules[0].materialId, "white_melamine");
  assert.equal(result.definition.modules[0].frontMaterialId, "white_melamine");
  assert.equal(result.definition.modules[0].grainDirection, "none");
  assert.deepEqual(result.definition.modules[0].exposedFaces, ["front", "left"]);
  assert.equal(getMatchingCabinetWardrobeArrangementId(result.definition, MODULE_ID), arrangementId);
  assert.equal(
    getCabinetParameterState(
      result.definition,
      cabinetModuleParameterPath(MODULE_ID, "frontType")
    ).source,
    "user_overridden"
  );
  assert.equal(
    getCabinetParameterState(
      result.definition,
      cabinetModuleParameterPath(MODULE_ID, "hangingRodHeight")
    ).source,
    "automatic"
  );
  assert.equal(
    getCabinetParameterState(
      result.definition,
      cabinetModuleParameterPath(MODULE_ID, "hardwareId")
    ).source,
    "automatic"
  );
  assert.equal(
    getCabinetParameterState(
      result.definition,
      cabinetModuleParameterPath(MODULE_ID, "materialId")
    ).locked,
    true,
    "an unrelated material lock must be preserved"
  );
  assertValid(result.definition, arrangementId);
  assert.ok(generateCabinetBOM(result.definition).length > 0, `${arrangementId} should generate a BOM`);
  return result.definition;
}

function run(): void {
  assert.deepEqual(
    CABINET_WARDROBE_ARRANGEMENTS.map((option) => option.id),
    ["long_hanging", "double_hanging", "shelves", "drawer_bank", "mixed_storage"]
  );
  for (const option of CABINET_WARDROBE_ARRANGEMENTS) {
    assert.ok(option.label.length > 0);
    assert.ok(option.description.length > 20);
    assert.ok(option.accessibilityLabel.length > 20);
    assert.ok(
      [...option.visual.hangingRodLevels, ...option.visual.shelfLevels].every(
        (level) => level >= 0 && level <= 1
      ),
      `${option.id} illustration levels must be normalized`
    );
  }

  const preset = createCabinetPreset("closet_system", "guided-closet-3000");
  let definition: CabinetDefinition = {
    ...preset,
    name: "3000 mm guided wardrobe regression",
    totalWidth: 3000,
    modules: preset.modules.map((module) => ({
      ...module,
      width: 1500,
      ...(module.id === MODULE_ID
        ? {
            grainDirection: "none" as const,
            exposedFaces: ["front", "left"] as const,
          }
        : {}),
    })),
  };
  definition = setCabinetParameterLocked(
    definition,
    cabinetModuleParameterPath(MODULE_ID, "materialId"),
    true
  );
  assertValid(definition, "3000 mm starting closet");

  definition = apply(definition, "long_hanging");
  let parts = moduleParts(definition);
  assert.equal(partCount(parts, "hanging_rod"), 1);
  assert.equal(partCount(parts, "shelf"), 1);
  assert.equal(partCount(parts, "drawer_front"), 0);
  assert.equal(definition.modules[0].hardwareId, "none");

  definition = apply(definition, "double_hanging");
  parts = moduleParts(definition);
  assert.equal(partCount(parts, "hanging_rod"), 2);
  assert.equal(partCount(parts, "shelf"), 1);
  assert.ok((definition.modules[0].hangingRodSpacing ?? 0) >= 650);

  definition = apply(definition, "shelves");
  parts = moduleParts(definition);
  assert.equal(partCount(parts, "hanging_rod"), 0);
  assert.equal(partCount(parts, "shelf"), 7);
  assert.equal(definition.modules[0].shelfSpacingMode, "even");
  assert.equal(definition.modules[0].shelfPinRowsEnabled, true);

  const shelfCountPath = cabinetModuleParameterPath(MODULE_ID, "shelfCount");
  const lockedShelves = setCabinetParameterLocked(definition, shelfCountPath, true);
  const refused = applyCabinetWardrobeArrangement(
    lockedShelves,
    MODULE_ID,
    "drawer_bank"
  );
  assert.equal(refused.ok, false);
  assert.strictEqual(refused.definition, lockedShelves, "a refused transaction returns the exact input");
  assert.equal(refused.issues[0]?.code, "locked_parameter");
  assert.deepEqual(refused.issues[0]?.paths, [shelfCountPath]);

  const matchingLock = applyCabinetWardrobeArrangement(
    lockedShelves,
    MODULE_ID,
    "shelves"
  );
  assert.equal(matchingLock.ok, true, matchingLock.issues[0]?.message);
  assert.equal(
    getCabinetParameterState(matchingLock.definition, shelfCountPath).locked,
    true,
    "a matching lock must survive an idempotent card application"
  );
  assert.equal(
    getCabinetParameterState(matchingLock.definition, shelfCountPath).source,
    getCabinetParameterState(lockedShelves, shelfCountPath).source,
    "a matching locked value keeps its existing provenance"
  );

  definition = setCabinetParameterLocked(matchingLock.definition, shelfCountPath, false);
  definition = apply(definition, "drawer_bank");
  parts = moduleParts(definition);
  assert.equal(partCount(parts, "drawer_front"), 5);
  assert.equal(partCount(parts, "drawer_slide_pair"), 5);
  assert.equal(partCount(parts, "drawer_box_bottom"), 5);
  assert.equal(partCount(parts, "hanging_rod"), 0);
  assert.equal(definition.modules[0].drawerHeightMode, "recommended");
  assert.equal(definition.modules[0].drawerBoxEnabled, true);
  assert.equal(definition.modules[0].drawerSlideHardwareEnabled, true);
  assert.equal(definition.modules[0].hardwareId, "black_bar_pull");

  definition = apply(definition, "mixed_storage");
  parts = moduleParts(definition);
  assert.equal(partCount(parts, "hanging_rod"), 1);
  assert.equal(partCount(parts, "shelf"), 2);
  assert.equal(partCount(parts, "drawer_front"), 1);
  assert.ok(partCount(parts, "door_front") >= 2);
  assert.ok(partCount(parts, "door_hinge_pair") >= 4);
  assert.equal(partCount(parts, "drawer_slide_pair"), 1);
  assert.equal(definition.modules[0].doorLayoutMode, "recommended");
  assert.equal(definition.modules[0].drawerHeightMode, "recommended");
  assert.equal(definition.modules[0].handlePlacementMode, "automatic");
  assert.equal(definition.modules[0].doorHingeHardwareEnabled, true);

  const firstPartIds = generateCabinetParts(definition).map((part) => part.id);
  const idempotent = applyCabinetWardrobeArrangement(
    definition,
    MODULE_ID,
    "mixed_storage"
  );
  assert.equal(idempotent.ok, true, idempotent.issues[0]?.message);
  assert.deepEqual(
    generateCabinetParts(idempotent.definition).map((part) => part.id),
    firstPartIds,
    "reapplying a card must preserve generated part IDs"
  );

  const serialized = JSON.stringify(definition);
  const roundTripped = parseCabinetSourceDefinitionJson(serialized);
  assert.equal(JSON.stringify(roundTripped), serialized, "source JSON must round-trip without semantic loss");
  assertValid(roundTripped, "round-tripped mixed wardrobe");
  assert.deepEqual(
    generateCabinetBOM(roundTripped),
    generateCabinetBOM(definition),
    "BOM output must survive the source-definition round trip"
  );

  const tooShort = {
    ...definition,
    height: 1500,
    modules: definition.modules.map((module) =>
      module.id === MODULE_ID ? { ...module, height: 1500 } : module
    ),
  };
  const geometryRefusal = applyCabinetWardrobeArrangement(
    tooShort,
    MODULE_ID,
    "double_hanging"
  );
  assert.equal(geometryRefusal.ok, false);
  assert.equal(geometryRefusal.issues[0]?.code, "insufficient_geometry");
  assert.strictEqual(geometryRefusal.definition, tooShort);

  console.log(
    "Cabinet wardrobe arrangement checks passed: 5 Guided cards, 3000 mm sequence, locks, validation, parts/BOM, stable IDs, and round-trip."
  );
}

run();
