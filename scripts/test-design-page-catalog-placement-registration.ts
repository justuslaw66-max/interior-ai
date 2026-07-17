import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ParametricCabinetDesignItem } from "@/features/cabinetry/designItemAdapters";
import { createCabinetPreset } from "@/features/cabinetry/presets";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignItem } from "@/lib/room-types";
import {
  getCatalogPlacementItemDisplayName,
  resolveCatalogPlacementPreviewTarget,
  resolveCatalogPlacementTargetRoomId,
  type DesignPageCatalogPlacementTarget,
} from "@/lib/useDesignPageCatalogPlacementRegistrationFacade";

const [catalogProductId, catalogProduct] = Object.entries(CATALOG_ITEMS)[0] ?? [];
assert(catalogProductId && catalogProduct, "Catalog fixtures must include a product.");

const catalogItem: DesignItem = {
  instanceId: "catalog-item",
  productId: catalogProductId,
  variantId: catalogProduct.defaultVariantId,
  position: [0, 0, 0],
};
assert.equal(
  getCatalogPlacementItemDisplayName(catalogItem),
  catalogProduct.title
);
assert.equal(
  getCatalogPlacementItemDisplayName({
    ...catalogItem,
    productId: "missing-catalog-product",
  }),
  "another item"
);
assert.equal(getCatalogPlacementItemDisplayName(null), null);

const cabinetDefinition = createCabinetPreset(
  "base",
  "placement-registration-cabinet"
);
const cabinet = {
  ...catalogItem,
  productId: "parametric-cabinet",
  assetType: "parametric_cabinet",
  cabinetDefinition,
  name: "Custom placement cabinet",
} as ParametricCabinetDesignItem;
assert.equal(
  getCatalogPlacementItemDisplayName(cabinet),
  "Custom placement cabinet"
);
assert.equal(
  getCatalogPlacementItemDisplayName({ ...cabinet, name: undefined }),
  cabinetDefinition.name
);

const itemDragTarget: DesignPageCatalogPlacementTarget = {
  roomId: "item-room",
  label: "Item room",
  valid: true,
  kind: "item",
};
const previewTarget = {
  roomId: "preview-room",
  label: "Preview room",
  valid: false,
  kind: "preview" as const,
};
assert.strictEqual(
  resolveCatalogPlacementPreviewTarget(itemDragTarget, null),
  itemDragTarget,
  "Clearing a catalog preview must preserve an active item-drag target."
);
assert.equal(resolveCatalogPlacementPreviewTarget(previewTarget, null), null);
assert.strictEqual(
  resolveCatalogPlacementPreviewTarget(itemDragTarget, previewTarget),
  previewTarget
);
assert.equal(
  resolveCatalogPlacementTargetRoomId("pending-room", itemDragTarget),
  "pending-room",
  "A pending catalog placement must take precedence over an item-drag target."
);
assert.equal(
  resolveCatalogPlacementTargetRoomId(null, itemDragTarget),
  "item-room"
);
assert.equal(resolveCatalogPlacementTargetRoomId(undefined, null), null);

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const facadeSource = readFileSync(
  join(root, "lib/useDesignPageCatalogPlacementRegistrationFacade.ts"),
  "utf8"
);
const placementWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPagePlacementWorkspaceRegistration.ts"),
  "utf8"
);

assert.match(
  workspaceSource,
  /import \{ useDesignPagePlacementWorkspaceRegistration \} from "@\/lib\/useDesignPagePlacementWorkspaceRegistration";/
);
assert.match(
  placementWorkspaceSource,
  /useDesignPageCatalogPlacementRegistrationFacade\(\{/
);
assert.doesNotMatch(
  workspaceSource,
  /from "@\/lib\/useDesignPageCatalogPlacement";/
);
assert.doesNotMatch(
  workspaceSource,
  /from "@\/lib\/useDesignPagePlacementRoomQueries";/
);
assert.doesNotMatch(
  workspaceSource,
  /from "@\/lib\/useDesignPageCrossRoomItemTransfer";/
);
assert.doesNotMatch(workspaceSource, /isParametricCabinetItem\(/);
assert.match(
  workspaceSource,
  /roomQueries: placementRoomQueries,[\s\S]*catalogPlacementController,[\s\S]*crossRoomTransfer: crossRoomTransferController,/
);

const orderedRegistrationTokens = [
  "useDesignPagePlacementRoomQueries({",
  "const getItemDisplayName = useCallback(",
  "const setCatalogPlacementPreviewTarget = useCallback(",
  "useDesignPageCatalogPlacement({",
  "const placementTargetRoomId =",
  "const placementTargetPlanRoom = useMemo(",
  "useDesignPageCrossRoomItemTransfer({",
];
let previousTokenIndex = -1;
for (const token of orderedRegistrationTokens) {
  const tokenIndex = facadeSource.indexOf(token);
  assert(
    tokenIndex > previousTokenIndex,
    `Catalog placement registration must keep ${token} in lifecycle order.`
  );
  previousTokenIndex = tokenIndex;
}

console.log("Design-page catalog placement registration checks passed.");
