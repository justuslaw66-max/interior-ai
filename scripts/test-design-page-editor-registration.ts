import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const documentSelectionSource = readSource(
  "lib/useDesignPageDocumentSelectionRegistrationFacade.ts"
);
const planAuthoringSource = readSource(
  "lib/useDesignPagePlanAuthoringRegistration.ts"
);
const interactionSource = readSource(
  "lib/useDesignPageEditorInteractionRegistration.ts"
);

const assertSourceOrder = (
  source: string,
  markers: readonly string[],
  message: string
) => {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `${message}: ${marker}`);
    previousIndex = index;
  }
};

assertSourceOrder(
  workspaceSource,
  [
    "useDesignPageCoreShellRegistration({",
    "useDesignPageDocumentSelectionRegistrationFacade({",
    "useDesignPagePresentationBackupRegistrationFacade({",
    "useDesignPageWorkspaceDeferredPaywallRegistration({",
    "useDesignPagePlanAuthoringRegistration({",
    "useDesignPageEditorInteractionRegistration({",
    "useDesignPagePersistenceWorkspaceRegistration({",
    "useDesignPageRequestedDesignWorkspaceRegistration({",
    "useDesignPageAiWorkspaceRegistration({",
  ],
  "Workspace should preserve core, document, presentation, paywall, authoring, interaction, persistence, and AI registration order"
);

const inputContract = (source: string, typeName: string) => {
  const start = source.indexOf(`export type ${typeName} = {`);
  assert.ok(start >= 0, `Missing ${typeName}.`);
  const end = source.indexOf("\n};", start);
  assert.ok(end > start, `Could not read ${typeName}.`);
  return source.slice(start, end + 3);
};

const documentSelectionInput = inputContract(
  documentSelectionSource,
  "UseDesignPageDocumentSelectionRegistrationFacadeInput"
);
assert.match(documentSelectionInput, /coreShell: DesignPageCoreShellRegistration/);
assert.doesNotMatch(documentSelectionInput, /\n\s+(state|actions|refs|configuration):/);

const planAuthoringInput = inputContract(
  planAuthoringSource,
  "UseDesignPagePlanAuthoringRegistrationInput"
);
assert.match(planAuthoringInput, /coreShell: DesignPageCoreShellRegistration/);
assert.match(
  planAuthoringInput,
  /documentSelection: DesignPageDocumentSelectionRegistrationFacade/
);
assert.doesNotMatch(planAuthoringInput, /\n\s+(state|actions|refs|configuration):/);

const interactionInput = inputContract(
  interactionSource,
  "UseDesignPageEditorInteractionRegistrationInput"
);
assert.match(interactionInput, /coreShell: DesignPageCoreShellRegistration/);
assert.match(
  interactionInput,
  /documentSelection: DesignPageDocumentSelectionRegistrationFacade/
);
assert.match(interactionInput, /planAuthoring: DesignPagePlanAuthoringRegistration/);
assert.doesNotMatch(interactionInput, /\n\s+(state|actions|refs|configuration):/);

assertSourceOrder(
  planAuthoringSource,
  [
    "if (!planSettingsLoaded) return;",
    "useDesignPageSelectionInspectionRuntime({",
    "useDesignPagePlanWorkspaceRegistrationFacade({",
    "useDesignPageSurfaceWorkspaceFacade({",
    "useDesignPagePlanUnderlayFacade(",
  ],
  "Plan authoring should preserve default-opening through underlay hook order"
);

assertSourceOrder(
  interactionSource,
  [
    "useDesignPageCameraWorkspaceFacade({",
    "useDesignPagePlanTracingFacade(",
    "useDesignPagePresentationStateRegistration({",
    "useDesignPageZoneController({",
    "if (!sceneRoom.state.scene.sceneReady) return;",
  ],
  "Editor interaction should preserve camera through scene-sync hook order"
);

for (const [owner, markers] of [
  [
    planAuthoringSource,
    [
      "useDesignPageSelectionInspectionRuntime({",
      "useDesignPagePlanWorkspaceRegistrationFacade({",
      "useDesignPageSurfaceWorkspaceFacade({",
      "useDesignPagePlanUnderlayFacade(",
    ],
  ],
  [
    interactionSource,
    [
      "useDesignPageCameraWorkspaceFacade({",
      "useDesignPagePlanTracingFacade(",
      "useDesignPagePresentationStateRegistration({",
      "useDesignPageZoneController({",
    ],
  ],
] as const) {
  for (const marker of markers) {
    assert.ok(owner.includes(marker), `Registration owner should contain ${marker}.`);
    assert.ok(
      !workspaceSource.includes(marker),
      `Workspace should not retain the nested registration ${marker}.`
    );
  }
}

for (const [name, source] of [
  ["plan-authoring registration", planAuthoringSource],
  ["editor-interaction registration", interactionSource],
] as const) {
  assert.ok(
    source.split("\n").length <= 350,
    `${name} should remain within the focused-controller limit.`
  );
}

assert.ok(
  workspaceSource.split("\n").length <= 2300,
  "This extraction must keep the design-page workspace at or below 2,300 lines."
);

console.log("design page editor registration guardrails passed");
