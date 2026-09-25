import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ParametricCabinetDesignItem } from "../features/cabinetry/designItemAdapters";
import { createCabinetPreset } from "../features/cabinetry/presets";
import {
  buildCabinetryAvailableSpaces,
  buildSelectedCabinetAssetManifest,
  buildSelectedCabinetDocumentation,
} from "../features/cabinetry/useDesignPageCabinetry";
import { createRoom } from "../lib/room-types";
import { readEditorCommandBarSource } from "./editor-command-bar-test-utils";

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const presentationWorkspaceSource = readFileSync(
  join(root, "lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  "utf8"
);
const commandBarWrapperSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageEditorCommandBar.tsx"),
  "utf8"
);
const commandBarSource = readEditorCommandBarSource(root);
const panelWorkspaceRegistrationSource = readFileSync(
  join(root, "lib/design-page-panel-workspace-registration.ts"),
  "utf8"
);
const panelRegistrationSource = readFileSync(
  join(root, "lib/design-page-panel-registration.ts"),
  "utf8"
);
const furnishStepModesSource = readFileSync(
  join(root, "components/editor/FurnishStepModes.tsx"),
  "utf8"
);
const cabinetryFeatureFlagSource = readFileSync(
  join(root, "features/cabinetry/designPageFeatureFlags.ts"),
  "utf8"
);
const cabinetryControllerSource = readFileSync(
  join(root, "features/cabinetry/useDesignPageCabinetry.ts"),
  "utf8"
);

const room = createRoom("room-controller", "Controller room", "living", {
  width: 4,
  depth: 5,
  wallThickness: 0.2,
  height: 2.7,
  slabThickness: 0.1,
});

const spaces = buildCabinetryAvailableSpaces({
  activeRoom: room,
  activePlanRoom: { w: 4, d: 5 },
  planRoomCount: 1,
  planOpenings: [
    {
      id: "roomless-window",
      wall: "north",
      kind: "window",
      offsetMm: 0,
      widthMm: 900,
      heightMm: 1_000,
      bottomMm: 900,
    },
  ],
});

assert.equal(spaces.length, 4, "the controller should expose all rectangular wall hosts");
assert.equal(spaces[0]?.availableWidthMm, 3_600);
assert.equal(
  spaces.find((space) => space.wallId === "north")?.openings.length,
  1,
  "a legacy roomless opening should remain available in a single-room plan"
);

const multiRoomSpaces = buildCabinetryAvailableSpaces({
  activeRoom: room,
  activePlanRoom: { w: 4, d: 5 },
  planRoomCount: 2,
  planOpenings: [
    {
      id: "roomless-window",
      wall: "north",
      kind: "window",
      offsetMm: 0,
      widthMm: 900,
    },
  ],
});
assert(
  multiRoomSpaces.every((space) => space.openings.length === 0),
  "roomless openings must not leak across multi-room cabinet hosts"
);

const definition = createCabinetPreset("base", "controller-cabinet");
const cabinet = {
  id: "cabinet-controller",
  instanceId: "cabinet-controller",
  productId: "parametric-cabinet",
  variantId: definition.id,
  assetType: "parametric_cabinet",
  cabinetDefinition: definition,
  roomId: room.id,
  name: definition.name,
  position: [0.4, 0, -0.6],
  rotationY: Math.PI / 2,
  qty: 1,
  includeInCheckout: false,
} as ParametricCabinetDesignItem;

const documentation = buildSelectedCabinetDocumentation(cabinet);
assert(documentation.bom.length > 0, "selected cabinet documentation should generate its BOM");
assert(
  documentation.dimensionSchedule.length > 0,
  "selected cabinet documentation should retain planning dimensions"
);

const manifest = buildSelectedCabinetAssetManifest(cabinet, "fallback-room");
assert.equal(manifest.roomId, room.id, "placed room metadata should win over the fallback room");
assert.deepEqual(manifest.transform.position, cabinet.position);
assert.equal(manifest.transform.rotation[1], cabinet.rotationY);

assert.match(
  commandBarWrapperSource,
  /<EditorCommandBar[\s\S]*?\{\.\.\.state\.commandBar\}[\s\S]*?\{\.\.\.actions\.commandBar\}/,
  "The command wrapper should preserve the millwork state and action contract."
);
assert.match(
  commandBarSource,
  /id: "furnish"[\s\S]*?active: millworkActive \|\| editorMode === "adjust" \|\| editorMode === "ai"/,
  "The Furnish step should stay current while the Built-ins studio is open."
);
assert.doesNotMatch(
  commandBarSource,
  /editor-command-workspace"|editor-workflow-millwork/,
  "Built-ins opens from the Furnish step, not from a Workspace menu in the command bar."
);
assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?millworkActive:\s*cabinetry\.state\.studio !== null/,
  "The presentation workspace should tell the command bar while the Built-ins studio is open."
);
assert.match(
  panelWorkspaceRegistrationSource,
  /canUseCabinetryStudio:\s*cabinetry\.state\.canUseStudio[\s\S]*?openBuiltIns:\s*cabinetry\.actions\.openCreateStudio/,
  "The panel workspace should inject the Built-ins capability and opening."
);
assert.match(
  panelRegistrationSource,
  /onOpenBuiltIns: configuration\.canUseCabinetryStudio[\s\S]*?\? actions\.navigation\.openBuiltIns[\s\S]*?: undefined/,
  "The Furnish step should only offer Built-ins when the studio is available."
);
assert.match(
  furnishStepModesSource,
  /data-testid="editor-workflow-millwork"[\s\S]*?data-testid="open-custom-millwork-studio"[\s\S]*?data-testid="open-cabinetry-studio">Built-ins/,
  "The Furnish step's Built-ins button should keep the legacy Studio test ids."
);
assert.match(
  cabinetryFeatureFlagSource,
  /CABINETRY_STUDIO_FEATURE_ENABLED = flagFromPublicEnv\([\s\S]*?NEXT_PUBLIC_FEATURE_CUSTOM_MILLWORK_STUDIO[\s\S]*?NEXT_PUBLIC_FEATURE_CABINETRY_STUDIO[\s\S]*?publicAppEnv !== "production"/,
  "The Studio must remain behind its canonical public feature flag and fail closed by default in production."
);
assert.match(
  cabinetryControllerSource,
  /const canUseStudio = CABINETRY_STUDIO_FEATURE_ENABLED && !isClientPreview/,
  "A disabled Studio flag or client preview must remove the Built-ins action."
);
assert.doesNotMatch(
  workspaceSource,
  /<EditorCommandBar\b/,
  "The workspace should not bypass the command wrapper for millwork composition."
);

console.log("Design-page cabinetry controller checks passed");
