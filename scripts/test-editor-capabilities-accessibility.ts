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

console.log("Editor capabilities and accessibility checks passed.");
