import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { CabinetSemanticSelection } from "../features/cabinetry/components/CabinetSceneItem";
import {
  canCabinetModuleDragOver,
  resolveCabinetModuleDropSource,
} from "../features/cabinetry/hooks/useCabinetModuleReorderDrag";
import { convertCabinetMeasurementDraftUnit } from "../features/cabinetry/hooks/useCabinetStudioMeasurementDrafts";
import { reconcileCabinetStudioSelection } from "../features/cabinetry/hooks/useCabinetStudioSelectionController";
import { createCabinetPreset } from "../features/cabinetry/presets";

const definition = createCabinetPreset("cabinet_run", "controller-tests");
const firstModuleId = definition.modules[0].id;
const secondModuleId = definition.modules[1].id;

const validModuleSelection: CabinetSemanticSelection = {
  scope: "module",
  cabinetDefinitionId: definition.id,
  moduleId: firstModuleId,
  additive: false,
};
assert.equal(
  reconcileCabinetStudioSelection(
    validModuleSelection,
    definition,
    secondModuleId,
    new Set()
  ),
  validModuleSelection,
  "valid semantic selections must preserve their object identity"
);

const validPartSelection: CabinetSemanticSelection = {
  scope: "part",
  cabinetDefinitionId: definition.id,
  moduleId: firstModuleId,
  partId: "part-1",
  additive: true,
};
assert.equal(
  reconcileCabinetStudioSelection(
    validPartSelection,
    definition,
    secondModuleId,
    new Set(["part-1"])
  ),
  validPartSelection
);

assert.deepEqual(
  reconcileCabinetStudioSelection(
    validPartSelection,
    definition,
    secondModuleId,
    new Set()
  ),
  {
    scope: "module",
    cabinetDefinitionId: definition.id,
    moduleId: secondModuleId,
    additive: false,
  },
  "a removed part must fall back to the active module"
);
assert.deepEqual(
  reconcileCabinetStudioSelection(
    { ...validModuleSelection, cabinetDefinitionId: "replaced-definition" },
    definition,
    "removed-module",
    new Set()
  ),
  {
    scope: "module",
    cabinetDefinitionId: definition.id,
    moduleId: firstModuleId,
    additive: false,
  },
  "a missing active module must fall back to the definition's first module"
);
assert.deepEqual(
  reconcileCabinetStudioSelection(
    validModuleSelection,
    { ...definition, modules: [] },
    firstModuleId,
    new Set()
  ),
  {
    scope: "assembly",
    cabinetDefinitionId: definition.id,
    moduleId: undefined,
    additive: false,
  },
  "an empty definition must fall back to assembly selection"
);

assert.equal(canCabinetModuleDragOver(null, firstModuleId), false);
assert.equal(canCabinetModuleDragOver(firstModuleId, firstModuleId), false);
assert.equal(canCabinetModuleDragOver(firstModuleId, secondModuleId), true);
assert.equal(
  resolveCabinetModuleDropSource(firstModuleId, "transferred-module"),
  firstModuleId,
  "mounted drag state takes precedence over transfer data"
);
assert.equal(
  resolveCabinetModuleDropSource(null, "transferred-module"),
  "transferred-module",
  "transfer data supports a drop after local transient state is unavailable"
);

assert.equal(convertCabinetMeasurementDraftUnit("100", "cm", "mm"), "1000");
assert.equal(convertCabinetMeasurementDraftUnit("2", "in", "cm"), "5.08");
assert.equal(convertCabinetMeasurementDraftUnit("25.4", "mm", "in"), "1");
assert.equal(
  convertCabinetMeasurementDraftUnit("not-a-number", "cm", "mm"),
  "not-a-number",
  "invalid in-progress drafts must remain untouched"
);

const studioSource = readFileSync(
  "features/cabinetry/components/CabinetryStudio.tsx",
  "utf8"
);
const modeViewSource = [
  "features/cabinetry/components/CabinetryStudioGuidedView.tsx",
  "features/cabinetry/components/CabinetryStudioDetailedView.tsx",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
for (const controllerBoundary of [
  "useCabinetModuleReorderDrag",
  "useCabinetStudioCustomSpaces",
  "useCabinetStudioMeasurementDrafts",
  "useCabinetStudioPreferences",
  "useCabinetStudioPropertyFocus",
  "useCabinetStudioSelectionController",
  "useCabinetStudioValidationExposure",
]) {
  assert.ok(
    studioSource.includes(controllerBoundary),
    `CabinetryStudio must compose ${controllerBoundary}`
  );
}
for (const extractedImplementation of [
  "setPendingPropertyControlFocus",
  "setDraggedModuleId",
  "measurementUnitRef",
  "validationExposureStateRef",
  "readCabinetInspectorPreferences",
  "readStoredCabinetCustomSpaces",
  "setDimensionPreview",
  "setSemanticEditPreview",
]) {
  assert.ok(
    !studioSource.includes(extractedImplementation),
    `${extractedImplementation} must remain outside the Studio composition root`
  );
}

const dragSource = readFileSync(
  "features/cabinetry/hooks/useCabinetModuleReorderDrag.ts",
  "utf8"
);
const dragOverImplementation = dragSource.match(
  /const onModuleDragOver = useCallback\([\s\S]*?\n  \);/
)?.[0];
assert.ok(dragOverImplementation);
assert.ok(dragOverImplementation.includes("event.preventDefault()"));
assert.ok(
  !dragOverImplementation.includes("setDraggedModuleId"),
  "high-frequency drag-over events must not update React state"
);

const previewInteractionSource = readFileSync(
  "features/cabinetry/components/CabinetStudioPreviewInteractionController.tsx",
  "utf8"
);
const previewOwnerSource = [
  "features/cabinetry/components/CabinetStudioDetailedPreviews.tsx",
  "features/cabinetry/components/CabinetGuidedPreviewPanel.tsx",
]
  .map((path) => readFileSync(path, "utf8"))
  .join("\n");
assert.ok(previewInteractionSource.includes("setDimensionPreview"));
assert.ok(previewInteractionSource.includes("setSemanticEditPreview"));
assert.ok(previewInteractionSource.includes("applyCabinetSemanticPreviewToParts"));
assert.equal(
  previewOwnerSource.match(/<CabinetStudioPreviewInteractionController/g)?.length,
  2,
  "Guided and Detailed desktop previews must isolate transient interactions"
);
assert.ok(modeViewSource.includes("CabinetDetailedPreviewPanel"));
assert.ok(modeViewSource.includes("CabinetGuidedPreviewPanel"));

const focusSource = readFileSync(
  "features/cabinetry/hooks/useCabinetStudioPropertyFocus.ts",
  "utf8"
);
assert.ok(focusSource.includes("window.requestAnimationFrame(focusWhenMounted)"));
assert.ok(focusSource.includes("window.cancelAnimationFrame(animationFrame)"));
assert.match(
  focusSource,
  /return \(\) => \{[\s\S]*?cancelled = true;[\s\S]*?cancelAnimationFrame/
);
assert.ok(focusSource.includes('"millwork_advanced_controls_opened"'));

const preferenceSource = readFileSync(
  "features/cabinetry/hooks/useCabinetStudioPreferences.ts",
  "utf8"
);
assert.ok(preferenceSource.includes("readCabinetExperiencePreference"));
assert.ok(preferenceSource.includes("writeCabinetExperiencePreference"));
assert.ok(preferenceSource.includes("readCabinetInspectorPreferences"));
assert.ok(preferenceSource.includes("writeCabinetInspectorPreferences"));

const customSpacesSource = readFileSync(
  "features/cabinetry/hooks/useCabinetStudioCustomSpaces.ts",
  "utf8"
);
assert.ok(customSpacesSource.includes("readStoredCabinetCustomSpaces"));
assert.ok(customSpacesSource.includes("writeStoredCabinetCustomSpaces"));

for (const interactionPath of [
  "features/cabinetry/components/CabinetOverallDimensionHandles.tsx",
  "features/cabinetry/components/CabinetModuleDividerHandles.tsx",
  "features/cabinetry/components/CabinetShelfMarkerHandles.tsx",
]) {
  const source = readFileSync(interactionPath, "utf8");
  assert.ok(source.includes("onPointerDown"), interactionPath);
  assert.ok(source.includes("onPointerMove"), interactionPath);
  assert.ok(source.includes("onPointerUp"), interactionPath);
  assert.ok(source.includes("onPointerCancel"), interactionPath);
  assert.ok(source.includes("onKeyDown"), interactionPath);
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*return \(\) => \{[\s\S]*?CallbackRef\.current\(null\)/,
    `${interactionPath} must clear a transient preview when an active interaction unmounts`
  );
}

console.log(
  "Cabinetry Studio controller tests passed (selection repair, drag ownership, measurement sync, preference lifecycles, focus cleanup, and pointer/keyboard cleanup)."
);
