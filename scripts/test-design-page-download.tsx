import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DownloadDialog,
  type DownloadDialogProps,
} from "../components/editor/design-page/DownloadDialog";
import {
  IMAGES_UPGRADE_PROMPT,
  PDF_UPGRADE_PROMPT,
  promptUpgradeOnce,
} from "../lib/export-upgrade-prompt";
import { readEditorCommandBarSource } from "./editor-command-bar-test-utils";

// The command bar's Download (audit findings SX2 and PR6).

const noop = () => undefined;
const resolved = async () => undefined;
const base: DownloadDialogProps = {
  open: true, dark: false, signedIn: true, freeLimits: true, sceneReady: true, hasItems: true,
  exportingImages: false, exportingPdf: false,
  onClose: noop, onDownloadImages: resolved, onDownloadPdf: resolved, onSignIn: noop, onGetPro: noop,
};
const render = (props: Partial<DownloadDialogProps>) =>
  renderToStaticMarkup(createElement(DownloadDialog, { ...base, ...props }));
const button = (markup: string, testId: string) =>
  markup.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? "";

assert.doesNotMatch(render({ open: false }), /role="dialog"/);

const free = render({});
assert.match(free, /role="dialog"/);
assert.match(free, />Download</, "The dialog should be called Download.");
assert.match(button(free, "download-images"), /aria-disabled="false"/);
assert.doesNotMatch(button(free, "download-images"), /disabled=""/);
assert.doesNotMatch(button(free, "download-pdf"), /disabled=""/, "A signed-in user with products can download a PDF.");
assert.match(free, /data-testid="download-free-note"[\s\S]*?one view with an Interior AI watermark[\s\S]*?data-testid="download-get-pro"/,
  "Free users should read the limits and find Get Pro before they download.");
assert.doesNotMatch(free, /download-pdf-sign-in|download-pdf-needs-items/);

const guest = render({ signedIn: false });
assert.match(guest, /data-testid="download-pdf-sign-in"[^>]*>Sign in to download a PDF</, "PDFs need an account.");
assert.doesNotMatch(guest, /data-testid="download-pdf"/);
assert.match(button(guest, "download-images"), /aria-disabled="false"/, "Guests can still download pictures.");

const pro = render({ freeLimits: false, dark: true });
assert.doesNotMatch(pro, /download-free-note|download-get-pro/, "Pro downloads have no Free note.");
assert.match(pro, /designer-panel/, "The Pro theme styles the dialog like its other dialogs.");
assert.match(button(pro, "download-images"), /designer-primary-action/);

const empty = render({ hasItems: false });
assert.match(button(empty, "download-pdf"), /disabled=""/);
assert.match(empty, /data-testid="download-pdf-needs-items"/, "An empty room should say why the PDF is off.");

const loading = render({ sceneReady: false });
assert.match(button(loading, "download-images"), /disabled=""/);
assert.match(button(loading, "download-pdf"), /disabled=""/);

// While a file is on its way the buttons ignore clicks but keep focus, so closing the dialog
// afterwards can hand focus back to Download.
const busy = render({ exportingImages: true });
assert.match(busy, /Preparing pictures…/);
assert.match(button(busy, "download-images"), /aria-disabled="true"/);
assert.doesNotMatch(button(busy, "download-images"), /disabled=""/);
assert.match(button(busy, "download-pdf"), /aria-disabled="true"/);
assert.match(render({ exportingPdf: true }), /Preparing PDF…/);

// Free exports ask to upgrade once a session, and never after the Download dialog stated the limits.
const calls: string[] = [];
const upgrade = {
  setUpgradeReason: (reason: string) => calls.push(`reason:${reason}`),
  setShowUpgrade: (open: boolean) => calls.push(`open:${open}`),
};
const prompted = { current: false };
promptUpgradeOnce(prompted, true, IMAGES_UPGRADE_PROMPT, upgrade);
assert.deepEqual(calls, [], "A download from the Download dialog should not open the upgrade dialog.");
assert.equal(prompted.current, false);
promptUpgradeOnce(prompted, false, IMAGES_UPGRADE_PROMPT, upgrade);
assert.deepEqual(calls, ["reason:export_images", "open:true"]);
promptUpgradeOnce(prompted, false, PDF_UPGRADE_PROMPT, upgrade);
assert.equal(calls.length, 2, "The upgrade dialog should open at most once a session.");

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const commandBar = readEditorCommandBarSource();
assert.match(commandBar, /data-testid="editor-command-download"[\s\S]{0,400}?"designer-control hidden h-\[30px\][^"]*md:inline-flex/,
  "Download sits in the bar from tablet width up.");
assert.match(commandBar, /data-testid="editor-command-overflow-download"\s*className=\{`\$\{menuButtonClass\} md:hidden`\}/,
  "Phones reach Download through More.");
assert.match(
  read("lib/useDesignPageEditorChromeController.ts"),
  /const openDownload = \(\) => \{\s*actions\.navigation\.changeViewMode\("3d"\);\s*actions\.dialogs\.setDownloadOpen\(true\);[\s\S]*?onDownload: openDownload,/,
  "Download shows the 3D view it captures, then opens.",
);
const workspace = read("components/editor/design-page/DesignPageWorkspace.tsx");
assert.match(workspace, /onDownloadImages: \(\) => presentationBackupRegistration\.actions\.exportImages\(\{ limitsShown: true \}\)/);
assert.match(workspace, /onDownloadPdf: \(\) => presentationBackupRegistration\.actions\.exportPdf\(\{ limitsShown: true \}\)/);
assert.match(workspace, /onSignIn: signInWithReturn, onGetPro: \(\) => setShowPlans\(true\)/);
assert.match(read("lib/design-page-dialog-layer-model.ts"), /freeLimits: !access\.capabilities\.exportWithoutWatermark,/,
  "The Free note follows the export capability, not a plan check.");
assert.match(read("lib/design-page-dialog-layer-adapter.ts"), /download: dialogs\.download,/,
  "Download stays open while its export turns on Client Preview.");
assert.match(read("components/editor/design-page/DesignPageDialogLayer.tsx"), /<DownloadDialog \{\.\.\.dialogs\.download\} \/>/);
const exportSource = read("lib/useDesignPageExport.ts");
assert.doesNotMatch(exportSource, /setShowUpgrade\(true\)/, "Exports should only ask to upgrade through promptUpgradeOnce.");
assert.equal((exportSource.match(/promptUpgradeOnce\(upgradePromptedRef, limitsShown,/g) ?? []).length, 2);

console.log("Download dialog checks passed.");
