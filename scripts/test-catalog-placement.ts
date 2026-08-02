import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  buildCatalogSupportSurfaceHighlight,
  buildCatalogPlacementPreview,
  buildPendingCatalogPlacementScene,
  doesCatalogPlacementCollide,
  findCatalogSurfacePlacement,
  getCeilingMountedItemBaseY,
  findCatalogPlacementPlanRoomAtWorldPoint,
  isCatalogPlacementLocalFootprintInsideRoom,
  isPointInsideCatalogPlacementPolygon,
  isSurfaceOnlyCatalogItem,
  isCeilingOnlyCatalogItem,
  isCatalogPlacementFootprintInsideRoom,
  isWorldPointInsideCatalogPlacementRoom,
  type CatalogPlacementPlanRoom,
} from "@/lib/catalog-placement";
import type { CatalogItemSchema } from "@/lib/catalog-schema";

function runCatalogPlacementHitTests() {
  const rooms: CatalogPlacementPlanRoom[] = [
    {
      id: "living",
      name: "Living Room",
      shape: "rectangle",
      x: 0,
      z: 0,
      w: 4,
      d: 4,
    },
    {
      id: "bedroom",
      name: "Bedroom",
      shape: "rectangle",
      x: 5,
      z: 0,
      w: 4,
      d: 4,
    },
  ];

  assert.equal(findCatalogPlacementPlanRoomAtWorldPoint(rooms, 0, 0)?.id, "living");
  assert.equal(findCatalogPlacementPlanRoomAtWorldPoint(rooms, 5, 0)?.id, "bedroom");
  assert.equal(findCatalogPlacementPlanRoomAtWorldPoint(rooms, 2.55, 0), null);
  assert.equal(
    isCatalogPlacementFootprintInsideRoom({
      room: rooms[1],
      position: [5, 0, 0],
      rotationY: 0,
      dimsMm: { w: 800, d: 800 },
      wallThickness: 0.1,
    }),
    true
  );
  assert.equal(
    isCatalogPlacementLocalFootprintInsideRoom({
      room: rooms[1],
      position: [0, 0, 0],
      rotationY: 0,
      dimsMm: { w: 800, d: 800 },
      wallThickness: 0.1,
    }),
    true
  );
  assert.equal(
    isCatalogPlacementLocalFootprintInsideRoom({
      room: rooms[1],
      position: [2, 0, 0],
      rotationY: 0,
      dimsMm: { w: 800, d: 800 },
      wallThickness: 0.1,
    }),
    false
  );
  assert.equal(
    isCatalogPlacementLocalFootprintInsideRoom({
      room: rooms[0],
      position: [1.4, 0, 0],
      rotationY: 0,
      dimsMm: { w: 1000, d: 500 },
      wallThickness: 0.1,
    }),
    true,
    "a furniture footprint may sit flush to the room's inner wall face"
  );
  assert.equal(
    isCatalogPlacementLocalFootprintInsideRoom({
      room: rooms[0],
      position: [1.41, 0, 0],
      rotationY: 0,
      dimsMm: { w: 1000, d: 500 },
      wallThickness: 0.1,
    }),
    false,
    "a furniture footprint must not cross an internal room wall"
  );
  assert.equal(
    isCatalogPlacementLocalFootprintInsideRoom({
      room: rooms[0],
      position: [1.68, 0, 0],
      rotationY: Math.PI / 2,
      dimsMm: { w: 1000, d: 500 },
      wallThickness: 0.1,
    }),
    false,
    "wall containment must use the rotated furniture footprint"
  );

  const lShapeRoom: CatalogPlacementPlanRoom = {
    id: "l-shape",
    name: "L Shape",
    shape: "l_shape",
    x: 0,
    z: 0,
    w: 10,
    d: 10,
  };

  assert.equal(isWorldPointInsideCatalogPlacementRoom(lShapeRoom, -3, 3), true);
  assert.equal(isWorldPointInsideCatalogPlacementRoom(lShapeRoom, 4, 4), false);

  const triangle = [
    { x: -2, z: -2 },
    { x: 2, z: -2 },
    { x: -2, z: 2 },
  ];
  const customRoom: CatalogPlacementPlanRoom = {
    id: "custom",
    name: "Custom",
    shape: "custom_polygon",
    polygon: triangle,
    x: 0,
    z: 0,
    w: 4,
    d: 4,
  };

  assert.equal(isPointInsideCatalogPlacementPolygon(-1, -1, triangle), true);
  assert.equal(isPointInsideCatalogPlacementPolygon(1.5, 1.5, triangle), false);
  assert.equal(isWorldPointInsideCatalogPlacementRoom(customRoom, -1, -1), true);
  assert.equal(isWorldPointInsideCatalogPlacementRoom(customRoom, 1.5, 1.5), false);
}

runCatalogPlacementHitTests();

const makeCatalogItem = (
  id: string,
  category: CatalogItemSchema["category"],
  dimsMm: CatalogItemSchema["dimsMm"],
  surfaceOnly = false
): CatalogItemSchema => ({
  id,
  slug: id,
  title: id,
  category,
  dimsMm,
  dimensionsMm: dimsMm,
  bounds: {
    type: "aabb",
    size: { w: dimsMm.w / 1000, d: dimsMm.d / 1000, h: dimsMm.h / 1000 },
    center: [0, dimsMm.h / 2000, 0],
  },
  pivot: { offsetX: 0, offsetZ: 0, groundAligned: true },
  defaultRotation: 0,
  placementRules: {
    floorOnly: !surfaceOnly,
    wallSnappable: false,
    wallMountable: false,
    minWallGapMm: 0,
    allowRugOverlap: false,
    snapMarginMm: 0,
    surfaceOnly,
    requiredSurfaceCategories: ["side_table"],
    surfaceInsetMm: 50,
  },
  clearanceRules: {
    walkwayMinMm: 0,
    coffeeGapMinMm: 0,
    coffeeGapMaxMm: 0,
    sofaClearanceMm: 0,
    wallClearanceMm: 0,
  },
  styleTags: ["modern"],
  toneTags: ["warm"],
  roomTags: ["living_room"],
  assets: {
    assetId: id,
    modelUrl: `/assets/models/${id}.glb`,
    thumbUrl: `/assets/thumbs/${id}.png`,
    materialsProfile: { preset: "default" },
  },
  variants: [
    {
      id: `${id}-default`,
      label: "Default",
      colorHex: "#d8cec0",
      thumbnailUrl: `/assets/thumbs/${id}.png`,
    },
  ],
  defaultVariantId: `${id}-default`,
  commerce: { type: "not_buyable", reason: "test" },
  aiRoles: [],
  tags: [],
});

function runSurfacePlacementTests() {
  const lamp = makeCatalogItem("test-table-lamp", "table_lamp", { w: 300, d: 300, h: 520 }, true);
  const table = makeCatalogItem("test-side-table", "side_table", { w: 600, d: 500, h: 450 });
  const tvConsole = makeCatalogItem("test-tv-console", "tv_console", { w: 1400, d: 420, h: 520 });
  const defaultSurfaceLamp = makeCatalogItem(
    "test-default-surface-table-lamp",
    "table_lamp",
    { w: 300, d: 300, h: 520 },
    true
  );
  defaultSurfaceLamp.placementRules.requiredSurfaceCategories = undefined;
  CATALOG_ITEMS[lamp.id] = lamp;
  CATALOG_ITEMS[table.id] = table;
  CATALOG_ITEMS[tvConsole.id] = tvConsole;
  CATALOG_ITEMS[defaultSurfaceLamp.id] = defaultSurfaceLamp;

  assert.equal(isSurfaceOnlyCatalogItem(lamp), true);
  assert.equal(
    findCatalogSurfacePlacement({
      productId: lamp.id,
      variantId: lamp.defaultVariantId,
      items: [],
    }),
    null,
    "surface-only items should not get a floor fallback without a valid table"
  );

  const placement = findCatalogSurfacePlacement({
    productId: lamp.id,
    variantId: lamp.defaultVariantId,
    items: [
      {
        instanceId: "side-table-1",
        productId: table.id,
        variantId: table.defaultVariantId,
        position: [1, 0, -0.5],
      },
    ],
  });

  assert.equal(placement?.supportInstanceId, "side-table-1");
  assert.deepEqual(placement?.position, [1, 0.45, -0.5]);

  const supportHighlight = buildCatalogSupportSurfaceHighlight({
    placement,
    items: [
      {
        instanceId: "side-table-1",
        productId: table.id,
        variantId: table.defaultVariantId,
        position: [1, 0, -0.5],
      },
    ],
    roomOffset: { x: 4, z: 2 },
  });

  assert.equal(supportHighlight?.supportInstanceId, "side-table-1");
  assert.equal(supportHighlight?.supportTitle, table.title);
  assert.deepEqual(supportHighlight?.position, [5, 0.465, 1.5]);
  assert.equal(supportHighlight?.width, 0.6);
  assert.equal(supportHighlight?.depth, 0.5);

  const placementScene = buildPendingCatalogPlacementScene({ placement });
  assert.equal(
    placementScene?.position[1],
    0.48,
    "surface-only placement footprints should render above the supporting tabletop"
  );

  const freeMovePlacement = findCatalogSurfacePlacement({
    productId: lamp.id,
    variantId: lamp.defaultVariantId,
    nearPosition: [1.08, 0, -0.54],
    items: [
      {
        instanceId: "side-table-1",
        productId: table.id,
        variantId: table.defaultVariantId,
        position: [1, 0, -0.5],
      },
    ],
  });

  assert.deepEqual(
    freeMovePlacement?.position,
    [1.08, 0.45, -0.54],
    "surface-only items should keep the drag position while it fits on the table"
  );

  const clampedPlacement = findCatalogSurfacePlacement({
    productId: lamp.id,
    variantId: lamp.defaultVariantId,
    nearPosition: [1.3, 0, -0.9],
    items: [
      {
        instanceId: "side-table-1",
        productId: table.id,
        variantId: table.defaultVariantId,
        position: [1, 0, -0.5],
      },
    ],
  });

  assert.deepEqual(
    clampedPlacement?.position,
    [1.1, 0.45, -0.55],
    "surface-only items should clamp to the tabletop bounds instead of snapping to center"
  );

  const tvConsolePlacement = findCatalogSurfacePlacement({
    productId: defaultSurfaceLamp.id,
    variantId: defaultSurfaceLamp.defaultVariantId,
    nearPosition: [0.25, 0, 0],
    items: [
      {
        instanceId: "tv-console-1",
        productId: tvConsole.id,
        variantId: tvConsole.defaultVariantId,
        position: [0, 0, 0],
      },
    ],
  });

  assert.equal(tvConsolePlacement?.supportInstanceId, "tv-console-1");
  assert.deepEqual(
    tvConsolePlacement?.position,
    [0.25, 0.52, 0],
    "default surface-only table lamps should be placeable on TV consoles"
  );

  delete CATALOG_ITEMS[lamp.id];
  delete CATALOG_ITEMS[table.id];
  delete CATALOG_ITEMS[tvConsole.id];
  delete CATALOG_ITEMS[defaultSurfaceLamp.id];
}

runSurfacePlacementTests();

function runCeilingPlacementTests() {
  const pendant = makeCatalogItem(
    "test-pendant-light",
    "pendant_light",
    { w: 300, d: 300, h: 1200 }
  );
  pendant.placementRules.floorOnly = false;
  pendant.placementRules.ceilingOnly = true;
  CATALOG_ITEMS[pendant.id] = pendant;
  const table = makeCatalogItem(
    "test-ceiling-support-table",
    "dining_table",
    { w: 1600, d: 900, h: 750 }
  );
  CATALOG_ITEMS[table.id] = table;

  assert.equal(isCeilingOnlyCatalogItem(pendant), true);
  assert.ok(
    Math.abs(
      getCeilingMountedItemBaseY({ product: pendant, dimsMm: pendant.dimsMm, roomHeight: 2.7 }) -
        1.5
    ) < 1e-9,
    "a 1.2m pendant should place its top at a 2.7m ceiling"
  );

  const preview = buildCatalogPlacementPreview({
    productId: pendant.id,
    variantId: pendant.defaultVariantId,
    canPlace: true,
    roomWidth: 4,
    roomDepth: 4,
    roomHeight: 2.7,
    wallThickness: 0.1,
    clampToActiveRoom: (x, z) => [x, z],
    collides: () => false,
  });
  assert.ok(preview);
  assert.equal(preview.position[0], 0);
  assert.ok(Math.abs(preview.position[1] - 1.5) < 1e-9);
  assert.equal(preview.position[2], 0);

  const getItemAABB = () => ({
    minX: -0.8,
    maxX: 0.8,
    minZ: -0.45,
    maxZ: 0.45,
    centerX: 0,
    centerZ: 0,
    width: 1.6,
    depth: 0.9,
  });
  assert.equal(
    doesCatalogPlacementCollide({
      productId: pendant.id,
      position: [0, 1.5, 0],
      rotationY: 0,
      dimsMm: pendant.dimsMm,
      items: [
        {
          instanceId: "dining-table-1",
          productId: table.id,
          variantId: table.defaultVariantId,
          position: [0, 0, 0],
        },
      ],
      getItemAABB,
    }),
    false,
    "ceiling lights should be allowed directly above floor furniture"
  );

  delete CATALOG_ITEMS[pendant.id];
  delete CATALOG_ITEMS[table.id];
}

runCeilingPlacementTests();
console.log("Catalog placement hit tests passed");
