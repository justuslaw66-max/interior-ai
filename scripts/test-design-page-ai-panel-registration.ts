import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const facadeSource = readSource(
  "lib/useDesignPageAiPanelRegistrationFacade.ts"
);
const aiWorkspaceSource = readSource(
  "lib/useDesignPageAiWorkspaceRegistration.ts"
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

assert.match(
  workspaceSource,
  /useDesignPageAiWorkspaceRegistration\(\{/,
  "The workspace should register its AI and panel-action slot through the workspace registration."
);
assert.match(
  aiWorkspaceSource,
  /useDesignPageAiPanelRegistrationFacade\(\{/,
  "The AI workspace registration should retain direct facade ownership."
);
for (const formerWorkspaceOwner of [
  "useDesignPageAiLayout",
  "useDesignPagePanelActions",
  "useDesignPageAiNotes",
] as const) {
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`\\b${formerWorkspaceOwner}\\(`),
    `The workspace should not retain ${formerWorkspaceOwner} ownership.`
  );
}

assertSourceOrder(
  facadeSource,
  [
    "const layout = useDesignPageAiLayout({",
    "const panel = useDesignPagePanelActions({",
    "const getAiNotesItems = useCallback(",
    "const notes = useDesignPageAiNotes({",
  ],
  "AI/panel registration should preserve hook order"
);
assertSourceOrder(
  aiWorkspaceSource,
  [
    "buildRoomWallDescriptors({",
    "useDesignPageAiPanelRegistrationFacade({",
  ],
  "The AI facade should remain after room-wall derivation"
);
assertSourceOrder(
  workspaceSource,
  [
    "useDesignPageAiWorkspaceRegistration({",
    "useDesignPageCatalogPlacementRegistrationFacade({",
  ],
  "The AI workspace registration should remain before catalog placement"
);

assert.match(
  facadeSource,
  /getItems: \(\) => itemsRef\.current[\s\S]*?const getAiNotesItems = useCallback\(\(\) => itemsRef\.current, \[itemsRef\]\)/,
  "Layout and notes should continue reading the live item ref, with a stable notes getter."
);
assert.match(
  facadeSource,
  /runAiLayout: layout\.actions\.runAiLayout[\s\S]*?regenerateAiLayout: layout\.actions\.regenerateAiLayout[\s\S]*?commitItems: actions\.layout\.commitItems[\s\S]*?updateSelection: actions\.selection\.updateSelection/,
  "Panel actions should retain the layout, history, and selection adapters."
);
assert.match(
  facadeSource,
  /items: state\.panel\.items[\s\S]*?designId: configuration\.designId[\s\S]*?designerMode: state\.notes\.designerMode[\s\S]*?authenticated: configuration\.isAuthenticated/,
  "AI notes should retain document, mode, and authentication inputs."
);
assert.match(
  facadeSource,
  /resizeRugToSofa: layout\.actions\.resizeRugToSofaRule[\s\S]*?makeRoomCheaper: \(\) => layout\.actions\.bulkSwap\("cheaper"\)[\s\S]*?commitItems: \(nextItems, actionName\) =>[\s\S]*?actions\.layout\.commitItems\(nextItems, actionName\)[\s\S]*?showToast: actions\.layout\.showRuleToast/,
  "AI-note suggestions should retain rug, budget, history-label, and toast behavior."
);

const facadeLineCount = facadeSource.trimEnd().split(/\r?\n/).length;
assert.ok(
  facadeLineCount <= 220,
  `AI/panel registration facade should stay focused (found ${facadeLineCount} lines).`
);

console.log("Design-page AI/panel registration checks passed.");
