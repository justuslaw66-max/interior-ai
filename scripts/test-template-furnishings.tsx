import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { templateAppliedMessage } from "../lib/design-page-template-furnishings";

// A furnished template names what it couldn't place, and the editor waits for the imported
// catalogue before products can be added, since sofas, floor lamps and dining benches come only
// from it (UX phase 4a).

const pack = { intents: [1, 2, 3, 4, 5, 6] };
assert.equal(templateAppliedMessage("Studio", null, []), "Studio added");
assert.equal(templateAppliedMessage("Studio", pack, []), "Studio added with furniture");
assert.equal(templateAppliedMessage("Studio", pack, ["rug"]), "Studio added without the rug");
assert.equal(
  templateAppliedMessage("Studio", pack, ["rug", "floor_lamp"]),
  "Studio added without the rug and the floor lamp"
);
assert.equal(
  templateAppliedMessage("Studio", pack, ["sofa", "rug", "side_table", "side_table"]),
  "Studio added without the sofa, the rug and the side tables"
);
assert.equal(
  templateAppliedMessage("Studio", pack, ["accent_chair", "tv_console"]),
  "Studio added without the armchair and the TV console"
);
assert.equal(
  templateAppliedMessage("Studio", { intents: [1, 2] }, ["sofa", "rug"]),
  "Studio added without furniture",
  "Nothing placed: say so plainly rather than list every product."
);

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const controller = source("lib/useDesignPageFloorPlanUnderlayController.ts");
assert.doesNotMatch(controller, /Some items couldn't be added/);
assert.match(
  controller,
  /skippedFurnishings\.push\(intent\.category\);[\s\S]*?showRuleToast\(templateAppliedMessage\(template\.label, selectedFurnishingPack, skippedFurnishings\)\)/
);

// Readiness: the imported catalogue marks itself answered once its products are in the catalogue,
// and the editor's product readiness (`canEdit`) waits for it, with a time limit.
assert.match(
  source("lib/useDesignPageImportedModels.ts"),
  /if \(cancelled\) return;[\s\S]*?setModelOptions\(imported\.options\);\s*markImportedCatalogHydrated\(\);/,
  "The imported catalogue is ready once its products are applied, not when a cancelled read ends."
);
assert.match(source("lib/useDesignPageLiveCatalog.ts"), /return ready && importedCatalogHydrated;/);
const readiness = source("lib/imported-catalog-readiness.ts");
assert.match(readiness, /export const IMPORTED_CATALOG_WAIT_MS = 10_000;/);
assert.match(readiness, /setTimeout\(markImportedCatalogHydrated, IMPORTED_CATALOG_WAIT_MS\)/);
assert.match(
  source("lib/useDesignPageCoreShellRegistration.ts"),
  /const liveCatalogReady = useDesignPageLiveCatalog\(\);\s*const canEdit = !isClientPreview && liveCatalogReady;/
);

console.log("Template furnishing checks passed.");
