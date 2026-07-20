import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  DESIGN_DOCUMENT_COORDINATE_SYSTEM,
  DESIGN_DOCUMENT_LIMITS,
  DESIGN_DOCUMENT_SCHEMA_REVISION,
  DESIGN_DOCUMENT_UNITS,
  DESIGN_DOCUMENT_VERSION,
  validateStoredDesignDocument,
} from "@/lib/design-document-contract";
import { migrateDesignDocument } from "@/lib/design-document-migrations";
import { normalizeDesignPageLocalBackup } from "@/lib/design-page-local-backup";
import { DesignPageLocalBackupError } from "@/lib/design-page-local-backup-recovery";
import {
  createPersistedProductSnapshot,
  resolveDesignItemVisualProduct,
} from "@/lib/design-item-product-snapshot";
import {
  sanitizeStoredDesign,
  snapshotToStored,
  storedToSnapshot,
} from "@/lib/room-persistence";
import { resolveRoomShoppingItems } from "@/lib/room-shopping";
import type { DesignItem } from "@/lib/room-types";

const fixtureRoot = path.join(
  process.cwd(),
  "tests",
  "fixtures",
  "design-documents"
);

for (const fixtureName of [
  "legacy-v1-basic.json",
  "legacy-v2-product.json",
]) {
  const source = JSON.parse(
    fs.readFileSync(path.join(fixtureRoot, fixtureName), "utf8")
  ) as Record<string, unknown>;
  const sourceBefore = JSON.stringify(source);
  const migrated = migrateDesignDocument(source);
  assert.equal(migrated.ok, true, `${fixtureName} should migrate`);
  if (!migrated.ok) continue;
  assert.equal(JSON.stringify(source), sourceBefore, "migration must not mutate source");
  assert.equal(migrated.document.version, DESIGN_DOCUMENT_VERSION);
  assert.equal(
    migrated.document.schemaRevision,
    DESIGN_DOCUMENT_SCHEMA_REVISION
  );
  assert.deepEqual(migrated.document.units, DESIGN_DOCUMENT_UNITS);
  assert.deepEqual(
    migrated.document.coordinateSystem,
    DESIGN_DOCUMENT_COORDINATE_SYSTEM
  );
  assert.equal(validateStoredDesignDocument(migrated.document).ok, true);

  const repeated = migrateDesignDocument(migrated.document);
  assert.equal(repeated.ok, true);
  if (repeated.ok) {
    assert.deepEqual(repeated.document, migrated.document);
    assert.deepEqual(repeated.migrations, []);
  }
}

const legacyV2 = JSON.parse(
  fs.readFileSync(path.join(fixtureRoot, "legacy-v2-product.json"), "utf8")
) as Record<string, unknown>;
const migratedV2 = migrateDesignDocument(legacyV2);
assert.equal(migratedV2.ok, true);
if (!migratedV2.ok) process.exit(1);
assert.deepEqual(migratedV2.document.partnerExtension, {
  revision: "kept-verbatim",
});

const futureRevision = migrateDesignDocument({
  ...migratedV2.document,
  schemaRevision: 99,
});
assert.equal(futureRevision.ok, false);
if (!futureRevision.ok) {
  assert.equal(futureRevision.error.code, "UNSUPPORTED_VERSION");
  assert.match(futureRevision.error.issues[0].message, /cannot be downgraded/i);
}

const duplicateItem = structuredClone(migratedV2.document);
duplicateItem.rooms[0].items.push({ ...duplicateItem.rooms[0].items[0] });
const duplicateValidation = validateStoredDesignDocument(duplicateItem);
assert.equal(duplicateValidation.ok, false);
if (!duplicateValidation.ok) {
  assert.ok(
    duplicateValidation.issues.some(
      (issue) => issue.code === "DUPLICATE_ID" && issue.path.includes("instanceId")
    )
  );
}

const currentWithExtensions = {
  ...migratedV2.document,
  futureTopLevel: { retained: true },
  rooms: migratedV2.document.rooms.map((room) => ({
    ...room,
    futureRoomField: "retained",
  })),
};
const roundTrip = snapshotToStored(storedToSnapshot(currentWithExtensions));
assert.deepEqual(roundTrip.futureTopLevel, { retained: true });
assert.equal(roundTrip.rooms[0].futureRoomField, "retained");

const oversized = {
  ...migratedV2.document,
  oversizedExtension: "x".repeat(
    DESIGN_DOCUMENT_LIMITS.maxSerializedBytes + 1
  ),
};
assert.equal(
  sanitizeStoredDesign(oversized),
  null,
  "API transport validation must reject oversized documents"
);

const liveProduct = Object.values(CATALOG_ITEMS)[0];
assert.ok(liveProduct, "catalog fixture requires one live product");
const productSnapshot = createPersistedProductSnapshot(
  liveProduct,
  liveProduct.defaultVariantId
);
const item: DesignItem = {
  instanceId: "snapshot-item-001",
  productId: liveProduct.id,
  variantId: productSnapshot.variantId,
  productSnapshot,
  position: [1.25, 0, -0.5],
  rotationY: Math.PI / 3,
};
assert.equal("commerce" in productSnapshot, false);
assert.equal("price" in productSnapshot, false);
assert.equal("buyUrl" in productSnapshot, false);

const changedLiveCatalog = {
  [liveProduct.id]: {
    ...liveProduct,
    title: "Changed live title",
    dimsMm: { w: 1, d: 1, h: 1 },
    assets: { ...liveProduct.assets, modelUrl: "/changed-live-model.glb" },
  },
} as typeof CATALOG_ITEMS;
const visual = resolveDesignItemVisualProduct(item, changedLiveCatalog);
assert.ok(visual);
assert.equal(visual.title, productSnapshot.name);
assert.deepEqual(visual.dimsMm, productSnapshot.dimensionsMm);
assert.equal(visual.assets.modelUrl, productSnapshot.assets.modelUrl ?? liveProduct.assets.modelUrl);

const removedVisual = resolveDesignItemVisualProduct(item, {} as typeof CATALOG_ITEMS);
assert.ok(removedVisual);
assert.equal(removedVisual.title, productSnapshot.name);
assert.deepEqual(removedVisual.dimsMm, productSnapshot.dimensionsMm);
const removedShoppingLine = resolveRoomShoppingItems(
  { items: [item] } as Parameters<typeof resolveRoomShoppingItems>[0],
  {} as typeof CATALOG_ITEMS
)[0];
assert.equal(removedShoppingLine.title, productSnapshot.name);
assert.equal(removedShoppingLine.hasValidCommerce, false);
assert.equal(removedShoppingLine.priceLabel, "Price unavailable");

const retiredVariantSnapshot = {
  ...productSnapshot,
  variantId: "retired-variant-001",
  variantLabel: "Retired finish",
};
const retiredItem: DesignItem = {
  ...item,
  variantId: retiredVariantSnapshot.variantId,
  productSnapshot: retiredVariantSnapshot,
};
const retiredBackup = JSON.stringify({
  version: DESIGN_DOCUMENT_VERSION,
  schemaRevision: DESIGN_DOCUMENT_SCHEMA_REVISION,
  units: DESIGN_DOCUMENT_UNITS,
  coordinateSystem: DESIGN_DOCUMENT_COORDINATE_SYSTEM,
  activeRoomId: "retired-room",
  rooms: [
    {
      id: "retired-room",
      name: "Retired Product Room",
      roomType: "living",
      geometry: { width: 5, depth: 4, wallThickness: 0.12 },
      items: [retiredItem],
      zones: [],
      savedViews: [],
    },
  ],
});
const normalizedRetired = normalizeDesignPageLocalBackup({
  rawBackup: retiredBackup,
  state: {
    activeRoomId: "retired-room",
    roomWidth: 5,
    roomDepth: 4,
    wallThickness: 0.12,
  },
  configuration: {
    catalogItems: { [liveProduct.id]: liveProduct } as typeof CATALOG_ITEMS,
    resolveConfiguredPlanningDimsMm: (_item, product) => product.dimsMm,
  },
});
const normalizedRetiredItem = normalizedRetired.snapshot?.rooms[0].items[0];
assert.equal(normalizedRetiredItem?.variantId, retiredVariantSnapshot.variantId);
assert.deepEqual(
  normalizedRetiredItem?.productSnapshot,
  retiredVariantSnapshot,
  "A removed live variant must not rewrite the saved visual snapshot"
);

assert.throws(
  () =>
    normalizeDesignPageLocalBackup({
      rawBackup: JSON.stringify({ privateNote: "must-not-appear-in-errors" }),
      state: {
        activeRoomId: "room",
        roomWidth: 5,
        roomDepth: 4,
        wallThickness: 0.12,
      },
      configuration: {
        catalogItems: {} as typeof CATALOG_ITEMS,
        resolveConfiguredPlanningDimsMm: () => ({ w: 1, d: 1, h: 1 }),
      },
    }),
  (error) => {
    assert.ok(error instanceof DesignPageLocalBackupError);
    assert.equal(error.code, "INVALID_DOCUMENT");
    assert.equal(error.message.includes("must-not-appear-in-errors"), false);
    return true;
  }
);

console.log("Design document compatibility checks passed.");
