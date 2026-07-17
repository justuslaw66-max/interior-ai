import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const presentationRegistrationSource = readSource(
  "lib/useDesignPagePresentationStateRegistration.ts"
);
const persistenceRegistrationSource = readSource(
  "lib/useDesignPagePersistenceRegistration.ts"
);
const editorInteractionRegistrationSource = readSource(
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
    "useDesignPageEditorInteractionRegistration({",
    "useDesignPagePersistenceWorkspaceRegistration({",
    "useDesignPageAiWorkspaceRegistration({",
  ],
  "Workspace should preserve interaction, persistence, and AI registration order"
);
assertSourceOrder(
  editorInteractionRegistrationSource,
  [
    "useDesignPagePresentationStateRegistration({",
    "useDesignPageZoneController({",
    "updateCameraViewFromScene();",
  ],
  "Editor interaction should preserve presentation, zone, and scene sync order"
);
assertSourceOrder(
  presentationRegistrationSource,
  [
    "useDesignPageNamedCameraViewsController({",
    "useDesignPageLayoutVersionsController({",
  ],
  "Presentation state should keep named camera views before layout versions"
);
assertSourceOrder(
  persistenceRegistrationSource,
  [
    "useDesignPagePersistenceNewPlanFacade({",
    "useDesignPageLateBoundRef(localBackupPersistenceActions",
  ],
  "Persistence/new-plan registration should precede the local-backup bridge"
);

for (const movedOwner of [
  "useDesignPageNamedCameraViewsController({",
  "useDesignPageLayoutVersionsController({",
  "useDesignPagePersistenceNewPlanFacade({",
  "useDesignPageLateBoundRef(localBackupPersistenceActionsRef",
] as const) {
  assert.ok(
    !workspaceSource.includes(movedOwner),
    `Workspace should no longer own ${movedOwner}.`
  );
}

assert.match(
  persistenceRegistrationSource,
  /documentRoom\.state\.document\.currentStoredDesignFingerprint[\s\S]*?documentRoom\.derived\.room\.items[\s\S]*?documentRoom\.derived\.room\.zones[\s\S]*?snapshotDocument\.state\.localBackupHydrated/,
  "Persistence should source document data and the hydration gate from existing boundaries."
);
assert.match(
  persistenceRegistrationSource,
  /storageKey: DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY,[\s\S]*?cloudSaveDelayMs: 900,[\s\S]*?guestSaveDelayMs: 800/,
  "Persistence storage and debounce contracts should remain explicit and stable."
);
assert.match(
  persistenceRegistrationSource,
  /loadDesign: persistenceNewPlan\.actions\.persistence\.loadDesign,[\s\S]*?clearPersistedSnapshotFingerprint:/,
  "The local-backup bridge should expose persistence-owned load and fingerprint reset actions."
);

for (const [name, source] of [
  ["presentation-state registration", presentationRegistrationSource],
  ["persistence registration", persistenceRegistrationSource],
] as const) {
  assert.ok(
    source.split("\n").length <= 450,
    `${name} should remain below the registration-facade size limit.`
  );
}

console.log(
  "design page persistence and presentation registration guardrails passed"
);
