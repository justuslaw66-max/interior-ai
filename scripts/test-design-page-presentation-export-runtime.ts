import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveDesignPagePresentHotkey } from "../lib/design-page-presentation-hotkey";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const runtimeSource = readSource(
  "lib/useDesignPagePresentationExportRuntime.ts"
);

assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: true, key: "p" }),
  "toggle-client-preview",
  "Lowercase P should toggle client preview for designers."
);
assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: true, key: "P" }),
  "toggle-client-preview",
  "Uppercase P should toggle client preview for designers."
);
assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: false, key: "p" }),
  null,
  "The presentation hotkey should remain disabled outside designer mode."
);
assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: true, key: "KeyP" }),
  null,
  "The resolver should continue using KeyboardEvent.key semantics."
);

assert.match(
  workspaceSource,
  /useDesignPagePresentationExportRuntime\(\{/,
  "The workspace should register presentation, camera focus, and export through their runtime."
);
for (const formerWorkspaceOwner of [
  "handlePresentModeHotkey",
  "useDesignPageCartHoverCameraFocus",
  "useDesignPageExport",
]) {
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`\\b${formerWorkspaceOwner}\\b`),
    `The workspace should not retain ${formerWorkspaceOwner} ownership.`
  );
}

const runtimeOrder = [
  "useEffect(() => {",
  'window.addEventListener("keydown", handlePresentModeHotkey)',
  'window.removeEventListener("keydown", handlePresentModeHotkey)',
  "useDesignPageCartHoverCameraFocus({",
  "useDesignPageExport({",
];
let previousIndex = -1;
for (const marker of runtimeOrder) {
  const index = runtimeSource.indexOf(marker);
  assert.ok(
    index > previousIndex,
    `Presentation/export runtime should preserve hook and cleanup order: ${marker}`
  );
  previousIndex = index;
}

assert.ok(
  workspaceSource.indexOf("useDesignPageHistoryShortcuts({") <
    workspaceSource.indexOf("useDesignPagePresentationExportRuntime({") &&
    workspaceSource.indexOf("useDesignPagePresentationExportRuntime({") <
      workspaceSource.indexOf("useDesignPageLocalBackupHydration({"),
  "The presentation/export runtime should remain between history shortcuts and backup hydration."
);
assert.match(
  runtimeSource,
  /const exportController = useDesignPageExport\(\{[\s\S]*?return exportController;/,
  "The runtime should return the existing export controller contract unchanged."
);

console.log("Design-page presentation/export runtime checks passed.");
