import assert from "node:assert/strict";
import type { CatalogItemSchema } from "../lib/catalog-schema";
import { computeCirculationAnalysis } from "../lib/circulation-analysis";
import type { RoomSnapshot } from "../lib/room-types";

const blockerProduct = {
  id: "blocker",
  slug: "blocker",
  title: "Blocker",
  category: "sideboard",
  dimsMm: { w: 3600, d: 650, h: 800 },
  styleTags: [],
  toneTags: [],
  roomTags: [],
  assets: { modelUrl: "", thumbnailUrl: "" },
  variants: [{ id: "default", label: "Default", colorHex: "#999", thumbnailUrl: "" }],
  defaultVariantId: "default",
} as unknown as CatalogItemSchema;

const catalogItems = { blocker: blockerProduct };

const room: RoomSnapshot = {
  id: "room",
  name: "Room",
  roomType: "living",
  geometry: { width: 4.2, depth: 4, wallThickness: 0.12 },
  items: [],
  zones: [
    {
      id: "seating",
      type: "seating",
      itemIds: [],
      anchor: [0, 0, -1.2],
      source: "manual",
    },
  ],
  savedViews: [],
};

const open = computeCirculationAnalysis({
  room,
  items: [],
  catalogItems,
  openings: [{ id: "door", roomId: "room", wall: "south", offsetMm: 0, widthMm: 900, kind: "door" }],
});
assert.equal(open.pathValid, true);
assert.equal(open.warnings.length, 0);

const blocked = computeCirculationAnalysis({
  room,
  items: [
    {
      instanceId: "blocker-1",
      productId: "blocker",
      variantId: "default",
      position: [0, 0, 0.4],
      rotationY: 0,
    },
  ],
  catalogItems,
  openings: [{ id: "door", roomId: "room", wall: "south", offsetMm: 0, widthMm: 900, kind: "door" }],
});
assert.equal(blocked.pathValid, false);
assert.ok(blocked.warnings.some((warning) => /walking path/i.test(warning)));
assert.ok(blocked.heatmap.some((cell) => cell.level === "blocked"));

console.log("Circulation analysis checks passed");
