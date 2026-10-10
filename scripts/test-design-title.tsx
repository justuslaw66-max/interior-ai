import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EditorCommandBar from "../components/editor/EditorCommandBar";
import { CommandBarMoreMenu } from "../components/editor/command-bar/CommandBarMoreMenu";
import { DesignRenameDialog } from "../components/editor/design-page/DesignRenameDialog";
import { normalizeLoadedCloudDesign } from "../lib/design-page-persistence-projection";
import { DESIGN_RENAME_OPENER_ID, DESIGN_RENAME_RETURN_FOCUS_IDS } from "../lib/design-rename-focus";
import {
  DEFAULT_DESIGN_TITLE,
  resolveDesignTitle,
  withCloudDesignTitle,
  withoutDesignTitle,
} from "../lib/design-title";
import { snapshotToStored } from "../lib/room-persistence";
import { migrateToV3, type DesignSnapshot } from "../lib/room-types";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "../lib/useClientPreviewCommandBarFocus";
import { applyDesignRename } from "../lib/useDesignPageDesignRename";

// The design's name (audit finding F): shown in the bar, renamed in one undoable step, and sent
// with every cloud write so My designs always lists the name the editor shows.

const base = migrateToV3({
  items: [],
  zones: [],
  roomBounds: { width: 4, depth: 5, wallThickness: 0.2, height: 2.7 },
} as unknown as DesignSnapshot);

assert.equal(resolveDesignTitle(undefined), DEFAULT_DESIGN_TITLE);
assert.equal(resolveDesignTitle("   "), DEFAULT_DESIGN_TITLE);
assert.equal(resolveDesignTitle("  Tan flat  "), "Tan flat");
assert.equal(resolveDesignTitle("x".repeat(130)).length, 120, "The API keeps 120 characters.");
assert.equal(withCloudDesignTitle(base, "").title, undefined, "An empty row title changes nothing.");
const titled = { ...base, title: "Tan flat" };
assert.equal(withCloudDesignTitle(titled, "Tan flat"), titled, "The same name keeps the same snapshot.");
assert.equal(withoutDesignTitle(titled).title, undefined);
assert.equal(withoutDesignTitle(base), base);

// Loading: the row's title wins, so a copy opens as "… (copy)", and the loaded baseline is stable.
const load = (title: string | undefined, snapshot: DesignSnapshot) =>
  normalizeLoadedCloudDesign({
    id: "design-title",
    title,
    roomWidth: 4,
    roomDepth: 5,
    items: [],
    snapshot: snapshotToStored(snapshot),
    updatedAt: "2026-09-24T12:00:00.000Z",
  });
const copy = load("Tan flat (copy)", titled);
assert.equal(copy.snapshot.title, "Tan flat (copy)");
assert.equal(copy.stored.title, "Tan flat (copy)", "The next save writes the row's name into the snapshot.");
assert.equal(load("Tan flat (copy)", copy.snapshot).fingerprint, copy.fingerprint);
assert.equal(load("Untitled Living Room", base).snapshot.title, "Untitled Living Room", "Older designs get their row's name.");
assert.equal(load(undefined, titled).snapshot.title, "Tan flat");

// Renaming is one "Rename design" step; empty or unchanged names change nothing.
const renames: Array<{ step: string; title: string | undefined }> = [];
const toasts: string[] = [];
const rename = (value: string, snapshot: DesignSnapshot = titled) =>
  applyDesignRename(value, {
    snapshot,
    runTransaction: (step, action) => {
      const before = renames.length;
      action();
      renames[before] = { ...renames[before], step };
    },
    setDesignSnapshot: (next) => {
      renames.push({ step: "", title: next.title });
    },
    showToast: (message) => toasts.push(message),
  });
assert.equal(rename("  Tan flat, level 2 "), true);
assert.deepEqual(renames, [{ step: "Rename design", title: "Tan flat, level 2" }]);
assert.deepEqual(toasts, ["Renamed to Tan flat, level 2"]);
assert.equal(rename("Tan flat"), false);
assert.equal(rename("   "), false);
assert.equal(rename(DEFAULT_DESIGN_TITLE, base), false, "An unnamed design already shows the default name.");
assert.equal(renames.length, 1);

// The bar shows the name from xl, as a button that opens Rename design.
type BarProps = ComponentProps<typeof EditorCommandBar>;
const noop = () => undefined;
const barProps = {
  isClientPreview: false, editorMode: "design", viewMode: "2d", isDesigner: false, isAuthed: true,
  accountReady: true, accountName: "Justus", canUpgrade: false, planLabel: "Free", canManageBilling: false,
  isOpeningBillingPortal: false, canUndo: false, canRedo: false, undoName: null, redoName: null,
  designSidebarCollapsed: false, onToggleDesignSidebar: noop, onPlan: noop, onFurnish: noop, onShop: noop,
  onUndo: noop, onRedo: noop, onViewModeChange: noop, onToggleDesignerMode: noop,
  onToggleClientPreview: noop, onViewPlans: noop, onNewPlan: noop, onManageBilling: noop, onFeedback: noop,
  showLoadDesign: true, onOpenMyDesigns: noop, onSave: noop, onRetrySaveStatus: noop,
  saveStatus: {
    kind: "saved", source: "cloud", label: "Saved", detail: "Just now", tone: "saved",
    canRetry: false, lastSuccessfulSaveAt: null, cloudBacked: false,
  },
} as unknown as BarProps;
const bar = (props: Partial<BarProps>) => renderToStaticMarkup(createElement(EditorCommandBar, { ...barProps, ...props }));
const named = bar({ designTitle: "Tan flat", onRenameDesign: noop });
assert.match(
  named,
  new RegExp(`id="${DESIGN_RENAME_OPENER_ID}"[^>]*data-testid="editor-design-title"[^>]*aria-haspopup="dialog"[^>]*aria-label="Rename design, Tan flat"`),
);
assert.match(named, /data-testid="editor-design-title"[^>]*class="-ml-1\.5 flex h-6 [^"]*max-w-full[^"]*text-\[15px\][^"]*md:max-w-\[240px\] md:text-sm/);
// A static render is the phone header (UX 4d): the Menu, then the name with the status under it.
assert.ok(
  named.indexOf('data-testid="editor-command-overflow"') < named.indexOf('data-testid="editor-design-title"') &&
    named.indexOf('data-testid="editor-design-title"') < named.indexOf('data-testid="save-status"'),
  "The name leads the bar after the Menu, as in the mockups.",
);
assert.doesNotMatch(named, /data-testid="command-undo"/, "Undo is over the canvas at every width.");
assert.doesNotMatch(bar({ designTitle: "Tan flat" }), /editor-design-title/, "No handler, no name button.");
// The status is a line under the name (UX 4c, 4d): its label, with the detail as the tooltip.
assert.match(named, /<span class="min-w-0 truncate">Saved<\/span>/);
assert.match(named, /data-testid="save-status"[^>]*title="Just now"/);
// Save shows until the design's first save to the account; then the status says it all (Decision E).
assert.match(named, /data-testid="save-design"/);
const cloudBacked = bar({ designTitle: "Tan flat", onRenameDesign: noop, saveStatus: { ...barProps.saveStatus, cloudBacked: true } });
assert.doesNotMatch(cloudBacked, /data-testid="save-design"/);
assert.match(cloudBacked, /data-testid="save-status"/);
// Two equal sides with the steps between them; the name side gives way first.
assert.match(named, /class="flex min-w-0 flex-1 basis-0 items-center gap-1 md:gap-3"/);
assert.match(named, /class="flex shrink-0 items-center justify-end gap-1 md:min-w-max md:flex-1 md:basis-0 md:gap-2"/);

// Phones also have Rename design in the Menu, and the dialog then hands focus back to the Menu.
type MoreProps = ComponentProps<typeof CommandBarMoreMenu>;
const more = renderToStaticMarkup(createElement(CommandBarMoreMenu, {
  dark: false, phone: true, containerRef: createRef<HTMLDivElement>(), buttonRef: createRef<HTMLButtonElement>(),
  open: true, onToggle: noop, onClose: noop, menuButtonClass: "item", menuPanelClass: "panel",
  lightingSettingsOpen: false, showLoadDesign: true, isDesigner: false, isClientPreview: false,
  lightingAvailable: false, onOpenMyDesigns: noop, onNewPlan: noop,
  onToggleDesignerMode: noop, onToggleClientPreview: noop,
  onOpenLightingSettings: noop, onCloseLightingSettings: noop, onFeedback: noop, onRenameDesign: noop,
} satisfies MoreProps));
assert.match(more, /data-testid="editor-command-overflow-rename-design"[^>]*class="item md:hidden"[^>]*>Rename design</);
assert.doesNotMatch(more, /editor-workflow-export|editor-command-overflow-present-export|Present &amp; export|Export &amp; Camera/, "Present & export retired: Share and Download are in the bar.");
assert.deepEqual(DESIGN_RENAME_RETURN_FOCUS_IDS, [DESIGN_RENAME_OPENER_ID, CLIENT_PREVIEW_FALLBACK_ACTION_ID]);

// The dialog: the current name to edit, the API's length limit, and no empty names.
const dialog = (value: string) => renderToStaticMarkup(createElement(DesignRenameDialog, {
  open: true, dark: false, value, onValueChange: noop, onCancel: noop, onSave: noop,
}));
assert.match(dialog("Tan flat"), /data-testid="design-rename-dialog"/);
assert.match(dialog("Tan flat"), /data-testid="design-rename-input"[^>]*maxlength="120"[^>]*value="Tan flat"/i);
assert.match(dialog("  "), /data-testid="design-rename-save"[^>]*disabled=""/);
assert.doesNotMatch(dialog("Tan flat"), /data-testid="design-rename-save"[^>]*disabled=""/);

// Every write sends the name the editor shows; no hard-coded name is left.
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const explicitSave = read("lib/useDesignPageExplicitCloudSaveController.ts");
assert.equal(explicitSave.match(/\.\.\.legacyData,\s*title: resolveDesignTitle\(legacyData\.title\),/g)?.length, 2,
  "Manual saves and the save before a new design send the design's name.");
assert.match(explicitSave, /snapshot: stored, title: resolveDesignTitle\(stored\.title\),/);
const persistence = read("lib/useDesignPagePersistence.ts");
assert.match(persistence, /snapshot, title: resolveDesignTitle\(snapshot\.title\),\s*expectedUpdatedAt: binding\.revision,/,
  "Autosave sends the name, so a rename reaches My designs.");
assert.equal(persistence.match(/title: resolveDesignTitle\(designSnapshot\.title\),/g)?.length, 2,
  "Guest designs and their claim use the design's name.");
assert.match(persistence, /setNotes\(""\);[\s\S]*?setDesignSnapshot\(withoutDesignTitle\);/,
  "A new draft doesn't keep the saved design's name.");
assert.match(read("lib/useDesignPageCloudConflictCopyController.ts"), /\.\.\.legacyData,\s*title: resolveDesignTitle\(legacyData\.title\),/);
assert.match(read("lib/design-page-persistence-projection.ts"),
  /const titled = withCloudDesignTitle\(snapshot, data\.title\);\s*return \{ \.\.\.projectCanonicalDesignPersistence\(titled\), revision \};/);
for (const path of [
  "lib/useDesignPageExplicitCloudSaveController.ts", "lib/useDesignPagePersistence.ts",
  "lib/useDesignPageCloudConflictCopyController.ts", "lib/guestDesigns.ts",
]) {
  assert.doesNotMatch(read(path), /"My Living Room"|"Recovered design copy"/, `${path} must use the design's name.`);
}

// Wiring: the facade names the design and owns the dialog; the chrome controller maps Rename.
const facade = read("lib/useDesignPagePresentationQaFacade.ts");
assert.match(facade, /saveStatus: state\.persistence\.saveStatus, designTitle: designRename\.title,/);
assert.match(facade, /\.\.\.actions\.dialogs, openDesignRename: designRename\.openRename,/);
assert.match(facade, /designRename: designRename\.dialog \}/);
assert.match(read("lib/useDesignPageEditorChromeController.ts"), /onRenameDesign: actions\.dialogs\.openDesignRename,/);
assert.match(read("components/editor/design-page/DesignPageDialogLayer.tsx"), /<DesignRenameDialog \{\.\.\.dialogs\.designRename\} \/>/);

console.log("Design title checks passed.");
