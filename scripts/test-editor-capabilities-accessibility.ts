import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { resolveEditorCapabilities } from "../lib/editor-capabilities";
import { getExportCapabilities } from "../lib/export-capabilities";
import { isOnboardingEligible } from "../lib/onboarding";

const root = process.cwd();
const read = (relativePath: string) =>
  readFileSync(join(root, relativePath), "utf8");

const consumer = resolveEditorCapabilities("free");
const professional = resolveEditorCapabilities("pro");

assert.equal(consumer.placeCatalogItems, true);
assert.equal(professional.placeCatalogItems, true);
assert.equal(consumer.createBasicAnnotations, true);
assert.equal(professional.createBasicAnnotations, true);

for (const capability of [
  "useAdvancedTransforms",
  "configurePlanLayers",
  "viewTechnicalDimensions",
  "createTechnicalAnnotations",
  "customizeMaterials",
  "importCad",
  "tuneAdvancedRendering",
  "applyAiSuggestions",
  "useDesignerWorkspace",
  "exportMultipleViews",
  "exportPdf",
] as const) {
  assert.equal(consumer[capability], false, `${capability} should be guarded in the consumer experience`);
  assert.equal(professional[capability], true, `${capability} should be available in the professional experience`);
}

assert.equal(Object.isFrozen(consumer), true);
assert.equal(Object.isFrozen(professional), true);
assert.deepEqual(getExportCapabilities("free"), {
  watermark: true,
  customBranding: false,
  pdfDownload: false,
  extendedAiNotes: false,
  clientNameField: false,
  designerLogoUpload: false,
  multiRoomCover: false,
  editableDesignerNotes: false,
});
assert.equal(getExportCapabilities("pro").pdfDownload, true);
assert.equal(
  isOnboardingEligible({ skipGuidedOnboarding: true }),
  false,
  "guided onboarding should use behavior policy instead of a tier check"
);

for (const relativePath of [
  "components/editor/EditorCommandBar.tsx",
  "components/editor/design-page/DesignPageWorkspace.tsx",
  "lib/design-page-dialog-layer-model.ts",
  "lib/useDesignPageExport.ts",
  "lib/useDesignPageOnboarding.ts",
  "lib/useDesignPagePresentationQaFacade.ts",
]) {
  const source = read(relativePath);
  assert.doesNotMatch(source, /\bisPro\b|plan\s*[!=]==?\s*["']pro["']/,
    `${relativePath} should consume behavior capabilities rather than plan-tier conditionals`);
}

const dialogPrimitive = read(
  "components/editor/design-system/EditorDialog.tsx"
);
for (const required of [
  'role="dialog"',
  'aria-modal="true"',
  "aria-labelledby={titleId}",
  "aria-describedby={description ? descriptionId : undefined}",
  "focus-visible:ring-2",
  "motion-reduce:transition-none",
  "min-h-11",
]) {
  assert.ok(
    dialogPrimitive.includes(required),
    `shared dialog primitive must preserve ${required}`
  );
}

const dialogLifecycle = read(
  "components/editor/design-system/useEditorDialogLifecycle.ts"
);
const dialogFocus = read(
  "components/editor/design-system/editorDialogFocus.ts"
);
const dialogFocusRestoration = read(
  "components/editor/design-system/editorDialogFocusRestoration.ts"
);
const dialogRegistry = read(
  "components/editor/design-system/editorDialogRegistry.ts"
);
const dialogLifecycleSources = `${dialogLifecycle}\n${dialogFocus}\n${dialogFocusRestoration}\n${dialogRegistry}`;
for (const required of [
  'event.key === "Escape"',
  'event.key === "Tab"',
  "isTopmostEditorDialog(token)",
  "hasExternalEditorModal()",
  'element.closest(\'[hidden], [inert], [aria-hidden="true"]\')',
  "...(options.returnFocusId ? [options.returnFocusId] : [])",
  ".map((id) => document.getElementById(id))",
  "target.focus({ preventScroll: true })",
  "window.requestAnimationFrame",
  "window.cancelAnimationFrame",
  'type DialogEntryState = "mounting" | "entering" | "interactive"',
  "isFullyWithinViewport(target)",
  "hasActivePanelAnimation(panel)",
  'event.type === "transitionrun"',
  '"transitioncancel"',
  "new ResizeObserver(readiness.reschedule)",
  'dialog.dataset.editorDialogState !== "interactive"',
  "useLayoutEffect",
  "refreshBackgroundInertness()",
  'dialog.dataset.editorDialogFocusTrap = "active"',
  "options.generationRef.current === options.generation",
  "dialog.focus({ preventScroll: true })",
  "panel.getBoundingClientRect();",
]) {
  assert.ok(
    dialogLifecycleSources.includes(required),
    `shared dialog lifecycle must preserve ${required}`
  );
}
assert.doesNotMatch(
  dialogLifecycle,
  /scheduleTrackedFrame\(frames,\s*\(\)\s*=>\s*scheduleTrackedFrame/,
  "transition-aware focus entry must not use a double-rAF paint workaround"
);
assert.match(
  dialogFocus,
  /initialFocusRef\?\.current[\s\S]*?data-editor-dialog-initial-focus[\s\S]*?closeButtonRef\.current/,
  "explicit shared-dialog initial focus must take precedence over the close button"
);
assert.match(
  dialogRegistry,
  /sibling\.inert = true;[\s\S]*?sibling\.setAttribute\("aria-hidden", "true"\)/,
  "the topmost shared dialog must make every background branch inaccessible"
);
assert.match(
  dialogLifecycle,
  /options\.manageBackground \|\| options\.waitForEntryTransition\)\s*document\.addEventListener\("focusin"/,
  "background-managed dialogs must contain attempted focus outside the topmost owner"
);
assert.match(
  dialogLifecycle,
  /setEditorDialogOwnershipGuard[\s\S]*?if \(!hasOwner\)[\s\S]*?resolveInitialFocusTarget/,
  "a dialog must reclaim focus when a newer registry owner closes"
);
assert.match(
  dialogLifecycleSources,
  /isElementInTopmostEditorDialog\(candidate\)/,
  "nested focus return must remain inside the current topmost registry owner"
);
assert.match(
  dialogFocus,
  /const activeIndex[\s\S]*?event\.preventDefault\(\);[\s\S]*?focusable\[nextIndex\]\.focus\(\);/,
  "shared dialog Tab handling must not depend on browser keyboard-navigation preferences"
);
assert.match(
  dialogLifecycle,
  /if \(!cancelFocusRestorationOnUnmount\) return;[\s\S]*?cancelPendingRestoration\(restoreFrameRef\);/,
  "only callers that opt into route/unmount cancellation may suppress pending focus return"
);

for (const relativePath of [
  "components/ConfirmDialog.tsx",
  "components/CopyFallbackDialog.tsx",
  "components/ItemCartDrawer.tsx",
  "components/editor/design-page/AiNotesDialog.tsx",
  "components/editor/design-page/PlanAnnotationDialog.tsx",
  "components/editor/design-page/PlansDialog.tsx",
  "components/editor/design-page/RoomRenameDialog.tsx",
  "components/editor/design-page/UpgradeDialog.tsx",
  "components/editor/design-page/PresentExportDialog.tsx",
  "components/editor/design-page/ShareLinkFallbackDialog.tsx",
]) {
  const source = read(relativePath);
  assert.match(
    source,
    /EditorDialog/,
    `${relativePath} should use the shared accessible dialog primitive`
  );
  if (relativePath !== "components/ItemCartDrawer.tsx") {
    assert.doesNotMatch(
      source,
      /waitForEntryTransition/,
      `${relativePath} must retain next-frame initial focus unless it explicitly adopts entry readiness`
    );
  }
}

const presentExport = read(
  "components/editor/design-page/PresentExportDialog.tsx"
);
assert.match(
  presentExport,
  /dynamic\([\s\S]*PresentExportProfessionalPlanControls[\s\S]*ssr:\s*false/,
  "professional plan controls should remain behind a client-only lazy boundary"
);
assert.match(
  presentExport,
  /closeDisabled=\{Boolean\(configuration\.shareFallbackOpen\)\}[\s\S]*?closeButtonId=\{PRESENT_EXPORT_CLOSE_ACTION_ID\}[\s\S]*?manageBackground/,
  "Present/Export must suppress parent dismissal while the nested share fallback is topmost"
);
assert.match(
  presentExport,
  /id=\{PRESENT_EXPORT_CREATE_SHARE_ACTION_ID\}\s+data-testid="create-share"/,
  "Create Share must expose its stable semantic focus identity"
);

const shareFallback = read(
  "components/editor/design-page/ShareLinkFallbackDialog.tsx"
);
for (const required of [
  "<EditorDialog",
  "open={Boolean(url)}",
  'title="Share Link"',
  'closeButtonTestId="share-fallback-close"',
  "returnFocusIds={SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS}",
  "cancelFocusRestorationOnUnmount",
  "manageBackground",
  "SHARE_LINK_FALLBACK_COPY_ACTION_ID",
  "SHARE_LINK_FALLBACK_OPEN_ACTION_ID",
  'aria-label="Share URL"',
  "min-w-0",
  "max-h-[calc(100dvh-2rem)]",
]) {
  assert.ok(
    shareFallback.includes(required),
    `Share Link Fallback must preserve ${required}`
  );
}
assert.doesNotMatch(
  shareFallback,
  /addEventListener|querySelector|setTimeout|requestAnimationFrame/,
  "Share Link Fallback must not create a second focus, keyboard, or restoration lifecycle"
);

const shareFallbackFocus = read("lib/share-link-fallback-dialog-focus.ts");
for (const semanticId of [
  "present-export-create-share-action",
  "present-export-close-action",
  "share-link-fallback-close-action",
  "share-link-fallback-copy-action",
  "share-link-fallback-open-action",
]) {
  assert.ok(
    shareFallbackFocus.includes(semanticId),
    `Share Link Fallback focus identity must preserve ${semanticId}`
  );
}
assert.match(
  shareFallbackFocus,
  /SHARE_LINK_FALLBACK_RETURN_FOCUS_IDS[\s\S]*PRESENT_EXPORT_CREATE_SHARE_ACTION_ID,[\s\S]*PRESENT_EXPORT_CLOSE_ACTION_ID/,
  "fallback return must prefer the current Create Share action before the parent close fallback"
);

const dialogLayer = read(
  "components/editor/design-page/DesignPageDialogLayer.tsx"
);
assert.match(
  dialogLayer,
  /getShareFallbackLayerState[\s\S]*dialogs\.presentExport\.state\.designId[\s\S]*overlays\.shareFallback\.lifecycleMode[\s\S]*parentOpen/,
  "design, mode, and parent scope changes must create a new fallback lifecycle generation"
);
const dialogLayerModel = read("lib/design-page-dialog-layer-model.ts");
assert.match(
  dialogLayerModel,
  /lifecycleMode:\s*access\.isDesigner\s*\?\s*"designer"\s*:\s*"consumer"/,
  "Share Link Fallback lifecycle scope must use the actual effective workspace mode"
);
assert.match(
  dialogLayer,
  /shareFallback\.open[\s\S]*<ShareLinkFallbackDialog[\s\S]*key=\{shareFallback\.scopeKey\}/,
  "the fixed dialog layer must coordinate one nested parent/child ownership state"
);

const persistence = read("lib/useDesignPagePersistence.ts");
assert.match(
  persistence,
  /setShareLinkFallback\(\{ designId, url: shareUrl \}\)/,
  "clipboard-failure fallback state must remain bound to the design that created the share URL"
);
assert.match(
  persistence,
  /current\?\.designId === designId \? current : null/,
  "a project identity change must retire stale fallback state"
);

const pdfRoute = read("app/api/export/pdf/route.ts");
assert.match(pdfRoute, /select:\s*\{\s*plan:\s*true\s*\}/);
assert.match(pdfRoute, /normalizeTierFromPlan\(dbUser\?\.plan\)/);

const furnishPanel = read(
  "components/editor/DesignControlsFurnishPanel.tsx"
);
for (const required of [
  'data-testid="placed-item-selector"',
  'role="list"',
  'role="listitem"',
  "aria-label={selectionLabel}",
  "aria-pressed={selected}",
  "focus-visible:ring-2",
  "Tab to an item, then press Enter or Space to select.",
]) {
  assert.ok(
    furnishPanel.includes(required),
    `placed-item keyboard selector must preserve ${required}`
  );
}

const panelRegistration = read("lib/design-page-panel-registration.ts");
assert.match(
  panelRegistration,
  /onSelectPlacedItem:\s*\(instanceId\)\s*=>\s*placementSelection\.actions\.selection\.selectItem\(instanceId,\s*false\)/,
  "placed-item keyboard selection should use the canonical single-selection controller"
);

const planItemRenderer = read(
  "components/editor/renderers/ItemRenderer2D.tsx"
);
for (const required of [
  'data-testid="plan-item-keyboard-target"',
  "aria-label={`Select ${label} in 2D plan`}",
  "aria-pressed={selected}",
  "focus-visible:outline",
  "onSelect(event.shiftKey)",
]) {
  assert.ok(
    planItemRenderer.includes(required),
    `2D plan item keyboard target must preserve ${required}`
  );
}

const furnitureItem = read("components/scene/FurnitureItem.tsx");
assert.match(
  furnitureItem,
  /onSelect=\{\(additive\)\s*=>\s*onSelect\?\.\(instanceId,\s*additive\)\}/,
  "2D plan item buttons should use the canonical furniture selection callback"
);

const designPageToasts = read(
  "components/editor/design-page/DesignPageToasts.tsx"
);
for (const required of [
  'data-testid="rule-announcement-alert"',
  'role="alert"',
  'aria-live="assertive"',
  'data-testid="rule-announcement-status"',
  'role="status"',
  'aria-live="polite"',
  'aria-atomic="true"',
  'aria-hidden="true"',
]) {
  assert.ok(
    designPageToasts.includes(required),
    `transient feedback must preserve ${required}`
  );
}
assert.match(
  designPageToasts,
  /failed\|failure\|invalid\|error\|blocked\|unavailable/,
  "validation and save failures should use the assertive live region"
);
assert.match(
  designPageToasts,
  /assertiveRuleMessage \?\? ""/,
  "the assertive live region should stay mounted and update its text"
);
assert.match(
  designPageToasts,
  /politeRuleMessage \?\? ""/,
  "the polite live region should stay mounted and update its text"
);

const planPanel = read("components/editor/DesignControlsPlanPanel.tsx");
for (const required of [
  'data-testid="starter-floor-plan-picker"',
  'aria-labelledby="starter-floor-plan-picker-title"',
  'data-testid="skip-to-starter-layouts"',
  "templatePickerHeadingRef.current?.focus({ preventScroll: true })",
  "firstTemplateActionRef.current?.focus()",
  "opener.focus({ preventScroll: true })",
]) {
  assert.ok(
    planPanel.includes(required),
    `new-plan picker focus workflow must preserve ${required}`
  );
}

console.log("Editor capabilities and accessibility checks passed.");
