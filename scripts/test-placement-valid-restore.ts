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
  /const \[lastValidPlacement, setLastValidPlacement\]/,
  "placement preview should remember the most recent valid pending spot"
);
assert.match(
  catalogPlacementHook,
  /const restorableCatalogPlacement = useMemo/,
  "placement preview should derive a restorable valid spot"
);
assert.match(
  catalogPlacementHook,
  /pendingPlacement\.productId !== lastValidPlacement\.productId/,
  "restorable spot should only apply to the same catalog item"
);
assert.match(
  catalogPlacementHook,
  /const shouldConfirmRestoredCatalogPlacement = Boolean/,
  "confirm should know when it can use a restored valid spot"
);
assert.match(
  catalogPlacementHook,
  /const restoreLastValidCatalogPlacement = useCallback/,
  "placement panel should expose a restore-valid-spot action"
);
assert.match(
  confirmPanel,
  /data-testid="catalog-placement-restore-valid"/,
  "placement panel should render the restore-valid-spot button"
);
assert.match(
  catalogPlacementHook,
  /shouldConfirmRestoredCatalogPlacement && restorableCatalogPlacement[\s\S]*\? restorableCatalogPlacement/,
  "confirm should fall back to the remembered valid spot when needed"
);
assert.match(
  confirmPanel,
  /Add valid spot to/,
  "confirm button should name the restored valid spot fallback"
);
assert.match(
  catalogPlacementHook,
  /if \(!pendingCatalogPlacementHardInvalid\) \{[\s\S]*setLastValidPlacement\(pendingPlacement\)/,
  "latest valid preview should be remembered while placement stays active"
);

console.log("Placement valid restore checks passed");
