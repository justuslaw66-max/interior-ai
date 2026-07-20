import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(resolve(root, relativePath), "utf8");

const studio = read("features/cabinetry/components/CabinetryStudio.tsx");
const guidedView = read(
  "features/cabinetry/components/CabinetryStudioGuidedView.tsx"
);
const detailedView = read(
  "features/cabinetry/components/CabinetryStudioDetailedView.tsx"
);
const componentPaths = [
  "features/cabinetry/components/CabinetStudioNavigator.tsx",
  "features/cabinetry/components/CabinetAssemblyInspector.tsx",
  "features/cabinetry/components/CabinetPartInspector.tsx",
  "features/cabinetry/components/CabinetStudioDetailedPreviews.tsx",
  "features/cabinetry/components/CabinetGuidedPreviewPanel.tsx",
  "features/cabinetry/components/CabinetGuidedReviewPanel.tsx",
  "features/cabinetry/components/CabinetGuidedActionFooter.tsx",
  "features/cabinetry/components/CabinetProductionOutputs.tsx",
  "features/cabinetry/components/CabinetStudioOutputsPanel.tsx",
] as const;
const components: ReadonlyMap<string, string> = new Map(
  componentPaths.map((path) => [path, read(path)] as const)
);

const viewCompositions = new Map([
  [
    guidedView,
    [
      "CabinetGuidedPreviewPanel",
      "CabinetGuidedReviewPanel",
      "CabinetGuidedActionFooter",
    ],
  ],
  [
    detailedView,
    [
      "CabinetStudioNavigator",
      "CabinetAssemblyInspector",
      "CabinetPartInspector",
      "CabinetDetailedCompactPreview",
      "CabinetDetailedPreviewPanel",
      "CabinetStudioOutputsPanel",
    ],
  ],
]);
for (const [owner, compositions] of viewCompositions) {
  for (const component of compositions) {
    assert.match(
      owner,
      new RegExp(`<${component}\\b`),
      `The mode view must compose ${component}`
    );
  }
}

for (const component of [
  "CabinetryStudioGuidedView",
  "CabinetryStudioDetailedView",
]) {
  assert.match(
    studio,
    new RegExp(`<${component}\\b`),
    `CabinetryStudio must compose the ${component} boundary`
  );
}

const ownershipMarkers = new Map<string, readonly string[]>([
  [componentPaths[0], ["cabinet-module-add", "cabinet-property-search-input"]],
  [componentPaths[1], ["cabinet-assembly-inspector"]],
  [componentPaths[2], ["cabinet-part-inspector", "cabinet-part-open-parent-module"]],
  [componentPaths[3], ["cabinet-detailed-compact-preview", "cabinet-preview-status"]],
  [componentPaths[4], ["data-validation-policy=\"errors_block_warnings_allow\""]],
  [componentPaths[5], ["cabinet-guided-review-panel", "cabinet-consumer-estimate"]],
  [componentPaths[6], ["cabinet-guided-back", "cabinet-guided-next"]],
  [componentPaths[7], ["cabinet-quote-summary", "cabinet-cut-list"]],
  [componentPaths[8], ["cabinet-output-panel", "cabinet-download-glb"]],
]);

for (const [path, markers] of ownershipMarkers) {
  const source = components.get(path);
  assert.ok(source, `Missing source for ${path}`);
  for (const marker of markers) {
    assert.ok(source.includes(marker), `${path} must own ${marker}`);
  }
}

for (const movedMarker of [
  "cabinet-detailed-compact-preview",
  "cabinet-assembly-inspector",
  "cabinet-part-inspector",
  "cabinet-guided-review-panel",
  "cabinet-preview-status",
  "cabinet-output-panel",
  "cabinet-quote-summary",
  "cabinet-cut-list",
]) {
  assert.ok(
    !studio.includes(movedMarker),
    `CabinetryStudio must keep ${movedMarker} behind its Batch 6 UI boundary`
  );
}

const forbiddenUiImplementation = [
  /window\.localStorage/,
  /readSavedCabinetTemplates/,
  /writeSavedCabinetTemplates/,
  /readStoredCabinet/,
  /writeStoredCabinet/,
  /emitCabinetStudioAnalytics/,
  /createCabinetStudioPlacementPayload/,
  /generateCabinetParts/,
  /setDefinition\(/,
  /from ["'][^"']*\/CabinetryStudio["']/,
];
const presentationSources = new Map([
  ...components,
  [
    "features/cabinetry/components/CabinetryStudioGuidedView.tsx",
    guidedView,
  ],
  [
    "features/cabinetry/components/CabinetryStudioDetailedView.tsx",
    detailedView,
  ],
]);
for (const [path, source] of presentationSources) {
  for (const forbidden of forbiddenUiImplementation) {
    assert.doesNotMatch(
      source,
      forbidden,
      `${path} must remain presentation-only (${forbidden})`
    );
  }
}

const outputTabs = read(
  "features/cabinetry/components/CabinetOutputTabs.tsx"
);
for (const keyboardContract of ["ArrowRight", "ArrowLeft", "Home", "End"]) {
  assert.ok(
    outputTabs.includes(keyboardContract),
    `Output tabs must retain ${keyboardContract} keyboard behavior`
  );
}
assert.match(outputTabs, /document\.getElementById[\s\S]*?\.focus\(\)/);

const outputPanel = components.get(componentPaths[8]) ?? "";
assert.match(outputPanel, /useRef<HTMLInputElement>\(null\)/);
assert.match(outputPanel, /ref=\{sourceImportInputRef\}/);
assert.match(outputPanel, /onChange=\{onImportSource\}/);
assert.match(outputPanel, /sourceImportInputRef\.current\?\.click\(\)/);

console.log(
  "Cabinetry Studio Batch 8 UI component checks passed (mode-view ownership, explicit inputs, callback-only mutations, preserved test IDs, output focus, and file-input ownership)."
);
