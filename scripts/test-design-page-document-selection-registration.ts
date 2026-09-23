import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const coreShellSource = readSource(
  "lib/useDesignPageCoreShellRegistration.ts"
);
const documentRegistrationSource = readSource(
  "lib/useDesignPageDocumentSelectionRegistrationFacade.ts"
);
const presentationBackupSource = readSource(
  "lib/useDesignPagePresentationBackupRegistrationFacade.ts"
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
  coreShellSource,
  [
    "useDesignPageSnapshotDocumentState()",
    "useDesignPageLiveCatalog()",
  ],
  "Core shell should establish snapshot and catalog state"
);
assertSourceOrder(
  documentRegistrationSource,
  [
    "useDesignPageDocumentRoomRegistration({",
    "useDesignPageSceneRoomReadRegistration({",
    "const zonesRef = useRef(",
    "useDesignPageBetaStartController({",
    "useEffect(() => {",
    "useState<string | null>(null)",
    "useDesignPageItemSelectionController({",
    "useDesignPageLateBoundRef(",
    "useDesignPageItemDocumentController({",
    "useDesignPageShoppingCatalogRuntime({",
    "useDesignPageHistoryShortcuts({",
  ],
  "Document registration should preserve its established hook order"
);
assertSourceOrder(
  presentationBackupSource,
  [
    "useDesignPagePresentationExportRuntime({",
    "useDesignPageLocalBackupHydration({",
  ],
  "Presentation/export should remain registered before backup hydration"
);
assertSourceOrder(
  workspaceSource,
  [
    "useDesignPageCoreShellRegistration({",
    "useDesignPageDocumentSelectionRegistrationFacade({",
    "useDesignPagePresentationBackupRegistrationFacade({",
    "useDesignPageWorkspaceDeferredPaywallRegistration({",
    "useDesignPagePlanAuthoringRegistration({",
  ],
  "Workspace should preserve core, document, hydration, paywall, and authoring order"
);

for (const source of [documentRegistrationSource, presentationBackupSource]) {
  assert.match(
    source,
    /DesignPageCoreShellRegistration/,
    "Downstream registration should consume the typed core-shell contract."
  );
  assert.doesNotMatch(
    source,
    /useDesignPage(?:SnapshotDocumentState|LiveCatalog|PlanViewportRuntime|EditorShellRuntime)\(/,
    "Downstream registration should not duplicate core-shell hook ownership."
  );
}

for (const movedOwner of [
  "useDesignPageDocumentRoomRegistration({",
  "useDesignPageSceneRoomReadRegistration({",
  "useDesignPageItemSelectionController({",
  "useDesignPageItemDocumentController({",
  "useDesignPageShoppingCatalogRuntime({",
  "useDesignPageHistoryShortcuts({",
  "useDesignPagePresentationExportRuntime({",
  "useDesignPageLocalBackupHydration({",
] as const) {
  assert.ok(
    !workspaceSource.includes(movedOwner),
    `Workspace should not retain ${movedOwner} ownership.`
  );
}

for (const [name, source] of [
  ["document-selection registration", documentRegistrationSource],
  ["presentation-backup registration", presentationBackupSource],
] as const) {
  assert.ok(
    source.split("\n").length <= 500,
    `${name} should remain below the registration-facade size limit.`
  );
  for (const groupName of [
    "boundaries",
    "state",
    "derived",
    "configuration",
    "refs",
    "actions",
  ] as const) {
    assert.match(
      source,
      new RegExp(`\\b${groupName}:`),
      `${name} should expose the ${groupName} group.`
    );
  }
}

console.log(
  "design page core, document, selection, export, and backup registration guardrails passed"
);
