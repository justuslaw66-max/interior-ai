import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const hookSource = readFileSync(join(root, "lib/useDesignPageLiveCatalog.ts"), "utf8");
const pageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const coreShellSource = readFileSync(
  join(root, "lib/useDesignPageCoreShellRegistration.ts"),
  "utf8"
);

assert.match(
  hookSource,
  /fetch\("\/api\/catalog\/live", \{\s*cache: "no-store",\s*\}\)/,
  "The live catalog controller should retain the uncached editor endpoint."
);
// Leaving the editor (for My designs, say) mid-read used to abort the request; the read now
// finishes, prunes the shared catalogue once per page session, and the next editor reuses it.
assert.doesNotMatch(
  hookSource,
  /AbortController|\.abort\(/,
  "Closing the editor should let the live catalog read finish rather than abort it."
);
assert.match(
  hookSource,
  /sessionLoad \?\?= fetchLiveCatalogIds\(\)/,
  "The live catalog should be read once per page session."
);
assert.match(
  hookSource,
  /\(cause: unknown\) => \{\s*sessionLoad = null;\s*throw cause;\s*\}/,
  "A failed live catalog read should be tried again by the next editor."
);
assert.match(
  hookSource,
  /useState\(\(\) => sessionLoaded\)/,
  "An editor opened after the read (back from My designs, say) should be ready at once."
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
  coreShellSource,
  /const liveCatalogReady = useDesignPageLiveCatalog\(\)/,
  "The core shell should consume the focused live catalog readiness controller."
);
assert.match(
  coreShellSource,
  /const canEdit = !isClientPreview && liveCatalogReady/,
  "Editor mutations should remain gated by live catalog readiness."
);
assert.match(
  pageSource,
  /useDesignPageCoreShellRegistration\(\{/,
  "The design page should consume live catalog readiness through its core shell."
);

console.log("design page live catalog guardrails passed");
