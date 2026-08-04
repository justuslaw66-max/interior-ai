import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildDesignEditorUrl } from "@/lib/design-editor-url";

const root = process.cwd();
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const opaqueDesignId = "opaque/id ?#&=+";
const canonicalUrl = buildDesignEditorUrl({ designId: opaqueDesignId });
const canonicalParams = new URL(canonicalUrl, "https://interior-ai.test")
  .searchParams;
assert.equal(new URL(canonicalUrl, "https://interior-ai.test").pathname, "/design");
assert.equal(canonicalParams.get("designId"), opaqueDesignId);
assert.equal(canonicalParams.size, 1);

const contextualUrl = buildDesignEditorUrl({
  designId: opaqueDesignId,
  mode: "designer",
  view: "2d",
  workspace: "furnish",
  floorPlanImportId: "job/id ?&",
});
const contextualParams = new URL(contextualUrl, "https://interior-ai.test")
  .searchParams;
assert.deepEqual([...contextualParams.entries()], [
  ["designId", opaqueDesignId],
  ["mode", "designer"],
  ["view", "2d"],
  ["workspace", "furnish"],
  ["floorPlanImport", "job/id ?&"],
]);
const inheritedContextParams = new URL(
  buildDesignEditorUrl({
    designId: opaqueDesignId,
    context: new URLSearchParams(
      "mode=designer&view=2d&workspace=furnish&next=https://evil.example&utm_source=ignored"
    ),
  }),
  "https://interior-ai.test"
).searchParams;
assert.deepEqual([...inheritedContextParams.entries()], [
  ["designId", opaqueDesignId],
  ["mode", "designer"],
  ["view", "2d"],
  ["workspace", "furnish"],
]);
assert.throws(
  () => buildDesignEditorUrl({ designId: "" }),
  /design ID/i,
  "Missing design identity must not silently create a blank editor URL."
);

const legacyRoute = read("app/design/[id]/page.tsx");
const dashboardList = read("components/DesignsListWithSelection.tsx");
const duplicateButton = read("components/DuplicateDesignButton.tsx");
const checkoutSuccess = read("app/checkout/success/page.tsx");
const floorPlanAssistant = read("components/editor/FloorPlanImportAssistant.tsx");
const floorPlanHistory = read("components/editor/FloorPlanImportHistory.tsx");
const floorPlanLifecycle = read(
  "lib/useDesignPageFloorPlanLifecycleRegistration.ts"
);
const canonicalWorkspace = read(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const requestedDesignWorkspace = read(
  "lib/useDesignPageRequestedDesignWorkspaceRegistration.ts"
);
const ownedDesignApi = read("app/api/designs/[id]/route.ts");

assert.match(legacyRoute, /redirect\(buildDesignEditorUrl\(\{/);
assert.doesNotMatch(legacyRoute, /DesignerCanvas|\bprisma\b|\bauth\(\)/);
assert.doesNotMatch(legacyRoute, /permanentRedirect/);
for (const parameter of ["mode", "view", "workspace", "floorPlanImport"]) {
  assert.match(
    legacyRoute,
    new RegExp(`resolvedSearchParams\\.${parameter}`),
    `The compatibility route should explicitly consider ${parameter}.`
  );
}
for (const arbitraryParameter of ["next", "redirect", "returnTo", "utm_source"]) {
  assert.doesNotMatch(
    legacyRoute,
    new RegExp(`resolvedSearchParams\\.${arbitraryParameter}`),
    `The compatibility route must not forward ${arbitraryParameter}.`
  );
}

for (const [label, source, identity] of [
  ["dashboard", dashboardList, "design.id"],
  ["duplicate", duplicateButton, "newDesignId"],
  ["checkout", checkoutSuccess, "designId"],
] as const) {
  assert.match(source, /buildDesignEditorUrl/);
  const expectedCall =
    identity === "designId"
      ? /buildDesignEditorUrl\(\{ designId \}\)/
      : new RegExp(
          `buildDesignEditorUrl\\(\\{ designId: ${identity.replace(".", "\\.")} \\}\\)`
        );
  assert.match(
    source,
    expectedCall,
    `${label} navigation should use the canonical saved-design URL helper.`
  );
  assert.doesNotMatch(
    source,
    /`\/design\/\$\{/,
    `${label} navigation must not construct the legacy editor route.`
  );
}

assert.match(
  duplicateButton,
  /if \(!res\.ok\)[\s\S]*?return;[\s\S]*?const newDesignId[\s\S]*?router\.push\(buildDesignEditorUrl/,
  "Duplicate failures must return without navigation, while success uses the response ID."
);
for (const source of [floorPlanAssistant, floorPlanHistory]) {
  assert.match(
    source,
    /`\/design\?designId=\$\{encodeURIComponent\([\s\S]*?view=2d&workspace=furnish&floorPlanImport=\$\{encodeURIComponent\(/,
    "Existing floor-plan continuations should retain the canonical saved-design URL and encoded context."
  );
}

assert.match(
  requestedDesignWorkspace,
  /searchParams\.get\("designId"\) \?\? ""/,
  "The canonical loader should preserve the opaque query value without trimming it."
);
assert.match(
  requestedDesignWorkspace,
  /loadDesign\(decision\.designId\)[\s\S]*?router\.replace/,
  "The canonical editor should continue loading the requested persisted design."
);
assert.match(
  requestedDesignWorkspace,
  /!input\.active \|\| input\.result === "loaded" \|\| input\.result === "superseded"[\s\S]*?kind: "unchanged"/,
  "A superseded route load must not pull navigation back to a stale design."
);
assert.match(
  requestedDesignWorkspace,
  /currentDesignId[\s\S]*?buildDesignEditorUrl\(\{[\s\S]*?designId: input\.currentDesignId,[\s\S]*?context: input\.context[\s\S]*?: "\/design"/,
  "A denied route load should restore the previous design with allowed editor context."
);
assert.match(
  requestedDesignWorkspace,
  /closeMyDesigns\(\);[\s\S]*?router\.push\(buildDesignEditorUrl\(\{ designId, context: searchParams \}\)\)/,
  "The in-editor My Designs list should navigate with the canonical URL before loading."
);
assert.match(
  floorPlanLifecycle,
  /loaded === "loaded"[\s\S]*?router\.push\(buildDesignEditorUrl\(\{[\s\S]*?designId: payload\.id/,
  "A successfully loaded floor-plan revision copy should replace the source URL identity."
);
assert.doesNotMatch(
  `${canonicalWorkspace}\n${requestedDesignWorkspace}\n${floorPlanLifecycle}`,
  /import\("@\/lib\/design-editor-url"\)/,
  "Client navigation should not resume from a late helper import after unmount."
);
assert.match(
  ownedDesignApi,
  /const isOwner =[\s\S]*?if \(!isOwner && !hasValidShareToken\)[\s\S]*?404/,
  "The canonical design API should retain owner/share authorization before returning persisted state."
);

console.log("Canonical saved-design routing checks passed.");
