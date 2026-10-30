import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { ParametricCabinetDesignItem } from "../features/cabinetry/designItemAdapters";
import { createCabinetPreset } from "../features/cabinetry/presets";
import { fitCabinetToSpace, getCabinetFitPlacement } from "../features/cabinetry/fitToSpace";
import { buildCabinetryAvailableSpaces } from "../features/cabinetry/roomCabinetHosts";
import { clampBuiltInToRoom } from "../lib/room-built-in-faces";
import type { CabinetHostSpace } from "../features/cabinetry/types";
import {
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
// Fit to Space fills to the finished face less 10 mm at each end, with the run's back against the face (J, 29 Oct 2026:
// "Face, back flush"). A 4 m wall between 200 mm walls is 3.8 m face to face; it listed 3.6 m (a whole wall off each end).
assert.equal(spaces[0]?.availableWidthMm, 3_800);
assert.equal(spaces.find((space) => space.wallId === "east")?.availableWidthMm, 4_800);
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

const near = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} ≠ ${expected}`);
/** Fit a base run along `space` in `fitRoom`, place it as the Studio does, and measure it against the finished faces. */
function fitRun(fitRoom: ReturnType<typeof createRoom>, space: CabinetHostSpace) {
  const fit = fitCabinetToSpace(createCabinetPreset("base", `run-${space.id}`), space, { mode: "fit_width" });
  assert.equal(fit.ok, true, `${space.label} should fit`);
  const placement = getCabinetFitPlacement(fit.definition, fitRoom.geometry.width, fitRoom.geometry.depth);
  assert(placement, `${space.label} should place`);
  const width = fit.definition.totalWidth / 1000, depth = fit.definition.depth / 1000;
  const [x, z] = clampBuiltInToRoom(fitRoom, placement.position[0], placement.position[2], width, depth, placement.rotationY);
  near(x, placement.position[0], `${space.label}: the clamp keeps a fitted run where Fit put it (x)`);
  near(z, placement.position[2], `${space.label}: the clamp keeps a fitted run where Fit put it (z)`);
  return { x, z, width, depth, rotationY: placement.rotationY, totalWidthMm: fit.definition.totalWidth };
}
const [northRun, eastRun] = [multiRoomSpaces[0], multiRoomSpaces[1]].map((space) => fitRun(room, space));
assert.equal(northRun.totalWidthMm, 3_780, "the run is the face-to-face length less 10 mm at each end");
near(northRun.x - northRun.width / 2, -2 + 0.1 + 0.01, "10 mm from the west wall's face");
near(northRun.x + northRun.width / 2, 2 - 0.1 - 0.01, "10 mm from the east wall's face");
near(northRun.z - northRun.depth / 2, -2.5 + 0.1, "its back on the north wall's face");
assert.equal(northRun.rotationY, 0);
near(eastRun.x + eastRun.depth / 2, 2 - 0.1, "an east run's back on the east wall's face");
near(eastRun.z, 0, "an east run centred between the north and south faces");
// A window's offset is measured from its face's middle: on a rectangle that is the room's centre line.
assert.equal(spaces.find((space) => space.wallId === "north")?.openings[0]?.offsetMm, 0);

// An L-shape's and a drawn shape's walls: each is its edge's finished face, half a wall in from the outline; a fitted run's
// back stands on it. A door is found on the centre line and measured along the face.
const lRoom = { ...createRoom("room-l", "L room", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.7, slabThickness: 0.1 }), planShape: "l_shape" as const };
const lSpaces = buildCabinetryAvailableSpaces({ activeRoom: lRoom, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.deepEqual(lSpaces.map((space) => Math.round(space.availableWidthMm)), [3_880, 1_620, 1_680, 1_260, 2_200, 2_880],
  "the L's faces: it listed 4000, 1740, 1680, 1260, 2320 and 3000 mm and stopped a whole wall plus 10 mm short at each end");
const notchRun = fitRun(lRoom, lSpaces[3]);
near(notchRun.x + notchRun.depth / 2, 2 - 4 * 0.42 - 0.06, "a run on the notch's wall stands on its face");
near(notchRun.z - notchRun.width / 2, 1.5 - 3 * 0.42 - 0.06 + 0.01, "from 10 mm past the notch corner's other face");
const drawn = {
  ...createRoom("room-drawn", "Drawn room", "kitchen", { width: 4, depth: 3, wallThickness: 0.12, height: 2.7, slabThickness: 0.1 }),
  planShape: "custom_polygon" as const,
  planPolygon: [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 0.2 }, { x: 0.4, z: 0.2 }, { x: 0.4, z: 1.5 }, { x: -2, z: 1.5 }],
  surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "wall-0": { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } } } } },
} as ReturnType<typeof createRoom>;
const drawnSpaces = buildCabinetryAvailableSpaces({
  activeRoom: drawn, activePlanRoom: null, planRoomCount: 1,
  planOpenings: [{ id: "east-door", wall: "east", kind: "door", offsetMm: -1_000, widthMm: 800 }],
});
const eastWall = drawnSpaces[1];
assert.equal(Math.round(eastWall.availableWidthMm), 1_700 - 60 - 44 - 60, "the east wall runs from the north wall's panel to the next face");
const segment = eastWall.wallSegment!;
const doorCentreZ = (segment.startZmm + segment.endZmm) / 2 + eastWall.openings[0].offsetMm;
near(doorCentreZ, -1_000, "the door stays where it is drawn, measured along the face");
const drawnRun = fitRun(drawn, eastWall);
assert(drawnRun.z - drawnRun.width / 2 >= -1 + 0.4 - 1e-6 || drawnRun.z + drawnRun.width / 2 <= -1 - 0.4 + 1e-6, "the run keeps clear of the door");

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
