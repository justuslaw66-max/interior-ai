import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildDesignPageSceneRoomItems,
  resolveSceneItemCanonicalTransform,
  resolveSceneItemLocalPosition,
  resolveSceneItemViewContinuity,
} from "@/lib/design-page-scene-domain";
import {
  projectSceneRoomItem,
  removeSceneProjectionElevation,
} from "@/lib/design-page-scene-projection";
import {
  getFurnitureWallInset,
  resolveAxisAlignedRoomItemBounds,
  resolvePointerRotationRadians,
} from "@/lib/design-page-geometry";
import {
  EDITOR_GEOMETRY_TOLERANCES,
  HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS,
  isWithinEditorTolerance,
} from "@/lib/editor-geometry-tolerances";
import { createRoom, type DesignItem, type DesignSnapshot } from "@/lib/room-types";

const item: DesignItem = {
  instanceId: "scene-item",
  productId: "test-product",
  variantId: "test-variant",
  productSnapshot: {
    schemaVersion: 1,
    productId: "test-product",
    variantId: "test-variant",
    name: "Continuity test product",
    category: "table",
    dimensionsMm: { w: 1200, d: 700, h: 420 },
    variantLabel: "Natural oak",
    assets: { modelUrl: "/models/continuity-test.glb" },
  },
  position: [0.25, 0.125, -0.5],
  rotationY: Math.PI * 1.75,
  materialPreset: "oak-natural",
  materialOverrides: {
    roughness: 0.42,
    metalness: 0.03,
    colorHex: "#b88b5a",
  },
};
const room = createRoom("upper-room", "Upper room");
room.floorElevationMm = 3475;
room.geometry = {
  width: 4.2,
  depth: 3.8,
  height: 2.875,
  wallThickness: 0.14,
};
room.items = [item];
const snapshot: DesignSnapshot = {
  version: 3,
  rooms: [room],
  activeRoomId: room.id,
};
const planRoom = { id: room.id, x: 4, z: -2 };
const entries = buildDesignPageSceneRoomItems({
  activeRoom: room,
  designSnapshot: snapshot,
  hasWholeHousePlan: false,
  housePlanRooms: [planRoom],
  houseRoomById: new Map([[room.id, planRoom]]),
  usesHousePlanScene: true,
});

assert.equal(entries.length, 1);
const entry = entries[0];
assert.equal(entry.item, item, "The canonical scene entry must retain the document item.");
assert.equal(entry.roomFloorElevationMeters, 3.475, "Integer millimetres project to metres once.");
assert.equal(entry.roomWallThickness, 0.14);
assert.equal(entry.roomWallModel, "house-plan-shell");
assert.equal(entry.layerId, "room:upper-room:items");
assert.equal(entry.visible, true);

const continuityInput = {
  visualDimensionsMm: { w: 1200, d: 700, h: 420 },
  planningDimensionsMm: { w: 1250, d: 750, h: 420 },
  selected: true,
};
const continuity = resolveSceneItemViewContinuity(entry, continuityInput);
assert.deepEqual(continuity, {
  instanceId: item.instanceId,
  roomId: room.id,
  layerId: "room:upper-room:items",
  visible: true,
  productId: item.productId,
  variantId: item.variantId,
  productSnapshot: item.productSnapshot,
  localPosition: item.position,
  rotationY: item.rotationY,
  visualDimensionsMm: continuityInput.visualDimensionsMm,
  planningDimensionsMm: continuityInput.planningDimensionsMm,
  materialPreset: item.materialPreset,
  materialOverrides: item.materialOverrides,
  selected: true,
});

const canonical = resolveSceneItemCanonicalTransform(entry);
assert.deepEqual(canonical.localPosition, item.position);
assert.deepEqual(canonical.worldPosition, [4.25, 3.6, -2.5]);
assert.equal(canonical.rotationY, item.rotationY);

const planProjection = projectSceneRoomItem(entry, "plan");
const spatialProjection = projectSceneRoomItem(entry, "spatial");
assert.deepEqual(
  resolveSceneItemViewContinuity(entry, continuityInput),
  continuity,
  "Changing projection must not change canonical object state."
);
assert.deepEqual(planProjection.position, [4.25, 0.125, -2.5]);
assert.deepEqual(spatialProjection.position, canonical.worldPosition);
assert.equal(planProjection.rotationY, spatialProjection.rotationY);
assert.equal(planProjection.wallThickness, 0.14);
assert.equal(planProjection.wallContactInset, 0);
assert.equal(
  spatialProjection.wallThickness,
  HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS
);
assert.equal(
  spatialProjection.wallContactInset,
  HOUSE_PLAN_RENDERED_WALL_THICKNESS_METERS / 2
);
assert.ok(
  Math.abs(getFurnitureWallInset(entry.roomWallThickness) - 0.09) <
    EDITOR_GEOMETRY_TOLERANCES.boundaryMeters,
  "Furniture snapping must resolve the canonical wall inner face plus a small visible clearance."
);
assert.ok(
  Math.abs(
    getFurnitureWallInset(entry.roomWallThickness) -
      entry.roomWallThickness / 2 -
      0.02
  ) < EDITOR_GEOMETRY_TOLERANCES.boundaryMeters,
  "Furniture wall clearance must be measured from the inner wall face."
);
assert.deepEqual(
  removeSceneProjectionElevation(entry, "spatial", spatialProjection.position),
  [4.25, 0.125, -2.5]
);
assert.deepEqual(
  removeSceneProjectionElevation(entry, "plan", planProjection.position),
  planProjection.position
);

let driftCandidate: [number, number, number] = [...item.position];
for (let iteration = 0; iteration < 10_000; iteration += 1) {
  const world = resolveSceneItemCanonicalTransform(entry, driftCandidate).worldPosition;
  driftCandidate = resolveSceneItemLocalPosition(entry, world);
}
assert.ok(
  driftCandidate.every((value, index) =>
    isWithinEditorTolerance(
      value,
      item.position[index],
      EDITOR_GEOMETRY_TOLERANCES.boundaryMeters
    )
  ),
  "Repeated room/world transform round-trips must stay inside the central boundary tolerance."
);

assert.deepEqual(EDITOR_GEOMETRY_TOLERANCES, {
  boundaryMeters: 0.000001,
  rotationVectorMeters: 0.0001,
  polygonMeters: 0.0001,
  wallSegmentMeters: 0.001,
  clearanceMeters: 0.001,
  dimensionMeters: 0.001,
  drawSnapMeters: 0.01,
});
assert.equal(isWithinEditorTolerance(2, 2.000001, 0.000001), true);
assert.equal(isWithinEditorTolerance(2, 2.000002, 0.000001), false);
assert.equal(
  resolvePointerRotationRadians({
    deltaX: EDITOR_GEOMETRY_TOLERANCES.rotationVectorMeters / 2,
    deltaZ: EDITOR_GEOMETRY_TOLERANCES.rotationVectorMeters / 2,
    snapToStep: false,
    snapEnabled: false,
    snapStepRadians: Math.PI / 2,
  }),
  null
);
assert.equal(
  resolvePointerRotationRadians({
    deltaX: 1,
    deltaZ: 0,
    snapToStep: true,
    snapEnabled: true,
    snapStepRadians: Math.PI / 2,
  }),
  Math.PI / 2
);
assert.deepEqual(
  resolveAxisAlignedRoomItemBounds({
    roomOriginX: 4,
    roomOriginZ: -2,
    roomWidth: 4,
    roomDepth: 3,
    wallContactInset: 0.1,
    itemWidth: 1,
    itemDepth: 0.5,
  }),
  { minX: 2.6, maxX: 5.4, minZ: -3.15, maxZ: -0.85 }
);

const root = process.cwd();
const source = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const domainSource = source("lib/design-page-scene-domain.ts");
const projectionSource = source("lib/design-page-scene-projection.ts");
const readModelSource = source("lib/useDesignPageSceneReadModel.ts");
const itemLayerSource = source("components/editor/design-page/SceneItemsLayer.tsx");
const furnitureSource = source("components/scene/FurnitureItem.tsx");
const roomRendererSource = source("components/editor/renderers/RoomRenderer2D.tsx");
const wallGeometrySource = source("lib/room-renderer-2d-walls.ts");
const itemGeometrySource = source("lib/design-page-geometry.ts");
const snapGeometrySource = source("lib/snapGuides.ts");
const measurementSource = source("lib/measurements.ts");
const unitModelSource = source("lib/editorScene.ts");
const materialDomainSource = source("lib/design-page-material-props.ts");
const cabinetHierarchySource = source("features/cabinetry/generateCabinetParts.ts");
const transientFeedbackSource = source("lib/useDesignPageTransientFeedback.ts");
const cabinetRendererSource = source(
  "features/cabinetry/components/CabinetSceneItem.tsx"
);
const cabinetResourceOwnershipSource = source(
  "features/cabinetry/hooks/useCabinetSceneResourceOwnership.ts"
);
const glbRendererSource = source("components/scene/GLBScaledModel.tsx");
const floorPlanAssetsSource = source("lib/useDesignPageFloorPlanAssets.ts");

for (const [name, moduleSource] of [
  ["scene domain", domainSource],
  ["scene projection", projectionSource],
  ["item geometry", itemGeometrySource],
  ["snap geometry", snapGeometrySource],
  ["measurements", measurementSource],
  ["unit model", unitModelSource],
  ["material domain", materialDomainSource],
  ["cabinet hierarchy", cabinetHierarchySource],
] as const) {
  const imports = Array.from(moduleSource.matchAll(/from\s+["']([^"']+)["']/g)).map(
    (match) => match[1]
  );
  for (const forbidden of [
    "react",
    "next/",
    "@/components/",
    "@/app/",
    "storage",
    "http",
    "commerce",
  ]) {
    assert.ok(
      imports.every((entry) => !entry.includes(forbidden)),
      `${name} must not import ${forbidden}`
    );
  }
}

assert.doesNotMatch(domainSource, /\bwindow\b|\bdocument\b|\bfetch\s*\(/);
assert.doesNotMatch(projectionSource, /\bwindow\b|\bdocument\b|\bfetch\s*\(/);
assert.doesNotMatch(
  readModelSource.slice(readModelSource.indexOf("buildDesignPageSceneRoomItems({"), readModelSource.indexOf("const sceneRenderItemKeys")),
  /viewMode/,
  "The canonical item model must not vary by active renderer."
);
assert.match(itemLayerSource, /projectSceneRoomItem\(\s*sceneEntry,\s*projection/);
assert.match(itemLayerSource, /resolveSceneItemViewContinuity\(sceneEntry/);
assert.match(itemLayerSource, /sceneLayerId:\s*continuity\.layerId/);
assert.match(itemLayerSource, /visible=\{continuity\.visible\}/);
assert.doesNotMatch(
  itemLayerSource,
  /addFloorElevationToItemPosition|removeFloorElevationFromItemPosition/,
  "The renderer layer must not recreate canonical scene transforms."
);
assert.match(itemGeometrySource, /EDITOR_GEOMETRY_TOLERANCES\.rotationVectorMeters/);
assert.match(itemGeometrySource, /resolveAxisAlignedRoomItemBounds/);
assert.match(roomRendererSource, /EDITOR_GEOMETRY_TOLERANCES\.drawSnapMeters/);
assert.match(roomRendererSource, /EDITOR_GEOMETRY_TOLERANCES\.boundaryMeters/);
assert.match(wallGeometrySource, /EDITOR_GEOMETRY_TOLERANCES\.wallSegmentMeters/);

const frameLoop = furnitureSource.slice(
  furnitureSource.indexOf("useFrame(() =>"),
  furnitureSource.indexOf("// finalRotation")
);
assert.doesNotMatch(
  frameLoop,
  /price|checkout|permission|subscription|authentication|persistence/i,
  "Render loops must not own business policy."
);

assert.match(transientFeedbackSource, /confidenceDismissTimerRef/);
assert.match(
  transientFeedbackSource,
  /clearTimeout\(confidenceDismissTimerRef\.current\)/
);
assert.match(roomRendererSource, /activeWindowGestureCleanupRef\.current\?\.\(\)/);
assert.match(roomRendererSource, /registerWindowGestureCleanup/);
assert.match(cabinetRendererSource, /useCabinetSceneResourceOwnership\(\{/);
assert.match(
  cabinetResourceOwnershipSource,
  /disposeCabinetObject3DResources\(assembly\)/
);
assert.match(
  cabinetResourceOwnershipSource,
  /disposeCabinetOwnedTextures\(loadedTextures\)/
);
assert.match(
  cabinetResourceOwnershipSource,
  /if \(cancelled\)[\s\S]*?texture\.dispose\(\)/
);
assert.match(glbRendererSource, /disposeObjectGeometryAndMaterials\(normalizedModel\)/);
assert.match(glbRendererSource, /ownedTextures\.forEach\(\(texture\) => texture\.dispose\(\)\)/);
assert.match(floorPlanAssetsSource, /URL\.revokeObjectURL\(/);

console.log("design page scene domain and lifecycle boundaries passed");
