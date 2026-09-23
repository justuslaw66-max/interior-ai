import assert from "node:assert/strict";

import { getCabinetTemplateRoomTerms } from "../features/cabinetry/templateRecommendations";

assert.deepEqual(
  getCabinetTemplateRoomTerms({ roomType: "kitchen", roomName: "My creative studio" }),
  ["kitchen", "pantry", "island"],
  "renaming a kitchen must not remove its structured recommendation context"
);
assert.deepEqual(
  getCabinetTemplateRoomTerms({ roomType: "bedroom", roomName: "Room 2" }),
  ["bedroom", "wardrobe", "closet", "bed"],
  "a generic bedroom name must still rank bedroom millwork"
);
assert.deepEqual(
  getCabinetTemplateRoomTerms({ roomType: "living", roomName: "Kitchen" }),
  ["living", "media", "library", "bar"],
  "structured context must take precedence over a misleading display name"
);
assert.deepEqual(
  getCabinetTemplateRoomTerms({ roomType: "custom", roomName: "Laundry utility" }),
  ["laundry", "utility"],
  "custom and legacy rooms should retain the name-based fallback"
);
assert.deepEqual(getCabinetTemplateRoomTerms(undefined), []);

console.log("Cabinetry structured room recommendation checks passed");
