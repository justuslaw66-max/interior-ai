import assert from "node:assert/strict";
import { createElement, type SetStateAction } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isDesignControlsPanelMode,
  resolveDesignControlsPanelMode,
  useDesignPagePanelMode,
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

// Choosing a step shows its panel even when the sidebar was collapsed to its edge strip (ST13).
type PanelModeSteps = ReturnType<typeof useDesignPagePanelMode>;
const calls: string[] = [];
const record = (name: string) => (value: SetStateAction<unknown>) => {
  calls.push(`${name}(${JSON.stringify(value)})`);
};
function PanelModeProbe({ onRender }: { onRender: (steps: PanelModeSteps) => void }) {
  onRender(
    useDesignPagePanelMode({
      editorMode: "design",
      setEditorMode: record("setEditorMode"),
      designPanelOpen: true,
      setDesignPanelOpen: record("setDesignPanelOpen"),
      setDesignPanelCollapsed: record("setDesignPanelCollapsed"),
      setItemCartOpen: record("setItemCartOpen"),
    })
  );
  return null;
}
function renderPanelModeSteps() {
  calls.length = 0;
  const probe: { steps: PanelModeSteps | null } = { steps: null };
  renderToStaticMarkup(
    createElement(PanelModeProbe, {
      onRender: (steps) => {
        probe.steps = steps;
      },
    })
  );
  assert.ok(probe.steps, "The panel-mode hook should render.");
  return { steps: probe.steps, calls };
}

for (const [step, mode] of [
  ["goPlan", "design"],
  ["goFurnish", "adjust"],
  ["goAiDesign", "ai"],
] as const) {
  const { steps, calls } = renderPanelModeSteps();
  steps[step]();
  assert.deepEqual(
    calls,
    [
      `setEditorMode("${mode}")`,
      "setDesignPanelOpen(true)",
      "setDesignPanelCollapsed(false)",
      "setItemCartOpen(false)",
    ],
    `${step} should open its panel, uncollapsed`
  );
}
{
  const { steps, calls } = renderPanelModeSteps();
  steps.goShop();
  assert.deepEqual(
    calls,
    ['setEditorMode("buy")', "setDesignPanelOpen(false)", "setItemCartOpen(false)"],
    "Shop closes the controls panel"
  );
}

console.log("Design page panel mode checks passed");
