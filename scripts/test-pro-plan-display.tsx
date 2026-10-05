import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { LayoutVersionsSection } from "../components/editor/design-page/LayoutVersionsSection";
import { PlanDisplaySection, PlanNotesSection, planStepFooter, type PlanDisplaySectionProps } from "../components/editor/design-page/PlanDisplaySection";
import type { PresentExportDialogProps } from "../components/editor/design-page/PresentExportDialog";
import { furnishStepFooter, stepPanelFooters } from "../components/editor/design-page/StepPanelFooters";
import { createLayoutVersion } from "../lib/layout-versions";
import type { RoomSnapshot } from "../lib/room-types";

// UX phase 4e (audit SX4 step 3 and ED14, J's Q5): Present & export keeps sharing and exports.
// The 2D plan display moves to Plan, for Pro, and Free users keep their notes there (J, 1 Oct:
// option A); layout versions become Pro's own section; lighting is the Lighting drawer's alone and
// quality More › Scene quality's alone.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const noop = () => {};

const planState: PlanDisplaySectionProps["state"] = {
  simplePlanControls: true,
  planLayerPreset: "presentation",
  planLayers: { grid: true, dimensions: true, labels: true, openings: true, builtIns: true, zones: false, annotations: true },
  planTheme: "consumer",
  planMeasurementUnit: "mm",
  annotationToolKind: "note",
  selectedPlanOverlayId: null,
  exportStylePreset: "consumer",
};
const planActions = new Proxy({}, { get: () => noop }) as PlanDisplaySectionProps["actions"];

// Simple: the plan detail switch, units, a note tool and Delete selected (off with nothing selected).
const simple = renderToStaticMarkup(createElement(PlanDisplaySection, { state: planState, actions: planActions }));
assert.match(simple, /data-testid="plan-display-section"/);
assert.match(simple, /<h3 id="plan-display-heading"[^>]*>Plan display<\/h3>/);
assert.match(simple, /role="group" aria-label="Plan detail"/);
assert.match(simple, /aria-pressed="true"[^>]*>Simple<\/button>/);
assert.match(simple, /data-testid="plan-add-note"[^>]*>Add note<\/button>/);
assert.doesNotMatch(simple, /plan-add-callout|plan-add-room-tag|Add door|Add built-in|Export style/);
assert.match(simple, /<button[^>]*disabled=""[^>]*>Delete selected<\/button>/);

// Detailed: callouts, room tags, doors, windows, built-ins and the export style.
const detailed = renderToStaticMarkup(
  createElement(PlanDisplaySection, { state: { ...planState, simplePlanControls: false, selectedPlanOverlayId: "note-1" }, actions: planActions })
);
for (const id of ["plan-add-note", "plan-add-callout", "plan-add-room-tag"]) assert.match(detailed, new RegExp(`data-testid="${id}"`));
for (const label of ["Add door", "Add window", "Add built-in"]) assert.match(detailed, new RegExp(`>${label}</button>`));
assert.match(detailed, /aria-label="Export style"/);
assert.doesNotMatch(detailed, /<button[^>]*disabled=""[^>]*>Delete selected<\/button>/);
assert.match(read("components/editor/design-page/PlanDisplaySection.tsx"), /dynamic\([\s\S]*PresentExportProfessionalPlanControls[\s\S]*ssr:\s*false/);

// Free users' notes (J, 1 Oct: option A): Add note and Delete selected, and nothing else of the display.
const notes = renderToStaticMarkup(createElement(PlanNotesSection, { state: planState, actions: planActions }));
assert.match(notes, /data-testid="plan-notes-section"/);
assert.match(notes, /<h3 id="plan-notes-heading"[^>]*>Notes on the plan<\/h3>/);
assert.match(notes, /data-testid="plan-add-note"[^>]*>Add note<\/button>/);
assert.match(notes, /<button[^>]*disabled=""[^>]*>Delete selected<\/button>/);
assert.doesNotMatch(notes, /plan-display-section|Plan detail|Simple|Detailed|plan-add-callout|plan-add-room-tag|Add door|Add built-in|Export style|Units/);
const selectedNote = renderToStaticMarkup(createElement(PlanNotesSection, { state: { ...planState, selectedPlanOverlayId: "note-1" }, actions: planActions }));
assert.doesNotMatch(selectedNote, /<button[^>]*disabled=""[^>]*>Delete selected<\/button>/);

// In Plan, while the 2D plan is on screen: Pro's plan display, or Free's notes. Not in 3D or other steps.
const tools = (pro: boolean, viewMode: "2d" | "3d") =>
  ({ configuration: { canUseAdvancedPlanControls: pro }, state: { ...planState, viewMode }, actions: planActions }) as unknown as PresentExportDialogProps;
const proFooter = planStepFooter("plan", tools(true, "2d"));
assert.ok(proFooter && proFooter.type === PlanDisplaySection, "Pro has the plan display.");
const freeFooter = planStepFooter("plan", tools(false, "2d"));
assert.ok(freeFooter && freeFooter.type === PlanNotesSection, "Free users have their notes.");
for (const pro of [true, false]) {
  assert.equal(planStepFooter("plan", tools(pro, "3d")), null, "Only for the 2D plan.");
  assert.equal(planStepFooter("furnish", tools(pro, "2d")), null, "Only in Plan.");
}
assert.equal(planStepFooter("plan", null), null);

// In Furnish, Pro's layout versions sit above Furnish's own foot (J, 5 Oct), in 2D and 3D alike.
for (const viewMode of ["2d", "3d"] as const) {
  const furnishFooter = furnishStepFooter("furnish", tools(true, viewMode));
  assert.ok(furnishFooter && furnishFooter.type === LayoutVersionsSection, "Pro has layout versions in Furnish.");
  assert.equal(furnishStepFooter("furnish", tools(false, viewMode)), null, "Layout versions are Pro's.");
  assert.equal(furnishStepFooter("plan", tools(true, viewMode)), null, "Only in Furnish.");
}
assert.equal(furnishStepFooter("furnish", null), null);
const planFooters = stepPanelFooters("plan", tools(true, "2d"));
assert.ok(planFooters.stepFooter && planFooters.furnishFooter === null);
const furnishFooters = stepPanelFooters("furnish", tools(true, "2d"));
assert.ok(furnishFooters.stepFooter === null && furnishFooters.furnishFooter);
assert.match(
  read("components/editor/design-page/DesignPagePanelRegion.tsx"),
  /<DesignControlsPanelAdapter \{\.\.\.state\.controls\} \{\.\.\.stepPanelFooters\(state\.controls\.configuration\.panelMode, planTools\)\} \/>/
);
assert.match(read("components/editor/design-page/DesignPageWorkspace.tsx"), /<DesignPagePanelRegion \{\.\.\.panelRegionModel\} planTools=\{presentExportDialog\} \/>/);
assert.match(read("components/editor/design-page/DesignControlsPanelAdapter.tsx"), /\.\.\.actions,\s+stepFooter,\s+furnishFooter,\s+\};/);
const controlsPanel = read("components/editor/DesignControlsPanel.tsx");
assert.match(controlsPanel, /<ProGridSnapToggles [^\n]*\/>\}\n\s+\{stepFooter\}\n\s+<\/div>/);
assert.match(controlsPanel, /<DesignControlsFurnishPanel\s+dark=\{dark\}\s+canEdit=\{canEdit\} isDesigner=\{isDesigner\} footer=\{furnishFooter\}/);
assert.match(read("components/editor/DesignControlsFurnishPanel.tsx"), /<FurnishImportedModels[\s\S]*?\/>\n\s+\{props\.footer\}\n\s+<FurnishFooter/, "Above Furnish's own foot.");

// Layout versions: save, compare, restore and delete, as their own section.
const room: RoomSnapshot = {
  id: "living",
  name: "Living",
  roomType: "living",
  geometry: { width: 5, depth: 4, wallThickness: 0.12 },
  items: [{ instanceId: "sofa-1", productId: "sofa", variantId: "sofa-default", position: [0, 0, -1], rotationY: 0 }],
  zones: [],
  savedViews: [],
  layoutVersions: [],
};
const version = createLayoutVersion(room, { name: "Before TV wall", source: "manual", timestamp: Date.now() });
const sectionProps = { nameInput: "", onNameChange: noop, onSave: noop, onRestore: noop, onDelete: noop };
const empty = renderToStaticMarkup(createElement(LayoutVersionsSection, { ...sectionProps, activeRoom: room }));
assert.match(empty, /data-testid="layout-versions-panel"/);
assert.match(empty, /<h3 id="layout-versions-heading"[^>]*>Layout versions<\/h3>/);
assert.match(empty, /data-testid="layout-version-name-input"[^>]*placeholder="Layout 1"/);
assert.match(empty, /No saved layouts yet\./);
assert.doesNotMatch(empty, /layout-version-restore-latest-manual|layout-version-list/);
const listed = renderToStaticMarkup(
  createElement(LayoutVersionsSection, { ...sectionProps, activeRoom: { ...room, layoutVersions: [version] } })
);
assert.match(listed, /data-testid="layout-version-restore-latest-manual"[^>]*><span[^>]*>Restore previous manual layout<\/span>/);
assert.match(listed, /<ul[^>]*data-testid="layout-version-list"/);
assert.match(listed, /data-testid="layout-version-comparison"[\s\S]*Saved[\s\S]*1 item[\s\S]*Current[\s\S]*1 item/);
assert.match(listed, new RegExp(`data-testid="layout-version-delete-${version.id}" aria-label="Delete Before TV wall"`));
assert.match(listed, /Manual · /);

// Present & export: no plan display, no lighting presets, no export style, no layout versions.
const presentExport = read("components/editor/design-page/PresentExportDialog.tsx");
assert.doesNotMatch(presentExport, /plan-add-note|PresentExportProfessionalPlanControls|LightingPresetsUI|Export style preset|DisplayUnitSelect|LayoutVersionsSection/);
assert.match(presentExport, /data-testid="presentation-lighting-status"/);
assert.equal(existsSync(join(root, "components/LightingPresetsUI.tsx")), false, "Lighting has one home: the Lighting drawer.");
assert.doesNotMatch(read("components/editor/design-page/LightingSettingsControls.tsx"), /lighting-quality-select|Presentation quality|onPerformanceModeChange/);
assert.match(read("components/editor/design-page/DesignPageEditorCommandBar.tsx"), /data-testid=\{`scene-performance-\$\{option\}`\}/);

console.log("Plan display (Pro), plan notes (Free), layout versions and lighting homes checks passed");
