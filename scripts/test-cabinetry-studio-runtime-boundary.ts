import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contractSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudio.contract.ts"),
  "utf8"
);
const studioSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const overlaySource = readFileSync(
  resolve(root, "components/editor/design-page/CabinetryStudioOverlay.tsx"),
  "utf8"
);
const dialogSource = readFileSync(
  resolve(root, "components/editor/design-page/CabinetryStudioDialog.tsx"),
  "utf8"
);
const lifecycleSource = readFileSync(
  resolve(root, "components/editor/design-system/useEditorDialogLifecycle.ts"),
  "utf8"
);

assert.match(
  contractSource,
  /export interface CabinetryStudioProps[\s\S]*?mode: "create" \| "edit"[\s\S]*?accessLevel: "consumer" \| "pro"[\s\S]*?onSave\?[\s\S]*?onPlaceInPlan\?[\s\S]*?onCancel\?/,
  "The extracted contract must preserve the existing public studio props."
);
assert.match(
  studioSource,
  /export type \{ CabinetryStudioProps \} from "\.\/CabinetryStudio\.contract"/,
  "The original module must preserve its named CabinetryStudioProps export."
);
assert.match(
  overlaySource,
  /import type \{ CabinetryStudioProps \} from "@\/features\/cabinetry\/components\/CabinetryStudio\.contract"/,
  "The overlay must consume the contract without loading the studio implementation."
);
assert.match(
  overlaySource,
  /dynamic<CabinetryStudioProps>[\s\S]*?import\("@\/features\/cabinetry\/components\/CabinetryStudio"\)[\s\S]*?module\.default/,
  "The studio implementation must remain behind a typed dynamic import."
);
assert.doesNotMatch(
  overlaySource,
  /import CabinetryStudio(?:,|\s+from)/,
  "The overlay must not restore an eager CabinetryStudio import."
);
assert.match(
  overlaySource,
  /loading:[\s\S]*?role="status"[\s\S]*?aria-live="polite"[\s\S]*?Loading built-ins/,
  "The lazy boundary must expose an accessible loading state."
);
for (const required of [
  'role="dialog"',
  'aria-modal="true"',
  'aria-label="Built-ins"',
  "ref={dialogRef}",
  "ref={panelRef}",
]) {
  assert.ok(
    dialogSource.includes(required),
    `The Studio overlay must preserve its focus/dialog contract (${required}).`
  );
}
// UX AX5: the shared dialog lifecycle owns focus entry, the Tab trap, Escape, the inert page,
// the scroll lock and focus return.
assert.match(
  dialogSource,
  /useEditorDialogLifecycle\(\{[\s\S]*?initialFocusRef: dialogRef,[\s\S]*?resolveReturnFocusTarget: mode === "create" \? findCreateReturnTarget : undefined,[\s\S]*?cancelFocusRestorationOnUnmount: false,[\s\S]*?manageBackground: true,[\s\S]*?lockBodyScroll: true,[\s\S]*?closeDisabled: false,[\s\S]*?onClose: onDismiss,/,
  "The Studio overlay must take focus itself, make the page behind inert and dismiss through the Studio's cancellation."
);
assert.match(
  dialogSource,
  /function findCreateReturnTarget\(\) \{[\s\S]*?'\[data-testid="editor-workflow-millwork"\]'[\s\S]*?\?\?[\s\S]*?'\[data-testid="editor-workflow-furnish"\]'/,
  "A new studio must return focus to Built-ins, else to the Furnish step."
);
assert.doesNotMatch(
  dialogSource,
  /onKeyDown|addEventListener\(|requestAnimationFrame|\.focus\(/,
  "The Studio overlay must not keep a key handler, trap or focus timing of its own."
);
assert.match(
  lifecycleSource,
  /if \(event\.key === "Escape" && !options\.closeDisabledRef\.current\) \{\s*event\.stopImmediatePropagation\(\);\s*\/\/[^\n]*\n\s*if \(event\.defaultPrevented\) return;\s*event\.preventDefault\(\);\s*options\.requestClose\(\);/,
  "Every modal Escape must be isolated while only an unhandled Escape dismisses the Studio."
);
assert.match(
  overlaySource,
  /<CabinetryStudioDialog mode=\{state\.mode\} onDismiss=\{handleCancel\}>/,
  "The modal Escape path must use the canonical Studio cancellation owner."
);

console.log("Cabinetry studio contract and lazy runtime boundary checks passed.");
