import assert from "node:assert/strict";

import { generateCabinetParts } from "../features/cabinetry/generateCabinetParts";
import { createCabinetPreset } from "../features/cabinetry/presets";
import { applyCabinetSemanticPreviewToParts } from "../features/cabinetry/semanticPreviewParts";

const cabinet = createCabinetPreset("cabinet_run", "semantic-preview-test");
const parts = generateCabinetParts(cabinet);
const originalSnapshot = JSON.stringify(parts);
const [left, right] = cabinet.modules;
assert(left && right, "cabinet run should provide an adjacent module pair");

const dividerPreview = applyCabinetSemanticPreviewToParts(cabinet, parts, {
  kind: "module_divider",
  leftModuleId: left.id,
  rightModuleId: right.id,
  leftWidthMm: left.width + 100,
  rightWidthMm: right.width - 100,
});
assert.notEqual(dividerPreview, parts, "valid divider preview should return lightweight parts");
assert.equal(dividerPreview.length, parts.length, "preview must preserve part count");
assert.deepEqual(
  dividerPreview.map((part) => part.id),
  parts.map((part) => part.id),
  "preview must preserve stable part IDs"
);
const originalRightPart = parts.find((part) => part.moduleId === right.id);
const previewRightPart = dividerPreview.find((part) => part.id === originalRightPart?.id);
assert(originalRightPart && previewRightPart, "right module should retain preview parts");
assert(
  previewRightPart.position.x > originalRightPart.position.x,
  "right module preview should follow the moved divider"
);
assert.equal(JSON.stringify(parts), originalSnapshot, "preview must not mutate settled parts");

const shelfPart = parts.find(
  (part) => part.type === "shelf" && typeof part.metadata?.shelfIndex === "number"
);
assert(shelfPart, "cabinet run should provide a semantic shelf part");
const shelfPreview = applyCabinetSemanticPreviewToParts(cabinet, parts, {
  kind: "shelf",
  moduleId: shelfPart.moduleId,
  shelfIndex: shelfPart.metadata!.shelfIndex as number,
  heightMm: shelfPart.position.y + 50,
});
const movedShelf = shelfPreview.find((part) => part.id === shelfPart.id);
assert.equal(movedShelf?.position.y, shelfPart.position.y + 50);
assert.equal(
  shelfPreview.filter((part, index) => part !== parts[index]).length,
  1,
  "shelf preview should clone only the selected shelf"
);

assert.equal(
  applyCabinetSemanticPreviewToParts(cabinet, parts, {
    kind: "module_divider",
    leftModuleId: left.id,
    rightModuleId: right.id,
    leftWidthMm: Number.POSITIVE_INFINITY,
    rightWidthMm: right.width,
  }),
  parts,
  "invalid preview numbers should preserve the settled part array"
);

console.log("Cabinet semantic preview-part tests passed.");
