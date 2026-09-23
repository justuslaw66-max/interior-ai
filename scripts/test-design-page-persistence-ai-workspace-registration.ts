import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const persistenceSource = readSource(
  "lib/useDesignPagePersistenceWorkspaceRegistration.ts"
);
const aiSource = readSource(
  "lib/useDesignPageAiWorkspaceRegistration.ts"
);

function assertSourceOrder(
  source: string,
  markers: readonly string[],
  message: string
) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `${message}: ${marker}`);
    previousIndex = index;
  }
}

assertSourceOrder(
  workspaceSource,
  [
    "useDesignPageCoreShellRegistration({",
    "useDesignPageDocumentSelectionRegistrationFacade({",
    "useDesignPagePlanAuthoringRegistration({",
    "useDesignPageEditorInteractionRegistration({",
    "useDesignPagePersistenceWorkspaceRegistration({",
    "useDesignPageRequestedDesignWorkspaceRegistration({",
    "useDesignPageAiWorkspaceRegistration({",
    "useDesignPagePlacementWorkspaceRegistration({",
  ],
  "Workspace should preserve document, editor, persistence, AI, and placement order"
);

assertSourceOrder(
  persistenceSource,
  [
    "const underlay = planAuthoring.boundaries.underlay",
    "useDesignPagePersistenceRegistration({",
    "localBackupPersistenceActions:",
  ],
  "Persistence registration should adapt authoring before binding backup actions"
);

assertSourceOrder(
  aiSource,
  [
    "buildRoomWallDescriptors({",
    "useDesignPageAiPanelRegistrationFacade({",
    "openGuestPrompt: persistence.actions.persistence.openGuestPrompt",
  ],
  "AI registration should derive walls and retain the post-persistence guest action"
);

for (const [source, typeName, requiredBoundaries] of [
  [
    persistenceSource,
    "UseDesignPagePersistenceWorkspaceRegistrationInput",
    [
      "DesignPageCoreShellRegistration",
      "DesignPageDocumentSelectionRegistrationFacade",
      "DesignPagePlanAuthoringRegistration",
    ],
  ],
  [
    aiSource,
    "UseDesignPageAiWorkspaceRegistrationInput",
    [
      "DesignPageCoreShellRegistration",
      "DesignPageDocumentSelectionRegistrationFacade",
      "DesignPagePlanAuthoringRegistration",
      "DesignPageEditorInteractionRegistration",
      "DesignPagePersistenceWorkspaceRegistration",
    ],
  ],
] as const) {
  assert.match(source, new RegExp(`export type ${typeName}`));
  for (const boundary of requiredBoundaries) {
    assert.match(source, new RegExp(boundary));
  }
  assert.ok(
    source.split("\n").length <= 350,
    `${typeName} should remain within the controller size guideline.`
  );
}

for (const marker of [
  "useDesignPagePersistenceRegistration({",
  "useDesignPageAiPanelRegistrationFacade({",
  "buildRoomWallDescriptors({",
] as const) {
  assert.ok(
    !workspaceSource.includes(marker),
    `Workspace should not retain direct ownership of ${marker}.`
  );
}

for (const source of [persistenceSource, aiSource]) {
  for (const group of [
    "boundaries",
    "state",
    "derived",
    "configuration",
    "refs",
    "actions",
  ] as const) {
    assert.match(
      source,
      new RegExp(`\\b${group}:`),
      `Registration should expose the ${group} group.`
    );
  }
}

assert.ok(
  workspaceSource.split("\n").length <= 1800,
  "Persistence and AI extraction should keep the workspace at or below 1,800 lines."
);

console.log("design page persistence and AI workspace registration guardrails passed");
