import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const catalogPlacementHook = readFileSync(
  join(process.cwd(), "lib/useDesignPageCatalogPlacement.ts"),
  "utf8"
);
const confirmPanel = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/CatalogPlacementConfirmPanel.tsx"
  ),
  "utf8"
);

assert.match(
  catalogPlacementHook,
  /const pendingCatalogBestRoomPlacement = useMemo/,
  "placement preview should derive the best-scored room recommendation"
);
assert.match(
  catalogPlacementHook,
  /if \(room\.id === currentRoomId\) continue/,
  "best-room recommendation should compare against other rooms"
);
assert.match(
  catalogPlacementHook,
  /score\.kind === "blocks_path" \|\| score\.kind === "cramped"/,
  "best-room recommendation should skip blocked or cramped room placements"
);
assert.match(
  catalogPlacementHook,
  /best\.scoreDelta < 4/,
  "best-room recommendation should avoid noisy tiny score gains"
);
assert.match(
  catalogPlacementHook,
  /const movePendingCatalogPlacementToBestRoom = useCallback/,
  "placement panel should expose an action for moving to the best room"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-best-room-hint"/,
  "placement score card should explain the best-room recommendation"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-best-room"/,
  "placement action row should expose the best-room button"
);
assert.match(
  catalogPlacementHook,
  /Moved preview to \$\{pendingCatalogBestRoomPlacement\.roomName\}/,
  "best-room action should confirm the target room"
);

console.log("Placement best-room checks passed");
