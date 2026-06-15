import assert from "node:assert/strict";
import {
  isDesignControlsPanelMode,
  resolveDesignControlsPanelMode,
  type DesignPageEditorMode,
} from "../lib/useDesignPagePanelMode";

const panelModeCases: Array<[DesignPageEditorMode, ReturnType<typeof resolveDesignControlsPanelMode>]> = [
  ["design", "plan"],
  ["adjust", "furnish"],
  ["ai", "ai"],
  ["buy", "plan"],
  ["present", "plan"],
];

for (const [editorMode, expectedPanelMode] of panelModeCases) {
  assert.equal(
    resolveDesignControlsPanelMode(editorMode),
    expectedPanelMode,
    `${editorMode} should resolve to ${expectedPanelMode}`
  );
}

assert.equal(isDesignControlsPanelMode("design"), true);
assert.equal(isDesignControlsPanelMode("adjust"), true);
assert.equal(isDesignControlsPanelMode("ai"), true);
assert.equal(isDesignControlsPanelMode("buy"), false);
assert.equal(isDesignControlsPanelMode("present"), false);

console.log("Design page panel mode checks passed");
