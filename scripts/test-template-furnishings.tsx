import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { templateAppliedMessage } from "../lib/design-page-template-furnishings";
import { IMPORTED_CATALOG_REFRESH_AFTER_MS, readNowAndAtMostEvery } from "../lib/imported-catalog-readiness";

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
assert.match(source("lib/plan-template-document.ts"), /skippedFurnishings\.push\(intent\.category\);/);
assert.match(controller, /showRuleToast\(templateAppliedMessage\(template\.label, built\.pack, built\.skippedFurnishings\)\);/);

// Readiness: the imported catalogue marks itself answered once its products are in the catalogue,
// and the editor's product readiness (`canChangeProducts`) waits for it, with a time limit.
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
  /const liveCatalogReady = useDesignPageLiveCatalog\(\);\s*const \{ canEdit, canChangeProducts \} = designPageEditAccess\(isClientPreview, useClientHydrated\(\), liveCatalogReady\);/
);
// The imported catalogue (2.5 MB) is read on opening, and again on window focus at most every
// five minutes, not on every focus (J, 10 Oct 2026).
let clock = 1_000;
let reads = 0;
const onFocus = readNowAndAtMostEvery(IMPORTED_CATALOG_REFRESH_AFTER_MS, () => reads++, () => clock);
assert.equal(reads, 1, "Read once on opening.");
onFocus();
clock += IMPORTED_CATALOG_REFRESH_AFTER_MS - 1;
onFocus();
assert.equal(reads, 1, "Focus within five minutes reads nothing.");
clock += 1;
onFocus();
assert.equal(reads, 2, "Five minutes on, focus reads it again.");
onFocus();
assert.equal(reads, 2, "And the five minutes start again.");
assert.equal(IMPORTED_CATALOG_REFRESH_AFTER_MS, 5 * 60_000);
assert.match(
  source("lib/useDesignPageImportedModels.ts"),
  /const refreshOnFocus = readNowAndAtMostEvery\(IMPORTED_CATALOG_REFRESH_AFTER_MS, \(\) => void hydrate\(\)\);\s*window\.addEventListener\("focus", refreshOnFocus\);/
);

// Furnished templates are products, so their cards wait for that readiness; empty ones don't.
assert.match(source("lib/useDesignPageStartChooser.ts"), /furnishedReady: state\.canChangeProducts,/);
assert.match(
  source("components/editor/start/StartTemplateGallery.tsx"),
  /disabled=\{!ready \|\| \(withFurniture && !furnishedReady\)\}/
);

console.log("Template furnishing checks passed.");
