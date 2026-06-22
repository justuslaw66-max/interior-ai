import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const designPage = readFileSync(join(process.cwd(), "app/design/page.tsx"), "utf8");

assert.match(
  designPage,
  /const \[lastValidCatalogPlacement, setLastValidCatalogPlacement\]/,
  "placement preview should remember the most recent valid pending spot"
);
assert.match(
  designPage,
  /const restorableCatalogPlacement = useMemo/,
  "placement preview should derive a restorable valid spot"
);
assert.match(
  designPage,
  /pendingCatalogPlacement\.productId !== lastValidCatalogPlacement\.productId/,
  "restorable spot should only apply to the same catalog item"
);
assert.match(
  designPage,
  /const shouldConfirmRestoredCatalogPlacement = Boolean/,
  "confirm should know when it can use a restored valid spot"
);
assert.match(
  designPage,
  /const restoreLastValidCatalogPlacement = useCallback/,
  "placement panel should expose a restore-valid-spot action"
);
assert.match(
  designPage,
  /data-testid="catalog-placement-restore-valid"/,
  "placement panel should render the restore-valid-spot button"
);
assert.match(
  designPage,
  /shouldConfirmRestoredCatalogPlacement && restorableCatalogPlacement[\s\S]*\? restorableCatalogPlacement/,
  "confirm should fall back to the remembered valid spot when needed"
);
assert.match(
  designPage,
  /Add valid spot to/,
  "confirm button should name the restored valid spot fallback"
);
assert.match(
  designPage,
  /if \(!pendingCatalogPlacementHardInvalid\) \{[\s\S]*setLastValidCatalogPlacement\(pendingCatalogPlacement\)/,
  "latest valid preview should be remembered while placement stays active"
);

console.log("Placement valid restore checks passed");
