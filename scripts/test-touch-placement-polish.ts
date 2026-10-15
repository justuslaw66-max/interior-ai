import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const confirmPanel = readFileSync(
  join(root, "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"),
  "utf8"
);
const roomRenderer = readFileSync(
  join(root, "components/editor/renderers/RoomRenderer2D.tsx"),
  "utf8"
);
const selectedPanel = readFileSync(
  join(root, "components/editor/SelectedItemDetailsPanel.tsx"),
  "utf8"
);

assert.match(
  confirmPanel,
  /data-testid="catalog-placement-confirm-panel"[\s\S]*fixed inset-x-0 bottom-0/,
  "placement confirmation should render as a mobile bottom sheet"
);
assert.match(
  confirmPanel,
  /md:max-h-\[min\(48vh,420px\)\][\s\S]*md:w-\[min\(460px,calc\(100vw-2rem\)\)\]/,
  "placement confirmation should stay compact on desktop"
);
assert.match(
  confirmPanel,
  /pb-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/,
  "bottom sheet should respect mobile safe-area inset"
);
assert.match(
  confirmPanel,
  /sticky bottom-0[\s\S]*data-testid="catalog-placement-confirm"/,
  "placement action row should stay reachable while sheet scrolls"
);
// The nudges are icon Buttons (UX 5n): 36px, and 44px on phones and touch screens.
for (const direction of ["left", "up", "down", "right"]) {
  assert.match(
    confirmPanel,
    new RegExp(`<Button\\s+size="icon"\\s+data-testid="catalog-placement-nudge-${direction}"`),
    "placement nudge buttons should keep finger-sized targets"
  );
}
assert.match(
  roomRenderer,
  /handle\.shape === "edge-z" \? 28[\s\S]*handle\.shape === "edge-x" \? 64 : 44/,
  "2D room resize handles should keep enlarged touch widths"
);
assert.match(
  roomRenderer,
  /handle\.shape === "edge-z" \? 64[\s\S]*handle\.shape === "edge-x" \? 28 : 44/,
  "2D room resize handles should keep enlarged touch heights"
);
// Compact Buttons (UX 5n): 30px with a mouse, 44px on phones and touch screens.
for (const direction of ["left", "back", "front", "right"]) {
  assert.match(
    selectedPanel,
    new RegExp(`<Button\\s+size="compact"\\s+data-testid="selected-item-nudge-${direction}"`),
    "selected item nudge buttons should keep larger touch targets"
  );
}

console.log("Touch placement polish checks passed");
