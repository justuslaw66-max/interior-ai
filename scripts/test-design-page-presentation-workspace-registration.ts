import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const registrationSource = readSource(
  "lib/useDesignPagePresentationWorkspaceRegistration.ts"
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
    "useDesignPageSelectionWorkspaceRegistration({",
    "useDesignPagePresentationWorkspaceRegistration({",
    "useDesignPageSceneRegionWorkspaceRegistration({",
  ],
  "Workspace should preserve selection, presentation/QA, and drag hook order"
);
assert.match(registrationSource, /useDesignPagePresentationQaFacade\(\{/);
assert.doesNotMatch(workspaceSource, /useDesignPagePresentationQaFacade\(\{/);

for (const boundary of [
  "DesignPageAiWorkspaceRegistration",
  "DesignPageCommerceOnboardingRegistration",
  "DesignPageSelectionWorkspaceRegistration",
  "DesignPagePresentationBackupRegistrationFacade",
  "DeferredPaywallRegistration",
] as const) {
  assert.match(registrationSource, new RegExp(boundary));
}
for (const group of [
  "boundaries",
  "state",
  "derived",
  "configuration",
  "refs",
  "actions",
  "regions",
] as const) {
  assert.match(registrationSource, new RegExp(`\\b${group}:`));
}

assert.match(
  registrationSource,
  /cabinetSchedule: cabinetry\.state\.project\.schedulePackage,[\s\S]*?cabinetHandoff: cabinetry\.state\.project\.handoffPackage/,
  "QA cabinet payloads should remain sourced from the cabinetry owner."
);
assert.match(
  registrationSource,
  /duplicateItem:[\s\S]*?selection\.boundaries\.selection\.actions\.interaction[\s\S]*?duplicateSelectedItem,[\s\S]*?deleteItem:[\s\S]*?deleteSelectedItem/,
  "Presentation commands should delegate selected-item mutations to selection."
);
assert.match(
  registrationSource,
  /exportImages: presentationBackup\.actions\.exportImages,[\s\S]*?exportPdf: presentationBackup\.actions\.exportPdf/,
  "Presentation exports should remain owned by the backup/export registration."
);
assert.match(
  registrationSource,
  /openPortal: deferredPaywall\.actions\.openBillingPortal/,
  "Billing commands should remain owned by deferred paywall lifecycle."
);
assert.match(
  registrationSource,
  /currentStoredDesignFingerprint:[\s\S]*?documentRoom\.state\.document\.currentStoredDesignFingerprint/,
  "QA fingerprints should remain connected to the live document-history state."
);

assert.ok(registrationSource.split("\n").length <= 380);
assert.ok(workspaceSource.split("\n").length <= 1375);

console.log("design page presentation workspace registration guardrails passed");
