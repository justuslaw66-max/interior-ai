import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { findBestCatalogRoomPlacement } from "@/lib/catalog-placement-policy";
import {
  makePolicyPlacement,
  makePolicyRoom,
  makePolicyScore,
} from "./catalog-placement-policy-test-utils";

const currentRoom = makePolicyRoom("room-current", "Current room");
const crampedRoom = makePolicyRoom("room-cramped", "Cramped room");
const betterRoom = makePolicyRoom("room-better", "Better room");
const okayRoom = makePolicyRoom("room-okay", "Okay room");
const visitedRoomIds: string[] = [];

const recommendation = findBestCatalogRoomPlacement({
  pendingPlacement: makePolicyPlacement(),
  currentScore: makePolicyScore(70, "okay"),
  rooms: [currentRoom, crampedRoom, betterRoom, okayRoom],
  currentRoomId: currentRoom.id,
  findPlacement: (_productId, variantId, _purchaseOptionId, room) => {
    visitedRoomIds.push(room.id);
    return makePolicyPlacement({
      roomId: room.id,
      variantId,
      position: [1, 0, 0],
    });
  },
  scorePlacement: (_placement, room) =>
    room.id === crampedRoom.id
      ? makePolicyScore(99, "blocks_path")
      : room.id === betterRoom.id
        ? makePolicyScore(86)
        : makePolicyScore(80),
});

assert.ok(recommendation);
assert.equal(recommendation.placement.roomId, betterRoom.id);
assert.equal(recommendation.roomName, betterRoom.name);
assert.equal(recommendation.scoreDelta, 16);
assert.equal(visitedRoomIds.includes(currentRoom.id), false);

assert.equal(
  findBestCatalogRoomPlacement({
    pendingPlacement: makePolicyPlacement(),
    currentScore: makePolicyScore(83),
    rooms: [currentRoom, betterRoom],
    currentRoomId: currentRoom.id,
    findPlacement: (_productId, variantId, _purchaseOptionId, room) =>
      makePolicyPlacement({ roomId: room.id, variantId }),
    scorePlacement: () => makePolicyScore(86),
  }),
  null,
  "tiny score gains should not produce a best-room recommendation"
);

const hookSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const recommendationModelSource = readFileSync(
  join(
    process.cwd(),
    "lib/useDesignPageCatalogPlacementRecommendationModel.ts"
  ),
  "utf8"
);
const confirmPanelSource = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"
  ),
  "utf8"
);

assert.match(recommendationModelSource, /findBestCatalogRoomPlacement\(\{/);
assert.match(hookSource, /movePendingCatalogPlacementToBestRoom/);
assert.match(confirmPanelSource, /data-testid="catalog-placement-best-room-hint"/);
assert.match(confirmPanelSource, /data-testid="catalog-placement-best-room"/);

console.log("Placement best-room checks passed");
