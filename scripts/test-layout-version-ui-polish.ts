import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const presentExportDialog = readFileSync(
  join(process.cwd(), "components/editor/design-page/PresentExportDialog.tsx"),
  "utf8"
);

assert.match(
  presentExportDialog,
  /latestManualLayoutVersion/,
  "layout versions panel should derive a latest manual layout shortcut"
);
assert.match(
  presentExportDialog,
  /data-testid="layout-version-restore-latest-manual"/,
  "layout versions panel should expose quick restore for previous manual layout"
);
assert.match(
  presentExportDialog,
  /data-testid="layout-version-comparison"/,
  "layout version rows should render a comparison block"
);
assert.match(
  presentExportDialog,
  /Saved[\s\S]*Current/,
  "layout comparison should show saved and current counts"
);
assert.match(
  presentExportDialog,
  /summarizeLayoutVersionComparison\(comparison\)/,
  "layout version rows should use shared comparison summaries"
);

console.log("Layout version UI polish checks passed");
