import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const designPage = readFileSync(join(root, "app/design/page.tsx"), "utf8");
const roomRenderer = readFileSync(
  join(root, "components/editor/renderers/RoomRenderer2D.tsx"),
  "utf8"
);
const selectedPanel = readFileSync(
  join(root, "components/editor/SelectedItemDetailsPanel.tsx"),
  "utf8"
);

assert.match(
  designPage,
  /data-testid="catalog-placement-confirm-panel"[\s\S]*fixed inset-x-0 bottom-0/,
  "placement confirmation should render as a mobile bottom sheet"
);
assert.match(
  designPage,
  /md:max-h-\[min\(48vh,420px\)\][\s\S]*md:w-\[min\(460px,calc\(100vw-2rem\)\)\]/,
  "placement confirmation should stay compact on desktop"
);
assert.match(
  designPage,
  /pb-\[calc\(1rem\+env\(safe-area-inset-bottom\)\)\]/,
  "bottom sheet should respect mobile safe-area inset"
);
assert.match(
  designPage,
  /sticky bottom-0[\s\S]*data-testid="catalog-placement-confirm"/,
  "placement action row should stay reachable while sheet scrolls"
);
assert.match(
  designPage,
  /data-testid="catalog-placement-nudge-left"[\s\S]*h-11 w-11/,
  "placement nudge buttons should keep finger-sized targets"
);
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
assert.match(
  selectedPanel,
  /data-testid="selected-item-nudge-left"[\s\S]*min-h-10/,
  "selected item nudge buttons should keep larger touch targets"
);

console.log("Touch placement polish checks passed");
