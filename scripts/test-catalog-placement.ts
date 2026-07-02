import assert from "node:assert/strict";
import {
  findCatalogPlacementPlanRoomAtWorldPoint,
  isPointInsideCatalogPlacementPolygon,
  isWorldPointInsideCatalogPlacementRoom,
  type CatalogPlacementPlanRoom,
} from "@/lib/catalog-placement";

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
console.log("Catalog placement hit tests passed");
