import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildDesignPageDialogLayerModel } from "../lib/design-page-dialog-layer-model";
import { resolveEditorCapabilities } from "../lib/editor-capabilities";

const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const source = fs.readFileSync(designPagePath, "utf8");
const controllerPath = path.join(process.cwd(), "lib", "useDesignPagePersistence.ts");
const controllerSource = fs.readFileSync(controllerPath, "utf8");
const designApiSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-api-client.ts"),
  "utf8"
);
const dialogPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "MyDesignsDialog.tsx"
);
const dialogSource = fs.readFileSync(dialogPath, "utf8");
const dialogLayerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignPageDialogLayer.tsx"
  ),
  "utf8"
);

assert.match(
  controllerSource,
  /const \[selectedSavedDesignIds, setSelectedSavedDesignIds\] = useState<Set<string>>\([\s\S]*?new Set\(\)[\s\S]*?\);/,
  "The load-design modal should track selected saved designs for bulk actions."
);

assert.match(
  controllerSource,
  /const \[deletingDesignIds, setDeletingDesignIds\] = useState<Set<string>>\(new Set\(\)\);/,
  "The load-design modal should track all saved designs currently being deleted."
);

assert.match(
  controllerSource,
  /const \[pendingDeleteDesign, setPendingDeleteDesign\][\s\S]*?useState<PendingSavedDesignDelete \| null>/,
  "The load-design modal should keep pending batch delete metadata for confirmation copy."
);

assert.match(
  controllerSource,
  /const toggleSavedDesignSelection = useCallback\(\(id: string\) => \{[\s\S]*?setSelectedSavedDesignIds/,
  "Saved designs should support individual checkbox selection."
);

assert.match(
  controllerSource,
  /const toggleAllSavedDesignSelection = useCallback\(\(\) => \{[\s\S]*?setSelectedSavedDesignIds\([\s\S]*?allSavedDesignsSelected \? new Set\(\) : new Set\(allSavedDesignIds\)/,
  "Saved designs should support selecting every row."
);

assert.match(
  controllerSource,
  /const handleDeleteSavedDesign = useCallback\(async \(\) => \{[\s\S]*?for \(const targetId of targetIds\) \{[\s\S]*?await designApi\.delete\(targetId\)/,
  "Deleting from My Designs should use the shared design API client for each selected design."
);
assert.match(
  designApiSource,
  /delete\(id: string,[\s\S]*?fetchJson\(`\/api\/designs\/\$\{encodeURIComponent\(id\)\}`,[\s\S]*?method: "DELETE"/,
  "The shared design API client should retain the encoded design DELETE endpoint."
);

assert.match(
  controllerSource,
  /setMyDesigns\(\(previous\) =>[\s\S]*?previous\.filter\(\(design\) => !deletedIds\.has\(design\.id\)\)/,
  "Deleting from My Designs should remove deleted rows without requiring a full page refresh."
);

assert.match(
  controllerSource,
  /if \(designId && deletedIds\.has\(designId\)\) \{[\s\S]*?setDesignId\(null\);[\s\S]*?setShareToken\(null\);[\s\S]*?setShareEnabled\(false\);[\s\S]*?\}/,
  "Deleting the currently loaded design should detach the editor from the removed cloud design."
);

assert.match(
  dialogSource,
  /data-testid="load-designs-bulk-toolbar"[\s\S]*?data-testid="select-all-saved-designs"[\s\S]*?data-testid="delete-selected-saved-designs"[\s\S]*?data-testid="delete-all-saved-designs"/,
  "The My Designs modal should expose select-all, delete-selected, and delete-all controls."
);

assert.match(
  dialogSource,
  /data-testid=\{`select-saved-design-\$\{design\.id\}`\}/,
  "Each saved design row should expose a checkbox for multi-select."
);

assert.match(
  dialogSource,
  /data-testid=\{`delete-saved-design-\$\{design\.id\}`\}/,
  "Each saved design row should expose a delete button for e2e coverage."
);

assert.match(
  dialogSource,
  /<ConfirmDialog[\s\S]*?open=\{Boolean\(pendingDeleteDesign\)\}[\s\S]*?pendingDeleteDesign\?\.mode === "all"[\s\S]*?pendingDeleteDesign\?\.mode === "selected"[\s\S]*?destructive[\s\S]*?onConfirm=\{onConfirmDelete\}/,
  "Saved design deletion should require a destructive confirmation dialog for single and bulk delete modes."
);

assert.match(
  dialogLayerSource,
  /<MyDesignsDialog[\s\S]*?\{\.\.\.dialogs\.myDesigns\}[\s\S]*?onClose=\{closeMyDesigns\}[\s\S]*?onOpenTemplates=\{openMyDesignTemplates\}[\s\S]*?onLoadDesign=\{loadMyDesign\}[\s\S]*?\/>/,
  "The fixed dialog layer should own My Designs leaf composition, ordinary close return, and restoration-canceling exits."
);
assert.match(
  source,
  /<DesignPageDialogLayer\s+\{\.\.\.dialogLayerModel\}\s*\/>/,
  "The workspace should compose the fixed dialog layer."
);
assert.doesNotMatch(
  source,
  /<MyDesignsDialog\b/,
  "The workspace should not retain My Designs leaf markup."
);

const onToggleAll = () => undefined;
const onToggleSelection = () => undefined;
const onLoadDesign = () => undefined;
const onRequestDelete = () => undefined;
const onConfirmDelete = () => undefined;
const noop = () => undefined;
const dialogModel = buildDesignPageDialogLayerModel({
  access: {
    isClientPreview: false,
    isAuthenticated: true,
    capabilities: resolveEditorCapabilities("pro"),
    designerTheme: true,
  },
  billing: {
    upgrade: {},
    plans: {},
    startingCheckout: false,
    annualSavingsLabel: "",
    upgradeActions: {},
    plansActions: {},
  },
  persistence: {
    guestSave: {
      reason: null,
      busy: false,
      lifecycleScopeKey: "load-design-test",
      onCancel: noop,
      onContinueWithoutSaving: noop,
      onSaveAndContinue: noop,
    },
    myDesigns: {
      data: {
        open: true,
        designs: [],
        loading: false,
        allDesignIds: ["design-1"],
        selectedDesignIds: new Set(["design-1"]),
        selectedDesignCount: 1,
        allDesignsSelected: true,
        deletingDesignIds: new Set<string>(),
        pendingDeleteDesign: null,
      },
      actions: {
        onClose: noop,
        onOpenTemplates: noop,
        onToggleAll,
        onToggleSelection,
        onLoadDesign,
        onRequestDelete,
        onCancelDelete: noop,
        onConfirmDelete,
      },
    },
    templateChoice: { data: {}, actions: {} },
  },
  ai: { notes: {} },
  presentation: { presentExport: {} },
  editing: { roomRename: {}, annotation: {} },
  placement: { identity: {}, assessment: {}, activeRoomName: null, actions: {} },
  feedback: { beta: {}, toasts: {}, validation: {} },
  sharing: {},
  cabinetry: { state: {}, access: {}, configuration: {}, refs: {}, actions: {} },
  cart: {},
} as unknown as Parameters<typeof buildDesignPageDialogLayerModel>[0]);
assert.strictEqual(dialogModel.dialogs.myDesigns.onToggleAll, onToggleAll);
assert.strictEqual(dialogModel.dialogs.myDesigns.onToggleSelection, onToggleSelection);
assert.strictEqual(dialogModel.dialogs.myDesigns.onLoadDesign, onLoadDesign);
assert.strictEqual(dialogModel.dialogs.myDesigns.onRequestDelete, onRequestDelete);
assert.strictEqual(dialogModel.dialogs.myDesigns.onConfirmDelete, onConfirmDelete);
assert.equal(dialogModel.dialogs.myDesigns.designerTheme, true);

console.log("Load design delete modal guardrails passed.");
