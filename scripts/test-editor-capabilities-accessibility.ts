import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveEditorCapabilities } from "../lib/editor-capabilities";
import { getExportCapabilities } from "../lib/export-capabilities";
import { isOnboardingEligible } from "../lib/onboarding";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const consumer = resolveEditorCapabilities("free");
const professional = resolveEditorCapabilities("pro");

assert.equal(consumer.placeCatalogItems, true);
assert.equal(professional.placeCatalogItems, true);
assert.equal(consumer.createBasicAnnotations, true);
assert.equal(professional.createBasicAnnotations, true);

for (const capability of [
  "useAdvancedTransforms",
  "configurePlanLayers",
  "viewTechnicalDimensions",
  "createTechnicalAnnotations",
  "customizeMaterials",
  "importCad",
  "tuneAdvancedRendering",
  "applyAiSuggestions",
  "useDesignerWorkspace",
  "exportMultipleViews",
  "exportPdf",
] as const) {
  assert.equal(consumer[capability], false, `${capability} should be guarded in the consumer experience`);
  assert.equal(professional[capability], true, `${capability} should be available in the professional experience`);
}

assert.equal(Object.isFrozen(consumer), true);
assert.equal(Object.isFrozen(professional), true);
assert.deepEqual(getExportCapabilities("free"), {
  watermark: true,
  customBranding: false,
  pdfDownload: false,
  extendedAiNotes: false,
  clientNameField: false,
  designerLogoUpload: false,
  multiRoomCover: false,
  editableDesignerNotes: false,
});
assert.equal(getExportCapabilities("pro").pdfDownload, true);
assert.equal(
  isOnboardingEligible({ skipGuidedOnboarding: true }),
  false,
  "guided onboarding should use behavior policy instead of a tier check"
);

for (const relativePath of [
  "components/editor/EditorCommandBar.tsx",
  "components/editor/design-page/DesignPageWorkspace.tsx",
  "lib/design-page-dialog-layer-model.ts",
  "lib/useDesignPageExport.ts",
  "lib/useDesignPageOnboarding.ts",
  "lib/useDesignPagePresentationQaFacade.ts",
]) {
  const source = read(relativePath);
  assert.doesNotMatch(source, /\bisPro\b|plan\s*[!=]==?\s*["']pro["']/,
    `${relativePath} should consume behavior capabilities rather than plan-tier conditionals`);
}

const dialogPrimitive = read(
  "components/editor/design-system/EditorDialog.tsx"
);
for (const required of [
  'role="dialog"',
  'aria-modal="true"',
  "aria-labelledby={titleId}",
  "aria-describedby={description ? descriptionId : undefined}",
  'event.key === "Escape"',
  'event.key !== "Tab"',
  "opener.focus()",
  "focus-visible:ring-2",
  "motion-reduce:transition-none",
  "min-h-11",
]) {
  assert.ok(
    dialogPrimitive.includes(required),
    `shared dialog primitive must preserve ${required}`
  );
}

for (const relativePath of [
  "components/ConfirmDialog.tsx",
  "components/CopyFallbackDialog.tsx",
  "components/editor/design-page/AiNotesDialog.tsx",
  "components/editor/design-page/PlanAnnotationDialog.tsx",
  "components/editor/design-page/RoomRenameDialog.tsx",
  "components/editor/design-page/UpgradeDialog.tsx",
  "components/editor/design-page/PresentExportDialog.tsx",
]) {
  assert.match(
    read(relativePath),
    /EditorDialog/,
    `${relativePath} should use the shared accessible dialog primitive`
  );
}

const presentExport = read(
  "components/editor/design-page/PresentExportDialog.tsx"
);
assert.match(
  presentExport,
  /dynamic\([\s\S]*PresentExportProfessionalPlanControls[\s\S]*ssr:\s*false/,
  "professional plan controls should remain behind a client-only lazy boundary"
);

const pdfRoute = read("app/api/export/pdf/route.ts");
assert.match(pdfRoute, /select:\s*\{\s*plan:\s*true\s*\}/);
assert.match(pdfRoute, /normalizeTierFromPlan\(dbUser\?\.plan\)/);

const furnishPanel = read(
  "components/editor/DesignControlsFurnishPanel.tsx"
);
for (const required of [
  'data-testid="placed-item-selector"',
  'role="list"',
  'role="listitem"',
  "aria-label={selectionLabel}",
  "aria-pressed={selected}",
  "focus-visible:ring-2",
  "Tab to an item, then press Enter or Space to select.",
]) {
  assert.ok(
    furnishPanel.includes(required),
    `placed-item keyboard selector must preserve ${required}`
  );
}

const panelRegistration = read("lib/design-page-panel-registration.ts");
assert.match(
  panelRegistration,
  /onSelectPlacedItem:\s*\(instanceId\)\s*=>\s*placementSelection\.actions\.selection\.selectItem\(instanceId,\s*false\)/,
  "placed-item keyboard selection should use the canonical single-selection controller"
);

const planItemRenderer = read(
  "components/editor/renderers/ItemRenderer2D.tsx"
);
for (const required of [
  'data-testid="plan-item-keyboard-target"',
  "aria-label={`Select ${label} in 2D plan`}",
  "aria-pressed={selected}",
  "focus-visible:outline",
  "onSelect(event.shiftKey)",
]) {
  assert.ok(
    planItemRenderer.includes(required),
    `2D plan item keyboard target must preserve ${required}`
  );
}

const furnitureItem = read("components/scene/FurnitureItem.tsx");
assert.match(
  furnitureItem,
  /onSelect=\{\(additive\)\s*=>\s*onSelect\?\.\(instanceId,\s*additive\)\}/,
  "2D plan item buttons should use the canonical furniture selection callback"
);

const designPageToasts = read(
  "components/editor/design-page/DesignPageToasts.tsx"
);
for (const required of [
  'data-testid="rule-announcement-alert"',
  'role="alert"',
  'aria-live="assertive"',
  'data-testid="rule-announcement-status"',
  'role="status"',
  'aria-live="polite"',
  'aria-atomic="true"',
  'aria-hidden="true"',
]) {
  assert.ok(
    designPageToasts.includes(required),
    `transient feedback must preserve ${required}`
  );
}
assert.match(
  designPageToasts,
  /failed\|failure\|invalid\|error\|blocked\|unavailable/,
  "validation and save failures should use the assertive live region"
);
assert.match(
  designPageToasts,
  /assertiveRuleMessage \?\? ""/,
  "the assertive live region should stay mounted and update its text"
);
assert.match(
  designPageToasts,
  /politeRuleMessage \?\? ""/,
  "the polite live region should stay mounted and update its text"
);

const planPanel = read("components/editor/DesignControlsPlanPanel.tsx");
for (const required of [
  'data-testid="starter-floor-plan-picker"',
  'aria-labelledby="starter-floor-plan-picker-title"',
  'data-testid="skip-to-starter-layouts"',
  "templatePickerHeadingRef.current?.focus({ preventScroll: true })",
  "firstTemplateActionRef.current?.focus()",
  "opener.focus({ preventScroll: true })",
]) {
  assert.ok(
    planPanel.includes(required),
    `new-plan picker focus workflow must preserve ${required}`
  );
}

console.log("Editor capabilities and accessibility checks passed.");
