import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const hookSource = readFileSync(join(root, "lib/useDesignPageLiveCatalog.ts"), "utf8");
const pageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);

assert.match(
  hookSource,
  /fetch\("\/api\/catalog\/live", \{ cache: "no-store" \}\)/,
  "The live catalog controller should retain the uncached editor endpoint."
);
assert.match(
  hookSource,
  /allowedItemIds\.size === 0 && allowedAssetIds\.size === 0[\s\S]*?local catalog fallback/,
  "An empty live gate should preserve the bundled catalog fallback."
);
assert.match(
  hookSource,
  /keptCount <= Math\.max\(3, Math\.floor\(totalCatalogCount \* 0\.05\)\)[\s\S]*?suspiciously few items/,
  "A suspiciously incomplete live response should not collapse the editor catalog."
);
assert.match(
  hookSource,
  /if \(!cancelled\) setReady\(true\)/,
  "Catalog readiness should settle after success or fallback without updating an unmounted page."
);
assert.match(
  pageSource,
  /const liveCatalogReady = useDesignPageLiveCatalog\(\)/,
  "The design page should consume the focused live catalog readiness controller."
);
assert.match(
  pageSource,
  /const canEdit = !isClientPreview && liveCatalogReady/,
  "Editor mutations should remain gated by live catalog readiness."
);

console.log("design page live catalog guardrails passed");
