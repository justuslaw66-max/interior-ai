import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const baseSource = readSource(
  "lib/useDesignPageCoreShellBaseRegistration.ts"
);
const viewportShellSource = readSource(
  "lib/useDesignPageViewportShellRegistration.ts"
);
const coreShellSource = readSource("lib/useDesignPageCoreShellRegistration.ts");

const assertSourceOrder = (
  source: string,
  markers: readonly string[],
  ownership: string
) => {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(
      index > previousIndex,
      `${ownership} must preserve lifecycle order at ${marker}.`
    );
    previousIndex = index;
  }
};

assert.match(
  workspaceSource,
  /import \{ useDesignPageCoreShellRegistration \} from "@\/lib\/useDesignPageCoreShellRegistration";/
);
assert.match(
  workspaceSource,
  /const coreShellRegistration = useDesignPageCoreShellRegistration\(\{/
);

for (const movedOwner of [
  "useSession(",
  "useDesignPageImportedModels(",
  "useDesignPagePlanViewportRuntime(",
  "useDesignPageEditorShellRuntime(",
  "useEditorMode(",
  "useDesignPageTransientFeedback(",
  "useDesignPageWorkspacePaywallRegistration(",
  "useDesignPageEditorClientLifecycle(",
  "useDesignPageSnapshotDocumentState(",
  "useDesignPageLiveCatalog(",
] as const) {
  assert.ok(
    !workspaceSource.includes(movedOwner),
    `Workspace should no longer own ${movedOwner}.`
  );
}

assertSourceOrder(
  baseSource,
  [
    "useSession()",
    "useRouter()",
    "usePathname()",
    "useSearchParams()",
    "useState<string | null>(null)",
    "useDesignPageImportedModels()",
    'useState<DesignPagePlacementAddMode>("preview")',
    "useDesignPageHistoryRevision()",
  ],
  "Core shell base registration"
);
assert.match(
  baseSource,
  /useState<number>\(\(\) => Date\.now\(\)\)/,
  "The core shell base must keep the AI seed lazy."
);

assertSourceOrder(
  viewportShellSource,
  [
    "useDesignPagePlanViewportRuntime({",
    "useDesignPageEditorShellRuntime({",
  ],
  "Viewport shell registration"
);
assertSourceOrder(
  coreShellSource,
  [
    "useDesignPageCoreShellBaseRegistration()",
    "useDesignPageViewportShellRegistration({",
    "useEditorMode(",
    "useDesignPageTransientFeedback({",
    "const seatingZoneAutoDisabledRef",
    "useDesignPageWorkspacePaywallRegistration({",
    "useDesignPageEditorClientLifecycle({",
    "useDesignPageSnapshotDocumentState()",
    "useDesignPageLiveCatalog()",
  ],
  "Core shell registration"
);

assert.match(
  coreShellSource,
  /const canEdit = !isClientPreview && liveCatalogReady/,
  "Editor mutations must remain gated by catalog readiness."
);
assert.match(
  coreShellSource,
  /return \{[\s\S]*?boundaries:[\s\S]*?state:[\s\S]*?derived:[\s\S]*?actions:[\s\S]*?refs:/,
  "The core shell should expose grouped contracts."
);
assert.match(
  viewportShellSource,
  /return \{[\s\S]*?boundaries:[\s\S]*?state:[\s\S]*?derived:[\s\S]*?actions:[\s\S]*?configuration:[\s\S]*?refs:/,
  "The viewport shell should expose grouped contracts."
);

for (const file of [
  "lib/useDesignPageCoreShellBaseRegistration.ts",
  "lib/useDesignPageCoreShellRegistration.ts",
  "lib/useDesignPageViewportShellRegistration.ts",
] as const) {
  const lineCount = readSource(file).split("\n").length - 1;
  assert.ok(lineCount <= 500, `${file} should remain at or below 500 lines.`);
}

console.log("Design-page core shell registration checks passed.");
