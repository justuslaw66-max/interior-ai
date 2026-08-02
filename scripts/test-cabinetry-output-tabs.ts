import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CABINET_OUTPUT_TABS,
  CabinetOutputTabs,
  getCabinetOutputTabForKey,
} from "../features/cabinetry/components/CabinetOutputTabs";

assert.deepEqual(CABINET_OUTPUT_TABS, [
  ["overview", "Overview"],
  ["issues", "Issues"],
  ["bom", "BOM"],
  ["materials", "Materials"],
  ["hardware", "Hardware"],
  ["outputs", "Outputs"],
]);
assert.equal(getCabinetOutputTabForKey("issues", "ArrowRight"), "bom");
assert.equal(getCabinetOutputTabForKey("issues", "ArrowLeft"), "overview");
assert.equal(getCabinetOutputTabForKey("overview", "ArrowLeft"), "outputs");
assert.equal(getCabinetOutputTabForKey("outputs", "ArrowRight"), "overview");
assert.equal(getCabinetOutputTabForKey("hardware", "Home"), "overview");
assert.equal(getCabinetOutputTabForKey("overview", "End"), "outputs");
assert.equal(getCabinetOutputTabForKey("issues", "Enter"), null);

const markup = renderToStaticMarkup(
  createElement(CabinetOutputTabs, {
    value: "issues",
    issueCount: 3,
    onChange: () => undefined,
  })
);
assert.match(markup, /^<div role="tablist" aria-label="Millwork outputs"/);
assert.equal(markup.match(/role="tab"/g)?.length, 6);
assert.match(
  markup,
  /data-testid="cabinet-output-tab-issues" aria-selected="true" aria-controls="cabinet-output-panel" tabindex="0"/
);
assert.match(markup, />Issues 3<\/button>/);
assert.equal(markup.match(/tabindex="-1"/g)?.length, 5);

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const detailedViewSource = readFileSync(
  resolve(
    process.cwd(),
    "features/cabinetry/components/CabinetryStudioDetailedView.tsx"
  ),
  "utf8"
);
const outputsPanelSource = readFileSync(
  resolve(
    process.cwd(),
    "features/cabinetry/components/CabinetStudioOutputsPanel.tsx"
  ),
  "utf8"
);
assert.match(
  outputsPanelSource,
  /import \{ CabinetOutputTabs, type CabinetOutputTab \} from "\.\/CabinetOutputTabs"/,
  "The outputs panel must compose the extracted output-tab boundary."
);
assert.match(outputsPanelSource, /<CabinetOutputTabs/);
assert.match(detailedViewSource, /<CabinetStudioOutputsPanel\b/);
assert.doesNotMatch(
  `${studioSource}\n${detailedViewSource}`,
  /aria-label="Millwork outputs"|handleOutputTabKeyDown/,
  "The studio shell must not regain output-tab navigation behavior."
);

console.log("Cabinetry output-tab checks passed.");
