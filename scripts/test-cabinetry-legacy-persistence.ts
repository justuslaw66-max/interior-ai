import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { generateCabinetBOM } from "@/features/cabinetry/generateCabinetBOM";
import { generateCabinetParts } from "@/features/cabinetry/generateCabinetParts";
import {
  isParametricCabinetItem,
} from "@/features/cabinetry/designItemAdapters";
import { validateCabinetDefinition } from "@/features/cabinetry/validation";
import { type CATALOG_ITEMS } from "@/lib/catalog";
import { normalizeDesignPageLocalBackup } from "@/lib/design-page-local-backup";
import { DesignPageLocalBackupError } from "@/lib/design-page-local-backup-recovery";
import {
  isStoredDesign,
  snapshotToStored,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import { resolveRoomShoppingItems } from "@/lib/room-shopping";

const fixturePath = resolve(
  process.cwd(),
  "tests/fixtures/cabinetry/legacy-design-snapshot-v3-cabinet-v1.json"
);
const rawFixture = readFileSync(fixturePath, "utf8");
const parsedFixture = JSON.parse(rawFixture) as StoredDesign;

assert.equal(isStoredDesign(parsedFixture), true, "The legacy fixture must remain a valid v3 project envelope.");

let catalogPlanningResolverCalls = 0;
const restored = normalizeDesignPageLocalBackup({
  rawBackup: rawFixture,
  state: {
    activeRoomId: "fallback-room",
    roomWidth: 4,
    roomDepth: 5,
    wallThickness: 0.2,
  },
  configuration: {
    catalogItems: {} as typeof CATALOG_ITEMS,
    resolveConfiguredPlanningDimsMm: () => {
      catalogPlanningResolverCalls += 1;
      return { w: 1, d: 1, h: 1 };
    },
  },
});

assert.equal(restored.format, "v3");
assert(restored.snapshot, "The legacy project fixture must restore a design snapshot.");
assert.equal(restored.snapshot.activeRoomId, "legacy-kitchen");
assert.equal(restored.snapshot.rooms.length, 1);
assert.equal(catalogPlanningResolverCalls, 0, "Cabinet restoration must not depend on a catalog product lookup.");

const restoredRoom = restored.snapshot.rooms[0];
const restoredItem = restoredRoom?.items[0];
assert(restoredRoom, "The legacy kitchen must remain present.");
assert(isParametricCabinetItem(restoredItem), "The persisted item must restore as parametric cabinetry.");

const restoredDefinition = restoredItem.cabinetDefinition;
assert.equal(restoredDefinition.id, "legacy-cabinet-definition-v1");
assert.equal(restoredDefinition.version, 1);
assert.equal(restoredDefinition.units, "mm");
assert.equal(restoredDefinition.sourcePresetId, undefined);
assert.equal(restoredDefinition.requiredHostType, undefined);
assert.equal(restoredDefinition.automation, undefined);
assert.equal(restoredDefinition.modules[0]?.id, "legacy-module-1");
assert.deepEqual(restoredItem.position, [0.35, 0, -0.45]);
assert.equal(restoredItem.rotationY, Math.PI / 2);
assert.deepEqual(restoredItem.transform?.position, [0.35, 0, -0.45]);
assert.equal(restoredItem.transform?.rotationY, Math.PI / 2);
assert.equal(restoredItem.roomId, "legacy-kitchen");
assert.equal(restoredItem.includeInCheckout, false);
assert.equal(restoredItem.glbAssetUrl, undefined, "Session-local blob output must not survive restoration.");

assert.equal(validateCabinetDefinition(restoredDefinition).valid, true);
const generatedParts = generateCabinetParts(restoredDefinition);
const generatedBom = generateCabinetBOM(restoredDefinition, generatedParts);
assert(generatedParts.length > 0, "Current geometry must regenerate from the legacy definition.");
assert(generatedBom.length > 0, "Current BOM output must regenerate from the legacy definition.");
assert.equal(restoredItem.millworkDefinition?.schema, "custom_millwork.definition.v1");
assert.equal(restoredItem.millworkDefinitionVersion, 1);
assert.equal(restoredItem.millworkAssetManifest?.schema, "custom_millwork.asset_manifest.v1");
assert.equal(restoredItem.millworkAssetManifest?.sourceDefinitionId, restoredDefinition.id);
assert.equal(restoredItem.millworkAssetManifest?.generatedOutput.durable, false);
assert.equal(restoredItem.millworkAssetManifest?.generatedOutput.url, undefined);
assert((restoredItem.bomSnapshot?.length ?? 0) > 0, "Restoration must rebuild a current BOM snapshot.");
assert((restoredItem.cutListSnapshot?.length ?? 0) > 0, "Restoration must rebuild a current cut-list snapshot.");
assert.deepEqual(resolveRoomShoppingItems(restoredRoom), [], "Custom millwork must remain outside normal cart checkout.");

const storedRoundTrip = snapshotToStored(restored.snapshot);
const roundTripped = storedToSnapshot(storedRoundTrip);
const roundTrippedItem = roundTripped.rooms[0]?.items[0];
assert(isParametricCabinetItem(roundTrippedItem));
assert.equal(roundTrippedItem.cabinetDefinition.id, restoredDefinition.id);
assert.equal(roundTrippedItem.cabinetDefinition.version, 1);
assert.equal(roundTrippedItem.cabinetDefinition.modules[0]?.id, "legacy-module-1");
assert.deepEqual(roundTrippedItem.position, restoredItem.position);
assert.equal(roundTrippedItem.rotationY, restoredItem.rotationY);
assert.equal(roundTrippedItem.glbAssetUrl, undefined);

assert.throws(
  () =>
    normalizeDesignPageLocalBackup({
      rawBackup: "{not valid json",
      state: {
        activeRoomId: "fallback-room",
        roomWidth: 4,
        roomDepth: 5,
        wallThickness: 0.2,
      },
      configuration: {
        catalogItems: {} as typeof CATALOG_ITEMS,
        resolveConfiguredPlanningDimsMm: () => ({ w: 1, d: 1, h: 1 }),
      },
    }),
  (error) =>
    error instanceof DesignPageLocalBackupError &&
    error.code === "INVALID_JSON",
  "Invalid cabinetry backups must produce the safe recovery diagnostic."
);

console.log(
  "Cabinetry legacy project fixture passed: v3 envelope, v1 definition, regenerated outputs, stable IDs/transforms, checkout exclusion, and recoverable invalid-backup boundary."
);
