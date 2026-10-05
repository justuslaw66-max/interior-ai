import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveDesignPagePresentHotkey } from "../lib/design-page-presentation-hotkey";

const root = process.cwd();
const readSource = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");
const workspaceSource = readSource(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const runtimeSource = readSource(
  "lib/useDesignPagePresentationExportRuntime.ts"
);
const presentationBackupSource = readSource(
  "lib/useDesignPagePresentationBackupRegistrationFacade.ts"
);

const presentKey = (
  key: string,
  extra: Partial<Parameters<typeof resolveDesignPagePresentHotkey>[0]["event"]> = {}
) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  isComposing: false,
  target: null,
  ...extra,
});

assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: true, event: presentKey("p") }),
  "toggle-client-preview",
  "Lowercase P should toggle client preview for designers."
);
assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: true, event: presentKey("P") }),
  "toggle-client-preview",
  "Uppercase P should toggle client preview for designers."
);
assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: false, event: presentKey("p") }),
  null,
  "The presentation hotkey should remain disabled outside designer mode."
);
assert.equal(
  resolveDesignPagePresentHotkey({ isDesigner: true, event: presentKey("KeyP") }),
  null,
  "The resolver should continue using KeyboardEvent.key semantics."
);
// Typing wins (UX audit ED12): "p" in a field, with a modifier or mid-composition isn't P.
for (const extra of [
  { target: { tagName: "INPUT" } as unknown as EventTarget },
  { target: { tagName: "SELECT" } as unknown as EventTarget },
  { metaKey: true },
  { ctrlKey: true },
  { altKey: true },
  { isComposing: true },
]) {
  assert.equal(
    resolveDesignPagePresentHotkey({ isDesigner: true, event: presentKey("p", extra) }),
    null,
    `P must not toggle client preview here: ${JSON.stringify(Object.keys(extra))}`
  );
}
assert.equal(
  resolveDesignPagePresentHotkey({
    isDesigner: true,
    event: presentKey("p", {
      target: {
        tagName: "BUTTON",
        closest: () => ({ role: "dialog" }),
      } as unknown as EventTarget,
    }),
  }),
  "toggle-client-preview",
  "P still works with focus on a button in a dialog, such as the command palette's."
);

assert.match(
  workspaceSource,
  /useDesignPagePresentationBackupRegistrationFacade\(\{/,
  "The workspace should register presentation, export, and backup through their grouped boundary."
);
assert.match(
  presentationBackupSource,
  /useDesignPagePresentationExportRuntime\(\{/,
  "The presentation-backup boundary should retain the existing export runtime."
);
for (const formerWorkspaceOwner of [
  "handlePresentModeHotkey",
  "useDesignPageExport",
]) {
  assert.doesNotMatch(
    workspaceSource,
    new RegExp(`\\b${formerWorkspaceOwner}\\b`),
    `The workspace should not retain ${formerWorkspaceOwner} ownership.`
  );
}

const runtimeOrder = [
  "useEffect(() => {",
  'window.addEventListener("keydown", handlePresentModeHotkey)',
  'window.removeEventListener("keydown", handlePresentModeHotkey)',
  "useDesignPageExport({",
];
let previousIndex = -1;
for (const marker of runtimeOrder) {
  const index = runtimeSource.indexOf(marker);
  assert.ok(
    index > previousIndex,
    `Presentation/export runtime should preserve hook and cleanup order: ${marker}`
  );
  previousIndex = index;
}

assert.ok(
  workspaceSource.indexOf(
    "useDesignPageDocumentSelectionRegistrationFacade({"
  ) <
    workspaceSource.indexOf(
      "useDesignPagePresentationBackupRegistrationFacade({"
    ) &&
    presentationBackupSource.indexOf(
      "useDesignPagePresentationExportRuntime({"
    ) <
      presentationBackupSource.indexOf(
        "useDesignPageLocalBackupHydration({"
      ),
  "History should precede presentation/export, which should precede backup hydration."
);
assert.match(
  runtimeSource,
  /const exportController = useDesignPageExport\(\{[\s\S]*?return exportController;/,
  "The runtime should return the existing export controller contract unchanged."
);

// The Shop's hover camera focus was never reached once the Shopping list took over (UX phase 4a).
assert.doesNotMatch(runtimeSource, /CartHover|hoveredCartInstanceId/);

console.log("Design-page presentation/export runtime checks passed.");
