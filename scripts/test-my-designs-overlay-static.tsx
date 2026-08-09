import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MyDesignsDialog,
  type MyDesignsDialogProps,
} from "../components/editor/design-page/MyDesignsDialog";
import {
  MY_DESIGNS_CLOSE_ACTION_ID,
  MY_DESIGNS_COMMAND_ACTION_ID,
  MY_DESIGNS_FALLBACK_ACTION_ID,
  getMyDesignsDeleteReturnFocusIds,
  getMyDesignsDeleteActionId,
  getMyDesignsOpenActionId,
} from "../lib/my-designs-dialog-focus";

const noOp = () => undefined;
const designs = [
  { id: "design-a", title: "Living Room", createdAt: "2026-08-09T00:00:00.000Z" },
  { id: "design-b", title: "Bedroom", createdAt: "2026-08-09T01:00:00.000Z" },
];
const baseProps: MyDesignsDialogProps = {
  open: false,
  designerTheme: false,
  designs,
  loading: false,
  allDesignIds: designs.map(({ id }) => id),
  selectedDesignIds: new Set<string>(),
  selectedDesignCount: 0,
  allDesignsSelected: false,
  deletingDesignIds: new Set<string>(),
  pendingDeleteDesign: null,
  onClose: noOp,
  onOpenTemplates: noOp,
  onToggleAll: noOp,
  onToggleSelection: noOp,
  onLoadDesign: noOp,
  onRequestDelete: noOp,
  onCancelDelete: noOp,
  onConfirmDelete: noOp,
};

function render(props: Partial<MyDesignsDialogProps>) {
  return renderToStaticMarkup(
    createElement(MyDesignsDialog, { ...baseProps, ...props })
  );
}

const closed = render({});
assert.doesNotMatch(closed, /role="dialog"|load-designs-modal|My Designs/);

const empty = render({ open: true, designs: [], allDesignIds: [] });
assert.equal((empty.match(/role="dialog"/g) ?? []).length, 1);
assert.match(empty, /aria-modal="true"/);
assert.match(empty, /My Designs/);
assert.match(empty, /aria-label="Close My Designs"/);
assert.match(empty, new RegExp(`id="${MY_DESIGNS_CLOSE_ACTION_ID}"`));
assert.match(empty, /No saved designs yet/);

const loading = render({ open: true, designs: [], allDesignIds: [], loading: true });
assert.match(loading, /Loading your designs/);
assert.doesNotMatch(loading, /No saved designs yet/);

const populated = render({ open: true });
for (const design of designs) {
  assert.match(populated, new RegExp(`id="${getMyDesignsOpenActionId(design.id)}"`));
  assert.match(populated, new RegExp(`id="${getMyDesignsDeleteActionId(design.id)}"`));
}
assert.equal((populated.match(/data-testid="delete-selected-saved-designs"/g) ?? []).length, 1);
assert.equal((populated.match(/data-testid="delete-all-saved-designs"/g) ?? []).length, 1);

const pendingSingle = {
  ids: ["design-a"],
  mode: "single" as const,
  title: "Living Room",
};
const nested = render({ open: true, pendingDeleteDesign: pendingSingle });
assert.equal((nested.match(/role="dialog"/g) ?? []).length, 2);
assert.match(nested, /Delete saved design/);

assert.deepEqual(
  getMyDesignsDeleteReturnFocusIds(pendingSingle, designs.map(({ id }) => id)),
  [
    getMyDesignsDeleteActionId("design-a"),
    getMyDesignsOpenActionId("design-a"),
    getMyDesignsOpenActionId("design-b"),
    MY_DESIGNS_CLOSE_ACTION_ID,
  ]
);
assert.deepEqual(
  getMyDesignsDeleteReturnFocusIds(
    { ids: ["design-a", "design-b"], mode: "selected" },
    designs.map(({ id }) => id)
  ).slice(1),
  [
    getMyDesignsOpenActionId("design-a"),
    getMyDesignsOpenActionId("design-b"),
    MY_DESIGNS_CLOSE_ACTION_ID,
  ]
);
assert.notEqual(MY_DESIGNS_COMMAND_ACTION_ID, MY_DESIGNS_FALLBACK_ACTION_ID);

const commandBarSource = readFileSync(
  `${process.cwd()}/components/editor/EditorCommandBar.tsx`,
  "utf8"
);
assert.match(commandBarSource, /id=\{MY_DESIGNS_COMMAND_ACTION_ID\}/);
assert.match(commandBarSource, /role="menuitem"[\s\S]*?editor-command-overflow-load/);

const layerSource = readFileSync(
  `${process.cwd()}/components/editor/design-page/DesignPageDialogLayer.tsx`,
  "utf8"
);
assert.match(layerSource, /lazy\(async \(\) =>/);
assert.match(layerSource, /dialogs\.myDesigns\.open \|\| myDesignsMounted/);
assert.match(
  layerSource,
  /const closeMyDesigns = \(\) => \{[\s\S]*?setMyDesignsMounted\(true\);[\s\S]*?dialogs\.myDesigns\.onClose\(\);[\s\S]*?onClose=\{closeMyDesigns\}/
);
assert.match(
  layerSource,
  /const openMyDesignTemplates = \(\) => \{[\s\S]*?setMyDesignsMounted\(false\);[\s\S]*?dialogs\.myDesigns\.onOpenTemplates\(\);[\s\S]*?const loadMyDesign = \(designId: string\) => \{[\s\S]*?setMyDesignsMounted\(false\);[\s\S]*?dialogs\.myDesigns\.onLoadDesign\(designId\);[\s\S]*?onOpenTemplates=\{openMyDesignTemplates\}[\s\S]*?onLoadDesign=\{loadMyDesign\}/
);
assert.doesNotMatch(layerSource, /useEffect/);
assert.doesNotMatch(layerSource, /^import \{ MyDesignsDialog/m);

const persistenceSource = readFileSync(
  `${process.cwd()}/lib/useDesignPagePersistence.ts`,
  "utf8"
);
assert.match(
  persistenceSource,
  /if \(!target \|\| deletingDesignIds\.size > 0\) return;[\s\S]*?for \(const targetId of targetIds\)[\s\S]*?await designApi\.delete\(targetId\)/
);
assert.match(
  persistenceSource,
  /if \(designId && deletedIds\.has\(designId\)\)[\s\S]*?detachCloudBaseline\(\)[\s\S]*?setDesignId\(null\)/
);
assert.match(
  persistenceSource,
  /if \(deletedIds\.size > 0 && failedIds\.length === 0\)[\s\S]*?else \{\s*showRuleToast\("Delete failed"\);\s*\}/,
  "An all-failed deletion should retain the existing parent failure feedback."
);

console.log("My Designs static modal and semantic-focus checks passed.");
